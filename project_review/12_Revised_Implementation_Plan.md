# Revised Implementation Plan

## Executive Summary

This plan incorporates all findings from the original review (documents 01-10) plus newly discovered issues documented in `11_Review_Evaluation_and_Addendum.md`. Changes are grouped by risk and urgency, with specific file locations and verification steps.

---

## Phase 0: Critical Security Hotfixes (Deploy Immediately)

These fixes should be deployed within **24 hours**. They are small, low-risk changes that close the most exploitable vulnerabilities.

### 0.1 Disable Dev Routes in Production

**Risk**: GAME-BREAKING (infinite resources exploit active)  
**Effort**: 5 minutes

**Files to Modify**:
- `server/src/routes/dev.ts`

**Change**:
```typescript
// At the top of the file, before route definitions
if (process.env.NODE_ENV === 'production') {
  console.warn('⚠️ Dev routes are disabled in production');
  const router = Router();
  router.all('*', (req, res) => res.status(404).json({ error: 'Not found' }));
  export default router;
}
```

**Alternative (Recommended)**: Remove the import of dev routes entirely in production builds, or use an `ENABLE_DEV_ROUTES=true` environment variable check.

**Verification**:
1. Set `NODE_ENV=production`
2. Attempt `POST /dev/add-resources` with valid auth token
3. Expect: 404 Not Found

---

### 0.2 Sanitize Espionage Data Leak

**Risk**: CRITICAL (password hash exposure)  
**Effort**: 10 minutes

**Files to Modify**:
- `server/src/services/espionageService.ts`

**Change at line 138-141**:
```typescript
// BEFORE
const probe = await prisma.reconProbe.findUnique({
    where: { id: probeId },
    include: { owner: true }
});

// AFTER
const probe = await prisma.reconProbe.findUnique({
    where: { id: probeId },
    include: { owner: { select: { id: true, username: true } } }
});
```

**Verification**:
1. Launch a probe
2. Call `GET /espionage/probes/:id`
3. Inspect response JSON
4. Confirm: No `passwordHash` or `email` fields present

---

### 0.3 Add CHECK Constraints to Database

**Risk**: HIGH (negative resources enable exploitation)  
**Effort**: 30 minutes (migration + deploy)

**Files to Create**:
- `server/prisma/migrations/YYYYMMDD_add_resource_constraints/migration.sql`

**SQL to Add**:
```sql
ALTER TABLE planets ADD CONSTRAINT carbon_non_negative CHECK (carbon >= 0);
ALTER TABLE planets ADD CONSTRAINT titanium_non_negative CHECK (titanium >= 0);
ALTER TABLE planets ADD CONSTRAINT food_non_negative CHECK (food >= 0);
ALTER TABLE planets ADD CONSTRAINT credits_non_negative CHECK (credits >= 0);
```

**Verification**:
1. Attempt to update a planet with negative carbon directly via SQL
2. Expect: Constraint violation error

---

## Phase 1: Security & Data Integrity (Week 1)

### 1.1 Fix World API Data Leak

**Files to Modify**:
- `server/src/routes/world.ts`

**Change at lines 98-103**:
```typescript
// Move defense object inside the isOwner block
if (isOwner) {
    responseData.defense = {
        canopy: syncedPlanet.energyCanopyLevel,
        minefield: syncedPlanet.orbitalMinefieldLevel,
        hub: syncedPlanet.dockingHubLevel,
    };
    // ... rest of owner-only data
} else {
    // For non-owners, return obfuscated defense data
    responseData.defense = {
        canopy: '???',
        minefield: '???',
        hub: '???',
    };
}
```

**Verification**:
1. Log in as User A
2. Call `GET /world/planet/:id` for User B's planet
3. Confirm: Defense values show `???` not actual levels

---

### 1.2 Atomic Resource Transactions

**Files to Modify**:
- `server/src/routes/actions.ts` - `/expand` endpoint (lines 441-516)
- `server/src/routes/actions.ts` - `/defense-turret` endpoint (lines 519-619)
- `server/src/services/timerWorker.ts` - Loot deduction (lines 115-144)

**Pattern to Apply**:
```typescript
await prisma.$transaction(async (tx) => {
  const planet = await tx.planet.findUnique({ where: { id: planetId } });
  if (planet.carbon < costCarbon) throw new Error('Insufficient resources');
  
  await tx.planet.update({
    where: { id: planetId },
    data: { carbon: { decrement: costCarbon } }
  });
});
```

**Verification**:
Create a script `scripts/verifyConcurrency.ts`:
1. Send 10 parallel `/expand` requests when player has resources for only 1
2. Assert: Exactly 1 succeeds, 9 fail with "Insufficient resources"
3. Assert: Planet grid expanded exactly once

---

### 1.3 Add Rate Limiting

**Files to Modify**:
- `server/package.json` (add dependency)
- `server/src/index.ts`

**Implementation**:
```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, please slow down' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  message: { error: 'Too many login attempts' }
});

app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use(limiter);
```

**Verification**:
1. Send 6 login requests in rapid succession
2. 6th request should return 429 Too Many Requests

---

## Phase 2: Input Validation & Type Safety (Week 2)

### 2.1 Install and Configure Zod

**Files to Create**:
- `server/src/schemas/fleetSchema.ts`
- `server/src/schemas/buildSchema.ts`
- `server/src/schemas/recruitSchema.ts`
- `server/src/middleware/validateRequest.ts`

**Example Schema**:
```typescript
// server/src/schemas/fleetSchema.ts
import { z } from 'zod';

export const FleetDispatchSchema = z.object({
  fromPlanetId: z.string().uuid(),
  toPlanetId: z.string().uuid(),
  type: z.enum(['attack', 'support', 'scout']),
  units: z.record(z.string(), z.number().int().positive()),
  laneAssignments: z.object({
    front: z.array(z.object({
      units: z.record(z.string(), z.number().int().nonnegative()),
      tools: z.record(z.string(), z.number().int().nonnegative()).optional()
    })).optional(),
    left: z.array(z.any()).optional(),
    right: z.array(z.any()).optional()
  }).optional(),
  admiralId: z.string().uuid().optional()
});
```

**Validation Middleware**:
```typescript
// server/src/middleware/validateRequest.ts
import { ZodSchema } from 'zod';

export function validateRequest(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: result.error.flatten() 
      });
    }
    req.body = result.data; // Use validated/typed data
    next();
  };
}
```

**Verification**:
1. Send `POST /actions/fleet` with `units: { marine: "100" }` (string instead of number)
2. Expect: 400 Bad Request with validation error

---

### 2.2 Admiral Gear Transaction Fix

**Files to Modify**:
- `server/src/services/admiralService.ts`

**Change `equipGearPiece` function (lines 156-196)**:
```typescript
export async function equipGearPiece(userId: string, pieceId: string, slotType: GearSlot) {
  return await prisma.$transaction(async (tx) => {
    const admiral = await tx.admiral.findUnique({ where: { userId } });
    if (!admiral) throw new Error('Admiral not found');

    const piece = await tx.gearPiece.findFirst({
      where: { id: pieceId, userId, slotType }
    });
    if (!piece) throw new Error('Gear piece not found or does not match slot type');

    const currentGear: AdmiralGear = JSON.parse(admiral.gearJson || '{}');
    currentGear[slotType] = { /* piece data */ };

    const gearJson = JSON.stringify(currentGear);
    const bonuses = calculateAdmiralBonuses(gearJson);

    return await tx.admiral.update({
      where: { id: admiral.id },
      data: { gearJson, ...bonuses }
    });
  });
}
```

**Verification**:
1. Send 2 parallel equip requests for different slots
2. Confirm both pieces are equipped (not one overwriting the other)

---

## Phase 3: Scalability (Week 3-4)

### 3.1 Add Database Indexes

**Files to Modify**:
- `server/prisma/schema.prisma`

**Add to Fleet model (after line 264)**:
```prisma
model Fleet {
  // ... existing fields ...

  @@index([status, arriveAt])  // Timer worker polling
  @@index([ownerId, status])    // "My fleets" queries
  @@index([toPlanetId, status]) // Incoming attacks
  @@map("fleets")
}
```

**Add to Planet model (after line 113)**:
```prisma
@@index([ownerId])  // "My planets" queries
```

**Deployment**:
```bash
npx prisma migrate dev --name add_performance_indexes
```

**Verification**:
```sql
EXPLAIN ANALYZE SELECT * FROM fleets WHERE status IN ('enroute', 'returning') AND arrive_at <= NOW();
-- Confirm: Uses Index Scan, not Seq Scan
```

---

### 3.2 Job Queue Infrastructure (Future)

This is a larger architectural change. The current timer worker is functional for MVP scale. Defer BullMQ implementation until:
- Fleet volume exceeds 100 arrivals/minute consistently
- Combat resolution causes noticeable latency (>200ms request times)

See `06_Phase2_Scalability_Plan.md` for detailed implementation when ready.

---

## Phase 4: Gameplay Refinements (Week 4+)

### 4.1 PVE Respawn Cooldown

**Files to Modify**:
- `server/prisma/schema.prisma` - Add `respawnAt: DateTime?` to Planet model
- `server/src/services/pveService.ts` - Modify `relocateNpc()`

**Change**:
```typescript
export async function relocateNpc(planetId: string) {
  const cooldownHours = 4;
  const respawnAt = new Date(Date.now() + cooldownHours * 60 * 60 * 1000);
  
  // Instead of immediately moving, mark as "defeated" and schedule respawn
  await prisma.planet.update({
    where: { id: planetId },
    data: {
      attackCount: 0,
      respawnAt: respawnAt,
      // Optionally hide from map: isActive: false
    }
  });
}
```

**Verification**:
1. Defeat an NPC base
2. Confirm it disappears from map
3. Fast-forward server time by 4 hours
4. Confirm NPC reappears at new location

---

### 4.2 Battle Report Fog of War (Optional Enhancement)

See `05_Phase2_Security_DeepDive.md` section 3 for implementation details.

---

## Verification Matrix

| Phase | Test Type | Command/Steps | Success Criteria |
|:---|:---|:---|:---|
| 0.1 | Manual | `curl -X POST .../dev/add-resources` | Returns 404 in production |
| 0.2 | Manual | Inspect network response for probe data | No passwordHash field |
| 0.3 | SQL | `UPDATE planets SET carbon=-1 WHERE id='...'` | Constraint violation |
| 1.1 | API | Get non-owned planet | Defense shows `???` |
| 1.2 | Script | `npx ts-node scripts/verifyConcurrency.ts` | Exactly 1 success of 10 parallel |
| 1.3 | API | 6 rapid login attempts | 6th returns 429 |
| 2.1 | API | Send invalid fleet body | 400 with Zod errors |
| 2.2 | Script | 2 parallel gear equips | Both slots populated |
| 3.1 | SQL | `EXPLAIN ANALYZE` on fleet query | Uses index scan |
| 4.1 | Manual | Defeat NPC, check map | NPC gone for 4 hours |

---

## Recommended Development Order

```
Day 1:   Phase 0 (All items) — Critical security
Day 2-3: Phase 1.1, 1.2 — Data integrity
Day 4:   Phase 1.3 — Rate limiting
Week 2:  Phase 2 — Type safety
Week 3:  Phase 3.1 — Database indexes
Week 4+: Phase 4 — Gameplay polish
```

---

## Notes for Next Developer

1. **Test Scripts**: The `server/src/scripts/` directory contains valuable verification scripts. Consider converting to Vitest for formal CI/CD integration.

2. **Client Cleanup**: After fixing dev routes, remove `devAddResources()` and `devFastForward()` from `client/src/lib/api.ts` to prevent confusion.

3. **Database Backups**: Before running Phase 0.3 migration, take a full database backup. CHECK constraints can fail if negative values already exist.

4. **Monitoring**: Once rate limiting is in place, monitor logs for 429 patterns to tune limits appropriately.

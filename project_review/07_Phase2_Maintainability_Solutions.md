# Maintainability Solutions: JSON Columns & Hardcoded Logic

## 1. Dealing with JSON Columns (The "Schema-less" Problem)

### The Problem
Prisma `Json` types are `any` in TypeScript. This leads to "Blind Writes" (saving bad data) and "Blind Reads" (runtime crashes).

### The Solution: Zod-typed Accessors (DAO Pattern)
Instead of accessing `prisma.fleet.create` directly with raw JSON, we wrapper functions that force Zod validation.

**1. Define Schemas (`server/src/schemas/gameData.ts`)**
```typescript
import { z } from 'zod';

export const UnitCountsSchema = z.record(z.string(), z.number().int().nonnegative());
export type UnitCounts = z.infer<typeof UnitCountsSchema>;

export const LaneAssignmentSchema = z.object({
    front: z.object({ 
        units: UnitCountsSchema, 
        tools: z.record(z.string(), z.number()).optional() 
    }).optional(),
    // ... left, right
});
```

**2. Create Typed Helpers**
```typescript
// server/src/dao/fleetDao.ts
export async function createTypedFleet(data: {
    units: UnitCounts, // <--- Enforced Types!
    laneAssignments: z.infer<typeof LaneAssignmentSchema>,
    //...
}) {
    // Validate Runtime Data before DB Write
    const safeUnits = UnitCountsSchema.parse(data.units);
    
    return prisma.fleet.create({
        data: {
            //...
            unitsJson: JSON.stringify(safeUnits), // Safe serialization
            //...
        }
    });
}
```

**Recommendation**: Adopt this pattern incrementally. Start with `Fleet` (the most complex model) and `BattleReport`.

## 2. Solving Hardcoded Logic (The "Magic Number" Problem)

### The Problem
Game constants (`TRIANGLE_BONUS = 0.10`) are buried in `mechanics.ts` or service files. Changing balance requires a code deploy.

### The Solution: "GameConfig" in Database + Cache
Move these constants to a `GameConfig` table. This allows Admin Dashboard updates (requested by customer) without redeploying.

**1. Schema Change**
```prisma
model GameConfig {
    key   String @id
    value String // Stores JSON or primitive
    category String // "combat", "economy", "maintenance"
}
```

**2. Cached Configuration Service (`server/src/services/configService.ts`)**
Fetch all configs at startup and cache them in memory (or Redis). Refresh every X minutes or via webhook.

```typescript
// Usage in code
import { config } from './configService';

function calculateDamage(...) {
    const bonus = config.get('combat.triangle_bonus', 0.10); // Returns DB value or default
    // ...
}
```

### Benefits
- **Live Tuning**: Admins can tweak "Desertion Rate" or "Combat Bonus" on the fly to fix imbalances instantly.
- **A/B Testing**: Potential to serve different configs to different worlds.

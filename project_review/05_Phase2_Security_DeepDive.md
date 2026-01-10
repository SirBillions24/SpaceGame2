# Phase 2 Security Analysis: Data Leaks & Exploits

## 1. Critical Data Leak: User Credentials in Espionage
**Severity**: **CRITICAL**
**Location**: `server/src/services/espionageService.ts` -> `getProbeData` and `server/src/routes/espionage.ts` -> `GET /probes/:id`

### The Vulnerability
When a client requests details for a specific probe (`GET /probes/:id`), the server executes:
```typescript
const probe = await prisma.reconProbe.findUnique({
    where: { id: probeId },
    include: { owner: true } // <--- INCLUDES FULL USER OBJECT
});
// ... 
return { probe, ... };
```
The `owner` relation is the `User` model, which includes the `passwordHash`, `email`, and other private fields. This object is serialized to JSON and sent to the client.

### Exploitation
Any logged-in user can inspect the network response for their own probes (or potentially others if IDOR protection fails, though `ownerId` check exists) and realize the server is sending the full `User` object. While they only see *their own* hash here (because `getProbeData` enforces ownership), this pattern sets a dangerous precedent. If any administration or "shared report" endpoint reuses this function, it would leak other users' hashes.

**Recommendation**:
Modify `include` to use `select` or sanitized DTO mapping.
```typescript
include: { 
    owner: { 
        select: { username: true, id: true } 
    } 
}
```

## 2. Input Type Confusion & Exploits
**Severity**: **HIGH**
**Location**: `server/src/routes/actions.ts` (Fleet and Recruitment)

### The Vulnerability
The API relies on assumed types without validation. A malicious user can send non-standard JSON payloads (e.g., strings instead of numbers) to bypass logic or cause unintended behaviors.

**Example Vector**: `laneAssignments` in Fleet Dispatch.
The logic sums tool counts: `allTools[t] = (allTools[t] || 0) + c;`
If an attacker sends `tools: { "breach_pod": "100" }` (string "100"), Javascript will perform string concatenation instead of addition.
- `allTools["breach_pod"]` becomes `"0100"` (or similar).
- This might bypass available checks (string comparison vs number comparison) or cause database insertion errors that might crash the worker if not handled gracefully.

**Recommendation**:
Implement **Zod** schema validation for all incoming request bodies to enforce strict typing (Numbers, not Strings) before any logic runs.

## 3. Excessive Information in Battle Reports (Fog of War)
**Severity**: **MEDIUM**
**Location**: `battleReport` in `combatService.ts`

The current Battle Report provides a full breakdown of the defender's units in the lane that was fought (`defenderUnits` in `SectorResult`).
- **Risk**: A player can send 1 single "suicide scout" unit to each lane. Even if they lose instantly, the `resolveSector` logic records the `defenderSnapshot` (the full force in that lane) and saves it to the Battle Report.
- **Impact**: This essentially makes the "Espionage/Probe" mechanic redundant for military intel, as a cheap suicide fleet reveals perfect information.

**Recommendation**:
Implement "Fog of War" logic in the report generation.
- If the attacker loses the sector, they should only see `???` or a rough estimate of the surviving defenders, not the exact count and composition.
- Only if the attacker *wins* the sector (or has high "Intel" stats) should they see the full breakdown.

## 4. "Cheat" Request Protection
The customer is worried about "custom requests" giving resources.
- **Current Protections**: The server *does* validate ownership (`validatePlanetOwnership`) and costs (`fromPlanet.carbon < cost`).
- **Gap**: The logic assumes atomic checks but doesn't lock DB rows (The "Double Spend" race condition identified in Phase 1).
- **Fix**: The only way to truly prevent "cheating via race condition" is wrapping the Check-and-Deduct logic in a `prisma.$transaction`.

## Implementation Plan for Security Fixes
1.  **Immediate**: Patch `getProbeData` to select only `username`.
2.  **Short-term**: Add Zod middleware for `actions.ts`.
3.  **Strategic**: Refactor `resolveCombat` to filter report data based on "Fog of War" rules before saving/sending to client.

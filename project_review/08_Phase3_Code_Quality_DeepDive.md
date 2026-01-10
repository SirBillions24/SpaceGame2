# Phase 3 Code Quality Deep Dive: Critical Exploits & Race Conditions

## 1. CRITICAL: "Dev Tools" Left Open to Public
**Severity**: **GAME-BREAKING**
**Location**: `server/src/routes/dev.ts` and `client/src/lib/api.ts`

### The Vulnerability
The `dev.ts` routes (`/add-resources`, `/fast-forward`) are protected by `authenticateToken`, but they **only check if the user owns the planet**. There is **no Admin/Developer role check**.
Since the client codebase (`api.ts`) includes these functions, any player can inspect the source, find the endpoint, and send a `POST /dev/add-resources` request to give themselves infinite resources and instant construction.

**Exploit Scenario**:
1.  Player A logs in and gets their token.
2.  Player A sends `POST /dev/add-resources` with `{ planetId: "my-id", amount: 1000000 }`.
3.  Server checks `if (planet.ownerId === userId)` -> Returns True.
4.  Server grants 1,000,000 resources.

**Recommendation**:
1.  **Immediate**: Delete `server/src/routes/dev.ts` entirely from production builds.
2.  **Robust**: Implement a `role` field on the `User` table (`USER` vs `ADMIN`) and require `ADMIN` role for these routes.

## 2. Admiral Gear Race Condition (Data Loss)
**Severity**: **HIGH**
**Location**: `server/src/services/admiralService.ts` -> `equipGearPiece`

### The Vulnerability
The logic follows a "Read-Modify-Write" pattern without locking or version checks:
1.  `currentGear = JSON.parse(admiral.gearJson)`
2.  `currentGear[slot] = newPiece`
3.  `prisma.admiral.update(..., gearJson: JSON.stringify(currentGear))`

If a user sends two equip requests simultaneously (e.g., Equip Weapon and Equip Helmet):
-   Request A reads `{}`.
-   Request B reads `{}`.
-   Request A writes `{ weapon: ... }`.
-   Request B writes `{ helmet: ... }` (Overwriting A).
**Result**: The weapon is unequipped/lost from the admiral (though the item remains in the DB, it's detached from the admiral).

**Recommendation**:
Use a `prisma.$transaction` with a lock, or use `pessimistic` locking if possible. Alternatively, optimistic concurrency control (check `updatedAt` hasn't changed).

## 3. World Intel Leaks
**Severity**: **MEDIUM**
**Location**: `server/src/routes/world.ts` -> `/planet/:id`

### The Vulnerability
The API returns full `buildings` and `defense` objects to **any logged-in user**.
-   **Defense Levels**: `energyCanopyLevel`, `orbitalMinefieldLevel` are visible. This allows attackers to calculate exact combat outcomes without spending resources on Espionage probes.
-   **Building Levels**: Users can see the exact level and stats of every building on a target planet. This allows them to calculate the exact resource production of a rival.

**Recommendation**:
Sanitize the `buildings` and `defense` arrays for non-owners. Only return visual data (e.g., `type`, `x`, `y`) but hide `level` and `stats` unless a "Spy Report" exists.

## 4. PVE Infinite Farming
**Severity**: **MEDIUM (Economy Risk)**
**Location**: `server/src/services/pveService.ts`

### The Vulnerability
When an NPC Pirate Base is "defeated" (hits `maxAttacks`), it `relocateNpc()`s. This function:
1.  Moves the planet.
2.  **Fully Heals** the planet (`attackCount = 0`).
3.  **Resets Resources** (potentially regenerating them).

A strong player can farm the same NPC indefinitely. Since loot scales linearly with level ($500 \times Level / 10$) and there's no "cooldown" or "diminishing returns", this fosters a botting meta.

**Recommendation**:
-   Add a `respawnCooldown` (e.g., the base disappears for 4 hours after defeat).
-   Or, implement "Diminishing Loot" if the same player attacks the same NPC UUID repeatedly.

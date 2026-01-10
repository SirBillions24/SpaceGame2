# Comprehensive Game Mechanics Feature Tree

This document serves as the master reference for all implemented game mechanics, their technical implementation details, and identified areas for improvement.

## 1. Combat System
**Core Concept**: A deterministic, 3-lane "Wave" system heavily inspired by Goodgame Empire.

### 1.1. 3-Lane Architecture
-   **Structure**: Combat is divided into **Left**, **Center**, and **Right** lanes, plus a final **Courtyard** battle.
-   **Implementation**: `resolveCombat` in `combatService.ts`.
-   **Flow**:
    1.  **Travel**: Fleet arrives at target.
    2.  **Lane Resolution**: `resolveSector` runs for Left, Center, Right independently.
    3.  **Breach Check**: If Attacker wins a lane, they "breach" and surviving units move to the Courtyard with a **30% Damage Bonus** (`BREACH_BONUS`).
    4.  **Courtyard**: All surviving attackers vs. all reserve defenders.
    5.  **Loot**: If Attacker wins Courtyard, they steal resources up to Fleet Capacity.
-   **Improvement**: Visualizing the "Breach" mechanics more clearly in the Battle Report.

### 1.2. The Triangle System (Rock-Paper-Scissors)
-   **Rules**:
    -   Melee beats Robotic.
    -   Robotic beats Ranged.
    -   Ranged beats Melee.
-   **Bonus**: `TRIANGLE_BONUS` (Currently 10%, recommended 25-50%).
-   **Implementation**: Hardcoded in `resolveSector`.
-   **Improvement**: Move bonus constants to `GameConfig` table (See Phase 2 Report).

### 1.3. Admiral & Gear
-   **Concept**: Hero unit that provides global percentage buffs to the fleet/planet.
-   **Stats**:
    -   `Melee Strength`: +% Damage for Melee units.
    -   `Ranged Strength`: +% Damage for Ranged units.
    -   `Canopy Reduction`: Negates defender's "Energy Canopy" bonus.
-   **Gear Slots**: Weapon, Helmet, Spacesuit, Shield.
-   **Improvement**: Fix the "Equip" race condition (Phase 3 Report). Add "Set Bonuses" logic.

### 1.4. Defense Facilities
-   **Energy Canopy**: Reduces Attacker Ranged Strength.
-   **Orbital Minefield**: Reduces Attacker Melee Strength.
-   **Docking Hub**: Increases Defender Unit count in the Courtyard (Reserve).
-   **Turrets**: A "Hard Cap" on the number of units that can be stationed on the wall.
    -   *Critique*: Currently implemented as a cap on assignment. `resolveCombat` re-verifies unit counts but misses *Tool* verification (Ghost Tool Exploit).

## 2. Economy & City Building
**Core Concept**: Lazy Evaluation (O(1) checks) preventing server lag.

### 2.1. Resource Production
-   **Resources**: Carbon, Titanium, Food, Credits.
-   **Logic**: `syncPlanetResources` calculates `deltaTime = now - lastUpdate`.
    -   `NewResources = Current + (Rate * deltaTime)`.
    -   `Output = Base * BuildingLevel * StabilityMultiplier`.
-   **Stability (Public Order)**:
    -   Formula: `Productivity = sqrt(PublicOrder)`.
    -   Negative Public Order penalizes production heavily.

### 2.2. Construction Queue
-   **System**: Single-threaded builder (one building at a time).
-   **Implementation**: `activeBuildId` and `buildFinishTime` on `Planet` model.
-   **Lazy Check**: If `now > buildFinishTime` during `syncPlanetResources`, the building is upgraded and the queue cleared.
-   **Dev Exploit**: `dev.ts` allows instant finishing.

### 2.3. Food & Desertion
-   **Mechanic**: Units consume Food. If `Food < 0`, troops desert.
-   **Logic**:
    -   Desertion is calculated lazily.
    -   *Flaw*: Logic determines "Ratio of time starved" and kills that % of troops instantly on login.
-   **Improvement**: Change to a "Tick-based" decay or cap max desertion per session to prevent 100% wipes from minor lapses.

## 3. World & Travel
**Core Concept**: 2D Grid (0,0 to 1000,1000).

### 3.1. Fleet Movement
-   **Speed**: Constant `50 px/sec`.
-   **Logic**: `timerWorker` polls DB for `arriveAt <= now`.
-   **Scalability**: Needs Indexing `[status, arriveAt]` (Phase 2 Report).

### 3.2. Espionage
-   **Probes**: Travel like fleets but faster.
-   **Fuzzing**: Report accuracy depends on `ProbeLevel` vs `CounterIntel`.
    -   Low accuracy returns ranges (e.g., "10-50 Marines") instead of exact numbers.
-   **Security**: Ensure `User` object (passwords) are sanitised from response (Phase 3 Report).

## 4. PVE (Player vs Environment)
**Core Concept**: Procedural Pirate Bases.

### 4.1. Spawning
-   **Trigger**: `regionSelector` or random events.
-   **Leveled**: Bases spawn at Lvl 10, 20, 30.
-   **Classes**: Melee (Carbon loot), Robotic (Titanium loot), Ranged (Food loot).

### 4.2. Relocation Loop
-   **Mechanic**: When a base is defeated (Hits > MaxHits), it moves to a new coordinate.
-   **Exploit**: It respawns instantly with full loot/health. Infinite farming possible.

## 5. Technical Infrastructure

### 5.1. Authentication
-   **Type**: JWT (Stateless).
-   **Middleware**: `authenticateToken`.
-   **Gap**: No Role-Based Access Control (RBAC). Admin routes are open to all planet owners.

### 5.2. Database (Prisma + Postgres)
-   **Schema**: Relational.
-   **Issue**: Heavy use of `JSON` columns (`unitsJson`, `laneAssignments`) prevents SQL-level validation and querying.

### 5.3. Timer Worker
-   **Role**: The "Heartbeat" of the server. Checks for fleet arrivals every 5 seconds.
-   **Risk**: Single point of failure. Locking long-running combat tasks blocks the thread.
-   **Plan**: Move to BullMQ Job Queue.

## Future Roadmap (Recommended)
1.  **Security**: Close Dev Routes & Sanitise Inputs (Zod).
2.  **Stability**: Implement BullMQ for combat processing.
3.  **Balance**: Tune the "Triangle Bonus" to 25% and fix Desertion "Death Spiral".
4.  **Admin**: Build a proper Admin Panel with RBAC to manage the game without direct DB access.

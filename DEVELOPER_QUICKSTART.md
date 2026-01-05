# Developer Quickstart Guide

Welcome to the **Galactic Conquest** codebase! This guide covers key architectural concepts, common pitfalls, and how to effectively work with the system.

## 1. Core Architecture

### Economics & Ticks (Lazy Evaluation)
Unlike typical RTS games with a global server loop updating every player every second, we use **Lazy Evaluation**.
- **Resources**: Carbon, Titanium, and Food are calculated *on-demand*.
- **Function**: `syncPlanetResources(planetId)` in `planetService.ts`.
- **Trigger**: When a player loads the game, or any API action (build, recruit, attack) occurs, we calculate:
  `NewResources = OldResources + (Rate * TimeDelta)`
- **Implication**: You almost never update resources directly. You update the *lastResourceUpdate* timestamp.

### Combat Engine (3-Lane System)
The combat logic resides in `server/src/services/combatService.ts`.
- **Structure**: Battles happen in 3 Lanes (Left, Front, Right) + 1 Courtyard.
- **Tools**: Both Attackers and Defenders use Tools (Walls, Ladders, etc.).
  - **Tool Consumption**: Defenders lose tools based on the number of attacks against that slot. This is handled *after* combat resolution.
- **Simultaneous Resolution**: All lanes resolve. Survivors move to Courtyard.

### Building & Construction
- **Grid System**: 10x10 grid. `BUILDING_SIZES` in `mechanics.ts` defines footprint.
- **Move Mode**: Implemented via `moveBuilding` endpoint. Collision logic must check "active" buildings but exclude the one currently being moved.
- **Timers**: Construction is tracked by `buildFinishTime`. The client polls; the server lazily updates state on next fetch.

### Industrial Systems (Manufacturing)
- **Queues**: Workshops (Munitions/Defense) share a `manufacturingQueue` JSON blob on the Planet model.
- **Lazy Processing**: Similar to resources, tool production is finalized (`toolService.ts`) when the queue is processed during a planet sync or worker tick.
- **Inventory**: Tools are stored in `ToolInventory` table.

### Player Progression
- **XP Curve**: $100 * Level^2$. Logic in `progressionService.ts`.
- **Leveling**: Occurs automatically when XP crosses the threshold. Triggers updates to global HUD.

### PVE (Pirate Bases)
- **Spawning**: `pveService.ts` handles spawning NPC planets around a user.
- **Defense**: NPC bases generate a static `DefenseLayout` based on their level.
- **Loot**: Standard looting rules apply to NPC bases.

## 2. Key Files & Directories

- **`server/src/constants/mechanics.ts`**: The "Source of Truth" for game balance.
  - Unit Stats (Damage, Defense, Upkeep).
  - Building Costs & Times.
  - Stability Formulas.
- **`server/src/services/planetService.ts`**: The heavy lifter for Colony logic.
- **`client/src/components/GlobalHUD.tsx`**: The main UI header. Handles Rich Tooltips.
- **`client/src/components/PlanetInterior.tsx`**: The main interactive grid.

## 3. UI/UX Standards

- **Rich Tooltips**: We use custom "Dropdown" divs (e.g., `.resource-dropdown`) inside parent containers (relative positioning) to show detailed stats.
- **Styling**:
  - **Glassmorphism**: Dark, semi-transparent backgrounds.
  - **Colors**:
    - Food: Green (`#81c784`)
    - Carbon: Brown (`#5d4037`)
    - Titanium: Silver/Blue (`#90a4ae`)
    - Stability: Dynamic (Red/Green).

## 4. Common "Gotchas"

1.  **"Construction Slot Occupied"**:
    - If a test or script forces a building finish, ensure you clear `isBuilding: false` and `activeBuildId: null`.
2.  **Resource Desync**:
    - If direct DB edits are made to resources, the next `syncPlanetResources` might overwrite them based on the old timestamp. Always update `lastResourceUpdate` to `NOW()` when manually fixing DB data.
3.  **Stability Calculation**:
    - Stability is `Base + Decor - DwellingPenalty - TaxPenalty`.
    - Productivity is a *multiplier* derived from Stability (SQRT function). Don't edit productivity directly; edit the factors affecting Stability.

## 5. Setup & Commands

- **Start Server**: `cd server && npm run dev`
- **Start Client**: `cd client && npm run dev`
- **Verify Logic**: `cd server && npx ts-node src/scripts/verifyEconomy.ts` (Runs the economy test suite).

## 6. Onboarding Checklist (Homework)

If you are new to the project, follow this path to get up to speed:

1.  **Concept & Vision**:
    -   Read `game_vision.md` (High level goals).
    -   Read `Mechanics Documetation/Public_Order.md` (Understanding the core loop).

2.  **Data Foundation**:
    -   Read `server/prisma/schema.prisma`. Understand the relation between `User`, `Planet`, `Fleet`, and `DefenseLayout`.

3.  **Code-Dive (Backend)**:
    -   Study `server/src/constants/mechanics.ts`.
    -   Trace the `syncPlanetResources` function in `planetService.ts`. This is the lifeblood of the game.
    -   Trace `resolveCombat` in `combatService.ts`.

4.  **Code-Dive (Frontend)**:
    -   Look at `GlobalHUD.tsx` to see how we consume and display real-time data.
    -   Look at `PlanetInterior.tsx` to see how we handle grid interactions (Canvas/Div hybrid).

5.  **First Task**:
    -   Try creating a new "Decoration" building in `mechanics.ts`, add it to `BUILDING_LABELS`, and verify it affects Stability in-game.

Happy Coding!

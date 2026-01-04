# Galactic Conquest - Project Overview

**Galactic Conquest** is a sci-fi real-time strategy game inspired by the mechanics of *Goodgame Empire*.
It is built on a modern stack using **React (Vite)** for the frontend and **Node.js (Express) + Prisma + PostgreSQL** for the backend.

## Architecture

### Frontend (`/client`)
*   **Framework**: React (Vite)
*   **State**: Local component state + API polling.
*   **Key Components**:
    *   `GlobalHUD.tsx`: Persistent top bar showing resources/troops. Auto-refreshes every 5s.
    *   `PlanetInterior.tsx`: The main base view. Handles Construction, Recruitment, and Defense.
    *   `WorldMap.tsx`: The galaxy view using `pixi.js` for fleet rendering.
*   **Design**: Dark sci-fi theme, "Glassmorphism" UI elements.

### Backend (`/server`)
*   **Framework**: Express.js
*   **Database**: PostgreSQL via Prisma ORM (`schema.prisma`).
*   **Core Systems**:
    *   **Lazy Evaluation**: Resources and timers are calculated on-demand (when a user views a planet or an action occurs) via `syncPlanetResources`. We do NOT use a global server ticker for economy.
    *   **Ticks**: A basic worker exists (`worker.ts`) but core logic is event-driven.
    *   **Auth**: JWT-based authentication.

## Implemented Features

### 1. Economy & Construction
*   **Resources**: Carbon, Titanium, Food.
*   **Production**: Buildings produce resources over time.
    *   *Note*: Buildings continue producing even while upgrading.
*   **Construction**: Grid-based placement. Upgrade timers with instant completion lazy-checks.

### 2. Military & Combat
*   **Recruitment**: Train Marines, Rangers, Sentinels at the Academy.
    *   Queue system allows batch training.
*   **Fleets**: Send units to attack other planets.
    *   Real-time movement on the Galaxy Map using `timerWorker.ts`.
    *   **3-Lane Combat System**:
        *   **Defensive Layout**: Assign troops to Left, Front, Right lanes.
        *   **Resolution (`combatService.ts`)**:
            1.  **Lane Phase**: Lanes fight independently. Winner determined by Power (Stats + Wall/Grid/Admiral Bonuses).
            2.  **Courtyard Phase**: Surviving attackers from winning lanes flank the courtyard. Surviving defenders retreat to courtyard.
            3.  **Looting**: If attacker wins the planet, they steal resources (Carbon/Titanium/Food) based on fleet capacity (10 per unit).
    *   **Lifecycle**:
        *   `enroute` -> `arrived` (Combat Triggered) -> `returning` (with Loot) -> `completed` (Unload & Disband).
*   **Defense**: Assign stationed troops to **Left**, **Front**, and **Right** flanks.
    *   UI: `DefensePanel` allows drag-and-drop style assignment (sliders).
*   **Battle Reports**:
    *   Generated upon combat completion.
    *   **Mailbox UI**: Players can view list of reports and detailed stats.

### 3. UI/UX
*   **Planet Banner**:
    *   **Dynamic Design**: Glassmorphism style, no static background image.
    *   **Behavior**: Locks to planet position in World Space (consistent with zoom).
    *   **Controls**: "Enter Colony", "Fleet Ops", "Select Source".
*   **Combat Flow**:
    1.  **Select Source**: Click YOUR planet -> Click "Select Source" (Sets the origin for attacks).
    2.  **Select Target**: Click ENEMY planet -> Banner opens.
    3.  **Fleet Ops**: Click "Fleet Ops" to open the Attack Window (`FleetPanel`).
    4.  **Launch**: Assign units to lanes and click "Launch Fleet".
*   **Global HUD**:
    *   **Features**: Displays Level (badge), XP Bar, Resources (Carbon, Titanium, Food), Credits, Rubies.
    *   **Status**: Basic implementation exists (GlobalHUD.tsx), needs backend wiring for real data.
    *   **Stability**: "System Stability" bar (Public Order) is already visualized.
*   **Travel Overview**: Track active fleet movements.

## Roadmap

### Phase 1: Foundation (Completed)
*   [x] Basic Map & Spawning
*   [x] Economy Logic
*   [x] Recruitment & Movement

### Phase 2: Combat Loop (In Progress)
*   [x] Defense Stationing UI
*   [ ] **Combat Calculation**: Update engine to use 3-Lane defensive layouts.
*   [ ] **Battle Reports**: Generate and display detailed reports after combat.
*   [ ] **Looting**: Steal resources upon victory.

### Phase 3: Core Systems Integration (Data & Economy)
*   [ ] **Core Data**: Update Schema for XP, Levels, Credits, Stability, Tools.
*   [ ] **Economy V2**:
    *   **Stability**: Monitor production modifiers.
    *   **Food Upkeep**: 4 Food/hr per Unit.
    *   **Desertion**: Rigid proportional removal of *all* troop types if Food < 0.

### Phase 4: Progression & Command Infrastructure
*   [ ] **Player Leveling**:
    *   Backend tracking of XP/Level.
    *   **HUD**: Real-time display of Level, XP, Credits, Food Delta.
*   [ ] **Command Infrastructure**:
    *   **Naval Academy** (Encampment): Unlocks Admirals & increases Fleet Cap. (Ref: `encampment.md`)
    *   **Intelligence Hub** (Tavern): Unlocks Spies. (Ref: `tavern.md`)
    *   **Holo-Monument** (Decoration): Boosts Stability.

### Phase 5: Industrial Warfare (Tools & Manufacturing)
*   [ ] **Workshops**:
    *   **Systems Workshop** (Defense): Crafts Auto-Turrets, Blast Doors. (Ref: `defense_workshop.md`)
    *   **Munitions Factory** (Siege): Crafts Signal Jammers, Breach Cutters. (Ref: `siege_workshop.md`)
*   [ ] **Manufacturing Queue**: Time-based crafting for tools using Carbon/Titanium.

### Phase 6: Combat V2 & PVE Expansion
*   [ ] **Combat Engine Upgrade**:
    *   Integrate Real Tools (DB-backed) into `combatService`.
    *   Apply Tool Effects (Wall/Gate/Range modifications).
*   [ ] **Raider Bases** (NPCs):
    *   Scaling Levels 1-80 with "Variations".
    *   Loot Tables: Credits, Rubies, Resources.

## Developer Notes
*   **Resources**: Stored in `Planet` model but lazy-updated based on `lastResourceUpdate`.
*   **Recruitment**: NOW handled by **Training Depot** (formerly Barracks).
*   **Defense**: Layout is stored in `DefenseLayout` model as JSON blobs.
*   **Documentation**: Always cross-reference `Mechanics Documetation` for formulas.

# Balance Implementation Guide

This guide provides a centralized reference for game balance constants and scaling logic in Galactic Conquest. Following this structure ensures that balance changes are easy to implement and maintain.

## 1. Centralized Data Structure

All building, unit, and item statistics are stored in `server/src/constants/`.

### Building Data (`buildingData.ts`)
This file is the single source of truth for all building stats. Each building type defines:
- **Size**: Grid footprint (e.g., 2x2, 3x3).
- **Category**: Civil, Military, or Decoration.
- **Levels**: A dictionary of level-specific stats:
    - `requiredPlayerLevel`: Minimum player level to build/upgrade.
    - `cost`: Resources required (Carbon, Titanium, Credits, Dark Matter).
    - `production`: Base resource production per hour (if applicable).
    - `population`: Population provided (for Housing Units).
    - `stability`: Public Order bonus or penalty.
    - `storage`: Resource storage capacity (for Storehouses).
    - `recruitmentSpeedBonus`: Percentage bonus to unit recruitment speed (e.g., 0.05 for 5%).
    - `time`: Construction/upgrade time in seconds.
    - `xp`: Experience points granted upon completion.

**Example Addition:**
To add a new unit, simply add a new entry to the `UNIT_DATA` object in `server/src/constants/unitData.ts`.

### Tool/Item Data (`toolData.ts`)
This file stores the statistics for all consumable items (Offensive and Defensive tools). Each tool defines:
- `id`: Unique identifier (e.g., `sentry_drones`).
- `name`: Display name.
- `description`: Flavor text.
- `cost`: Resources required to manufacture.
- `time`: Manufacturing time.
- `workshop`: Which facility produces it (`defense_workshop` or `siege_workshop`).
- `bonusType`: The mechanic it affects (`canopy`, `hub`, `ranged_def`, `canopy_reduction`, `hub_reduction`, `ranged_reduction`).
- `bonusValue`: The percentage bonus or reduction applied.

**Example Addition:**
To add a new tool, simply add a new entry to the `TOOL_DATA` object in `server/src/constants/toolData.ts`.

---

## 2. Resource Production Logic

Resource production is handled via **Lazy Evaluation** in `server/src/services/planetService.ts`.

### Formulas
The game uses the following formulas:

1.  **System Stability**:
    `Stability = Sum(Decoration Bonuses) - Sum(Housing Penalties) - (Tax Rate * 2)`

2.  **Productivity Modifier**:
    - If Stability ≥ 0: `Productivity = √(Stability) * 2 + 100`
    - If Stability < 0: `Productivity = 100 * (100 / (100 + 2 * √(|Stability|)))`

3.  **Production Rate**:
    `Resource Rate = (Base Production + Sum(Building Production)) * (Productivity / 100)`

### Defensive Layers (Combat Engine)
The combat engine calculates defense based on three primary layers:
- **Energy Canopy** (was Wall): The primary planetary shield. Enhanced by **Energy Canopy Generator** (building) and **Sentry Drones** (tool).
- **Central Docking Hub** (was Gate): The vulnerable main entry point. Enhanced by **Docking Hub** (building) and **Hardened Bulkheads** (tool).
- **Orbital Minefield** (was Moat): The outermost defensive perimeter. Enhanced by **Orbital Minefield** (level).

### Storage Clamping
All resources are clamped to the planet's `maxStorage` (determined by the highest level Automated Storage Depot) during each sync. Food consumption can still take resources below zero if production is insufficient.

---

## 3. Integration Guidelines

When adding new features that require balancing:

1.  **Define the Data**: Add the necessary constants to the appropriate file in `server/src/constants/`.
2.  **Avoid Hardcoding**: Never hardcode costs or production values in services. Always reference `BUILDING_DATA` or `UNIT_STATS`.
3.  **Use Helper Functions**: Utilize `getBuildingStats(type, level)` to safely access data.
4.  **Sync Resources**: Ensure any action that modifies resources (building, recruitment, combat) first calls `syncPlanetResources(planetId)` to ensure the state is up to date.

## 4. Unified Combat Terminology

To maintain consistency, the following sci-fi terminology MUST be used:

| Medieval Concept | Unified Sci-Fi Name | Code Reference |
| :--- | :--- | :--- |
| Wall | **Energy Canopy** | `canopy`, `canopy_generator` |
| Gate | **Central Docking Hub** | `hub`, `dockingHub` |
| Moat | **Orbital Minefield** | `minefield` |
| Ladder | **Invasion Anchor** | `invasion_anchors` |
| Ram | **Plasma Breacher** | `plasma_breachers` |
| Mantlet | **Stealth Field Pod** | `stealth_field_pods` |
| Auto-Turret | **Sentry Drones** | `sentry_drones` |
| Blast Door | **Hardened Bulkheads** | `hardened_bulkheads` |
| Flaming Arrows | **Targeting Uplinks** | `targeting_uplinks` |

---

## 5. Troubleshooting Production Mismatches

If the HUD production rate does not match the actual resource gain:
- Check if `BASE_PRODUCTION` is being applied correctly in both `calculatePlanetRates` and `syncPlanetResources`.
- Verify that `diffHours` (time elapsed) is calculated using `lastResourceUpdate`.
- Ensure that `maxStorage` is correctly updated when a Storehouse is built or upgraded.

---

*This guide is part of the core documentation for Galactic Conquest. Keep it updated as the balancing system evolves.*


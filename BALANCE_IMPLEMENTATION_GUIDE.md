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
    - `time`: Construction/upgrade time in seconds.
    - `xp`: Experience points granted upon completion.

**Example Addition:**
To add a new building, simply add a new entry to the `BUILDING_DATA` object in `server/src/constants/buildingData.ts`.

### Unit Stats (`mechanics.ts`)
General game mechanics and unit upkeep are defined in `server/src/constants/mechanics.ts`.
- `UNIT_STATS`: Defines food upkeep per hour for each unit type.
- `BASE_PRODUCTION`: The inherent resource generation rate for every planet.

---

## 2. Resource Production Logic

Resource production is handled via **Lazy Evaluation** in `server/src/services/planetService.ts`.

### Formulas
The game uses the following formulas derived from Goodgame Empire:

1.  **System Stability (Public Order)**:
    `Stability = Sum(Decoration Bonuses) - Sum(Housing Penalties) - (Tax Rate * 2)`

2.  **Productivity Modifier**:
    - If Stability ≥ 0: `Productivity = √(Stability) * 2 + 100`
    - If Stability < 0: `Productivity = 100 * (100 / (100 + 2 * √(|Stability|)))`

3.  **Production Rate**:
    `Resource Rate = (Base Production + Sum(Building Production)) * (Productivity / 100)`

### Storage Clamping
All resources are clamped to the planet's `maxStorage` (determined by the highest level Storehouse) during each sync. Food consumption can still take resources below zero if production is insufficient.

---

## 3. Integration Guidelines

When adding new features that require balancing:

1.  **Define the Data**: Add the necessary constants to the appropriate file in `server/src/constants/`.
2.  **Avoid Hardcoding**: Never hardcode costs or production values in services. Always reference `BUILDING_DATA` or `UNIT_STATS`.
3.  **Use Helper Functions**: Utilize `getBuildingStats(type, level)` to safely access data.
4.  **Sync Resources**: Ensure any action that modifies resources (building, recruitment, combat) first calls `syncPlanetResources(planetId)` to ensure the state is up to date.

## 4. Troubleshooting Production Mismatches

If the HUD production rate does not match the actual resource gain:
- Check if `BASE_PRODUCTION` is being applied correctly in both `calculatePlanetRates` and `syncPlanetResources`.
- Verify that `diffHours` (time elapsed) is calculated using `lastResourceUpdate`.
- Ensure that `maxStorage` is correctly updated when a Storehouse is built or upgraded.

---

*This guide is part of the core documentation for Galactic Conquest. Keep it updated as the balancing system evolves.*


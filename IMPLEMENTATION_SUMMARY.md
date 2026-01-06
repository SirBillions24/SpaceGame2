# Implementation Summary: Defense Turret System & Planet Expansion

## Overview
This implementation adds two major features to Galactic Conquest:
1. **Defense Turret System**: Increases defensive troop capacity on walls
2. **Planet Expansion System**: Allows incremental expansion of planet grid from 10x10 to 50x50

---

## 1. Defense Turret System

### Schema Changes
- Added `defenseTurretsJson` field to `Planet` model
  - Type: `String?` (nullable JSON)
  - Format: `[{ level: 1 }, { level: 2 }, ...]`
  - Maximum: 20 turrets per planet

### Mechanics
- **Level 1**: 10 troops capacity
- **Level 2**: 20 troops capacity
- **Level 3**: 30 troops capacity
- **Level 4**: 40 troops capacity
- **Total Capacity**: Sum of all turret capacities
- **Capacity applies per lane**: Each lane (Left, Center, Right) can hold up to the total capacity

### Implementation Files
- `server/src/constants/mechanics.ts`: Added `DEFENSE_TURRET_CAPACITY` and `MAX_DEFENSE_TURRETS`
- `server/src/services/defenseService.ts`: New service with helper functions:
  - `calculateDefenseCapacity()`: Calculates total capacity from turret JSON
  - `getDefenseTurrets()`: Parses turret array from JSON
  - `canAddDefenseTurret()`: Validates if new turret can be added
  - `countLaneUnits()`: Counts units in a lane

### API Endpoints
- **POST `/api/actions/defense-turret`**
  - Parameters: `planetId`, `level` (1-4)
  - Cost: Scales with level and number of existing turrets
    - Base: 500 Carbon × level, 250 Titanium × level
    - Multiplier: 1 + (existing turrets × 0.1)
  - Returns: Updated turret list and total capacity

### Validation
- Defense route (`/api/defense/planets/:id/defense-layout`) now validates:
  - Each lane's unit count cannot exceed total defense capacity
  - Returns error if capacity exceeded

---

## 2. Planet Expansion System

### Schema Changes
- Replaced `gridSize` (single Int) with:
  - `gridSizeX`: Int (default 10)
  - `gridSizeY`: Int (default 10)
- Maximum size: 50x50

### Expansion Mechanics
- **Incremental**: Expands by 10 tiles per direction
- **Directions**: Expand X (width) or Y (height) independently
- **Cost Scaling**: 
  - Base: 1000 Carbon, 500 Titanium
  - Multiplier: 1.5 per expansion (50% increase)
  - Formula: `base × (1.5 ^ expansionNumber)`

### Implementation Files
- `server/src/constants/mechanics.ts`: Added expansion constants
- `server/src/services/planetService.ts`: Updated to use `gridSizeX`/`gridSizeY`
  - `placeBuilding()`: Validates against new grid dimensions
  - `moveBuilding()`: Validates against new grid dimensions
  - `spawnPlanet()`: Sets initial 10x10 grid

### API Endpoints
- **POST `/api/actions/expand`**
  - Parameters: `planetId`, `direction` ('x' or 'y')
  - Validates: Current size < 50, sufficient resources
  - Updates: Increments grid size by 10 in specified direction
  - Returns: New grid dimensions and cost paid

### Updated Routes
- `server/src/routes/world.ts`: Returns `gridSizeX` and `gridSizeY` in planet data
- All building placement/movement now uses new grid dimensions

---

## 3. Documentation Updates

### `game_vision.md`
- Updated Defense Turret description:
  - Clarified capacity per level (10/20/30/40)
  - Added maximum turret limit (20)
  - Updated Shield Generator description to mention tool slots

---

## 4. Database Migration Required

**Important**: You need to run a Prisma migration to apply schema changes:

```bash
cd server
npx prisma migrate dev --name add_defense_turrets_and_expansion
```

This will:
1. Add `gridSizeX` and `gridSizeY` columns (defaulting to 10)
2. Add `defenseTurretsJson` column (nullable)
3. Migrate existing `gridSize` data to `gridSizeX`/`gridSizeY` (if needed)

**Note**: After migration, you may want to:
- Set `gridSizeX = gridSize` and `gridSizeY = gridSize` for existing planets
- Or drop the old `gridSize` column if no longer needed

---

## 5. Frontend Updates Needed

The frontend component `PlanetInterior.tsx` currently has a hardcoded `gridSize = 10`. It should be updated to:
- Use `gridSizeX` and `gridSizeY` from the planet API response
- Dynamically render grid based on current planet size
- Display expansion UI/button when grid < 50x50

---

## 6. Testing Checklist

- [ ] Create defense turret (Level 1-4)
- [ ] Verify capacity calculation (sum of all turrets)
- [ ] Test defense assignment with capacity limits
- [ ] Verify error when exceeding capacity
- [ ] Expand planet in X direction
- [ ] Expand planet in Y direction
- [ ] Verify expansion costs scale correctly
- [ ] Test building placement after expansion
- [ ] Verify max expansion (50x50) cannot be exceeded
- [ ] Test with existing planets (migration compatibility)

---

## 7. Example Usage

### Adding a Defense Turret
```bash
POST /api/actions/defense-turret
{
  "planetId": "uuid",
  "level": 2
}
```

### Expanding Planet
```bash
POST /api/actions/expand
{
  "planetId": "uuid",
  "direction": "x"  // or "y"
}
```

### Defense Assignment (with capacity validation)
```bash
POST /api/defense/planets/:id/defense-layout
{
  "front": { "units": { "marine": 50 }, "tools": [] },
  "left": { "units": { "ranger": 30 }, "tools": [] },
  "right": { "units": { "sentinel": 20 }, "tools": [] }
}
```
Will fail if any lane exceeds total defense capacity.

---

## 8. Future Enhancements

- **Turret Upgrades**: Allow upgrading existing turrets instead of only adding new ones
- **Turret Removal**: Allow removing turrets (with resource refund?)
- **Expansion Visualization**: Show expansion preview in UI
- **Expansion Limits**: Add level/XP requirements for larger expansions
- **Defense Turret Building**: Make turrets placeable buildings on the grid instead of abstract


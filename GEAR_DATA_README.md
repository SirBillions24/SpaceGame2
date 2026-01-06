# Gear Data Configuration Guide

## Overview

All gear items are now defined in a centralized configuration file:
**`server/src/constants/gearData.ts`**

This makes it easy to:
- ✅ Add new gear items
- ✅ Balance existing gear stats
- ✅ Change starter gear
- ✅ Organize gear by rarity, slot, or set

---

## File Structure

### `gearData.ts` Contains:

1. **`GearItemDefinition` Interface**: Type definition for gear items
2. **`STARTER_GEAR`**: The 4 items given to all new players
3. **`ALL_GEAR_ITEMS`**: Complete list of all available gear (includes starter gear)
4. **Helper Functions**: `getGearBySlot()`, `getGearByRarity()`, `getStarterGear()`

---

## Adding New Gear

### Step 1: Open the File
```bash
server/src/constants/gearData.ts
```

### Step 2: Add to `ALL_GEAR_ITEMS` Array

```typescript
export const ALL_GEAR_ITEMS: GearItemDefinition[] = [
  ...STARTER_GEAR,
  
  // Add your new item here:
  {
    slotType: 'weapon',           // 'weapon' | 'helmet' | 'spacesuit' | 'shield'
    name: 'Quantum Blaster',      // Display name
    rarity: 'legendary',          // 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
    level: 15,                    // Item level (1-20+)
    meleeStrengthBonus: 60,       // 0-100 (percentage)
    rangedStrengthBonus: 60,     // 0-100 (percentage)
    wallReductionBonus: -60,      // -100 to 0 (negative percentage)
    setName: 'Quantum Set',      // Optional: for set bonuses
    iconName: 'weapon',           // Must match image filename (without extension)
  },
];
```

### Step 3: Balance Considerations

**Bonus Caps:**
- Melee Strength: **+100%** max (when all items equipped)
- Ranged Strength: **+100%** max (when all items equipped)
- Wall Reduction: **-100%** max (when all items equipped)

**Rarity Guidelines:**
- `common`: +5-10% bonuses
- `uncommon`: +10-20% bonuses
- `rare`: +20-35% bonuses
- `epic`: +35-50% bonuses
- `legendary`: +50-100% bonuses

---

## Changing Starter Gear

To change what new players receive:

1. Edit the `STARTER_GEAR` array in `gearData.ts`
2. The items will automatically be given to new accounts on registration
3. Existing players keep their current gear (no changes)

**Example:**
```typescript
export const STARTER_GEAR: GearItemDefinition[] = [
  {
    slotType: 'weapon',
    name: 'Basic Plasma Rifle',  // Changed name
    rarity: 'common',             // Changed rarity
    level: 1,                     // Changed level
    meleeStrengthBonus: 10,      // Changed stats
    rangedStrengthBonus: 10,
    wallReductionBonus: -10,
    iconName: 'weapon',
  },
  // ... other items
];
```

---

## Gear Properties Explained

### `slotType`
- **`'weapon'`**: Primary weapon slot
- **`'helmet'`**: Head/command slot
- **`'spacesuit'`**: Body/armor slot
- **`'shield'`**: Defense/shield slot

### `rarity`
Affects:
- Visual border color in UI
- Drop rates (when implemented)
- Perceived value

### `level`
- Item level (1-20+)
- Can be used for:
  - Level requirements
  - Upgrade systems (future)
  - Sorting/filtering

### `meleeStrengthBonus` / `rangedStrengthBonus`
- **Range**: 0 to 100 (percentage)
- Applied to attacking units only
- Melee bonus affects: `marine`, `sentinel`, `interceptor`
- Ranged bonus affects: `ranger`

### `wallReductionBonus`
- **Range**: -100 to 0 (negative percentage)
- Reduces enemy wall defense bonuses
- Example: `-50` means enemy walls are 50% less effective

### `setName` (Optional)
- For future set bonus system
- Items with same `setName` can trigger set bonuses
- Leave `undefined` for standalone items

### `iconName`
- Must match image filename (without extension)
- Images should be in: `/client/public/assets/admiral/{iconName}.jpeg`
- Example: `iconName: 'weapon'` → `/client/public/assets/admiral/weapon.jpeg`

---

## Helper Functions

### Get Gear by Slot
```typescript
import { getGearBySlot } from '../constants/gearData';

const weapons = getGearBySlot('weapon');
```

### Get Gear by Rarity
```typescript
import { getGearByRarity } from '../constants/gearData';

const legendaryItems = getGearByRarity('legendary');
```

### Get Starter Gear
```typescript
import { getStarterGear } from '../constants/gearData';

const starterItems = getStarterGear();
```

---

## Creating Gear in Code

### From Definition
```typescript
import { createGearFromDefinition } from '../services/admiralService';
import { ALL_GEAR_ITEMS } from '../constants/gearData';

const gearDef = ALL_GEAR_ITEMS[0];
const piece = await createGearFromDefinition(userId, gearDef);
```

### Manual Creation
```typescript
import { createGearPiece } from '../services/admiralService';

const piece = await createGearPiece(
  userId,
  'weapon',
  'Plasma Rifle',
  'legendary',
  10,
  50,  // meleeStrengthBonus
  50,  // rangedStrengthBonus
  -50, // wallReductionBonus
  undefined, // setName
  'weapon'   // iconName
);
```

---

## Best Practices

1. **Balance Testing**: Test gear combinations to ensure they don't exceed caps
2. **Naming**: Use consistent naming conventions (e.g., "Plasma Rifle", "Quantum Blaster")
3. **Rarity Distribution**: Keep higher rarity items rare (fewer in `ALL_GEAR_ITEMS`)
4. **Icon Names**: Use lowercase, no spaces (e.g., `'plasma_rifle'` or `'weapon'`)
5. **Documentation**: Add comments for special items or sets

---

## Example: Adding a New Legendary Weapon

```typescript
export const ALL_GEAR_ITEMS: GearItemDefinition[] = [
  ...STARTER_GEAR,
  
  {
    slotType: 'weapon',
    name: 'Void Reaper',
    rarity: 'legendary',
    level: 20,
    meleeStrengthBonus: 75,
    rangedStrengthBonus: 75,
    wallReductionBonus: -75,
    setName: 'Void Set',
    iconName: 'void_reaper',  // Requires: /client/public/assets/admiral/void_reaper.jpeg
  },
];
```

---

## Questions?

- **Where are images?** `/client/public/assets/admiral/{iconName}.jpeg`
- **How to test?** Use scripts in `server/src/scripts/` to create gear
- **Balance issues?** Check total bonuses don't exceed caps when all items equipped


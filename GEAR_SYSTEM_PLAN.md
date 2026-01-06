# Gear System Implementation Plan

## 📋 Overview
This plan outlines changes to:
1. Add image support for gear pieces
2. Change bonus system from generic attack/defense to specific bonuses
3. Implement caps on bonuses
4. Create 4 test items for testing

---

## 1. Image Location & Structure

### Proposed Location:
```
client/public/assets/admiral/
├── weapon.jpg
├── helmet.jpg
├── spacesuit.jpg
└── shield.jpg
```

### Implementation:
- Create `/client/public/assets/admiral/` directory
- Store 4 JPEG images (weapon.jpg, helmet.jpg, spacesuit.jpg, shield.jpg)
- Update `GearPiece` interface to use image paths
- Frontend will reference: `/assets/admiral/${slotType}.jpg` or use `iconName` field

### Alternative (if you want per-item images):
- Store in `/client/public/assets/admiral/gear/`
- Use naming: `weapon_${iconName}.jpg` or similar
- Reference via `iconName` field in database

**Recommendation**: Start with 4 base images (one per slot type) for simplicity.

---

## 2. Bonus System Changes

### Current System:
- `attackBonus`: Generic percentage applied to both melee and ranged
- `defenseBonus`: Generic percentage applied to defense
- Applied as: `multiplier = 1 + (bonus / 100)`

### New System Required:
- `meleeStrengthBonus`: Percentage bonus to melee troop strength (capped at +100%)
- `rangedStrengthBonus`: Percentage bonus to ranged troop strength (capped at +100%)
- `wallReductionBonus`: Percentage reduction to enemy wall strength (capped at -100%)

### Database Schema Changes:
```prisma
model GearPiece {
  // ... existing fields ...
  meleeStrengthBonus  Int @default(0) @map("melee_strength_bonus")  // New
  rangedStrengthBonus Int @default(0) @map("ranged_strength_bonus") // New
  wallReductionBonus  Int @default(0) @map("wall_reduction_bonus")  // New
  
  // Keep for backward compatibility? Or remove?
  attackBonus  Int @default(0) @map("attack_bonus")  // DEPRECATED
  defenseBonus Int @default(0) @map("defense_bonus") // DEPRECATED
}
```

### Admiral Model Changes:
```prisma
model Admiral {
  // ... existing fields ...
  meleeStrengthBonus  Int @default(0) @map("melee_strength_bonus")  // Cached total
  rangedStrengthBonus Int @default(0) @map("ranged_strength_bonus") // Cached total
  wallReductionBonus  Int @default(0) @map("wall_reduction_bonus")  // Cached total
  
  // Keep for backward compatibility?
  attackBonus  Int @default(0) @map("attack_bonus")  // DEPRECATED
  defenseBonus Int @default(0) @map("defense_bonus") // DEPRECATED
}
```

---

## 3. Service Layer Changes

### `admiralService.ts` Updates:

#### New Bonus Calculation:
```typescript
export function calculateAdmiralBonuses(gearJson: string): {
  meleeStrengthBonus: number;
  rangedStrengthBonus: number;
  wallReductionBonus: number;
} {
  const gear: AdmiralGear = JSON.parse(gearJson || '{}');
  let melee = 0, ranged = 0, wall = 0;
  
  for (const slotType of GEAR_SLOTS) {
    const piece = gear[slotType];
    if (piece) {
      melee += piece.meleeStrengthBonus || 0;
      ranged += piece.rangedStrengthBonus || 0;
      wall += piece.wallReductionBonus || 0;
    }
  }
  
  // Apply caps
  return {
    meleeStrengthBonus: Math.min(100, Math.max(0, melee)),
    rangedStrengthBonus: Math.min(100, Math.max(0, ranged)),
    wallReductionBonus: Math.max(-100, Math.min(0, wall)), // Negative only
  };
}
```

#### Update `equipGearPiece()` and `unequipGearPiece()`:
- Recalculate and cache new bonus types
- Update Admiral record with new bonus fields

---

## 4. Combat Service Changes

### `combatService.ts` Updates:

#### Current Code (lines 162-165):
```typescript
// Apply Admiral Attack Bonus
const attackerBonusMultiplier = 1 + (attackerAdmiralBonus / 100);
attMelee *= attackerBonusMultiplier;
attRanged *= attackerBonusMultiplier;
```

#### New Code:
```typescript
// Apply Admiral Bonuses (separate for melee/ranged)
const meleeMultiplier = 1 + (attackerAdmiral.meleeStrengthBonus / 100);
const rangedMultiplier = 1 + (attackerAdmiral.rangedStrengthBonus / 100);
attMelee *= meleeMultiplier;
attRanged *= rangedMultiplier;

// Apply Wall Reduction
const wallReduction = attackerAdmiral.wallReductionBonus / 100; // Negative value
wallBonusPct = Math.max(0, wallBonusPct + wallReduction); // Add negative = subtract
```

#### Update `resolveCombat()`:
- Pass full admiral object instead of just bonuses
- Extract new bonus types from admiral

---

## 5. API & Frontend Changes

### API Response Updates:
- `GET /admiral` returns new bonus fields
- Frontend displays: "Melee: +X%", "Ranged: +X%", "Wall: -X%"

### UI Updates:
- `AdmiralPanel.tsx`: Display new bonus types
- Gear item cards: Show melee/ranged/wall bonuses instead of generic attack/defense

---

## 6. Test Items Creation

### 4 Items to Create (totaling exactly the caps):

#### Option A: Even Distribution
1. **Weapon**: +25% melee, +25% ranged, -25% wall
2. **Helmet**: +25% melee, +25% ranged, -25% wall
3. **Spacesuit**: +25% melee, +25% ranged, -25% wall
4. **Shield**: +25% melee, +25% ranged, -25% wall
**Total**: +100% melee, +100% ranged, -100% wall ✅

#### Option B: Thematic Distribution
1. **Weapon**: +40% melee, +40% ranged, -20% wall
2. **Helmet**: +20% melee, +20% ranged, -20% wall
3. **Spacesuit**: +20% melee, +20% ranged, -30% wall
4. **Shield**: +20% melee, +20% ranged, -30% wall
**Total**: +100% melee, +100% ranged, -100% wall ✅

#### Option C: Specialized (Recommended for Testing)
1. **Weapon**: +50% melee, +50% ranged, -50% wall
2. **Helmet**: +25% melee, +25% ranged, -25% wall
3. **Spacesuit**: +15% melee, +15% ranged, -15% wall
4. **Shield**: +10% melee, +10% ranged, -10% wall
**Total**: +100% melee, +100% ranged, -100% wall ✅

**Recommendation**: Option C - shows different item values and makes it clear when items are equipped.

---

## 7. Migration Strategy

### Database Migration:
1. Add new columns to `gear_pieces` table
2. Add new columns to `admirals` table
3. Keep old columns for backward compatibility initially
4. Migrate existing gear (if any) - set new bonuses to 0 or calculate from old values

### Code Migration:
1. Update interfaces and types
2. Update service functions
3. Update combat logic
4. Update API responses
5. Update frontend components
6. Test thoroughly

---

## 8. Testing Checklist

- [ ] Create 4 test items with correct bonuses
- [ ] Equip all 4 items
- [ ] Verify bonuses cap at 100%/+100%/-100%
- [ ] Test combat with equipped admiral
- [ ] Verify melee bonus applies only to melee units
- [ ] Verify ranged bonus applies only to ranged units
- [ ] Verify wall reduction applies correctly
- [ ] Test with partial equipment (2-3 items)
- [ ] Test unequipping items
- [ ] Verify images display correctly

---

## 9. Files to Modify

### Backend:
1. `server/prisma/schema.prisma` - Add new bonus fields
2. `server/src/services/admiralService.ts` - Update bonus calculation
3. `server/src/services/combatService.ts` - Apply new bonuses in combat
4. `server/src/routes/admiral.ts` - Update API responses

### Frontend:
1. `client/src/components/AdmiralPanel.tsx` - Display new bonuses
2. `client/src/lib/api.ts` - Update interfaces (if needed)
3. Create `/client/public/assets/admiral/` directory
4. Add image references in gear display

---

## 10. Questions to Confirm

1. **Image naming**: Use slot type names (weapon.jpg) or allow custom names per item?
2. **Backward compatibility**: Keep old `attackBonus`/`defenseBonus` fields or remove?
3. **Test items**: Which distribution option (A, B, or C) do you prefer?
4. **Wall reduction**: Should it apply to ALL wall bonuses or just base wall level?
5. **Caps**: Should we show a warning when caps are reached, or just silently cap?

---

## Summary

**Image Location**: `/client/public/assets/admiral/` with 4 JPEG files

**Bonus System**: Replace generic attack/defense with:
- Melee Strength Bonus (capped +100%)
- Ranged Strength Bonus (capped +100%)
- Wall Reduction Bonus (capped -100%)

**Test Items**: 4 items totaling exactly the caps (Option C recommended)

**Implementation Order**:
1. Add image directory and place images
2. Update database schema
3. Update service layer
4. Update combat logic
5. Update frontend
6. Create test items
7. Test end-to-end


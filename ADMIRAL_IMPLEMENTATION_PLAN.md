# Admiral System Implementation Plan

## 🎯 Overview

Implement a Commander/Admiral system where:
- Admirals are **required** for all fleet movements (attack, support, scout)
- Admirals consist of **4 pieces** (gear slots)
- Pieces are obtained by **attacking NPC planets** (loot drops)
- Admirals provide combat bonuses when equipped

---

## 📋 System Design

### 1. Admiral Pieces (4 Slots)

Admirals have 4 gear pieces:

| Slot | Goodgame Empire | Sci-Fi Name | Purpose |
|------|----------------|-------------|---------|
| 1 | Helmet | Command Helmet | Head protection, tactical awareness |
| 2 | Armor | Combat Armor | Body protection, durability |
| 3 | Weapon | Energy Weapon | Attack power, offensive capability |
| 4 | Shield | Defense Matrix | Defense power, protection |

**Piece Properties:**
- **Rarity**: Common, Uncommon, Rare, Epic, Legendary
- **Level**: 1-10 (or similar progression)
- **Bonuses**: Attack bonus %, Defense bonus %
- **Set Bonuses**: Bonus when multiple pieces from same set are equipped

---

## 🗄️ Database Schema Changes

### Update Admiral Model

```prisma
model Admiral {
  id           String   @id @default(uuid())
  userId       String   @unique @map("user_id")
  
  // Gear Pieces (4 slots)
  helmetId    String?  @map("helmet_id")      // Reference to AdmiralPiece
  armorId     String?  @map("armor_id")
  weaponId    String?  @map("weapon_id")
  shieldId    String?  @map("shield_id")
  
  // Computed bonuses (cached, recalculated when gear changes)
  attackBonus  Int      @default(0) @map("attack_bonus") // Percentage
  defenseBonus Int      @default(0) @map("defense_bonus") // Percentage
  
  // Legacy support (keep gearJson for migration)
  gearJson     String   @default("{}") @map("gear_json")
  
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  helmet AdmiralPiece? @relation("HelmetPiece", fields: [helmetId], references: [id])
  armor AdmiralPiece?  @relation("ArmorPiece", fields: [armorId], references: [id])
  weapon AdmiralPiece? @relation("WeaponPiece", fields: [weaponId], references: [id])
  shield AdmiralPiece? @relation("ShieldPiece", fields: [shieldId], references: [id])

  @@map("admirals")
}

// New: Admiral Pieces (loot items)
model AdmiralPiece {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")        // Owner
  pieceType   String   @map("piece_type")     // "helmet", "armor", "weapon", "shield"
  rarity      String                           // "common", "uncommon", "rare", "epic", "legendary"
  level       Int      @default(1)
  attackBonus Int      @default(0) @map("attack_bonus") // Percentage
  defenseBonus Int     @default(0) @map("defense_bonus") // Percentage
  setName     String?  @map("set_name")        // For set bonuses (e.g., "Vanguard Set")
  isEquipped  Boolean  @default(false) @map("is_equipped")
  equippedBy  String?  @map("equipped_by")     // Admiral ID if equipped
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  helmetAdmirals Admiral[] @relation("HelmetPiece")
  armorAdmirals Admiral[] @relation("ArmorPiece")
  weaponAdmirals Admiral[] @relation("WeaponPiece")
  shieldAdmirals Admiral[] @relation("ShieldPiece")

  @@map("admiral_pieces")
}
```

### Update Fleet Model

```prisma
model Fleet {
  // ... existing fields ...
  admiralId   String?  @map("admiral_id")     // Required for all fleet types
  
  admiral     Admiral? @relation(fields: [admiralId], references: [id])
  // ... rest of model ...
}
```

---

## 🎮 Gameplay Flow

### 1. Obtaining Pieces (NPC Loot)

**When attacking NPC planets:**
- After successful combat, roll for loot drops
- Pieces drop based on NPC level:
  - Level 1-5 NPCs: Common/Uncommon pieces
  - Level 6-10 NPCs: Rare pieces
  - Level 11-15 NPCs: Epic pieces
  - Level 16+ NPCs: Legendary pieces

**Loot Drop Logic:**
```typescript
// After NPC combat victory
const dropChance = 0.3; // 30% chance to drop a piece
const pieceType = random(['helmet', 'armor', 'weapon', 'shield']);
const rarity = calculateRarity(npcLevel);
const level = randomLevel(npcLevel);
```

### 2. Assembling Admiral

**Requirements:**
- User must have at least one piece of each type (4 pieces total)
- Pieces must be in inventory (not equipped elsewhere)
- User can only have ONE active admiral

**Process:**
1. User collects pieces from NPC attacks
2. User opens "Admiral Management" UI
3. User selects pieces for each slot
4. System calculates bonuses
5. Admiral is "assembled" and ready to use

### 3. Fleet Requirements

**All fleet movements require an admiral:**
- Attack fleets: Must have admiral assigned
- Support fleets: Must have admiral assigned
- Scout fleets: Must have admiral assigned

**Validation:**
- Check if user has an active admiral before creating fleet
- Check if admiral has all 4 pieces equipped
- Store `admiralId` in Fleet record

---

## 🔧 Implementation Steps

### Phase 1: Database & Models

1. **Update Prisma Schema**
   - Add `AdmiralPiece` model
   - Update `Admiral` model (add piece references)
   - Update `Fleet` model (add `admiralId`)
   - Run migration

2. **Create Admiral Service**
   - `admiralService.ts`:
     - `createAdmiral(userId)` - Create empty admiral
     - `equipPiece(admiralId, pieceId, slot)` - Equip piece to slot
     - `unequipPiece(admiralId, slot)` - Remove piece from slot
     - `calculateBonuses(admiralId)` - Recalculate attack/defense bonuses
     - `getAdmiral(userId)` - Get user's admiral with pieces

### Phase 2: NPC Loot System

1. **Update Combat Service**
   - Modify `calculateLoot()` to include admiral pieces
   - Add piece drop logic based on NPC level
   - Store pieces in user's inventory

2. **Loot Drop Constants**
   - Add to `mechanics.ts`:
     - Drop rates per NPC level
     - Rarity distribution
     - Level ranges

### Phase 3: Fleet Integration

1. **Update Fleet Creation**
   - Add admiral validation to `/actions/fleet`
   - Require `admiralId` in fleet creation
   - Validate admiral has all 4 pieces

2. **Update Fleet Service**
   - Add `validateAdmiralRequired(userId)` check
   - Store `admiralId` when creating fleet

### Phase 4: Combat Bonuses

1. **Apply Admiral Bonuses**
   - Update `resolveCombat()` to use admiral bonuses
   - Apply attack bonus to attacker units
   - Apply defense bonus to defender units (if defender has admiral)

### Phase 5: Frontend UI

1. **Admiral Management Panel**
   - Show current admiral status
   - Display equipped pieces (4 slots)
   - Show available pieces in inventory
   - Drag-and-drop or click to equip/unequip
   - Display current bonuses

2. **Fleet Panel Updates**
   - Show admiral requirement
   - Display admiral info when creating fleet
   - Show admiral bonuses in fleet preview

3. **Loot Display**
   - Show pieces obtained after NPC attacks
   - Notification when new piece is obtained

---

## 📊 Data Structures

### AdmiralPiece JSON Example

```json
{
  "id": "uuid",
  "pieceType": "helmet",
  "rarity": "rare",
  "level": 5,
  "attackBonus": 8,
  "defenseBonus": 12,
  "setName": "Vanguard",
  "isEquipped": true
}
```

### Admiral with Pieces

```typescript
{
  id: "uuid",
  userId: "user-uuid",
  helmetId: "piece-uuid-1",
  armorId: "piece-uuid-2",
  weaponId: "piece-uuid-3",
  shieldId: "piece-uuid-4",
  attackBonus: 25,  // Sum of all pieces + set bonuses
  defenseBonus: 30,
  helmet: { ...piece data... },
  armor: { ...piece data... },
  weapon: { ...piece data... },
  shield: { ...piece data... }
}
```

---

## 🎲 Loot Drop Mechanics

### Drop Rates

```typescript
const LOOT_DROP_RATES = {
  common: { minLevel: 1, maxLevel: 5, dropChance: 0.4 },
  uncommon: { minLevel: 3, maxLevel: 8, dropChance: 0.3 },
  rare: { minLevel: 6, maxLevel: 12, dropChance: 0.25 },
  epic: { minLevel: 10, maxLevel: 18, dropChance: 0.15 },
  legendary: { minLevel: 15, maxLevel: 25, dropChance: 0.1 }
};
```

### Piece Generation

```typescript
function generateAdmiralPiece(npcLevel: number): AdmiralPiece {
  const rarity = determineRarity(npcLevel);
  const pieceType = random(['helmet', 'armor', 'weapon', 'shield']);
  const level = Math.floor(npcLevel / 2) + random(0, 2);
  
  // Bonuses scale with rarity and level
  const baseAttack = RARITY_BONUSES[rarity].attack * level;
  const baseDefense = RARITY_BONUSES[rarity].defense * level;
  
  return {
    pieceType,
    rarity,
    level,
    attackBonus: baseAttack,
    defenseBonus: baseDefense,
    setName: randomSetName() // Optional set bonus
  };
}
```

---

## 🔐 Validation Rules

1. **Fleet Creation:**
   - User must have an active admiral
   - Admiral must have all 4 pieces equipped
   - Admiral cannot be on another active fleet

2. **Piece Equipping:**
   - Piece must be owned by user
   - Piece must match slot type (helmet → helmet slot)
   - Only one piece per slot

3. **Admiral Assembly:**
   - Minimum 4 pieces required (one of each type)
   - User can only have one active admiral

---

## 🎨 UI Components Needed

1. **AdmiralPanel.tsx**
   - Display 4 gear slots (visual slots)
   - Show equipped pieces
   - Show inventory of unequipped pieces
   - Display current bonuses
   - Equip/unequip functionality

2. **AdmiralPieceCard.tsx**
   - Display piece stats
   - Show rarity color coding
   - Show set name if part of set

3. **FleetPanel Updates**
   - Show admiral requirement warning
   - Display selected admiral info
   - Show admiral bonuses

4. **LootNotification.tsx**
   - Show when piece is obtained
   - Display piece details

---

## 📝 API Endpoints Needed

1. `GET /api/admiral` - Get user's admiral
2. `GET /api/admiral/pieces` - Get user's piece inventory
3. `POST /api/admiral/equip` - Equip piece to slot
4. `POST /api/admiral/unequip` - Unequip piece from slot
5. `POST /api/admiral/assemble` - Create/assemble admiral (if not exists)

---

## 🧪 Testing Plan

1. **Unit Tests:**
   - Piece generation logic
   - Bonus calculation
   - Set bonus calculation

2. **Integration Tests:**
   - NPC loot drops
   - Admiral assembly
   - Fleet creation with admiral
   - Fleet creation without admiral (should fail)

3. **E2E Tests:**
   - Attack NPC → Get piece → Equip → Create fleet

---

## 🚀 Migration Strategy

1. **Existing Users:**
   - Create empty admiral for all existing users
   - Allow them to obtain pieces from NPCs
   - Grandfather in existing fleets (no admiral required for old fleets)

2. **New Users:**
   - Create admiral on account creation
   - Start with tutorial on obtaining first piece

---

## ❓ Questions to Clarify

1. **Piece Rarity Distribution:**
   - What are the exact drop rates per NPC level?
   - Should higher level NPCs guarantee better pieces?

2. **Set Bonuses:**
   - Should pieces have set bonuses (2-piece, 4-piece sets)?
   - What sets should exist?

3. **Piece Leveling:**
   - Can pieces be upgraded/leveled up?
   - Or are they fixed level when dropped?

4. **Multiple Admirals:**
   - Can users have multiple admirals (different loadouts)?
   - Or only one active admiral at a time?

5. **Admiral on Defense:**
   - Should defender's admiral provide defense bonuses?
   - Or only attacker's admiral matters?

6. **Piece Trading:**
   - Can pieces be traded between players?
   - Or are they account-bound?

---

## 📅 Implementation Priority

**Phase 1 (Core):**
1. Database schema updates
2. Admiral service (equip/unequip)
3. Fleet requirement validation
4. Basic UI for admiral management

**Phase 2 (Loot):**
1. NPC loot drop system
2. Piece generation logic
3. Loot notifications

**Phase 3 (Polish):**
1. Combat bonus integration
2. Set bonuses
3. Advanced UI features
4. Visual improvements

---

This plan provides a comprehensive roadmap for implementing the Admiral system. Should we proceed with Phase 1, or would you like to discuss any of the design decisions first?





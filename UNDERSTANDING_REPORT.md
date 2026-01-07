# Understanding Report: Galactic Conquest Codebase Analysis

## Executive Summary

This report documents my understanding of the **Galactic Conquest** codebase after reviewing the core documentation, database schema, and tracing the two critical functions: `syncPlanetResources` (Economy) and `resolveCombat` (Warfare). The game is a sci-fi themed persistent browser-based strategy game inspired by Goodgame Empire mechanics.

---

## 1. Game Concept & Vision

### 1.1 Core Design Philosophy
- **Theme**: Sci-fi translation of Goodgame Empire mechanics
- **Style**: "Retro-Future Command Console" aesthetic with high contrast, neon accents, pixel-art sprites
- **Gameplay**: Strategic depth with 3-lane combat, resource management, and persistent world

### 1.2 Key Terminology Mappings
| Medieval (GGE) | Sci-Fi (Galactic Conquest) |
|----------------|----------------------------|
| Castle | Planetary Colony |
| World Map | Sector Chart |
| King/Lord | Commander |
| Alliance | Federation |
| Wood | Carbon |
| Stone | Titanium |
| Food | Nutrient Paste |
| Gold | Credits |
| Public Order | Stability |

### 1.3 Combat System Overview
- **3-Lane Defense**: Industrial District (Left), Starport Access (Center), Military District (Right)
- **Wave-Based**: Attacks occur in multiple waves per lane
- **Surface Invasion**: Final phase if attacker breaches sectors
- **Tools**: Consumable items that modify combat effectiveness (Signal Jammers, Breach Cutters, Auto-Turrets, etc.)

---

## 2. Database Schema Analysis (`schema.prisma`)

### 2.1 Core Entities

#### **User**
- Authentication (username, email, passwordHash)
- Progression (xp, level)
- Relations: planets, fleets, admiral

#### **Planet** (Formerly Castle)
- **Location**: x, y coordinates (unique constraint)
- **Resources**: carbon, titanium, food, credits, stability
- **Economy State**: 
  - `lastResourceUpdate`: Timestamp for lazy evaluation
  - `lastFoodConsumption`: Food consumption tracking
- **Construction**: 
  - `isBuilding`: Single construction slot flag
  - `activeBuildId`: Currently building/upgrading
  - `buildFinishTime`: Completion timestamp
- **Queues**:
  - `recruitmentQueue`: JSON array of unit training batches
  - `manufacturingQueue`: JSON array of tool crafting batches
- **Defense Levels**: 
  - `defensiveGridLevel`: Shield Generator (Wall equivalent)
  - `perimeterFieldLevel`: Perimeter Field (Moat equivalent)
  - `starportLevel`: Starport (Gate equivalent)
- **NPC Support**: `isNpc`, `npcLevel` for PVE content

#### **PlanetUnit**
- Tracks unit counts per planet (marine, ranger, sentinel, etc.)
- Unique constraint: `[planetId, unitType]`

#### **ToolInventory**
- Tracks tool counts per planet (signal_jammer, auto_turret, etc.)
- Unique constraint: `[planetId, toolType]`

#### **Building**
- Grid-based placement (x, y coordinates)
  - Types: carbon_processor, titanium_extractor, hydroponics, naval_academy, orbital_garrison, housing_unit, monument, etc.
- Status: "active", "constructing", "upgrading"
- Level-based progression

#### **DefenseLayout**
- Stores 3-lane defensive assignments as JSON
- `frontLaneJson`, `leftLaneJson`, `rightLaneJson`
- Format: `{ units: {...}, tools: [...] }`

#### **Fleet** (Formerly March)
- Movement tracking: `departAt`, `arriveAt`, `status` (enroute, arrived, returning, completed, resolved)
- `laneAssignmentsJson`: Attack wave structure per lane
- `toolsJson`: Tools carried by fleet
- `cargoJson`: Loot being transported

#### **BattleReport**
- Stores combat results with detailed lane breakdowns
- Links to Fleet via unique constraint

#### **Admiral**
- Commander system with gear (JSON) and cached bonuses
- Provides combat bonuses (attackBonus, defenseBonus percentages)

---

## 3. Public Order / Stability System

### 3.1 Core Mechanics
**Stability** (Public Order) is a critical economic modifier that affects:
- Resource production rates (Carbon, Titanium, Food)
- Recruitment speed
- Healing speed (if implemented)
- **Does NOT affect**: Combat strength, storage capacity, research speed, building construction time

### 3.2 Productivity Formulas

#### Positive Stability (PO ≥ 0):
```
Productivity = √(PO) × 2 + 100
```
- **0 PO**: 100% (baseline)
- **100 PO**: 120% (+20%)
- **400 PO**: 140% (+40%)
- **900 PO**: 160% (+60%)
- **2,500 PO**: 200% (+100%, double production)

#### Negative Stability (PO < 0):
```
Productivity = 100 × (100 / (100 + 2 × √(-PO)))
```
- **-100 PO**: 83.33% (-16.67%)
- **-400 PO**: 71.43% (-28.57%)
- **-900 PO**: 62.50% (-37.50%)
- **-2,500 PO**: 50% (-50%, half production)

### 3.3 Stability Calculation (in `calculatePlanetRates`)
```typescript
const taxPenalty = (planet.taxRate || 10) * 2;
const publicOrder = decorationBonus - dwellingPenalty - taxPenalty;
```

**Components**:
- **Decoration Bonus**: Holo-Monuments (monument buildings) provide +50 PO per level
- **Dwelling Penalty**: Housing units reduce PO (Level 1: -10, Level 12: -85)
- **Tax Penalty**: Tax rate × 2 (e.g., 10% tax = -20 PO)

### 3.4 Strategic Implications
- **Diminishing Returns**: Early PO investments are highly valuable
- **Accelerating Penalties**: Initial negative PO is very damaging
- **Optimal Targets**: 
  - Production planets: +900 to +2,500 PO
  - Military planets: +400 to +900 PO
  - Defensive planets: 0 to +400 PO acceptable

---

## 4. Economy System: `syncPlanetResources` Analysis

### 4.1 Function Purpose
**Lazy Evaluation System**: Resources are calculated on-demand based on time elapsed since `lastResourceUpdate`, rather than using a global server ticker.

### 4.2 Execution Flow

#### **Step 1: Data Loading**
```typescript
const planet = await prisma.planet.findUnique({
  where: { id: planetId },
  include: { units: true, buildings: true, tools: true }
});
```
Loads planet with all related entities needed for calculations.

#### **Step 2: Time Calculation**
```typescript
const now = new Date();
const lastUpdate = new Date(planet.lastResourceUpdate);
const diffMs = now.getTime() - lastUpdate.getTime();
const diffHours = diffMs / (1000 * 60 * 60);
```
Calculates hours elapsed since last update.

#### **Step 3: Construction Completion Check**
- Checks if `buildFinishTime <= now`
- If building finished:
  - Updates building status to "active"
  - Increments level if upgrading
  - **Special Hook**: Shield Generator upgrades increment `defensiveGridLevel`
  - Clears construction slot (`isBuilding: false`)

#### **Step 4: Rate Calculation** (`calculatePlanetRates`)
**Building Processing**:
- Sums levels of active/upgrading buildings:
  - `carbon_processor` → carbon production level
  - `titanium_extractor` → titanium production level
  - `hydroponics` → food production level
- **Housing Units**: 
  - Adds population from `DWELLING_STATS_GGE[level].pop`
  - Adds PO penalty from `DWELLING_STATS_GGE[level].poPenalty`
- **Monuments**: Adds +50 PO per level

**Stability & Productivity**:
- Calculates Public Order: `decorationBonus - dwellingPenalty - taxPenalty`
- Applies square root formulas for productivity multiplier

**Production Rates**:
```typescript
const carbonRate = (BASE_PRODUCTION + (carbonLevel * LEVEL_MULTIPLIER)) * prodMult;
const titaniumRate = (BASE_PRODUCTION + (titaniumLevel * LEVEL_MULTIPLIER)) * prodMult;
const foodRate = (BASE_PRODUCTION + (foodLevel * LEVEL_MULTIPLIER)) * prodMult;
```
Where `BASE_PRODUCTION = 100` and `LEVEL_MULTIPLIER = 50` per building level.

**Food Consumption**:
```typescript
planet.units.forEach(u => {
  const stats = UNIT_STATS[u.unitType];
  foodConsumption += (u.count * stats.upkeep);
});
```
- Marine: 4 food/hour
- Ranger: 3 food/hour
- Sentinel: 6 food/hour

**Credit Generation**:
```typescript
const creditRate = population * ((planet.taxRate || 10) / 100) * 5;
```

#### **Step 5: Resource Application**
```typescript
let newCarbon = planet.carbon + (stats.carbonRate * diffHours);
let newTitanium = planet.titanium + (stats.titaniumRate * diffHours);
let newFood = planet.food + (stats.foodRate * diffHours);
const consumed = stats.foodConsumption * diffHours;
newFood -= consumed;
```

#### **Step 6: Desertion Logic**
If `newFood < 0` and `foodConsumption > 0`:
- Calculates sustainable upkeep ratio: `sustainableUpkeep / foodConsumption`
- **Proportionally reduces ALL unit types** by deficit ratio
- Sets food to 0
- Updates `PlanetUnit` records in database

**Key Insight**: Desertion affects all units equally, not just specific types.

#### **Step 7: Queue Processing**

**Recruitment Queue**:
- Parses JSON array: `[{ unit, count, finishTime }]`
- For each completed batch (`finishTime <= now`):
  - Upserts `PlanetUnit` with incremented count
- Removes completed items from queue

**Manufacturing Queue** (via `processManufacturingQueue`):
- Similar structure: `[{ tool, count, finishTime }]`
- Completed tools are added to `ToolInventory`
- Queue is updated to remove completed items

#### **Step 8: Final Database Update**
```typescript
await prisma.planet.update({
  where: { id: planetId },
  data: {
    carbon: newCarbon,
    titanium: newTitanium,
    food: newFood,
    credits: newCredits,
    stability: Math.round(stats.publicOrder),
    population: stats.population,
    lastResourceUpdate: now,
  }
});
```

### 4.3 Key Design Patterns
1. **Lazy Evaluation**: No background workers for economy; calculated on-demand
2. **Single Construction Slot**: `isBuilding` flag enforces sequential construction
3. **Queue-Based Systems**: Both recruitment and manufacturing use JSON queues with finish times
4. **Proportional Desertion**: Food shortage affects all units proportionally

---

## 5. Combat System: `resolveCombat` Analysis

### 5.1 Function Purpose
Resolves combat when an attack fleet arrives at a planet. Implements the 3-lane defensive system with wave-based combat, tool modifiers, and surface invasion.

### 5.2 Execution Flow

#### **Step 1: Fleet Validation & Data Loading**
```typescript
const fleet = await prisma.fleet.findUnique({
  where: { id: fleetId },
  include: {
    owner: { include: { admiral: true } },
    toPlanet: { include: { defenseLayout: true, owner: true } }
  }
});
```
- Validates fleet status is "arrived" and type is "attack"
- Loads attacker's admiral (for future bonus integration)
- Loads defender's planet and defense layout

#### **Step 2: Parse Attack Structure**
```typescript
const raw = JSON.parse(fleet.laneAssignmentsJson || '{}');
attStructure.left = normalize(raw.left);
attStructure.front = normalize(raw.front);
attStructure.right = normalize(raw.right);
```
- Normalizes wave structure: `[{ units: {...}, tools: {...} }]`
- Handles legacy format (plain unit objects)

#### **Step 3: Parse Defense Layout**
```typescript
const parseDefLane = (json: string | null) => {
  // New format: { units: {...}, tools: [...] }
  // Legacy format: { marine: 10, ... }
};
```
- Extracts units and tools per lane
- Tools are stored as array: `[{ type: string, count: number }]`

#### **Step 4: Extract Defense Buildings**
```typescript
const buildings = {
  shield: fleet.toPlanet.defensiveGridLevel,
  starport: fleet.toPlanet.starportLevel,
  perimeter: fleet.toPlanet.perimeterFieldLevel
};
```

#### **Step 5: Resolve Each Sector** (`resolveSector`)

**Sector Resolution Process**:

1. **Initialize State**:
   - Clone defender units and tools
   - Track total attacker/defender losses
   - Initialize wave results array

2. **Wave Loop** (for each attack wave):
   - **Check if Defenders Wiped**: If no defenders remain, wave passes through unopposed
   - **Activate Defender Tools**: 
     - Each tool slot with `count > 0` provides +1 tool power
     - Decrements tool count by 1 (consumption)
   - **Resolve Wave Collision** (`resolveWaveCollision`)

3. **Wave Collision Resolution**:

   **Attacker Power Calculation**:
   ```typescript
   for (const [u, count] of Object.entries(attackerUnits)) {
     const s = getUnitStats(u);
     attMelee += s.meleeAtk * count;
     attRanged += s.rangedAtk * count;
   }
   const totalAttackerPower = attMelee + attRanged;
   ```

   **Defender Power Calculation**:
   ```typescript
   for (const [u, count] of Object.entries(defenderUnits)) {
     const s = getUnitStats(u);
     defMelee += s.meleeDef * count;
     defRanged += s.rangedDef * count;
   }
   ```

   **Tool Modifiers**:
   - **Defender Tools**:
     - `targeting_array`: +25% ranged defense
   - **Defender Building Bonuses**:
     - Shield Generator: +20% defense per level
     - Starport (Center only): +35% defense per level
     - Perimeter Field: +10% defense per level
   - **Defender Tool Bonuses**:
     - `auto_turret`: +25% shield bonus
     - `blast_door` (Center only): +35% starport bonus
   - **Attacker Tool Reductions**:
     - `signal_jammer`: -10% shield bonus per tool
     - `breach_cutter` (Center only): -10% starport bonus per tool
     - `holo_decoy`: -10% defender ranged power per tool (capped at 100%)

   **Composite Defense Power**:
   ```typescript
   const meleeRatio = attMelee / totalAttackerPower;
   const rangedRatio = attRanged / totalAttackerPower;
   totalDefPower = (defMelee * meleeRatio) + (defRanged * rangedRatio);
   totalDefPower *= (1 + totalBonusPct); // Apply percentage bonuses
   ```

   **Winner Determination**:
   ```typescript
   const attackerWon = totalAttackerPower > totalDefPower;
   ```

   **Casualty Calculation**:
   ```typescript
   const casualtyRate = attackerWon
     ? (totalDefPower / totalPower) // Attacker losses
     : (totalAttackerPower / totalPower); // Defender losses
   const victoryDampener = 0.5; // Winners take 50% of calculated losses
   ```

4. **Sector Winner**:
   - If any wave wipes defenders → Attacker wins sector
   - If all waves fought and defenders remain → Defender wins sector
   - Surviving attackers from winning waves proceed to surface invasion

#### **Step 6: Surface Invasion Logic**

**Sector Victory Count**:
- Counts how many sectors attacker won (0, 1, 2, or 3)

**Bonus Calculation**:
- **3 Sectors Won**: Attacker gets +30% combat power bonus
- **1 Sector Won**: Defender gets +30% combat power bonus
- **2 Sectors Won**: No bonus

**Surface Battle**:
- Aggregates surviving attackers from all winning sectors
- Courtyard defense is empty (no additional defenders)
- Resolves final battle with bonuses applied
- If attacker wins surface → Planet conquered (looting occurs)

#### **Step 7: Loot Calculation**

**Loot Capacity**:
```typescript
function calculateLoot(survivingUnits, planetResources) {
  let totalCapacity = 0;
  for (const [u, count] of Object.entries(survivingUnits)) {
    totalCapacity += UNIT_STATS[u].capacity * count;
  }
  // Distribute loot proportionally based on capacity
}
```

**Unit Capacities**:
- Marine: 10 capacity
- Ranger: 5 capacity
- Sentinel: 20 capacity
- Interceptor: 15 capacity

**Loot Distribution**: Proportional to available resources (carbon, titanium, food)

#### **Step 8: Persist Combat Results**

**Defender Losses**:
- Updates `DefenseLayout` with surviving units and tools
- Decrements `PlanetUnit` counts for defender losses
- Decrements `ToolInventory` for consumed tools

**Tool Consumption Calculation**:
```typescript
const calcConsumed = (initial, final) => {
  // Calculate difference between initial and final tool counts
  // Returns consumed tools per type
};
```

**Battle Report Creation**:
- Stores detailed lane results, losses, and loot in `BattleReport` table

### 5.3 Key Combat Mechanics

1. **Wave-Based System**: Multiple attack waves per lane, processed sequentially
2. **Tool Consumption**: Defender tools are consumed per wave (1 per slot per wave)
3. **Percentage Bonuses**: Building and tool bonuses are multiplicative percentages
4. **Weighted Defense**: Defense power is weighted by attacker's melee/ranged ratio
5. **Victory Dampener**: Winners take 50% of calculated casualties (prevents total annihilation)
6. **Surface Invasion**: Only occurs if attacker wins at least one sector
7. **Loot Capacity**: Based on surviving unit types and their individual capacities

---

## 6. Integration Points & Dependencies

### 6.1 Economy Dependencies
- `syncPlanetResources` calls `processManufacturingQueue` from `toolService.ts`
- Uses constants from `constants/mechanics.ts`:
  - `UNIT_STATS`: Unit upkeep values
  - `DWELLING_STATS_GGE`: Housing population and PO penalties
  - `BASE_PRODUCTION`: Base resource production rate

### 6.2 Combat Dependencies
- `resolveCombat` uses `resolveSector` and `resolveWaveCollision` (internal functions)
- Unit stats defined in `combatService.ts`: `UNIT_STATS` (different from economy stats)
- Tool effects are hardcoded in `resolveWaveCollision`

### 6.3 Database Interactions
- **Reads**: Planet, Buildings, Units, Tools, Fleet, DefenseLayout, Admiral
- **Writes**: Planet (resources, stability, queues), PlanetUnit (losses, recruitment), ToolInventory (consumption, manufacturing), DefenseLayout (surviving units/tools), BattleReport

---

## 7. Critical Insights & Observations

### 7.1 Architecture Strengths
1. **Lazy Evaluation**: Efficient resource calculation without background workers
2. **Queue System**: Flexible JSON-based queues for recruitment and manufacturing
3. **Modular Design**: Clear separation between economy (`planetService`) and combat (`combatService`)
4. **Tool System**: Well-integrated consumable items with clear effects

### 7.2 Potential Issues & Edge Cases

1. **Desertion Logic**: 
   - Currently sets `newFood = 0` after desertion, but doesn't account for partial hours
   - May cause units to desert even if food production > consumption

2. **Tool Consumption**:
   - Defender tools are consumed per wave, but attacker tools are not consumed (only applied per wave)
   - Inconsistency: Attacker tools in `toolsJson` vs defender tools in `DefenseLayout`

3. **Construction Timing**:
   - Buildings continue producing while upgrading (`status === 'upgrading'`)
   - No validation that `activeBuildId` matches actual building state

4. **Combat Tool Effects**:
   - Tool effects are hardcoded in `resolveWaveCollision`
   - No database-driven tool stats (unlike units)

5. **Surface Invasion**:
   - Courtyard defense is always empty (no additional defenders)
   - May be intentional for game balance, but worth noting

6. **Loot Calculation**:
   - Loot is calculated but not automatically transferred to fleet cargo
   - Fleet status must be updated separately

### 7.3 Data Consistency Considerations

1. **DefenseLayout vs PlanetUnit**:
   - `DefenseLayout` is a "plan" of assigned units
   - `PlanetUnit` is the actual inventory
   - Combat updates both, but initial assignment validation must ensure `DefenseLayout` units ≤ `PlanetUnit` counts

2. **Tool Inventory**:
   - Tools are deducted from `ToolInventory` when consumed in combat
   - But tools in `DefenseLayout` are "allocated" - need to ensure total allocated ≤ inventory

3. **Fleet Status**:
   - Fleet status transitions: `enroute` → `arrived` → `returning` → `completed`
   - `resolveCombat` expects `status === 'arrived'`, but doesn't update status
   - Status update likely handled by `timerWorker.ts`

---

## 8. Recommendations for Future Development

### 8.1 Code Quality
1. **Extract Constants**: Move tool effects to a constants file or database
2. **Type Safety**: Replace `any` types with proper interfaces
3. **Error Handling**: Add more comprehensive error handling for edge cases
4. **Validation**: Add validation for queue integrity, resource bounds, etc.

### 8.2 Feature Enhancements
1. **Admiral Bonuses**: Integrate admiral bonuses into combat calculations
2. **Combat Logs**: Enhance battle reports with more detailed wave-by-wave breakdowns
3. **Resource Caps**: Implement storage limits based on building levels
4. **Tool Crafting Speed**: Add productivity modifier to manufacturing queue processing

### 8.3 Performance
1. **Batch Updates**: Consider batching database updates in combat resolution
2. **Caching**: Cache planet rates if accessed frequently
3. **Queue Optimization**: Consider using a proper queue system (Redis) for high-traffic scenarios

---

## 9. Conclusion

I have a comprehensive understanding of:

✅ **Game Vision**: Sci-fi themed strategy game with 3-lane combat and resource management  
✅ **Database Schema**: Well-structured Prisma schema with clear relationships  
✅ **Public Order System**: Complex productivity modifier with square root formulas  
✅ **Economy System**: Lazy evaluation with queue-based recruitment/manufacturing  
✅ **Combat System**: Wave-based 3-lane combat with tool modifiers and surface invasion  

The codebase demonstrates solid architectural decisions (lazy evaluation, queue systems) and follows Goodgame Empire mechanics closely. The main areas for improvement are type safety, error handling, and extracting hardcoded values to configuration.

**I am ready to proceed with development tasks on this project.**


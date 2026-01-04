import prisma from '../lib/prisma';

// --- CONSTANTS & STATS ---

// Unit Stats: Melee/Ranged Attack & Defense
// Marine: Melee
// Ranger: Ranged
// Sentinel: Tank (High Def)
// Interceptor: Fast (High Impact)
const UNIT_STATS: Record<string, { meleeAtk: number; rangedAtk: number; meleeDef: number; rangedDef: number; capacity: number }> = {
  marine: { meleeAtk: 12, rangedAtk: 0, meleeDef: 12, rangedDef: 6, capacity: 10 },
  ranger: { meleeAtk: 4, rangedAtk: 14, meleeDef: 4, rangedDef: 10, capacity: 5 },
  sentinel: { meleeAtk: 6, rangedAtk: 2, meleeDef: 18, rangedDef: 18, capacity: 20 },
  interceptor: { meleeAtk: 16, rangedAtk: 0, meleeDef: 8, rangedDef: 8, capacity: 15 },
};

// Helper: Calculate total loot based on capacity and planet resources
function calculateLoot(survivingUnits: FlankUnits, planetResources: { carbon: number; titanium: number; food: number }) {
  let totalCapacity = 0;
  for (const [u, count] of Object.entries(survivingUnits)) {
    const caps = UNIT_STATS[u]?.capacity || 0;
    totalCapacity += caps * count;
  }

  const available = { ...planetResources };
  const totalAvailable = available.carbon + available.titanium + available.food;
  const loot = { carbon: 0, titanium: 0, food: 0 };

  if (totalAvailable === 0 || totalCapacity === 0) return loot;

  if (totalCapacity >= totalAvailable) {
    return available;
  }

  const ratio = totalCapacity / totalAvailable;
  loot.carbon = Math.floor(available.carbon * ratio);
  loot.titanium = Math.floor(available.titanium * ratio);
  loot.food = Math.floor(available.food * ratio);

  return loot;
}

// Defense Building Bonuses (per level)
const SHIELD_GENERATOR_BONUS = 50; // +50 Defense Power per level (Global or Front?) - Applies to Wall (Shield)
const PERIMETER_FIELD_BONUS = 30;  // +30 Defense Power per level? Or %? Let's use flat power for MVP stability.
const STARPORT_BONUS = 100;        // Starport (Gate) gives massive bonus to Center Sector.

// Tool Effects (Max Reductions)
const SHIELD_JAMMER_REDUCTION = 0.10; // Each jammer reduces Shield Bonus by 10%
const HANGAR_BREACH_REDUCTION = 0.15; // Each charge reduces Starport Bonus by 15%
const ECM_POD_REDUCTION = 0.05;       // Each pod reduces Ranged Defense Power by 5%
const FIELD_NEUTRALIZER_REDUCTION = 0; // Not fully defined yet, can be moat reduction.

// Interfaces
interface FlankUnits {
  [unitType: string]: number;
}

interface Wave {
  units: FlankUnits;
  tools: Record<string, number>;
}

interface WaveResult {
  waveIndex: number;
  attackerUnits: FlankUnits;
  defenderUnits: FlankUnits;
  tools: Record<string, number>;
  attackerLosses: FlankUnits;
  defenderLosses: FlankUnits;
  winner: 'attacker' | 'defender';
}

interface SectorResult {
  winner: 'attacker' | 'defender';
  survivingAttackers: FlankUnits;
  survivingDefenders: FlankUnits;
  survivingDefenderTools?: { type: string; count: number }[]; // NEW
  initialAttackerUnits: FlankUnits;
  initialDefenderUnits: FlankUnits;
  attackerToolsByWave: Record<string, number>[];
  waveResults: WaveResult[]; // NEW: Detailed breakdown per wave
  defenderTools: Record<string, number>;
  attackerLosses: FlankUnits;
  defenderLosses: FlankUnits;
  wavesFought: number;
}

interface CombatResult {
  winner: 'attacker' | 'defender';
  sectorResults: {
    left: SectorResult;
    center: SectorResult;
    right: SectorResult;
  };
  surfaceResult: {
    winner: 'attacker' | 'defender';
    attackerBonus: number;
    defenderBonus: number;
    initialAttackerUnits: FlankUnits; // NEW
    initialDefenderUnits: FlankUnits; // NEW
    attackerLosses: FlankUnits;
    defenderLosses: FlankUnits;
  } | null;
  attackerTotalLosses: FlankUnits;
  defenderTotalLosses: FlankUnits;
  resourcesJson: string | null;
}

// Stats aggregation helper
function getUnitStats(unitType: string) {
  return UNIT_STATS[unitType] || { meleeAtk: 5, rangedAtk: 5, meleeDef: 5, rangedDef: 5 };
}

/**
 * Resolve a single wave collision in a Sector
 */
// Export for testing
export function resolveWaveCollision(
  attackerUnits: FlankUnits,
  defenderUnits: FlankUnits,
  attackerTools: Record<string, number>,
  defenseBuildings: { shield: number; starport: number; perimeter: number },
  isCenter: boolean,
  defenderTools: Record<string, number> = {} // New argument for defender tools specifically
): {
  attackerWon: boolean;
  attackerLosses: FlankUnits;
  defenderLosses: FlankUnits;
  remainingAttackers: FlankUnits;
  remainingDefenders: FlankUnits;
} {
  // 1. Calculate Attacker Power
  let attMelee = 0;
  let attRanged = 0;

  for (const [u, count] of Object.entries(attackerUnits)) {
    const s = getUnitStats(u);
    attMelee += s.meleeAtk * count;
    attRanged += s.rangedAtk * count;
  }

  // ATTACKER TOOL MODIFIERS
  // Plasma Grenades (+Ranged Dmg?) -> Placeholder name? GGE uses specific tools.
  // We use: signal_jammer (vs Shield), breach_cutter (vs Gate), holo_decoy (vs Ranged)

  const totalAttackerPower = attMelee + attRanged;

  // 2. Calculate Defender Power
  let defMelee = 0;
  let defRanged = 0;

  for (const [u, count] of Object.entries(defenderUnits)) {
    const s = getUnitStats(u);
    defMelee += s.meleeDef * count;
    defRanged += s.rangedDef * count;
  }

  // DEFENDER TOOL MODIFIERS (Applied to Base Unit Stats directly? Or Composite?)
  // Targeting Array: Increases Ranged Defense Power
  if (defenderTools.targeting_array) {
    // GGE: Flaming Arrows (+25% Ranged Def)
    defRanged *= 1.25;
  }


  // --- WALL & GATE BONUSES (Shield & Starport) ---

  // Shield Generator (Wall)
  // Bonus: +50% per level (simplified to +50 power per level in constants, let's stick to power or switch to %?)
  // GGE: Wall gives % bonus to troops. E.g. +80% defense bonus.
  // Our code previously used flat power. Let's switch to Percentage Bonus for scaling proper GGE logic.
  // Current: const SHIELD_GENERATOR_BONUS = 50;
  // Let's define Base Wall Bonus: Level 1 = 20%, Level 2 = 40%...
  // For compatibility with previous code, let's calculate a "Base Bonus %" derived from buildings.shield.

  let wallBonusPct = defenseBuildings.shield * 0.20; // 20% per level
  let gateBonusPct = 0;
  if (isCenter) {
    gateBonusPct = defenseBuildings.starport * 0.35; // 35% per level
  }
  // Moat/Perimeter?
  let moatBonusPct = defenseBuildings.perimeter * 0.10;

  // --- DEFENDER TOOLS (Boosts) ---
  // Auto Turret: +25% Wall (Shield)
  if (defenderTools.auto_turret) {
    wallBonusPct += 0.25;
  }
  // Blast Door: +35% Gate (Starport)
  if (defenderTools.blast_door && isCenter) {
    gateBonusPct += 0.35;
  }
  // Swamp Snapper / Moat tool? Not implemented yet.

  // --- ATTACKER TOOLS (Reductions) ---
  // Signal Jammer: -10% Wall per tool
  if (attackerTools.signal_jammer) {
    const reduction = attackerTools.signal_jammer * 0.10;
    wallBonusPct = Math.max(0, wallBonusPct - reduction);
  }

  // Breach Cutter: -10% Gate per tool
  if (attackerTools.breach_cutter && isCenter) {
    const reduction = attackerTools.breach_cutter * 0.10;
    gateBonusPct = Math.max(0, gateBonusPct - reduction);
  }

  // Holo Decoy: Reduces Defender Ranged Strength (aka Shielding from Range?)
  // GGE: Mantlet reduces Enemy Ranged Strength (Bowmen).
  // Effectively reduces `defRanged`?
  if (attackerTools.holo_decoy) {
    // 10% per tool? Capped?
    // GGE: Cast iron mantlet = -15% arrow strength.
    // Holo Decoy = -10%. (10 tools = -100%).
    const reduction = Math.min(1.0, attackerTools.holo_decoy * 0.10);
    defRanged *= (1 - reduction);
  }

  // --- APPLY COMPOSITE DEFENSE ---
  // Defense Power = (MeleeDef + RangedDef) * (1 + WallBonus + GateBonus + MoatBonus + ...)
  // Note: Usually Wall applies to ALL units on wall.
  // We need to calculate Total Base Def first.

  let totalDefPower = 0;
  if (totalAttackerPower > 0) {
    const meleeRatio = attMelee / totalAttackerPower;
    const rangedRatio = attRanged / totalAttackerPower;
    // Weighted defense based on what's attacking
    totalDefPower = (defMelee * meleeRatio) + (defRanged * rangedRatio);
  } else {
    totalDefPower = 0.1;
  }

  const totalBonusPct = wallBonusPct + gateBonusPct + moatBonusPct;
  totalDefPower *= (1 + totalBonusPct);


  // 3. Resolve Winner
  const attackerWon = totalAttackerPower > totalDefPower;

  // 4. Calculate Casualties
  const totalPower = totalAttackerPower + totalDefPower;
  const casualtyRate = attackerWon
    ? (totalDefPower / totalPower) // Attacker losses
    : (totalAttackerPower / totalPower); // Defender losses

  const victoryDampener = 0.5;

  const attLossRate = attackerWon ? (casualtyRate * victoryDampener) : 1.0;
  const defLossRate = !attackerWon ? (casualtyRate * victoryDampener) : 1.0;

  const attLosses: FlankUnits = {};
  const remAtt: FlankUnits = {};
  for (const [u, count] of Object.entries(attackerUnits)) {
    const lost = Math.floor(count * attLossRate);
    attLosses[u] = lost;
    remAtt[u] = count - lost;
  }

  const defLosses: FlankUnits = {};
  const remDef: FlankUnits = {};
  for (const [u, count] of Object.entries(defenderUnits)) {
    const lost = Math.floor(count * defLossRate);
    defLosses[u] = lost;
    remDef[u] = count - lost;
  }

  return {
    attackerWon,
    attackerLosses: attLosses,
    defenderLosses: defLosses,
    remainingAttackers: remAtt,
    remainingDefenders: remDef,
  };
}

/**
 * Resolve a whole Sector (up to 4-6 waves)
 */
/**
 * Resolve a whole Sector (up to 4-6 waves)
 */
export function resolveSector(
  attackWaves: Wave[],
  initialDefenderLane: { units: FlankUnits, tools: { type: string, count: number }[] },
  defenseBuildings: { shield: number; starport: number; perimeter: number },
  isCenter: boolean
): SectorResult {

  // -- Calculate Initials --
  const initialAttackerUnits: FlankUnits = {};
  const attackerToolsByWave: Record<string, number>[] = [];

  for (const wave of attackWaves) {
    for (const [u, c] of Object.entries(wave.units)) {
      initialAttackerUnits[u] = (initialAttackerUnits[u] || 0) + c;
    }
    attackerToolsByWave.push({ ...wave.tools });
  }

  // Clone defender state
  let currentDefenders = { ...initialDefenderLane.units };
  // Clone defender tools (Deep copy array of objects)
  const currentDefenderTools = initialDefenderLane.tools ? initialDefenderLane.tools.map(t => ({ ...t })) : [];

  let totalAttackerLosses: FlankUnits = {};
  let totalDefenderLosses: FlankUnits = {};

  const waveResults: WaveResult[] = [];

  let winner: 'attacker' | 'defender' = 'defender';
  let survivingAttackers: FlankUnits = {};
  let wavesFought = 0;

  for (let i = 0; i < attackWaves.length; i++) {
    const wave = attackWaves[i];

    // Snapshot state before collision
    const defenderSnapshot = { ...currentDefenders }; // Units
    const defCount = Object.values(currentDefenders).reduce((a, b) => a + b, 0);

    // If defenders already wiped, just pass through (but log it if we want detailed "Unopposed Wave" logs)
    if (defCount <= 0) {
      winner = 'attacker';
      for (const [u, c] of Object.entries(wave.units)) {
        survivingAttackers[u] = (survivingAttackers[u] || 0) + c;
      }
      // We log this wave as "Unopposed"
      waveResults.push({
        waveIndex: i + 1,
        attackerUnits: { ...wave.units },
        defenderUnits: {},
        tools: { ...wave.tools },
        attackerLosses: {},
        defenderLosses: {},
        winner: 'attacker'
      });
      continue;
    }

    wavesFought++;

    // --- CALCULATE ACTIVE DEFENDER TOOLS FOR THIS WAVE ---
    // Rule: Each slot with count > 0 provides +1 Tool Power for this wave.
    // Rule: Decrement 1 from each active slot.
    const activeDefenderTools: Record<string, number> = {};

    currentDefenderTools.forEach(slot => {
      if (slot.count > 0) {
        activeDefenderTools[slot.type] = (activeDefenderTools[slot.type] || 0) + 1;
        slot.count--; // Consume tool
      }
    });

    const result = resolveWaveCollision(
      wave.units,
      currentDefenders,
      wave.tools, // Attacker Tools
      defenseBuildings,
      isCenter,
      activeDefenderTools // Defender Tools
    );

    // Record Wave Result
    waveResults.push({
      waveIndex: i + 1,
      attackerUnits: { ...wave.units },
      defenderUnits: defenderSnapshot, // What they faced
      tools: { ...wave.tools },
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
      winner: result.attackerWon ? 'attacker' : 'defender'
    });

    // Accumulate losses
    for (const [u, c] of Object.entries(result.attackerLosses)) {
      totalAttackerLosses[u] = (totalAttackerLosses[u] || 0) + c;
    }
    for (const [u, c] of Object.entries(result.defenderLosses)) {
      totalDefenderLosses[u] = (totalDefenderLosses[u] || 0) + c;
    }

    // Update state
    if (result.attackerWon) {
      currentDefenders = {};
      winner = 'attacker';
      for (const [u, c] of Object.entries(result.remainingAttackers)) {
        survivingAttackers[u] = (survivingAttackers[u] || 0) + c;
      }
    } else {
      currentDefenders = result.remainingDefenders;
    }
  }

  // If loop finishes and defenders still alive
  const defCountFinal = Object.values(currentDefenders).reduce((a, b) => a + b, 0);
  if (defCountFinal > 0) {
    winner = 'defender';
  }

  // Re-map currentDefenderTools (internal tracking) back to output format
  // currentDefenderTools has decremented counts
  const survivingDefenderTools = currentDefenderTools.filter(t => t.count > 0);

  return {
    winner,
    survivingAttackers,
    survivingDefenders: currentDefenders,
    survivingDefenderTools, // NEW
    initialAttackerUnits,
    initialDefenderUnits: { ...initialDefenderLane.units },
    attackerToolsByWave,
    waveResults,
    defenderTools: { ...defenseBuildings },
    attackerLosses: totalAttackerLosses,
    defenderLosses: totalDefenderLosses,
    wavesFought
  };
}


export async function resolveCombat(fleetId: string): Promise<CombatResult> {
  const fleet = await prisma.fleet.findUnique({
    where: { id: fleetId },
    include: {
      owner: { include: { admiral: true } },
      toPlanet: { include: { defenseLayout: true, owner: true } }
    }
  });

  if (!fleet || fleet.type !== 'attack' || fleet.status !== 'arrived') {
    throw new Error("Invalid fleet state");
  }

  // 1. Parsing Inputs
  let attStructure: { left: Wave[], front: Wave[], right: Wave[] } = { left: [], front: [], right: [] };

  try {
    const raw = JSON.parse(fleet.laneAssignmentsJson || '{}');
    const normalize = (input: any) => {
      if (Array.isArray(input)) return input;
      if (input && typeof input === 'object') return [{ units: input, tools: {} }];
      return [];
    };
    attStructure.left = normalize(raw.left);
    attStructure.front = normalize(raw.front);
    attStructure.right = normalize(raw.right);
  } catch (e) {
    console.error("Error parsing fleet assignments", e);
  }

  const defenseLayout = fleet.toPlanet.defenseLayout;

  // Helper to parse/normalize Defender Lane JSON
  const parseDefLane = (json: string | null): { units: FlankUnits, tools: { type: string, count: number }[] } => {
    if (!json) return { units: {}, tools: [] };
    try {
      const data = JSON.parse(json);
      // New format: { units: {...}, tools: [...] }
      if (data.units || data.tools) {
        return {
          units: data.units || {},
          tools: Array.isArray(data.tools) ? data.tools : []
        };
      }
      // Legacy format: { marine: 10, ... } (Just units)
      return { units: data, tools: [] };
    } catch {
      return { units: {}, tools: [] };
    }
  };

  const defLeft = parseDefLane(defenseLayout?.leftLaneJson || null);
  const defCenter = parseDefLane(defenseLayout?.frontLaneJson || null);
  const defRight = parseDefLane(defenseLayout?.rightLaneJson || null);

  const buildings = {
    shield: fleet.toPlanet.defensiveGridLevel,
    starport: fleet.toPlanet.starportLevel,
    perimeter: fleet.toPlanet.perimeterFieldLevel
  };

  // 2. Resolve Sectors
  const leftResult = resolveSector(attStructure.left, defLeft, buildings, false);
  const centerResult = resolveSector(attStructure.front, defCenter, buildings, true);
  const rightResult = resolveSector(attStructure.right, defRight, buildings, false);

  // 3. Surface Invasion Logic
  let attackerSectorsWon = 0;
  if (leftResult.winner === 'attacker') attackerSectorsWon++;
  if (centerResult.winner === 'attacker') attackerSectorsWon++;
  if (rightResult.winner === 'attacker') attackerSectorsWon++;

  let attBonus = 0;
  let defBonus = 0;

  if (attackerSectorsWon === 3) attBonus = 0.30;
  else if (attackerSectorsWon === 1) defBonus = 0.30;

  const surfAtt: FlankUnits = {};
  const addUnits = (target: FlankUnits, source: FlankUnits) => {
    for (const [u, c] of Object.entries(source)) {
      target[u] = (target[u] || 0) + c;
    }
  };

  addUnits(surfAtt, leftResult.survivingAttackers);
  addUnits(surfAtt, centerResult.survivingAttackers);
  addUnits(surfAtt, rightResult.survivingAttackers);

  // Courtyard Defense (Empty)
  const surfDef: FlankUnits = {};

  let surfaceResult = null;
  if (attackerSectorsWon > 0) {
    // Check if attacker has units to fight with
    const attCount = Object.values(surfAtt).reduce((a, b) => a + b, 0);
    const defCount = Object.values(surfDef).reduce((a, b) => a + b, 0);

    let attackerWonSurface = false;
    let attLosses: FlankUnits = {};
    let defLosses: FlankUnits = {};

    if (attCount > 0) {
      if (defCount === 0) {
        attackerWonSurface = true;
      } else {
        const finalBat = resolveWaveCollision(
          surfAtt,
          surfDef,
          {},
          { shield: 0, starport: 0, perimeter: 0 },
          false
        );
        attackerWonSurface = finalBat.attackerWon;
        attLosses = finalBat.attackerLosses;
        defLosses = finalBat.defenderLosses;
      }
    }

    surfaceResult = {
      winner: attackerWonSurface ? 'attacker' : 'defender',
      attackerBonus: attBonus,
      defenderBonus: defBonus,
      initialAttackerUnits: { ...surfAtt },
      initialDefenderUnits: { ...surfDef },
      attackerLosses: attLosses,
      defenderLosses: defLosses
    } as const;
  }

  const finalWinner = (surfaceResult && surfaceResult.winner === 'attacker') ? 'attacker' : 'defender';

  // 4. Loot & Losses Aggregation
  const totalAttLosses: FlankUnits = {};
  const totalDefLosses: FlankUnits = {};
  const survivingUnitsFinal: FlankUnits = {};

  const agg = (target: FlankUnits, source: FlankUnits) => {
    for (const [u, c] of Object.entries(source)) target[u] = (target[u] || 0) + c;
  };

  agg(totalAttLosses, leftResult.attackerLosses);
  agg(totalAttLosses, centerResult.attackerLosses);
  agg(totalAttLosses, rightResult.attackerLosses);
  if (surfaceResult) agg(totalAttLosses, surfaceResult.attackerLosses);

  agg(totalDefLosses, leftResult.defenderLosses);
  agg(totalDefLosses, centerResult.defenderLosses);
  agg(totalDefLosses, rightResult.defenderLosses);
  if (surfaceResult) agg(totalDefLosses, surfaceResult.defenderLosses);

  // Loot
  let lootJson = null;
  if (finalWinner === 'attacker') {
    // Determine survivors
    if (surfaceResult) {
      for (const [u, c] of Object.entries(surfaceResult.initialAttackerUnits)) {
        const loss = surfaceResult.attackerLosses[u] || 0;
        survivingUnitsFinal[u] = Math.max(0, c - loss);
      }
    }
    const rawLoot = calculateLoot(survivingUnitsFinal, {
      carbon: fleet.toPlanet.carbon,
      titanium: fleet.toPlanet.titanium,
      food: fleet.toPlanet.food
    });
    lootJson = JSON.stringify(rawLoot);
  }

  // --- PERSIST DEFENDER LOSSES & TOOL CONSUMPTION ---
  if (defenseLayout) {
    const updateLaneData = (result: SectorResult) => {
      return {
        units: result.survivingDefenders,
        tools: result.survivingDefenderTools || []
      };
    };

    const newLeft = updateLaneData(leftResult);
    const newCenter = updateLaneData(centerResult);
    const newRight = updateLaneData(rightResult);

    await prisma.defenseLayout.update({
      where: { id: defenseLayout.id },
      data: {
        leftLaneJson: JSON.stringify(newLeft),
        frontLaneJson: JSON.stringify(newCenter),
        rightLaneJson: JSON.stringify(newRight)
      }
    });

    // Also, we must update `PlanetUnit` counts? 
    // Currently `defenseLayout` is just a plan. The ACTUAL units are in `PlanetUnit` table.
    // In `defense.ts` route, we validate assignments against `PlanetUnit`.
    // If units die in combat, we MUST decrement `PlanetUnit`.
    // IF the defender Logic uses `PlanetUnit` as "Available Pool" and `DefenseLayout` as "Assigned", then deaths in layout must reflect in Inventory.

    // For Tools: `ToolInventory` table exists. We must decrement it.
    // Logic: Calculate delta (Used Tools) and decrement.
    // Or, simpler: Update `DefenseLayout` (Plan) AND `ToolInventory` (Stock).
    // Wait, if tools are IN the wall, are they deducted from Inventory? 
    // GGE: Yes. You assign them. They are "on the wall".
    // If they are consumed, they are gone.
    // If they survive, they stay on the wall.

    // ISSUE: The `ToolInventory` was likely checked during assignment but NOT deducted?
    // Actually, usually in GGE, assignment moves items from "Keep" to "Wall".
    // My system currently splits them? 
    // `validateToolsAvailable` checks `ToolInventory`.
    // If I simply update `DefenseLayout`, the user "loses" them from the wall.
    // But `ToolInventory` might still show them if they weren't deducted on assignment.
    // Let's assume for now `ToolInventory` is the "Unassigned" pool? 
    // Or `ToolInventory` is ALL tools?
    // Recommendation: `ToolInventory` = Global count. `DefenseLayout` = Allocation.
    // Updates to `DefenseLayout` means tools are gone from wall.
    // We MUST also decrement `ToolInventory` by the amount consumed.

    const calcConsumed = (initial: { type: string, count: number }[], final: { type: string, count: number }[]) => {
      const consumed: Record<string, number> = {};
      const finalMap = new Map(final.map(t => [t.type, t.count]));

      initial.forEach(t => {
        const endCount = finalMap.get(t.type) || 0;
        const diff = t.count - endCount;
        if (diff > 0) consumed[t.type] = (consumed[t.type] || 0) + diff;
      });
      return consumed;
    };

    const consumedLeft = calcConsumed(defLeft.tools, newLeft.tools);
    const consumedCenter = calcConsumed(defCenter.tools, newCenter.tools);
    const consumedRight = calcConsumed(defRight.tools, newRight.tools);

    // Merge
    const totalConsumedTools: Record<string, number> = {};
    [consumedLeft, consumedCenter, consumedRight].forEach(c => {
      for (const [t, n] of Object.entries(c)) totalConsumedTools[t] = (totalConsumedTools[t] || 0) + n;
    });

    if (Object.keys(totalConsumedTools).length > 0) {
      // Circular dependency? `deductTools` is in `fleetService`. 
      // `fleetService` imports `combatService`. 
      // We might need to copy/move `deductTools` or use prisma directly.
      for (const [t, n] of Object.entries(totalConsumedTools)) {
        // Safe decrement
        await prisma.toolInventory.updateMany({
          where: { planetId: fleet.toPlanetId, toolType: t },
          data: { count: { decrement: n } }
        });
      }
    }
  }

  // Deduct Unit Losses from PlanetUnit (Defender)
  // This is CRITICAL.
  if (Object.keys(totalDefLosses).length > 0) {
    for (const [u, n] of Object.entries(totalDefLosses)) {
      await prisma.planetUnit.updateMany({
        where: { planetId: fleet.toPlanetId, unitType: u },
        data: { count: { decrement: n } }
      });
    }
  }

  return {
    winner: finalWinner,
    sectorResults: {
      left: leftResult,
      center: centerResult,
      right: rightResult
    },
    surfaceResult,
    attackerTotalLosses: totalAttLosses,
    defenderTotalLosses: totalDefLosses,
    resourcesJson: lootJson
  };
}

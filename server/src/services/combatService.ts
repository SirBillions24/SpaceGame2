import prisma from '../lib/prisma';

import { UNIT_DATA } from '../constants/unitData';
import { TOOL_DATA, getToolStats } from '../constants/toolData';
import { BUILDING_DATA, getBuildingStats } from '../constants/buildingData';
import { FACTION_TRIANGLE, COMBAT_MODIFIERS, DEFENSE_BONUSES, Faction } from '../constants/combatBalanceData';

// --- CONSTANTS & STATS ---

// Stats aggregation helper
function getUnitStats(unitType: string) {
  return UNIT_DATA[unitType] || { meleeAtk: 5, rangedAtk: 5, meleeDef: 5, rangedDef: 5, capacity: 5 };
}

// Helper: Calculate total loot based on capacity and planet resources
function calculateLoot(survivingUnits: FlankUnits, planetResources: { carbon: number; titanium: number; food: number }) {
  let totalCapacity = 0;
  for (const [u, count] of Object.entries(survivingUnits)) {
    const s = getUnitStats(u);
    const caps = s?.capacity || 0;
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

// NOTE: Legacy constants removed - all values now come from:
// - combatBalanceData.ts (faction bonuses, victory dampener, surface bonuses)
// - buildingData.ts (defense building bonuses)
// - toolData.ts (tool reduction values)

/**
 * Calculate the weighted faction multiplier for a force attacking another force.
 * Faction Triangle: Human > Mech > Exo > Human
 * Bonus is weighted by faction distribution on both sides.
 */
function calculateTriangleMultiplier(sourceUnits: FlankUnits, targetUnits: FlankUnits): number {
  const ADVANTAGES = FACTION_TRIANGLE.advantages;
  const BONUS = FACTION_TRIANGLE.bonus;

  let totalSourceCount = 0;
  const sourceFactionDistribution: Record<Faction, number> = { human: 0, mech: 0, exo: 0 };
  for (const [u, count] of Object.entries(sourceUnits)) {
    const stats = UNIT_DATA[u];
    if (!stats) continue;
    sourceFactionDistribution[stats.unitFaction] += count;
    totalSourceCount += count;
  }

  let totalTargetCount = 0;
  const targetFactionDistribution: Record<Faction, number> = { human: 0, mech: 0, exo: 0 };
  for (const [u, count] of Object.entries(targetUnits)) {
    const stats = UNIT_DATA[u];
    if (!stats) continue;
    targetFactionDistribution[stats.unitFaction] += count;
    totalTargetCount += count;
  }

  if (totalSourceCount === 0 || totalTargetCount === 0) return 1.0;

  let weightedBonus = 0;
  for (const faction of ['human', 'mech', 'exo'] as Faction[]) {
    const advantageOver = ADVANTAGES[faction] as Faction;
    const sourceCount = sourceFactionDistribution[faction];
    const targetWeakCount = targetFactionDistribution[advantageOver] || 0;

    const sourceWeight = sourceCount / totalSourceCount;
    const targetWeight = targetWeakCount / totalTargetCount;

    weightedBonus += (sourceWeight * targetWeight * BONUS);
  }

  return 1.0 + weightedBonus;
}

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
  attackerTriangleBonus?: number;
  defenderTriangleBonus?: number;
}

interface SectorResult {
  winner: 'attacker' | 'defender';
  survivingAttackers: FlankUnits;
  survivingDefenders: FlankUnits;
  survivingDefenderTools?: { type: string; count: number }[];
  initialAttackerUnits: FlankUnits;
  initialDefenderUnits: FlankUnits;
  attackerToolsByWave: Record<string, number>[];
  waveResults: WaveResult[];
  defenderTools: Record<string, number>; // Used for storing the tool counts for UI
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
  // Admiral information (attack bonuses only)
  attackerAdmiral?: {
    id: string;
    name: string;
    meleeStrengthBonus: number;
    rangedStrengthBonus: number;
    canopyReductionBonus: number;
  } | null;
  defenderAdmiral?: {
    id: string;
    name: string;
    meleeStrengthBonus: number;
    rangedStrengthBonus: number;
    canopyReductionBonus: number;
    isStationed: boolean;
  } | null;
}

/**
 * Resolve a single wave collision in a Sector
 */
// Export for testing
export function resolveWaveCollision(
  attackerUnits: FlankUnits,
  defenderUnits: FlankUnits,
  attackerTools: Record<string, number>,
  defenseLevels: { canopy: number; hub: number; minefield: number },
  isCenter: boolean,
  defenderTools: Record<string, number> = {}, // New argument for defender tools specifically
  attackerBonuses: { meleeStrengthBonus: number; rangedStrengthBonus: number; canopyReductionBonus: number } = { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 },
  defenderBonuses: { meleeStrengthBonus: number; rangedStrengthBonus: number; canopyReductionBonus: number } = { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 }
): {
  attackerWon: boolean;
  attackerLosses: FlankUnits;
  defenderLosses: FlankUnits;
  remainingAttackers: FlankUnits;
  remainingDefenders: FlankUnits;
  attackerTriangleBonus?: number;
  defenderTriangleBonus?: number;
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
  // We use: invasion_anchors (vs Canopy), plasma_breachers (vs Hub), stealth_field_pods (vs Ranged)

  // Apply Admiral Attack Bonuses (separate for melee and ranged)
  const meleeMultiplier = 1 + (attackerBonuses.meleeStrengthBonus / 100);
  const rangedMultiplier = 1 + (attackerBonuses.rangedStrengthBonus / 100);
  attMelee *= meleeMultiplier;
  attRanged *= rangedMultiplier;

  const totalAttackerPowerBase = attMelee + attRanged;
  const attTriangleMult = calculateTriangleMultiplier(attackerUnits, defenderUnits);
  const totalAttackerPower = totalAttackerPowerBase * attTriangleMult;

  // 2. Calculate Defender Power
  let defMelee = 0;
  let defRanged = 0;

  for (const [u, count] of Object.entries(defenderUnits)) {
    const s = getUnitStats(u);
    defMelee += s.meleeDef * count;
    defRanged += s.rangedDef * count;
  }

  // --- APPLY DEFENDER ADMIRAL BONUSES ---
  const defMeleeMultiplier = 1 + (defenderBonuses.meleeStrengthBonus / 100);
  const defRangedMultiplier = 1 + (defenderBonuses.rangedStrengthBonus / 100);
  defMelee *= defMeleeMultiplier;
  defRanged *= defRangedMultiplier;

  // --- CANOPY & HUB BONUSES (Energy Canopy & Docking Hub) ---
  let canopyBonusPct = 0;
  const canopyStats = getBuildingStats('canopy_generator', defenseLevels.canopy);
  if (canopyStats) {
    canopyBonusPct = canopyStats.defenseBonus || 0;
  }

  let hubBonusPct = 0;
  if (isCenter) {
    // Docking Hub bonus - 35% per level
    hubBonusPct = defenseLevels.hub * 0.35;
  }

  // Orbital Minefield/Perimeter
  let minefieldBonusPct = defenseLevels.minefield * 0.10;

  // --- DEFENDER TOOLS (Boosts) ---
  for (const [tId, count] of Object.entries(defenderTools)) {
    const s = getToolStats(tId);
    if (!s || count <= 0) continue;
    if (s.bonusType === 'canopy') canopyBonusPct += (s.bonusValue * count);
    if (s.bonusType === 'hub' && isCenter) hubBonusPct += (s.bonusValue * count);
    if (s.bonusType === 'ranged_def') defRanged *= (1 + (s.bonusValue * count));
  }

  // --- ATTACKER TOOLS (Reductions) ---
  for (const [tId, count] of Object.entries(attackerTools)) {
    const s = getToolStats(tId);
    if (!s || count <= 0) continue;
    if (s.bonusType === 'canopy_reduction') canopyBonusPct = Math.max(0, canopyBonusPct - (s.bonusValue * count));
    if (s.bonusType === 'hub_reduction' && isCenter) hubBonusPct = Math.max(0, hubBonusPct - (s.bonusValue * count));
    if (s.bonusType === 'ranged_reduction') {
      const reduction = Math.min(1.0, s.bonusValue * count);
      defRanged *= (1 - reduction);
    }
  }

  // --- APPLY ADMIRAL CANOPY REDUCTION BONUS ---
  // Apply canopy reduction from admiral gear (capped at -100%)
  const canopyReduction = attackerBonuses.canopyReductionBonus / 100; // Negative value (e.g., -0.5 for -50%)
  canopyBonusPct = Math.max(0, canopyBonusPct + canopyReduction); // Add negative = subtract

  // --- APPLY COMPOSITE DEFENSE ---
  // Defense Power = (MeleeDef + RangedDef) * (1 + CanopyBonus + HubBonus + MinefieldBonus + ...)
  // Note: Usually Canopy applies to ALL units on canopy.
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

  const totalBonusPct = canopyBonusPct + hubBonusPct + minefieldBonusPct;
  totalDefPower *= (1 + totalBonusPct);

  // Apply Defender Triangle Multiplier (Defender is counter-striking Attacker)
  const defTriangleMult = calculateTriangleMultiplier(defenderUnits, attackerUnits);
  totalDefPower *= defTriangleMult;

  // 3. Resolve Winner
  const attackerWon = totalAttackerPower > totalDefPower;

  // 4. Calculate Casualties
  const totalPower = totalAttackerPower + totalDefPower;
  const casualtyRate = attackerWon
    ? (totalDefPower / totalPower) // Attacker losses
    : (totalAttackerPower / totalPower); // Defender losses

  const victoryDampener = COMBAT_MODIFIERS.victoryDampener;

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
    attackerTriangleBonus: attTriangleMult,
    defenderTriangleBonus: defTriangleMult
  };
}

/**
 * Resolve a whole Sector (up to 4-6 waves)
 */
export function resolveSector(
  attackWaves: Wave[],
  initialDefenderLane: { units: FlankUnits, tools: { type: string, count: number }[] },
  defenseLevels: { canopy: number; hub: number; minefield: number },
  isCenter: boolean,
  attackerBonuses: { meleeStrengthBonus: number; rangedStrengthBonus: number; canopyReductionBonus: number } = { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 },
  defenderBonuses: { meleeStrengthBonus: number; rangedStrengthBonus: number; canopyReductionBonus: number } = { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 }
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

  // Track initial defender tools for the report UI
  const initialDefenderTools: Record<string, number> = {};
  if (initialDefenderLane.tools) {
    initialDefenderLane.tools.forEach(t => {
      initialDefenderTools[t.type] = (initialDefenderTools[t.type] || 0) + t.count;
    });
  }

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
      const attCount = Object.values(wave.units).reduce((a, b) => a + b, 0);
      if (attCount > 0) {
        winner = 'attacker';
      }
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
      defenseLevels,
      isCenter,
      activeDefenderTools, // Defender Tools
      attackerBonuses, // Attacker Admiral Bonuses
      defenderBonuses // Defender Admiral Bonuses (not used for attack)
    );

    // Record Wave Result
    waveResults.push({
      waveIndex: i + 1,
      attackerUnits: { ...wave.units },
      defenderUnits: defenderSnapshot, // What they faced
      tools: { ...wave.tools },
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
      winner: result.attackerWon ? 'attacker' : 'defender',
      attackerTriangleBonus: result.attackerTriangleBonus,
      defenderTriangleBonus: result.defenderTriangleBonus
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

  // If loop finishes and defenders still alive OR no attackers ever sent
  const defCountFinal = Object.values(currentDefenders).reduce((a, b) => a + b, 0);
  const attCountInitial = Object.values(initialAttackerUnits).reduce((a, b) => a + b, 0);

  if (defCountFinal > 0 || attCountInitial <= 0) {
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
    defenderTools: initialDefenderTools,
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
      admiral: true, // Fleet's assigned admiral
      toPlanet: { include: { defenseLayout: true, owner: { include: { admiral: true } } } }
    }
  });

  if (!fleet || fleet.type !== 'attack' || fleet.status !== 'arrived') {
    throw new Error("Invalid fleet state");
  }

  // Get admiral bonuses (attack bonuses only - MUST be explicitly assigned to the fleet)
  const attackerAdmiral = fleet.admiral;
  const attackerBonuses = attackerAdmiral ? {
    meleeStrengthBonus: (attackerAdmiral as any).meleeStrengthBonus || 0,
    rangedStrengthBonus: (attackerAdmiral as any).rangedStrengthBonus || 0,
    canopyReductionBonus: (attackerAdmiral as any).canopyReductionBonus || 0,
  } : {
    meleeStrengthBonus: 0,
    rangedStrengthBonus: 0,
    canopyReductionBonus: 0,
  };

  // Defender admiral
  const defenderAdmiral = fleet.toPlanet.owner.admiral;
  const isDefenderAdmiralStationed = defenderAdmiral && (defenderAdmiral as any).stationedPlanetId === fleet.toPlanetId;

  const defenderBonuses = (defenderAdmiral && isDefenderAdmiralStationed) ? {
    meleeStrengthBonus: (defenderAdmiral as any).meleeStrengthBonus || 0,
    rangedStrengthBonus: (defenderAdmiral as any).rangedStrengthBonus || 0,
    canopyReductionBonus: (defenderAdmiral as any).canopyReductionBonus || 0,
  } : {
    meleeStrengthBonus: 0,
    rangedStrengthBonus: 0,
    canopyReductionBonus: 0,
  };

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

  const defenseLevels = {
    canopy: fleet.toPlanet.energyCanopyLevel,
    hub: fleet.toPlanet.dockingHubLevel,
    minefield: fleet.toPlanet.orbitalMinefieldLevel
  };

  // --- COURTYARD PREP & LANE CAPPING ---
  // We need to ensure lane assignments don't exceed actual units on the planet
  const allPlanetUnits = await prisma.planetUnit.findMany({
    where: { planetId: fleet.toPlanetId }
  });

  const availablePool: Record<string, number> = {};
  allPlanetUnits.forEach(pu => availablePool[pu.unitType] = pu.count);

  const capLane = (lane: { units: FlankUnits, tools: { type: string, count: number }[] }) => {
    const cappedUnits: FlankUnits = {};
    for (const [unitType, count] of Object.entries(lane.units)) {
      const available = availablePool[unitType] || 0;
      const actual = Math.min(available, count);
      if (actual > 0) {
        cappedUnits[unitType] = actual;
        availablePool[unitType] -= actual;
      }
    }
    lane.units = cappedUnits;
  };

  // Order of priority: Center, then Left, then Right? Or just as defined.
  capLane(defCenter);
  capLane(defLeft);
  capLane(defRight);

  // Remaining units in pool go to the initial courtyard force
  const initialCourtyardDefenders: FlankUnits = { ...availablePool };

  // 2. Resolve Sectors (pass attacker and defender bonuses)
  const leftResult = resolveSector(attStructure.left, defLeft, defenseLevels, false, attackerBonuses, defenderBonuses);
  const centerResult = resolveSector(attStructure.front, defCenter, defenseLevels, true, attackerBonuses, defenderBonuses);
  const rightResult = resolveSector(attStructure.right, defRight, defenseLevels, false, attackerBonuses, defenderBonuses);

  // 3. Courtyard Invasion Logic
  let attackerSectorsWon = 0;

  // A lane is only breached if the attacker won AND actually sent units there.
  const checkBreach = (result: SectorResult, waves: Wave[]) => {
    if (result.winner !== 'attacker') return false;
    const sentUnits = waves.reduce((sum, wave) => sum + Object.values(wave.units).reduce((a, b) => a + b, 0), 0);
    return sentUnits > 0;
  };

  if (checkBreach(leftResult, attStructure.left)) attackerSectorsWon++;
  if (checkBreach(centerResult, attStructure.front)) attackerSectorsWon++;
  if (checkBreach(rightResult, attStructure.right)) attackerSectorsWon++;

  let attBonus = 0;
  let defBonus = 0;

  // Bonus/Penalty Logic (values from combatBalanceData.ts)
  if (attackerSectorsWon === 3) attBonus = COMBAT_MODIFIERS.surface.attackerAllSectorsBonus;
  else if (attackerSectorsWon === 0) defBonus = COMBAT_MODIFIERS.surface.defenderAllSectorsBonus;
  else if (attackerSectorsWon === 1) defBonus = COMBAT_MODIFIERS.surface.defenderTwoSectorsBonus;

  const surfAtt: FlankUnits = {};
  const addUnits = (target: FlankUnits, source: FlankUnits) => {
    for (const [u, c] of Object.entries(source)) {
      target[u] = (target[u] || 0) + c;
    }
  };

  addUnits(surfAtt, leftResult.survivingAttackers);
  addUnits(surfAtt, centerResult.survivingAttackers);
  addUnits(surfAtt, rightResult.survivingAttackers);

  // Combine initial courtyard defenders with lane survivors
  const finalCourtyardDefenders: FlankUnits = { ...initialCourtyardDefenders };
  addUnits(finalCourtyardDefenders, leftResult.survivingDefenders);
  addUnits(finalCourtyardDefenders, centerResult.survivingDefenders);
  addUnits(finalCourtyardDefenders, rightResult.survivingDefenders);

  // Courtyard Battle
  let attackerWonSurface = false;
  let attLosses: FlankUnits = {};
  let defLosses: FlankUnits = {};

  const attCount = Object.values(surfAtt).reduce((a, b) => a + b, 0);
  const defCount = Object.values(finalCourtyardDefenders).reduce((a, b) => a + b, 0);

  if (attCount > 0) {
    if (defCount === 0) {
      attackerWonSurface = true;
    } else {
      // Apply bonuses to stats for the courtyard fight
      const finalBat = resolveWaveCollision(
        surfAtt,
        finalCourtyardDefenders,
        {}, // No tools in courtyard
        { canopy: 0, hub: 0, minefield: 0 }, // No walls in courtyard
        false,
        {},
        {
          meleeStrengthBonus: attackerBonuses.meleeStrengthBonus + (attBonus * 100),
          rangedStrengthBonus: attackerBonuses.rangedStrengthBonus + (attBonus * 100),
          canopyReductionBonus: 0
        },
        {
          meleeStrengthBonus: (defBonus * 100) + defenderBonuses.meleeStrengthBonus,
          rangedStrengthBonus: (defBonus * 100) + defenderBonuses.rangedStrengthBonus,
          canopyReductionBonus: 0
        }
      );
      attackerWonSurface = finalBat.attackerWon;
      attLosses = finalBat.attackerLosses;
      defLosses = finalBat.defenderLosses;
    }
  }

  const surfaceResult: {
    winner: 'attacker' | 'defender';
    attackerBonus: number;
    defenderBonus: number;
    initialAttackerUnits: FlankUnits;
    initialDefenderUnits: FlankUnits;
    attackerLosses: FlankUnits;
    defenderLosses: FlankUnits;
  } = {
    winner: attackerWonSurface ? 'attacker' : 'defender',
    attackerBonus: attBonus,
    defenderBonus: defBonus,
    initialAttackerUnits: { ...surfAtt },
    initialDefenderUnits: { ...finalCourtyardDefenders },
    attackerLosses: attLosses,
    defenderLosses: defLosses
  };

  const finalWinner = (surfaceResult.winner === 'attacker') ? 'attacker' : 'defender';

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
      for (const [toolType, consumedCount] of Object.entries(totalConsumedTools)) {
        const currentTool = await prisma.toolInventory.findUnique({
          where: { planetId_toolType: { planetId: fleet.toPlanetId, toolType } }
        });
        if (currentTool) {
          const newCount = Math.max(0, currentTool.count - (consumedCount as number));
          await prisma.toolInventory.update({
            where: { id: currentTool.id },
            data: { count: newCount }
          });
        }
      }
    }
  }

  // Deduct Unit Losses from PlanetUnit (Defender)
  // Ensure we don't go into negative numbers
  if (Object.keys(totalDefLosses).length > 0) {
    for (const [unitType, lossCount] of Object.entries(totalDefLosses)) {
      const currentUnit = await prisma.planetUnit.findUnique({
        where: { planetId_unitType: { planetId: fleet.toPlanetId, unitType } }
      });

      if (currentUnit) {
        const newCount = Math.max(0, currentUnit.count - (lossCount as number));
        await prisma.planetUnit.update({
          where: { id: currentUnit.id },
          data: { count: newCount }
        });
      }
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
    resourcesJson: lootJson,
    // Include admiral information in combat result
    attackerAdmiral: attackerAdmiral ? {
      id: attackerAdmiral.id,
      name: attackerAdmiral.name,
      meleeStrengthBonus: (attackerAdmiral as any).meleeStrengthBonus || 0,
      rangedStrengthBonus: (attackerAdmiral as any).rangedStrengthBonus || 0,
      canopyReductionBonus: (attackerAdmiral as any).canopyReductionBonus || 0,
    } : null,
    defenderAdmiral: defenderAdmiral ? {
      id: defenderAdmiral.id,
      name: defenderAdmiral.name,
      meleeStrengthBonus: (defenderAdmiral as any).meleeStrengthBonus || 0,
      rangedStrengthBonus: (defenderAdmiral as any).rangedStrengthBonus || 0,
      canopyReductionBonus: (defenderAdmiral as any).canopyReductionBonus || 0,
      isStationed: isDefenderAdmiralStationed || false,
    } : null
  };
}


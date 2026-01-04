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
  tools: Record<string, number>,
  defenseBuildings: { shield: number; starport: number; perimeter: number },
  isCenter: boolean
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

  // Tool Modifiers
  // Plasma Grenades (+Ranged Dmg?)
  if (tools.plasmaGrenade) {
    attRanged *= (1 + (tools.plasmaGrenade * 0.05)); // 5% per grenade?
  }

  const totalAttackerPower = attMelee + attRanged;

  // 2. Calculate Defender Power
  let defMelee = 0;
  let defRanged = 0;

  for (const [u, count] of Object.entries(defenderUnits)) {
    const s = getUnitStats(u);
    // Defenders use stats relevant to what is hitting them?
    // GGE Logic: Defense is composite.
    // We calculate "Melee Defense" and "Ranged Defense" pools.
    defMelee += s.meleeDef * count;
    defRanged += s.rangedDef * count;
  }

  // Apply Defense Tool/Building Bonuses

  // Shield Generator (Wall)
  let shieldBonus = defenseBuildings.shield * SHIELD_GENERATOR_BONUS;
  if (tools.shieldJammer) {
    const reduction = Math.min(1.0, tools.shieldJammer * SHIELD_JAMMER_REDUCTION);
    shieldBonus *= (1 - reduction);
  }

  // Starport (Gate) - Center only
  let starportBonus = 0;
  if (isCenter) {
    starportBonus = defenseBuildings.starport * STARPORT_BONUS;
    if (tools.hangarBreach) {
      const reduction = Math.min(1.0, tools.hangarBreach * HANGAR_BREACH_REDUCTION);
      starportBonus *= (1 - reduction);
    }
  }

  // Auto Turrets (Add raw defense)
  let turretBonus = (tools.autoTurret || 0) * 20; // +20 per turret

  // ECM Pods (Reduce Defender Ranged Power)
  if (tools.ecmPod) {
    const reduction = Math.min(1.0, tools.ecmPod * ECM_POD_REDUCTION);
    defRanged *= (1 - reduction);
  }

  // Total Defense Calculation
  // In GGE, Melee units attack melee defense, Ranged attack ranged defense.
  // We need the RATIO of attacker damage types.

  let totalDefPower = 0;
  if (totalAttackerPower > 0) {
    const meleeRatio = attMelee / totalAttackerPower;
    const rangedRatio = attRanged / totalAttackerPower;

    totalDefPower = (defMelee * meleeRatio) + (defRanged * rangedRatio);
  } else {
    totalDefPower = 0.1; // Minimal logic to avoid div by 0
  }

  // Add Bonuses
  totalDefPower += shieldBonus + starportBonus + turretBonus;

  // 3. Resolve Winner
  const attackerWon = totalAttackerPower > totalDefPower;

  // 4. Calculate Casualties
  // Loser is wiped out (or takes massive casualties). Winner takes proportional casualties.

  const totalPower = totalAttackerPower + totalDefPower;
  const casualtyRate = attackerWon
    ? (totalDefPower / totalPower) // Attacker losses
    : (totalAttackerPower / totalPower); // Defender losses

  // Winner usually takes less damage in GGE, but linear for now.
  // Actually, standard GGE:
  // If Attacker Power = 200, Defender = 100. Attacker wins.
  // Attacker loses 100/200 = 50%? No, that's high.
  // Let's use a "Victory Dampener".

  const victoryDampener = 0.5; // Winner takes 50% of calculated stress.

  const attLossRate = attackerWon ? (casualtyRate * victoryDampener) : 1.0; // Loser dies
  const defLossRate = !attackerWon ? (casualtyRate * victoryDampener) : 1.0; // Loser dies

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
export function resolveSector(
  attackWaves: Wave[],
  initialDefenders: FlankUnits,
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

  let currentDefenders = { ...initialDefenders };
  let totalAttackerLosses: FlankUnits = {};
  let totalDefenderLosses: FlankUnits = {};

  const waveResults: WaveResult[] = [];

  let winner: 'attacker' | 'defender' = 'defender';
  let survivingAttackers: FlankUnits = {};
  let wavesFought = 0;

  for (let i = 0; i < attackWaves.length; i++) {
    const wave = attackWaves[i];

    // Snapshot state before collision
    const defenderSnapshot = { ...currentDefenders };
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

    const result = resolveWaveCollision(
      wave.units,
      currentDefenders,
      wave.tools,
      defenseBuildings,
      isCenter
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

  return {
    winner,
    survivingAttackers,
    survivingDefenders: currentDefenders,
    initialAttackerUnits,
    initialDefenderUnits: { ...initialDefenders },
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
  const defLeft = defenseLayout ? JSON.parse(defenseLayout.leftLaneJson) : {};
  const defCenter = defenseLayout ? JSON.parse(defenseLayout.frontLaneJson) : {};
  const defRight = defenseLayout ? JSON.parse(defenseLayout.rightLaneJson) : {};

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

  // Courtyard Defense (Empty for now until Courtyard Units exist in DB)
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

  // Calculate Final Survivors for Looting
  if (finalWinner === 'attacker' && surfaceResult) {
    for (const [u, c] of Object.entries(surfaceResult.initialAttackerUnits)) {
      const loss = surfaceResult.attackerLosses[u] || 0;
      survivingUnitsFinal[u] = Math.max(0, c - loss);
    }
  }

  // Loot
  let lootJson = null;
  if (finalWinner === 'attacker') {
    const rawLoot = calculateLoot(survivingUnitsFinal, {
      carbon: fleet.toPlanet.carbon,
      titanium: fleet.toPlanet.titanium,
      food: fleet.toPlanet.food
    });
    lootJson = JSON.stringify(rawLoot);
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

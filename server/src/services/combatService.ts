import prisma from '../lib/prisma';

// Unit base stats
const UNIT_STATS: Record<string, { attack: number; defense: number }> = {
  marine: { attack: 10, defense: 8 },    // Formerly swords
  ranger: { attack: 12, defense: 5 },    // Formerly archers
  sentinel: { attack: 8, defense: 12 },  // Formerly pikes
  interceptor: { attack: 15, defense: 10 }, // Formerly cavalry (new)
};

// Defense building bonuses (per level)
const GRID_DEFENSE_BONUS = 50; // Defensive Grid: +50 defense per level
const PERIMETER_RANGED_BLOCK = 30; // Perimeter Field: +30% block/mitigation
const STARPORT_SORTIE_BONUS = 10; // Starport: +10% defender sortie power

// Tool effects (Sci-Fi equivalents)
const BREACH_POD_GRID_REDUCTION = 0.3; // Reduces Grid/Wall effectiveness
const PLASMA_GRENADE_FRONT_BONUS = 0.25; // Bonus on front
const AUTO_TURRET_DEFENSE = 20; // Extra defense power

interface LaneUnits {
  [unitType: string]: number;
}

interface LaneResult {
  attackerPower: number;
  defenderPower: number;
  attackerLosses: LaneUnits;
  defenderLosses: LaneUnits;
  winner: 'attacker' | 'defender';
}

interface CombatResult {
  winner: 'attacker' | 'defender';
  laneResults: {
    front: LaneResult;
    left: LaneResult;
    right: LaneResult;
  };
  attackerTotalLosses: LaneUnits;
  defenderTotalLosses: LaneUnits;
  resourcesJson: string | null;
}

/**
 * Calculate power for a lane given units and modifiers
 */
function calculateLanePower(
  units: LaneUnits,
  attackBonus: number,
  defenseBonus: number,
  gridLevel: number,
  perimeterLevel: number,
  starportLevel: number,
  isAttacker: boolean,
  lane: 'front' | 'left' | 'right',
  tools: { breachPod?: boolean; plasmaGrenade?: boolean; autoTurret?: boolean }
): number {
  let totalPower = 0;

  // Calculate base power from units
  for (const [unitType, count] of Object.entries(units)) {
    const stats = UNIT_STATS[unitType] || { attack: 10, defense: 10 };
    const basePower = isAttacker ? stats.attack : stats.defense;
    totalPower += basePower * count;
  }

  // Apply admiral bonuses
  if (isAttacker) {
    totalPower *= 1 + attackBonus / 100;
  } else {
    totalPower *= 1 + defenseBonus / 100;
  }

  // Apply defense modifiers (only for defender)
  if (!isAttacker) {
    // Grid bonus (stronger on front)
    const gridMultiplier = lane === 'front' ? 1.0 : 0.6;
    const effectiveGridLevel = tools.breachPod ? gridLevel * (1 - BREACH_POD_GRID_REDUCTION) : gridLevel;
    const gridBonus = effectiveGridLevel * GRID_DEFENSE_BONUS * gridMultiplier;

    totalPower += gridBonus;

    // Perimeter bonus (stronger on flanks)
    const perimeterMultiplier = lane === 'front' ? 0.5 : 1.0;
    const perimeterBonus = perimeterLevel * PERIMETER_RANGED_BLOCK * perimeterMultiplier;
    totalPower += perimeterBonus;

    // Starport bonus
    if (starportLevel > 0) {
      totalPower *= (1 + (starportLevel * STARPORT_SORTIE_BONUS) / 100);
    }

    if (tools.autoTurret) {
      totalPower += AUTO_TURRET_DEFENSE;
    }
  } else {
    // Attacker modifiers
    if (lane === 'front' && tools.plasmaGrenade) {
      totalPower *= 1 + PLASMA_GRENADE_FRONT_BONUS;
    }
  }

  return Math.max(0, totalPower);
}

/**
 * Calculate casualties
 */
function calculateCasualties(
  attackerPower: number,
  defenderPower: number,
  attackerUnits: LaneUnits,
  defenderUnits: LaneUnits,
  isAttacker: boolean
): { attackerLosses: LaneUnits; defenderLosses: LaneUnits } {
  const totalPower = attackerPower + defenderPower;
  if (totalPower === 0) {
    return { attackerLosses: {}, defenderLosses: {} };
  }

  const attackerCasualtyRate = defenderPower / totalPower;
  const defenderCasualtyRate = attackerPower / totalPower;

  const winner = attackerPower > defenderPower ? 'attacker' : 'defender';
  const attackerFinalRate = winner === 'attacker'
    ? attackerCasualtyRate * 0.6
    : attackerCasualtyRate;
  const defenderFinalRate = winner === 'defender'
    ? defenderCasualtyRate * 0.6
    : defenderCasualtyRate;

  const attackerLosses: LaneUnits = {};
  const defenderLosses: LaneUnits = {};

  for (const [unitType, count] of Object.entries(attackerUnits)) {
    attackerLosses[unitType] = Math.floor(count * attackerFinalRate);
  }

  for (const [unitType, count] of Object.entries(defenderUnits)) {
    defenderLosses[unitType] = Math.floor(count * defenderFinalRate);
  }

  return { attackerLosses, defenderLosses };
}

/**
 * Aggregate losses or units from multiple sources
 */
function aggregateLosses(...sources: LaneUnits[]): LaneUnits {
  const total: LaneUnits = {};
  for (const source of sources) {
    for (const [unit, count] of Object.entries(source)) {
      total[unit] = (total[unit] || 0) + (count as number);
    }
  }
  return total;
}

/**
 * Resolve combat for a single lane
 */
function resolveLane(
  attackerUnits: LaneUnits,
  defenderUnits: LaneUnits,
  attackBonus: number,
  defenseBonus: number,
  gridLevel: number,
  perimeterLevel: number,
  starportLevel: number,
  lane: 'front' | 'left' | 'right',
  tools: { breachPod?: boolean; plasmaGrenade?: boolean; autoTurret?: boolean }
): LaneResult {
  const attackerPower = calculateLanePower(
    attackerUnits,
    attackBonus,
    0,
    gridLevel,
    perimeterLevel,
    starportLevel,
    true,
    lane,
    tools
  );

  const defenderPower = calculateLanePower(
    defenderUnits,
    0,
    defenseBonus,
    gridLevel,
    perimeterLevel,
    starportLevel,
    false,
    lane,
    tools
  );

  const { attackerLosses, defenderLosses } = calculateCasualties(
    attackerPower,
    defenderPower,
    attackerUnits,
    defenderUnits,
    true
  );

  const winner = attackerPower > defenderPower ? 'attacker' : 'defender';

  return {
    attackerPower,
    defenderPower,
    attackerLosses,
    defenderLosses,
    winner,
  };
}

/**
 * Main combat resolver: processes a 3-lane battle
 */
export async function resolveCombat(
  fleetId: string
): Promise<CombatResult> {
  // Get fleet with all related data
  const fleet = await prisma.fleet.findUnique({
    where: { id: fleetId },
    include: {
      owner: {
        include: { admiral: true },
      },
      toPlanet: {
        include: {
          owner: { include: { admiral: true } },
          defenseLayout: true,
        },
      },
    },
  });

  if (!fleet || fleet.type !== 'attack') {
    throw new Error('Invalid fleet for combat resolution');
  }

  if (fleet.status !== 'arrived') {
    throw new Error('Fleet has not arrived yet');
  }

  // Parse lane assignments and tools
  const laneAssignments = fleet.laneAssignmentsJson
    ? JSON.parse(fleet.laneAssignmentsJson)
    : { front: {}, left: {}, right: {} };
  const tools = fleet.toolsJson ? JSON.parse(fleet.toolsJson) : {};

  // Get defender's defense layout
  const defenseLayout = fleet.toPlanet.defenseLayout;
  const frontDefense = defenseLayout
    ? JSON.parse(defenseLayout.frontLaneJson)
    : {};
  const leftDefense = defenseLayout
    ? JSON.parse(defenseLayout.leftLaneJson)
    : {};
  const rightDefense = defenseLayout
    ? JSON.parse(defenseLayout.rightLaneJson)
    : {};

  // Get admiral bonuses
  const attackerBonus = fleet.owner.admiral?.attackBonus || 0;
  const defenderBonus = fleet.toPlanet.owner.admiral?.defenseBonus || 0;

  // Get defense building levels
  const gridLevel = fleet.toPlanet.defensiveGridLevel;
  const perimeterLevel = fleet.toPlanet.perimeterFieldLevel;
  const starportLevel = fleet.toPlanet.starportLevel;

  // Resolve each lane
  const frontResult = resolveLane(
    laneAssignments.front || {},
    frontDefense,
    attackerBonus,
    defenderBonus,
    gridLevel,
    perimeterLevel,
    starportLevel,
    'front',
    tools
  );

  const leftResult = resolveLane(
    laneAssignments.left || {},
    leftDefense,
    attackerBonus,
    defenderBonus,
    gridLevel,
    perimeterLevel,
    starportLevel,
    'left',
    tools
  );

  const rightResult = resolveLane(
    laneAssignments.right || {},
    rightDefense,
    attackerBonus,
    defenderBonus,
    gridLevel,
    perimeterLevel,
    starportLevel,
    'right',
    tools
  );

  // --- COURTYARD PHASE ---
  // Surviving attackers from WINNING lanes advance to the courtyard.
  // Defenders from LOSING lanes retreat (partially or fully? GGE usually has them wiped or routed, let's assume wiped for MVP).
  // Actually, standard GGE:
  // - If attacker wins lane, remaining attackers flank the courtyard (bonus damage or just added power).
  // - If defender holds lane, attackers are stopped there.
  // - Defender has separate "Courtyard" setup, but here we'll assume unassigned troops or just survivors.
  // For MVP: Courtyard is the final stand.

  // 1. Aggregate Surviving Attackers from their WON lanes
  const courtyardAttackers: LaneUnits = {};
  if (frontResult.winner === 'attacker') {
    for (const [u, count] of Object.entries(laneAssignments.front || {})) {
      const lost = frontResult.attackerLosses[u] || 0;
      courtyardAttackers[u] = (courtyardAttackers[u] || 0) + Math.max(0, (count as number) - lost);
    }
  }
  if (leftResult.winner === 'attacker') {
    for (const [u, count] of Object.entries(laneAssignments.left || {})) {
      const lost = leftResult.attackerLosses[u] || 0;
      courtyardAttackers[u] = (courtyardAttackers[u] || 0) + Math.max(0, (count as number) - lost);
    }
  }
  if (rightResult.winner === 'attacker') {
    for (const [u, count] of Object.entries(laneAssignments.right || {})) {
      const lost = rightResult.attackerLosses[u] || 0;
      courtyardAttackers[u] = (courtyardAttackers[u] || 0) + Math.max(0, (count as number) - lost);
    }
  }

  // 2. Aggregate Defenders in Courtyard (unassigned + survivors from held lanes?)
  // For GGE, usually defenders in lanes FIGHT TO THE DEATH.
  // Survivors from WON defender lanes can support courtyard?
  // Let's say yes for dynamic simple logic.
  const courtyardDefenders: LaneUnits = {};

  if (frontResult.winner === 'defender') {
    for (const [u, count] of Object.entries(frontDefense)) {
      const lost = frontResult.defenderLosses[u] || 0;
      courtyardDefenders[u] = (courtyardDefenders[u] || 0) + Math.max(0, (count as number) - lost);
    }
  }
  if (leftResult.winner === 'defender') {
    for (const [u, count] of Object.entries(leftDefense)) {
      const lost = leftResult.defenderLosses[u] || 0;
      courtyardDefenders[u] = (courtyardDefenders[u] || 0) + Math.max(0, (count as number) - lost);
    }
  }
  if (rightResult.winner === 'defender') {
    for (const [u, count] of Object.entries(rightDefense)) {
      const lost = rightResult.defenderLosses[u] || 0;
      courtyardDefenders[u] = (courtyardDefenders[u] || 0) + Math.max(0, (count as number) - lost);
    }
  }
  // Also add any units NOT assigned to lanes? (Courtyard defenders)
  // For now, we only have lane storage. Future feature: "Courtyard Slot".

  // 3. Resolve Courtyard Battle
  // Bonus: If attacker won Left/Right, they get a flanking power bonus against Courtyard.
  let courtyardAttackerBonus = attackerBonus;
  if (leftResult.winner === 'attacker') courtyardAttackerBonus += 30; // Flank bonus
  if (rightResult.winner === 'attacker') courtyardAttackerBonus += 30;

  const courtyardResult = resolveLane(
    courtyardAttackers,
    courtyardDefenders,
    courtyardAttackerBonus,
    defenderBonus, // Keep defender bonus
    0, // No Wall in courtyard
    0, // No Moat
    0, // No Starport
    'front', // Treat as head-on
    tools
  );

  // 4. Overall Winner is determined by Courtyard
  // If attackers breech courtyard, they win the Planet.
  const overallWinner = courtyardResult.winner;

  // 5. Aggregate TOTAL Losses (Lane Phase + Courtyard Phase)
  // Note: Units that survived Lane Phase might have died in Courtyard.
  // We need to track distinct deaths.

  // Actually, easiest way:
  // Total Losses = Initial Units - Final Survivors.
  // Initial Units:
  const initialAttackerTotal = aggregateLosses(laneAssignments.front || {}, laneAssignments.left || {}, laneAssignments.right || {});
  const initialDefenderTotal = aggregateLosses(frontDefense, leftDefense, rightDefense);

  // Final Survivors (Winners of Courtyard match)
  // If Attacker Won Courtyard: Survivors = Courtyard Survivors.
  // But wait, what about attackers who fought in a lane that the defender WON? They are dead.
  // What about defenders who fought in a lane that attacker WON? They are dead.

  // Let's just sum the calculated losses from the Lane Phase + Courtyard Phase.
  // Be careful not to double count.
  // Lane Losses are people who died in phase 1.
  // Courtyard Losses are people who died in phase 2 (subset of survivors).

  const totalAttackerLosses = aggregateLosses(
    frontResult.attackerLosses,
    leftResult.attackerLosses,
    rightResult.attackerLosses
  );
  // Add courtyard losses
  for (const [u, count] of Object.entries(courtyardResult.attackerLosses)) {
    totalAttackerLosses[u] = (totalAttackerLosses[u] || 0) + count;
  }

  const totalDefenderLosses = aggregateLosses(
    frontResult.defenderLosses,
    leftResult.defenderLosses,
    rightResult.defenderLosses
  );
  for (const [u, count] of Object.entries(courtyardResult.defenderLosses)) {
    totalDefenderLosses[u] = (totalDefenderLosses[u] || 0) + count;
  }

  // Cap losses at initial count (safety check)
  for (const [u, count] of Object.entries(initialAttackerTotal)) {
    if ((totalAttackerLosses[u] || 0) > (count as number)) totalAttackerLosses[u] = (count as number);
  }
  for (const [u, count] of Object.entries(initialDefenderTotal)) {
    if ((totalDefenderLosses[u] || 0) > (count as number)) totalDefenderLosses[u] = (count as number);
  }

  // --- LOOT CALCULATION ---
  let lootedResources = null;
  if (overallWinner === 'attacker') {
    // Calculate capacity
    // Marine = 0, Ranger = 0, Sentinel = 0?
    // Need loot capacity stats. Let's assume 10 per unit for now or use cargo unit (Transporter).
    // Standard units carry little.
    let capacity = 0;
    // Count survivors
    for (const [u, initial] of Object.entries(initialAttackerTotal)) {
      const lost = totalAttackerLosses[u] || 0;
      const survivors = Math.max(0, (initial as number) - lost);
      capacity += survivors * 10; // 10 Loot per unit
    }

    // Steal Logic
    const planetRes = fleet.toPlanet;
    // We need to update this via prisma later, here we just calc
    // Simple logic: Take equal parts or prioritize?
    // Take whatever is available up to capacity
    const carbon = planetRes.carbon;
    const titanium = planetRes.titanium;
    const food = planetRes.food;

    let takenC = 0, takenT = 0, takenF = 0;

    // Split capacity 3 ways?
    let remainingCap = capacity;

    // Take Food first? (GGE style: food is precious)
    const takeF = Math.min(food, remainingCap);
    takenF = takeF; remainingCap -= takeF;

    const takeC = Math.min(carbon, remainingCap);
    takenC = takeC; remainingCap -= takeC;

    const takeT = Math.min(titanium, remainingCap);
    takenT = takeT; remainingCap -= takeT;

    lootedResources = { carbon: takenC, titanium: takenT, food: takenF };
  }

  return {
    winner: overallWinner,
    laneResults: {
      front: frontResult,
      left: leftResult,
      right: rightResult,
    },
    attackerTotalLosses: totalAttackerLosses,
    defenderTotalLosses: totalDefenderLosses,
    resourcesJson: lootedResources ? JSON.stringify(lootedResources) : null
  };
}


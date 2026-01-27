/**
 * Event Combat Service
 *
 * Handles combat between players and event ships.
 * Uses the existing combat system from combatService for consistency.
 * Awards Xeno Cores based on eventConfig.
 */

import prisma from '../../lib/prisma';
import { ALIEN_INVASION_CONFIG, ShipType } from '../../constants/eventConfig';
import { resolveWaveCollision } from '../combatService';
import {
  getEventShip,
  getShipGarrison,
  defeatShip,
  incrementShipAttackCount,
  dealMothershipDamage,
} from './eventShipService';
import { awardXenoCores, recordAttackLaunched } from './eventScoreService';
import { addHeat } from './eventHeatService';

const config = ALIEN_INVASION_CONFIG;

// =============================================================================
// TYPES
// =============================================================================

export interface EventCombatResult {
  success: boolean;
  victory: boolean;
  shipDefeated: boolean;
  xenoCoresAwarded: number;
  damageDealt: number;
  unitsLost: Record<string, number>;
  unitsKilled: Record<string, number>;
  remainingGarrison: Record<string, number>;
  remainingFleet: Record<string, number>;
  heatGained: number;
  mothershipKilled?: boolean;
  error?: string;
}

interface AttackFleet {
  [unitType: string]: number;
}

// =============================================================================
// COMBAT
// =============================================================================

/**
 * Resolve combat between an attacking fleet and an event ship.
 * Called when a fleet arrives at the event ship's coordinates.
 * 
 * Hull Breach Assault: Combat is resolved per-system (shields, reactor, weapons).
 * The player assigns units to each system. Victory requires winning the reactor lane.
 */
export async function resolveEventCombat(
  eventId: string,
  shipId: string,
  userId: string,
  fleet: AttackFleet,
  systemAssignments?: { shields: AttackFleet; reactor: AttackFleet; weapons: AttackFleet }
): Promise<EventCombatResult> {
  // Validate event is active
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status !== 'active') {
    return createErrorResult('Event is not active');
  }

  // Get ship
  const ship = await getEventShip(shipId);
  if (!ship || ship.eventId !== eventId) {
    return createErrorResult('Ship not found');
  }

  if (ship.isDefeated) {
    return createErrorResult('Ship is already defeated');
  }

  // Validate fleet has units
  const totalUnits = Object.values(fleet).reduce((sum, count) => sum + count, 0);
  if (totalUnits === 0) {
    return createErrorResult('No units in fleet');
  }

  // Record attack launched
  await recordAttackLaunched(eventId, userId);

  // Get full garrison and split by system
  const fullGarrison = getShipGarrison(ship);
  const systemGarrisonPercents = config.systemGarrisons;

  // Split garrison into per-system portions
  const shieldsGarrison: Record<string, number> = {};
  const reactorGarrison: Record<string, number> = {};
  const weaponsGarrison: Record<string, number> = {};

  for (const [unitType, count] of Object.entries(fullGarrison)) {
    shieldsGarrison[unitType] = Math.floor(count * systemGarrisonPercents.shields.percent);
    reactorGarrison[unitType] = Math.floor(count * systemGarrisonPercents.reactor.percent);
    weaponsGarrison[unitType] = Math.floor(count * systemGarrisonPercents.weapons.percent);
  }

  // Default: all units attack reactor if no assignments provided
  const assignments = systemAssignments || {
    shields: {},
    reactor: fleet,
    weapons: {},
  };

  // Resolve combat for each system
  const systemResults: Record<string, ReturnType<typeof resolveWaveCollision>> = {};

  const hasUnitsFor = (lane: AttackFleet) => Object.values(lane).reduce((s, n) => s + n, 0) > 0;

  // Only resolve lanes that have attacking units
  if (hasUnitsFor(assignments.shields)) {
    systemResults.shields = resolveWaveCollision(
      assignments.shields, shieldsGarrison, {}, { canopy: 0, hub: 0, minefield: 0 },
      false, {},
      { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 },
      { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 }
    );
  }

  if (hasUnitsFor(assignments.reactor)) {
    systemResults.reactor = resolveWaveCollision(
      assignments.reactor, reactorGarrison, {}, { canopy: 0, hub: 0, minefield: 0 },
      false, {},
      { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 },
      { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 }
    );
  }

  if (hasUnitsFor(assignments.weapons)) {
    systemResults.weapons = resolveWaveCollision(
      assignments.weapons, weaponsGarrison, {}, { canopy: 0, hub: 0, minefield: 0 },
      false, {},
      { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 },
      { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 }
    );
  }

  // Aggregate results
  const aggregateUnits = (field: 'attackerLosses' | 'defenderLosses' | 'remainingAttackers' | 'remainingDefenders') => {
    const result: Record<string, number> = {};
    for (const sysResult of Object.values(systemResults)) {
      for (const [unit, count] of Object.entries(sysResult[field])) {
        result[unit] = (result[unit] || 0) + count;
      }
    }
    return result;
  };

  const aggregatedAttackerLosses = aggregateUnits('attackerLosses');
  const aggregatedDefenderLosses = aggregateUnits('defenderLosses');
  const aggregatedRemainingAttackers = aggregateUnits('remainingAttackers');
  const aggregatedRemainingDefenders = aggregateUnits('remainingDefenders');

  // Victory = won the reactor lane (core system)
  const victory = systemResults.reactor?.attackerWon ?? false;

  // Calculate damage dealt
  const damageDealt = Object.values(aggregatedDefenderLosses).reduce((sum, n) => sum + n, 0);

  // Calculate Xeno Cores
  let xenoCoresAwarded = 0;
  let shipDefeated = false;
  let mothershipKilled = false;

  if (victory) {
    // Victory - award base Xeno Cores from config
    const lootConfig = ship.lootConfig as { xenoCores?: number } | null;
    xenoCoresAwarded = lootConfig?.xenoCores || config.shipTiers[ship.shipType as ShipType]?.xenoCoresBase || 10;

    // Bonus for additional systems breached
    if (systemResults.shields?.attackerWon) xenoCoresAwarded = Math.floor(xenoCoresAwarded * 1.1);
    if (systemResults.weapons?.attackerWon) xenoCoresAwarded = Math.floor(xenoCoresAwarded * 1.1);

    // Handle ship defeat
    if (ship.shipType === 'mothership') {
      const result = await dealMothershipDamage(eventId, shipId, userId, damageDealt);
      mothershipKilled = result.killed;
      shipDefeated = result.killed;

      const damagePercent = damageDealt / (ship.maxHp || config.mothership.baseHp);
      xenoCoresAwarded = Math.floor(config.mothership.xenoCoresBase * damagePercent);
    } else {
      shipDefeated = await incrementShipAttackCount(shipId);

      if (!shipDefeated) {
        await prisma.eventShip.update({
          where: { id: shipId },
          data: { garrison: aggregatedRemainingDefenders as unknown as any },
        });
      }
    }

    if (xenoCoresAwarded > 0) {
      await awardXenoCores(eventId, userId, xenoCoresAwarded, 'ship_kill');
    }
  } else {
    // Defeat - still deal some damage to mothership if applicable
    if (ship.shipType === 'mothership' && damageDealt > 0) {
      const result = await dealMothershipDamage(eventId, shipId, userId, damageDealt);
      mothershipKilled = result.killed;
      shipDefeated = result.killed;

      const damagePercent = damageDealt / (ship.maxHp || config.mothership.baseHp);
      xenoCoresAwarded = Math.floor(config.mothership.xenoCoresBase * damagePercent * 0.5);
      if (xenoCoresAwarded > 0) {
        await awardXenoCores(eventId, userId, xenoCoresAwarded, 'boss_damage');
      }
    }

    await prisma.eventShip.update({
      where: { id: shipId },
      data: { garrison: aggregatedRemainingDefenders as unknown as any },
    });
  }

  const heatGained = await addHeat(eventId, userId, ship.shipType as ShipType);

  return {
    success: true,
    victory,
    shipDefeated,
    xenoCoresAwarded,
    damageDealt,
    unitsLost: aggregatedAttackerLosses,
    unitsKilled: aggregatedDefenderLosses,
    remainingGarrison: aggregatedRemainingDefenders,
    remainingFleet: aggregatedRemainingAttackers,
    heatGained,
    mothershipKilled,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function createErrorResult(error: string): EventCombatResult {
  return {
    success: false,
    victory: false,
    shipDefeated: false,
    xenoCoresAwarded: 0,
    damageDealt: 0,
    unitsLost: {},
    unitsKilled: {},
    remainingGarrison: {},
    remainingFleet: {},
    heatGained: 0,
    error,
  };
}

/**
 * Legacy function kept for compatibility - now just calls resolveEventCombat
 * @deprecated Use resolveEventCombat instead
 */
export async function attackEventShip(
  eventId: string,
  shipId: string,
  userId: string,
  fleet: AttackFleet
): Promise<EventCombatResult> {
  return resolveEventCombat(eventId, shipId, userId, fleet);
}

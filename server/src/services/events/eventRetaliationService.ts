/**
 * Event Retaliation Service
 *
 * Handles alien retaliation attacks against players who have accumulated heat.
 */

import prisma from '../../lib/prisma';
import { ALIEN_INVASION_CONFIG } from '../../constants/eventConfig';
import { gameEventsQueue } from '../../lib/jobQueue';
import {
  getEligibleRetaliationTargets,
  shouldTriggerRetaliation,
  recordRetaliation,
  reduceHeatOnDefense,
  getPlayerHeat,
} from './eventHeatService';
import { awardXenoCores, recordDefenseLost } from './eventScoreService';
import { socketService } from '../socketService';
import { Prisma } from '@prisma/client';

const config = ALIEN_INVASION_CONFIG;

// =============================================================================
// TYPES
// =============================================================================

interface RetaliationFleet {
  [unitType: string]: number;
}

// =============================================================================
// RETALIATION CHECK (Called every 30 min)
// =============================================================================

/**
 * Process retaliation checks for all players in event
 */
export async function processRetaliationCheck(eventId: string) {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status !== 'active') return;

  // Get eligible targets
  const eligibleUserIds = await getEligibleRetaliationTargets(eventId);
  console.log(`🎯 Retaliation check: ${eligibleUserIds.length} eligible targets`);

  let retaliationsScheduled = 0;

  for (const userId of eligibleUserIds) {
    const heat = await getPlayerHeat(eventId, userId);
    
    // Roll for retaliation
    if (shouldTriggerRetaliation(heat.currentHeat)) {
      await scheduleRetaliation(eventId, userId, heat.currentHeat, 'random');
      retaliationsScheduled++;
    }
  }

  if (retaliationsScheduled > 0) {
    console.log(`⚠️ Scheduled ${retaliationsScheduled} retaliations`);
  }
}

// =============================================================================
// SCHEDULING
// =============================================================================

/**
 * Schedule a retaliation attack against a player
 */
async function scheduleRetaliation(
  eventId: string,
  userId: string,
  currentHeat: number,
  waveType: 'random' | 'final_swarm'
) {
  // Determine tier based on heat
  const tier = getRetaliationTier(currentHeat);

  // Random travel time (30 min to 2 hours)
  const travelMinutes = 30 + Math.floor(Math.random() * 90);
  const arrivalTime = new Date(Date.now() + travelMinutes * 60 * 1000);
  const scheduledAt = new Date();

  // Get target planet
  const targetPlanet = await prisma.planet.findFirst({
    where: { ownerId: userId, isNpc: false },
    orderBy: { createdAt: 'asc' },
  });

  if (!targetPlanet) return;

  // Create retaliation record
  const retaliation = await prisma.eventRetaliation.create({
    data: {
      eventId,
      targetUserId: userId,
      targetPlanetId: targetPlanet.id,
      waveType,
      tier,
      status: 'incoming',
      scheduledAt,
      arriveAt: arrivalTime,
    },
  });

  // Schedule arrival job
  await gameEventsQueue.add(
    'retaliation:arrival',
    { retaliationId: retaliation.id },
    {
      delay: travelMinutes * 60 * 1000,
      jobId: `retaliation-arrival-${retaliation.id}`,
      removeOnComplete: true,
    }
  );

  // Calculate fleet power for notification
  const fleet = generateRetaliationFleet(tier);
  const fleetPower = calculateFleetPower(fleet);

  // Notify player
  socketService.emitToUser(userId, 'event:retaliation-incoming', {
    eventId,
    retaliationId: retaliation.id,
    tier,
    arrivalTime: arrivalTime.toISOString(),
    fleetPower,
    waveName: getWaveName(tier),
  });

  console.log(`⚠️ Retaliation scheduled for ${userId}: tier ${tier}, arrival ${arrivalTime.toISOString()}`);
}

/**
 * Get retaliation tier based on heat
 */
function getRetaliationTier(heat: number): number {
  // Map heat to tier (1-5)
  if (heat >= 80) return 5;
  if (heat >= 60) return 4;
  if (heat >= 40) return 3;
  if (heat >= 20) return 2;
  return 1;
}

/**
 * Get wave name for a tier
 */
function getWaveName(tier: number): string {
  const names = ['Scout Probe', 'Raider Strike', 'Carrier Assault', 'Dreadnought Siege', 'Armada'];
  return names[tier - 1] || 'Scout Probe';
}

/**
 * Get Xeno Cores reward for tier
 */
function getTierXenoCores(tier: number): number {
  const rewards = [50, 150, 400, 1000, 2500];
  return rewards[tier - 1] || 50;
}

/**
 * Generate retaliation fleet based on tier
 */
function generateRetaliationFleet(tier: number): RetaliationFleet {
  const fleet: RetaliationFleet = {};
  const multiplier = tier;

  fleet.marine = 20 * multiplier;
  fleet.sniper = 10 * multiplier;

  if (tier >= 2) {
    fleet.sentinel = 5 * multiplier;
  }
  if (tier >= 3) {
    fleet.automaton = 2 * multiplier;
  }
  if (tier >= 4) {
    fleet.interceptor = 1 * multiplier;
  }

  return fleet;
}

// =============================================================================
// ARRIVAL & COMBAT
// =============================================================================

/**
 * Process retaliation arrival
 */
export async function processRetaliationArrival(retaliationId: string) {
  const retaliation = await prisma.eventRetaliation.findUnique({
    where: { id: retaliationId },
  });

  if (!retaliation || retaliation.status !== 'incoming') {
    console.log(`Retaliation ${retaliationId} already processed or cancelled`);
    return;
  }

  const fleet = generateRetaliationFleet(retaliation.tier);
  const userId = retaliation.targetUserId;
  const planetId = retaliation.targetPlanetId;

  // Get planet with garrison units
  const planet = await prisma.planet.findUnique({
    where: { id: planetId },
  });

  if (!planet) {
    await prisma.eventRetaliation.update({
      where: { id: retaliationId },
      data: { status: 'resolved', outcome: 'target_missing' },
    });
    return;
  }

  // Get garrison units from PlanetUnit table
  const garrisonUnits = await prisma.planetUnit.findMany({
    where: { planetId },
  });

  // Build defender garrison
  const defenderGarrison: Record<string, number> = {};
  for (const unit of garrisonUnits) {
    defenderGarrison[unit.unitType] = (defenderGarrison[unit.unitType] || 0) + unit.count;
  }

  // Simulate combat
  const combatResult = simulateRetaliationCombat(fleet, defenderGarrison);

  // Record retaliation in heat
  await recordRetaliation(retaliation.eventId, userId);

  let xenoCoresAwarded = 0;

  if (combatResult.defended) {
    // Player defended successfully
    xenoCoresAwarded = getTierXenoCores(retaliation.tier);
    await awardXenoCores(retaliation.eventId, userId, xenoCoresAwarded, 'defense');
    await reduceHeatOnDefense(retaliation.eventId, userId);

    // Update retaliation status
    await prisma.eventRetaliation.update({
      where: { id: retaliationId },
      data: {
        status: 'resolved',
        outcome: 'defended',
        lootTaken: {
          defended: true,
          attackerUnitsLost: combatResult.attackerUnitsLost,
          defenderUnitsLost: combatResult.defenderUnitsLost,
          xenoCoresAwarded,
        } as Prisma.InputJsonValue,
      },
    });

    // Apply defender losses
    await applyGarrisonLosses(planetId, combatResult.defenderUnitsLost);
  } else {
    // Attacker won - player lost
    await recordDefenseLost(retaliation.eventId, userId);

    // Calculate resource losses (10-30% of current)
    const resourceLossPercent = 0.1 + Math.random() * 0.2;
    const resourcesLost = {
      carbon: Math.floor((planet.carbon || 0) * resourceLossPercent),
      titanium: Math.floor((planet.titanium || 0) * resourceLossPercent),
      food: Math.floor((planet.food || 0) * resourceLossPercent),
    };

    // Apply losses
    await prisma.planet.update({
      where: { id: planetId },
      data: {
        carbon: { decrement: resourcesLost.carbon },
        titanium: { decrement: resourcesLost.titanium },
        food: { decrement: resourcesLost.food },
      },
    });

    // Wipe garrison on defeat
    await applyGarrisonLosses(planetId, defenderGarrison);

    await prisma.eventRetaliation.update({
      where: { id: retaliationId },
      data: {
        status: 'resolved',
        outcome: 'breached',
        lootTaken: {
          defended: false,
          attackerUnitsLost: combatResult.attackerUnitsLost,
          defenderUnitsLost: defenderGarrison,
          resourcesLost,
          xenoCoresAwarded: 0,
        } as Prisma.InputJsonValue,
      },
    });
  }

  // Notify player
  socketService.emitToUser(userId, 'event:retaliation-complete', {
    eventId: retaliation.eventId,
    retaliationId,
    defended: combatResult.defended,
    xenoCoresAwarded,
    losses: combatResult.defended ? combatResult.defenderUnitsLost : { resources: 'looted' },
  });

  console.log(`💥 Retaliation ${retaliationId} complete: ${combatResult.defended ? 'DEFENDED' : 'BREACHED'}`);
}

/**
 * Simulate retaliation combat
 */
function simulateRetaliationCombat(
  attackerFleet: RetaliationFleet,
  defenderGarrison: Record<string, number>
): { defended: boolean; attackerUnitsLost: Record<string, number>; defenderUnitsLost: Record<string, number> } {
  const attackerPower = calculateFleetPower(attackerFleet);
  const defenderPower = calculateFleetPower(defenderGarrison);

  const defended = defenderPower > attackerPower;

  const attackerLossRatio = defenderPower / (attackerPower + defenderPower + 1);
  const defenderLossRatio = attackerPower / (attackerPower + defenderPower + 1);

  const attackerUnitsLost: Record<string, number> = {};
  const defenderUnitsLost: Record<string, number> = {};

  for (const [unit, count] of Object.entries(attackerFleet)) {
    attackerUnitsLost[unit] = defended ? count : Math.floor(count * attackerLossRatio);
  }

  for (const [unit, count] of Object.entries(defenderGarrison)) {
    defenderUnitsLost[unit] = defended
      ? Math.floor(count * defenderLossRatio)
      : count;
  }

  return { defended, attackerUnitsLost, defenderUnitsLost };
}

/**
 * Apply garrison losses to planet
 */
async function applyGarrisonLosses(planetId: string, losses: Record<string, number>) {
  for (const [unitType, lostCount] of Object.entries(losses)) {
    if (lostCount <= 0) continue;

    const unit = await prisma.planetUnit.findFirst({
      where: { planetId, unitType },
    });

    if (unit) {
      const newCount = Math.max(0, unit.count - lostCount);
      if (newCount === 0) {
        await prisma.planetUnit.delete({ where: { id: unit.id } });
      } else {
        await prisma.planetUnit.update({
          where: { id: unit.id },
          data: { count: newCount },
        });
      }
    }
  }
}

// =============================================================================
// FINAL RETALIATION WAVE
// =============================================================================

/**
 * Trigger final retaliation phase (attacks all participants)
 */
export async function triggerFinalRetaliationWave(eventId: string) {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event) return;

  // Get all participants
  const participants = await prisma.eventScore.findMany({
    where: { eventId },
    select: { userId: true, xenoCores: true },
  });

  console.log(`🌊 Final retaliation wave: ${participants.length} participants`);

  for (const participant of participants) {
    // Scale tier based on participation
    const heat = await getPlayerHeat(eventId, participant.userId);
    await scheduleRetaliation(eventId, participant.userId, heat.peakHeat, 'final_swarm');
  }

  // Update event state
  const currentState = (event.globalState as Record<string, unknown>) || {};
  await prisma.worldEvent.update({
    where: { id: eventId },
    data: {
      globalState: {
        ...currentState,
        finalWaveTriggered: true,
      } as Prisma.InputJsonValue,
    },
  });
}

// =============================================================================
// HELPERS
// =============================================================================

function calculateFleetPower(fleet: Record<string, number>): number {
  const unitPower: Record<string, number> = {
    marine: 5,
    sniper: 15,
    sentinel: 35,
    automaton: 80,
    interceptor: 150,
  };

  let power = 0;
  for (const [unit, count] of Object.entries(fleet)) {
    power += (unitPower[unit] || 10) * count;
  }
  return power;
}

/**
 * Get incoming retaliations for a player
 */
export async function getPlayerRetaliations(eventId: string, userId: string) {
  return prisma.eventRetaliation.findMany({
    where: {
      eventId,
      targetUserId: userId,
    },
    orderBy: { scheduledAt: 'desc' },
  });
}

/**
 * Cancel a retaliation (admin only)
 */
export async function cancelRetaliation(retaliationId: string) {
  await prisma.eventRetaliation.update({
    where: { id: retaliationId },
    data: { status: 'cancelled' },
  });
}

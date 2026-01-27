/**
 * Event Heat Service
 *
 * Manages player "heat" for retaliation targeting.
 * Higher heat = higher chance of being attacked by aliens.
 */

import prisma from '../../lib/prisma';
import { ALIEN_INVASION_CONFIG, ShipType } from '../../constants/eventConfig';

const config = ALIEN_INVASION_CONFIG.heat;

// =============================================================================
// HEAT MANAGEMENT
// =============================================================================

/**
 * Add heat to a player after attacking a ship
 */
export async function addHeat(
  eventId: string,
  userId: string,
  shipType: ShipType,
  customAmount?: number
): Promise<number> {
  const heatGain = customAmount || config.gainPerTier[shipType] || 0;

  const heat = await prisma.eventHeat.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: {
      currentHeat: { increment: heatGain },
      lastHeatGain: new Date(),
    },
    create: {
      eventId,
      userId,
      currentHeat: heatGain,
      peakHeat: heatGain,
      lastHeatGain: new Date(),
    },
  });

  // Clamp to max
  if (heat.currentHeat > config.maxHeat) {
    await prisma.eventHeat.update({
      where: { id: heat.id },
      data: { currentHeat: config.maxHeat },
    });
  }

  // Update peak if current exceeds it
  if (heat.currentHeat > heat.peakHeat) {
    await prisma.eventHeat.update({
      where: { id: heat.id },
      data: { peakHeat: heat.currentHeat },
    });
  }

  return Math.min(heat.currentHeat, config.maxHeat);
}

/**
 * Process heat decay for all players in event (called hourly)
 */
export async function processHeatDecay(eventId: string): Promise<number> {
  const gracePeriodMs = config.decayGracePeriodMinutes * 60 * 1000;
  const graceCutoff = new Date(Date.now() - gracePeriodMs);

  // Decay heat for players who haven't attacked recently
  const result = await prisma.eventHeat.updateMany({
    where: {
      eventId,
      currentHeat: { gt: 0 },
      OR: [
        { lastHeatGain: { lt: graceCutoff } },
        { lastHeatGain: null },
      ],
    },
    data: {
      currentHeat: { decrement: config.decayPerHour },
    },
  });

  // Clamp to 0 (no negative heat)
  await prisma.$executeRaw`
    UPDATE event_heat 
    SET current_heat = 0 
    WHERE event_id = ${eventId} AND current_heat < 0
  `;

  if (result.count > 0) {
    console.log(`🌡️ Heat decayed for ${result.count} players (-${config.decayPerHour})`);
  }

  return result.count;
}

/**
 * Get player's current heat and retaliation probability
 */
export async function getPlayerHeat(eventId: string, userId: string) {
  const heat = await prisma.eventHeat.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });

  if (!heat) {
    return {
      currentHeat: 0,
      peakHeat: 0,
      retaliationChance: 0,
      isEligibleForRetaliation: false,
      lastRetaliation: null,
    };
  }

  const chance = (heat.currentHeat / config.heatDivisor) * config.baseChancePerHour;
  const isEligible = heat.currentHeat >= config.minHeatForRetaliation;

  // Check cooldown
  let onCooldown = false;
  if (heat.lastRetaliation) {
    const cooldownMs = config.minRetaliationIntervalHours * 60 * 60 * 1000;
    onCooldown = Date.now() - heat.lastRetaliation.getTime() < cooldownMs;
  }

  return {
    currentHeat: heat.currentHeat,
    peakHeat: heat.peakHeat,
    retaliationChance: Math.min(1, chance) * 100, // As percentage
    isEligibleForRetaliation: isEligible && !onCooldown,
    lastRetaliation: heat.lastRetaliation,
    retaliationsReceived: heat.retaliationsReceived,
  };
}

/**
 * Reduce heat after successful defense
 */
export async function reduceHeatOnDefense(eventId: string, userId: string): Promise<number> {
  const heat = await prisma.eventHeat.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });

  if (!heat) return 0;

  const newHeat = Math.max(0, heat.currentHeat - config.heatReductionOnDefense);

  await prisma.eventHeat.update({
    where: { id: heat.id },
    data: {
      currentHeat: newHeat,
      lastRetaliation: new Date(),
    },
  });

  return newHeat;
}

/**
 * Mark that a player received a retaliation
 */
export async function recordRetaliation(eventId: string, userId: string) {
  await prisma.eventHeat.update({
    where: { eventId_userId: { eventId, userId } },
    data: {
      lastRetaliation: new Date(),
      retaliationsReceived: { increment: 1 },
    },
  }).catch(() => {
    // Heat record might not exist
  });
}

// =============================================================================
// RETALIATION TARGETING
// =============================================================================

/**
 * Get players eligible for retaliation (for random attack selection)
 */
export async function getEligibleRetaliationTargets(eventId: string): Promise<string[]> {
  const cooldownMs = config.minRetaliationIntervalHours * 60 * 60 * 1000;
  const cooldownCutoff = new Date(Date.now() - cooldownMs);

  const eligible = await prisma.eventHeat.findMany({
    where: {
      eventId,
      currentHeat: { gte: config.minHeatForRetaliation },
      OR: [
        { lastRetaliation: { lt: cooldownCutoff } },
        { lastRetaliation: null },
      ],
    },
    select: { userId: true, currentHeat: true },
  });

  return eligible.map((h) => h.userId);
}

/**
 * Roll for retaliation for a specific player
 */
export function shouldTriggerRetaliation(currentHeat: number): boolean {
  if (currentHeat < config.minHeatForRetaliation) return false;

  const chance = (currentHeat / config.heatDivisor) * config.baseChancePerHour;
  return Math.random() < chance;
}

/**
 * Get heat leaderboard (who's most likely to be attacked)
 */
export async function getHeatLeaderboard(eventId: string, limit: number = 20) {
  const heats = await prisma.eventHeat.findMany({
    where: { eventId },
    orderBy: { currentHeat: 'desc' },
    take: limit,
  });

  const userIds = heats.map((h) => h.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return heats.map((heat, index) => ({
    rank: index + 1,
    userId: heat.userId,
    username: userMap.get(heat.userId)?.username || 'Unknown',
    currentHeat: heat.currentHeat,
    peakHeat: heat.peakHeat,
    retaliationsReceived: heat.retaliationsReceived,
    retaliationChance: Math.min(100, (heat.currentHeat / config.heatDivisor) * config.baseChancePerHour * 100),
  }));
}


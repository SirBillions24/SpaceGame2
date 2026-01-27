/**
 * Event Score Service
 *
 * Handles player scoring, Xeno Core tracking, and leaderboard management.
 */

import prisma from '../../lib/prisma';
import { ALIEN_INVASION_CONFIG } from '../../constants/eventConfig';

const config = ALIEN_INVASION_CONFIG;

// =============================================================================
// SCORE MANAGEMENT
// =============================================================================

/**
 * Award Xeno Cores to a player (and their coalition)
 */
export async function awardXenoCores(
  eventId: string,
  userId: string,
  cores: number,
  reason: 'ship_kill' | 'boss_damage' | 'defense' | 'bonus' = 'ship_kill'
): Promise<{ playerCores: number; coalitionCores: number }> {
  // Get user's coalition
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { coalitionId: true },
  });

  // Calculate coalition contribution
  const coalitionCores = user?.coalitionId
    ? Math.floor(cores * (config.coalitionScoring.contributionPercent / 100))
    : 0;

  // Upsert player score
  const playerScore = await prisma.eventScore.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: {
      xenoCores: { increment: cores },
      shipsDefeated: reason === 'ship_kill' ? { increment: 1 } : undefined,
      damageDealt: reason === 'boss_damage' ? { increment: cores } : undefined,
      defensesWon: reason === 'defense' ? { increment: 1 } : undefined,
    },
    create: {
      eventId,
      userId,
      coalitionId: user?.coalitionId,
      xenoCores: cores,
      shipsDefeated: reason === 'ship_kill' ? 1 : 0,
      damageDealt: reason === 'boss_damage' ? cores : 0,
      defensesWon: reason === 'defense' ? 1 : 0,
    },
  });

  console.log(`🏆 Awarded ${cores} Xeno Cores to player ${userId} (${reason})`);

  return {
    playerCores: playerScore.xenoCores,
    coalitionCores,
  };
}

/**
 * Record an attack launched (for stats)
 */
export async function recordAttackLaunched(eventId: string, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { coalitionId: true },
  });

  await prisma.eventScore.upsert({
    where: { eventId_userId: { eventId, userId } },
    update: {
      attacksLaunched: { increment: 1 },
    },
    create: {
      eventId,
      userId,
      coalitionId: user?.coalitionId,
      attacksLaunched: 1,
    },
  });
}

/**
 * Record a failed defense
 */
export async function recordDefenseLost(eventId: string, userId: string) {
  await prisma.eventScore.update({
    where: { eventId_userId: { eventId, userId } },
    data: { defensesLost: { increment: 1 } },
  }).catch(() => {
    // Score might not exist yet, that's ok
  });
}

/**
 * Get player's current score
 */
export async function getPlayerScore(eventId: string, userId: string) {
  return prisma.eventScore.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
}

/**
 * Get player's rank in the event
 */
export async function getPlayerRank(eventId: string, userId: string): Promise<number | null> {
  const score = await prisma.eventScore.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });

  if (!score) return null;

  const higherScores = await prisma.eventScore.count({
    where: { eventId, xenoCores: { gt: score.xenoCores } },
  });

  return higherScores + 1;
}

// =============================================================================
// LEADERBOARDS
// =============================================================================

/**
 * Get individual leaderboard
 */
export async function getEventLeaderboard(eventId: string, limit: number = 100) {
  const scores = await prisma.eventScore.findMany({
    where: { eventId },
    orderBy: { xenoCores: 'desc' },
    take: limit,
  });

  // Fetch usernames
  const userIds = scores.map((s) => s.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, coalitionId: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Fetch coalition names
  const coalitionIds = [...new Set(users.filter(u => u.coalitionId).map(u => u.coalitionId!))]
  const coalitions = await prisma.coalition.findMany({
    where: { id: { in: coalitionIds } },
    select: { id: true, name: true, tag: true },
  });
  const coalitionMap = new Map(coalitions.map((c) => [c.id, c]));

  return scores.map((score, index) => {
    const user = userMap.get(score.userId);
    const coalition = user?.coalitionId ? coalitionMap.get(user.coalitionId) : null;
    
    return {
      rank: index + 1,
      userId: score.userId,
      username: user?.username || 'Unknown',
      coalitionId: user?.coalitionId,
      coalitionTag: coalition?.tag,
      xenoCores: score.xenoCores,
      shipsDefeated: score.shipsDefeated,
      damageDealt: score.damageDealt,
      attacksLaunched: score.attacksLaunched,
      defensesWon: score.defensesWon,
      defensesLost: score.defensesLost,
    };
  });
}

/**
 * Get coalition leaderboard
 */
export async function getCoalitionLeaderboard(eventId: string, limit: number = 20) {
  // Aggregate scores by coalition
  const coalitionScores = await prisma.eventScore.groupBy({
    by: ['coalitionId'],
    where: {
      eventId,
      coalitionId: { not: null },
    },
    _sum: {
      xenoCores: true,
      shipsDefeated: true,
      damageDealt: true,
    },
    _count: {
      userId: true,
    },
    orderBy: {
      _sum: {
        xenoCores: 'desc',
      },
    },
    take: limit,
  });

  // Fetch coalition details
  const coalitionIds = coalitionScores
    .map((c) => c.coalitionId)
    .filter((id): id is string => id !== null);

  const coalitions = await prisma.coalition.findMany({
    where: { id: { in: coalitionIds } },
    select: { id: true, name: true, tag: true },
  });

  const coalitionMap = new Map(coalitions.map((c) => [c.id, c]));

  return coalitionScores.map((score, index) => ({
    rank: index + 1,
    coalitionId: score.coalitionId,
    coalitionName: coalitionMap.get(score.coalitionId!)?.name || 'Unknown',
    coalitionTag: coalitionMap.get(score.coalitionId!)?.tag || '???',
    memberCount: score._count.userId,
    totalXenoCores: score._sum.xenoCores || 0,
    totalShipsDefeated: score._sum.shipsDefeated || 0,
    totalDamageDealt: score._sum.damageDealt || 0,
  }));
}

/**
 * Get mothership damage leaderboard
 */
export async function getMothershipLeaderboard(eventId: string, limit: number = 50) {
  const mothership = await prisma.eventShip.findFirst({
    where: { eventId, shipType: 'mothership' },
  });

  if (!mothership) return [];

  const damages = await prisma.eventBossDamage.findMany({
    where: { eventId, bossShipId: mothership.id },
    orderBy: { damageDealt: 'desc' },
    take: limit,
  });

  // Fetch usernames
  const userIds = damages.map((d) => d.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Calculate total damage for percentage
  const totalDamage = damages.reduce((sum, d) => sum + d.damageDealt, 0);

  return damages.map((damage, index) => ({
    rank: index + 1,
    userId: damage.userId,
    username: userMap.get(damage.userId)?.username || 'Unknown',
    damageDealt: damage.damageDealt,
    damagePercent: totalDamage > 0 ? (damage.damageDealt / totalDamage) * 100 : 0,
    attacksLanded: damage.attacksLanded,
    wasKillingBlow: damage.wasKillingBlow,
  }));
}

// =============================================================================
// STATS
// =============================================================================

/**
 * Get event-wide stats
 */
export async function getEventStats(eventId: string) {
  const [
    totalPlayers,
    totalCores,
    totalShipsDefeated,
    topPlayer,
    topCoalition,
  ] = await Promise.all([
    prisma.eventScore.count({ where: { eventId } }),
    prisma.eventScore.aggregate({
      where: { eventId },
      _sum: { xenoCores: true },
    }),
    prisma.eventScore.aggregate({
      where: { eventId },
      _sum: { shipsDefeated: true },
    }),
    prisma.eventScore.findFirst({
      where: { eventId },
      orderBy: { xenoCores: 'desc' },
    }),
    prisma.eventScore.groupBy({
      by: ['coalitionId'],
      where: { eventId, coalitionId: { not: null } },
      _sum: { xenoCores: true },
      orderBy: { _sum: { xenoCores: 'desc' } },
      take: 1,
    }),
  ]);

  let topPlayerName: string | null = null;
  if (topPlayer) {
    const user = await prisma.user.findUnique({
      where: { id: topPlayer.userId },
      select: { username: true },
    });
    topPlayerName = user?.username || null;
  }

  let topCoalitionName: string | null = null;
  if (topCoalition.length > 0 && topCoalition[0].coalitionId) {
    const coalition = await prisma.coalition.findUnique({
      where: { id: topCoalition[0].coalitionId },
      select: { name: true },
    });
    topCoalitionName = coalition?.name || null;
  }

  return {
    totalPlayers,
    totalXenoCores: totalCores._sum.xenoCores || 0,
    totalShipsDefeated: totalShipsDefeated._sum.shipsDefeated || 0,
    topPlayer: topPlayer
      ? {
          userId: topPlayer.userId,
          username: topPlayerName,
          xenoCores: topPlayer.xenoCores,
        }
      : null,
    topCoalition: topCoalition.length > 0
      ? {
          coalitionId: topCoalition[0].coalitionId,
          name: topCoalitionName,
          totalXenoCores: topCoalition[0]._sum.xenoCores || 0,
        }
      : null,
  };
}


/**
 * Event Service
 *
 * Core event lifecycle management.
 * Handles event creation, activation, phase transitions, and queries.
 * Extensible for any event type.
 */

import prisma from '../../lib/prisma';
import {
  EVENT_TYPES,
  EVENT_CONFIGS,
  EventType,
  EventGlobalState,
  EventStatus,
  ALIEN_INVASION_CONFIG,
} from '../../constants/eventConfig';
import { gameEventsQueue } from '../../lib/jobQueue';
import { socketService } from '../socketService';
import { Prisma } from '@prisma/client';
import { spawnAllEventShips, cleanupEventShips } from './eventShipService';
import { triggerFinalRetaliationWave } from './eventRetaliationService';

// =============================================================================
// EVENT LIFECYCLE
// =============================================================================

/**
 * Create a new scheduled event
 */
export async function createEvent(
  type: EventType,
  name: string,
  startTime: Date,
  durationDays: number,
  customConfig?: Record<string, unknown>
) {
  const baseConfig = EVENT_CONFIGS[type]?.config;
  if (!baseConfig) {
    throw new Error(`Unknown event type: ${type}`);
  }

  const endTime = new Date(startTime);
  endTime.setDate(endTime.getDate() + durationDays);

  const retaliationTime = new Date(endTime);
  retaliationTime.setHours(
    retaliationTime.getHours() - baseConfig.timing.retaliationPhaseDurationHours
  );

  const event = await prisma.worldEvent.create({
    data: {
      type,
      name,
      status: 'scheduled',
      startTime,
      endTime,
      retaliationTime,
      config: JSON.parse(JSON.stringify({ ...baseConfig, ...customConfig })) as Prisma.InputJsonValue,
      globalState: JSON.parse(JSON.stringify(initializeGlobalState(type))) as Prisma.InputJsonValue,
    },
  });

  // Schedule event start job
  const startDelay = startTime.getTime() - Date.now();
  if (startDelay > 0) {
    await gameEventsQueue.add('event:start', { eventId: event.id }, { delay: startDelay });
  }

  // Schedule retaliation phase
  const retaliationDelay = retaliationTime.getTime() - Date.now();
  if (retaliationDelay > 0) {
    await gameEventsQueue.add(
      'event:retaliation-phase',
      { eventId: event.id },
      { delay: retaliationDelay }
    );
  }

  // Schedule event end
  const endDelay = endTime.getTime() - Date.now();
  if (endDelay > 0) {
    await gameEventsQueue.add('event:end', { eventId: event.id }, { delay: endDelay });
  }

  console.log(
    `📅 Event "${name}" scheduled: ${startTime.toISOString()} - ${endTime.toISOString()}`
  );
  return event;
}

/**
 * Initialize global state for event type
 */
function initializeGlobalState(type: EventType): EventGlobalState {
  switch (type) {
    case EVENT_TYPES.ALIEN_INVASION:
      return {
        mothershipCurrentHp: ALIEN_INVASION_CONFIG.mothership.baseHp,
        mothershipMaxHp: ALIEN_INVASION_CONFIG.mothership.baseHp,
        mothershipDefeated: false,
        mothershipKillerId: null,
        mothershipKillerCoalitionId: null,
        totalShipsDefeated: 0,
        currentDay: 1,
      };
    default:
      return {
        mothershipCurrentHp: 0,
        mothershipMaxHp: 0,
        mothershipDefeated: false,
        mothershipKillerId: null,
        mothershipKillerCoalitionId: null,
        totalShipsDefeated: 0,
        currentDay: 1,
      };
  }
}

/**
 * Activate event (called by job queue at startTime)
 */
export async function activateEvent(eventId: string) {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status !== 'scheduled') {
    console.warn(`Cannot activate event ${eventId}: not found or not scheduled`);
    return null;
  }

  // Update status
  const updatedEvent = await prisma.worldEvent.update({
    where: { id: eventId },
    data: { status: 'active' },
  });

  // Spawn all event ships (portal zone + player rings)
  await spawnAllEventShips(eventId);

  // Start recurring jobs for this event
  await scheduleRecurringEventJobs(eventId);

  // Notify all connected players
  socketService.emitToAll('event:started', {
    eventId,
    type: event.type,
    name: event.name,
    endTime: event.endTime,
  });

  console.log(`🚀 Event "${event.name}" is now ACTIVE`);
  return updatedEvent;
}

/**
 * Schedule recurring jobs for active event
 */
async function scheduleRecurringEventJobs(eventId: string) {
  // Heat decay every hour
  await gameEventsQueue.add(
    'event:heat-decay',
    { eventId },
    {
      repeat: { every: 60 * 60 * 1000 }, // Every hour
      jobId: `event-heat-decay-${eventId}`,
    }
  );

  // Retaliation check every 30 minutes
  await gameEventsQueue.add(
    'event:retaliation-check',
    { eventId },
    {
      repeat: { every: 30 * 60 * 1000 }, // Every 30 min
      jobId: `event-retaliation-check-${eventId}`,
    }
  );

  // Mothership weakening check every day
  await gameEventsQueue.add(
    'event:boss-weaken',
    { eventId },
    {
      repeat: { every: 24 * 60 * 60 * 1000 }, // Every 24 hours
      jobId: `event-boss-weaken-${eventId}`,
    }
  );

  // Ship respawn check every 5 minutes
  await gameEventsQueue.add(
    'event:ship-respawn',
    { eventId },
    {
      repeat: { every: 5 * 60 * 1000 }, // Every 5 min
      jobId: `event-ship-respawn-${eventId}`,
    }
  );

  console.log(`⏰ Scheduled recurring jobs for event ${eventId}`);
}

/**
 * Remove recurring jobs for an event
 */
async function removeRecurringEventJobs(eventId: string) {
  const repeatableJobs = await gameEventsQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.id?.includes(eventId)) {
      await gameEventsQueue.removeRepeatableByKey(job.key);
    }
  }
  console.log(`🛑 Removed recurring jobs for event ${eventId}`);
}

/**
 * Trigger final retaliation phase
 */
export async function triggerRetaliationPhase(eventId: string) {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status !== 'active') {
    console.warn(`Cannot trigger retaliation for event ${eventId}: not active`);
    return null;
  }

  const updatedEvent = await prisma.worldEvent.update({
    where: { id: eventId },
    data: { status: 'retaliation' },
  });

  // Notify all connected players
  socketService.emitToAll('event:retaliation-phase', { eventId, name: event.name });

  // Trigger final retaliation wave against all participants
  await triggerFinalRetaliationWave(eventId);

  console.log(`⚔️ Event "${event.name}" entering RETALIATION PHASE`);
  return updatedEvent;
}

/**
 * Distribute end-of-event rewards based on leaderboard rankings
 */
async function distributeEventRewards(eventId: string) {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event) return;

  console.log(`🏆 Distributing rewards for event: ${event.name}`);

  // Get final leaderboard
  const leaderboard = await prisma.eventScore.findMany({
    where: { eventId },
    orderBy: { xenoCores: 'desc' },
  });

  // Bonus rewards by rank (Xeno Cores)
  const rankBonuses: Record<number, number> = {
    1: 5000,  // 1st place
    2: 3500,  // 2nd place
    3: 2500,  // 3rd place
    4: 1500,
    5: 1000,
    6: 750,
    7: 500,
    8: 400,
    9: 300,
    10: 200,
  };

  let rewardsDistributed = 0;

  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const rank = i + 1;
    const bonus = rankBonuses[rank] || (rank <= 25 ? 100 : rank <= 50 ? 50 : 0);

    if (bonus > 0) {
      // Store reward info in claimedRewards JSON
      await prisma.eventScore.update({
        where: { id: entry.id },
        data: {
          claimedRewards: {
            rank,
            bonusXenoCores: bonus,
            totalXenoCores: entry.xenoCores + bonus,
            claimedAt: new Date().toISOString(),
          },
        },
      });

      // Send inbox message
      await prisma.inboxMessage.create({
        data: {
          userId: entry.userId,
          type: 'event_reward',
          title: `${event.name} - Final Results`,
          content: JSON.stringify({
            eventName: event.name,
            rank,
            xenoCoresEarned: entry.xenoCores,
            bonusXenoCores: bonus,
            shipsDefeated: entry.shipsDefeated,
            damageDealt: entry.damageDealt,
          }),
          isRead: false,
        },
      });

      rewardsDistributed++;
    }
  }

  console.log(`🎁 Distributed rewards to ${rewardsDistributed} players`);
}

/**
 * End event and distribute rewards
 */
export async function endEvent(eventId: string) {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    console.warn(`Cannot end event ${eventId}: not found`);
    return null;
  }

  // Update status
  const updatedEvent = await prisma.worldEvent.update({
    where: { id: eventId },
    data: { status: 'ended' },
  });

  // Stop recurring jobs
  await removeRecurringEventJobs(eventId);

  // Distribute rewards based on final rankings
  await distributeEventRewards(eventId);

  // Cleanup event ships
  await cleanupEventShips(eventId);

  // Notify all connected players
  socketService.emitToAll('event:ended', { eventId, name: event.name });

  console.log(`🏁 Event "${event.name}" has ENDED`);
  return updatedEvent;
}

// =============================================================================
// EVENT QUERIES
// =============================================================================

/**
 * Get the currently active event (if any)
 */
export async function getActiveEvent() {
  return prisma.worldEvent.findFirst({
    where: { status: { in: ['active', 'retaliation'] } },
    orderBy: { startTime: 'desc' },
  });
}

/**
 * Get event by ID with optional includes
 */
export async function getEventById(eventId: string) {
  return prisma.worldEvent.findUnique({
    where: { id: eventId },
  });
}

/**
 * Get active event with player-specific data
 */
export async function getActiveEventForPlayer(userId: string) {
  const event = await prisma.worldEvent.findFirst({
    where: { status: { in: ['active', 'retaliation'] } },
    include: {
      scores: {
        where: { userId },
      },
      heatTrackers: {
        where: { userId },
      },
    },
  });

  if (!event) return null;

  // Get player's ships (ring ships)
  const playerShips = await prisma.eventShip.findMany({
    where: {
      eventId: event.id,
      ownerUserId: userId,
      isDefeated: false,
    },
  });

  // Get portal zone ships
  const portalShips = await prisma.eventShip.findMany({
    where: {
      eventId: event.id,
      zoneType: 'portal',
      isDefeated: false,
    },
  });

  // Get leaderboard position
  const playerRank = await getPlayerRank(event.id, userId);

  // Get top 10 leaderboard
  const leaderboard = await getEventLeaderboard(event.id, 10);

  return {
    ...event,
    playerShips,
    portalShips,
    playerRank,
    leaderboard,
    playerScore: event.scores[0] || null,
    playerHeat: event.heatTrackers[0] || null,
  };
}

/**
 * Get event leaderboard
 */
export async function getEventLeaderboard(eventId: string, limit: number = 100) {
  const scores = await prisma.eventScore.findMany({
    where: { eventId },
    orderBy: { xenoCores: 'desc' },
    take: limit,
  });

  // Fetch usernames for the scores
  const userIds = scores.map((s) => s.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, coalitionId: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return scores.map((score, index) => ({
    rank: index + 1,
    userId: score.userId,
    username: userMap.get(score.userId)?.username || 'Unknown',
    coalitionId: userMap.get(score.userId)?.coalitionId,
    xenoCores: score.xenoCores,
    shipsDefeated: score.shipsDefeated,
    damageDealt: score.damageDealt,
  }));
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
    orderBy: {
      _sum: {
        xenoCores: 'desc',
      },
    },
    take: limit,
  });

  // Fetch coalition names
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
    totalXenoCores: score._sum.xenoCores || 0,
    totalShipsDefeated: score._sum.shipsDefeated || 0,
    totalDamageDealt: score._sum.damageDealt || 0,
  }));
}

/**
 * Get player's rank in the event
 */
async function getPlayerRank(eventId: string, userId: string): Promise<number | null> {
  const score = await prisma.eventScore.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });

  if (!score) return null;

  const higherScores = await prisma.eventScore.count({
    where: { eventId, xenoCores: { gt: score.xenoCores } },
  });

  return higherScores + 1;
}

/**
 * Get all scheduled and active events
 */
export async function listEvents(includeEnded: boolean = false) {
  const statusFilter = includeEnded
    ? {}
    : { status: { in: ['scheduled', 'active', 'retaliation'] as EventStatus[] } };

  return prisma.worldEvent.findMany({
    where: statusFilter,
    orderBy: { startTime: 'desc' },
  });
}

// =============================================================================
// EVENT STATE UPDATES
// =============================================================================

/**
 * Update event global state
 */
export async function updateEventGlobalState(
  eventId: string,
  updates: Partial<EventGlobalState>
) {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event) return null;

  const currentState = (event.globalState as unknown as EventGlobalState) || {};
  const newState: Record<string, unknown> = { ...currentState };

  // Handle increment operations
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'object' && value !== null && 'increment' in value) {
      const currentVal = currentState[key as keyof EventGlobalState];
      if (typeof currentVal === 'number') {
        newState[key] = currentVal + (value as { increment: number }).increment;
      }
    } else {
      newState[key] = value;
    }
  }

  return prisma.worldEvent.update({
    where: { id: eventId },
    data: { globalState: newState as Prisma.InputJsonValue },
  });
}

/**
 * Increment event day (for daily boss weakening)
 */
export async function incrementEventDay(eventId: string) {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event) return null;

  const currentState = (event.globalState as unknown as EventGlobalState) || { currentDay: 1 };
  const newDay = (currentState.currentDay || 1) + 1;

  return updateEventGlobalState(eventId, { currentDay: newDay });
}

// =============================================================================
// DEV/TEST HELPERS
// =============================================================================

/**
 * Force start an event immediately (for testing)
 */
export async function forceStartEvent(eventId: string) {
  // Update times to now
  const now = new Date();
  await prisma.worldEvent.update({
    where: { id: eventId },
    data: {
      startTime: now,
      status: 'scheduled', // Reset to scheduled so activate works
    },
  });

  return activateEvent(eventId);
}

/**
 * Create and immediately start a test event
 */
export async function createTestEvent(durationMinutes: number = 60) {
  const now = new Date();
  const endTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
  const retaliationTime = new Date(endTime.getTime() - 10 * 60 * 1000); // 10 min before end

  const event = await prisma.worldEvent.create({
    data: {
      type: EVENT_TYPES.ALIEN_INVASION,
      name: `Test Invasion ${now.toISOString()}`,
      status: 'active',
      startTime: now,
      endTime,
      retaliationTime,
      config: JSON.parse(JSON.stringify(ALIEN_INVASION_CONFIG)) as Prisma.InputJsonValue,
      globalState: JSON.parse(JSON.stringify(initializeGlobalState(EVENT_TYPES.ALIEN_INVASION))) as Prisma.InputJsonValue,
    },
  });

  // Spawn all event ships (portal zone + player rings)
  await spawnAllEventShips(event.id);

  // Start recurring jobs
  await scheduleRecurringEventJobs(event.id);

  console.log(`🧪 Created test event: ${event.id} (ends in ${durationMinutes} minutes)`);
  return event;
}

/**
 * Delete an event and all related data (for testing)
 */
export async function deleteEvent(eventId: string) {
  // Remove recurring jobs
  await removeRecurringEventJobs(eventId);

  // Cascade delete will handle related records
  await prisma.worldEvent.delete({ where: { id: eventId } });

  console.log(`🗑️ Deleted event: ${eventId}`);
}


/**
 * BullMQ Job Queue Configuration
 * 
 * This module provides the central queue configuration for game events.
 * The architecture is designed to be modular:
 * 
 * 1. DEVELOPMENT: Workers run in-process alongside the main server
 * 2. PRODUCTION: Workers can be spawned as separate processes/containers
 * 3. SCALE: Multiple worker instances can consume from the same queue
 * 
 * Redis connection is configured via environment variables:
 * - REDIS_HOST (default: localhost)
 * - REDIS_PORT (default: 6379)
 * - REDIS_PASSWORD (optional)
 */

import { Queue, QueueEvents } from 'bullmq';

// Redis connection configuration (use options object, not IORedis instance)
export const redisConnectionOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null as null, // Required by BullMQ
};

/**
 * Game Events Queue
 * Handles: Fleet arrivals, Combat resolution, Resource collection, etc.
 */
export const gameEventsQueue = new Queue('GameEvents', {
    connection: redisConnectionOptions,
    defaultJobOptions: {
        attempts: 3, // Retry failed jobs 3 times
        backoff: {
            type: 'exponential',
            delay: 1000, // Start with 1s delay, doubles each retry
        },
        removeOnComplete: {
            age: 3600, // Keep completed jobs for 1 hour
            count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
            age: 86400, // Keep failed jobs for 24 hours for debugging
        },
    },
});

// Log queue events
gameEventsQueue.on('error', (err) => {
    console.error('❌ Queue error:', err.message);
});

// Queue events for monitoring (optional)
export const gameEventsQueueEvents = new QueueEvents('GameEvents', {
    connection: redisConnectionOptions,
});

/**
 * Job type definitions for type safety
 */
export interface FleetArrivalJob {
    fleetId: string;
    toPlanetId: string;
    type: 'attack' | 'support' | 'scout';
}

export interface FleetReturnJob {
    fleetId: string;
    fromPlanetId: string;
}

export interface CombatResolveJob {
    fleetId: string;
    attackerPlanetId: string;
    defenderPlanetId: string;
}

export interface NpcRespawnJob {
    planetId: string;
}

/**
 * Queue job to process a fleet arrival
 */
export async function queueFleetArrival(data: FleetArrivalJob, arriveAt: Date) {
    const delay = Math.max(0, arriveAt.getTime() - Date.now());

    await gameEventsQueue.add('fleet:arrival', data, {
        delay,
        jobId: `fleet-arrival-${data.fleetId}`, // Prevent duplicate jobs
    });

    console.log(`📤 Queued fleet arrival: ${data.fleetId} (delay: ${Math.round(delay / 1000)}s)`);
}

/**
 * Queue job to process a fleet return
 */
export async function queueFleetReturn(data: FleetReturnJob, arriveAt: Date) {
    const delay = Math.max(0, arriveAt.getTime() - Date.now());

    await gameEventsQueue.add('fleet:return', data, {
        delay,
        jobId: `fleet-return-${data.fleetId}`,
    });

    console.log(`📤 Queued fleet return: ${data.fleetId} (delay: ${Math.round(delay / 1000)}s)`);
}

/**
 * Queue job to respawn an NPC after delay
 */
export async function queueNpcRespawn(data: NpcRespawnJob, delaySeconds: number) {
    await gameEventsQueue.add('npc:respawn', data, {
        delay: delaySeconds * 1000,
        jobId: `npc-respawn-${data.planetId}-${Date.now()}`, // Allow multiple respawn jobs over time
    });

    console.log(`📤 Queued NPC respawn: ${data.planetId} (delay: ${delaySeconds}s)`);
}

/**
 * Get queue statistics for monitoring
 */
export async function getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
        gameEventsQueue.getWaitingCount(),
        gameEventsQueue.getActiveCount(),
        gameEventsQueue.getCompletedCount(),
        gameEventsQueue.getFailedCount(),
        gameEventsQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
}

/**
 * Graceful shutdown
 */
export async function closeQueues() {
    await gameEventsQueue.close();
    await gameEventsQueueEvents.close();
    console.log('📴 Job queues closed');
}

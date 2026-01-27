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
 * - QUEUE_PREFIX (default: 'prod') - isolates dev/prod queues
 */

import { Queue, QueueEvents } from 'bullmq';
import { createClient } from 'redis';
import { logError, isRedisReadOnlyError } from './errorLogger';

// Environment-specific queue prefix to isolate dev/prod
// Default to 'prod' for safety - dev must explicitly set QUEUE_PREFIX=dev
const QUEUE_PREFIX = process.env.QUEUE_PREFIX || 'prod';
const QUEUE_NAME = `${QUEUE_PREFIX}_GameEvents`;

// Export for use in worker
export { QUEUE_NAME };

// Redis connection configuration (use options object, not IORedis instance)
export const redisConnectionOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null as null, // Required by BullMQ
    // Retry strategy for connection failures
    retryStrategy: (times: number) => {
        if (times > 20) {
            logError('REDIS_CONNECTION', `BullMQ giving up after ${times} retries`, {
                component: 'jobQueue'
            });
            return null; // Stop retrying
        }
        const delay = Math.min(times * 100, 5000);
        logError('REDIS_CONNECTION', `BullMQ reconnect attempt ${times}, next retry in ${delay}ms`, {
            component: 'jobQueue',
            attempt: times
        });
        return delay;
    },
    // Enable auto-reconnect
    enableReadyCheck: true,
    reconnectOnError: (err: Error) => {
        // Reconnect on READONLY errors (Redis replica mode)
        if (isRedisReadOnlyError(err)) {
            logError('REDIS_READONLY', err, { component: 'jobQueue' });
            return true;
        }
        return false;
    },
};

/**
 * Game Events Queue
 * Handles: Fleet arrivals, Combat resolution, Resource collection, etc.
 */
export const gameEventsQueue = new Queue(QUEUE_NAME, {
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

// Log queue errors with proper categorization
gameEventsQueue.on('error', (err) => {
    const category = isRedisReadOnlyError(err) ? 'REDIS_READONLY' : 'QUEUE_ERROR';
    logError(category, err, {
        component: 'gameEventsQueue',
        queueName: QUEUE_NAME
    });
});

// Queue events for monitoring (optional)
export const gameEventsQueueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisConnectionOptions,
});

gameEventsQueueEvents.on('error', (err) => {
    const category = isRedisReadOnlyError(err) ? 'REDIS_READONLY' : 'QUEUE_ERROR';
    logError(category, err, {
        component: 'gameEventsQueueEvents',
        queueName: QUEUE_NAME
    });
});

/**
 * Job type definitions for type safety
 */
export interface FleetArrivalJob {
    fleetId: string;
    toPlanetId: string | null;
    toCapitalShipId?: string | null;
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

// No data needed - this is a scheduled tick
export interface ProbeUpdateJob {
    tick: number; // Just a counter for logging
}

// =============================================================================
// EVENT SYSTEM JOB TYPES
// =============================================================================

export interface EventStartJob {
    eventId: string;
}

export interface EventEndJob {
    eventId: string;
}

export interface EventRetaliationPhaseJob {
    eventId: string;
}

export interface EventHeatDecayJob {
    eventId: string;
}

export interface EventRetaliationCheckJob {
    eventId: string;
}

export interface EventBossWeakenJob {
    eventId: string;
}

export interface EventShipRespawnJob {
    eventId: string;
}

export interface RetaliationArrivalJob {
    retaliationId: string;
}

export interface RetaliationArriveJob {
    retaliationId: string;
}

export interface EventFleetArrivalJob {
    fleetId: string;
    eventId: string;
    shipId: string;
}

// =============================================================================
// THREAT DETECTION JOB
// =============================================================================

export interface ThreatDetectionJob {
    fleetId: string;
    defenderId: string;
    targetPlanetId: string;
    attackerName: string;
    radarLevel: number;
    phase?: number;  // Which fidelity phase to notify for (1-4), undefined = first detection
}

// =============================================================================
// CAPITAL SHIP JOB TYPES
// =============================================================================

export interface CapitalShipArrivalJob {
    capitalShipId: string;
}

export interface CapitalShipReturnJob {
    capitalShipId: string;
}

export interface CapitalShipCommitmentEndJob {
    capitalShipId: string;
}

export interface CapitalShipFleetArrivalJob {
    fleetId: string;
    capitalShipId: string;
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
 * Queue job to process an event attack fleet arrival
 */
export async function queueEventFleetArrival(data: EventFleetArrivalJob, arriveAt: Date) {
    const delay = Math.max(0, arriveAt.getTime() - Date.now());

    await gameEventsQueue.add('fleet:event-arrival', data, {
        delay,
        jobId: `event-fleet-arrival-${data.fleetId}`,
    });

    console.log(`👾 Queued event fleet arrival: ${data.fleetId} → ship ${data.shipId} (delay: ${Math.round(delay / 1000)}s)`);
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
 * Queue job to notify defender of incoming threat when fleet enters detection range
 */
export async function queueThreatDetection(data: ThreatDetectionJob, detectionTime: Date) {
    const delay = Math.max(0, detectionTime.getTime() - Date.now());

    await gameEventsQueue.add('threat:detection', data, {
        delay,
        jobId: `threat-detect-${data.fleetId}`, // Prevent duplicate jobs
    });

    console.log(`📡 Queued threat detection: fleet ${data.fleetId} → ${data.targetPlanetId} (delay: ${Math.round(delay / 1000)}s)`);
}

/**
 * Queue job for Capital Ship arrival at deployment location
 */
export async function queueCapitalShipArrival(data: CapitalShipArrivalJob, arriveAt: Date) {
    const delay = Math.max(0, arriveAt.getTime() - Date.now());

    await gameEventsQueue.add('capitalship:arrival', data, {
        delay,
        jobId: `capitalship-arrival-${data.capitalShipId}`,
    });

    console.log(`🚀 Queued Capital Ship arrival: ${data.capitalShipId} (delay: ${Math.round(delay / 1000)}s)`);
}

/**
 * Queue job for Capital Ship return to home planet
 */
export async function queueCapitalShipReturn(data: CapitalShipReturnJob, arriveAt: Date) {
    const delay = Math.max(0, arriveAt.getTime() - Date.now());

    await gameEventsQueue.add('capitalship:return', data, {
        delay,
        jobId: `capitalship-return-${data.capitalShipId}`,
    });

    console.log(`🏠 Queued Capital Ship return: ${data.capitalShipId} (delay: ${Math.round(delay / 1000)}s)`);
}

/**
 * Queue job for fleet attacking a Capital Ship
 */
export async function queueCapitalShipFleetArrival(data: CapitalShipFleetArrivalJob, arriveAt: Date) {
    const delay = Math.max(0, arriveAt.getTime() - Date.now());

    await gameEventsQueue.add('capitalship:fleet-arrival', data, {
        delay,
        jobId: `capitalship-fleet-arrival-${data.fleetId}`,
    });

    console.log(`⚔️ Queued Capital Ship attack: fleet ${data.fleetId} → ship ${data.capitalShipId} (delay: ${Math.round(delay / 1000)}s)`);
}

/**
 * Queue job for when a Capital Ship's commitment period ends (auto-return)
 */
export async function queueCapitalShipCommitmentEnd(data: CapitalShipCommitmentEndJob, endAt: Date) {
    const delay = Math.max(0, endAt.getTime() - Date.now());

    await gameEventsQueue.add('capitalship:commitment-end', data, {
        delay,
        jobId: `capitalship-commitment-end-${data.capitalShipId}`,
    });

    console.log(`⏰ Queued Capital Ship commitment end: ${data.capitalShipId} (delay: ${Math.round(delay / 1000)}s)`);
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
 * Get delayed jobs for debugging
 */
export async function getDelayedJobs() {
    const jobs = await gameEventsQueue.getDelayed(0, 10);
    return jobs.map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        delay: job.opts.delay,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
    }));
}

/**
 * Start the probe update scheduler (repeats every 60 seconds)
 */
export async function startProbeUpdateScheduler() {
    // Remove any existing repeatable job first (in case config changed)
    const repeatableJobs = await gameEventsQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        if (job.name === 'probe:update') {
            await gameEventsQueue.removeRepeatableByKey(job.key);
        }
    }

    // Add new repeatable job - runs every 60 seconds
    await gameEventsQueue.add(
        'probe:update',
        { tick: 0 },
        {
            repeat: {
                every: 60000, // 60 seconds
            },
            jobId: 'probe-update-scheduler', // Consistent ID
        }
    );

    console.log('🛸 Probe update scheduler started (every 60s)');
}

/**
 * Graceful shutdown
 */
export async function closeQueues() {
    await gameEventsQueue.close();
    await gameEventsQueueEvents.close();
    console.log('📴 Job queues closed');
}

/**
 * Check if Redis is healthy and writable.
 * Used by the /health endpoint.
 */
export async function checkRedisHealth(): Promise<boolean> {
    const redisUrl = `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;
    let client;

    try {
        client = createClient({
            url: redisUrl,
            socket: {
                connectTimeout: 2000, // 2 second timeout
            }
        });

        // Don't let error events throw during health check
        client.on('error', () => { });

        await client.connect();

        // Try a simple PING
        const pong = await client.ping();

        // Try a write operation to detect read-only mode
        const testKey = '__health_check__';
        await client.set(testKey, Date.now().toString(), { EX: 10 });
        await client.del(testKey);

        await client.quit();

        return pong === 'PONG';
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // Don't log routine health check failures as errors
        // Only log if it's a READONLY issue (which indicates the core problem)
        if (isRedisReadOnlyError(error)) {
            logError('REDIS_READONLY', error, { component: 'healthCheck' });
        }

        // Try to close the client if it exists
        try {
            if (client) await client.quit();
        } catch {
            // Ignore close errors
        }

        return false;
    }
}

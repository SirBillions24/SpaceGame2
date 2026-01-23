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
import { createClient } from 'redis';
import { logError, isRedisReadOnlyError } from './errorLogger';

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

// Log queue errors with proper categorization
gameEventsQueue.on('error', (err) => {
    const category = isRedisReadOnlyError(err) ? 'REDIS_READONLY' : 'QUEUE_ERROR';
    logError(category, err, { 
        component: 'gameEventsQueue',
        queueName: 'GameEvents'
    });
});

// Queue events for monitoring (optional)
export const gameEventsQueueEvents = new QueueEvents('GameEvents', {
    connection: redisConnectionOptions,
});

gameEventsQueueEvents.on('error', (err) => {
    const category = isRedisReadOnlyError(err) ? 'REDIS_READONLY' : 'QUEUE_ERROR';
    logError(category, err, { 
        component: 'gameEventsQueueEvents',
        queueName: 'GameEvents'
    });
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

// No data needed - this is a scheduled tick
export interface ProbeUpdateJob {
    tick: number; // Just a counter for logging
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
        client.on('error', () => {});
        
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

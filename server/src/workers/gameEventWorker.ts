/**
 * Game Events Worker
 * 
 * This worker processes game events from the BullMQ queue.
 * It can run:
 *   1. In-process: Started alongside the main server (development/small scale)
 *   2. Standalone: Run as `npx ts-node src/workers/gameEventWorker.ts` (production/scale)
 * 
 * The worker handles:
 *   - Fleet arrivals (attack, support, scout)
 *   - Fleet returns (bringing loot home)
 *   - Combat resolution
 * 
 * To run as a separate process for horizontal scaling:
 *   REDIS_HOST=localhost REDIS_PORT=6379 npx ts-node src/workers/gameEventWorker.ts
 */

import { Worker, Job } from 'bullmq';
import prisma from '../lib/prisma';
import { resolveCombat } from '../services/combatService';
import { syncPlanetResources } from '../services/planetService';
import { relocateNpc } from '../services/pveService';
import { FleetArrivalJob, FleetReturnJob, redisConnectionOptions } from '../lib/jobQueue';

/**
 * Process fleet arrival at destination
 */
async function processFleetArrival(job: Job<FleetArrivalJob>) {
    const { fleetId, type } = job.data;
    console.log(`⚔️ Processing fleet arrival: ${fleetId} (type: ${type})`);

    const fleet = await prisma.fleet.findUnique({
        where: { id: fleetId },
        include: { toPlanet: true },
    });

    if (!fleet) {
        console.warn(`Fleet ${fleetId} not found, skipping`);
        return;
    }

    // Check if already processed (idempotency)
    if (fleet.status !== 'enroute') {
        console.log(`Fleet ${fleetId} already processed (status: ${fleet.status}), skipping`);
        return;
    }

    // Mark as processing to prevent duplicate processing
    await prisma.fleet.update({
        where: { id: fleetId },
        data: { status: 'arrived' },
    });

    // Sync resources for target planet
    await syncPlanetResources(fleet.toPlanetId);

    if (type === 'attack') {
        // Resolve combat
        const combatResult = await resolveCombat(fleetId);

        // Handle NPC attack count and relocation
        const targetPlanet = await prisma.planet.findUnique({ where: { id: fleet.toPlanetId } });
        if (targetPlanet && targetPlanet.isNpc) {
            const updatedNpc = await prisma.planet.update({
                where: { id: targetPlanet.id },
                data: { attackCount: { increment: 1 } },
            });

            if (updatedNpc.attackCount >= (updatedNpc.maxAttacks || 15)) {
                await relocateNpc(updatedNpc.id);
            }
        }

        // Handle loot atomically
        let resourcesJson = null;
        if (combatResult.resourcesJson) {
            const requestedLoot = JSON.parse(combatResult.resourcesJson);

            const actualLoot = await prisma.$transaction(async (tx) => {
                const tPlanet = await tx.planet.findUnique({ where: { id: fleet.toPlanetId } });
                if (!tPlanet) return { carbon: 0, titanium: 0, food: 0 };

                const loot = {
                    carbon: Math.min(Math.max(0, requestedLoot.carbon), tPlanet.carbon),
                    titanium: Math.min(Math.max(0, requestedLoot.titanium), tPlanet.titanium),
                    food: Math.min(Math.max(0, requestedLoot.food), tPlanet.food),
                };

                await tx.planet.update({
                    where: { id: fleet.toPlanetId },
                    data: {
                        carbon: { decrement: loot.carbon },
                        titanium: { decrement: loot.titanium },
                        food: { decrement: loot.food },
                    },
                });

                return loot;
            });

            resourcesJson = JSON.stringify(actualLoot);
        }

        // Create battle report
        await prisma.battleReport.create({
            data: {
                fleetId: fleet.id,
                attackerId: fleet.ownerId,
                defenderId: fleet.toPlanet.ownerId,
                attackerPlanetId: fleet.fromPlanetId,
                defenderPlanetId: fleet.toPlanetId,
                winner: combatResult.winner,
                laneResultsJson: JSON.stringify({
                    sectors: combatResult.sectorResults,
                    surface: combatResult.surfaceResult,
                    admirals: {
                        attacker: combatResult.attackerAdmiral,
                        defender: combatResult.defenderAdmiral,
                    },
                }),
                attackerTotalLossesJson: JSON.stringify(combatResult.attackerTotalLosses),
                defenderTotalLossesJson: JSON.stringify(combatResult.defenderTotalLosses),
                resourcesJson: resourcesJson,
            },
        });

        // Calculate survivors and return trip
        const initialUnits = JSON.parse(fleet.unitsJson);
        const survivingUnits: Record<string, number> = {};
        let totalSurvivors = 0;

        for (const [u, count] of Object.entries(initialUnits)) {
            const loss = combatResult.attackerTotalLosses[u] || 0;
            const survivors = Math.max(0, (count as number) - loss);
            if (survivors > 0) {
                survivingUnits[u] = survivors;
                totalSurvivors += survivors;
            }
        }

        if (totalSurvivors > 0) {
            const originalDuration = fleet.arriveAt.getTime() - fleet.departAt.getTime();
            const returnArrival = new Date(Date.now() + originalDuration);

            await prisma.fleet.update({
                where: { id: fleet.id },
                data: {
                    status: 'returning',
                    unitsJson: JSON.stringify(survivingUnits),
                    departAt: new Date(),
                    arriveAt: returnArrival,
                    cargoJson: resourcesJson,
                },
            });

            // Queue the return job
            const { queueFleetReturn } = await import('../lib/jobQueue');
            await queueFleetReturn({ fleetId: fleet.id, fromPlanetId: fleet.fromPlanetId }, returnArrival);
        } else {
            await prisma.fleet.update({
                where: { id: fleet.id },
                data: { status: 'destroyed' },
            });
        }
    } else if (type === 'support') {
        // Add units to target planet
        const units = JSON.parse(fleet.unitsJson);
        for (const [unitType, count] of Object.entries(units)) {
            await prisma.planetUnit.upsert({
                where: { planetId_unitType: { planetId: fleet.toPlanetId, unitType } },
                update: { count: { increment: count as number } },
                create: { planetId: fleet.toPlanetId, unitType, count: count as number },
            });
        }

        await prisma.fleet.update({
            where: { id: fleet.id },
            data: { status: 'completed' },
        });
    } else if (type === 'scout') {
        await prisma.fleet.update({
            where: { id: fleet.id },
            data: { status: 'completed' },
        });
    }

    console.log(`✅ Fleet ${fleetId} processed successfully`);
}

/**
 * Process fleet returning home with loot
 */
async function processFleetReturn(job: Job<FleetReturnJob>) {
    const { fleetId } = job.data;
    console.log(`🏠 Processing fleet return: ${fleetId}`);

    const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.fleet.updateMany({
            where: { id: fleetId, status: 'returning' },
            data: { status: 'completed' },
        });

        if (updated.count === 0) {
            console.log(`Fleet ${fleetId} already processed, skipping`);
            return null;
        }

        const fleet = await tx.fleet.findUnique({ where: { id: fleetId } });
        if (!fleet) return null;

        // Add loot to home planet
        const loot = typeof fleet.cargoJson === 'string' ? JSON.parse(fleet.cargoJson) : fleet.cargoJson;
        if (loot) {
            await tx.planet.update({
                where: { id: fleet.fromPlanetId },
                data: {
                    carbon: { increment: loot.carbon || 0 },
                    titanium: { increment: loot.titanium || 0 },
                    food: { increment: loot.food || 0 },
                },
            });
        }

        // Add units back to home planet
        const units = JSON.parse(fleet.unitsJson);
        for (const [unitType, count] of Object.entries(units)) {
            await tx.planetUnit.upsert({
                where: { planetId_unitType: { planetId: fleet.fromPlanetId, unitType } },
                update: { count: { increment: count as number } },
                create: { planetId: fleet.fromPlanetId, unitType, count: count as number },
            });
        }

        return fleet;
    });

    if (result) {
        console.log(`✅ Fleet ${fleetId} returned home successfully`);
    }
}

/**
 * Create and start the worker
 */
export function createGameEventsWorker() {
    const worker = new Worker(
        'GameEvents',
        async (job) => {
            try {
                switch (job.name) {
                    case 'fleet:arrival':
                        await processFleetArrival(job as Job<FleetArrivalJob>);
                        break;
                    case 'fleet:return':
                        await processFleetReturn(job as Job<FleetReturnJob>);
                        break;
                    default:
                        console.warn(`Unknown job type: ${job.name}`);
                }
            } catch (error) {
                console.error(`Error processing job ${job.name}:`, error);
                throw error; // Re-throw to trigger retry
            }
        },
        {
            connection: redisConnectionOptions,
            concurrency: 5, // Process 5 jobs at a time
        }
    );

    worker.on('completed', (job) => {
        console.log(`📋 Job ${job.id} (${job.name}) completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`❌ Job ${job?.id} (${job?.name}) failed:`, err.message);
    });

    console.log('🔧 Game Events Worker started');
    return worker;
}

// If running as standalone process
if (require.main === module) {
    console.log('🚀 Starting Game Events Worker as standalone process...');
    createGameEventsWorker();
}

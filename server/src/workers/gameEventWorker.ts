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
import { updateProbes } from '../services/espionageService';
import { transferHarvesterOwnership } from '../services/harvesterService';
import { FleetArrivalJob, FleetReturnJob, NpcRespawnJob, ProbeUpdateJob, redisConnectionOptions, queueNpcRespawn } from '../lib/jobQueue';
import { NPC_BALANCE } from '../constants/npcBalanceData';

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

        // Handle NPC attack count, gear drop, and respawn queuing
        // IMPORTANT: Harvesters are permanent and never respawn - skip this logic for them
        const targetPlanet = await prisma.planet.findUnique({ where: { id: fleet.toPlanetId } });
        if (targetPlanet && targetPlanet.isNpc && (targetPlanet as any).planetType !== 'harvester') {
            const maxHits = targetPlanet.maxAttacks || 15;
            const previousCount = targetPlanet.attackCount;

            // Only process if NPC hasn't already reached max attacks (prevents duplicate processing)
            if (previousCount >= maxHits) {
                console.log(`⚠️ NPC ${targetPlanet.id} already at max attacks, skipping`);
            } else {
                const updatedNpc = await prisma.planet.update({
                    where: { id: targetPlanet.id },
                    data: { attackCount: { increment: 1 } },
                });
                const newCount = updatedNpc.attackCount;

                // Handle gear drop on victory (probabilistic based on remaining hits)
                // Chance increases as hits remaining decreases, guaranteed on final hit
                if (combatResult.winner === 'attacker' && updatedNpc.npcLootGearId) {
                    const hitsRemaining = maxHits - newCount;

                    // Drop probability: 1/(remaining_hits + 1) - guarantees drop on last hit
                    const dropChance = 1 / (hitsRemaining + 1);
                    const roll = Math.random();

                    if (roll < dropChance) {
                        await prisma.gearPiece.update({
                            where: { id: updatedNpc.npcLootGearId },
                            data: { userId: fleet.ownerId },
                        });
                        await prisma.planet.update({
                            where: { id: updatedNpc.id },
                            data: { npcLootGearId: null },
                        });
                        console.log(`🎁 Gear ${updatedNpc.npcLootGearId} dropped (hit ${newCount}/${maxHits}, ${Math.round(dropChance * 100)}% chance)`);
                    }
                }

                // Queue respawn ONLY when attackCount first reaches maxAttacks
                // This prevents multiple respawn jobs from being queued
                if (newCount === maxHits) {
                    console.log(`🔄 NPC ${updatedNpc.id} reached max attacks, queuing respawn in ${NPC_BALANCE.respawn.delaySeconds}s`);
                    await queueNpcRespawn({ planetId: updatedNpc.id }, NPC_BALANCE.respawn.delaySeconds);
                }
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

        // Check for Harvester conquest - if attacker wins, they take over
        const targetPlanetForConquest = await prisma.planet.findUnique({ where: { id: fleet.toPlanetId } });
        if (targetPlanetForConquest && (targetPlanetForConquest as any).planetType === 'harvester' && combatResult.winner === 'attacker' && totalSurvivors > 0) {
            console.log(`🏴 Harvester conquest! ${fleet.ownerId} conquers ${fleet.toPlanetId}`);

            // Transfer ownership - survivors stay on the Harvester
            await transferHarvesterOwnership(fleet.toPlanetId, fleet.ownerId, survivingUnits);

            // Mark fleet as completed (no return trip)
            await prisma.fleet.update({
                where: { id: fleet.id },
                data: { status: 'completed' },
            });

            // Release admiral if assigned
            if (fleet.admiralId) {
                await prisma.admiral.update({
                    where: { id: fleet.admiralId },
                    data: { stationedPlanetId: fleet.toPlanetId },
                });
            }

            console.log(`✅ Harvester ${fleet.toPlanetId} now owned by ${fleet.ownerId} with ${totalSurvivors} units stationed`);
        } else if (totalSurvivors > 0) {
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

        // Restore borrowed troops to defense layout from reserves
        if ((fleet as any).borrowedFromDefenseJson) {
            const borrowed = JSON.parse((fleet as any).borrowedFromDefenseJson);

            const defenseLayout = await tx.defenseLayout.findUnique({
                where: { planetId: fleet.fromPlanetId },
            });

            if (defenseLayout) {
                // Get current planet units (after adding returning units back)
                const planetUnits = await tx.planetUnit.findMany({
                    where: { planetId: fleet.fromPlanetId },
                });
                const availableUnits: Record<string, number> = {};
                planetUnits.forEach(pu => availableUnits[pu.unitType] = pu.count);

                // Parse current defense layout to see what's already assigned
                const currentDefense: Record<string, Record<string, number>> = { front: {}, left: {}, right: {} };
                const parseLane = (laneKey: string, laneName: string) => {
                    try {
                        const laneData = JSON.parse((defenseLayout as any)[laneKey] || '{}');
                        const laneUnits = laneData.units || laneData;
                        for (const [unitType, count] of Object.entries(laneUnits)) {
                            if (typeof count === 'number' && count > 0) {
                                currentDefense[laneName][unitType] = count;
                            }
                        }
                    } catch (e) { }
                };
                parseLane('frontLaneJson', 'front');
                parseLane('leftLaneJson', 'left');
                parseLane('rightLaneJson', 'right');

                // Calculate total on defense per unit type
                const totalOnDefense: Record<string, number> = {};
                for (const lane of Object.values(currentDefense)) {
                    for (const [unitType, count] of Object.entries(lane)) {
                        totalOnDefense[unitType] = (totalOnDefense[unitType] || 0) + count;
                    }
                }

                // Calculate available reserves (planet units not on defense)
                const reserves: Record<string, number> = {};
                for (const [unitType, count] of Object.entries(availableUnits)) {
                    reserves[unitType] = Math.max(0, count - (totalOnDefense[unitType] || 0));
                }

                const updateData: Record<string, string> = {};

                const restoreLane = (laneKey: string, laneName: string) => {
                    try {
                        const currentLane = JSON.parse((defenseLayout as any)[laneKey] || '{}');
                        const hasTools = currentLane.tools !== undefined;
                        const laneUnits = hasTools ? { ...(currentLane.units || {}) } : { ...currentLane };

                        for (const [unitType, originalBorrowed] of Object.entries(borrowed[laneName] || {})) {
                            const currentLaneCount = laneUnits[unitType] || 0;

                            // Calculate how many we can restore from reserves
                            const reserveAvailable = reserves[unitType] || 0;
                            const canRestore = Math.min(originalBorrowed as number, reserveAvailable);

                            if (canRestore > 0) {
                                laneUnits[unitType] = currentLaneCount + canRestore;
                                // Deduct from reserves so we don't over-allocate across lanes
                                reserves[unitType] = reserveAvailable - canRestore;
                            }
                        }

                        updateData[laneKey] = JSON.stringify(hasTools ? { units: laneUnits, tools: currentLane.tools } : laneUnits);
                    } catch (e) {
                        console.error(`Error restoring defense lane ${laneName}:`, e);
                    }
                };

                restoreLane('frontLaneJson', 'front');
                restoreLane('leftLaneJson', 'left');
                restoreLane('rightLaneJson', 'right');

                if (Object.keys(updateData).length > 0) {
                    await tx.defenseLayout.update({
                        where: { id: defenseLayout.id },
                        data: updateData,
                    });
                    console.log(`🛡️ Restored troops to defense for fleet ${fleetId}`);
                }
            }
        }

        return fleet;
    });

    if (result) {
        console.log(`✅ Fleet ${fleetId} returned home successfully`);
    }
}

/**
 * Process NPC respawn after delay
 */
async function processNpcRespawn(job: Job<NpcRespawnJob>) {
    const { planetId } = job.data;
    console.log(`🔄 Processing NPC respawn: ${planetId}`);

    await relocateNpc(planetId);

    console.log(`✅ NPC ${planetId} respawned successfully`);
}

/**
 * Process probe updates (runs every 60 seconds)
 * Handles: arrivals, returns, accuracy gain, discovery rolls
 */
async function processProbeUpdate(job: Job<ProbeUpdateJob>) {
    console.log(`🛸 Processing probe update tick`);

    await updateProbes();

    console.log(`✅ Probe update tick completed`);
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
                    case 'npc:respawn':
                        await processNpcRespawn(job as Job<NpcRespawnJob>);
                        break;
                    case 'probe:update':
                        await processProbeUpdate(job as Job<ProbeUpdateJob>);
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

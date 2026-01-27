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
import { syncPlanetResources, formatPlanetForSocket } from '../services/planetService';
import { relocateNpc, regenerateNpcTroops, getAvailableLootForNpc } from '../services/pveService';
import { updateProbes } from '../services/espionageService';
import { transferHarvesterOwnership } from '../services/harvesterService';
import { getUnitStats } from '../constants/unitData';
import {
    FleetArrivalJob,
    FleetReturnJob,
    NpcRespawnJob,
    ProbeUpdateJob,
    EventStartJob,
    EventEndJob,
    EventRetaliationPhaseJob,
    EventHeatDecayJob,
    EventRetaliationCheckJob,
    EventBossWeakenJob,
    EventShipRespawnJob,
    RetaliationArrivalJob,
    EventFleetArrivalJob,
    ThreatDetectionJob,
    CapitalShipArrivalJob,
    CapitalShipReturnJob,
    CapitalShipFleetArrivalJob,
    redisConnectionOptions,
    queueNpcRespawn,
    queueFleetReturn,
    QUEUE_NAME
} from '../lib/jobQueue';
import { completeArrival as completeCapitalShipArrival, completeReturn as completeCapitalShipReturn } from '../services/capitalShipService';
import { calculateThreatIntel } from '../services/radarService';
import { NPC_BALANCE } from '../constants/npcBalanceData';
import { socketService } from '../services/socketService';
import { logError, isRedisReadOnlyError } from '../lib/errorLogger';
import {
    activateEvent,
    triggerRetaliationPhase,
    endEvent,
    incrementEventDay,
} from '../services/events/eventService';
import { processShipRespawns, applyMothershipWeakening } from '../services/events/eventShipService';
import { processHeatDecay } from '../services/events/eventHeatService';
import { processRetaliationCheck, processRetaliationArrival, triggerFinalRetaliationWave } from '../services/events/eventRetaliationService';
import { resolveEventCombat } from '../services/events/eventCombatService';
import { calculateTravelTime, calculateDistance } from '../services/fleetService';

/**
 * Format fleet data for socket emission (matches client Fleet interface)
 */
function formatFleetForSocket(fleet: any) {
    return {
        id: fleet.id,
        type: fleet.type,
        fromPlanet: fleet.fromPlanet,
        toPlanet: fleet.toPlanet,
        fromCapitalShip: fleet.fromCapitalShip || null, // For attack lines from capital ship
        units: typeof fleet.unitsJson === 'string' ? JSON.parse(fleet.unitsJson) : fleet.unitsJson,
        departAt: fleet.departAt,
        arriveAt: fleet.arriveAt,
        status: fleet.status,
    };
}

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

    // Handle capital ship destination (support fleet loading troops onto ship)
    if (!fleet.toPlanetId && fleet.toCapitalShipId) {
        if (type === 'support') {
            console.log(`📦 Processing troop transfer to capital ship: ${fleet.toCapitalShipId}`);

            // Mark as processing
            await prisma.fleet.update({
                where: { id: fleetId },
                data: { status: 'arrived' },
            });

            // Load troops onto capital ship garrison
            const capitalShip = await prisma.capitalShip.findUnique({
                where: { id: fleet.toCapitalShipId },
            });

            if (!capitalShip) {
                console.error(`Capital ship ${fleet.toCapitalShipId} not found!`);
                return;
            }

            const units = JSON.parse(fleet.unitsJson);
            const garrison = (capitalShip.garrison as any) || { troops: {}, tools: {} };
            const garrisonTroops = garrison.troops || {};

            // Add arriving units to garrison
            for (const [unitType, count] of Object.entries(units)) {
                if ((count as number) > 0) {
                    garrisonTroops[unitType] = (garrisonTroops[unitType] || 0) + (count as number);
                }
            }

            // Update capital ship garrison
            await prisma.capitalShip.update({
                where: { id: fleet.toCapitalShipId },
                data: { garrison: { ...garrison, troops: garrisonTroops } },
            });

            console.log(`✅ Troops loaded onto capital ship ${fleet.toCapitalShipId}:`, units);

            // Mark fleet as complete
            await prisma.fleet.update({
                where: { id: fleetId },
                data: { status: 'arrived' },
            });

            // Notify owner that troops were loaded
            socketService.emitToUser(fleet.ownerId, 'capitalship:troops-loaded', {
                capitalShipId: fleet.toCapitalShipId,
                troops: units,
            });

            // Notify client to remove fleet from map (status='arrived' triggers removal)
            socketService.emitToUser(fleet.ownerId, 'fleet:updated', {
                id: fleet.id,
                status: 'arrived',
            });

            return;
        }

        // Capital ship attack fleets are handled by capitalship:fleet-arrival
        console.log(`Fleet ${fleetId} targets capital ship for attack, handler will process separately.`);
        return;
    }

    // At this point, we know fleet.toPlanetId exists (not null)
    // Early return if somehow it's still null (shouldn't happen)
    if (!fleet.toPlanetId) {
        console.error(`Fleet ${fleetId} has no target planet, skipping`);
        return;
    }

    // TypeScript now knows toPlanetId is string
    const targetPlanetId = fleet.toPlanetId;

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
    await syncPlanetResources(targetPlanetId);

    if (type === 'attack') {
        // Check if attacking own planet - merge units instead of combat
        const transferTargetPlanet = await prisma.planet.findUnique({ where: { id: fleet.toPlanetId! } });

        if (transferTargetPlanet && transferTargetPlanet.ownerId === fleet.ownerId) {
            // Friendly transfer - merge units to target planet's reserves
            console.log(`🤝 Friendly fleet arrival: merging units to owned planet ${fleet.toPlanetId!}`);

            const units = JSON.parse(fleet.unitsJson);
            for (const [unitType, count] of Object.entries(units)) {
                if ((count as number) > 0) {
                    await prisma.planetUnit.upsert({
                        where: { planetId_unitType: { planetId: fleet.toPlanetId!, unitType } },
                        update: { count: { increment: count as number } },
                        create: { planetId: fleet.toPlanetId!, unitType, count: count as number },
                    });
                }
            }

            // Handle resource transfer if cargo attached
            if (fleet.cargoJson) {
                const cargo = typeof fleet.cargoJson === 'string' ? JSON.parse(fleet.cargoJson) : fleet.cargoJson;
                if (cargo.carbon || cargo.titanium || cargo.food) {
                    await prisma.planet.update({
                        where: { id: fleet.toPlanetId! },
                        data: {
                            carbon: { increment: cargo.carbon || 0 },
                            titanium: { increment: cargo.titanium || 0 },
                            food: { increment: cargo.food || 0 },
                        }
                    });
                    console.log(`📦 Resources transferred: C:${cargo.carbon || 0} T:${cargo.titanium || 0} F:${cargo.food || 0}`);
                }
            }

            // Mark fleet as completed (no return trip needed)
            await prisma.fleet.update({
                where: { id: fleet.id },
                data: { status: 'completed' },
            });

            // Release admiral if assigned
            if (fleet.admiralId) {
                await prisma.admiral.update({
                    where: { id: fleet.admiralId },
                    data: { stationedPlanetId: null },
                });
            }

            // Get from planet for message (may be null if from capital ship)
            const fromPlanet = fleet.fromPlanetId
                ? await prisma.planet.findUnique({ where: { id: fleet.fromPlanetId } })
                : null;
            const cargo = fleet.cargoJson ? (typeof fleet.cargoJson === 'string' ? JSON.parse(fleet.cargoJson) : fleet.cargoJson) : {};

            // Create transfer complete inbox message
            await prisma.inboxMessage.create({
                data: {
                    userId: fleet.ownerId,
                    type: 'transfer_complete',
                    title: 'Transfer Complete',
                    content: JSON.stringify({
                        fromPlanet: { id: fleet.fromPlanetId, name: fromPlanet?.name || 'Unknown', x: fromPlanet?.x || 0, y: fromPlanet?.y || 0 },
                        toPlanet: { id: transferTargetPlanet.id, name: transferTargetPlanet.name, x: transferTargetPlanet.x, y: transferTargetPlanet.y },
                        units,
                        resources: { carbon: cargo.carbon || 0, titanium: cargo.titanium || 0, food: cargo.food || 0 }
                    })
                }
            });

            // Emit socket event for transfer completion
            const completedFleet = await prisma.fleet.findUnique({
                where: { id: fleet.id },
                include: { fromPlanet: true, toPlanet: true, fromCapitalShip: true },
            });
            if (completedFleet) {
                socketService.emitToUser(fleet.ownerId, 'fleet:updated', formatFleetForSocket(completedFleet));
            }

            console.log(`✅ Fleet ${fleetId} merged to friendly planet successfully`);
            return;
        }

        // Check if target is an NPC and prepare for combat
        const preflightPlanet = await prisma.planet.findUnique({ where: { id: fleet.toPlanetId! } });
        if (preflightPlanet && preflightPlanet.isNpc && (preflightPlanet as any).planetType !== 'harvester') {
            // Regenerate NPC troops based on decay formula before combat
            // This ensures each attack faces SOME resistance, scaled by attack count
            await regenerateNpcTroops(fleet.toPlanetId!);

            // Set NPC resources to distributed loot amount for this specific attack
            // This replaces front-loaded loot with distributed loot across all attacks
            const availableLoot = await getAvailableLootForNpc(fleet.toPlanetId!);
            await prisma.planet.update({
                where: { id: fleet.toPlanetId! },
                data: {
                    carbon: availableLoot.carbon,
                    titanium: availableLoot.titanium,
                    food: availableLoot.food,
                    credits: availableLoot.credits,
                }
            });
            console.log(`💰 NPC ${fleet.toPlanetId!} loot set for attack #${preflightPlanet.attackCount + 1}: C:${availableLoot.carbon} T:${availableLoot.titanium} F:${availableLoot.food}`);
        }

        // Hostile attack - resolve combat
        const combatResult = await resolveCombat(fleetId);

        // Track gear drops - will be delivered on fleet return
        let droppedGearId: string | null = null;
        let droppedGearPlanetName: string | null = null;

        // Handle NPC attack count, gear drop, and respawn queuing
        // IMPORTANT: Harvesters are permanent and never respawn - skip this logic for them
        const targetPlanet = await prisma.planet.findUnique({ where: { id: fleet.toPlanetId! } });
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
                        // Store gear ID for fleet return - don't transfer ownership yet!
                        // The gear will be delivered when the fleet returns home
                        droppedGearId = updatedNpc.npcLootGearId;
                        droppedGearPlanetName = targetPlanet.name;

                        // Clear the NPC's loot gear reference so it can't be "dropped" again
                        await prisma.planet.update({
                            where: { id: updatedNpc.id },
                            data: { npcLootGearId: null },
                        });

                        console.log(`🎁 Gear ${updatedNpc.npcLootGearId} will be delivered on fleet return (hit ${newCount}/${maxHits}, ${Math.round(dropChance * 100)}% chance)`);
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
                const tPlanet = await tx.planet.findUnique({ where: { id: fleet.toPlanetId!! } });
                if (!tPlanet) return { carbon: 0, titanium: 0, food: 0 };

                const loot = {
                    carbon: Math.min(Math.max(0, requestedLoot.carbon), tPlanet.carbon),
                    titanium: Math.min(Math.max(0, requestedLoot.titanium), tPlanet.titanium),
                    food: Math.min(Math.max(0, requestedLoot.food), tPlanet.food),
                };

                await tx.planet.update({
                    where: { id: fleet.toPlanetId!! },
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
                defenderId: fleet.toPlanet!.ownerId,
                attackerPlanetId: fleet.fromPlanetId ?? '',
                defenderPlanetId: fleet.toPlanetId!!,
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
        const targetPlanetForConquest = await prisma.planet.findUnique({ where: { id: fleet.toPlanetId! } });
        if (targetPlanetForConquest && (targetPlanetForConquest as any).planetType === 'harvester' && combatResult.winner === 'attacker' && totalSurvivors > 0) {
            console.log(`🏴 Harvester conquest! ${fleet.ownerId} conquers ${fleet.toPlanetId!}`);

            // Transfer ownership - survivors stay on the Harvester
            await transferHarvesterOwnership(fleet.toPlanetId!, fleet.ownerId, survivingUnits);

            // Mark fleet as completed (no return trip)
            await prisma.fleet.update({
                where: { id: fleet.id },
                data: { status: 'completed' },
            });

            // Release admiral if assigned
            if (fleet.admiralId) {
                await prisma.admiral.update({
                    where: { id: fleet.admiralId },
                    data: { stationedPlanetId: fleet.toPlanetId! },
                });
            }

            // Emit socket event for harvester conquest completion
            const conquestFleet = await prisma.fleet.findUnique({
                where: { id: fleet.id },
                include: { fromPlanet: true, toPlanet: true, fromCapitalShip: true },
            });
            if (conquestFleet) {
                socketService.emitToUser(fleet.ownerId, 'fleet:updated', formatFleetForSocket(conquestFleet));
            }

            console.log(`✅ Harvester ${fleet.toPlanetId!} now owned by ${fleet.ownerId} with ${totalSurvivors} units stationed`);
        } else if (totalSurvivors > 0) {
            const originalDuration = fleet.arriveAt.getTime() - fleet.departAt.getTime();
            const returnArrival = new Date(Date.now() + originalDuration);

            // Build cargo JSON including resources and any dropped gear
            const cargoData = resourcesJson ? JSON.parse(resourcesJson) : {};
            if (droppedGearId) {
                cargoData.gearId = droppedGearId;
                cargoData.gearPlanetName = droppedGearPlanetName;
            }

            await prisma.fleet.update({
                where: { id: fleet.id },
                data: {
                    status: 'returning',
                    unitsJson: JSON.stringify(survivingUnits),
                    departAt: new Date(),
                    arriveAt: returnArrival,
                    cargoJson: JSON.stringify(cargoData),
                },
            });

            // Queue the return job (use empty string if no fromPlanetId - capital ship fleet)
            const { queueFleetReturn } = await import('../lib/jobQueue');
            await queueFleetReturn({ fleetId: fleet.id, fromPlanetId: fleet.fromPlanetId ?? '' }, returnArrival);
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
                where: { planetId_unitType: { planetId: fleet.toPlanetId!, unitType } },
                update: { count: { increment: count as number } },
                create: { planetId: fleet.toPlanetId!, unitType, count: count as number },
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

    // Emit socket events for real-time client updates
    const updatedFleet = await prisma.fleet.findUnique({
        where: { id: fleetId },
        include: { fromPlanet: true, toPlanet: true, fromCapitalShip: true },
    });
    if (updatedFleet) {
        socketService.emitToUser(updatedFleet.ownerId, 'fleet:updated', formatFleetForSocket(updatedFleet));
        socketService.emitToUser(updatedFleet.ownerId, 'inbox:new', {
            type: type === 'attack' ? 'battle' : 'fleet',
            title: `Fleet ${type === 'attack' ? 'Battle Complete' : 'Arrived'}`,
        });

        // Notify defender that the threat has been cleared (for map line cleanup)
        if (type === 'attack' && updatedFleet.toPlanet?.ownerId && updatedFleet.toPlanet.ownerId !== updatedFleet.ownerId) {
            socketService.emitToUser(updatedFleet.toPlanet.ownerId, 'threat:cleared', {
                fleetId: updatedFleet.id,
            });
            console.log(`📡 Sent threat:cleared to defender ${updatedFleet.toPlanet.ownerId} for fleet ${updatedFleet.id}`);
        }
    }
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

        // Add loot to home planet OR capital ship garrison
        const loot = typeof fleet.cargoJson === 'string' ? JSON.parse(fleet.cargoJson) : fleet.cargoJson;
        const units = JSON.parse(fleet.unitsJson);

        if (loot && fleet.fromPlanetId) {
            // Planet-origin fleet - deposit loot to planet
            await tx.planet.update({
                where: { id: fleet.fromPlanetId },
                data: {
                    carbon: { increment: loot.carbon || 0 },
                    titanium: { increment: loot.titanium || 0 },
                    food: { increment: loot.food || 0 },
                },
            });

            // Deliver any gear that was dropped during combat
            if (loot.gearId) {
                const gear = await tx.gearPiece.findUnique({
                    where: { id: loot.gearId }
                });

                if (gear) {
                    // Transfer gear ownership to the fleet owner
                    await tx.gearPiece.update({
                        where: { id: loot.gearId },
                        data: { userId: fleet.ownerId },
                    });

                    // Send inbox message about gear drop
                    await tx.inboxMessage.create({
                        data: {
                            userId: fleet.ownerId,
                            type: 'gear_drop',
                            title: `${gear.name} Recovered!`,
                            content: JSON.stringify({
                                gearId: gear.id,
                                name: gear.name,
                                slotType: gear.slotType,
                                rarity: gear.rarity,
                                level: gear.level,
                                meleeStrengthBonus: gear.meleeStrengthBonus,
                                rangedStrengthBonus: gear.rangedStrengthBonus,
                                canopyReductionBonus: gear.canopyReductionBonus,
                                planetName: loot.gearPlanetName || 'Unknown',
                                iconName: (gear as any).iconName || null
                            })
                        }
                    });

                    console.log(`🎁 Gear ${gear.name} delivered to player ${fleet.ownerId}`);
                }
            }
        } else if ((fleet as any).fromCapitalShipId) {
            // Capital ship-origin fleet - deposit loot to capital ship garrison
            const capitalShipId = (fleet as any).fromCapitalShipId;
            const capitalShip = await tx.capitalShip.findUnique({
                where: { id: capitalShipId },
            });

            if (capitalShip) {
                // Parse current garrison
                const currentGarrison = (capitalShip.garrison as any) || { troops: {}, tools: {}, loot: {} };
                const garrisonLoot = currentGarrison.loot || {};

                // Add loot to garrison
                if (loot) {
                    garrisonLoot.carbon = (garrisonLoot.carbon || 0) + (loot.carbon || 0);
                    garrisonLoot.titanium = (garrisonLoot.titanium || 0) + (loot.titanium || 0);
                    garrisonLoot.food = (garrisonLoot.food || 0) + (loot.food || 0);
                }

                // Add returning troops to garrison
                const garrisonTroops = currentGarrison.troops || {};
                for (const [unitType, count] of Object.entries(units)) {
                    garrisonTroops[unitType] = (garrisonTroops[unitType] || 0) + (count as number);
                }

                // Update capital ship garrison
                await tx.capitalShip.update({
                    where: { id: capitalShipId },
                    data: {
                        garrison: {
                            troops: garrisonTroops,
                            tools: currentGarrison.tools || {},
                            loot: garrisonLoot,
                        },
                    },
                });

                console.log(`🚀 Capital ship ${capitalShipId}: deposited loot and ${Object.keys(units).length} troop types`);
            }
        }

        // Add units back to home planet (only for planet-origin fleets)
        if (fleet.fromPlanetId) {
            for (const [unitType, count] of Object.entries(units)) {
                await tx.planetUnit.upsert({
                    where: { planetId_unitType: { planetId: fleet.fromPlanetId, unitType } },
                    update: { count: { increment: count as number } },
                    create: { planetId: fleet.fromPlanetId, unitType, count: count as number },
                });
            }
        }

        // Restore borrowed troops to defense layout from reserves (only for planet-origin fleets)
        if ((fleet as any).borrowedFromDefenseJson && fleet.fromPlanetId) {
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

        // Fetch complete fleet data with relations for socket emission
        const completedFleet = await prisma.fleet.findUnique({
            where: { id: fleetId },
            include: { fromPlanet: true, toPlanet: true, fromCapitalShip: true },
        });

        // Emit socket events for real-time updates
        if (completedFleet) {
            socketService.emitToUser(result.ownerId, 'fleet:updated', formatFleetForSocket(completedFleet));
        }

        // Fetch and emit updated planet data (skip if fleet originated from capital ship)
        if (result.fromPlanetId) {
            const updatedPlanet = await prisma.planet.findUnique({
                where: { id: result.fromPlanetId },
                include: { buildings: true, units: true },
            });
            if (updatedPlanet) {
                socketService.emitToUser(result.ownerId, 'planet:updated', await formatPlanetForSocket(updatedPlanet));
            }
        }

        // Emit capital ship update if fleet originated from capital ship
        if ((result as any).fromCapitalShipId) {
            const { formatForSocket } = await import('../services/capitalShipService');
            const updatedShip = await prisma.capitalShip.findUnique({
                where: { id: (result as any).fromCapitalShipId },
                include: {
                    owner: { select: { username: true, coalitionId: true } },
                    fromPlanet: { select: { name: true, x: true, y: true } },
                },
            });
            if (updatedShip) {
                socketService.emitToUser(result.ownerId, 'capitalShip:updated', formatForSocket(updatedShip));
            }
        }
    }
}

/**
 * Process NPC respawn after delay
 */
async function processNpcRespawn(job: Job<NpcRespawnJob>) {
    const { planetId } = job.data;
    console.log(`🔄 Processing NPC respawn: ${planetId}`);

    await relocateNpc(planetId);

    // Fetch the relocated planet and emit global event for world map updates
    const relocatedPlanet = await prisma.planet.findUnique({ where: { id: planetId } });
    if (relocatedPlanet) {
        socketService.emitToAll('world:planetAdded', {
            id: relocatedPlanet.id,
            x: relocatedPlanet.x,
            y: relocatedPlanet.y,
            name: relocatedPlanet.name,
            ownerId: relocatedPlanet.ownerId,
            isNpc: true,
            npcLevel: relocatedPlanet.npcLevel,
        });
    }

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

// =============================================================================
// WORLD EVENT JOB HANDLERS
// =============================================================================

/**
 * Process event start - activate event and spawn ships
 */
async function processEventStart(job: Job<EventStartJob>) {
    const { eventId } = job.data;
    console.log(`🚀 Processing event start: ${eventId}`);

    await activateEvent(eventId);

    console.log(`✅ Event ${eventId} started successfully`);
}

/**
 * Process event end - finalize scores and distribute rewards
 */
async function processEventEnd(job: Job<EventEndJob>) {
    const { eventId } = job.data;
    console.log(`🏁 Processing event end: ${eventId}`);

    await endEvent(eventId);

    console.log(`✅ Event ${eventId} ended successfully`);
}

/**
 * Process retaliation phase trigger
 */
async function processEventRetaliationPhase(job: Job<EventRetaliationPhaseJob>) {
    const { eventId } = job.data;
    console.log(`⚔️ Processing retaliation phase: ${eventId}`);

    await triggerRetaliationPhase(eventId);

    console.log(`✅ Retaliation phase triggered for event ${eventId}`);
}

/**
 * Process heat decay for all players in event (runs hourly)
 */
async function processEventHeatDecay(job: Job<EventHeatDecayJob>) {
    const { eventId } = job.data;
    console.log(`🌡️ Processing heat decay for event: ${eventId}`);

    await processHeatDecay(eventId);

    console.log(`✅ Heat decay processed for event ${eventId}`);
}

/**
 * Process retaliation checks (runs every 30 min)
 */
async function processEventRetaliationCheck(job: Job<EventRetaliationCheckJob>) {
    const { eventId } = job.data;
    console.log(`🎯 Processing retaliation checks for event: ${eventId}`);

    await processRetaliationCheck(eventId);

    console.log(`✅ Retaliation checks processed for event ${eventId}`);
}

/**
 * Process boss weakening (runs daily)
 */
async function processEventBossWeaken(job: Job<EventBossWeakenJob>) {
    const { eventId } = job.data;
    console.log(`💀 Processing boss weakening for event: ${eventId}`);

    const event = await incrementEventDay(eventId);
    if (event) {
        const globalState = event.globalState as { currentDay?: number } | null;
        const currentDay = globalState?.currentDay || 1;
        await applyMothershipWeakening(eventId, currentDay);
    }

    console.log(`✅ Boss weakening processed for event ${eventId}`);
}

/**
 * Process ship respawns (runs every 5 min)
 */
async function processEventShipRespawn(job: Job<EventShipRespawnJob>) {
    const { eventId } = job.data;
    console.log(`🔄 Processing ship respawns for event: ${eventId}`);

    await processShipRespawns(eventId);

    console.log(`✅ Ship respawns processed for event ${eventId}`);
}

/**
 * Process retaliation arrival
 */
async function processRetaliationArrivalJob(job: Job<RetaliationArrivalJob>) {
    const { retaliationId } = job.data;
    console.log(`💥 Processing retaliation arrival: ${retaliationId}`);

    await processRetaliationArrival(retaliationId);

    console.log(`✅ Retaliation arrival processed: ${retaliationId}`);
}

/**
 * Process event attack fleet arrival
 * When a player's fleet arrives at an event ship's coordinates, resolve combat
 */
async function processEventFleetArrival(job: Job<EventFleetArrivalJob>) {
    const { fleetId, eventId, shipId } = job.data;
    console.log(`👾 Processing event fleet arrival: ${fleetId} → ship ${shipId}`);

    // Get fleet
    const fleet = await prisma.fleet.findUnique({
        where: { id: fleetId },
        include: {
            fromPlanet: { select: { id: true, x: true, y: true, name: true } },
            owner: { select: { id: true, username: true } },
        },
    });

    if (!fleet) {
        console.warn(`Fleet ${fleetId} not found, skipping`);
        return;
    }

    if (fleet.status !== 'enroute') {
        console.log(`Fleet ${fleetId} already processed (status: ${fleet.status}), skipping`);
        return;
    }

    // Mark as arrived
    await prisma.fleet.update({
        where: { id: fleetId },
        data: { status: 'arrived' },
    });

    // Parse fleet units
    const units = JSON.parse(fleet.unitsJson) as Record<string, number>;

    // Parse system assignments from cargoJson (Hull Breach Assault)
    let systemAssignments: { shields: Record<string, number>; reactor: Record<string, number>; weapons: Record<string, number> } | undefined;
    if (fleet.cargoJson) {
        const cargo = JSON.parse(fleet.cargoJson);
        systemAssignments = cargo.systemAssignments;
    }

    // Resolve combat
    const result = await resolveEventCombat(eventId, shipId, fleet.ownerId, units, systemAssignments);

    console.log(`⚔️ Event combat result: victory=${result.victory}, shipDefeated=${result.shipDefeated}, cores=${result.xenoCoresAwarded}`);

    // Get event ship for return journey
    const ship = await prisma.eventShip.findUnique({ where: { id: shipId } });

    // Calculate return journey (use fromPlanet or fromCapitalShip coords)
    const fromX = fleet.fromPlanet?.x ?? 0;
    const fromY = fleet.fromPlanet?.y ?? 0;
    const returnDistance = calculateDistance(
        ship?.x || 0, ship?.y || 0,
        fromX, fromY
    );
    const returnTravelTimeSeconds = calculateTravelTime(returnDistance);
    const returnArriveAt = new Date(Date.now() + returnTravelTimeSeconds * 1000);

    // Update fleet for return journey with surviving units and combat result
    await prisma.fleet.update({
        where: { id: fleetId },
        data: {
            status: 'returning',
            arriveAt: returnArriveAt,
            unitsJson: JSON.stringify(result.remainingFleet),
            cargoJson: JSON.stringify({
                eventCombatResult: {
                    victory: result.victory,
                    shipDefeated: result.shipDefeated,
                    xenoCoresAwarded: result.xenoCoresAwarded,
                    unitsLost: result.unitsLost,
                    unitsKilled: result.unitsKilled,
                    heatGained: result.heatGained,
                },
            }),
        },
    });

    // Queue return journey (fromPlanetId may be null for capital ship fleets)
    await queueFleetReturn({ fleetId, fromPlanetId: fleet.fromPlanetId ?? '' }, returnArriveAt);

    // Send combat result via socket to the player
    socketService.emitToUser(fleet.ownerId, 'event:combat-result', {
        fleetId,
        shipId,
        result: {
            victory: result.victory,
            shipDefeated: result.shipDefeated,
            xenoCoresAwarded: result.xenoCoresAwarded,
            damageDealt: result.damageDealt,
            unitsLost: result.unitsLost,
            unitsKilled: result.unitsKilled,
            heatGained: result.heatGained,
            mothershipKilled: result.mothershipKilled,
        },
    });

    // If ship was defeated, broadcast to all players
    if (result.shipDefeated) {
        socketService.emitToAll('event:ship-defeated', {
            eventId,
            shipId,
            defeatedBy: fleet.owner.username,
        });
    }

    console.log(`✅ Event fleet arrival processed: ${fleetId} (returning in ${returnTravelTimeSeconds}s)`);
}

/**
 * Process threat detection - notify defender of incoming attack
 * Also schedules the next fidelity phase update
 */
async function processThreatDetection(job: Job<ThreatDetectionJob>) {
    const { fleetId, defenderId, targetPlanetId, attackerName, radarLevel, phase } = job.data;

    // Check if this is a capital ship attack (targetPlanetId starts with "capitalship:")
    const isCapitalShipAttack = targetPlanetId.startsWith('capitalship:');
    const targetId = isCapitalShipAttack ? targetPlanetId.replace('capitalship:', '') : targetPlanetId;

    console.log(`📡 Processing threat detection: fleet ${fleetId} → ${isCapitalShipAttack ? 'capital ship' : 'planet'} ${targetId} (phase: ${phase || 'initial'})`);

    // Fetch fleet - it may have been recalled
    const fleet = await prisma.fleet.findUnique({
        where: { id: fleetId },
        include: {
            fromPlanet: { select: { id: true, x: true, y: true, name: true } },
            fromCapitalShip: { select: { id: true, x: true, y: true } },
            toPlanet: { select: { id: true, x: true, y: true, name: true } },
            toCapitalShip: { select: { id: true, x: true, y: true, ownerId: true } },
            owner: { select: { id: true, username: true } },
        },
    });

    if (!fleet || fleet.status !== 'enroute') {
        console.log(`Fleet ${fleetId} no longer en route, skipping threat notification`);
        return;
    }

    // Build from coordinates
    const fromCoords = fleet.fromPlanet
        ? { x: fleet.fromPlanet.x, y: fleet.fromPlanet.y }
        : { x: fleet.fromCapitalShip?.x ?? 0, y: fleet.fromCapitalShip?.y ?? 0 };

    let intel: any;

    if (isCapitalShipAttack && fleet.toCapitalShip) {
        // Handle capital ship attack - calculate intel manually
        const toCoords = { x: fleet.toCapitalShip.x!, y: fleet.toCapitalShip.y! };
        const { calculateFleetPosition, calculateDistance, getIntelFidelityPhase, applyFidelityToCount } = await import('../services/radarService');

        const currentTime = new Date();
        const fleetPos = calculateFleetPosition(fromCoords, toCoords, fleet.departAt, fleet.arriveAt, currentTime);
        const distanceRemaining = calculateDistance(fleetPos, toCoords);
        const fidelityPhase = getIntelFidelityPhase(distanceRemaining, radarLevel);

        const actualUnits: Record<string, number> = JSON.parse(fleet.unitsJson || '{}');
        const totalActualUnits = Object.values(actualUnits).reduce((a, b) => a + b, 0);
        const estimatedUnits = applyFidelityToCount(totalActualUnits, fidelityPhase.fidelityMultiplier, fidelityPhase.variancePercent);

        // Unit composition only visible at RECON or higher
        let unitComposition: Record<string, number> | null = null;
        if (fidelityPhase.fidelityMultiplier >= 0.75) {
            unitComposition = {};
            for (const [unitType, count] of Object.entries(actualUnits)) {
                unitComposition[unitType] = applyFidelityToCount(count, fidelityPhase.fidelityMultiplier, fidelityPhase.variancePercent);
            }
        }

        const etaSeconds = Math.max(0, Math.ceil((fleet.arriveAt.getTime() - currentTime.getTime()) / 1000));

        intel = {
            fleetId: fleet.id,
            attackerName: fleet.owner?.username || 'Unknown',
            attackerId: fleet.ownerId,
            targetCapitalShipId: fleet.toCapitalShip.id,
            targetCapitalShipName: 'Your Capital Ship',
            arrivalTime: fleet.arriveAt,
            etaSeconds,
            distanceRemaining,
            fidelityLevel: fidelityPhase.label,
            estimatedUnits: fidelityPhase.fidelityMultiplier === 0 ? null : estimatedUnits,
            unitComposition,
            isIncomingAttack: true,
            fromPlanet: fromCoords,
            toPlanet: null,
            toCapitalShip: { id: fleet.toCapitalShip.id, x: fleet.toCapitalShip.x, y: fleet.toCapitalShip.y },
            departAt: fleet.departAt,
            type: 'attack' as const,
            status: 'enroute' as const,
        };
    } else if (fleet.toPlanet) {
        // Handle planet attack - use existing calculateThreatIntel
        intel = await calculateThreatIntel({
            id: fleet.id,
            ownerId: fleet.ownerId,
            unitsJson: fleet.unitsJson,
            departAt: fleet.departAt,
            arriveAt: fleet.arriveAt,
            fromPlanet: fromCoords,
            toPlanet: fleet.toPlanet,
            owner: fleet.owner,
        }, radarLevel);
    } else {
        console.log(`Fleet ${fleetId} has no valid target, skipping threat detection`);
        return;
    }

    // Emit to defender
    socketService.emitToUser(defenderId, 'threat:detected', intel);

    console.log(`✅ Threat detection sent to ${defenderId}: ${intel.fidelityLevel} (ETA: ${intel.etaSeconds}s, dist: ${Math.round(intel.distanceRemaining)}px)`);

    // Schedule next fidelity phase update if not yet at CONFIRMED phase
    console.log(`   [DEBUG] Checking next phase: fidelity=${intel.fidelityLevel}, etaSeconds=${intel.etaSeconds}`);
    if (intel.fidelityLevel !== 'CONFIRMED' && intel.etaSeconds > 0) {
        const { INTEL_FIDELITY_CONFIG, RADAR_FIDELITY_BONUS_PER_LEVEL } = await import('../constants/mechanics');
        const { queueThreatDetection } = await import('../lib/jobQueue');

        // Determine next phase distance threshold
        // We want to schedule when the fleet CROSSES INTO the next phase
        const bonus = radarLevel * RADAR_FIDELITY_BONUS_PER_LEVEL;
        let nextPhaseThreshold: number | null = null;

        // Current phase thresholds (with radar bonus applied):
        // DETECTED: distance > phase1Threshold
        // ESTIMATE: distance between phase2Threshold and phase1Threshold
        // RECON: distance between phase3Threshold and phase2Threshold
        // CONFIRMED: distance < phase3Threshold

        if (intel.fidelityLevel === 'DETECTED') {
            // Transition to ESTIMATE when distance drops below PHASE_1 threshold
            nextPhaseThreshold = INTEL_FIDELITY_CONFIG.PHASE_1.distanceThreshold + bonus;
        } else if (intel.fidelityLevel === 'ESTIMATE') {
            // Transition to RECON when distance drops below PHASE_2 threshold
            nextPhaseThreshold = INTEL_FIDELITY_CONFIG.PHASE_2.distanceThreshold + bonus;
        } else if (intel.fidelityLevel === 'RECON') {
            // Transition to CONFIRMED when distance drops below PHASE_3 threshold
            nextPhaseThreshold = INTEL_FIDELITY_CONFIG.PHASE_3.distanceThreshold + bonus;
        }

        console.log(`   [DEBUG] nextPhaseThreshold=${nextPhaseThreshold}, distanceRemaining=${Math.round(intel.distanceRemaining)}, check=${intel.distanceRemaining > (nextPhaseThreshold || 0)}`);
        if (nextPhaseThreshold !== null && intel.distanceRemaining > nextPhaseThreshold) {
            // Calculate when fleet will reach next phase threshold
            // Use fromPlanet coords or fromCapitalShip coords (for fleets from capital ships)
            const fromX = fleet.fromPlanet?.x ?? fleet.fromCapitalShip?.x ?? 0;
            const fromY = fleet.fromPlanet?.y ?? fleet.fromCapitalShip?.y ?? 0;
            // Get target coords from either toPlanet or toCapitalShip
            const toX = fleet.toPlanet?.x ?? fleet.toCapitalShip?.x ?? 0;
            const toY = fleet.toPlanet?.y ?? fleet.toCapitalShip?.y ?? 0;
            const totalDistance = Math.sqrt(
                Math.pow(toX - fromX, 2) +
                Math.pow(toY - fromY, 2)
            );
            const totalTravelMs = fleet.arriveAt.getTime() - fleet.departAt.getTime();

            // Distance to travel before crossing the threshold
            const distanceToThreshold = intel.distanceRemaining - nextPhaseThreshold;
            // Time proportional to distance ratio
            const timeToThresholdMs = (distanceToThreshold / totalDistance) * totalTravelMs;

            const nextPhaseTime = new Date(Date.now() + timeToThresholdMs);

            // Only schedule if next phase is before arrival (sanity check)
            if (nextPhaseTime < fleet.arriveAt && timeToThresholdMs > 0) {
                const currentPhaseNum = phase || 1;
                await queueThreatDetection({
                    fleetId,
                    defenderId,
                    targetPlanetId,
                    attackerName,
                    radarLevel,
                    phase: currentPhaseNum + 1,
                }, nextPhaseTime);

                console.log(`📡 Scheduled next fidelity update (phase ${currentPhaseNum + 1}) in ${Math.round(timeToThresholdMs / 1000)}s (threshold: ${nextPhaseThreshold}px, current dist: ${Math.round(intel.distanceRemaining)}px)`);
            } else {
                console.log(`📡 Next phase threshold already passed or invalid timing, skipping schedule`);
            }
        } else {
            console.log(`📡 No next phase to schedule (threshold: ${nextPhaseThreshold}, distance: ${Math.round(intel.distanceRemaining)})`);
        }
    }
}

// =============================================================================
// CAPITAL SHIP JOB HANDLERS
// =============================================================================

/**
 * Process Capital Ship arrival at deployment location
 */
async function processCapitalShipArrival(job: Job<CapitalShipArrivalJob>) {
    const { capitalShipId } = job.data;
    console.log(`🚀 Processing Capital Ship arrival: ${capitalShipId}`);

    await completeCapitalShipArrival(capitalShipId);

    console.log(`✅ Capital Ship ${capitalShipId} arrived successfully`);
}

/**
 * Process Capital Ship return to home planet
 */
async function processCapitalShipReturnJob(job: Job<CapitalShipReturnJob>) {
    const { capitalShipId } = job.data;
    console.log(`🏠 Processing Capital Ship return: ${capitalShipId}`);

    await completeCapitalShipReturn(capitalShipId);

    console.log(`✅ Capital Ship ${capitalShipId} returned home successfully`);
}

/**
 * Process Capital Ship commitment end - auto-initiate return to home planet
 */
async function processCapitalShipCommitmentEnd(job: Job) {
    const { capitalShipId } = job.data as { capitalShipId: string };
    console.log(`⏰ Processing Capital Ship commitment end: ${capitalShipId}`);

    // Check if ship is still deployed (might have been recalled early or destroyed)
    const ship = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!ship || ship.status !== 'deployed') {
        console.log(`Capital Ship ${capitalShipId} not deployed (status: ${ship?.status}), skipping auto-return`);
        return;
    }

    // Auto-initiate recall - this will queue the return trip
    const { recallCapitalShip } = await import('../services/capitalShipService');
    const result = await recallCapitalShip(ship.ownerId, capitalShipId);

    if (result.error) {
        console.error(`Failed to auto-recall Capital Ship ${capitalShipId}: ${result.error}`);
    } else {
        console.log(`✅ Capital Ship ${capitalShipId} auto-recall initiated after commitment ended`);
    }
}

/**
 * Process fleet arrival at enemy Capital Ship - capital ship combat
 * Uses same 3-flank system as planet combat but against ship's garrison
 */
async function processCapitalShipFleetArrival(job: Job<CapitalShipFleetArrivalJob>) {
    const { fleetId, capitalShipId } = job.data;
    console.log(`⚔️ Processing Capital Ship attack: fleet ${fleetId} → ship ${capitalShipId}`);

    const fleet = await prisma.fleet.findUnique({
        where: { id: fleetId },
        include: {
            fromPlanet: true,
            owner: { select: { id: true, username: true } },
        },
    });

    if (!fleet) {
        console.warn(`Fleet ${fleetId} not found, skipping`);
        return;
    }

    if (fleet.status !== 'enroute') {
        console.log(`Fleet ${fleetId} already processed (status: ${fleet.status}), skipping`);
        return;
    }

    const targetShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
        include: { owner: { select: { id: true, username: true } } },
    });

    if (!targetShip || targetShip.status !== 'deployed') {
        console.log(`Target Capital Ship ${capitalShipId} not deployed, recalling fleet`);
        // Ship was recalled or moved - return troops home
        await handleFleetReturnNoTarget(fleet);
        return;
    }

    // Mark fleet as arrived
    await prisma.fleet.update({
        where: { id: fleetId },
        data: { status: 'arrived' },
    });

    // Parse attacking units and tools
    const attackingUnits: Record<string, number> = JSON.parse(fleet.unitsJson);
    const attackerTools: Record<string, number> = fleet.toolsJson ? JSON.parse(fleet.toolsJson) : {};
    const totalAttackers = Object.values(attackingUnits).reduce((sum: number, count: any) => sum + count, 0);

    // Parse garrison (troops on the ship) - garrison is nested: { troops: {...}, tools: {...} }
    const garrisonData = (targetShip.garrison as { troops?: Record<string, number> }) || {};
    const garrison: Record<string, number> = garrisonData.troops || {};
    const totalDefenders = Object.values(garrison).reduce((sum: number, count: any) => sum + count, 0);

    console.log(`   Attackers: ${totalAttackers} units (tools: ${Object.keys(attackerTools).length} types)`);
    console.log(`   Defenders: ${totalDefenders} garrison troops`);

    // Capital Ship defenses based on construction phase
    // Phase 1: Glass cannon (no defenses)
    // Phase 2: Full defenses (100% canopy/hub/debris)
    // Phase 3: Full defenses + troop capacity
    const { resolveWaveCollision } = await import('../services/combatService');
    const { getPhaseDefenseBonuses } = await import('../constants/capitalShipConfig');

    // Determine completed phase: if deployed with no buildProgress, ship is fully built (phase 3)
    // If constructing, phase-1 means phase 1 is IN PROGRESS, so completed = 0
    // If status is deployed and buildProgress exists, we're in partial deployment
    const buildProgress = targetShip.buildProgress as { phase?: number } | null;
    let completedPhase = 3; // Default: fully built
    if (buildProgress && buildProgress.phase) {
        // buildProgress.phase is the CURRENT phase (1-indexed), completed = current - 1
        completedPhase = Math.max(0, buildProgress.phase - 1);
    }

    const phaseBonus = getPhaseDefenseBonuses(completedPhase);
    console.log(`   Ship phase: ${completedPhase} completed, defenses: canopy=${phaseBonus.canopy}, hub=${phaseBonus.hub}, minefield=${phaseBonus.minefield}`);

    const capitalShipDefenses = {
        canopy: phaseBonus.canopy,
        hub: phaseBonus.hub,
        minefield: phaseBonus.minefield
    };

    // Resolve combat using single-wave collision (capital ship has one front)
    const waveResult = resolveWaveCollision(
        attackingUnits,
        garrison,
        attackerTools,
        capitalShipDefenses,
        true,  // isCenter (hub bonus applies)
        {},    // No defender tools on capital ships (built-in defenses only)
        { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 }, // Attacker bonuses
        { meleeStrengthBonus: 0, rangedStrengthBonus: 0, canopyReductionBonus: 0 }  // Defender bonuses
    );

    const attackerWon = waveResult.attackerWon;
    const attackerLosses = waveResult.attackerLosses;
    const defenderLosses = waveResult.defenderLosses;
    const survivingAttackers = waveResult.remainingAttackers;
    const survivingDefenders = waveResult.remainingDefenders;

    console.log(`   Combat result: ${attackerWon ? 'ATTACKER' : 'DEFENDER'} wins`);
    console.log(`   Attacker losses: ${JSON.stringify(attackerLosses)}`);
    console.log(`   Defender losses: ${JSON.stringify(defenderLosses)}`);

    // ==========================================================================
    // HP DAMAGE SCALING
    // ==========================================================================
    // Damage scales with attacker force value (not flat 20%)
    // Small raids = small damage, massive assaults = big damage
    // Note: getUnitStats is already imported at top of file from unitData.ts

    const attackerForce = Object.entries(attackingUnits).reduce((sum, [unit, count]) => {
        const stats = getUnitStats(unit);
        return sum + ((stats?.meleeAtk || 0) + (stats?.rangedAtk || 0)) * (count as number);
    }, 0);

    // Base damage: 1% of max HP per 500 force
    // Bonus: up to 10% of max HP based on survivor ratio (clean wins do more damage)
    const totalSurvivors = Object.values(survivingAttackers).reduce((s: number, c: any) => s + c, 0);
    const survivorRatio = totalAttackers > 0 ? totalSurvivors / totalAttackers : 0;

    const baseDamage = Math.floor((attackerForce / 500) * (targetShip.maxHp / 100));
    const bonusDamage = attackerWon ? Math.floor(targetShip.maxHp * 0.1 * survivorRatio) : 0;

    // Total damage: min 100, max 30% of HP
    let damageDealt = Math.min(
        Math.max(baseDamage + bonusDamage, 100),
        Math.floor(targetShip.maxHp * 0.30)
    );

    console.log(`   Damage calc: force=${attackerForce}, base=${baseDamage}, bonus=${bonusDamage}, total=${damageDealt}`);

    const newHp = Math.max(0, targetShip.currentHp - damageDealt);

    // Update capital ship
    await prisma.capitalShip.update({
        where: { id: capitalShipId },
        data: {
            currentHp: newHp,
            garrison: survivingDefenders,
            status: newHp <= 0 ? 'destroyed' : 'deployed',
            cooldownUntil: newHp <= 0 ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined, // 24h cooldown if destroyed
        },
    });

    // Handle loot from cargo (if attacker won)
    let loot = { carbon: 0, titanium: 0, food: 0 };
    if (attackerWon) {
        console.log(`   Attacker won! Damage dealt: ${damageDealt}, Ship HP: ${newHp}/${targetShip.maxHp}`);
    } else {
        console.log(`   Defender held! Damage dealt: ${damageDealt}, Ship HP: ${newHp}/${targetShip.maxHp}`);
    }

    // Create inbox messages
    await prisma.inboxMessage.create({
        data: {
            userId: fleet.ownerId,
            type: 'capital_ship_attack',
            title: `Attack on ${targetShip.owner.username}'s Capital Ship`,
            content: JSON.stringify({
                result: attackerWon ? 'victory' : 'defeat',
                damageDealt,
                yourLosses: attackerLosses,
                enemyLosses: defenderLosses,
                targetHpRemaining: newHp,
                targetMaxHp: targetShip.maxHp,
                loot,
                // Wave details for detailed battle report
                waveDetails: {
                    attackingUnits,
                    defendingUnits: garrison,
                    attackerLosses,
                    defenderLosses,
                    remainingAttackers: survivingAttackers,
                    remainingDefenders: survivingDefenders,
                    attackerWon,
                    attackerTools,
                    capitalShipDefenses,
                },
            }),
        },
    });

    await prisma.inboxMessage.create({
        data: {
            userId: targetShip.ownerId,
            type: 'capital_ship_defense',
            title: `Capital Ship Attacked by ${fleet.owner.username}`,
            content: JSON.stringify({
                result: attackerWon ? 'defeat' : 'victory',
                attackerName: fleet.owner.username,
                damageTaken: damageDealt,
                yourLosses: defenderLosses,
                enemyLosses: attackerLosses,
                hpRemaining: newHp,
                maxHp: targetShip.maxHp,
                shipDestroyed: newHp <= 0,
                // Wave details for detailed battle report
                waveDetails: {
                    attackingUnits,
                    defendingUnits: garrison,
                    attackerLosses,
                    defenderLosses,
                    remainingAttackers: survivingAttackers,
                    remainingDefenders: survivingDefenders,
                    attackerWon,
                    attackerTools,
                    capitalShipDefenses,
                },
            }),
        },
    });

    // Emit socket events
    socketService.emitToUser(fleet.ownerId, 'capitalShip:attackResult', {
        fleetId,
        targetCapitalShipId: capitalShipId,
        result: attackerWon ? 'victory' : 'defeat',
        damageDealt,
        survivingUnits: survivingAttackers,
    });

    socketService.emitToUser(targetShip.ownerId, 'capitalShip:defended', {
        capitalShipId,
        attackerId: fleet.ownerId,
        attackerName: fleet.owner.username,
        result: attackerWon ? 'defeat' : 'victory',
        damageTaken: damageDealt,
        hpRemaining: newHp,
        shipDestroyed: newHp <= 0,
    });

    // CLEAR THE THREAT FROM DEFENDER'S MAP
    socketService.emitToUser(targetShip.ownerId, 'threat:cleared', {
        fleetId: fleet.id,
    });
    console.log(`📡 Sent threat:cleared to defender ${targetShip.ownerId} for fleet ${fleet.id}`);

    // Schedule return trip for surviving attackers
    if (Object.values(survivingAttackers).some((c: any) => c > 0)) {
        const returnX = fleet.fromPlanet?.x ?? 0;
        const returnY = fleet.fromPlanet?.y ?? 0;
        const dx = returnX - (targetShip.x ?? 0);
        const dy = returnY - (targetShip.y ?? 0);
        const returnDistance = Math.sqrt(dx * dx + dy * dy);
        const { BASE_FLEET_SPEED } = await import('../constants/mechanics');
        const returnTimeSeconds = Math.ceil(returnDistance / BASE_FLEET_SPEED);

        const returnArriveAt = new Date(Date.now() + returnTimeSeconds * 1000);

        await prisma.fleet.update({
            where: { id: fleetId },
            data: {
                status: 'returning',
                unitsJson: JSON.stringify(survivingAttackers),
                departAt: new Date(),
                arriveAt: returnArriveAt,
                cargoJson: JSON.stringify(loot),
            },
        });

        await queueFleetReturn({
            fleetId,
            fromPlanetId: fleet.fromPlanetId!,
        }, returnArriveAt);

        console.log(`   Survivors returning: ${returnTimeSeconds}s travel time`);
    } else {
        // All attackers died
        await prisma.fleet.update({
            where: { id: fleetId },
            data: { status: 'destroyed' },
        });
        console.log(`   All attackers eliminated`);
    }

    console.log(`✅ Capital Ship attack resolved: ${attackerWon ? 'ATTACKER' : 'DEFENDER'} won`);
}

/**
 * Helper: Handle fleet return when target is not available
 */
async function handleFleetReturnNoTarget(fleet: any) {
    const returnX = fleet.fromPlanet?.x ?? 0;
    const returnY = fleet.fromPlanet?.y ?? 0;
    const dx = returnX;
    const dy = returnY;
    const returnDistance = Math.sqrt(dx * dx + dy * dy);
    const { BASE_FLEET_SPEED } = await import('../constants/mechanics');
    const returnTimeSeconds = Math.max(60, Math.ceil(returnDistance / BASE_FLEET_SPEED));

    const returnArriveAt = new Date(Date.now() + returnTimeSeconds * 1000);

    await prisma.fleet.update({
        where: { id: fleet.id },
        data: {
            status: 'returning',
            departAt: new Date(),
            arriveAt: returnArriveAt,
        },
    });

    await queueFleetReturn({
        fleetId: fleet.id,
        fromPlanetId: fleet.fromPlanetId!,
    }, returnArriveAt);

    console.log(`   Fleet returning home (target not available)`);
}

/**
 * Create and start the worker
 */
export async function createGameEventsWorker() {
    // Initialize socket service for Redis pub/sub (worker-to-API relay)
    await socketService.initializeForWorker();

    const worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            try {
                switch (job.name) {
                    // Fleet jobs
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

                    // World Event jobs
                    case 'event:start':
                        await processEventStart(job as Job<EventStartJob>);
                        break;
                    case 'event:end':
                        await processEventEnd(job as Job<EventEndJob>);
                        break;
                    case 'event:retaliation-phase':
                        await processEventRetaliationPhase(job as Job<EventRetaliationPhaseJob>);
                        break;
                    case 'event:heat-decay':
                        await processEventHeatDecay(job as Job<EventHeatDecayJob>);
                        break;
                    case 'event:retaliation-check':
                        await processEventRetaliationCheck(job as Job<EventRetaliationCheckJob>);
                        break;
                    case 'event:boss-weaken':
                        await processEventBossWeaken(job as Job<EventBossWeakenJob>);
                        break;
                    case 'event:ship-respawn':
                        await processEventShipRespawn(job as Job<EventShipRespawnJob>);
                        break;
                    case 'retaliation:arrival':
                        await processRetaliationArrivalJob(job as Job<RetaliationArrivalJob>);
                        break;
                    case 'fleet:event-arrival':
                        await processEventFleetArrival(job as Job<EventFleetArrivalJob>);
                        break;

                    // Threat detection
                    case 'threat:detection':
                        await processThreatDetection(job as Job<ThreatDetectionJob>);
                        break;

                    // Capital Ship handlers
                    case 'capitalship:arrival':
                        await processCapitalShipArrival(job as Job<CapitalShipArrivalJob>);
                        break;
                    case 'capitalship:fleet-arrival':
                        await processCapitalShipFleetArrival(job as Job<CapitalShipFleetArrivalJob>);
                        break;
                    case 'capitalship:return':
                        await processCapitalShipReturnJob(job as Job<CapitalShipReturnJob>);
                        break;
                    case 'capitalship:commitment-end':
                        // Auto-initiate return when commitment period expires
                        await processCapitalShipCommitmentEnd(job);
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

    // Handle worker-level errors (Redis connection issues, etc.)
    // This is CRITICAL - without this handler, connection errors crash the process
    worker.on('error', (err) => {
        const category = isRedisReadOnlyError(err) ? 'REDIS_READONLY' : 'WORKER_ERROR';
        logError(category, err, {
            component: 'gameEventsWorker',
            workerName: 'GameEvents'
        });
        // Don't throw - BullMQ will attempt to reconnect automatically
    });

    // Log when worker is ready after reconnection
    worker.on('ready', () => {
        console.log('✅ Game Events Worker ready');
    });

    // Log stalled jobs (jobs that took too long)
    worker.on('stalled', (jobId) => {
        console.warn(`⚠️ Job ${jobId} stalled - will be retried`);
    });

    console.log('🔧 Game Events Worker started');
    return worker;
}

// If running as standalone process
if (require.main === module) {
    console.log('🚀 Starting Game Events Worker as standalone process...');
    createGameEventsWorker();
}

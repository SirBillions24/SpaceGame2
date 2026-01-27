import prisma from '../lib/prisma';
import { ESPIONAGE_DATA, ReconProbeStats } from '../constants/espionageData';
import { socketService } from './socketService';

/**
 * Format probe data for socket emission (matches client Probe interface)
 */
function formatProbeForSocket(probe: any) {
    return {
        id: probe.id,
        type: probe.type,
        targetX: probe.targetX,
        targetY: probe.targetY,
        status: probe.status,
        startTime: probe.startTime,
        arrivalTime: probe.arrivalTime,
        returnTime: probe.returnTime,
        lastUpdateTime: probe.lastUpdateTime,
        radius: probe.radius,
        fromPlanet: probe.fromPlanet ? { x: probe.fromPlanet.x, y: probe.fromPlanet.y } : null,
    };
}

export async function launchProbe(userId: string, fromPlanetId: string, targetX: number, targetY: number, probeType: string = 'recon_probe') {
    const fromPlanet = await prisma.planet.findUnique({
        where: { id: fromPlanetId },
        include: { 
            buildings: {
                where: { type: 'tavern', status: 'active' } // Intelligence Hub
            }
        }
    });

    if (!fromPlanet) throw new Error('Source planet not found');
    if (fromPlanet.ownerId !== userId) throw new Error('Not authorized');
    if (fromPlanet.buildings.length === 0) throw new Error('Intelligence Hub required to launch probes');

    // --- PROBE LIMIT CHECK ---
    const userHubs = await prisma.building.findMany({
        where: {
            type: 'tavern',
            planet: { ownerId: userId },
            status: 'active'
        }
    });
    const totalMaxProbes = userHubs.reduce((sum, b) => sum + b.level, 0);

    const currentProbesCount = await prisma.reconProbe.count({
        where: {
            ownerId: userId,
            status: { in: ['traveling', 'active', 'discovered', 'returning', 'cooldown'] }
        }
    });

    if (currentProbesCount >= totalMaxProbes) {
        throw new Error(`Probe limit reached (${currentProbesCount}/${totalMaxProbes}). Upgrade Intelligence Hub or recall existing probes.`);
    }
    // -------------------------

    const stats = ESPIONAGE_DATA[probeType as keyof typeof ESPIONAGE_DATA];
    if (!stats) throw new Error(`Invalid probe type: ${probeType}`);

    // Check resources
    if (fromPlanet.carbon < stats.cost.carbon || fromPlanet.titanium < stats.cost.titanium) {
        throw new Error('Insufficient resources');
    }

    // Calculate travel time
    const dx = targetX - fromPlanet.x;
    const dy = targetY - fromPlanet.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Make speed a bit slower if 100 is too fast? User said "not instant". 
    // Let's stick to the data but ensure it's noticeable.
    const travelTimeSeconds = distance / stats.speed;
    const arrivalTime = new Date(Date.now() + travelTimeSeconds * 1000);

    // Deduct resources and create probe
    const [probe] = await prisma.$transaction([
        prisma.reconProbe.create({
            data: {
                type: probeType,
                ownerId: userId,
                fromPlanetId: fromPlanetId,
                targetX: targetX,
                targetY: targetY,
                arrivalTime: arrivalTime,
                radius: stats.radius,
                status: 'traveling'
            }
        }),
        prisma.planet.update({
            where: { id: fromPlanetId },
            data: {
                carbon: { decrement: stats.cost.carbon },
                titanium: { decrement: stats.cost.titanium }
            }
        })
    ]);

    return probe;
}

export async function recallProbe(userId: string, probeId: string) {
    const probe = await prisma.reconProbe.findUnique({
        where: { id: probeId },
        include: { fromPlanet: true }
    });

    if (!probe) throw new Error('Probe not found');
    if (probe.ownerId !== userId) throw new Error('Not authorized');
    if (probe.status === 'returning') throw new Error('Probe is already returning');

    const stats = ESPIONAGE_DATA[probe.type as keyof typeof ESPIONAGE_DATA];
    if (!stats) throw new Error('Invalid probe data');

    // Calculate return time (2x slower as per user request)
    const dx = probe.targetX - probe.fromPlanet.x;
    const dy = probe.targetY - probe.fromPlanet.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Half speed = 2x time
    const returnTimeSeconds = (distance / (stats.speed / 2));
    const returnTime = new Date(Date.now() + returnTimeSeconds * 1000);

    const updatedProbe = await prisma.reconProbe.update({
        where: { id: probeId },
        data: {
            status: 'returning',
            returnTime: returnTime,
            lastUpdateTime: new Date()
        }
    });

    return updatedProbe;
}

export async function generateEspionageReport(userId: string, probeId: string) {
    const probeData = await getProbeData(userId, probeId);
    
    // Save report to database
    const report = await prisma.espionageReport.create({
        data: {
            ownerId: userId,
            probeId: probeId,
            probeType: probeData.probe.type,
            targetX: probeData.probe.targetX,
            targetY: probeData.probe.targetY,
            accuracy: probeData.probe.accuracy,
            dataJson: JSON.stringify(probeData.colonies),
        }
    });

    return report;
}

export async function getProbeData(userId: string, probeId: string) {
    const probe = await prisma.reconProbe.findUnique({
        where: { id: probeId },
        include: { owner: true }
    });

    if (!probe) throw new Error('Probe not found');
    if (probe.ownerId !== userId) throw new Error('Not authorized');

    if (probe.status === 'traveling') {
        return { probe, colonies: [] };
    }

    // Find colonies within radius
    const colonies = await prisma.planet.findMany({
        where: {
            x: { gte: probe.targetX - probe.radius, lte: probe.targetX + probe.radius },
            y: { gte: probe.targetY - probe.radius, lte: probe.targetY + probe.radius },
            ownerId: { not: userId } // Only spy on others
        },
        include: {
            units: true,
            owner: { select: { username: true } }
        }
    });

    // Apply accuracy fuzzing to unit counts
    const fuzzedColonies = colonies.map(colony => {
        const fuzzedUnits = colony.units.map(unit => {
            if (probe.accuracy >= 1.0) {
                return { type: unit.unitType, count: unit.count };
            }

            // Fuzzing logic: lower accuracy = wider range
            let min, max;
            if (unit.count === 0) {
                // For 0 troops, show a range like 0-100 at 0% acc, narrowing to 0-0 at 100%
                max = Math.ceil(100 * (1 - probe.accuracy));
                min = 0;
            } else {
                const variance = (1 - probe.accuracy) * 0.5; // Up to 50% variance
                min = Math.max(0, Math.floor(unit.count * (1 - variance)));
                max = Math.ceil(unit.count * (1 + variance));
            }
            
            return { type: unit.unitType, countRange: [min, max], count: null };
        });

        return {
            id: colony.id,
            name: colony.name,
            ownerName: colony.owner.username,
            x: colony.x,
            y: colony.y,
            units: fuzzedUnits,
            accuracy: probe.accuracy
        };
    });

    return { probe, colonies: fuzzedColonies };
}

export async function updateProbes() {
    const now = new Date();
    
    // 1. Process arrivals - find probes that have arrived and update them individually for socket events
    const arrivingProbes = await prisma.reconProbe.findMany({
        where: {
            status: 'traveling',
            arrivalTime: { lte: now }
        },
        include: { fromPlanet: { select: { x: true, y: true } } }
    });

    for (const probe of arrivingProbes) {
        const updated = await prisma.reconProbe.update({
            where: { id: probe.id },
            data: {
                status: 'active',
                lastUpdateTime: now
            },
            include: { fromPlanet: { select: { x: true, y: true } } }
        });
        
        // Emit socket event for probe arrival
        socketService.emitToUser(probe.ownerId, 'probe:updated', formatProbeForSocket(updated));
    }

    // 2. Process returns
    const returningProbes = await prisma.reconProbe.findMany({
        where: {
            status: 'returning',
            returnTime: { lte: now }
        },
        include: { fromPlanet: { select: { x: true, y: true } } }
    });

    for (const probe of returningProbes) {
        if (probe.wasDiscovered) {
            // Set to cooldown for 30 minutes
            const cooldownUntil = new Date(now.getTime() + 30 * 60 * 1000);
            await prisma.reconProbe.update({
                where: { id: probe.id },
                data: {
                    status: 'cooldown',
                    cooldownUntil: cooldownUntil
                }
            });
            // Emit socket event for cooldown status
            socketService.emitToUser(probe.ownerId, 'probe:updated', { 
                id: probe.id, 
                status: 'cooldown', 
                cooldownUntil 
            });
        } else {
            // Regular return, just delete
            await prisma.reconProbe.delete({
                where: { id: probe.id }
            });
            // Emit socket event for deletion
            socketService.emitToUser(probe.ownerId, 'probe:updated', { 
                id: probe.id, 
                status: 'completed' 
            });
        }
    }

    // 3. Process cooldowns (delete when finished)
    await prisma.reconProbe.deleteMany({
        where: {
            status: 'cooldown',
            cooldownUntil: { lte: now }
        }
    });

    // 4. Update active probes (accuracy and discovery chance)
    const activeProbes = await prisma.reconProbe.findMany({
        where: { status: 'active' },
        include: { fromPlanet: true }
    });

    for (const probe of activeProbes) {
        const stats = ESPIONAGE_DATA[probe.type as keyof typeof ESPIONAGE_DATA];
        if (!stats) continue;

        const timeDiffMinutes = (now.getTime() - probe.lastUpdateTime.getTime()) / (1000 * 60);
        if (timeDiffMinutes < 1) continue; // Update every minute

        // Calculate new accuracy
        const newAccuracy = Math.min(1.0, probe.accuracy + stats.accuracyGainPerMinute * timeDiffMinutes);
        
        // Calculate new discovery chance
        const newDiscoveryChance = Math.min(stats.maxDiscoveryChance, probe.discoveryChance + stats.discoveryChancePerMinute * timeDiffMinutes);

        // Discovery check
        const roll = Math.random();
        if (roll < newDiscoveryChance) {
            // AUTOMATIC RECALL ON DISCOVERY
            const dx = probe.targetX - probe.fromPlanet.x;
            const dy = probe.targetY - probe.fromPlanet.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 2x slower return time (Half speed = 2x time)
            const returnTimeSeconds = (distance / (stats.speed / 2));
            const returnTime = new Date(now.getTime() + returnTimeSeconds * 1000);

            const discoveredProbe = await prisma.reconProbe.update({
                where: { id: probe.id },
                data: { 
                    status: 'returning', 
                    wasDiscovered: true,
                    returnTime: returnTime,
                    lastUpdateTime: now 
                },
                include: { 
                    owner: { select: { username: true } },
                    fromPlanet: { select: { x: true, y: true } }
                }
            });

            // Emit socket event for discovery/recall
            socketService.emitToUser(probe.ownerId, 'probe:updated', formatProbeForSocket(discoveredProbe));

            // ALERT ALL PLAYERS IN RADIUS
            const affectedPlanets = await prisma.planet.findMany({
                where: {
                    x: { gte: probe.targetX - probe.radius, lte: probe.targetX + probe.radius },
                    y: { gte: probe.targetY - probe.radius, lte: probe.targetY + probe.radius },
                    ownerId: { not: probe.ownerId } // Alert everyone else
                },
                select: { ownerId: true, name: true }
            });

            const uniqueOwners = Array.from(new Set(affectedPlanets.map(p => p.ownerId)));

            for (const ownerId of uniqueOwners) {
                await prisma.inboxMessage.create({
                    data: {
                        userId: ownerId,
                        type: 'probe_alert',
                        title: 'Hostile Probe Discovered!',
                        content: `A reconnaissance probe from ${discoveredProbe.owner.username} has been detected scanning your sector near ${affectedPlanets.find(p => p.ownerId === ownerId)?.name || 'your colony'}. The probe has been forced to retreat.`
                    }
                });
            }

            continue;
        }

        await prisma.reconProbe.update({
            where: { id: probe.id },
            data: {
                accuracy: newAccuracy,
                discoveryChance: newDiscoveryChance,
                lastUpdateTime: now
            }
        });
    }
}


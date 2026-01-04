
import prisma from '../lib/prisma';
import { syncPlanetResources } from './planetService';

const TOOL_STATS: Record<string, { c: number, t: number, time: number, workshop: string }> = {
    // Defense (Systems Workshop)
    'auto_turret': { c: 40, t: 40, time: 30, workshop: 'defense_workshop' },     // Rocks -> +Shield
    'blast_door': { c: 280, t: 120, time: 60, workshop: 'defense_workshop' },    // Gate Reinf -> +Starport
    'targeting_array': { c: 525, t: 225, time: 60, workshop: 'defense_workshop' }, // Arrows -> +Ranged

    // Siege (Munitions Factory)
    'signal_jammer': { c: 28, t: 12, time: 30, workshop: 'siege_workshop' },    // Ladder -> -Shield
    'breach_cutter': { c: 56, t: 24, time: 60, workshop: 'siege_workshop' },    // Ram -> -Starport
    'holo_decoy': { c: 105, t: 45, time: 60, workshop: 'siege_workshop' },      // Manlet -> -Ranged
};

export async function produceTool(planetId: string, toolType: string, count: number) {
    const planet = await syncPlanetResources(planetId);
    if (!planet) throw new Error('Planet not found');

    const stats = TOOL_STATS[toolType];
    if (!stats) throw new Error('Invalid tool type');

    // Validate Workshop
    // Find active workshop
    const workshop = planet.buildings.find(b => b.type === stats.workshop && b.status === 'active');
    if (!workshop) throw new Error(`${stats.workshop} required`);

    // Check Resources
    const totalC = stats.c * count;
    const totalT = stats.t * count;

    if (planet.carbon < totalC || planet.titanium < totalT) {
        throw new Error('Insufficient resources');
    }

    // Queue Logic (Lazy Eval) same as Recruitment
    let queue: any[] = [];
    if (planet.manufacturingQueue) {
        try { queue = JSON.parse(planet.manufacturingQueue); } catch (e) { }
    }

    const now = new Date();
    let startTime = now;
    if (queue.length > 0) {
        const lastItem = queue[queue.length - 1];
        const lastFinish = new Date(lastItem.finishTime);
        if (lastFinish > now) startTime = lastFinish;
    }

    const totalDuration = stats.time * count; // Base time, maybe add speedup later?
    const finishTime = new Date(startTime.getTime() + (totalDuration * 1000));

    queue.push({
        tool: toolType,
        count,
        finishTime: finishTime.toISOString()
    });

    await prisma.planet.update({
        where: { id: planetId },
        data: {
            carbon: { decrement: totalC },
            titanium: { decrement: totalT },
            manufacturingQueue: JSON.stringify(queue)
        }
    });

    return { queue };
}

export async function processManufacturingQueue(planet: any) {
    if (!planet.manufacturingQueue) return;

    try {
        const queue = JSON.parse(planet.manufacturingQueue);
        if (!Array.isArray(queue) || queue.length === 0) return;

        const now = new Date();
        const nowMs = now.getTime();
        const pendingQueue = [];

        for (const batch of queue) {
            const finishTime = new Date(batch.finishTime).getTime();
            if (finishTime <= nowMs) {
                // Add tools
                await prisma.toolInventory.upsert({
                    where: {
                        planetId_toolType: {
                            planetId: planet.id,
                            toolType: batch.tool
                        }
                    },
                    update: { count: { increment: batch.count } },
                    create: {
                        planetId: planet.id,
                        toolType: batch.tool,
                        count: batch.count
                    }
                });
            } else {
                pendingQueue.push(batch);
            }
        }

        if (pendingQueue.length !== queue.length) {
            await prisma.planet.update({
                where: { id: planet.id },
                data: { manufacturingQueue: JSON.stringify(pendingQueue) }
            });
        }
    } catch (e) {
        console.error('Failed to process manufacturing queue', e);
    }
}

/**
 * World Service - Manages dynamic world bounds and expansion
 * 
 * The map starts at 10000x10000 and expands when quadrants get crowded.
 * Only player spawns trigger expansion; NPCs always stay within current bounds.
 */
import prisma from '../lib/prisma';
import { MAP_CONFIG } from '../constants/npcBalanceData';

export type Quadrant = 'NW' | 'NE' | 'SW' | 'SE';

export interface WorldBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/**
 * Get current world bounds from DB singleton
 */
export async function getWorldBounds(): Promise<WorldBounds> {
    let config = await prisma.worldConfig.findUnique({ where: { id: 'singleton' } });
    if (!config) {
        config = await prisma.worldConfig.create({
            data: {
                id: 'singleton',
                sizeX: MAP_CONFIG.initialSize.x,
                sizeY: MAP_CONFIG.initialSize.y
            }
        });
        console.log(`🌍 Created world config: ${config.sizeX}x${config.sizeY}`);
    }
    return {
        minX: 0,
        minY: 0,
        maxX: config.sizeX,
        maxY: config.sizeY
    };
}

/**
 * Get quadrant boundaries based on current world size
 */
export async function getQuadrantBounds(quadrant: Quadrant): Promise<{ minX: number; maxX: number; minY: number; maxY: number }> {
    const bounds = await getWorldBounds();
    const midX = bounds.maxX / 2;
    const midY = bounds.maxY / 2;

    const ranges = {
        NW: { minX: 0, maxX: midX, minY: 0, maxY: midY },
        NE: { minX: midX, maxX: bounds.maxX, minY: 0, maxY: midY },
        SW: { minX: 0, maxX: midX, minY: midY, maxY: bounds.maxY },
        SE: { minX: midX, maxX: bounds.maxX, minY: midY, maxY: bounds.maxY },
    };

    return ranges[quadrant];
}

/**
 * Count player colonies in a quadrant
 */
export async function getQuadrantDensity(quadrant: Quadrant): Promise<number> {
    const r = await getQuadrantBounds(quadrant);

    return prisma.planet.count({
        where: {
            isNpc: false,
            x: { gte: r.minX, lt: r.maxX },
            y: { gte: r.minY, lt: r.maxY }
        }
    });
}

/**
 * Expand world if quadrant exceeds density threshold
 * Called ONLY by player spawn logic
 */
export async function maybeExpandWorld(quadrant: Quadrant): Promise<boolean> {
    const density = await getQuadrantDensity(quadrant);

    if (density >= MAP_CONFIG.quadrantDensityThreshold) {
        const current = await getWorldBounds();
        const newSizeX = current.maxX + MAP_CONFIG.expansionIncrement;
        const newSizeY = current.maxY + MAP_CONFIG.expansionIncrement;

        await prisma.worldConfig.update({
            where: { id: 'singleton' },
            data: {
                sizeX: newSizeX,
                sizeY: newSizeY,
                expansionCount: { increment: 1 },
                lastExpansion: new Date()
            }
        });

        console.log(`🌍 World expanded! ${current.maxX}x${current.maxY} → ${newSizeX}x${newSizeY} (${quadrant} had ${density} players)`);
        return true;
    }
    return false;
}

/**
 * Get spawn center point for a quadrant
 */
export async function getQuadrantCenter(quadrant: Quadrant): Promise<{ x: number; y: number }> {
    const r = await getQuadrantBounds(quadrant);
    return {
        x: (r.minX + r.maxX) / 2,
        y: (r.minY + r.maxY) / 2
    };
}

/**
 * Harvester Service
 * 
 * Handles Horizon Harvester spawning near black holes, dark matter production,
 * and conquest/ownership transfer mechanics.
 */

import prisma from '../lib/prisma';
import { BUILDING_DATA } from '../constants/buildingData';
import { UNIT_DATA } from '../constants/unitData';
import { NPC_BALANCE } from '../constants/npcBalanceData';
import {
    HARVESTER_GRID_SIZE,
    HARVESTER_NPC_LEVEL,
    HARVESTER_GENERATOR_COUNT,
    HARVESTER_GENERATOR_SIZE,
    HARVESTER_SPAWN_DISTANCE,
    HARVESTER_INITIAL_RESOURCES,
    HARVESTER_UNIT_SCALING_EXPONENT,
    HARVESTER_BASE_UNITS,
    HARVESTER_LANE_DISTRIBUTION,
    DEFAULT_BLACK_HOLES,
    HARVESTER_MIN_PLANET_DISTANCE,
} from '../constants/harvesterConfig';

// NOTE: HARVESTER_CONFIG is now imported from harvesterConfig.ts
// Legacy compatibility alias
const HARVESTER_CONFIG = {
    gridSize: HARVESTER_GRID_SIZE,
    npcLevel: HARVESTER_NPC_LEVEL,
    generatorCount: HARVESTER_GENERATOR_COUNT,
    generatorSize: HARVESTER_GENERATOR_SIZE,
    accretionDiskMin: HARVESTER_SPAWN_DISTANCE.min,
    accretionDiskMax: HARVESTER_SPAWN_DISTANCE.max,
};

// NPC system user ID (created on demand)
let npcUserId: string | null = null;

/**
 * Get or create the NPC system user for owning Harvesters
 */
async function getNpcUser(): Promise<string> {
    if (npcUserId) return npcUserId;

    const existing = await prisma.user.findUnique({
        where: { username: '__NPC_SYSTEM__' }
    });

    if (existing) {
        npcUserId = existing.id;
        return npcUserId;
    }

    const newUser = await prisma.user.create({
        data: {
            username: '__NPC_SYSTEM__',
            email: 'npc@system.local',
            passwordHash: 'LOCKED_NPC_ACCOUNT',
        }
    });

    npcUserId = newUser.id;
    return npcUserId;
}

/**
 * Generate NPC defense for a Harvester (level 50)
 */
async function generateHarvesterDefense(planetId: string): Promise<void> {
    const level = HARVESTER_CONFIG.npcLevel;

    // Base units scaled to level (constants from harvesterConfig.ts)
    const unitScaling = Math.pow(level, HARVESTER_UNIT_SCALING_EXPONENT);
    const baseUnits: Record<string, number> = {};

    for (const [unitType, baseCount] of Object.entries(HARVESTER_BASE_UNITS)) {
        baseUnits[unitType] = Math.floor(baseCount * unitScaling);
    }

    // Create planet units
    for (const [unitType, count] of Object.entries(baseUnits)) {
        if (count > 0) {
            await prisma.planetUnit.upsert({
                where: { planetId_unitType: { planetId, unitType } },
                update: { count },
                create: { planetId, unitType, count }
            });
        }
    }

    // Create defense layout distributing units across lanes (ratios from harvesterConfig.ts)
    const distributeUnits = (total: Record<string, number>) => {
        const result: Record<string, Record<string, number>> = {
            front: {},
            left: {},
            right: {}
        };

        for (const [unit, count] of Object.entries(total)) {
            result.front[unit] = Math.floor(count * HARVESTER_LANE_DISTRIBUTION.front);
            result.left[unit] = Math.floor(count * HARVESTER_LANE_DISTRIBUTION.left);
            result.right[unit] = Math.floor(count * HARVESTER_LANE_DISTRIBUTION.right);
        }

        return result;
    };

    const lanes = distributeUnits(baseUnits);

    await prisma.defenseLayout.upsert({
        where: { planetId },
        update: {
            frontLaneJson: JSON.stringify({ units: lanes.front, tools: [] }),
            leftLaneJson: JSON.stringify({ units: lanes.left, tools: [] }),
            rightLaneJson: JSON.stringify({ units: lanes.right, tools: [] }),
        },
        create: {
            planetId,
            frontLaneJson: JSON.stringify({ units: lanes.front, tools: [] }),
            leftLaneJson: JSON.stringify({ units: lanes.left, tools: [] }),
            rightLaneJson: JSON.stringify({ units: lanes.right, tools: [] }),
        }
    });
}

/**
 * Place Dark Matter Generators on a Harvester grid
 * Places 5 generators in a spread pattern on the 50x50 grid
 */
async function placeDarkMatterGenerators(planetId: string): Promise<void> {
    const size = HARVESTER_CONFIG.generatorSize;
    const grid = HARVESTER_CONFIG.gridSize;

    // Positions for 5 generators (spread across the grid, avoiding edges)
    // Grid is 50x50, generators are 5x5
    const positions = [
        { x: 10, y: 10 },  // Top-left quadrant
        { x: 35, y: 10 },  // Top-right quadrant
        { x: 22, y: 22 },  // Center
        { x: 10, y: 35 },  // Bottom-left quadrant
        { x: 35, y: 35 },  // Bottom-right quadrant
    ];

    for (const pos of positions) {
        await prisma.building.create({
            data: {
                planetId,
                type: 'dark_matter_generator',
                x: pos.x,
                y: pos.y,
                level: 1,
                status: 'active'
            }
        });
    }
}

/**
 * Spawn a Horizon Harvester near a black hole
 * Positions it within the accretion disk radius
 */
export async function spawnHarvesterNearBlackHole(blackHoleId: string): Promise<string | null> {
    const blackHole = await prisma.blackHole.findUnique({
        where: { id: blackHoleId }
    });

    if (!blackHole) {
        console.error(`Black hole ${blackHoleId} not found`);
        return null;
    }

    const npcOwnerId = await getNpcUser();

    // Find position in accretion disk
    const minDist = HARVESTER_CONFIG.accretionDiskMin;
    const maxDist = HARVESTER_CONFIG.accretionDiskMax;

    let attempts = 0;
    let finalX = 0;
    let finalY = 0;
    let positionFound = false;

    while (attempts < 20 && !positionFound) {
        // Random angle
        const angle = Math.random() * 2 * Math.PI;
        // Random distance within accretion disk
        const distance = minDist + Math.random() * (maxDist - minDist);

        const candidateX = Math.round(blackHole.x + distance * Math.cos(angle));
        const candidateY = Math.round(blackHole.y + distance * Math.sin(angle));

        // Check for existing planets too close
        const nearby = await prisma.planet.findFirst({
            where: {
                x: { gte: candidateX - 50, lte: candidateX + 50 },
                y: { gte: candidateY - 50, lte: candidateY + 50 }
            }
        });

        if (!nearby) {
            finalX = candidateX;
            finalY = candidateY;
            positionFound = true;
        }

        attempts++;
    }

    if (!positionFound) {
        console.error(`Could not find valid position for Harvester near black hole ${blackHoleId}`);
        return null;
    }

    // Create the Harvester planet (resources from harvesterConfig.ts)
    const harvester = await prisma.planet.create({
        data: {
            ownerId: npcOwnerId,
            x: finalX,
            y: finalY,
            name: 'Horizon Harvester',
            isNpc: true,
            npcLevel: HARVESTER_CONFIG.npcLevel,
            npcClass: 'harvester',
            planetType: 'harvester',
            gridSizeX: HARVESTER_CONFIG.gridSize,
            gridSizeY: HARVESTER_CONFIG.gridSize,
            carbon: HARVESTER_INITIAL_RESOURCES.carbon,
            titanium: HARVESTER_INITIAL_RESOURCES.titanium,
            food: HARVESTER_INITIAL_RESOURCES.food,
            credits: HARVESTER_INITIAL_RESOURCES.credits,
            darkMatter: 0,
            stability: 100,
        }
    });

    // Place dark matter generators
    await placeDarkMatterGenerators(harvester.id);

    // Generate NPC defense
    await generateHarvesterDefense(harvester.id);

    console.log(`Spawned Horizon Harvester at (${finalX}, ${finalY}) near black hole ${blackHoleId}`);

    return harvester.id;
}

/**
 * Sync dark matter production for a planet (lazy evaluation)
 * Called during planet resource sync
 */
export function calculateDarkMatterProduction(buildings: { type: string; level: number; status: string }[]): number {
    let totalProduction = 0;

    for (const building of buildings) {
        if (building.type === 'dark_matter_generator' && building.status === 'active') {
            const stats = BUILDING_DATA.dark_matter_generator?.levels[building.level];
            if (stats?.production) {
                totalProduction += stats.production;
            }
        }
    }

    return totalProduction; // Per hour
}

/**
 * Transfer Harvester ownership after conquest
 * - Destroys all defender units
 * - Transfers ownership to attacker
 * - Stations surviving attackers
 */
export async function transferHarvesterOwnership(
    harvesterId: string,
    newOwnerId: string,
    survivingAttackers: Record<string, number>
): Promise<void> {
    // Delete all existing planet units (defenders destroyed)
    await prisma.planetUnit.deleteMany({
        where: { planetId: harvesterId }
    });

    // Clear defense layout
    await prisma.defenseLayout.deleteMany({
        where: { planetId: harvesterId }
    });

    // Fetch new owner's username for naming
    const newOwner = await prisma.user.findUnique({
        where: { id: newOwnerId },
        select: { username: true }
    });
    const ownerName = newOwner?.username || 'Unknown';

    // Update planet ownership and name to reflect new owner
    await prisma.planet.update({
        where: { id: harvesterId },
        data: {
            ownerId: newOwnerId,
            name: `${ownerName}'s Horizon Harvester`,
            isNpc: false,
            npcLevel: 0,
            npcClass: null,
        }
    });

    // Station surviving attackers
    for (const [unitType, count] of Object.entries(survivingAttackers)) {
        if (count > 0) {
            await prisma.planetUnit.upsert({
                where: { planetId_unitType: { planetId: harvesterId, unitType } },
                update: { count },
                create: { planetId: harvesterId, unitType, count }
            });
        }
    }

    // Create fresh defense layout for new owner
    const emptyLane = JSON.stringify({ units: {}, tools: [] });
    await prisma.defenseLayout.create({
        data: {
            planetId: harvesterId,
            frontLaneJson: emptyLane,
            leftLaneJson: emptyLane,
            rightLaneJson: emptyLane,
        }
    });

    console.log(`Harvester ${harvesterId} transferred to user ${newOwnerId}`);
}

/**
 * Seed black holes into database (matching visual positions or creating new ones)
 */
export async function seedBlackHoles(): Promise<void> {
    // Black hole positions from harvesterConfig.ts
    for (const bh of DEFAULT_BLACK_HOLES) {
        const existing = await prisma.blackHole.findFirst({
            where: { x: bh.x, y: bh.y }
        });

        if (!existing) {
            await prisma.blackHole.create({
                data: {
                    x: bh.x,
                    y: bh.y,
                    radius: bh.radius
                }
            });
            console.log(`Created black hole at (${bh.x}, ${bh.y})`);
        }
    }
}

/**
 * Spawn Harvesters for all black holes that don't have one
 */
export async function spawnMissingHarvesters(): Promise<void> {
    const blackHoles = await prisma.blackHole.findMany();

    for (const bh of blackHoles) {
        // Check if there's already a Harvester near this black hole
        const existingHarvester = await prisma.planet.findFirst({
            where: {
                planetType: 'harvester',
                x: { gte: bh.x - bh.radius - 50, lte: bh.x + bh.radius + 50 },
                y: { gte: bh.y - bh.radius - 50, lte: bh.y + bh.radius + 50 }
            }
        });

        if (!existingHarvester) {
            await spawnHarvesterNearBlackHole(bh.id);
        }
    }
}

/**
 * Get all black holes from database
 */
export async function getBlackHoles() {
    return prisma.blackHole.findMany();
}

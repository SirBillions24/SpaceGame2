/**
 * Capital Ship Service
 * 
 * Handles the lifecycle of Capital Ships:
 * - Construction with donation phases
 * - Deployment and travel
 * - Commitment periods
 * - Combat damage
 * - Destruction and repair
 * 
 * State Machine:
 * constructing → ready → traveling → deployed → returning → ready
 *                                  ↓
 *                            damaged → repairing → ready
 */

import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import {
    CAPITAL_SHIP_CONFIG,
    isValidCommitmentDays,
    getPhaseCost,
    getTotalCost,
    calculateCapitalShipTravelTime,
    getHpRepairCost
} from '../constants/capitalShipConfig';
import { BASE_FLEET_SPEED } from '../constants/mechanics';
import { calculateDistance } from './fleetService';
import { socketService } from './socketService';
import { queueCapitalShipArrival, queueCapitalShipReturn } from '../lib/jobQueue';

// =============================================================================
// TYPES
// =============================================================================

export interface BuildProgress {
    required: Record<string, number>;
    donated: Record<string, number>;
    phase: number;
    totalPhases: number;
    isRepair: boolean;
    lastDonationTime?: string;
}

export interface CapitalShipForSocket {
    id: string;
    ownerId: string;
    ownerName?: string;
    x: number | null;
    y: number | null;
    status: string;
    commitmentDays: number | null;
    currentHp: number;
    maxHp: number;
    arrivalTime: string | null;
    deployedUntil: string | null;
    cooldownUntil: string | null;
    buildProgress: BuildProgress | null;
    // For map visualization
    fromPlanetId?: string | null;
    fromPlanet?: { x: number; y: number; name: string } | null;
    targetX?: number | null;
    targetY?: number | null;
    travelStartedAt?: string | null;
    garrison?: { troops: Record<string, number>; tools: Record<string, number>; loot?: Record<string, number> } | null;
}

// =============================================================================
// CONSTRUCTION
// =============================================================================

/**
 * Start construction of a new Capital Ship
 */
export async function startConstruction(
    userId: string,
    fromPlanetId: string
): Promise<{ capitalShip: any; error?: string }> {
    // Check if user can build
    const canBuild = await canBuildCapitalShip(userId);
    if (!canBuild.allowed) {
        return { capitalShip: null, error: canBuild.reason };
    }

    // Verify planet ownership
    const planet = await prisma.planet.findUnique({
        where: { id: fromPlanetId },
    });

    if (!planet || planet.ownerId !== userId) {
        return { capitalShip: null, error: 'You do not own this planet' };
    }

    const config = CAPITAL_SHIP_CONFIG;
    const totalCost = getTotalCost(false);
    const phaseCost = getPhaseCost(1, false);

    // Initialize build progress
    const buildProgress: BuildProgress = {
        required: totalCost,
        donated: {},
        phase: 1,
        totalPhases: config.construction.donationPhases,
        isRepair: false,
    };

    // Create the Capital Ship in constructing state
    const capitalShip = await prisma.capitalShip.create({
        data: {
            ownerId: userId,
            fromPlanetId: fromPlanetId,
            status: 'constructing',
            currentHp: 0,
            maxHp: config.combat.baseHp,
            garrison: config.combat.baseGarrison as Prisma.InputJsonValue,
            buildProgress: buildProgress as unknown as Prisma.InputJsonValue,
        },
        include: {
            owner: { select: { username: true } },
            fromPlanet: { select: { name: true, x: true, y: true } },
        },
    });

    console.log(`🚀 Capital Ship construction started for user ${userId}`);

    return { capitalShip };
}

/**
 * Donate resources to construction or repair
 */
export async function donateToConstruction(
    userId: string,
    capitalShipId: string,
    fromPlanetId: string,
    donation: Record<string, number>
): Promise<{ capitalShip: any; phaseComplete: boolean; constructionComplete: boolean; error?: string }> {
    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!capitalShip) {
        return { capitalShip: null, phaseComplete: false, constructionComplete: false, error: 'Capital Ship not found' };
    }

    if (capitalShip.ownerId !== userId) {
        return { capitalShip: null, phaseComplete: false, constructionComplete: false, error: 'Not authorized' };
    }

    if (capitalShip.status !== 'constructing' && capitalShip.status !== 'repairing') {
        return { capitalShip: null, phaseComplete: false, constructionComplete: false, error: 'Capital Ship is not in construction or repair mode' };
    }

    const progress = capitalShip.buildProgress as unknown as BuildProgress;
    if (!progress) {
        return { capitalShip: null, phaseComplete: false, constructionComplete: false, error: 'Invalid build progress' };
    }

    // Check phase delay
    const config = CAPITAL_SHIP_CONFIG;
    const delayMinutes = progress.isRepair
        ? config.destruction.repairPhaseDelayMinutes
        : config.construction.phaseDelayMinutes;

    if (progress.lastDonationTime) {
        const lastDonation = new Date(progress.lastDonationTime);
        const minNextDonation = new Date(lastDonation.getTime() + delayMinutes * 60 * 1000);
        if (new Date() < minNextDonation) {
            const remaining = Math.ceil((minNextDonation.getTime() - Date.now()) / 60000);
            return {
                capitalShip: null,
                phaseComplete: false,
                constructionComplete: false,
                error: `Must wait ${remaining} more minutes before next donation`
            };
        }
    }

    // Verify planet and deduct resources
    const planet = await prisma.planet.findUnique({
        where: { id: fromPlanetId },
    });

    if (!planet || planet.ownerId !== userId) {
        return { capitalShip: null, phaseComplete: false, constructionComplete: false, error: 'Planet not owned' };
    }

    // Also fetch user for dark matter (it's user-level, not planet-level)
    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    if (!user) {
        return { capitalShip: null, phaseComplete: false, constructionComplete: false, error: 'User not found' };
    }

    // Calculate what's still needed for current phase
    const phaseCost = getPhaseCost(progress.phase, progress.isRepair);
    const stillNeeded: Record<string, number> = {};

    for (const [resource, needed] of Object.entries(phaseCost)) {
        const alreadyDonated = progress.donated[resource] || 0;
        const remaining = Math.max(0, needed - alreadyDonated);
        if (remaining > 0) {
            stillNeeded[resource] = remaining;
        }
    }

    // Validate donation amounts - handle dark matter from user, others from planet
    const actualDonation: Record<string, number> = {};
    for (const [resource, amount] of Object.entries(donation)) {
        if (amount <= 0) continue;

        const needed = stillNeeded[resource] || 0;
        if (needed <= 0) continue;

        // Dark matter comes from user, other resources from planet
        let available: number;
        if (resource === 'darkMatter') {
            available = user.darkMatter || 0;
        } else {
            available = (planet as any)[resource] || 0;
        }

        const donateAmount = Math.min(amount, needed, available);

        if (donateAmount > 0) {
            actualDonation[resource] = donateAmount;
        }
    }

    if (Object.keys(actualDonation).length === 0) {
        return { capitalShip: null, phaseComplete: false, constructionComplete: false, error: 'No valid resources to donate' };
    }

    // Deduct resources and update progress
    const result = await prisma.$transaction(async (tx) => {
        // Deduct from planet (carbon, titanium)
        const planetDeduct: Record<string, any> = {};
        for (const [resource, amount] of Object.entries(actualDonation)) {
            if (resource !== 'darkMatter') {
                planetDeduct[resource] = { decrement: amount };
            }
        }

        if (Object.keys(planetDeduct).length > 0) {
            await tx.planet.update({
                where: { id: fromPlanetId },
                data: planetDeduct,
            });
        }

        // Deduct dark matter from user
        if (actualDonation.darkMatter) {
            await tx.user.update({
                where: { id: userId },
                data: { darkMatter: { decrement: actualDonation.darkMatter } },
            });
        }

        // Update donated amounts
        const newDonated = { ...progress.donated };
        for (const [resource, amount] of Object.entries(actualDonation)) {
            newDonated[resource] = (newDonated[resource] || 0) + amount;
        }

        // Check if phase is complete
        let phaseComplete = true;
        for (const [resource, needed] of Object.entries(phaseCost)) {
            if ((newDonated[resource] || 0) < needed) {
                phaseComplete = false;
                break;
            }
        }

        let newStatus = capitalShip.status;
        let constructionComplete = false;
        let newProgress: BuildProgress = {
            ...progress,
            donated: newDonated,
            lastDonationTime: new Date().toISOString(),
        };

        if (phaseComplete) {
            if (progress.phase >= progress.totalPhases) {
                // All phases complete!
                constructionComplete = true;
                newStatus = 'ready';
                newProgress = null as any; // Clear progress when complete
            } else {
                // Move to next phase
                newProgress = {
                    ...newProgress,
                    phase: progress.phase + 1,
                    donated: {}, // Reset donated for new phase
                };
            }
        }

        const updated = await tx.capitalShip.update({
            where: { id: capitalShipId },
            data: {
                status: newStatus,
                currentHp: constructionComplete ? config.combat.baseHp : 0,
                buildProgress: newProgress as unknown as Prisma.InputJsonValue,
            },
            include: {
                owner: { select: { username: true } },
            },
        });

        return { updated, phaseComplete, constructionComplete };
    });

    console.log(`💰 Capital Ship ${capitalShipId}: donated ${JSON.stringify(actualDonation)}, phase ${progress.phase}/${progress.totalPhases}`);

    return {
        capitalShip: result.updated,
        phaseComplete: result.phaseComplete,
        constructionComplete: result.constructionComplete
    };
}

// =============================================================================
// LOADING (Troops/Tools)
// =============================================================================

interface GarrisonData {
    troops: Record<string, number>;
    tools: Record<string, number>;
    loot?: Record<string, number>; // Resources looted from colonies (metal, crystal, gas, etc.)
}

/**
 * Load troops and tools onto a Capital Ship from a planet
 */
export async function loadCapitalShip(
    userId: string,
    capitalShipId: string,
    fromPlanetId: string,
    troops: Record<string, number>,
    tools: Record<string, number>
): Promise<{ capitalShip: any; error?: string }> {
    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!capitalShip) {
        return { capitalShip: null, error: 'Capital Ship not found' };
    }

    if (capitalShip.ownerId !== userId) {
        return { capitalShip: null, error: 'Not authorized' };
    }

    // Allow loading when ready (in hangar) or deployed (can receive transfers)
    if (capitalShip.status !== 'ready' && capitalShip.status !== 'deployed') {
        return { capitalShip: null, error: 'Capital Ship must be ready or deployed to load troops. Current status: ' + capitalShip.status };
    }

    // Verify planet ownership
    const planet = await prisma.planet.findUnique({
        where: { id: fromPlanetId },
        include: { units: true },
    });

    if (!planet || planet.ownerId !== userId) {
        return { capitalShip: null, error: 'Planet not owned' };
    }

    // Get current garrison
    const currentGarrison = (capitalShip.garrison as unknown as GarrisonData) || { troops: {}, tools: {} };
    const config = CAPITAL_SHIP_CONFIG.garrison;

    // Calculate current totals
    let currentTroopCount = Object.values(currentGarrison.troops || {}).reduce((sum, n) => sum + n, 0);
    let currentToolCount = Object.values(currentGarrison.tools || {}).reduce((sum, n) => sum + n, 0);

    // Validate and prepare troop transfers
    const troopTransfers: Record<string, number> = {};
    const troopsToAdd = Object.entries(troops).filter(([_, count]) => count > 0);

    for (const [unitType, count] of troopsToAdd) {
        if (count <= 0) continue;

        // Check capacity
        if (currentTroopCount + count > config.baseTroopCapacity) {
            const available = config.baseTroopCapacity - currentTroopCount;
            return { capitalShip: null, error: `Troop capacity exceeded. Can only add ${available} more troops (max ${config.baseTroopCapacity})` };
        }

        // Check planet has these units
        const planetUnit = planet.units.find(u => u.unitType === unitType);
        if (!planetUnit || planetUnit.count < count) {
            return { capitalShip: null, error: `Insufficient ${unitType} on planet (have: ${planetUnit?.count || 0}, need: ${count})` };
        }

        troopTransfers[unitType] = count;
        currentTroopCount += count;
    }

    // Validate and prepare tool transfers
    const toolTransfers: Record<string, number> = {};
    const toolsToAdd = Object.entries(tools).filter(([_, count]) => count > 0);

    for (const [toolType, count] of toolsToAdd) {
        if (count <= 0) continue;

        // Check capacity
        if (currentToolCount + count > config.baseToolCapacity) {
            const available = config.baseToolCapacity - currentToolCount;
            return { capitalShip: null, error: `Tool capacity exceeded. Can only add ${available} more tools (max ${config.baseToolCapacity})` };
        }

        // TODO: Check planet has these tools (need tool inventory system)
        toolTransfers[toolType] = count;
        currentToolCount += count;
    }

    if (Object.keys(troopTransfers).length === 0 && Object.keys(toolTransfers).length === 0) {
        return { capitalShip: null, error: 'No troops or tools specified to load' };
    }

    // Execute transfer in transaction
    const result = await prisma.$transaction(async (tx) => {
        // Deduct troops from planet
        for (const [unitType, count] of Object.entries(troopTransfers)) {
            await tx.planetUnit.update({
                where: { planetId_unitType: { planetId: fromPlanetId, unitType } },
                data: { count: { decrement: count } },
            });
        }

        // TODO: Deduct tools from planet (when tool inventory exists)

        // Update garrison
        const newGarrison: GarrisonData = {
            troops: { ...currentGarrison.troops },
            tools: { ...currentGarrison.tools },
        };

        for (const [unitType, count] of Object.entries(troopTransfers)) {
            newGarrison.troops[unitType] = (newGarrison.troops[unitType] || 0) + count;
        }

        for (const [toolType, count] of Object.entries(toolTransfers)) {
            newGarrison.tools[toolType] = (newGarrison.tools[toolType] || 0) + count;
        }

        const updated = await tx.capitalShip.update({
            where: { id: capitalShipId },
            data: {
                garrison: newGarrison as unknown as Prisma.InputJsonValue,
            },
            include: {
                owner: { select: { username: true } },
            },
        });

        return updated;
    });

    console.log(`📦 Capital Ship ${capitalShipId}: loaded ${JSON.stringify(troopTransfers)} troops, ${JSON.stringify(toolTransfers)} tools`);

    // Emit socket event
    socketService.emitToUser(userId, 'capitalShip:updated', formatForSocket(result));

    return { capitalShip: result };
}

/**
 * Unload troops and tools from a Capital Ship back to a planet
 */
export async function unloadCapitalShip(
    userId: string,
    capitalShipId: string,
    toPlanetId: string,
    troops: Record<string, number>,
    tools: Record<string, number>
): Promise<{ capitalShip: any; error?: string }> {
    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!capitalShip) {
        return { capitalShip: null, error: 'Capital Ship not found' };
    }

    if (capitalShip.ownerId !== userId) {
        return { capitalShip: null, error: 'Not authorized' };
    }

    // Allow unloading when ready (in hangar) or deployed (can transfer to nearby colonies)
    if (capitalShip.status !== 'ready' && capitalShip.status !== 'deployed') {
        return { capitalShip: null, error: 'Capital Ship must be ready or deployed to unload troops. Current status: ' + capitalShip.status };
    }

    // Verify planet ownership
    const planet = await prisma.planet.findUnique({
        where: { id: toPlanetId },
    });

    if (!planet || planet.ownerId !== userId) {
        return { capitalShip: null, error: 'Planet not owned' };
    }

    // Get current garrison
    const currentGarrison = (capitalShip.garrison as unknown as GarrisonData) || { troops: {}, tools: {} };

    // Validate and prepare troop transfers
    const troopTransfers: Record<string, number> = {};
    const troopsToUnload = Object.entries(troops).filter(([_, count]) => count > 0);

    for (const [unitType, count] of troopsToUnload) {
        if (count <= 0) continue;

        // Check garrison has these units
        const garrisonCount = currentGarrison.troops[unitType] || 0;
        if (garrisonCount < count) {
            return { capitalShip: null, error: `Insufficient ${unitType} on ship (have: ${garrisonCount}, requested: ${count})` };
        }

        troopTransfers[unitType] = count;
    }

    // Validate and prepare tool transfers
    const toolTransfers: Record<string, number> = {};
    const toolsToUnload = Object.entries(tools).filter(([_, count]) => count > 0);

    for (const [toolType, count] of toolsToUnload) {
        if (count <= 0) continue;

        const garrisonToolCount = currentGarrison.tools[toolType] || 0;
        if (garrisonToolCount < count) {
            return { capitalShip: null, error: `Insufficient ${toolType} on ship (have: ${garrisonToolCount}, requested: ${count})` };
        }

        toolTransfers[toolType] = count;
    }

    if (Object.keys(troopTransfers).length === 0 && Object.keys(toolTransfers).length === 0) {
        return { capitalShip: null, error: 'No troops or tools specified to unload' };
    }

    // Execute transfer in transaction
    const result = await prisma.$transaction(async (tx) => {
        // Add troops to planet
        for (const [unitType, count] of Object.entries(troopTransfers)) {
            await tx.planetUnit.upsert({
                where: { planetId_unitType: { planetId: toPlanetId, unitType } },
                create: { planetId: toPlanetId, unitType, count },
                update: { count: { increment: count } },
            });
        }

        // TODO: Add tools to planet (when tool inventory exists)

        // Update garrison
        const newGarrison: GarrisonData = {
            troops: { ...currentGarrison.troops },
            tools: { ...currentGarrison.tools },
        };

        for (const [unitType, count] of Object.entries(troopTransfers)) {
            newGarrison.troops[unitType] = Math.max(0, (newGarrison.troops[unitType] || 0) - count);
            if (newGarrison.troops[unitType] === 0) {
                delete newGarrison.troops[unitType];
            }
        }

        for (const [toolType, count] of Object.entries(toolTransfers)) {
            newGarrison.tools[toolType] = Math.max(0, (newGarrison.tools[toolType] || 0) - count);
            if (newGarrison.tools[toolType] === 0) {
                delete newGarrison.tools[toolType];
            }
        }

        const updated = await tx.capitalShip.update({
            where: { id: capitalShipId },
            data: {
                garrison: newGarrison as unknown as Prisma.InputJsonValue,
            },
            include: {
                owner: { select: { username: true } },
            },
        });

        return updated;
    });

    console.log(`📤 Capital Ship ${capitalShipId}: unloaded ${JSON.stringify(troopTransfers)} troops, ${JSON.stringify(toolTransfers)} tools to planet ${toPlanetId}`);

    // Emit socket event
    socketService.emitToUser(userId, 'capitalShip:updated', formatForSocket(result));

    return { capitalShip: result };
}

// =============================================================================
// DEPLOYMENT
// =============================================================================


/**
 * Deploy a Capital Ship to a target location
 */
export async function deployCapitalShip(
    userId: string,
    capitalShipId: string,
    targetX: number,
    targetY: number,
    commitmentDays: number
): Promise<{ capitalShip: any; arrivalTime: Date; error?: string }> {
    if (!isValidCommitmentDays(commitmentDays)) {
        return {
            capitalShip: null,
            arrivalTime: null as any,
            error: `Invalid commitment duration. Options: ${CAPITAL_SHIP_CONFIG.deployment.commitmentOptions.join(', ')} days`
        };
    }

    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
        include: { fromPlanet: true },
    });

    if (!capitalShip) {
        return { capitalShip: null, arrivalTime: null as any, error: 'Capital Ship not found' };
    }

    if (capitalShip.ownerId !== userId) {
        return { capitalShip: null, arrivalTime: null as any, error: 'Not authorized' };
    }

    // Allow deployment if ship is 'ready' (all phases complete)
    // OR if currently constructing phase 2+ (meaning phase 1 is complete)
    // Phase 1 ships deploy as "glass cannons" with no defense bonuses
    const buildProgress = capitalShip.buildProgress as { phase?: number } | null;
    const canDeploy = capitalShip.status === 'ready' ||
        (capitalShip.status === 'constructing' && buildProgress && (buildProgress.phase ?? 0) >= 2);

    if (!canDeploy) {
        return { capitalShip: null, arrivalTime: null as any, error: 'Must complete at least Phase 1 (Airframe) before deployment' };
    }

    // Calculate travel time
    const distance = calculateDistance(
        capitalShip.fromPlanet.x,
        capitalShip.fromPlanet.y,
        targetX,
        targetY
    );

    const travelTimeSeconds = calculateCapitalShipTravelTime(distance, BASE_FLEET_SPEED);
    const arrivalTime = new Date(Date.now() + travelTimeSeconds * 1000);

    const updated = await prisma.capitalShip.update({
        where: { id: capitalShipId },
        data: {
            status: 'traveling',
            x: targetX,
            y: targetY,
            targetX: targetX,
            targetY: targetY,
            commitmentDays: commitmentDays,
            travelStartedAt: new Date(),
            arrivalTime: arrivalTime,
        },
        include: {
            owner: { select: { username: true } },
            fromPlanet: true,
        },
    });

    console.log(`🚀 Capital Ship ${capitalShipId} deploying to (${targetX}, ${targetY}), ETA: ${travelTimeSeconds}s`);

    // Queue arrival job
    await queueCapitalShipArrival({ capitalShipId }, arrivalTime);

    // Emit socket event
    socketService.emitToUser(userId, 'capitalShip:updated', formatForSocket(updated));

    return { capitalShip: updated, arrivalTime };
}

/**
 * Complete Capital Ship arrival (called by job queue)
 */
export async function completeArrival(capitalShipId: string): Promise<void> {
    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!capitalShip || capitalShip.status !== 'traveling') {
        console.log(`Capital Ship ${capitalShipId} not traveling, skipping arrival`);
        return;
    }

    const deployedUntil = new Date(
        Date.now() + (capitalShip.commitmentDays || 1) * 24 * 60 * 60 * 1000
    );

    const updated = await prisma.capitalShip.update({
        where: { id: capitalShipId },
        data: {
            status: 'deployed',
            arrivalTime: null,
            deployedUntil: deployedUntil,
        },
        include: {
            owner: { select: { username: true } },
            fromPlanet: { select: { x: true, y: true, name: true } },
        },
    });

    console.log(`✅ Capital Ship ${capitalShipId} deployed until ${deployedUntil.toISOString()}`);

    // Queue commitment end job to trigger auto-return when commitment expires
    const { queueCapitalShipCommitmentEnd } = await import('../lib/jobQueue');
    await queueCapitalShipCommitmentEnd({ capitalShipId }, deployedUntil);

    // Emit to owner
    socketService.emitToUser(updated.ownerId, 'capitalShip:updated', formatForSocket(updated));

    // Emit to all users for map visibility
    socketService.emitToAll('capitalShip:deployed', formatForSocket(updated));
}

// =============================================================================
// RECALL
// =============================================================================

/**
 * Recall a deployed Capital Ship
 */
export async function recallCapitalShip(
    userId: string,
    capitalShipId: string
): Promise<{ capitalShip: any; arrivalTime: Date; error?: string }> {
    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
        include: { fromPlanet: true },
    });

    if (!capitalShip) {
        return { capitalShip: null, arrivalTime: null as any, error: 'Capital Ship not found' };
    }

    if (capitalShip.ownerId !== userId) {
        return { capitalShip: null, arrivalTime: null as any, error: 'Not authorized' };
    }

    // For traveling ships, abort immediately (set to ready)
    if (capitalShip.status === 'traveling') {
        const updated = await prisma.capitalShip.update({
            where: { id: capitalShipId },
            data: {
                status: 'ready',
                x: null,
                y: null,
                targetX: null,
                targetY: null,
                arrivalTime: null,
                travelStartedAt: null,
                deployedUntil: null
            },
            include: { fromPlanet: true }
        });
        return { capitalShip: updated, arrivalTime: null as any, error: undefined };
    }

    if (capitalShip.status !== 'deployed') {
        return { capitalShip: null, arrivalTime: null as any, error: 'Capital Ship is not deployed or traveling' };
    }

    // TODO: Re-enable commitment check after testing
    // Check if commitment period is over
    // if (capitalShip.deployedUntil && new Date() < capitalShip.deployedUntil) {
    //     const remaining = Math.ceil((capitalShip.deployedUntil.getTime() - Date.now()) / (1000 * 60 * 60));
    //     return {
    //         capitalShip: null,
    //         arrivalTime: null as any,
    //         error: `Cannot recall during commitment period. ${remaining} hours remaining.`
    //     };
    // }

    // Calculate return travel time
    const distance = calculateDistance(
        capitalShip.x!,
        capitalShip.y!,
        capitalShip.fromPlanet.x,
        capitalShip.fromPlanet.y
    );

    const travelTimeSeconds = calculateCapitalShipTravelTime(distance, BASE_FLEET_SPEED);
    const arrivalTime = new Date(Date.now() + travelTimeSeconds * 1000);

    const updated = await prisma.capitalShip.update({
        where: { id: capitalShipId },
        data: {
            status: 'returning',
            travelStartedAt: new Date(),
            arrivalTime: arrivalTime,
            deployedUntil: null,
        },
        include: {
            owner: { select: { username: true } },
            fromPlanet: { select: { x: true, y: true, name: true } },
        },
    });

    console.log(`🔙 Capital Ship ${capitalShipId} returning home, ETA: ${travelTimeSeconds}s`);

    // Queue return job
    await queueCapitalShipReturn({ capitalShipId }, arrivalTime);

    socketService.emitToUser(userId, 'capitalShip:updated', formatForSocket(updated));
    socketService.emitToAll('capitalShip:recalled', { id: capitalShipId });

    return { capitalShip: updated, arrivalTime };
}

/**
 * Complete Capital Ship return (called by job queue)
 */
export async function completeReturn(capitalShipId: string): Promise<void> {
    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!capitalShip || capitalShip.status !== 'returning') {
        console.log(`Capital Ship ${capitalShipId} not returning, skipping`);
        return;
    }

    const updated = await prisma.capitalShip.update({
        where: { id: capitalShipId },
        data: {
            status: 'ready',
            x: null,
            y: null,
            arrivalTime: null,
            commitmentDays: null,
        },
        include: {
            owner: { select: { username: true } },
            fromPlanet: { select: { x: true, y: true, name: true } },
        },
    });

    console.log(`🏠 Capital Ship ${capitalShipId} returned home`);

    socketService.emitToUser(updated.ownerId, 'capitalShip:updated', formatForSocket(updated));
}

// =============================================================================
// COMBAT & DESTRUCTION
// =============================================================================

/**
 * Deal damage to a Capital Ship
 */
export async function damageCapitalShip(
    capitalShipId: string,
    damage: number
): Promise<{ destroyed: boolean; newHp: number }> {
    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!capitalShip || capitalShip.status !== 'deployed') {
        return { destroyed: false, newHp: capitalShip?.currentHp || 0 };
    }

    const newHp = Math.max(0, capitalShip.currentHp - damage);
    const destroyed = newHp <= 0;

    if (destroyed) {
        await destroyCapitalShip(capitalShipId);
        return { destroyed: true, newHp: 0 };
    }

    await prisma.capitalShip.update({
        where: { id: capitalShipId },
        data: { currentHp: newHp },
    });

    socketService.emitToAll('capitalShip:damaged', {
        id: capitalShipId,
        currentHp: newHp,
        maxHp: capitalShip.maxHp,
    });

    return { destroyed: false, newHp };
}

/**
 * Destroy a Capital Ship
 */
export async function destroyCapitalShip(capitalShipId: string): Promise<void> {
    const config = CAPITAL_SHIP_CONFIG;
    const cooldownUntil = new Date(
        Date.now() + config.destruction.cooldownHours * 60 * 60 * 1000
    );

    const updated = await prisma.capitalShip.update({
        where: { id: capitalShipId },
        data: {
            status: 'damaged',
            x: null,
            y: null,
            currentHp: 0,
            arrivalTime: null,
            deployedUntil: null,
            cooldownUntil: cooldownUntil,
            buildProgress: Prisma.JsonNull,
        },
        include: {
            owner: { select: { username: true } },
        },
    });

    console.log(`💥 Capital Ship ${capitalShipId} destroyed! Cooldown until ${cooldownUntil.toISOString()}`);

    socketService.emitToUser(updated.ownerId, 'capitalShip:updated', formatForSocket(updated));
    socketService.emitToAll('capitalShip:destroyed', { id: capitalShipId });

    // Create inbox message
    await prisma.inboxMessage.create({
        data: {
            userId: updated.ownerId,
            type: 'capital_ship_destroyed',
            title: 'Capital Ship Destroyed!',
            content: `Your Capital Ship has been destroyed in battle. Cooldown: ${config.destruction.cooldownHours} hours before repairs can begin.`,
        },
    });
}

/**
 * Salvage (permanently delete) a destroyed Capital Ship to free up the slot
 * Only allowed after cooldown period ends
 */
export async function salvageCapitalShip(
    userId: string,
    capitalShipId: string
): Promise<{ success: boolean; error?: string }> {
    const ship = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!ship) {
        return { success: false, error: 'Capital Ship not found' };
    }

    if (ship.ownerId !== userId) {
        return { success: false, error: 'Not authorized' };
    }

    // Only allow salvaging damaged ships
    if (ship.status !== 'damaged') {
        return { success: false, error: 'Can only salvage destroyed ships' };
    }

    // Must wait for cooldown to end
    if (ship.cooldownUntil && new Date(ship.cooldownUntil) > new Date()) {
        return { success: false, error: 'Must wait for cooldown to end before salvaging' };
    }

    // Delete the ship permanently
    await prisma.capitalShip.delete({
        where: { id: capitalShipId },
    });

    console.log(`🗑️ Capital Ship ${capitalShipId} salvaged and slot freed`);

    socketService.emitToUser(userId, 'capitalShip:salvaged', { id: capitalShipId });

    return { success: true };
}

// =============================================================================
// HP REPAIR (Resource Donation to Heal Damage)
// =============================================================================

/**
 * Repair HP damage by donating resources.
 * Cost is proportional to HP missing, uses getHpRepairCost formula.
 * 
 * @param userId Owner of the capital ship
 * @param capitalShipId Capital ship to repair
 * @param planetId Planet to draw resources from
 * @param donation Resources to donate (can be partial)
 * @returns Result with new HP and remaining cost
 */
export async function repairHpDamage(
    userId: string,
    capitalShipId: string,
    planetId: string,
    donation: Record<string, number>
): Promise<{
    success: boolean;
    newHp?: number;
    hpHealed?: number;
    remainingCost?: Record<string, number>;
    error?: string;
}> {
    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!capitalShip) {
        return { success: false, error: 'Capital Ship not found' };
    }

    if (capitalShip.ownerId !== userId) {
        return { success: false, error: 'Not authorized' };
    }

    // Only repair if not at full HP
    if (capitalShip.currentHp >= capitalShip.maxHp) {
        return { success: false, error: 'Capital Ship is at full HP' };
    }

    // Can repair in most statuses (not constructing/repairing/damaged)
    const repairableStatuses = ['ready', 'traveling', 'deployed', 'returning'];
    if (!repairableStatuses.includes(capitalShip.status)) {
        return { success: false, error: `Cannot repair ship in ${capitalShip.status} status` };
    }

    const planet = await prisma.planet.findFirst({
        where: { id: planetId, ownerId: userId },
    });

    if (!planet) {
        return { success: false, error: 'Planet not found or not owned by you' };
    }

    // Calculate full repair cost for all missing HP
    const missingHp = capitalShip.maxHp - capitalShip.currentHp;
    const fullRepairCost = getHpRepairCost(missingHp, capitalShip.maxHp);

    // Get planet resources as record for easy access
    const planetResources: Record<string, number> = {
        carbon: planet.carbon,
        titanium: planet.titanium,
    };

    // Determine what we can actually donate (capped by planet resources)
    const actualDonation: Record<string, number> = {};
    let totalDonationValue = 0;
    let totalCostValue = 0;

    for (const [resource, needed] of Object.entries(fullRepairCost)) {
        const available = planetResources[resource] || 0;
        const wanted = donation[resource] || 0;
        const capped = Math.min(wanted, available, needed);
        if (capped > 0) {
            actualDonation[resource] = capped;
            totalDonationValue += capped;
        }
        totalCostValue += needed;
    }

    if (totalDonationValue === 0) {
        return { success: false, error: 'No valid resources to donate' };
    }

    // Calculate HP healed: proportional to donation vs full cost
    const healRatio = totalDonationValue / totalCostValue;
    const hpHealed = Math.floor(missingHp * healRatio);
    const newHp = Math.min(capitalShip.currentHp + hpHealed, capitalShip.maxHp);

    // Build planet resource update object
    const planetUpdate: Record<string, number> = {};
    if (actualDonation.carbon) {
        planetUpdate.carbon = planet.carbon - actualDonation.carbon;
    }
    if (actualDonation.titanium) {
        planetUpdate.titanium = planet.titanium - actualDonation.titanium;
    }

    await prisma.$transaction([
        prisma.planet.update({
            where: { id: planetId },
            data: planetUpdate,
        }),
        prisma.capitalShip.update({
            where: { id: capitalShipId },
            data: { currentHp: newHp },
        }),
    ]);

    // Calculate remaining repair cost
    const newMissingHp = capitalShip.maxHp - newHp;
    const remainingCost = newMissingHp > 0 ? getHpRepairCost(newMissingHp, capitalShip.maxHp) : {};

    console.log(`🔧 Capital Ship ${capitalShipId}: repaired ${hpHealed} HP (${capitalShip.currentHp} → ${newHp}), donated ${JSON.stringify(actualDonation)}`);

    // Emit socket update
    const updated = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
        include: { owner: { select: { username: true } } },
    });
    if (updated) {
        socketService.emitToUser(userId, 'capitalShip:updated', formatForSocket(updated));
    }

    return {
        success: true,
        newHp,
        hpHealed,
        remainingCost,
    };
}

/**
 * Start repair after cooldown (called by job queue or user action)
 */
export async function startRepair(
    userId: string,
    capitalShipId: string
): Promise<{ capitalShip: any; error?: string }> {
    const capitalShip = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!capitalShip) {
        return { capitalShip: null, error: 'Capital Ship not found' };
    }

    if (capitalShip.ownerId !== userId) {
        return { capitalShip: null, error: 'Not authorized' };
    }

    if (capitalShip.status !== 'damaged') {
        return { capitalShip: null, error: 'Capital Ship is not in damaged state' };
    }

    // Check if cooldown is over
    if (capitalShip.cooldownUntil && new Date() < capitalShip.cooldownUntil) {
        const remaining = Math.ceil((capitalShip.cooldownUntil.getTime() - Date.now()) / (1000 * 60 * 60));
        return { capitalShip: null, error: `Cooldown active. ${remaining} hours remaining.` };
    }

    const config = CAPITAL_SHIP_CONFIG;
    const repairCost = getTotalCost(true);

    const buildProgress: BuildProgress = {
        required: repairCost,
        donated: {},
        phase: 1,
        totalPhases: config.destruction.repairPhases,
        isRepair: true,
    };

    const updated = await prisma.capitalShip.update({
        where: { id: capitalShipId },
        data: {
            status: 'repairing',
            cooldownUntil: null,
            buildProgress: buildProgress as unknown as Prisma.InputJsonValue,
        },
        include: {
            owner: { select: { username: true } },
        },
    });

    console.log(`🔧 Capital Ship ${capitalShipId} repair started`);

    socketService.emitToUser(userId, 'capitalShip:updated', formatForSocket(updated));

    return { capitalShip: updated };
}

/**
 * Update defense layout for a Capital Ship
 */
export async function updateDefenseLayout(
    userId: string,
    capitalShipId: string,
    defenseLayout: {
        left: Record<string, number>;
        front: Record<string, number>;
        right: Record<string, number>;
    }
): Promise<{ success: boolean; error?: string }> {
    const ship = await prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
    });

    if (!ship) {
        return { success: false, error: 'Capital Ship not found' };
    }

    if (ship.ownerId !== userId) {
        return { success: false, error: 'Not authorized' };
    }

    // Get current garrison data
    const currentGarrison = (ship.garrison as unknown as GarrisonData) || { troops: {}, tools: {} };

    // Calculate total troops assigned to defense
    const totalAssigned = ['left', 'front', 'right'].reduce((sum, sector) => {
        const sectorTroops = defenseLayout[sector as keyof typeof defenseLayout] || {};
        return sum + Object.values(sectorTroops).reduce((s, c) => s + c, 0);
    }, 0);

    // Calculate total troops available in garrison
    const totalTroops = Object.values(currentGarrison.troops || {}).reduce((s: number, c: any) => s + c, 0);

    if (totalAssigned > totalTroops) {
        return { success: false, error: `Cannot assign ${totalAssigned} troops - only ${totalTroops} available in garrison` };
    }

    // Update garrison with new defense layout
    const updatedGarrison = {
        ...currentGarrison,
        defenseLayout,
    };

    await prisma.capitalShip.update({
        where: { id: capitalShipId },
        data: { garrison: updatedGarrison as any },
    });

    console.log(`✅ Defense layout saved for Capital Ship ${capitalShipId}`);
    return { success: true };
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Check if user can build a new Capital Ship
 */
export async function canBuildCapitalShip(userId: string): Promise<{ allowed: boolean; reason?: string; slots: number; used: number }> {
    const config = CAPITAL_SHIP_CONFIG;

    // Check for Capital Shipyard building
    const shipyards = await prisma.building.findMany({
        where: {
            type: config.building.type,
            status: 'active',
            planet: { ownerId: userId },
        },
        orderBy: { level: 'desc' },
    });

    if (shipyards.length === 0) {
        return {
            allowed: false,
            reason: 'Requires Capital Shipyard building',
            slots: 0,
            used: 0
        };
    }

    // Calculate total slots from all shipyards
    const totalSlots = shipyards.reduce((sum, s) => {
        return sum + (s.level * config.building.slotsPerLevel);
    }, 0);

    // Count existing Capital Ships (not destroyed beyond repair)
    const existingShips = await prisma.capitalShip.count({
        where: {
            ownerId: userId,
        },
    });

    if (existingShips >= totalSlots) {
        return {
            allowed: false,
            reason: `All Capital Ship slots in use (${existingShips}/${totalSlots}). Upgrade Capital Shipyard for more slots.`,
            slots: totalSlots,
            used: existingShips,
        };
    }

    return { allowed: true, slots: totalSlots, used: existingShips };
}

/**
 * Get all Capital Ships for a user
 * Also checks for and processes any stuck arrivals (fallback for job queue issues)
 */
export async function getUserCapitalShips(userId: string): Promise<any[]> {
    // First, check for any stuck ships (traveling/returning with past arrivalTime)
    const stuckShips = await prisma.capitalShip.findMany({
        where: {
            ownerId: userId,
            status: { in: ['traveling', 'returning'] },
            arrivalTime: { lte: new Date() },
        },
    });

    // Process stuck arrivals as fallback
    for (const ship of stuckShips) {
        console.log(`🔧 Processing stuck capital ship arrival: ${ship.id} (status: ${ship.status})`);
        try {
            if (ship.status === 'traveling') {
                await completeArrival(ship.id);
            } else if (ship.status === 'returning') {
                await completeReturn(ship.id);
            }
        } catch (err) {
            console.error(`Failed to process stuck ship ${ship.id}:`, err);
        }
    }

    // Now fetch the updated ships
    return prisma.capitalShip.findMany({
        where: { ownerId: userId },
        include: {
            owner: { select: { username: true } },
            fromPlanet: { select: { name: true, x: true, y: true } },
        },
        orderBy: { createdAt: 'asc' },
    });
}

/**
 * Get a user's deployed Capital Ship (for travel time calculations)
 */
export async function getDeployedCapitalShip(userId: string): Promise<any | null> {
    return prisma.capitalShip.findFirst({
        where: {
            ownerId: userId,
            status: 'deployed',
        },
    });
}

/**
 * Get all deployed Capital Ships (for map display)
 * Also checks and completes any arrivals/returns that have passed their time
 */
export async function getAllDeployedCapitalShips(): Promise<any[]> {
    const ships = await prisma.capitalShip.findMany({
        where: {
            status: { in: ['deployed', 'traveling', 'returning'] },
        },
        include: {
            owner: { select: { username: true, coalitionId: true } },
            fromPlanet: { select: { name: true, x: true, y: true } },
        },
    });

    const now = new Date();
    const updatedShips: any[] = [];

    for (const ship of ships) {
        // Check if traveling ship has arrived
        if (ship.status === 'traveling' && ship.arrivalTime && ship.arrivalTime <= now) {
            console.log(`[Sync] Capital ship ${ship.id} arrival time passed, completing...`);
            try {
                await completeArrival(ship.id);
                // Re-fetch the updated ship
                const updated = await prisma.capitalShip.findUnique({
                    where: { id: ship.id },
                    include: {
                        owner: { select: { username: true, coalitionId: true } },
                        fromPlanet: { select: { name: true, x: true, y: true } },
                    },
                });
                if (updated) updatedShips.push(updated);
                continue;
            } catch (err) {
                console.error(`[Sync] Failed to complete arrival for ${ship.id}:`, err);
            }
        }

        // Check if returning ship has arrived home
        if (ship.status === 'returning' && ship.arrivalTime && ship.arrivalTime <= now) {
            console.log(`[Sync] Capital ship ${ship.id} return time passed, completing...`);
            try {
                await completeReturn(ship.id);
                // Ship is now 'ready', not visible on map - don't add to list
                continue;
            } catch (err) {
                console.error(`[Sync] Failed to complete return for ${ship.id}:`, err);
            }
        }

        updatedShips.push(ship);
    }

    return updatedShips;
}

/**
 * Get a Capital Ship by ID
 */
export async function getCapitalShip(capitalShipId: string): Promise<any | null> {
    return prisma.capitalShip.findUnique({
        where: { id: capitalShipId },
        include: {
            owner: { select: { username: true, coalitionId: true } },
            fromPlanet: { select: { name: true, x: true, y: true } },
        },
    });
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format Capital Ship for socket emission
 */
export function formatForSocket(ship: any): CapitalShipForSocket {
    return {
        id: ship.id,
        ownerId: ship.ownerId,
        ownerName: ship.owner?.username,
        x: ship.x,
        y: ship.y,
        status: ship.status,
        commitmentDays: ship.commitmentDays,
        currentHp: ship.currentHp,
        maxHp: ship.maxHp,
        arrivalTime: ship.arrivalTime?.toISOString() || null,
        deployedUntil: ship.deployedUntil?.toISOString() || null,
        cooldownUntil: ship.cooldownUntil?.toISOString() || null,
        buildProgress: ship.buildProgress as BuildProgress | null,
        // Map visualization data
        fromPlanetId: ship.fromPlanetId || null,
        fromPlanet: ship.fromPlanet ? {
            x: ship.fromPlanet.x,
            y: ship.fromPlanet.y,
            name: ship.fromPlanet.name,
        } : null,
        targetX: ship.targetX || null,
        targetY: ship.targetY || null,
        travelStartedAt: ship.travelStartedAt?.toISOString() || null,
        garrison: ship.garrison || null,
    };
}

/**
 * Calculate modified travel time for fleets launching near a Capital Ship
 */
export async function getModifiedTravelTime(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    userId: string,
    baseTravelTime: number
): Promise<number> {
    const config = CAPITAL_SHIP_CONFIG;

    // Check for deployed Capital Ship
    const capitalShip = await getDeployedCapitalShip(userId);
    if (!capitalShip || capitalShip.x === null || capitalShip.y === null) {
        return baseTravelTime;
    }

    // Check if launching from near the Capital Ship
    const distFromCapitalShip = calculateDistance(fromX, fromY, capitalShip.x, capitalShip.y);
    if (distFromCapitalShip > config.deployment.effectRadius) {
        return baseTravelTime;
    }

    // Apply reduction
    const reduction = config.deployment.travelTimeReduction;
    return Math.ceil(baseTravelTime * (1 - reduction));
}

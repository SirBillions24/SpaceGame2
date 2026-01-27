/**
 * Radar Service
 * 
 * Handles threat detection calculations and intel fidelity based on
 * radar array level and fleet distance.
 */

import prisma from '../lib/prisma';
import {
    RADAR_DETECTION_DISTANCE,
    MAX_RADAR_DETECTION_DISTANCE,
    INTEL_FIDELITY_CONFIG,
    RADAR_FIDELITY_BONUS_PER_LEVEL,
    BASE_FLEET_SPEED,
} from '../constants/mechanics';

export interface ThreatIntel {
    fleetId: string;
    attackerName: string;
    attackerId: string;
    targetPlanetId: string;
    targetPlanetName: string;
    arrivalTime: Date;
    etaSeconds: number;
    distanceRemaining: number;
    fidelityLevel: string;
    estimatedUnits: number | null;  // null if unknown
    unitComposition: Record<string, number> | null;  // null if not visible
    isIncomingAttack: true;
    // Fleet data for map rendering
    fromPlanet: { id?: string; x: number; y: number; name?: string };
    toPlanet: { id: string; x: number; y: number; name: string };
    departAt: Date;
    type: 'attack';
    status: 'enroute';
}

export interface FleetPosition {
    x: number;
    y: number;
}

/**
 * Get the radar level of a planet based on its buildings.
 * Returns 0 if no radar array is built.
 */
export async function getPlanetRadarLevel(planetId: string): Promise<number> {
    const planet = await prisma.planet.findUnique({
        where: { id: planetId },
        include: {
            buildings: {
                where: { type: 'radar_array', status: 'active' }
            }
        }
    });

    if (!planet?.buildings?.length) return 0;

    // Return the highest level radar array
    return Math.max(...planet.buildings.map((b: { level: number }) => b.level));
}

/**
 * Calculate the detection range for a given radar level.
 */
export function getDetectionRange(radarLevel: number): number {
    const baseRange = RADAR_DETECTION_DISTANCE[radarLevel] ?? RADAR_DETECTION_DISTANCE[0];
    return Math.min(baseRange, MAX_RADAR_DETECTION_DISTANCE);
}

/**
 * Calculate distance between two points.
 */
export function calculateDistance(
    from: { x: number; y: number },
    to: { x: number; y: number }
): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the current position of a fleet based on its travel progress.
 */
export function calculateFleetPosition(
    fromPos: { x: number; y: number },
    toPos: { x: number; y: number },
    departTime: Date,
    arriveTime: Date,
    currentTime: Date = new Date()
): FleetPosition {
    const totalTravelTime = arriveTime.getTime() - departTime.getTime();
    const elapsed = currentTime.getTime() - departTime.getTime();
    const progress = Math.min(1, Math.max(0, elapsed / totalTravelTime));

    return {
        x: fromPos.x + (toPos.x - fromPos.x) * progress,
        y: fromPos.y + (toPos.y - fromPos.y) * progress,
    };
}

/**
 * Calculate when a fleet will enter the detection range of a target planet.
 * Returns null if fleet is already within range or will never be in range.
 */
export function calculateDetectionTime(
    fromPos: { x: number; y: number },
    toPos: { x: number; y: number },
    departTime: Date,
    arriveTime: Date,
    detectionRange: number
): Date | null {
    const totalDistance = calculateDistance(fromPos, toPos);

    // If detection range is greater than total distance, detect immediately
    if (detectionRange >= totalDistance) {
        return departTime;
    }

    // Distance fleet needs to travel before entering detection range
    const distanceToDetection = totalDistance - detectionRange;

    // Calculate time to reach detection range
    const totalTravelTime = arriveTime.getTime() - departTime.getTime();
    const travelFraction = distanceToDetection / totalDistance;
    const timeToDetection = totalTravelTime * travelFraction;

    return new Date(departTime.getTime() + timeToDetection);
}

/**
 * Get the intel fidelity phase based on distance and radar level.
 */
export function getIntelFidelityPhase(
    distanceToTarget: number,
    radarLevel: number
): typeof INTEL_FIDELITY_CONFIG.PHASE_1 {
    // Apply radar bonus to thresholds
    const bonus = radarLevel * RADAR_FIDELITY_BONUS_PER_LEVEL;

    const adjustedPhase1 = INTEL_FIDELITY_CONFIG.PHASE_1.distanceThreshold + bonus;
    const adjustedPhase2 = INTEL_FIDELITY_CONFIG.PHASE_2.distanceThreshold + bonus;
    const adjustedPhase3 = INTEL_FIDELITY_CONFIG.PHASE_3.distanceThreshold + bonus;

    if (distanceToTarget > adjustedPhase1) {
        return INTEL_FIDELITY_CONFIG.PHASE_1;
    } else if (distanceToTarget > adjustedPhase2) {
        return INTEL_FIDELITY_CONFIG.PHASE_2;
    } else if (distanceToTarget > adjustedPhase3) {
        return INTEL_FIDELITY_CONFIG.PHASE_3;
    } else {
        return INTEL_FIDELITY_CONFIG.PHASE_4;
    }
}

/**
 * Apply fidelity multiplier and variance to a unit count.
 */
export function applyFidelityToCount(
    actualCount: number,
    fidelityMultiplier: number,
    variancePercent: number
): number {
    if (fidelityMultiplier === 0) return 0; // Unknown
    if (fidelityMultiplier === 1) return actualCount; // Exact

    // Apply fidelity multiplier
    let estimate = actualCount * fidelityMultiplier;

    // Apply random variance if applicable
    if (variancePercent > 0) {
        const variance = (Math.random() * 2 - 1) * (variancePercent / 100) * actualCount;
        estimate += variance;
    }

    return Math.max(1, Math.round(estimate));
}

/**
 * Calculate full threat intel for a fleet approaching a planet.
 */
export async function calculateThreatIntel(
    fleet: {
        id: string;
        ownerId: string;
        unitsJson: string;
        departAt: Date;
        arriveAt: Date;
        fromPlanet: { x: number; y: number };
        toPlanet: { id: string; x: number; y: number; name: string };
        owner?: { username: string };
    },
    radarLevel: number,
    currentTime: Date = new Date()
): Promise<ThreatIntel> {
    // Calculate current fleet position
    const fleetPos = calculateFleetPosition(
        fleet.fromPlanet,
        fleet.toPlanet,
        fleet.departAt,
        fleet.arriveAt,
        currentTime
    );

    // Distance remaining to target
    const distanceRemaining = calculateDistance(fleetPos, fleet.toPlanet);

    // Get fidelity phase
    const fidelityPhase = getIntelFidelityPhase(distanceRemaining, radarLevel);

    // Parse units
    const actualUnits: Record<string, number> = JSON.parse(fleet.unitsJson || '{}');
    const totalActualUnits = Object.values(actualUnits).reduce((a, b) => a + b, 0);

    // Calculate estimated units based on fidelity
    const estimatedUnits = applyFidelityToCount(
        totalActualUnits,
        fidelityPhase.fidelityMultiplier,
        fidelityPhase.variancePercent
    );

    // Unit composition only visible at RECON or higher (75%+ fidelity)
    let unitComposition: Record<string, number> | null = null;
    if (fidelityPhase.fidelityMultiplier >= 0.75) {
        unitComposition = {};
        for (const [unitType, count] of Object.entries(actualUnits)) {
            unitComposition[unitType] = applyFidelityToCount(
                count,
                fidelityPhase.fidelityMultiplier,
                fidelityPhase.variancePercent
            );
        }
    }

    // Calculate ETA
    const etaSeconds = Math.max(0, Math.ceil((fleet.arriveAt.getTime() - currentTime.getTime()) / 1000));

    return {
        fleetId: fleet.id,
        attackerName: fleet.owner?.username || 'Unknown',
        attackerId: fleet.ownerId,
        targetPlanetId: fleet.toPlanet.id,
        targetPlanetName: fleet.toPlanet.name,
        arrivalTime: fleet.arriveAt,
        etaSeconds,
        distanceRemaining,
        fidelityLevel: fidelityPhase.label,
        estimatedUnits: fidelityPhase.fidelityMultiplier === 0 ? null : estimatedUnits,
        unitComposition,
        isIncomingAttack: true,
        // Fleet data for map rendering
        fromPlanet: fleet.fromPlanet,
        toPlanet: fleet.toPlanet,
        departAt: fleet.departAt,
        type: 'attack' as const,
        status: 'enroute' as const,
    };
}

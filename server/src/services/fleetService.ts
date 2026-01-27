import prisma from '../lib/prisma';
import { BASE_FLEET_SPEED, MIN_TRAVEL_TIME } from '../constants/mechanics';

interface UnitCounts {
  [unitType: string]: number;
}

/**
 * Interface for standardized scalable threat response
 */
export interface IncomingThreat {
  id: string;
  type: 'player_fleet' | 'npc_fleet' | 'alien_invasion' | 'unknown';
  sourceName: string;
  targetPlanetId: string;
  targetPlanetName: string;
  arrivalTime: string; // ISO string
  etaSeconds: number;
  isHostile: boolean;
  unitCount?: number;
}

/**
 * Calculate distance between two points
 */
export function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Calculate travel time in seconds based on distance
 */
export function calculateTravelTime(distance: number): number {
  const timeInSeconds = distance / BASE_FLEET_SPEED;
  return Math.max(MIN_TRAVEL_TIME, Math.ceil(timeInSeconds));
}

/**
 * Validate that a user owns a planet
 */
export async function validatePlanetOwnership(userId: string, planetId: string): Promise<boolean> {
  const planet = await prisma.planet.findUnique({
    where: { id: planetId },
  });
  return planet?.ownerId === userId;
}

/**
 * Validate that units exist at a planet
 */
export async function validateUnitsAvailable(
  planetId: string,
  requestedUnits: UnitCounts
): Promise<boolean> {
  const planetUnits = await prisma.planetUnit.findMany({
    where: { planetId },
  });

  const unitMap = new Map<string, number>();
  planetUnits.forEach((unit) => {
    unitMap.set(unit.unitType, unit.count);
  });

  // Check if all requested units are available
  for (const [unitType, requestedCount] of Object.entries(requestedUnits)) {
    const available = unitMap.get(unitType) || 0;
    if (requestedCount > available) {
      return false;
    }
  }

  return true;
}

/**
 * Deduct units from a planet
 */
export async function deductUnits(planetId: string, units: UnitCounts): Promise<void> {
  for (const [unitType, count] of Object.entries(units)) {
    await prisma.planetUnit.updateMany({
      where: {
        planetId,
        unitType,
      },
      data: {
        count: {
          decrement: count,
        },
      },
    });
  }
}

/**
 * Validate that tools exist at a planet
 */
export async function validateToolsAvailable(
  planetId: string,
  requestedTools: { [toolType: string]: number }
): Promise<boolean> {
  const planetTools = await prisma.toolInventory.findMany({
    where: { planetId },
  });

  const toolMap = new Map<string, number>();
  planetTools.forEach((t) => {
    toolMap.set(t.toolType, t.count);
  });

  for (const [toolType, requestedCount] of Object.entries(requestedTools)) {
    const available = toolMap.get(toolType) || 0;
    if (requestedCount > available) {
      return false;
    }
  }

  return true;
}

/**
 * Deduct tools from a planet
 */
export async function deductTools(planetId: string, tools: { [toolType: string]: number }): Promise<void> {
  for (const [toolType, count] of Object.entries(tools)) {
    await prisma.toolInventory.updateMany({
      where: {
        planetId,
        toolType,
      },
      data: {
        count: {
          decrement: count,
        },
      },
    });
  }
}

/**
 * Get all incoming threats for a user
 */
export async function getIncomingThreats(userId: string): Promise<IncomingThreat[]> {
  const now = new Date();

  // Find fleets where target planet is owned by user AND fleet is hostile
  // We exclude user's own fleets (e.g. transfers, returning)
  const hostileFleets = await prisma.fleet.findMany({
    where: {
      toPlanet: { ownerId: userId },
      type: 'attack',
      status: 'enroute', // Only active threats
      ownerId: { not: userId } // Ensure it's not self-attack (friendly fire mechanic?) or bug
    },
    include: {
      toPlanet: { select: { id: true, name: true } },
      owner: { select: { username: true } }
    },
    orderBy: { arriveAt: 'asc' }
  });

  return hostileFleets
    .filter(f => f.toPlanetId && f.toPlanet) // Filter out capital ship attacks
    .map(f => {
      const arrivalTime = f.arriveAt.getTime();
      const etaSeconds = Math.max(0, Math.ceil((arrivalTime - now.getTime()) / 1000));

      // Calculate simple unit count for fog of war (maybe refine later)
      let unitCount = 0;
      try {
        const units = JSON.parse(f.unitsJson);
        unitCount = Object.values(units).reduce((a: any, b: any) => a + b, 0) as number;
      } catch { }

      return {
        id: f.id,
        type: 'player_fleet' as const,
        sourceName: f.owner.username,
        targetPlanetId: f.toPlanetId!,
        targetPlanetName: f.toPlanet!.name,
        arrivalTime: f.arriveAt.toISOString(),
        etaSeconds,
        isHostile: true,
        unitCount
      };
    });
}

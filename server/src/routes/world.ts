import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { syncPlanetResources, calculatePlanetRates } from '../services/planetService';
import { optionalAuthenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all planets with their positions and owners
router.get('/planets', optionalAuthenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const planets = await prisma.planet.findMany({
      include: {
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
        buildings: true, // Include buildings to check for Intel Hub
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const result = planets.map((planet) => {
      const isOwner = req.userId === planet.ownerId;
      return {
        id: planet.id,
        x: planet.x,
        y: planet.y,
        name: planet.name,
        ownerId: planet.ownerId,
        ownerName: planet.owner.username,
        taxRate: planet.taxRate,
        isNpc: planet.isNpc,
        npcLevel: planet.npcLevel,
        createdAt: planet.createdAt,
        buildings: isOwner ? planet.buildings.map(b => ({ type: b.type, status: b.status })) : [],
      };
    });

    res.json({
      planets: result, // Formerly castles
      count: result.length,
    });
  } catch (error) {
    console.error('Error fetching planets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get planet details including units (requires auth for owned planets)
router.get('/planet/:id', optionalAuthenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const requesterId = req.userId;

    // Trigger lazy resource update
    const syncedPlanet = await syncPlanetResources(id);

    if (!syncedPlanet) {
      return res.status(404).json({ error: 'Planet not found' });
    }

    const isOwner = requesterId === syncedPlanet.ownerId;

    const owner = await prisma.user.findUnique({
      where: { id: syncedPlanet.ownerId },
      select: { username: true },
    });

    const units = syncedPlanet.units.reduce((acc: Record<string, number>, unit: any) => {
      acc[unit.unitType] = unit.count;
      return acc;
    }, {} as Record<string, number>);

    const planetStats = calculatePlanetRates(syncedPlanet);

    // Prepare response, masking sensitive info for non-owners
    const responseData: any = {
      id: syncedPlanet.id,
      x: syncedPlanet.x,
      y: syncedPlanet.y,
      name: syncedPlanet.name,
      ownerId: syncedPlanet.ownerId,
      ownerName: owner?.username || 'Unknown',
      taxRate: syncedPlanet.taxRate,
      isNpc: syncedPlanet.isNpc,
      createdAt: syncedPlanet.createdAt,
      defense: {
        canopy: syncedPlanet.energyCanopyLevel,
        minefield: syncedPlanet.orbitalMinefieldLevel,
        hub: syncedPlanet.dockingHubLevel,
      },
    };

    const buildingsForResponse = (syncedPlanet as any).buildings || [];
    const buildingsMapped = buildingsForResponse.map((b: any) => ({
      id: b.id,
      type: b.type,
      x: b.x,
      y: b.y,
      level: b.level,
      status: b.status,
    }));

    if (isOwner) {
      responseData.units = units;
      responseData.resources = {
        carbon: syncedPlanet.carbon,
        titanium: syncedPlanet.titanium,
        food: syncedPlanet.food,
        credits: syncedPlanet.credits,
      };
      responseData.production = {
        carbon: planetStats.carbonRate,
        titanium: planetStats.titaniumRate,
        food: planetStats.foodRate
      };
      responseData.buildings = buildingsMapped;
      responseData.gridSizeX = (syncedPlanet as any).gridSizeX || (syncedPlanet as any).gridSize || 10;
      responseData.gridSizeY = (syncedPlanet as any).gridSizeY || (syncedPlanet as any).gridSize || 10;
      responseData.construction = {
        isBuilding: syncedPlanet.isBuilding,
        activeBuildId: syncedPlanet.activeBuildId,
        buildFinishTime: syncedPlanet.buildFinishTime,
      };
      responseData.recruitmentQueue = Array.isArray(syncedPlanet.recruitmentQueue) ? syncedPlanet.recruitmentQueue : (syncedPlanet.recruitmentQueue ? JSON.parse(syncedPlanet.recruitmentQueue as any) : []);
      responseData.manufacturingQueue = Array.isArray(syncedPlanet.manufacturingQueue) ? syncedPlanet.manufacturingQueue : (syncedPlanet.manufacturingQueue ? JSON.parse(syncedPlanet.manufacturingQueue as any) : []);
      responseData.turretConstructionQueue = Array.isArray((syncedPlanet as any).turretConstructionQueue) ? (syncedPlanet as any).turretConstructionQueue : ((syncedPlanet as any).turretConstructionQueue ? JSON.parse((syncedPlanet as any).turretConstructionQueue) : []);
      responseData.defenseTurretsJson = (syncedPlanet as any).defenseTurretsJson;
      responseData.tools = (syncedPlanet as any).tools || [];
      responseData.stats = planetStats;
    } else {
      // Non-owners can't see units or resources (until espionage is implemented)
      responseData.units = {};
      responseData.resources = { carbon: 0, titanium: 0, food: 0, credits: 0 };
      responseData.production = { carbon: 0, titanium: 0, food: 0 };
      responseData.buildings = buildingsMapped;
      responseData.gridSizeX = (syncedPlanet as any).gridSizeX || (syncedPlanet as any).gridSize || 10;
      responseData.gridSizeY = (syncedPlanet as any).gridSizeY || (syncedPlanet as any).gridSize || 10;
      responseData.stats = { ...planetStats, carbonRate: 0, titaniumRate: 0, foodRate: 0, netFoodRate: 0, population: 0, creditRate: 0 };
    }

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching planet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;


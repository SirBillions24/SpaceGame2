import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { syncPlanetResources, calculatePlanetRates } from '../services/planetService';

const router = Router();

// Get all planets with their positions and owners
router.get('/planets', async (req: Request, res: Response) => {
  try {
    const planets = await prisma.planet.findMany({
      include: {
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const result = planets.map((planet) => ({
      id: planet.id,
      x: planet.x,
      y: planet.y,
      name: planet.name,
      ownerId: planet.ownerId,
      ownerName: planet.owner.username,
      isNpc: planet.isNpc,
      npcLevel: planet.npcLevel,
      createdAt: planet.createdAt,
    }));

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
router.get('/planet/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Trigger lazy resource update (this returns the planet with updated resources)
    const syncedPlanet = await syncPlanetResources(id);

    if (!syncedPlanet) {
      return res.status(404).json({ error: 'Planet not found' });
    }

    // We need the owner name, which syncPlanetResources doesn't fetch by default.
    // So we fetch the owner details separately or we could have updated syncPlanetResources.
    // Ideally we'd optimize this but a second quick query is fine for now.
    const owner = await prisma.user.findUnique({
      where: { id: syncedPlanet.ownerId },
      select: { username: true },
    });

    const units = syncedPlanet.units.reduce((acc: Record<string, number>, unit: any) => {
      acc[unit.unitType] = unit.count;
      return acc;
    }, {} as Record<string, number>);

    const planetStats = calculatePlanetRates(syncedPlanet);

    res.json({
      id: syncedPlanet.id,
      x: syncedPlanet.x,
      y: syncedPlanet.y,
      name: syncedPlanet.name,
      ownerId: syncedPlanet.ownerId,
      ownerName: owner?.username || 'Unknown',
      units,
      resources: {
        carbon: syncedPlanet.carbon,
        titanium: syncedPlanet.titanium,
        food: syncedPlanet.food,
        credits: syncedPlanet.credits,
      },
      production: {
        carbon: planetStats.carbonRate,
        titanium: planetStats.titaniumRate,
        food: planetStats.foodRate
      },
      buildings: (syncedPlanet as any).buildings || [],
      gridSize: (syncedPlanet as any).gridSizeX || (syncedPlanet as any).gridSize || 10,
      gridSizeX: (syncedPlanet as any).gridSizeX || (syncedPlanet as any).gridSize || 10,
      gridSizeY: (syncedPlanet as any).gridSizeY || (syncedPlanet as any).gridSize || 10,
      construction: {
        isBuilding: syncedPlanet.isBuilding,
        activeBuildId: syncedPlanet.activeBuildId,
        buildFinishTime: syncedPlanet.buildFinishTime,
      },
      defense: {
        defensiveGrid: syncedPlanet.defensiveGridLevel,
        perimeterField: syncedPlanet.perimeterFieldLevel,
        starport: syncedPlanet.starportLevel,
      },
      recruitmentQueue: syncedPlanet.recruitmentQueue ? JSON.parse(syncedPlanet.recruitmentQueue as any) : [],
      manufacturingQueue: syncedPlanet.manufacturingQueue ? JSON.parse(syncedPlanet.manufacturingQueue as any) : [],
      turretConstructionQueue: (syncedPlanet as any).turretConstructionQueue ? JSON.parse((syncedPlanet as any).turretConstructionQueue) : [],
      defenseTurretsJson: (syncedPlanet as any).defenseTurretsJson,
      tools: (syncedPlanet as any).tools || [],
      createdAt: syncedPlanet.createdAt,
      stats: planetStats
    });
  } catch (error) {
    console.error('Error fetching planet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;


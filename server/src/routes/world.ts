import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { syncPlanetResources, calculatePlanetRates } from '../services/planetService';
import { optionalAuthenticateToken, AuthRequest, authenticateToken } from '../middleware/auth';
import { UNIT_DATA } from '../constants/unitData';
import { TOOL_DATA } from '../constants/toolData';
import { BUILDING_DATA } from '../constants/buildingData';
import { getBlackHoles } from '../services/harvesterService';

const router = Router();

// Get all unit types and their stats (for UI rendering)
router.get('/unit-types', (req, res: Response) => {
  res.json({ units: UNIT_DATA });
});

// Get all tool types and their stats (for module assignment)
router.get('/tool-types', (req, res: Response) => {
  res.json({ tools: TOOL_DATA });
});

// Get all building types and their stats (for construction UI)
router.get('/building-types', (req, res: Response) => {
  // Buildings limited to 1 per planet
  const limitedBuildings = [
    'storage_depot', 'naval_academy', 'orbital_garrison', 'tavern',
    'defense_workshop', 'siege_workshop', 'orbital_minefield', 'docking_hub'
  ];

  res.json({
    buildings: BUILDING_DATA,
    limitedBuildings
  });
});

// Get all planets with their positions and owners
router.get('/planets', optionalAuthenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const planets = await prisma.planet.findMany({
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            coalitionId: true,
            coalition: {
              select: {
                tag: true
              }
            }
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
        coalitionId: planet.owner.coalitionId,
        coalitionTag: planet.owner.coalition?.tag,
        taxRate: planet.taxRate,
        isNpc: planet.isNpc,
        npcLevel: planet.npcLevel,
        npcClass: planet.npcClass,
        planetType: (planet as any).planetType || 'colony',
        attackCount: planet.attackCount,
        maxAttacks: planet.maxAttacks,
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
      select: { 
        username: true,
        coalitionId: true,
        coalition: {
          select: {
            name: true,
            tag: true
          }
        }
      },
    });

    const units = syncedPlanet.units.reduce((acc: Record<string, number>, unit: any) => {
      acc[unit.unitType] = unit.count;
      return acc;
    }, {} as Record<string, number>);

    const planetStats = calculatePlanetRates(syncedPlanet);

    // Prepare response, masking sensitive info for non-owners
    // Defense visibility: owners see exact values, others see threat tier
    const totalDefenseLevel = syncedPlanet.energyCanopyLevel + syncedPlanet.orbitalMinefieldLevel + syncedPlanet.dockingHubLevel;
    const getDefenseTier = (level: number): string => {
      if (level === 0) return 'Undefended';
      if (level <= 3) return 'Minimal';
      if (level <= 6) return 'Light';
      if (level <= 10) return 'Moderate';
      if (level <= 15) return 'Heavy';
      return 'Fortified';
    };

    const responseData: any = {
      id: syncedPlanet.id,
      x: syncedPlanet.x,
      y: syncedPlanet.y,
      name: syncedPlanet.name,
      ownerId: syncedPlanet.ownerId,
      ownerName: owner?.username || 'Unknown',
      coalitionId: owner?.coalitionId,
      coalitionName: owner?.coalition?.name,
      coalitionTag: owner?.coalition?.tag,
      taxRate: syncedPlanet.taxRate,
      isNpc: syncedPlanet.isNpc,
      npcLevel: syncedPlanet.npcLevel,
      npcClass: syncedPlanet.npcClass,
      attackCount: syncedPlanet.attackCount,
      maxAttacks: syncedPlanet.maxAttacks,
      createdAt: syncedPlanet.createdAt,
      // Defense data: exact for owners, tier assessment for others
      defense: isOwner ? {
        canopy: syncedPlanet.energyCanopyLevel,
        minefield: syncedPlanet.orbitalMinefieldLevel,
        hub: syncedPlanet.dockingHubLevel,
      } : {
        threatTier: getDefenseTier(totalDefenseLevel),
        hint: 'Launch a probe for detailed intel'
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
      stats: b.stats,
      nextUpgrade: b.nextUpgrade,
    }));

    if (isOwner) {
      // Fetch global user resources
      const user = await prisma.user.findUnique({
        where: { id: syncedPlanet.ownerId },
        select: { darkMatter: true, credits: true }
      });

      // Calculate cumulative dark matter rate from ALL owned planets
      const allOwnedPlanets = await prisma.planet.findMany({
        where: { ownerId: syncedPlanet.ownerId, isNpc: false },
        include: { buildings: true }
      });
      let totalDarkMatterRate = 0;
      let totalCreditRate = 0;
      for (const p of allOwnedPlanets) {
        const pStats = calculatePlanetRates(p);
        totalDarkMatterRate += pStats.darkMatterRate || 0;
        totalCreditRate += pStats.creditRate || 0;
      }

      responseData.units = units;
      responseData.resources = {
        carbon: syncedPlanet.carbon,
        titanium: syncedPlanet.titanium,
        food: syncedPlanet.food,
        credits: user?.credits || 0,
        darkMatter: user?.darkMatter || 0,
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
      // Override stats with global rates
      responseData.stats = {
        ...planetStats,
        creditRate: totalCreditRate,
        darkMatterRate: totalDarkMatterRate
      };
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

// Get all planets owned by the current user
router.get('/my-planets', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const planets = await prisma.planet.findMany({
      where: {
        ownerId: req.userId,
        isNpc: false
      },
      include: { buildings: true },
      orderBy: { createdAt: 'asc' }
    });

    const result = planets.map(planet => ({
      id: planet.id,
      x: planet.x,
      y: planet.y,
      name: planet.name,
      planetType: (planet as any).planetType || 'colony',
      gridSizeX: (planet as any).gridSizeX || 10,
      gridSizeY: (planet as any).gridSizeY || 10,
      createdAt: planet.createdAt,
    }));

    res.json({ planets: result });
  } catch (error) {
    console.error('Error fetching my planets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all black holes (for map rendering and Harvester spawning)
router.get('/black-holes', async (req, res: Response) => {
  try {
    const blackHoles = await getBlackHoles();
    res.json({ blackHoles });
  } catch (error) {
    console.error('Error fetching black holes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

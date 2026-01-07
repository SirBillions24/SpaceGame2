import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  calculateDistance,
  calculateTravelTime,
  validatePlanetOwnership,
  validateUnitsAvailable,
  deductUnits,
} from '../services/fleetService';
import { placeBuilding, recruitUnit, spawnPlanet, moveBuilding, syncPlanetResources, demolishBuilding } from '../services/planetService';
import { MAX_GRID_SIZE, EXPANSION_BASE_COST_CARBON, EXPANSION_BASE_COST_TITANIUM, EXPANSION_COST_MULTIPLIER, DEFENSE_TURRET_BUILD_TIME_SECONDS } from '../constants/mechanics';
import { getDefenseTurrets, calculateDefenseCapacity } from '../services/defenseService';

const router = Router();

interface FleetBody {
  fromPlanetId: string;
  toPlanetId: string;
  type: 'attack' | 'support' | 'scout';
  units: {
    [unitType: string]: number;
  };
  // For attacks: lane assignments (3 lanes)
  laneAssignments?: {
    front?: { [unitType: string]: number };
    left?: { [unitType: string]: number };
    right?: { [unitType: string]: number };
  };
  // Tools/equipment
  tools?: {
    breachPod?: boolean;
    plasmaGrenade?: boolean;
    autoTurret?: boolean;
  };
  // Admiral assignment (optional)
  admiralId?: string;
}

// Create a new fleet movement
router.post('/fleet', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { fromPlanetId, toPlanetId, type, units }: FleetBody = req.body;

    // Validation
    if (!fromPlanetId || !toPlanetId || !type || !units) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (fromPlanetId === toPlanetId) {
      return res.status(400).json({ error: 'Cannot send fleet to the same planet' });
    }

    if (!['attack', 'support', 'scout'].includes(type)) {
      return res.status(400).json({ error: 'Invalid fleet type' });
    }

    // Validate at least one unit
    const totalUnits = Object.values(units).reduce((sum, count) => sum + count, 0);
    if (totalUnits === 0) {
      return res.status(400).json({ error: 'Must send at least one unit' });
    }

    // Validate planet ownership
    const ownsPlanet = await validatePlanetOwnership(userId, fromPlanetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    // Validate admiral assignment (if provided)
    let admiralId: string | null = null;
    if (req.body.admiralId) {
      const admiral = await prisma.admiral.findUnique({
        where: { id: req.body.admiralId },
      });
      if (!admiral || admiral.userId !== userId) {
        return res.status(403).json({ error: 'Invalid admiral or admiral does not belong to you' });
      }
      
      // Prevent sending a stationed admiral on an attack
      if (admiral.stationedPlanetId) {
        return res.status(400).json({ error: 'This admiral is currently stationed for planetary defense and cannot lead a fleet.' });
      }

      admiralId = admiral.id;
    }

    // Validate units are available
    const unitsAvailable = await validateUnitsAvailable(fromPlanetId, units);
    if (!unitsAvailable) {
      return res.status(400).json({ error: 'Insufficient units at planet' });
    }

    // --- TOOL VALIDATION (Attack Only) ---
    const allTools: Record<string, number> = {};
    if (type === 'attack' && req.body.laneAssignments) {
      // Parse lane assignments to tally tools
      const lanes = ['front', 'left', 'right'];
      lanes.forEach(lane => {
        const laneData = (req.body.laneAssignments as any)[lane];
        if (laneData && Array.isArray(laneData)) {
          // Multi-wave array format
          laneData.forEach((wave: any) => {
            if (wave.tools) {
              for (const [t, c] of Object.entries(wave.tools as Record<string, number>)) {
                allTools[t] = (allTools[t] || 0) + c;
              }
            }
          });
        } else if (laneData && laneData.tools) {
          // Single Wave Object format (if used)
          for (const [t, c] of Object.entries(laneData.tools as Record<string, number>)) {
            allTools[t] = (allTools[t] || 0) + c;
          }
        }
      });
    }

    // Check availability
    if (Object.keys(allTools).length > 0) {
      // Import helper inside or ensure it's top-level. 
      // Assuming top-level import exists.
      const toolsAvailable = await import('../services/fleetService').then(m => m.validateToolsAvailable(fromPlanetId, allTools));
      if (!toolsAvailable) {
        return res.status(400).json({ error: 'Insufficient tools at planet' });
      }
    }

    // Get planet positions
    const fromPlanet = await prisma.planet.findUnique({
      where: { id: fromPlanetId },
    });
    const toPlanet = await prisma.planet.findUnique({
      where: { id: toPlanetId },
    });

    if (!fromPlanet || !toPlanet) {
      return res.status(404).json({ error: 'Planet not found' });
    }

    // Calculate distance and travel time
    const distance = calculateDistance(fromPlanet.x, fromPlanet.y, toPlanet.x, toPlanet.y);
    const travelTimeSeconds = calculateTravelTime(distance);
    const departAt = new Date();
    const arriveAt = new Date(departAt.getTime() + travelTimeSeconds * 1000);

    // Deduct units from origin planet
    await deductUnits(fromPlanetId, units);

    // Deduct tools from origin planet
    if (Object.keys(allTools).length > 0) {
      await import('../services/fleetService').then(m => m.deductTools(fromPlanetId, allTools));
    }

    // Create fleet
    const fleet = await prisma.fleet.create({
      data: {
        ownerId: userId,
        fromPlanetId,
        toPlanetId,
        type,
        unitsJson: JSON.stringify(units),
        laneAssignmentsJson: type === 'attack' && req.body.laneAssignments
          ? JSON.stringify(req.body.laneAssignments)
          : null,
        toolsJson: Object.keys(allTools).length > 0 ? JSON.stringify(allTools) : null,
        admiralId: admiralId,
        departAt,
        arriveAt,
        status: 'enroute',
      },
      include: {
        fromPlanet: {
          select: { id: true, x: true, y: true, name: true },
        },
        toPlanet: {
          select: { id: true, x: true, y: true, name: true },
        },
        admiral: {
          select: { id: true, name: true, attackBonus: true, defenseBonus: true },
        },
      },
    });

    res.status(201).json({
      message: 'Fleet dispatched successfully',
      fleet: {
        id: fleet.id,
        type: fleet.type,
        fromPlanet: fleet.fromPlanet,
        toPlanet: fleet.toPlanet,
        units: JSON.parse(fleet.unitsJson),
        laneAssignments: fleet.laneAssignmentsJson
          ? JSON.parse(fleet.laneAssignmentsJson)
          : null,
        tools: fleet.toolsJson ? JSON.parse(fleet.toolsJson) : null,
        admiral: fleet.admiral,
        departAt: fleet.departAt,
        arriveAt: fleet.arriveAt,
        status: fleet.status,
        distance: Math.round(distance),
        travelTimeSeconds,
      },
    });
  } catch (error) {
    console.error('Fleet creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all fleets for the authenticated user
router.get('/fleets', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const fleets = await prisma.fleet.findMany({
      where: {
        ownerId: userId,
        status: { in: ['enroute', 'returning', 'error'] },
      },
      include: {
        fromPlanet: {
          select: { id: true, x: true, y: true, name: true },
        },
        toPlanet: {
          select: { id: true, x: true, y: true, name: true },
        },
      },
      orderBy: {
        arriveAt: 'asc',
      },
    });

    const result = fleets.map((fleet) => ({
      id: fleet.id,
      type: fleet.type,
      fromPlanet: fleet.fromPlanet,
      toPlanet: fleet.toPlanet,
      units: JSON.parse(fleet.unitsJson),
      departAt: fleet.departAt,
      arriveAt: fleet.arriveAt,
      status: fleet.status,
    }));

    res.json({ fleets: result });
  } catch (error) {
    console.error('Error fetching fleets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Place/Upgrade Building
router.post('/build', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { planetId, buildingType, x, y } = req.body;

    if (!planetId || !buildingType || x === undefined || y === undefined) {
      return res.status(400).json({ error: 'Missing parameters (planetId, buildingType, x, y)' });
    }

    // Check ownership
    const ownsPlanet = await validatePlanetOwnership(userId, planetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    // Call Service
    const result = await placeBuilding(planetId, buildingType, x, y);

    res.json({
      message: 'Construction started',
      building: result
    });

  } catch (err: any) {
    console.error('Build error:', err);
    const msg = err.message || 'Internal Error';
    const status = msg.includes('Insufficient') || msg.includes('occupied') || msg.includes('bounds') ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

// Recruit units
router.post('/recruit', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { planetId, unitType, count } = req.body;

    if (!planetId || !unitType || !count || count <= 0) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    if (!['marine', 'ranger', 'sentinel', 'interceptor'].includes(unitType)) {
      return res.status(400).json({ error: 'Invalid unit type' });
    }

    // Validate ownership
    const ownsPlanet = await validatePlanetOwnership(userId, planetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    try {
      const result = await recruitUnit(planetId, unitType, count);
      res.json({
        message: 'Recruitment started',
        ...result,
      });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('Insufficient')) return res.status(400).json({ error: err.message });
        if (err.message.includes('required')) return res.status(400).json({ error: err.message });
      }
      throw err;
    }

  } catch (error) {
    console.error('Recruit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Spawn a new planet (Regional Selection)
router.post('/spawn', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { quadrant } = req.body;

    // Check if user already has planets
    const existing = await prisma.planet.findFirst({ where: { ownerId: userId } });
    if (existing) {
      return res.status(400).json({ error: 'User already has a planet' });
    }

    // Spawn
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await spawnPlanet(userId, user.username, quadrant); // quadrant can be undefined

    res.json({ message: 'Planet spawned successfully' });

  } catch (error) {
    console.error('Spawn error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manufacture Tools
import { produceTool } from '../services/toolService';

router.post('/manufacture', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { planetId, toolType, count } = req.body;

    if (!planetId || !toolType || !count || count <= 0) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    // Validate ownership
    const ownsPlanet = await validatePlanetOwnership(userId, planetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    try {
      const result = await produceTool(planetId, toolType, count);
      res.json({
        message: 'Production started',
        ...result,
      });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('Insufficient')) return res.status(400).json({ error: err.message });
        if (err.message.includes('required')) return res.status(400).json({ error: err.message });
        if (err.message.includes('Invalid tool')) return res.status(400).json({ error: err.message });
      }
      throw err;
    }

  } catch (error) {
    console.error('Manufacture error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Move a building
router.post('/move', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { planetId, buildingId, x, y } = req.body;

    if (!planetId || !buildingId || x === undefined || y === undefined) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const ownsPlanet = await validatePlanetOwnership(userId, planetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    const result = await moveBuilding(planetId, buildingId, x, y);
    res.json({ message: 'Building moved', building: result });

  } catch (err: any) {
    console.error('Move error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Demolish a building
router.post('/demolish', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { planetId, buildingId } = req.body;

    if (!planetId || !buildingId) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const ownsPlanet = await validatePlanetOwnership(userId, planetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    const result = await demolishBuilding(planetId, buildingId);
    res.json({ message: 'Demolition started', ...result });

  } catch (err: any) {
    console.error('Demolish error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Expand Planet Grid
router.post('/expand', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { planetId, direction } = req.body; // direction: 'x' or 'y'

    if (!planetId || !direction) {
      return res.status(400).json({ error: 'Missing parameters (planetId, direction)' });
    }

    if (!['x', 'y'].includes(direction)) {
      return res.status(400).json({ error: 'Direction must be "x" or "y"' });
    }

    // Validate ownership
    const ownsPlanet = await validatePlanetOwnership(userId, planetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    // Sync resources first
    const planet = await syncPlanetResources(planetId);
    if (!planet) {
      return res.status(404).json({ error: 'Planet not found' });
    }

    const currentX = (planet as any).gridSizeX || 10;
    const currentY = (planet as any).gridSizeY || 10;

    // Check if already at max
    if (direction === 'x' && currentX >= MAX_GRID_SIZE) {
      return res.status(400).json({ error: `Grid X already at maximum (${MAX_GRID_SIZE})` });
    }
    if (direction === 'y' && currentY >= MAX_GRID_SIZE) {
      return res.status(400).json({ error: `Grid Y already at maximum (${MAX_GRID_SIZE})` });
    }

    // Calculate expansion cost (scaling with current size)
    const currentSize = direction === 'x' ? currentX : currentY;
    const expansionNumber = Math.floor((currentSize - 10) / 10); // How many expansions so far
    const costCarbon = Math.floor(EXPANSION_BASE_COST_CARBON * Math.pow(EXPANSION_COST_MULTIPLIER, expansionNumber));
    const costTitanium = Math.floor(EXPANSION_BASE_COST_TITANIUM * Math.pow(EXPANSION_COST_MULTIPLIER, expansionNumber));

    // Check resources
    if (planet.carbon < costCarbon || planet.titanium < costTitanium) {
      return res.status(400).json({
        error: `Insufficient resources. Required: ${costCarbon} Carbon, ${costTitanium} Titanium`,
        required: { carbon: costCarbon, titanium: costTitanium }
      });
    }

    // Calculate new size (increment by 10)
    const newX = direction === 'x' ? Math.min(currentX + 10, MAX_GRID_SIZE) : currentX;
    const newY = direction === 'y' ? Math.min(currentY + 10, MAX_GRID_SIZE) : currentY;

    // Update planet
    const updated = await prisma.planet.update({
      where: { id: planetId },
      data: {
        gridSizeX: newX,
        gridSizeY: newY,
        carbon: { decrement: costCarbon },
        titanium: { decrement: costTitanium }
      }
    });

    res.json({
      message: `Planet expanded to ${newX}x${newY}`,
      gridSizeX: newX,
      gridSizeY: newY,
      cost: { carbon: costCarbon, titanium: costTitanium }
    });

  } catch (err: any) {
    console.error('Expand error:', err);
    res.status(400).json({ error: err.message || 'Internal server error' });
  }
});

// Add/Upgrade Defense Turret
router.post('/defense-turret', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { planetId, level } = req.body;

    if (!planetId || !level) {
      return res.status(400).json({ error: 'Missing parameters (planetId, level)' });
    }

    if (![1, 2, 3, 4].includes(level)) {
      return res.status(400).json({ error: 'Level must be 1, 2, 3, or 4' });
    }

    // Validate ownership
    const ownsPlanet = await validatePlanetOwnership(userId, planetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    const planet = await syncPlanetResources(planetId);
    if (!planet) {
      return res.status(404).json({ error: 'Planet not found' });
    }

    // Get current turrets
    const turrets = getDefenseTurrets((planet as any).defenseTurretsJson);

    // Get construction queue
    let turretQueue: any[] = [];
    if ((planet as any).turretConstructionQueue) {
      try {
        turretQueue = JSON.parse((planet as any).turretConstructionQueue);
      } catch (e) {
        turretQueue = [];
      }
    }

    // Check if can add (max 20, including queued turrets)
    const totalTurrets = turrets.length + turretQueue.length;
    if (totalTurrets >= 20) {
      return res.status(400).json({ error: 'Maximum 20 defense turrets allowed (including those in construction queue)' });
    }

    // Calculate cost (scaling with level and number of turrets)
    const baseCostCarbon = 500 * level;
    const baseCostTitanium = 250 * level;
    const turretCountMultiplier = 1 + (turrets.length * 0.1); // 10% more per existing turret
    const costCarbon = Math.floor(baseCostCarbon * turretCountMultiplier);
    const costTitanium = Math.floor(baseCostTitanium * turretCountMultiplier);

    // Check resources
    if (planet.carbon < costCarbon || planet.titanium < costTitanium) {
      return res.status(400).json({
        error: `Insufficient resources. Required: ${costCarbon} Carbon, ${costTitanium} Titanium`,
        required: { carbon: costCarbon, titanium: costTitanium }
      });
    }

    const now = new Date();
    let startTime = now;
    if (turretQueue.length > 0) {
      const lastItem = turretQueue[turretQueue.length - 1];
      if (lastItem && lastItem.finishTime) {
        const lastFinish = new Date(lastItem.finishTime);
        if (lastFinish > now) {
          startTime = lastFinish;
        }
      }
    }

    const buildTime = DEFENSE_TURRET_BUILD_TIME_SECONDS * 1000; // Convert to milliseconds
    const finishTime = new Date(startTime.getTime() + buildTime);

    const queueItem = {
      level,
      finishTime: finishTime.toISOString()
    };
    turretQueue.push(queueItem);

    // Update planet with queue (don't add turret yet - it will be added when queue processes)
    const updated = await prisma.planet.update({
      where: { id: planetId },
      data: {
        turretConstructionQueue: JSON.stringify(turretQueue),
        carbon: { decrement: costCarbon },
        titanium: { decrement: costTitanium }
      }
    });

    res.json({
      message: `Defense turret (Level ${level}) queued for construction`,
      queue: turretQueue,
      finishTime: finishTime.toISOString(),
      cost: { carbon: costCarbon, titanium: costTitanium }
    });

  } catch (err: any) {
    console.error('Defense turret error:', err);
    res.status(400).json({ error: err.message || 'Internal server error' });
  }
});

// Update Tax Rate
router.post('/tax', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { planetId, taxRate } = req.body;

    if (!planetId || taxRate === undefined) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const rate = parseInt(taxRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ error: 'Invalid tax rate (0-100)' });
    }

    const ownsPlanet = await validatePlanetOwnership(userId, planetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    const planet = await prisma.planet.update({
      where: { id: planetId },
      data: { taxRate: rate }
    });

    res.json({ message: 'Tax rate updated', taxRate: planet.taxRate });

  } catch (err: any) {
    console.error('Tax error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;



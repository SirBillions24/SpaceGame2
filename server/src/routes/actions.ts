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
import { placeBuilding, recruitUnit, spawnPlanet, moveBuilding, syncPlanetResources, demolishBuilding, formatPlanetForSocket } from '../services/planetService';
import { UNIT_DATA } from '../constants/unitData';
import {
  MAX_GRID_SIZE,
  EXPANSION_BASE_COST_CARBON,
  EXPANSION_BASE_COST_TITANIUM,
  EXPANSION_COST_MULTIPLIER,
  DEFENSE_TURRET_BUILD_TIME_SECONDS,
  DEFENSE_TURRET_BASE_COST_CARBON,
  DEFENSE_TURRET_BASE_COST_TITANIUM,
  DEFENSE_TURRET_COUNT_SCALING,
  MAX_DEFENSE_TURRETS,
} from '../constants/mechanics';
import { getDefenseTurrets, calculateDefenseCapacity } from '../services/defenseService';
import { validateRequest } from '../middleware/validateRequest';
import { BuildSchema, RecruitSchema, ManufactureSchema, ExpandSchema, DefenseTurretSchema, TaxRateSchema, MoveBuildingSchema, DemolishSchema } from '../schemas/actionSchemas';
import { socketService } from '../services/socketService';

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
  // Resource transfer (only valid when target is owned by sender)
  resourceTransfer?: {
    carbon?: number;
    titanium?: number;
    food?: number;
  };
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

      // Prevent sending an admiral who is already leading an active fleet
      const activeFleetWithAdmiral = await prisma.fleet.findFirst({
        where: {
          admiralId: req.body.admiralId,
          status: { in: ['enroute', 'returning'] },
        },
      });

      if (activeFleetWithAdmiral) {
        return res.status(400).json({ error: 'This admiral is already leading an active fleet operation.' });
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

    // --- DEFENSE-AWARE UNIT DEDUCTION ---
    // Get current defense layout to determine which units are on defense
    const defenseLayout = await prisma.defenseLayout.findUnique({
      where: { planetId: fromPlanetId },
    });

    // Get all units on the planet
    const planetUnits = await prisma.planetUnit.findMany({ where: { planetId: fromPlanetId } });
    const availablePool: Record<string, number> = {};
    planetUnits.forEach(pu => availablePool[pu.unitType] = pu.count);

    // Parse defense layout to determine units on defense
    const onDefense: Record<string, Record<string, number>> = { front: {}, left: {}, right: {} };
    if (defenseLayout) {
      const parseLane = (json: string, laneName: string) => {
        try {
          const data = JSON.parse(json || '{}');
          const units = data.units || data;
          for (const [unitType, count] of Object.entries(units)) {
            if (typeof count === 'number' && count > 0) {
              onDefense[laneName][unitType] = count;
            }
          }
        } catch (e) { }
      };
      parseLane(defenseLayout.frontLaneJson, 'front');
      parseLane(defenseLayout.leftLaneJson, 'left');
      parseLane(defenseLayout.rightLaneJson, 'right');
    }

    // Calculate total on defense per unit type
    const totalOnDefense: Record<string, number> = {};
    for (const lane of Object.values(onDefense)) {
      for (const [unitType, count] of Object.entries(lane)) {
        totalOnDefense[unitType] = (totalOnDefense[unitType] || 0) + count;
      }
    }

    // For each requested unit type, take from RESERVE first, then from DEFENSE (proportionally)
    const borrowedFromDefense: Record<string, Record<string, number>> = { front: {}, left: {}, right: {} };
    const requestedUnits = { ...units };

    for (const [unitType, requestedCount] of Object.entries(requestedUnits)) {
      const available = availablePool[unitType] || 0;
      const defensiveCount = totalOnDefense[unitType] || 0;
      const reserveCount = Math.max(0, available - defensiveCount);

      let remaining = requestedCount as number;

      // Take from reserve first
      const fromReserve = Math.min(remaining, reserveCount);
      remaining -= fromReserve;

      // If still need more, borrow from defense (proportionally from each lane)
      if (remaining > 0 && defensiveCount > 0) {
        for (const lane of ['front', 'left', 'right']) {
          if (remaining <= 0) break;
          const laneCount = onDefense[lane][unitType] || 0;
          if (laneCount > 0) {
            const ratio = laneCount / defensiveCount;
            const toBorrow = Math.min(Math.ceil(remaining * ratio), laneCount, remaining);
            if (toBorrow > 0) {
              borrowedFromDefense[lane][unitType] = (borrowedFromDefense[lane][unitType] || 0) + toBorrow;
              remaining -= toBorrow;
            }
          }
        }
      }
    }

    // Check if any troops were borrowed from defense
    const hasBorrowedTroops = Object.values(borrowedFromDefense).some(
      lane => Object.keys(lane).length > 0 && Object.values(lane).some(c => c > 0)
    );

    // Update defense layout to remove borrowed troops
    if (defenseLayout && hasBorrowedTroops) {
      const updateData: Record<string, string> = {};

      const updateLane = (laneKey: string, laneName: string) => {
        try {
          const currentLane = JSON.parse((defenseLayout as any)[laneKey] || '{}');
          const hasTools = currentLane.tools !== undefined;
          const units = hasTools ? currentLane.units : currentLane;

          for (const [unitType, borrowed] of Object.entries(borrowedFromDefense[laneName])) {
            if (units[unitType]) {
              units[unitType] = Math.max(0, units[unitType] - (borrowed as number));
              if (units[unitType] === 0) delete units[unitType];
            }
          }

          updateData[laneKey] = JSON.stringify(hasTools ? { units, tools: currentLane.tools } : units);
        } catch (e) { }
      };

      updateLane('frontLaneJson', 'front');
      updateLane('leftLaneJson', 'left');
      updateLane('rightLaneJson', 'right');

      await prisma.defenseLayout.update({
        where: { id: defenseLayout.id },
        data: updateData,
      });
    }

    // Deduct units from origin planet
    await deductUnits(fromPlanetId, units);

    // Deduct tools from origin planet
    if (Object.keys(allTools).length > 0) {
      await import('../services/fleetService').then(m => m.deductTools(fromPlanetId, allTools));
    }

    // --- RESOURCE TRANSFER HANDLING (for transfers to owned planets) ---
    let cargoJson: string | null = null;
    const resourceTransfer = req.body.resourceTransfer;

    if (resourceTransfer && (resourceTransfer.carbon || resourceTransfer.titanium || resourceTransfer.food)) {
      // Verify target planet is owned by sender
      const targetOwnership = await prisma.planet.findUnique({
        where: { id: toPlanetId },
        select: { ownerId: true }
      });

      if (!targetOwnership || targetOwnership.ownerId !== userId) {
        return res.status(400).json({ error: 'Resource transfer is only allowed to your own planets' });
      }

      // Calculate total carry capacity based on unit stats
      let totalCapacity = 0;
      for (const [unitType, count] of Object.entries(units)) {
        const unitStats = UNIT_DATA[unitType];
        if (unitStats) {
          totalCapacity += (unitStats.capacity || 0) * (count as number);
        }
      }

      // Calculate requested transfer
      const requestedCarbon = Math.max(0, resourceTransfer.carbon || 0);
      const requestedTitanium = Math.max(0, resourceTransfer.titanium || 0);
      const requestedFood = Math.max(0, resourceTransfer.food || 0);
      const totalRequested = requestedCarbon + requestedTitanium + requestedFood;

      if (totalRequested > totalCapacity) {
        return res.status(400).json({
          error: `Transfer exceeds carry capacity. Requested: ${totalRequested}, Capacity: ${totalCapacity}`
        });
      }

      // Validate and deduct resources from source planet atomically
      const transferResult = await prisma.$transaction(async (tx) => {
        const sourcePlanet = await tx.planet.findUnique({ where: { id: fromPlanetId } });
        if (!sourcePlanet) throw new Error('Source planet not found');

        // Check availability
        if (sourcePlanet.carbon < requestedCarbon) {
          throw new Error(`Insufficient carbon. Available: ${Math.floor(sourcePlanet.carbon)}, Requested: ${requestedCarbon}`);
        }
        if (sourcePlanet.titanium < requestedTitanium) {
          throw new Error(`Insufficient titanium. Available: ${Math.floor(sourcePlanet.titanium)}, Requested: ${requestedTitanium}`);
        }
        if (sourcePlanet.food < requestedFood) {
          throw new Error(`Insufficient food. Available: ${Math.floor(sourcePlanet.food)}, Requested: ${requestedFood}`);
        }

        // Deduct resources
        await tx.planet.update({
          where: { id: fromPlanetId },
          data: {
            carbon: { decrement: requestedCarbon },
            titanium: { decrement: requestedTitanium },
            food: { decrement: requestedFood },
          }
        });

        return { carbon: requestedCarbon, titanium: requestedTitanium, food: requestedFood };
      });

      cargoJson = JSON.stringify(transferResult);
      console.log(`📦 Resource transfer queued: C:${transferResult.carbon} T:${transferResult.titanium} F:${transferResult.food}`);
    }

    // Create fleet with borrowed defense info and cargo
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
        borrowedFromDefenseJson: hasBorrowedTroops ? JSON.stringify(borrowedFromDefense) : null,
        cargoJson: cargoJson,
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

    // Queue job for processing via BullMQ
    try {
      const { queueFleetArrival } = await import('../lib/jobQueue');
      await queueFleetArrival({
        fleetId: fleet.id,
        toPlanetId: fleet.toPlanetId,
        type: fleet.type as 'attack' | 'support' | 'scout',
      }, arriveAt);
    } catch (queueError) {
      console.error('CRITICAL: Failed to queue fleet arrival job:', queueError);
      // Fleet was created but job not queued - this is a problem
      throw new Error('Failed to schedule fleet processing');
    }

    // Emit socket event for real-time map update
    const fleetData = {
      id: fleet.id,
      type: fleet.type,
      fromPlanet: fleet.fromPlanet,
      toPlanet: fleet.toPlanet,
      units: JSON.parse(fleet.unitsJson),
      departAt: fleet.departAt,
      arriveAt: fleet.arriveAt,
      status: fleet.status,
    };
    socketService.emitToUser(userId, 'fleet:updated', fleetData);

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
      admiralId: fleet.admiralId,
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

    if (!UNIT_DATA[unitType]) {
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

    // Sync resources first (outside transaction for lazy eval)
    await syncPlanetResources(planetId);

    // Use transaction for atomic resource check + deduction
    const result = await prisma.$transaction(async (tx) => {
      const planet = await tx.planet.findUnique({ where: { id: planetId } });
      if (!planet) throw new Error('Planet not found');

      const currentX = (planet as any).gridSizeX || 10;
      const currentY = (planet as any).gridSizeY || 10;

      // Check if already at max
      if (direction === 'x' && currentX >= MAX_GRID_SIZE) {
        throw new Error(`Grid X already at maximum (${MAX_GRID_SIZE})`);
      }
      if (direction === 'y' && currentY >= MAX_GRID_SIZE) {
        throw new Error(`Grid Y already at maximum (${MAX_GRID_SIZE})`);
      }

      // Calculate expansion cost (scaling with current size)
      const currentSize = direction === 'x' ? currentX : currentY;
      const expansionNumber = Math.floor((currentSize - 10) / 10);
      const costCarbon = Math.floor(EXPANSION_BASE_COST_CARBON * Math.pow(EXPANSION_COST_MULTIPLIER, expansionNumber));
      const costTitanium = Math.floor(EXPANSION_BASE_COST_TITANIUM * Math.pow(EXPANSION_COST_MULTIPLIER, expansionNumber));

      // Atomic resource check
      if (planet.carbon < costCarbon || planet.titanium < costTitanium) {
        throw new Error(`Insufficient resources. Required: ${costCarbon} Carbon, ${costTitanium} Titanium`);
      }

      // Calculate new size (increment by 10)
      const newX = direction === 'x' ? Math.min(currentX + 10, MAX_GRID_SIZE) : currentX;
      const newY = direction === 'y' ? Math.min(currentY + 10, MAX_GRID_SIZE) : currentY;

      // Atomic update
      await tx.planet.update({
        where: { id: planetId },
        data: {
          gridSizeX: newX,
          gridSizeY: newY,
          carbon: { decrement: costCarbon },
          titanium: { decrement: costTitanium }
        }
      });

      return { newX, newY, costCarbon, costTitanium };
    });

    res.json({
      message: `Planet expanded to ${result.newX}x${result.newY}`,
      gridSizeX: result.newX,
      gridSizeY: result.newY,
      cost: { carbon: result.costCarbon, titanium: result.costTitanium }
    });

  } catch (err: any) {
    console.error('Expand error:', err);
    const status = err.message?.includes('Insufficient') || err.message?.includes('maximum') ? 400 : 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
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

    // Sync resources first (outside transaction for lazy eval)
    await syncPlanetResources(planetId);

    // Use transaction for atomic resource check + deduction
    const result = await prisma.$transaction(async (tx) => {
      const planet = await tx.planet.findUnique({ where: { id: planetId } });
      if (!planet) throw new Error('Planet not found');

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

      // Check if can add (using MAX_DEFENSE_TURRETS from mechanics.ts)
      const totalTurrets = turrets.length + turretQueue.length;
      if (totalTurrets >= MAX_DEFENSE_TURRETS) {
        throw new Error(`Maximum ${MAX_DEFENSE_TURRETS} defense turrets allowed (including those in construction queue)`);
      }

      // Calculate cost (scaling with level and number of turrets, from mechanics.ts)
      const baseCostCarbon = DEFENSE_TURRET_BASE_COST_CARBON * level;
      const baseCostTitanium = DEFENSE_TURRET_BASE_COST_TITANIUM * level;
      const turretCountMultiplier = 1 + (turrets.length * DEFENSE_TURRET_COUNT_SCALING);
      const costCarbon = Math.floor(baseCostCarbon * turretCountMultiplier);
      const costTitanium = Math.floor(baseCostTitanium * turretCountMultiplier);

      // Atomic resource check
      if (planet.carbon < costCarbon || planet.titanium < costTitanium) {
        throw new Error(`Insufficient resources. Required: ${costCarbon} Carbon, ${costTitanium} Titanium`);
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

      const buildTime = DEFENSE_TURRET_BUILD_TIME_SECONDS * 1000;
      const finishTime = new Date(startTime.getTime() + buildTime);

      const queueItem = {
        level,
        finishTime: finishTime.toISOString()
      };
      turretQueue.push(queueItem);

      // Atomic update
      await tx.planet.update({
        where: { id: planetId },
        data: {
          turretConstructionQueue: JSON.stringify(turretQueue),
          carbon: { decrement: costCarbon },
          titanium: { decrement: costTitanium }
        }
      });

      return { turretQueue, finishTime, costCarbon, costTitanium };
    });

    res.json({
      message: `Defense turret (Level ${level}) queued for construction`,
      queue: result.turretQueue,
      finishTime: result.finishTime.toISOString(),
      cost: { carbon: result.costCarbon, titanium: result.costTitanium }
    });

  } catch (err: any) {
    console.error('Defense turret error:', err);
    const status = err.message?.includes('Insufficient') || err.message?.includes('Maximum') ? 400 : 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
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
      data: { taxRate: rate },
      include: { units: true, buildings: true, tools: true }
    });

    // Emit socket event for real-time updates
    socketService.emitToUser(userId, 'planet:updated', await formatPlanetForSocket(planet));

    res.json({ message: 'Tax rate updated', taxRate: planet.taxRate });

  } catch (err: any) {
    console.error('Tax error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Preview which troops will be borrowed from defense for an attack
// Response: { borrowedFromDefense: { front: { marine: 5 }, left: {}, right: {} }, hasBorrowedTroops: true }
router.post('/fleet/preview-defense-borrowing', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { fromPlanetId, units } = req.body;

    if (!fromPlanetId || !units) {
      return res.status(400).json({ error: 'Missing required fields (fromPlanetId, units)' });
    }

    // Validate ownership
    const ownsPlanet = await validatePlanetOwnership(userId, fromPlanetId);
    if (!ownsPlanet) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    // Get current defense layout
    const defenseLayout = await prisma.defenseLayout.findUnique({
      where: { planetId: fromPlanetId },
    });

    // Get all units on the planet
    const planetUnits = await prisma.planetUnit.findMany({ where: { planetId: fromPlanetId } });
    const availablePool: Record<string, number> = {};
    planetUnits.forEach(pu => availablePool[pu.unitType] = pu.count);

    // Parse defense layout
    const onDefense: Record<string, Record<string, number>> = { front: {}, left: {}, right: {} };
    if (defenseLayout) {
      const parseLane = (json: string, laneName: string) => {
        try {
          const data = JSON.parse(json || '{}');
          const laneUnits = data.units || data;
          for (const [unitType, count] of Object.entries(laneUnits)) {
            if (typeof count === 'number' && count > 0) {
              onDefense[laneName][unitType] = count;
            }
          }
        } catch (e) { }
      };
      parseLane(defenseLayout.frontLaneJson, 'front');
      parseLane(defenseLayout.leftLaneJson, 'left');
      parseLane(defenseLayout.rightLaneJson, 'right');
    }

    // Calculate total on defense per unit type
    const totalOnDefense: Record<string, number> = {};
    for (const lane of Object.values(onDefense)) {
      for (const [unitType, count] of Object.entries(lane)) {
        totalOnDefense[unitType] = (totalOnDefense[unitType] || 0) + count;
      }
    }

    // Calculate borrowing
    const borrowedFromDefense: Record<string, Record<string, number>> = { front: {}, left: {}, right: {} };

    for (const [unitType, requestedCount] of Object.entries(units)) {
      const available = availablePool[unitType] || 0;
      const defensiveCount = totalOnDefense[unitType] || 0;
      const reserveCount = Math.max(0, available - defensiveCount);

      let remaining = requestedCount as number;

      // Take from reserve first
      const fromReserve = Math.min(remaining, reserveCount);
      remaining -= fromReserve;

      // If still need more, borrow from defense proportionally
      if (remaining > 0 && defensiveCount > 0) {
        for (const lane of ['front', 'left', 'right']) {
          if (remaining <= 0) break;
          const laneCount = onDefense[lane][unitType] || 0;
          if (laneCount > 0) {
            const ratio = laneCount / defensiveCount;
            const toBorrow = Math.min(Math.ceil(remaining * ratio), laneCount, remaining);
            if (toBorrow > 0) {
              borrowedFromDefense[lane][unitType] = (borrowedFromDefense[lane][unitType] || 0) + toBorrow;
              remaining -= toBorrow;
            }
          }
        }
      }
    }

    const hasBorrowedTroops = Object.values(borrowedFromDefense).some(
      lane => Object.keys(lane).length > 0 && Object.values(lane).some(c => c > 0)
    );

    res.json({
      borrowedFromDefense,
      hasBorrowedTroops,
      onDefense,
      totalOnDefense
    });

  } catch (error) {
    console.error('Preview defense borrowing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;



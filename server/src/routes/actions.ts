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
import { placeBuilding, recruitUnit, spawnPlanet } from '../services/planetService';

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

    // Validate units are available
    const unitsAvailable = await validateUnitsAvailable(fromPlanetId, units);
    if (!unitsAvailable) {
      return res.status(400).json({ error: 'Insufficient units at planet' });
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
        toolsJson: req.body.tools ? JSON.stringify(req.body.tools) : null,
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

    if (!['marine', 'ranger', 'sentinel'].includes(unitType)) {
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

export default router;



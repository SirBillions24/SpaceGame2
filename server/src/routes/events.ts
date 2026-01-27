/**
 * Event API Routes
 *
 * Handles world event operations:
 * - Get active event with player data
 * - View leaderboards
 * - Admin: Create/manage events
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import prisma from '../lib/prisma';
import {
  getActiveEvent,
  getActiveEventForPlayer,
  getEventById,
  createEvent,
  createTestEvent,
  forceStartEvent,
  deleteEvent,
  listEvents,
} from '../services/events/eventService';
import {
  getEventLeaderboard,
  getCoalitionLeaderboard,
  getMothershipLeaderboard,
  getEventStats,
} from '../services/events/eventScoreService';
import { getVisibleShips, getMothership, getPortalLocation, getEventShip } from '../services/events/eventShipService';
import { getHeatLeaderboard, getPlayerHeat } from '../services/events/eventHeatService';
import { getPlayerRetaliations } from '../services/events/eventRetaliationService';
import { getPlayerScore, getPlayerRank } from '../services/events/eventScoreService';
import { EVENT_TYPES, EventType } from '../constants/eventConfig';
import {
  calculateDistance,
  calculateTravelTime,
  validatePlanetOwnership,
  validateUnitsAvailable,
  deductUnits,
} from '../services/fleetService';
import { queueEventFleetArrival } from '../lib/jobQueue';

const router = Router();

// =============================================================================
// PLAYER ROUTES
// =============================================================================

/**
 * GET /api/events/active
 * Get the currently active event with player-specific data
 */
router.get('/active', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const event = await getActiveEventForPlayer(userId);

    if (!event) {
      return res.json({ event: null, message: 'No active event' });
    }

    res.json({ event });
  } catch (error: any) {
    console.error('Error fetching active event:', error);
    res.status(500).json({ error: 'Failed to fetch active event' });
  }
});

/**
 * GET /api/events/:eventId
 * Get event details by ID
 */
router.get('/:eventId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const event = await getEventById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ event });
  } catch (error: any) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

/**
 * GET /api/events/:eventId/leaderboard
 * Get individual leaderboard for an event
 */
router.get('/:eventId/leaderboard', authenticateToken, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const leaderboard = await getEventLeaderboard(req.params.eventId, limit);

    res.json({ leaderboard });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * GET /api/events/:eventId/leaderboard/coalitions
 * Get coalition leaderboard for an event
 */
router.get(
  '/:eventId/leaderboard/coalitions',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const leaderboard = await getCoalitionLeaderboard(req.params.eventId, limit);

      res.json({ leaderboard });
    } catch (error: any) {
      console.error('Error fetching coalition leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch coalition leaderboard' });
    }
  }
);

/**
 * GET /api/events/:eventId/leaderboard/mothership
 * Get mothership damage leaderboard
 */
router.get(
  '/:eventId/leaderboard/mothership',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const leaderboard = await getMothershipLeaderboard(req.params.eventId, limit);

      res.json({ leaderboard });
    } catch (error: any) {
      console.error('Error fetching mothership leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch mothership leaderboard' });
    }
  }
);

/**
 * GET /api/events/:eventId/leaderboard/heat
 * Get heat leaderboard (who's most likely to be attacked)
 */
router.get(
  '/:eventId/leaderboard/heat',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const leaderboard = await getHeatLeaderboard(req.params.eventId, limit);

      res.json({ leaderboard });
    } catch (error: any) {
      console.error('Error fetching heat leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch heat leaderboard' });
    }
  }
);

/**
 * GET /api/events/:eventId/ships
 * Get all ships visible to the player (their ring + portal zone)
 */
router.get('/:eventId/ships', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const ships = await getVisibleShips(req.params.eventId, userId);

    res.json({ ships });
  } catch (error: any) {
    console.error('Error fetching ships:', error);
    res.status(500).json({ error: 'Failed to fetch ships' });
  }
});

/**
 * GET /api/events/:eventId/mothership
 * Get mothership status
 */
router.get('/:eventId/mothership', authenticateToken, async (req: Request, res: Response) => {
  try {
    const mothership = await getMothership(req.params.eventId);

    if (!mothership) {
      return res.status(404).json({ error: 'Mothership not found' });
    }

    res.json({ mothership });
  } catch (error: any) {
    console.error('Error fetching mothership:', error);
    res.status(500).json({ error: 'Failed to fetch mothership' });
  }
});

/**
 * GET /api/events/:eventId/portal
 * Get portal zone location
 */
router.get('/:eventId/portal', authenticateToken, async (req: Request, res: Response) => {
  try {
    const location = await getPortalLocation(req.params.eventId);

    if (!location) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    res.json({ portal: location });
  } catch (error: any) {
    console.error('Error fetching portal location:', error);
    res.status(500).json({ error: 'Failed to fetch portal location' });
  }
});

/**
 * GET /api/events/:eventId/stats
 * Get event-wide statistics
 */
router.get('/:eventId/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const stats = await getEventStats(req.params.eventId);
    res.json({ stats });
  } catch (error: any) {
    console.error('Error fetching event stats:', error);
    res.status(500).json({ error: 'Failed to fetch event stats' });
  }
});

/**
 * GET /api/events/:eventId/heat
 * Get player's current heat level
 */
router.get('/:eventId/heat', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const heat = await getPlayerHeat(req.params.eventId, userId);
    res.json({ heat });
  } catch (error: any) {
    console.error('Error fetching player heat:', error);
    res.status(500).json({ error: 'Failed to fetch player heat' });
  }
});

/**
 * GET /api/events/:eventId/retaliations
 * Get player's incoming/past retaliations
 */
router.get('/:eventId/retaliations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const retaliations = await getPlayerRetaliations(req.params.eventId, userId);
    res.json({ retaliations });
  } catch (error: any) {
    console.error('Error fetching retaliations:', error);
    res.status(500).json({ error: 'Failed to fetch retaliations' });
  }
});

/**
 * GET /api/events/:eventId/me
 * Get player's own event progress
 */
router.get('/:eventId/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const [score, rank, heat, retaliations] = await Promise.all([
      getPlayerScore(req.params.eventId, userId),
      getPlayerRank(req.params.eventId, userId),
      getPlayerHeat(req.params.eventId, userId),
      getPlayerRetaliations(req.params.eventId, userId),
    ]);

    res.json({
      score,
      rank,
      heat,
      retaliations: retaliations.filter((r) => r.status === 'incoming'),
    });
  } catch (error: any) {
    console.error('Error fetching player progress:', error);
    res.status(500).json({ error: 'Failed to fetch player progress' });
  }
});

// =============================================================================
// COMBAT ROUTES
// =============================================================================

/**
 * POST /api/events/:eventId/ships/:shipId/attack
 * Dispatch a fleet to attack an event ship.
 * Creates a fleet with type 'event_attack' that travels to the ship's coordinates.
 * Combat resolves when the fleet arrives (handled by job queue).
 */
router.post(
  '/:eventId/ships/:shipId/attack',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { fromPlanetId, units, systemAssignments } = req.body;

      // Validate required fields
      if (!fromPlanetId || !units || typeof units !== 'object') {
        return res.status(400).json({ error: 'fromPlanetId and units are required' });
      }

      // Validate systemAssignments (if provided - default to all units attacking reactor)
      const assignments = systemAssignments || {
        shields: {},
        reactor: units, // Default: all units attack core reactor
        weapons: {},
      };

      // Validate at least one unit
      const totalUnits = Object.values(units as Record<string, number>).reduce((sum, count) => sum + count, 0);
      if (totalUnits === 0) {
        return res.status(400).json({ error: 'Must send at least one unit' });
      }

      // Validate event is active
      const event = await prisma.worldEvent.findUnique({ where: { id: req.params.eventId } });
      if (!event || event.status !== 'active') {
        return res.status(400).json({ error: 'Event is not active' });
      }

      // Get target ship
      const ship = await getEventShip(req.params.shipId);
      if (!ship || ship.eventId !== req.params.eventId) {
        return res.status(404).json({ error: 'Ship not found' });
      }
      if (ship.isDefeated) {
        return res.status(400).json({ error: 'Ship is already defeated' });
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

      // Get source planet position
      const fromPlanet = await prisma.planet.findUnique({ where: { id: fromPlanetId } });
      if (!fromPlanet) {
        return res.status(404).json({ error: 'Source planet not found' });
      }

      // Calculate travel time to ship coordinates
      const distance = calculateDistance(fromPlanet.x, fromPlanet.y, ship.x, ship.y);
      const travelTimeSeconds = calculateTravelTime(distance);
      const departAt = new Date();
      const arriveAt = new Date(departAt.getTime() + travelTimeSeconds * 1000);

      // Deduct units from source planet
      await deductUnits(fromPlanetId, units);

      // Create fleet for event attack
      const fleet = await prisma.fleet.create({
        data: {
          ownerId: userId,
          fromPlanetId,
          toPlanetId: fromPlanetId, // No target planet - we use targetEventShipId
          type: 'event_attack',
          unitsJson: JSON.stringify(units),
          cargoJson: JSON.stringify({ systemAssignments: assignments }), // Store lane assignments for combat
          targetEventShipId: ship.id,
          departAt,
          arriveAt,
          status: 'enroute',
        },
        include: {
          fromPlanet: { select: { id: true, x: true, y: true, name: true } },
        },
      });

      // Queue job for processing fleet arrival
      await queueEventFleetArrival({
        fleetId: fleet.id,
        eventId: req.params.eventId,
        shipId: ship.id,
      }, arriveAt);

      res.status(201).json({
        message: 'Fleet dispatched to intercept alien ship',
        fleet: {
          id: fleet.id,
          type: fleet.type,
          fromPlanet: { id: fromPlanet.id, x: fromPlanet.x, y: fromPlanet.y, name: fromPlanet.name },
          targetShip: {
            id: ship.id,
            name: ship.name,
            shipType: ship.shipType,
            level: ship.level,
            x: ship.x,
            y: ship.y,
          },
          units,
          departAt: fleet.departAt,
          arriveAt: fleet.arriveAt,
          status: fleet.status,
          distance: Math.round(distance),
          travelTimeSeconds,
        },
      });
    } catch (error: any) {
      console.error('Error dispatching event attack fleet:', error);
      res.status(500).json({ error: 'Failed to dispatch fleet' });
    }
  }
);

// =============================================================================
// ADMIN/DEV ROUTES (only available when ENABLE_DEV_ROUTES=true)
// =============================================================================

const devRoutesEnabled = process.env.ENABLE_DEV_ROUTES !== 'false';

if (devRoutesEnabled) {
  /**
   * GET /api/events
   * List all events (admin)
   */
  router.get('/', authenticateToken, async (req: Request, res: Response) => {
    try {
      const includeEnded = req.query.includeEnded === 'true';
      const events = await listEvents(includeEnded);

      res.json({ events });
    } catch (error: any) {
      console.error('Error listing events:', error);
      res.status(500).json({ error: 'Failed to list events' });
    }
  });

  /**
   * POST /api/events
   * Create a new scheduled event (admin)
   */
  router.post('/', authenticateToken, async (req: Request, res: Response) => {
    try {
      const { type, name, startTime, durationDays, customConfig } = req.body;

      // Validate type
      if (!Object.values(EVENT_TYPES).includes(type)) {
        return res.status(400).json({
          error: `Invalid event type. Valid types: ${Object.values(EVENT_TYPES).join(', ')}`,
        });
      }

      // Validate required fields
      if (!name || !startTime || !durationDays) {
        return res.status(400).json({
          error: 'Missing required fields: name, startTime, durationDays',
        });
      }

      const event = await createEvent(
        type as EventType,
        name,
        new Date(startTime),
        parseInt(durationDays),
        customConfig
      );

      res.status(201).json({ event });
    } catch (error: any) {
      console.error('Error creating event:', error);
      res.status(400).json({ error: error.message || 'Failed to create event' });
    }
  });

  /**
   * POST /api/events/test
   * Create and immediately start a test event (dev only)
   */
  router.post('/test', authenticateToken, async (req: Request, res: Response) => {
    try {
      const durationMinutes = parseInt(req.body.durationMinutes) || 60;
      const event = await createTestEvent(durationMinutes);

      res.status(201).json({
        event,
        message: `Test event created and started. Ends in ${durationMinutes} minutes.`,
      });
    } catch (error: any) {
      console.error('Error creating test event:', error);
      res.status(400).json({ error: error.message || 'Failed to create test event' });
    }
  });

  /**
   * POST /api/events/:eventId/start
   * Force start a scheduled event immediately (dev only)
   */
  router.post('/:eventId/start', authenticateToken, async (req: Request, res: Response) => {
    try {
      const event = await forceStartEvent(req.params.eventId);

      if (!event) {
        return res.status(404).json({ error: 'Event not found or already started' });
      }

      res.json({ event, message: 'Event started successfully' });
    } catch (error: any) {
      console.error('Error starting event:', error);
      res.status(400).json({ error: error.message || 'Failed to start event' });
    }
  });

  /**
   * DELETE /api/events/:eventId
   * Delete an event (dev only)
   */
  router.delete('/:eventId', authenticateToken, async (req: Request, res: Response) => {
    try {
      await deleteEvent(req.params.eventId);
      res.json({ message: 'Event deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting event:', error);
      res.status(400).json({ error: error.message || 'Failed to delete event' });
    }
  });
}

export default router;


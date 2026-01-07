import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all battle reports for the authenticated user
router.get('/battles', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const reports = await prisma.battleReport.findMany({
      where: {
        OR: [
          { attackerId: userId },
          { defenderId: userId },
        ],
      },
      include: {
        fleet: {
          include: {
            fromPlanet: {
              select: { id: true, name: true, x: true, y: true },
            },
            toPlanet: {
              select: { id: true, name: true, x: true, y: true },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // Limit to 50 most recent
    });

    const result = reports.map((report) => {
      const isAttacker = report.attackerId === userId;
      const laneResults = JSON.parse(report.laneResultsJson);
      const attackerLosses = JSON.parse(report.attackerTotalLossesJson);
      const defenderLosses = JSON.parse(report.defenderTotalLossesJson);
      
      const admirals = laneResults.admirals || { attacker: null, defender: null };

      return {
        id: report.id,
        fleetId: report.fleetId,
        isAttacker,
        winner: report.winner,
        attackerPlanet: report.fleet.fromPlanet,
        defenderPlanet: report.fleet.toPlanet,
        laneResults,
        attackerLosses,
        defenderLosses,
        myLosses: isAttacker ? attackerLosses : defenderLosses,
        enemyLosses: isAttacker ? defenderLosses : attackerLosses,
        admirals: {
          attacker: admirals.attacker,
          defender: admirals.defender
        },
        createdAt: report.createdAt,
      };
    });

    res.json({ reports: result });
  } catch (error) {
    console.error('Error fetching battle reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific battle report
router.get('/battles/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const report = await prisma.battleReport.findUnique({
      where: { id },
      include: {
        fleet: {
          include: {
            fromPlanet: {
              select: { id: true, name: true, x: true, y: true },
            },
            toPlanet: {
              select: { id: true, name: true, x: true, y: true },
            },
          },
        },
      },
    });

    if (!report) {
      return res.status(404).json({ error: 'Battle report not found' });
    }

    // Check if user is involved in this battle
    if (report.attackerId !== userId && report.defenderId !== userId) {
      return res.status(403).json({ error: 'You are not involved in this battle' });
    }

    const isAttacker = report.attackerId === userId;
    const laneResults = JSON.parse(report.laneResultsJson);
    const attackerLosses = JSON.parse(report.attackerTotalLossesJson);
    const defenderLosses = JSON.parse(report.defenderTotalLossesJson);
    const loot = report.resourcesJson ? JSON.parse(report.resourcesJson) : null;
    
    // Extract admiral information from laneResults (if present)
    const admirals = laneResults.admirals || { attacker: null, defender: null };

    res.json({
      id: report.id,
      fleetId: report.fleetId,
      isAttacker,
      winner: report.winner,
      attackerPlanet: report.fleet.fromPlanet,
      defenderPlanet: report.fleet.toPlanet,
      laneResults,
      attackerLosses,
      defenderLosses,
      myLosses: isAttacker ? attackerLosses : defenderLosses,
      enemyLosses: isAttacker ? defenderLosses : attackerLosses,
      loot: isAttacker ? loot : null,
      resourcesStolen: loot,
      resourcesJson: report.resourcesJson, // Required by Mailbox.tsx
      admirals: {
        attacker: admirals.attacker,
        defender: admirals.defender
      },
      createdAt: report.createdAt,
    });
  } catch (error) {
    console.error('Error fetching battle report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;





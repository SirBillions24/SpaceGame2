import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// --- COMBAT REPORT MASKING FOR DEFEATED ATTACKERS ---
// When an attacker loses, they should not see the defender's stationed troop positions.
// They can only see:
// - Their own losses
// - What they killed (defenderLosses per sector)
// - If they breached any flank: the surface/courtyard troops they fought against

interface FlankUnits {
  [unitType: string]: number;
}

interface SectorData {
  winner: 'attacker' | 'defender';
  initialAttackerUnits?: FlankUnits | null;
  initialDefenderUnits?: FlankUnits | null;
  survivingAttackers?: FlankUnits | null;
  survivingDefenders?: FlankUnits | null;
  attackerLosses?: FlankUnits;
  defenderLosses?: FlankUnits;
  waveResults?: any[];
  attackerToolsByWave?: any[];
  defenderTools?: any;
  wavesFought?: number;
}

interface SurfaceData {
  winner: 'attacker' | 'defender';
  attackerBonus?: number;
  defenderBonus?: number;
  initialAttackerUnits?: FlankUnits | null;
  initialDefenderUnits?: FlankUnits | null;
  attackerLosses?: FlankUnits;
  defenderLosses?: FlankUnits;
}

interface LaneResults {
  sectors?: Record<string, SectorData>;
  surface?: SurfaceData | null;
  admirals?: any;
  // Legacy format support
  left?: SectorData;
  center?: SectorData;
  front?: SectorData;
  right?: SectorData;
}

function hasUnits(units: FlankUnits | null | undefined): boolean {
  if (!units) return false;
  return Object.values(units).reduce((a, b) => a + b, 0) > 0;
}

function maskReportForDefeatedAttacker(laneResults: LaneResults): LaneResults {
  // Extract sectors (handle both new and legacy format)
  // Use Record<string, SectorData | undefined> to allow string indexing
  const sectors: Record<string, SectorData | undefined> = laneResults.sectors ?
    { ...laneResults.sectors } :
    {
      left: laneResults.left,
      center: laneResults.center || laneResults.front,
      front: laneResults.front,
      right: laneResults.right
    };
  const surface = laneResults.surface;

  // Determine which sectors were breached (attacker won AND sent units)
  const getSector = (key: string): SectorData | undefined => {
    if (sectors[key]) return sectors[key];
    if (key === 'center' && sectors['front']) return sectors['front'];
    return undefined;
  };

  const leftSector = getSector('left');
  const centerSector = getSector('center');
  const rightSector = getSector('right');

  const leftBreached = leftSector?.winner === 'attacker' && hasUnits(leftSector?.initialAttackerUnits);
  const centerBreached = centerSector?.winner === 'attacker' && hasUnits(centerSector?.initialAttackerUnits);
  const rightBreached = rightSector?.winner === 'attacker' && hasUnits(rightSector?.initialAttackerUnits);

  const anyBreached = leftBreached || centerBreached || rightBreached;

  // Mask sectors - hide defender stationed positions for non-breached sectors
  const maskSector = (sector: SectorData | undefined, wasBreached: boolean): SectorData | undefined => {
    if (!sector) return undefined;

    if (wasBreached) {
      // Full visibility for breached sectors
      return sector;
    }

    // Hide defender positions, keep losses visible
    return {
      ...sector,
      initialDefenderUnits: null,
      survivingDefenders: null,
      // Keep defenderLosses - this is what the attacker killed
      // Keep defenderTools visible as intelligence
    };
  };

  const maskedSectors: Record<string, SectorData | undefined> = {
    left: maskSector(leftSector, leftBreached),
    center: maskSector(centerSector, centerBreached),
    right: maskSector(rightSector, rightBreached)
  };

  // Handle legacy format (front vs center)
  if (laneResults.front && !laneResults.center) {
    maskedSectors['front'] = maskedSectors['center'];
    delete maskedSectors['center'];
  }

  // Mask surface if no breach occurred
  let maskedSurface = surface;
  if (surface && !anyBreached) {
    maskedSurface = {
      ...surface,
      initialDefenderUnits: null,
      // Keep attacker data and losses visible
    };
  }

  // Reconstruct the result
  if (laneResults.sectors) {
    return {
      ...laneResults,
      sectors: maskedSectors as Record<string, SectorData>,
      surface: maskedSurface
    };
  }

  // Legacy format
  return {
    ...laneResults,
    left: maskedSectors.left,
    center: maskedSectors.center,
    front: maskedSectors.front,
    right: maskedSectors.right,
    surface: maskedSurface
  };
}

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
      let laneResults = JSON.parse(report.laneResultsJson);
      const attackerLosses = JSON.parse(report.attackerTotalLossesJson);
      const defenderLosses = JSON.parse(report.defenderTotalLossesJson);

      // Mask defender positions if attacker lost
      const attackerLost = report.winner === 'defender';
      if (isAttacker && attackerLost) {
        laneResults = maskReportForDefeatedAttacker(laneResults);
      }

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
    let laneResults = JSON.parse(report.laneResultsJson);
    const attackerLosses = JSON.parse(report.attackerTotalLossesJson);
    const defenderLosses = JSON.parse(report.defenderTotalLossesJson);
    const loot = report.resourcesJson ? JSON.parse(report.resourcesJson) : null;

    // Mask defender positions if attacker lost
    const attackerLost = report.winner === 'defender';
    if (isAttacker && attackerLost) {
      laneResults = maskReportForDefeatedAttacker(laneResults);
    }

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





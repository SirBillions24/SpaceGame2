import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get defense profile for a planet (computed defense values)
router.get('/planets/:id/defense-profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const planet = await prisma.planet.findUnique({
      where: { id },
      include: {
        defenseLayout: true,
        owner: {
          include: { admiral: true },
        },
      },
    });

    if (!planet) {
      return res.status(404).json({ error: 'Planet not found' });
    }

    // Compute defense profile
    const defenseLayout = planet.defenseLayout;
    const frontDefense = defenseLayout
      ? JSON.parse(defenseLayout.frontLaneJson)
      : {};
    const leftDefense = defenseLayout
      ? JSON.parse(defenseLayout.leftLaneJson)
      : {};
    const rightDefense = defenseLayout
      ? JSON.parse(defenseLayout.rightLaneJson)
      : {};

    const admiralBonus = planet.owner.admiral?.defenseBonus || 0;

    res.json({
      planetId: planet.id,
      defensiveGridLevel: planet.defensiveGridLevel,
      perimeterFieldLevel: planet.perimeterFieldLevel,
      starportLevel: planet.starportLevel,
      admiralDefenseBonus: admiralBonus,
      laneDefenses: {
        front: frontDefense,
        left: leftDefense,
        right: rightDefense,
      },
    });
  } catch (error) {
    console.error('Error fetching defense profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update defense layout (save lane troop assignments)
router.post('/planets/:id/defense-layout', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { front, left, right } = req.body;

    // Validate ownership
    const planet = await prisma.planet.findUnique({
      where: { id },
    });

    if (!planet) {
      return res.status(404).json({ error: 'Planet not found' });
    }

    if (planet.ownerId !== userId) {
      return res.status(403).json({ error: 'You do not own this planet' });
    }

    // Validate lane assignments
    if (!front || !left || !right) {
      return res.status(400).json({ error: 'All three lanes (front, left, right) are required' });
    }

    // Validate units exist at planet
    const planetUnits = await prisma.planetUnit.findMany({
      where: { planetId: id },
    });

    const unitMap = new Map<string, number>();
    planetUnits.forEach((unit) => {
      unitMap.set(unit.unitType, unit.count);
    });

    // Check if assigned units exceed available units
    const allAssigned: { [unitType: string]: number } = {};
    for (const lane of [front, left, right]) {
      for (const [unitType, count] of Object.entries(lane as { [key: string]: number })) {
        allAssigned[unitType] = (allAssigned[unitType] || 0) + (count as number);
      }
    }

    for (const [unitType, assignedCount] of Object.entries(allAssigned)) {
      const available = unitMap.get(unitType) || 0;
      if (assignedCount > available) {
        return res.status(400).json({
          error: `Insufficient ${unitType}: assigned ${assignedCount}, available ${available}`,
        });
      }
    }

    // Create or update defense layout
    const defenseLayout = await prisma.defenseLayout.upsert({
      where: { planetId: id },
      update: {
        frontLaneJson: JSON.stringify(front),
        leftLaneJson: JSON.stringify(left),
        rightLaneJson: JSON.stringify(right),
      },
      create: {
        planetId: id,
        frontLaneJson: JSON.stringify(front),
        leftLaneJson: JSON.stringify(left),
        rightLaneJson: JSON.stringify(right),
      },
    });

    res.json({
      message: 'Defense layout updated successfully',
      defenseLayout: {
        front: JSON.parse(defenseLayout.frontLaneJson),
        left: JSON.parse(defenseLayout.leftLaneJson),
        right: JSON.parse(defenseLayout.rightLaneJson),
      },
    });
  } catch (error) {
    console.error('Error updating defense layout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;


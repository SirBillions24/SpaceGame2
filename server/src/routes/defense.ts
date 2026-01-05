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
      include: { tools: true }
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

    // Normalize input (handle legacy format or new format)
    // New format: { units: {...}, tools: [...] }
    const normalizeLane = (lane: any) => {
      if (!lane.units && !lane.tools) return { units: lane, tools: [] }; // Legacy: input IS the units object
      return {
        units: lane.units || {},
        tools: Array.isArray(lane.tools) ? lane.tools : []
      };
    };

    const frontLane = normalizeLane(front);
    const leftLane = normalizeLane(left);
    const rightLane = normalizeLane(right);

    // 1. Validate Units Available
    const planetUnits = await prisma.planetUnit.findMany({
      where: { planetId: id },
    });

    const unitMap = new Map<string, number>();
    planetUnits.forEach((unit) => {
      unitMap.set(unit.unitType, unit.count);
    });

    const allAssignedUnits: { [unitType: string]: number } = {};
    for (const lane of [frontLane, leftLane, rightLane]) {
      for (const [unitType, count] of Object.entries(lane.units as { [key: string]: number })) {
        allAssignedUnits[unitType] = (allAssignedUnits[unitType] || 0) + (count as number);
      }
    }

    for (const [unitType, assignedCount] of Object.entries(allAssignedUnits)) {
      const available = unitMap.get(unitType) || 0;
      if (assignedCount > available) {
        return res.status(400).json({
          error: `Insufficient ${unitType}: assigned ${assignedCount}, available ${available}`,
        });
      }
    }

    // 2. Validate Tools
    // A. Slot Limits
    const maxSlots = Math.max(1, planet.defensiveGridLevel); // At least 1 slot, or based on level
    // GGE: Wall Level 1 = 1 slot. Level 2 = 2 slots? Let's check user request.
    // "At level one shield generator you can only equip 1 tool per flank on defense."
    // Let's assume 1 slot per level for now.

    const validateSlots = (laneTools: any[], laneName: string) => {
      if (laneTools.length > maxSlots) {
        throw new Error(`${laneName} lane exceeds max tool slots (${maxSlots})`);
      }
    };

    try {
      validateSlots(frontLane.tools, 'Center');
      validateSlots(leftLane.tools, 'Left');
      validateSlots(rightLane.tools, 'Right');
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }

    // B. Tool Inventory Logic
    // In GGE, tools assigned to defense are usually NOT deducted from inventory until consumed in battle.
    // They are just "assigned". So we check if User HAS enough tools in Inventory to cover assignment.
    // OR, do they stay in inventory and we just reference them?
    // "On defense only 1 tool of each type is used per wave, however you can stack as many as you want in the slots"
    // This implies we need to hold them in the slot.
    // Usually, you assume the user *assigns* them and they are essentially "reserved" or just checked.
    // With a shared global inventory, assigning 100 tools to Front and 100 to Left = 200 needed.

    // Let's calculate total tools assigned.
    const allAssignedTools: Record<string, number> = {};

    // Tools structure: [{ type: 'auto_turret', count: 50 }, ...]
    const tallyTools = (tools: any[]) => {
      tools.forEach(t => {
        if (t.type && t.count > 0) {
          allAssignedTools[t.type] = (allAssignedTools[t.type] || 0) + t.count;
        }
      });
    };
    tallyTools(frontLane.tools);
    tallyTools(leftLane.tools);
    tallyTools(rightLane.tools);

    // Check against Inventory
    // We fetched planet.tools via include
    const inventoryMap = new Map<string, number>();
    planet.tools.forEach(t => inventoryMap.set(t.toolType, t.count));

    for (const [toolType, required] of Object.entries(allAssignedTools)) {
      const available = inventoryMap.get(toolType) || 0;
      if (required > available) {
        return res.status(400).json({
          error: `Insufficient ${toolType}: assigned ${required}, available ${available}`,
        });
      }
    }

    // Create or update defense layout
    const defenseLayout = await prisma.defenseLayout.upsert({
      where: { planetId: id },
      update: {
        frontLaneJson: JSON.stringify(frontLane),
        leftLaneJson: JSON.stringify(leftLane),
        rightLaneJson: JSON.stringify(rightLane),
      },
      create: {
        planetId: id,
        frontLaneJson: JSON.stringify(frontLane),
        leftLaneJson: JSON.stringify(leftLane),
        rightLaneJson: JSON.stringify(rightLane),
      },
    });

    res.json({
      message: 'Defense layout updated successfully',
      defenseLayout: {
        front: JSON.parse(defenseLayout.frontLaneJson),
        left: JSON.parse(defenseLayout.leftLaneJson),
        right: JSON.parse(defenseLayout.rightLaneJson),
      },
      // Return max slots for UI convenience
      maxSlots
    });
  } catch (error) {
    console.error('Error updating defense layout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;



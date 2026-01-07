import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  getOrCreateAdmiral,
  getAdmiral,
  updateAdmiralName,
  updateAdmiralGear,
  equipGearPiece,
  unequipGearPiece,
  getGearInventory,
  hasNavalAcademy,
  AdmiralGear,
  GearSlot,
} from '../services/admiralService';

const router = Router();

// Get current user's admiral
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    // Check if user has Naval Academy (for UI access, but we'll still create admiral)
    // This is just for informational purposes - we don't block GET
    const hasAcademy = await hasNavalAcademy(userId);
    
    const admiral = await getOrCreateAdmiral(userId);

    res.json({
      id: admiral.id,
      name: admiral.name,
      gear: JSON.parse(admiral.gearJson || '{}'),
      meleeStrengthBonus: (admiral as any).meleeStrengthBonus || 0,
      rangedStrengthBonus: (admiral as any).rangedStrengthBonus || 0,
      canopyReductionBonus: (admiral as any).canopyReductionBonus || 0,
      // Legacy fields for compatibility
      attackBonus: admiral.attackBonus,
      defenseBonus: admiral.defenseBonus,
      hasNavalAcademy: hasAcademy, // Inform frontend if they have academy
    });
  } catch (error: any) {
    console.error('Error fetching admiral:', error);
    // Provide more detailed error message
    const errorMessage = error?.message || 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

// Update admiral name
router.put('/name', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Check if user has Naval Academy
    const hasAcademy = await hasNavalAcademy(userId);
    if (!hasAcademy) {
      return res.status(403).json({ error: 'Naval Academy required to manage admirals' });
    }

    const admiral = await updateAdmiralName(userId, name);

    res.json({
      id: admiral.id,
      name: admiral.name,
      gear: JSON.parse(admiral.gearJson || '{}'),
      meleeStrengthBonus: (admiral as any).meleeStrengthBonus || 0,
      rangedStrengthBonus: (admiral as any).rangedStrengthBonus || 0,
      canopyReductionBonus: (admiral as any).canopyReductionBonus || 0,
      attackBonus: admiral.attackBonus,
      defenseBonus: admiral.defenseBonus,
    });
  } catch (error: any) {
    console.error('Error updating admiral name:', error);
    if (error.message.includes('name')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update admiral gear
router.put('/gear', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { gear } = req.body;

    if (!gear || typeof gear !== 'object') {
      return res.status(400).json({ error: 'Gear object is required' });
    }

    // Check if user has Naval Academy
    const hasAcademy = await hasNavalAcademy(userId);
    if (!hasAcademy) {
      return res.status(403).json({ error: 'Naval Academy required to manage admirals' });
    }

    const admiral = await updateAdmiralGear(userId, gear as AdmiralGear);

    res.json({
      id: admiral.id,
      name: admiral.name,
      gear: JSON.parse(admiral.gearJson || '{}'),
      meleeStrengthBonus: (admiral as any).meleeStrengthBonus || 0,
      rangedStrengthBonus: (admiral as any).rangedStrengthBonus || 0,
      canopyReductionBonus: (admiral as any).canopyReductionBonus || 0,
      attackBonus: admiral.attackBonus,
      defenseBonus: admiral.defenseBonus,
    });
  } catch (error) {
    console.error('Error updating admiral gear:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get gear inventory
router.get('/gear/inventory', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const inventory = await getGearInventory(userId);
    res.json({ inventory });
  } catch (error: any) {
    console.error('Error fetching gear inventory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Equip gear piece
router.post('/gear/equip', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { pieceId, slotType } = req.body;

    if (!pieceId || !slotType) {
      return res.status(400).json({ error: 'pieceId and slotType are required' });
    }

    // Check if user has Naval Academy
    const hasAcademy = await hasNavalAcademy(userId);
    if (!hasAcademy) {
      return res.status(403).json({ error: 'Naval Academy required to manage admirals' });
    }

    const admiral = await equipGearPiece(userId, pieceId, slotType as GearSlot);

    res.json({
      id: admiral.id,
      name: admiral.name,
      gear: JSON.parse(admiral.gearJson || '{}'),
      meleeStrengthBonus: (admiral as any).meleeStrengthBonus || 0,
      rangedStrengthBonus: (admiral as any).rangedStrengthBonus || 0,
      canopyReductionBonus: (admiral as any).canopyReductionBonus || 0,
      attackBonus: admiral.attackBonus,
      defenseBonus: admiral.defenseBonus,
    });
  } catch (error: any) {
    console.error('Error equipping gear:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Unequip gear piece
router.post('/gear/unequip', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { slotType } = req.body;

    if (!slotType) {
      return res.status(400).json({ error: 'slotType is required' });
    }

    // Check if user has Naval Academy
    const hasAcademy = await hasNavalAcademy(userId);
    if (!hasAcademy) {
      return res.status(403).json({ error: 'Naval Academy required to manage admirals' });
    }

    const admiral = await unequipGearPiece(userId, slotType as GearSlot);

    res.json({
      id: admiral.id,
      name: admiral.name,
      gear: JSON.parse(admiral.gearJson || '{}'),
      meleeStrengthBonus: (admiral as any).meleeStrengthBonus || 0,
      rangedStrengthBonus: (admiral as any).rangedStrengthBonus || 0,
      canopyReductionBonus: (admiral as any).canopyReductionBonus || 0,
      attackBonus: admiral.attackBonus,
      defenseBonus: admiral.defenseBonus,
    });
  } catch (error: any) {
    console.error('Error unequipping gear:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;


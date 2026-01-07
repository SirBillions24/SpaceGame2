import prisma from '../lib/prisma';
import { getStarterGear, type GearItemDefinition } from '../constants/gearData';

// Define the 4 gear slots
export const GEAR_SLOTS = ['weapon', 'helmet', 'spacesuit', 'shield'] as const;
export type GearSlot = typeof GEAR_SLOTS[number];

export interface GearPiece {
  id: string;
  slotType: GearSlot;
  name: string;
  rarity: string;
  level: number;
  meleeStrengthBonus: number;
  rangedStrengthBonus: number;
  canopyReductionBonus: number;
  // Legacy fields
  attackBonus?: number;
  defenseBonus?: number;
  setName?: string;
  iconName?: string;
}

export interface AdmiralGear {
  weapon?: GearPiece;
  helmet?: GearPiece;
  spacesuit?: GearPiece;
  shield?: GearPiece;
}

/**
 * Calculate admiral bonuses from gear (attack bonuses only)
 * Caps: melee/ranged at +100%, wall reduction at -100%
 */
export function calculateAdmiralBonuses(gearJson: string): {
  meleeStrengthBonus: number;
  rangedStrengthBonus: number;
  canopyReductionBonus: number;
} {
  try {
    const gear: AdmiralGear = JSON.parse(gearJson || '{}');
    let melee = 0;
    let ranged = 0;
    let canopy = 0;

    // Sum bonuses from all gear slots (only the 4 valid slots)
    for (const slotType of GEAR_SLOTS) {
      const piece = gear[slotType];
      if (piece) {
        melee += piece.meleeStrengthBonus || 0;
        ranged += piece.rangedStrengthBonus || 0;
        canopy += piece.canopyReductionBonus || 0;
      }
    }

    // Apply caps
    return {
      meleeStrengthBonus: Math.min(100, Math.max(0, melee)),
      rangedStrengthBonus: Math.min(100, Math.max(0, ranged)),
      canopyReductionBonus: Math.max(-100, Math.min(0, canopy)), // Negative only, capped at -100%
    };
  } catch (e) {
    return {
      meleeStrengthBonus: 0,
      rangedStrengthBonus: 0,
      canopyReductionBonus: 0,
    };
  }
}

/**
 * Get or create admiral for a user
 */
export async function getOrCreateAdmiral(userId: string) {
  let admiral = await prisma.admiral.findUnique({
    where: { userId },
  });

  if (!admiral) {
    admiral = await prisma.admiral.create({
      data: {
        userId,
        name: 'Admiral',
        gearJson: '{}',
        attackBonus: 0,
        defenseBonus: 0,
      },
    });
  }

  return admiral;
}

/**
 * Get admiral for a user
 */
export async function getAdmiral(userId: string) {
  return await prisma.admiral.findUnique({
    where: { userId },
  });
}

/**
 * Update admiral name
 */
export async function updateAdmiralName(userId: string, name: string) {
  if (!name || name.trim().length === 0) {
    throw new Error('Admiral name cannot be empty');
  }
  if (name.length > 50) {
    throw new Error('Admiral name must be 50 characters or less');
  }

  const admiral = await getOrCreateAdmiral(userId);
  return await prisma.admiral.update({
    where: { id: admiral.id },
    data: { name: name.trim() },
  });
}

/**
 * Update admiral gear and recalculate bonuses
 * Validates that only valid slots are included
 */
export async function updateAdmiralGear(userId: string, gear: Partial<AdmiralGear>) {
  const admiral = await getOrCreateAdmiral(userId);
  
  // Validate gear slots - only allow the 4 valid slots
  const validGear: AdmiralGear = {};
  for (const slotType of GEAR_SLOTS) {
    if (gear[slotType]) {
      validGear[slotType] = gear[slotType]!;
    }
  }
  
  const gearJson = JSON.stringify(validGear);
  const bonuses = calculateAdmiralBonuses(gearJson);

  return await prisma.admiral.update({
    where: { id: admiral.id },
    data: {
      gearJson,
      meleeStrengthBonus: bonuses.meleeStrengthBonus,
      rangedStrengthBonus: bonuses.rangedStrengthBonus,
      canopyReductionBonus: bonuses.canopyReductionBonus,
      // Keep legacy fields for compatibility
      attackBonus: bonuses.meleeStrengthBonus + bonuses.rangedStrengthBonus, // Rough equivalent
      defenseBonus: 0, // Not used for attack bonuses
    } as any, // Type assertion needed until TypeScript picks up new Prisma types
  });
}

/**
 * Equip a gear piece to an admiral slot
 */
export async function equipGearPiece(userId: string, pieceId: string, slotType: GearSlot) {
  if (!GEAR_SLOTS.includes(slotType)) {
    throw new Error(`Invalid gear slot: ${slotType}. Must be one of: ${GEAR_SLOTS.join(', ')}`);
  }

  const admiral = await getOrCreateAdmiral(userId);
  
  // Verify the piece exists and belongs to the user
  const piece = await (prisma as any).gearPiece.findFirst({
    where: {
      id: pieceId,
      userId: userId,
      slotType: slotType, // Must match the slot type
    },
  });

  if (!piece) {
    throw new Error('Gear piece not found or does not match slot type');
  }

  // Get current gear
  const currentGear: AdmiralGear = JSON.parse(admiral.gearJson || '{}');
  
  // If there's already a piece in this slot, we'll replace it
  currentGear[slotType] = {
    id: piece.id,
    slotType: piece.slotType as GearSlot,
    name: piece.name,
    rarity: piece.rarity,
    level: piece.level,
    meleeStrengthBonus: piece.meleeStrengthBonus,
    rangedStrengthBonus: piece.rangedStrengthBonus,
    canopyReductionBonus: piece.canopyReductionBonus,
    attackBonus: piece.attackBonus || 0,
    defenseBonus: piece.defenseBonus || 0,
    setName: piece.setName || undefined,
    iconName: piece.iconName || undefined,
  };

  return await updateAdmiralGear(userId, currentGear);
}

/**
 * Unequip a gear piece from an admiral slot
 */
export async function unequipGearPiece(userId: string, slotType: GearSlot) {
  if (!GEAR_SLOTS.includes(slotType)) {
    throw new Error(`Invalid gear slot: ${slotType}. Must be one of: ${GEAR_SLOTS.join(', ')}`);
  }

  const admiral = await getOrCreateAdmiral(userId);
  const currentGear: AdmiralGear = JSON.parse(admiral.gearJson || '{}');
  
  delete currentGear[slotType];
  
  return await updateAdmiralGear(userId, currentGear);
}

/**
 * Get user's gear inventory
 */
export async function getGearInventory(userId: string) {
  return await (prisma as any).gearPiece.findMany({
    where: { userId },
    orderBy: [
      { rarity: 'asc' },
      { level: 'desc' },
      { name: 'asc' },
    ],
  });
}

/**
 * Create a gear piece (for testing or NPC loot drops)
 */
export async function createGearPiece(
  userId: string,
  slotType: GearSlot,
  name: string,
  rarity: string,
  level: number,
  meleeStrengthBonus: number,
  rangedStrengthBonus: number,
  canopyReductionBonus: number,
  setName?: string,
  iconName?: string
) {
  if (!GEAR_SLOTS.includes(slotType)) {
    throw new Error(`Invalid gear slot: ${slotType}`);
  }

  return await (prisma as any).gearPiece.create({
    data: {
      userId,
      slotType,
      name,
      rarity,
      level,
      meleeStrengthBonus,
      rangedStrengthBonus,
      canopyReductionBonus,
      attackBonus: meleeStrengthBonus + rangedStrengthBonus, // Legacy compatibility
      defenseBonus: 0,
      setName,
      iconName,
    },
  });
}

/**
 * Give starter gear to a new user
 * Creates items from the STARTER_GEAR configuration
 */
export async function giveStarterGear(userId: string) {
  const starterItems = getStarterGear();

  // Check if user already has gear (avoid duplicates)
  const existingItems = await (prisma as any).gearPiece.findMany({
    where: { userId },
  });

  const createdItems = [];
  for (const item of starterItems) {
    // Check if this exact item already exists
    const existing = existingItems.find(
      (i: any) => i.slotType === item.slotType && i.name === item.name
    );

    if (!existing) {
      const piece = await createGearPiece(
        userId,
        item.slotType,
        item.name,
        item.rarity,
        item.level,
        item.meleeStrengthBonus,
        item.rangedStrengthBonus,
        item.canopyReductionBonus,
        item.setName,
        item.iconName
      );
      createdItems.push(piece);
    }
  }

  return createdItems;
}

/**
 * Create a gear piece from a gear definition
 * Useful for creating gear from the gearData configuration
 */
export async function createGearFromDefinition(
  userId: string,
  gearDef: GearItemDefinition
) {
  return await createGearPiece(
    userId,
    gearDef.slotType,
    gearDef.name,
    gearDef.rarity,
    gearDef.level,
    gearDef.meleeStrengthBonus,
    gearDef.rangedStrengthBonus,
    gearDef.canopyReductionBonus,
    gearDef.setName,
    gearDef.iconName
  );
}

/**
 * Check if user has Naval Academy (required for admiral operations)
 */
export async function hasNavalAcademy(userId: string, planetId?: string): Promise<boolean> {
  if (planetId) {
    // Check specific planet
    const planet = await prisma.planet.findUnique({
      where: { id: planetId },
      include: { buildings: true },
    });

    if (!planet || planet.ownerId !== userId) {
      return false;
    }

    return planet.buildings.some(
      (b) => b.type === 'academy' && b.status === 'active'
    );
  } else {
    // Check any planet owned by user
    const planets = await prisma.planet.findMany({
      where: { ownerId: userId },
      include: { buildings: true },
    });

    return planets.some((planet) =>
      planet.buildings.some(
        (b) => b.type === 'academy' && b.status === 'active'
      )
    );
  }
}




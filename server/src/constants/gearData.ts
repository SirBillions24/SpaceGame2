/**
 * Gear Data Configuration
 * 
 * This file contains all gear item definitions for the Admiral system.
 * Edit this file to add new gear, change stats, or balance existing items.
 * 
 * All gear bonuses are capped at:
 * - Melee Strength: +100%
 * - Ranged Strength: +100%
 * - Canopy Reduction: -100%
 */

import { GearSlot } from '../services/admiralService';

export interface GearItemDefinition {
  slotType: GearSlot;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  level: number;
  meleeStrengthBonus: number;  // Percentage (0-100)
  rangedStrengthBonus: number;  // Percentage (0-100)
  canopyReductionBonus: number;   // Percentage (-100 to 0, negative)
  setName?: string;             // Optional set name for set bonuses
  iconName: string;             // Icon identifier (matches image filename)
}

/**
 * Unique gear drop filter
 * Allows restricting unique drops to specific archetypes or minimum levels
 */
export interface UniqueGearEntry extends GearItemDefinition {
  archetypeFilter?: string[];  // null/undefined = can drop from any archetype
  minLevel?: number;           // null/undefined = can drop from any level NPC
}

// =============================================================================
// STARTER GEAR - Common rarity, single stat each, minimal bonuses
// Given to all new players on account creation for a fair start
// =============================================================================

export const STARTER_GEAR: GearItemDefinition[] = [
  {
    slotType: 'weapon',
    name: 'Recruit Pistol',
    rarity: 'common',
    level: 1,
    meleeStrengthBonus: 0,
    rangedStrengthBonus: 1,
    canopyReductionBonus: 0,
    setName: 'Recruit',
    iconName: 'weapon',
  },
  {
    slotType: 'helmet',
    name: 'Recruit Visor',
    rarity: 'common',
    level: 1,
    meleeStrengthBonus: 1,
    rangedStrengthBonus: 0,
    canopyReductionBonus: 0,
    setName: 'Recruit',
    iconName: 'helmet',
  },
  {
    slotType: 'spacesuit',
    name: 'Recruit Flightsuit',
    rarity: 'common',
    level: 1,
    meleeStrengthBonus: 0,
    rangedStrengthBonus: 0,
    canopyReductionBonus: -1,
    setName: 'Recruit',
    iconName: 'spacesuit',
  },
  {
    slotType: 'shield',
    name: 'Recruit Buckler',
    rarity: 'common',
    level: 1,
    meleeStrengthBonus: 1,
    rangedStrengthBonus: 0,
    canopyReductionBonus: 0,
    setName: 'Recruit',
    iconName: 'shield',
  },
];

// =============================================================================
// INFINITY SET - Ultra-rare unique drops with max stats (100% all bonuses)
// =============================================================================

export const INFINITY_SET: GearItemDefinition[] = [
  {
    slotType: 'weapon',
    name: 'Infinity Blade',
    rarity: 'legendary',
    level: 100,
    meleeStrengthBonus: 100,
    rangedStrengthBonus: 100,
    canopyReductionBonus: -100,
    setName: 'Infinity',
    iconName: 'infinity_weapon',
  },
  {
    slotType: 'helmet',
    name: 'Infinity Helm',
    rarity: 'legendary',
    level: 100,
    meleeStrengthBonus: 100,
    rangedStrengthBonus: 100,
    canopyReductionBonus: -100,
    setName: 'Infinity',
    iconName: 'infinity_helmet',
  },
  {
    slotType: 'spacesuit',
    name: 'Infinity Armor',
    rarity: 'legendary',
    level: 100,
    meleeStrengthBonus: 100,
    rangedStrengthBonus: 100,
    canopyReductionBonus: -100,
    setName: 'Infinity',
    iconName: 'infinity_spacesuit',
  },
  {
    slotType: 'shield',
    name: 'Infinity Barrier',
    rarity: 'legendary',
    level: 100,
    meleeStrengthBonus: 100,
    rangedStrengthBonus: 100,
    canopyReductionBonus: -100,
    setName: 'Infinity',
    iconName: 'infinity_shield',
  },
];

// =============================================================================
// UNIQUE GEAR DROP TABLE
// Uniques can be filtered by archetype and/or minimum NPC level
// Add future uniques here with specific drop conditions
// =============================================================================

export const UNIQUE_GEAR_TABLE: UniqueGearEntry[] = [
  // Infinity Set - drops from level 50+ NPCs of any archetype
  ...INFINITY_SET.map(g => ({
    ...g,
    archetypeFilter: undefined, // Any archetype
    minLevel: 50,               // Must be level 50+ NPC
  })),

  // Future uniques can be added here with specific filters:
  // {
  //   ...someGearDef,
  //   archetypeFilter: ['robotic'],  // Only drops from robotic NPCs
  //   minLevel: 30,
  // },
];

// =============================================================================
// ALL AVAILABLE GEAR (for reference/lookup)
// =============================================================================

export const ALL_GEAR_ITEMS: GearItemDefinition[] = [
  ...STARTER_GEAR,
  ...INFINITY_SET,
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getGearBySlot(slotType: GearSlot): GearItemDefinition[] {
  return ALL_GEAR_ITEMS.filter(item => item.slotType === slotType);
}

export function getGearByRarity(rarity: string): GearItemDefinition[] {
  return ALL_GEAR_ITEMS.filter(item => item.rarity === rarity);
}

export function getStarterGear(): GearItemDefinition[] {
  return STARTER_GEAR;
}

/**
 * Get eligible unique gear for a given NPC archetype and level
 */
export function getEligibleUniques(npcClass: string, npcLevel: number): UniqueGearEntry[] {
  return UNIQUE_GEAR_TABLE.filter(u =>
    (!u.minLevel || npcLevel >= u.minLevel) &&
    (!u.archetypeFilter || u.archetypeFilter.includes(npcClass))
  );
}

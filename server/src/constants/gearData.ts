/**
 * Gear Data Configuration
 * 
 * This file contains all gear item definitions for the Admiral system.
 * Edit this file to add new gear, change stats, or balance existing items.
 * 
 * All gear bonuses are capped at:
 * - Melee Strength: +100%
 * - Ranged Strength: +100%
 * - Wall Reduction: -100%
 */

import { GearSlot } from '../services/admiralService';

export interface GearItemDefinition {
  slotType: GearSlot;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  level: number;
  meleeStrengthBonus: number;  // Percentage (0-100)
  rangedStrengthBonus: number;  // Percentage (0-100)
  wallReductionBonus: number;   // Percentage (-100 to 0, negative)
  setName?: string;             // Optional set name for set bonuses
  iconName: string;             // Icon identifier (matches image filename)
}

/**
 * Starter Gear Set
 * These 4 items are given to all new players on account creation.
 * They total exactly: +100% melee, +100% ranged, -100% wall
 */
export const STARTER_GEAR: GearItemDefinition[] = [
  {
    slotType: 'weapon',
    name: 'Plasma Rifle',
    rarity: 'legendary',
    level: 10,
    meleeStrengthBonus: 50,
    rangedStrengthBonus: 50,
    wallReductionBonus: -50,
    iconName: 'weapon',
  },
  {
    slotType: 'helmet',
    name: 'Command Helmet',
    rarity: 'epic',
    level: 7,
    meleeStrengthBonus: 25,
    rangedStrengthBonus: 25,
    wallReductionBonus: -25,
    iconName: 'helmet',
  },
  {
    slotType: 'spacesuit',
    name: 'Combat Spacesuit',
    rarity: 'rare',
    level: 5,
    meleeStrengthBonus: 15,
    rangedStrengthBonus: 15,
    wallReductionBonus: -15,
    iconName: 'spacesuit',
  },
  {
    slotType: 'shield',
    name: 'Defense Matrix',
    rarity: 'uncommon',
    level: 3,
    meleeStrengthBonus: 10,
    rangedStrengthBonus: 10,
    wallReductionBonus: -10,
    iconName: 'shield',
  },
];

/**
 * All Available Gear Items
 * Add new gear items here. They can be dropped from NPCs or given as rewards.
 * 
 * To add a new item:
 * 1. Copy an existing item below
 * 2. Change the stats as needed
 * 3. Ensure bonuses don't exceed caps when combined
 */
export const ALL_GEAR_ITEMS: GearItemDefinition[] = [
  // Starter Gear (included in all gear list)
  ...STARTER_GEAR,

  // Example: Additional gear items can be added here
  // {
  //   slotType: 'weapon',
  //   name: 'Quantum Blaster',
  //   rarity: 'legendary',
  //   level: 15,
  //   meleeStrengthBonus: 60,
  //   rangedStrengthBonus: 60,
  //   wallReductionBonus: -60,
  //   iconName: 'weapon',
  // },
  // {
  //   slotType: 'helmet',
  //   name: 'Neural Interface',
  //   rarity: 'epic',
  //   level: 12,
  //   meleeStrengthBonus: 30,
  //   rangedStrengthBonus: 30,
  //   wallReductionBonus: -30,
  //   iconName: 'helmet',
  // },
];

/**
 * Get gear items by slot type
 */
export function getGearBySlot(slotType: GearSlot): GearItemDefinition[] {
  return ALL_GEAR_ITEMS.filter(item => item.slotType === slotType);
}

/**
 * Get gear items by rarity
 */
export function getGearByRarity(rarity: string): GearItemDefinition[] {
  return ALL_GEAR_ITEMS.filter(item => item.rarity === rarity);
}

/**
 * Get starter gear items
 */
export function getStarterGear(): GearItemDefinition[] {
  return STARTER_GEAR;
}



/**
 * NPC & Loot Balance Configuration
 * 
 * All tunable constants for NPC difficulty, respawn behavior, and gear drops.
 * Edit this file to balance the game without touching logic code.
 */

// =============================================================================
// NPC DIFFICULTY SCALING
// =============================================================================

export const NPC_BALANCE = {
    /**
     * Level scaling on respawn
     * NPCs gain levels each time they respawn after being defeated
     */
    levelScaling: {
        baseIncrement: 5, // Level gained per respawn (no cap for now)
    },

    /**
     * Defense scaling per level
     * Controls how strong NPC garrisons are
     */
    defenseScaling: {
        baseUnits: 10,           // Units at level 1
        unitsPerLevel: 5,        // Additional units per level
        toolUnlockLevel: 20,     // Level when NPCs start getting defensive tools
        toolCountScaling: 0.1,   // Tools = floor(level * this factor)
    },

    /**
     * Respawn behavior
     */
    respawn: {
        delaySeconds: 60,           // Delay before respawn (60s for testing)
        minDistanceFromPlanets: 100, // Minimum distance from any existing planet
    },

    /**
     * Starter NPC settings (spawned near new players)
     */
    starterNpcs: {
        count: { min: 3, max: 5 },
        levelRange: { min: 2, max: 5 },  // Low level for new players
        maxAttacks: { min: 5, max: 10 }, // Low hit count before respawn
        spawnRadius: { min: 150, max: 300 },
    },
};

// =============================================================================
// GEAR DROP BALANCE
// =============================================================================

export const LOOT_BALANCE = {
    /**
     * Master drop scalar
     * 1.0 = one guaranteed drop per NPC life
     * <1 = chance-based (0.5 = 50% chance)
     * >1 = multiple possible (2.0 = guaranteed 2 drops)
     */
    dropScalar: 1.0,

    /**
     * Rarity weights for random selection (higher = more common)
     * Used with weighted random selection
     */
    rarityWeights: {
        common: 50,
        uncommon: 30,
        rare: 15,
        epic: 4,
        legendary: 1,
    } as Record<GearRarity, number>,

    /**
     * Stat ranges per rarity (percentage bonuses)
     * Stats are rolled using bell curve distribution (most land in middle)
     */
    statRanges: {
        common: { min: 1, max: 5 },
        uncommon: { min: 5, max: 15 },
        rare: { min: 15, max: 30 },
        epic: { min: 30, max: 50 },
        legendary: { min: 50, max: 75 },
    } as Record<GearRarity, { min: number; max: number }>,

    /**
     * Modifier count by rarity
     * Determines how many stat modifiers are active on each piece
     * Format: { modifierCount: weight }
     */
    modifierCountWeights: {
        common: { 1: 100 },               // Always 1 modifier
        uncommon: { 1: 60, 2: 40 },       // 60% 1 mod, 40% 2 mods
        rare: { 1: 20, 2: 50, 3: 30 },    // Mix of all
        epic: { 3: 100 },                 // Always all 3
        legendary: { 3: 100 },            // Always all 3
    } as Record<GearRarity, Record<number, number>>,

    /**
     * Unique gear drop chance
     * Per NPC spawn, chance to drop a unique instead of random gear
     */
    uniqueDropRate: 0.01, // 1% chance

    /**
     * Minimum NPC level required to drop each rarity
     * NPCs below this level cannot drop that rarity
     */
    rarityMinLevels: {
        common: 1,      // Any level
        uncommon: 5,    // Level 5+
        rare: 15,       // Level 15+
        epic: 30,       // Level 30+
        legendary: 50,  // Level 50+
    } as Record<GearRarity, number>,

    /**
     * Level-based rarity weight multiplier
     * Each entry is: [levelThreshold, multipliers]
     * At each threshold, the multipliers boost higher rarity weights
     * Processed in order - last matching threshold wins
     */
    rarityLevelScaling: [
        // [minLevel, { rarityMultipliers }]
        { level: 1, multipliers: { common: 1.0, uncommon: 0.5, rare: 0.2, epic: 0.1, legendary: 0.0 } },
        { level: 10, multipliers: { common: 1.0, uncommon: 1.0, rare: 0.5, epic: 0.2, legendary: 0.0 } },
        { level: 20, multipliers: { common: 0.8, uncommon: 1.0, rare: 1.0, epic: 0.5, legendary: 0.1 } },
        { level: 35, multipliers: { common: 0.5, uncommon: 0.8, rare: 1.0, epic: 1.0, legendary: 0.3 } },
        { level: 50, multipliers: { common: 0.3, uncommon: 0.5, rare: 1.0, epic: 1.0, legendary: 1.0 } },
        { level: 75, multipliers: { common: 0.1, uncommon: 0.3, rare: 0.8, epic: 1.2, legendary: 1.5 } },
    ] as Array<{ level: number; multipliers: Record<GearRarity, number> }>,

    /**
     * Available gear slot types
     */
    slotTypes: ['weapon', 'helmet', 'spacesuit', 'shield'] as const,
};

// =============================================================================
// MAP CONFIGURATION (Dynamic bounds stored in DB, these are defaults/tunables)
// =============================================================================

export const MAP_CONFIG = {
    /** Starting map dimensions (used when creating WorldConfig) */
    initialSize: { x: 10000, y: 10000 },

    /** Amount to expand each dimension when triggered */
    expansionIncrement: 5000,

    /** Max players per quadrant before expansion is triggered */
    quadrantDensityThreshold: 50,

    /** Minimum distance between any two planets */
    minPlanetDistance: 300,

    /** NPC spawn radius around new players */
    npcSpawnRadius: { min: 400, max: 800 },

    /** Minimum distance from other planets for NPC spawns */
    npcMinDistance: 250,
};

// =============================================================================
// TYPES
// =============================================================================

export type GearRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type GearSlotType = (typeof LOOT_BALANCE.slotTypes)[number];


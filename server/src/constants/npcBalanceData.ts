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
     * Troop regeneration between attacks
     * NPCs regenerate troops after each attack, but at a decreasing rate
     * 
     * Formula: troopsForHit = baseTroops * decayMultiplier^attackCount
     * 
     * EXAMPLE (Level 10 NPC with 60 base troops, decayMultiplier 0.65):
     * - Hit 1: 60 * 0.65^0 = 60 troops (100%)
     * - Hit 2: 60 * 0.65^1 = 39 troops (65%)
     * - Hit 3: 60 * 0.65^2 = 25 troops (42%)
     * - Hit 4: 60 * 0.65^3 = 16 troops (27%)
     * - Hit 5: 60 * 0.65^4 = 11 troops (18%)
     * 
     * GAMEPLAY IMPACT:
     * - Higher decayMultiplier = more troops on later hits, slower decay
     * - minimumTroopPercent = floor, prevents completely empty NPCs
     */
    troopRegeneration: {
        decayMultiplier: 0.65,      // Troops = base * this^attackCount
        minimumTroopPercent: 0.15,  // Never drop below 15% of base troops
    },

    /**
     * Loot distribution across multiple attacks
     * Instead of front-loading all resources, distribute across hits
     * 
     * Formula: lootThisHit = remainingLoot * lootPercentPerHit
     * 
     * EXAMPLE (10,000 total carbon, lootPercentPerHit 0.40):
     * - Hit 1: 10,000 * 0.40 = 4,000 carbon (40% of total)
     * - Hit 2: 6,000 * 0.40 = 2,400 carbon (24% of total)
     * - Hit 3: 3,600 * 0.40 = 1,440 carbon (14% of total)
     * - Hit 4: 2,160 * 0.40 = 864 carbon (9% of total)
     * - Hit 5: 1,296 * 0.40 = 518 carbon (5% of total)
     * 
     * GAMEPLAY IMPACT:
     * - Higher lootPercentPerHit = more front-loaded, less for later hits
     * - Lower = more evenly distributed, more incentive for multiple attacks
     * - minimumLootPercent = ensures final hits still give something
     */
    lootDistribution: {
        lootPercentPerHit: 0.40,    // Take 40% of remaining resources per hit
        minimumLootPercent: 0.10,   // Always allow at least 10% of base per hit
        creditsPerHit: 0.25,        // Credits given per hit (25% of base per attack)
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
// NPC THEMES/ARCHETYPES
// =============================================================================

/**
 * NPC planet themes that determine their name, garrison composition, and loot focus.
 * Each NPC is assigned a random theme when spawned.
 * 
 * GAMEPLAY IMPACT:
 * - Units array = what troops defend this type (affects what counters work)
 * - primaryLoot = which resource has 5x bonus (creates "farming targets")
 * - unitUnlockLevels = when elite units start appearing in garrisons
 */
export interface NpcTheme {
    name: string;           // Display name (e.g., "Raider Outpost (Lvl 10)")
    units: string[];        // Unit types this archetype uses
    primaryLoot: string;    // Resource that gets 5x loot multiplier
    unitUnlockLevels: Record<string, number>;  // Level thresholds for stronger units
}

export const NPC_THEMES: Record<string, NpcTheme> = {
    melee: {
        name: 'Raider Outpost',
        units: ['marine', 'sentinel'],
        primaryLoot: 'carbon',
        unitUnlockLevels: {
            sentinel: 10,   // Sentinels appear at level 10+
        },
    },
    ranged: {
        name: 'Sniper Den',
        units: ['sniper'],
        primaryLoot: 'food',
        unitUnlockLevels: {},
    },
    robotic: {
        name: 'Automaton Forge',
        units: ['interceptor', 'automaton', 'drone'],
        primaryLoot: 'titanium',
        unitUnlockLevels: {
            automaton: 10,      // Automatons appear at level 10+
            interceptor: 20,    // Interceptors appear at level 20+
        },
    },
};

// =============================================================================
// NPC LOOT RESOURCE FORMULAS
// =============================================================================

/**
 * Formulas for calculating how much loot NPCs have.
 * 
 * Formula: resource = base × (npcLevel / levelDivisor) × archetype multiplier
 * 
 * EXAMPLE (Level 20 Melee NPC):
 * - Carbon = 500 × (20/10) × 5 = 5,000 carbon (5x because melee → carbon)
 * - Titanium = 500 × (20/10) × 1 = 1,000 titanium
 * - Credits = 100 × (20/10) = 200 credits
 * 
 * GAMEPLAY IMPACT:
 * - Higher bases = more loot per raid, faster player economy growth
 * - Higher levelDivisor = less loot scaling with level, flatter progression
 * - archetypeMultiplier = creates "farming targets" for specific resources
 */
export const NPC_LOOT_RESOURCES = {
    baseCarbon: 500,            // Base carbon loot
    baseTitanium: 500,          // Base titanium loot
    baseFood: 500,              // Base food loot
    baseCredits: 100,           // Base credits loot
    levelDivisor: 10,           // Divide NPC level by this for scaling
    archetypeMultiplier: 5,     // Primary loot gets this multiplier
};

/**
 * Gear name generation - cosmetic prefixes and suffixes for randomly generated gear.
 * 
 * NOTE: These are purely cosmetic and don't affect gameplay balance.
 */
export const GEAR_NAME_PREFIXES: Record<GearRarity, string[]> = {
    common: ['Basic', 'Standard', 'Simple'],
    uncommon: ['Refined', 'Enhanced', 'Improved'],
    rare: ['Advanced', 'Superior', 'Elite'],
    epic: ['Masterwork', 'Ascended', 'Exalted'],
    legendary: ['Mythic', 'Transcendent', 'Divine'],
};

export const GEAR_NAME_SUFFIXES: Record<string, string[]> = {
    weapon: ['Rifle', 'Blaster', 'Cannon', 'Blicky'],
    helmet: ['Helm', 'Visor', 'Crown'],
    spacesuit: ['Armor', 'Exosuit', 'Battlesuit', 'Drip'],
    shield: ['Barrier', 'Aegis', 'Bulwark'],
};

// =============================================================================
// TYPES
// =============================================================================

export type GearRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type GearSlotType = (typeof LOOT_BALANCE.slotTypes)[number];


/**
 * Harvester Configuration
 * 
 * All tunable constants for Horizon Harvesters - the level 50 NPC structures
 * that orbit black holes and produce Dark Matter.
 * 
 * Harvesters are end-game conquest targets that provide ongoing Dark Matter income.
 * Adjust these values to balance the difficulty and reward of capturing Harvesters.
 */

// =============================================================================
// HARVESTER STRUCTURE
// =============================================================================

/**
 * Grid size for Harvester planets (tiles × tiles).
 * Harvesters are much larger than normal planets.
 * 
 * Note: This should stay at 50 to match the MAX_GRID_SIZE for fully expanded planets.
 */
export const HARVESTER_GRID_SIZE = 50;

/**
 * NPC level assigned to uncaptured Harvesters.
 * This affects the difficulty of the defending garrison.
 * 
 * GAMEPLAY IMPACT:
 * - Higher level = much harder to capture, requires late-game armies
 * - Lower level = accessible earlier, but may feel unearned
 */
export const HARVESTER_NPC_LEVEL = 50;

/**
 * Number of Dark Matter Generators placed on each Harvester.
 * Each generator produces darkMatterPerHour (defined in buildingData.ts).
 * 
 * GAMEPLAY IMPACT:
 * - More generators = higher Dark Matter income, bigger reward for capture
 * - Fewer generators = Harvesters are less valuable, less worth fighting over
 */
export const HARVESTER_GENERATOR_COUNT = 5;

/**
 * Size of each Dark Matter Generator building (tiles × tiles).
 * Must fit on the Harvester grid.
 */
export const HARVESTER_GENERATOR_SIZE = 5;

// =============================================================================
// SPAWN POSITIONING
// =============================================================================

/**
 * Distance range from black hole center where Harvesters can spawn.
 * Measured in world map units (pixels).
 * 
 * Note: Should be within probe detection range so players can discover them.
 */
export const HARVESTER_SPAWN_DISTANCE = {
    min: 100,   // Minimum distance from black hole center
    max: 200,   // Maximum distance (should be < probe range of 150 for discoverability)
};

// =============================================================================
// STARTING RESOURCES
// =============================================================================

/**
 * Resources available to loot when conquering an uncaptured Harvester.
 * These are one-time rewards for the first capture.
 * 
 * GAMEPLAY IMPACT:
 * - Higher values = big payday for successful conquest, incentivizes attack
 * - Lower values = less immediate reward, focus is on long-term Dark Matter income
 */
export const HARVESTER_INITIAL_RESOURCES = {
    carbon: 10000,
    titanium: 10000,
    food: 50000,
    credits: 5000,
};

// =============================================================================
// DEFENSE GARRISON
// =============================================================================

/**
 * Exponent for unit count scaling. Total units = baseCount × (level ^ exponent)
 * 
 * EXAMPLE at exponent=1.5, level=50:
 * - Scaling factor = 50^1.5 ≈ 354
 * - Marines = 100 × 354 = ~35,400 marines
 * 
 * GAMEPLAY IMPACT:
 * - Higher exponent = exponentially harder at high levels
 * - Lower exponent = more linear scaling, easier to predict difficulty
 */
export const HARVESTER_UNIT_SCALING_EXPONENT = 1.5;

/**
 * Base unit counts before level scaling is applied.
 * Final count = base × (level ^ scalingExponent)
 * 
 * These determine the composition of the defending garrison.
 * 
 * GAMEPLAY IMPACT:
 * - Adjust ratios to favor different faction counters
 * - Higher elite counts (commando, ravager) = requires better troops to beat
 * - More balanced mix = flexible counter-play options
 */
export const HARVESTER_BASE_UNITS: Record<string, number> = {
    // Human faction
    marine: 100,        // Melee infantry
    ranger: 60,         // Ranged support (NOTE: 'ranger' may need to be 'sniper' based on unitData)
    sentinel: 40,       // Heavy defense
    commando: 20,       // Elite attacker

    // Mech faction
    drone: 80,          // Cheap scouts
    automaton: 50,      // Melee bots
    interceptor: 15,    // Elite assault craft

    // Exo faction
    stalker: 70,        // Fast melee predator
    spitter: 45,        // Ranged acid
    brute: 30,          // Heavy tank
    ravager: 10,        // Apex predator
};

/**
 * How the garrison is distributed across the 3 defense lanes.
 * Must sum to 1.0 (100%).
 * 
 * GAMEPLAY IMPACT:
 * - Heavier front = center lane is the hard fight, flanks are easier
 * - Even distribution = all lanes equally challenging
 */
export const HARVESTER_LANE_DISTRIBUTION = {
    front: 0.4,     // 40% of units in center lane
    left: 0.3,      // 30% in left flank
    right: 0.3,     // 30% in right flank
};

// =============================================================================
// BLACK HOLES
// =============================================================================

/**
 * Default black hole positions when seeding the galaxy.
 * Each black hole gets one Harvester spawned nearby.
 * 
 * Positions are in world map coordinates.
 * Radius affects the visual size and danger zone.
 */
export const DEFAULT_BLACK_HOLES = [
    { x: 5000, y: 5000, radius: 300 },  // Center of 10000×10000 map
];

/**
 * Minimum distance from other planets when spawning Harvesters.
 * Prevents overlap with player colonies.
 */
export const HARVESTER_MIN_PLANET_DISTANCE = 50;

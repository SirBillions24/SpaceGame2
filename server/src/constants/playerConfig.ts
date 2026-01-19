/**
 * Player Configuration
 * 
 * All tunable constants related to player progression, economy, and starting conditions.
 * Adjust these values to balance the new player experience and economy without touching logic code.
 */

// =============================================================================
// STARTING CONDITIONS
// =============================================================================

/**
 * Units given to every new player when they spawn their first planet.
 * 
 * GAMEPLAY IMPACT:
 * - Higher counts = easier early game, players can attack NPCs sooner
 * - Lower counts = harder early game, encourages building economy first
 * - Unit mix affects what strategies new players can pursue
 */
export const STARTING_UNITS: Record<string, number> = {
    marine: 10,     // Basic starting force
};

/**
 * Starting planet grid size (tiles × tiles).
 * Determines how much building space new players have.
 * 
 * GAMEPLAY IMPACT:
 * - Smaller grid = forces expansion purchases sooner, slows early growth
 * - Larger grid = more building freedom early, faster early scaling
 */
export const STARTING_GRID_SIZE = {
    x: 10,
    y: 10,
};

/**
 * Base storage capacity for all planets (before Storage Depot bonuses).
 * Resources stop accumulating when this cap is hit.
 * 
 * GAMEPLAY IMPACT:
 * - Lower cap = forces players to spend or expand storage more often
 * - Higher cap = more flexibility for saving up before big purchases
 */
export const BASE_STORAGE_CAPACITY = 1000;

// =============================================================================
// PROGRESSION SYSTEM
// =============================================================================

/**
 * XP curve formula: Required XP = baseXp × (level ^ exponent)
 * 
 * EXAMPLES at exponent=2, baseXp=100:
 * - Level 1→2: 100 XP needed
 * - Level 5→6: 2,500 XP needed  
 * - Level 10→11: 10,000 XP needed
 * 
 * GAMEPLAY IMPACT:
 * - Higher baseXp = slower overall progression
 * - Higher exponent = much steeper curve at high levels (punishes high-level players)
 * - Lower exponent = more linear, high-level progression feels similar to early game
 */
export const XP_CURVE = {
    baseXp: 100,
    exponent: 2,
};

// =============================================================================
// ECONOMY - TAXES & CREDITS
// =============================================================================

/**
 * Default tax rate (%) for new planets.
 * Tax rate affects credit income and public order (stability).
 */
export const DEFAULT_TAX_RATE = 10;

/**
 * Credits earned per population point per hour = population × (taxRate/100) × this
 * 
 * EXAMPLE: 100 population at 10% tax = 100 × 0.10 × 5 = 50 credits/hour
 * 
 * GAMEPLAY IMPACT:
 * - Higher value = credits flow faster, military buildup is quicker
 * - Lower value = credits are scarce, forces careful spending
 */
export const CREDITS_PER_POPULATION = 5;

/**
 * Stability penalty from taxes = taxRate × this
 * Higher taxes hurt public order (productivity).
 * 
 * EXAMPLE: 20% tax = 20 × 2 = 40 stability penalty
 * 
 * GAMEPLAY IMPACT:
 * - Higher multiplier = heavy tax penalty, players can't rely on high taxes
 * - Lower multiplier = players can use high taxes with minimal consequence
 */
export const TAX_STABILITY_PENALTY_MULTIPLIER = 2;

// =============================================================================
// STABILITY/PRODUCTIVITY FORMULA
// =============================================================================

/**
 * How stability (public order) affects production output.
 * 
 * POSITIVE stability: productivity = √(publicOrder) × positiveMultiplier + 100
 * NEGATIVE stability: productivity = 100 × (100 / (100 + negativeMultiplier × √|publicOrder|))
 * 
 * GAMEPLAY IMPACT:
 * - Higher positiveMultiplier = big reward for happy population, encourages decorations
 * - Higher negativeMultiplier = harsh penalty for unhappy population, punishes overcrowding
 */
export const STABILITY_FORMULA = {
    baseProductivity: 100,       // 100% is "normal" production rate
    positiveMultiplier: 2,       // Bonus scaling when stability is positive
    negativeMultiplier: 2,       // Penalty scaling when stability is negative
};

// =============================================================================
// BUILDING OPERATIONS
// =============================================================================

/**
 * Refund percentage when demolishing a building.
 * 0.10 = 10% of the building's cost is returned.
 * 
 * GAMEPLAY IMPACT:
 * - Higher refund = more forgiving, players can experiment with layouts
 * - Lower refund = punishes bad planning, makes demolition costly
 */
export const DEMOLISH_REFUND_RATE = 0.10;

/**
 * Time to demolish as a fraction of original build time.
 * 0.5 = demolition takes 50% as long as construction.
 * 
 * GAMEPLAY IMPACT:
 * - Higher rate = slower demolition, removes urgency
 * - Lower rate = quick teardowns, fast restructuring
 */
export const DEMOLISH_TIME_RATE = 0.50;

// =============================================================================
// ADMIRAL SYSTEM
// =============================================================================

/**
 * Maximum character length for admiral names.
 */
export const ADMIRAL_NAME_MAX_LENGTH = 50;

/**
 * Caps on gear bonus stacking for admirals.
 * Prevents gear from making admirals too overpowered.
 * 
 * GAMEPLAY IMPACT:
 * - Higher caps = legendary gear becomes extremely powerful, widens power gap
 * - Lower caps = gear matters less, skill/strategy matters more
 */
export const GEAR_BONUS_CAPS = {
    meleeStrengthMax: 100,          // +100% max melee damage boost
    rangedStrengthMax: 100,         // +100% max ranged damage boost
    canopyReductionMax: -100,       // -100% max wall bypass (100% = ignores walls completely)
};

// =============================================================================
// POSITION GENERATION
// =============================================================================

/**
 * Maximum attempts to find a valid spawn position for new planets.
 * Higher = less likely to fail finding a spot, but slower.
 */
export const MAX_SPAWN_ATTEMPTS = 200;

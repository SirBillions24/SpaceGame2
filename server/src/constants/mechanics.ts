/**
 * Core Game Mechanics Constants
 * 
 * This file contains fundamental gameplay constants that affect combat, economy,
 * building, and fleet operations. These are the most frequently tweaked values.
 */

// =============================================================================
// COMBAT SLOT LIMITS
// =============================================================================

/**
 * Maximum units per wave in each attack lane.
 * Limits how much force can be concentrated in a single wave.
 * 
 * GAMEPLAY IMPACT:
 * - Higher caps = allows bigger waves, favors attackers with large armies
 * - Lower caps = forces more waves, gives defenders more reaction opportunities
 */
export const ATTACK_SLOT_CAP_FLANK = 40;   // Left and Right lanes
export const ATTACK_SLOT_CAP_CENTER = 50;  // Center lane (main assault)

// =============================================================================
// RESOURCE PRODUCTION
// =============================================================================

/**
 * Base resource production per hour that all planets have.
 * This is added BEFORE building production is calculated.
 * 
 * GAMEPLAY IMPACT:
 * - Higher base = passive income matters more, reduces grind
 * - Lower base = forces players to build production buildings immediately
 */
export const BASE_PRODUCTION = 100;

// =============================================================================
// DEFENSE TURRET SYSTEM
// =============================================================================

/**
 * Troop capacity provided by each turret level.
 * Total capacity = sum of all turret capacities.
 * Units across all 3 lanes cannot exceed this total.
 * 
 * GAMEPLAY IMPACT:
 * - Higher capacities = more defensive troops allowed, favors turtling
 * - Lower capacities = attackers face smaller garrisons, offensive meta
 */
export const DEFENSE_TURRET_CAPACITY: Record<number, number> = {
    1: 10,   // Level 1 turret adds 10 slots
    2: 20,   // Level 2 turret adds 20 slots
    3: 30,   // Level 3 turret adds 30 slots
    4: 40,   // Level 4 turret adds 40 slots
};

/**
 * Maximum number of turrets per planet (even after full grid expansion).
 */
export const MAX_DEFENSE_TURRETS = 20;

/**
 * Base turret construction costs (multiplied by turret level).
 * Final cost = base × level × turretCountMultiplier
 */
export const DEFENSE_TURRET_BASE_COST_CARBON = 500;
export const DEFENSE_TURRET_BASE_COST_TITANIUM = 250;

/**
 * Cost scaling per existing turret.
 * Each turret owned increases the cost of the next one.
 * 
 * Formula: cost = baseCost × level × (1 + existingTurrets × this)
 * 
 * EXAMPLE with 5 existing turrets, value 0.1:
 * Next turret costs 1.5x base (1 + 5×0.1 = 1.5)
 * 
 * GAMEPLAY IMPACT:
 * - Higher value = heavy discount on first turrets, expensive to max out
 * - Lower value = more linear cost scaling
 */
export const DEFENSE_TURRET_COUNT_SCALING = 0.1;

/**
 * Legacy cost multiplier - use DEFENSE_TURRET_COUNT_SCALING instead.
 * @deprecated
 */
export const DEFENSE_TURRET_COST_MULTIPLIER = 1.5;

/**
 * Time to build each turret (in seconds).
 */
export const DEFENSE_TURRET_BUILD_TIME_SECONDS = 60;

// =============================================================================
// PLANET EXPANSION
// =============================================================================

/**
 * Grid size limits for planet building area.
 * Grid expands in increments of 10.
 */
export const MAX_GRID_SIZE = 50;  // Maximum 50×50 tiles
export const MIN_GRID_SIZE = 10;  // Starting 10×10 tiles

/**
 * Base cost to expand the planet grid.
 * Cost increases with each expansion.
 * 
 * Formula: cost = baseCost × (multiplier ^ expansionNumber)
 * 
 * EXAMPLE with multiplier 1.5:
 * - 1st expansion (10→20): 1000 carbon, 500 titanium
 * - 2nd expansion (20→30): 1500 carbon, 750 titanium
 * - 3rd expansion (30→40): 2250 carbon, 1125 titanium
 */
export const EXPANSION_BASE_COST_CARBON = 1000;
export const EXPANSION_BASE_COST_TITANIUM = 500;

/**
 * How much expansion costs increase per expansion.
 * 1.5 = 50% more expensive each time.
 * 
 * GAMEPLAY IMPACT:
 * - Higher multiplier = early expansions cheap, later ones very expensive
 * - Lower multiplier = more predictable/linear expansion costs
 */
export const EXPANSION_COST_MULTIPLIER = 1.5;

// =============================================================================
// WORKFORCE ECONOMY
// =============================================================================

/**
 * Workers needed to run a production building at full efficiency.
 * Formula: required = baseRequirement + (buildingLevel - 1) × perLevel
 * 
 * EXAMPLE for Level 5 building:
 * Required = 3 + (5-1) × 2 = 11 workers
 */
export const BASE_STAFFING_REQUIREMENT = 3;
export const STAFFING_PER_LEVEL = 2;

/**
 * Maximum bonus from having more workers than required.
 * 0.20 = up to 20% production bonus from overstaffing.
 * 
 * GAMEPLAY IMPACT:
 * - Higher cap = big reward for surplus population, encourages housing spam
 * - Lower cap = less benefit from excess population
 */
export const OVERSTAFFING_BONUS_CAP = 0.20;

/**
 * Minimum production when understaffed.
 * 0.25 = buildings always produce at least 25% even with no workers.
 * 
 * GAMEPLAY IMPACT:
 * - Higher minimum = understaffing is forgiving, less punishing for new players
 * - Lower minimum = harsh penalty for not having enough workers
 */
export const UNDERSTAFFED_MINIMUM = 0.25;

// =============================================================================
// FLEET MOVEMENT
// =============================================================================

/**
 * Base speed for fleet travel across the galaxy map.
 * Measured in world map pixels per second.
 * 
 * GAMEPLAY IMPACT:
 * - Higher speed = faster attacks, more reactive gameplay
 * - Lower speed = longer travel times, more strategic planning required
 */
export const BASE_FLEET_SPEED = 50;

/**
 * Minimum time for any fleet to arrive (in seconds).
 * Prevents instant attacks on very close targets.
 */
export const MIN_TRAVEL_TIME = 5;

/**
 * Speed multiplier for espionage probes.
 * 1.5 = probes travel 50% faster than combat fleets.
 * 
 * GAMEPLAY IMPACT:
 * - Higher multiplier = scouts give early warning much faster
 * - Lower multiplier = probes not much faster, less time to react to intel
 */
export const PROBE_SPEED_MULTIPLIER = 1.5;

// =============================================================================
// STABILITY (Legacy - use playerConfig.ts STABILITY_FORMULA instead)
// =============================================================================

export const BASE_STABILITY = 0;
export const TAX_EFFICIENCY_FACTOR = 1;

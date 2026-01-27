/**
 * Capital Ship Configuration
 * 
 * All tunable values for the Capital Ship forward attack platform system.
 * Adjust these for balance without touching service code.
 */

// =============================================================================
// MAIN CONFIGURATION
// =============================================================================

export const CAPITAL_SHIP_CONFIG = {
    // ========================================================================
    // BUILDING REQUIREMENT
    // ========================================================================
    building: {
        /** Building type required to unlock Capital Ship construction */
        type: 'capital_shipyard',

        /** Minimum building level to unlock first Capital Ship */
        minLevel: 1,

        /** Each level unlocks this many additional Capital Ship slots */
        slotsPerLevel: 1,

        /** Maximum slots even with max level (0 = unlimited by building level) */
        maxSlots: 0,
    },

    // ========================================================================
    // CONSTRUCTION (Initial Build)
    // ========================================================================
    construction: {
        /** Total resources required to build a Capital Ship */
        totalCost: {
            carbon: 10000,      // For testing - increase for production
            titanium: 10000,    // For testing - increase for production
            darkMatter: 50,     // For testing - increase for production
        },

        /** Number of donation phases to complete construction */
        donationPhases: 3,

        /** Minimum delay (minutes) between donation phases (0 = no cooldown) */
        phaseDelayMinutes: 0,

        // Total minimum build time = 3 phases * 0 min = instant (for testing)
    },

    // ========================================================================
    // TRAVEL SPEED
    // ========================================================================
    travel: {
        /**
         * Speed multiplier relative to BASE_FLEET_SPEED.
         * Lower = slower. 0.4 means 40% of normal fleet speed.
         * 
         * BALANCE NOTE: Capital Ships are massive, should move slowly.
         * At 0.4x with BASE_FLEET_SPEED=50, speed is 20 units/second.
         * Cross-map (5000 units) would take ~4+ minutes.
         */
        speedMultiplier: 0.4,
    },

    // ========================================================================
    // DEPLOYMENT COMMITMENT
    // ========================================================================
    deployment: {
        /**
         * Available commitment duration options in days.
         * Scalable array - add/remove options as needed.
         */
        commitmentOptions: [1, 3, 7],

        /**
         * Travel time reduction for fleets launching near the Capital Ship.
         * 0.35 = 35% faster travel from Capital Ship's position.
         */
        travelTimeReduction: 0.35,

        /**
         * Radius (map units) around Capital Ship where bonus applies.
         * Fleets must launch from within this radius to get bonus.
         * 
         * BALANCE NOTE: Map is 10000x10000. 1500 is a significant region.
         */
        effectRadius: 1500,
    },

    // ========================================================================
    // COMBAT STATS
    // ========================================================================
    combat: {
        /** Base hit points for the Capital Ship */
        baseHp: 150000,

        /**
         * Base garrison units aboard the Capital Ship.
         * Defends when attacked using 3-lane combat system.
         */
        baseGarrison: {
            marine: 300,
            sentinel: 150,
            automaton: 75,
            interceptor: 25,
        },

        /**
         * Whether players can add their own units to garrison.
         * If true, garrison is augmented by player units.
         */
        allowPlayerGarrison: true,

        /** Maximum additional units players can add to garrison */
        maxPlayerGarrisonUnits: 500,
    },

    // ========================================================================
    // GARRISON CAPACITY (Player Loaded Troops/Tools)
    // ========================================================================
    garrison: {
        /** Maximum troops that can be loaded onto Capital Ship (upgrade via building later) */
        baseTroopCapacity: 5000,

        /** Maximum tools that can be loaded onto Capital Ship (upgrade via building later) */
        baseToolCapacity: 500,
    },

    // ========================================================================
    // CARGO STORAGE (Resource Storage for Loot)
    // ========================================================================
    cargo: {
        /** Base storage capacity for each resource type */
        baseCapacity: {
            carbon: 10000,
            titanium: 10000,
            food: 10000,
        },

        /**
         * Capacity growth per building level (upgrade potential).
         * Each level of capital_shipyard adds this multiplier to storage.
         * 0.25 = +25% per level after level 1.
         */
        capacityGrowthPerLevel: 0.25,
    },

    // ========================================================================
    // DESTRUCTION & REPAIR
    // ========================================================================
    destruction: {
        /**
         * Cooldown period (hours) after destruction before repair can begin.
         * During cooldown, no actions can be taken.
         */
        cooldownHours: 24,

        /**
         * Repair cost as percentage of original construction cost.
         * 0.6 = 60% of original cost to repair.
         */
        repairCostMultiplier: 0.6,

        /**
         * Number of donation phases for repair (same structure as construction).
         */
        repairPhases: 2,

        /** Minimum delay (minutes) between repair donation phases (0 = no cooldown) */
        repairPhaseDelayMinutes: 0,
    },

    // ========================================================================
    // HP REPAIR (Resource donation to heal damage)
    // ========================================================================
    hpRepair: {
        /**
         * Cost multiplier relative to construction cost for full HP repair.
         * 0.6 = 60% of construction cost to fully heal from 0 to max HP.
         * Actual cost is proportional to missing HP.
         */
        costMultiplier: 0.6,

        /**
         * Resources used for HP repair (from construction cost).
         * Dark matter is excluded - only basic resources needed.
         */
        excludeResources: ['darkMatter'],

        /**
         * Passive healing rate per hour (as fraction of max HP).
         * 0.005 = 0.5% per hour = ~8 days to fully heal passively.
         * Set to 0 to disable passive healing.
         */
        passiveHealingRate: 0.005,

        /**
         * Ship must be in one of these statuses to receive passive healing.
         */
        passiveHealingStatuses: ['ready', 'deployed'],
    },
};

// =============================================================================
// PHASE-BASED DEFENSE UNLOCKS
// =============================================================================

/**
 * Defense bonuses unlocked at each construction phase.
 * 
 * Phase 1 (Airframe): Can deploy but no defenses (glass cannon)
 * Phase 2 (Systems):  Full shield array, hub, debris field bonuses
 * Phase 3 (Battlements): Troop capacity for 3-flank defense
 * 
 * canopy/hub/minefield values are used as building levels in resolveWaveCollision:
 *   - canopy level 4 = 90% bonus
 *   - hub level 3 = 3×35% = 105%
 *   - minefield level 10 = 10×10% = 100%
 */
export const CAPITAL_SHIP_PHASE_BONUSES: Record<number, {
    canopy: number;
    hub: number;
    minefield: number;
    troopCapacity: number;
}> = {
    0: { canopy: 0, hub: 0, minefield: 0, troopCapacity: 0 },  // Not yet deployable
    1: { canopy: 0, hub: 0, minefield: 0, troopCapacity: 0 },  // Glass cannon
    2: { canopy: 4, hub: 3, minefield: 10, troopCapacity: 0 }, // Full defenses
    3: { canopy: 4, hub: 3, minefield: 10, troopCapacity: 100 }, // + Troop capacity
};

/**
 * Get defense bonuses for a given completed phase
 */
export function getPhaseDefenseBonuses(completedPhase: number) {
    return CAPITAL_SHIP_PHASE_BONUSES[completedPhase] || CAPITAL_SHIP_PHASE_BONUSES[0];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validate that the given days value is a valid commitment option
 */
export function isValidCommitmentDays(days: number): boolean {
    return CAPITAL_SHIP_CONFIG.deployment.commitmentOptions.includes(days);
}

/**
 * Get the cost for a specific donation phase
 * @param phase Current phase number (1-indexed)
 * @param isRepair Whether this is a repair (true) or initial construction (false)
 */
export function getPhaseCost(phase: number, isRepair: boolean = false): Record<string, number> {
    const config = CAPITAL_SHIP_CONFIG;
    const phases = isRepair
        ? config.destruction.repairPhases
        : config.construction.donationPhases;
    const multiplier = isRepair
        ? config.destruction.repairCostMultiplier
        : 1;

    const cost: Record<string, number> = {};
    for (const [resource, amount] of Object.entries(config.construction.totalCost)) {
        cost[resource] = Math.ceil((amount * multiplier) / phases);
    }
    return cost;
}

/**
 * Get the total cost for construction or repair
 */
export function getTotalCost(isRepair: boolean = false): Record<string, number> {
    const config = CAPITAL_SHIP_CONFIG;
    const multiplier = isRepair
        ? config.destruction.repairCostMultiplier
        : 1;

    const cost: Record<string, number> = {};
    for (const [resource, amount] of Object.entries(config.construction.totalCost)) {
        cost[resource] = Math.ceil(amount * multiplier);
    }
    return cost;
}

/**
 * Calculate travel time for a Capital Ship based on distance
 */
export function calculateCapitalShipTravelTime(
    distance: number,
    baseFleetSpeed: number
): number {
    const speed = baseFleetSpeed * CAPITAL_SHIP_CONFIG.travel.speedMultiplier;
    return Math.ceil(distance / speed);
}

/**
 * Calculate resource cost to repair HP damage.
 * Cost is proportional to missing HP, scaled by costMultiplier.
 * Dark matter and other excluded resources are not required.
 * 
 * @param missingHp Amount of HP missing (maxHp - currentHp)
 * @param maxHp Maximum HP of the ship
 * @returns Resource cost to repair the given HP
 */
export function getHpRepairCost(missingHp: number, maxHp: number): Record<string, number> {
    const config = CAPITAL_SHIP_CONFIG;
    const hpRatio = missingHp / maxHp;
    const cost: Record<string, number> = {};

    for (const [resource, amount] of Object.entries(config.construction.totalCost)) {
        // Skip excluded resources (like dark matter)
        if (config.hpRepair.excludeResources.includes(resource)) {
            continue;
        }
        // Cost = construction_amount * hp_ratio * cost_multiplier
        cost[resource] = Math.ceil(amount * hpRatio * config.hpRepair.costMultiplier);
    }

    return cost;
}

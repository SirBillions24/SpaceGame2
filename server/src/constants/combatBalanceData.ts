/**
 * Combat Balance Configuration
 * 
 * All tunable combat constants in one place.
 * Adjust these values to balance combat without touching logic code.
 */

// =============================================================================
// FACTION TRIANGLE
// =============================================================================

export const FACTION_TRIANGLE = {
    /**
     * Faction advantage bonus (as decimal)
     * Human > Mech > Exo > Human
     * 0.25 = 25% damage bonus when counter-picking
     */
    bonus: 0.25,

    /**
     * Faction advantage relationships
     * Key faction beats value faction
     */
    advantages: {
        human: 'mech',  // Humans exploit mechanical weaknesses
        mech: 'exo',    // Mechs are programmed to counter alien biology
        exo: 'human',   // Exos naturally prey on organic humans
    } as Record<string, string>,
};

// =============================================================================
// COMBAT MODIFIERS
// =============================================================================

export const COMBAT_MODIFIERS = {
    /**
     * Victory dampener - winner takes reduced casualties
     * 0.5 = winner takes 50% of calculated casualty rate
     */
    victoryDampener: 0.5,

    /**
     * Surface invasion bonuses based on sector wins
     */
    surface: {
        attackerAllSectorsBonus: 0.30,   // +30% for winning all 3 sectors
        defenderTwoSectorsBonus: 0.30,   // +30% for defender holding 2
        defenderAllSectorsBonus: 0.50,   // +50% for defender holding all 3
    },
};

// =============================================================================
// DEFENSE BUILDING BONUSES
// =============================================================================

export const DEFENSE_BONUSES = {
    /**
     * Docking Hub (Gate) bonus per level - Center sector only
     */
    dockingHubPerLevel: 0.35,

    /**
     * Orbital Minefield (Moat) bonus per level
     */
    orbitalMinefieldPerLevel: 0.10,

    /**
     * Energy Canopy bonuses are defined in buildingData.ts (defenseBonus field)
     * Levels 1-4: 30%, 50%, 70%, 90%
     */
};

// =============================================================================
// TOOL EFFECTIVENESS CAPS
// =============================================================================

export const TOOL_CAPS = {
    /**
     * Maximum reduction any tool type can apply (100% = completely negated)
     */
    maxCanopyReduction: 1.0,
    maxHubReduction: 1.0,
    maxRangedReduction: 1.0,
};

// =============================================================================
// TYPES
// =============================================================================

export type Faction = 'human' | 'mech' | 'exo';

/**
 * Check if sourceFaction has advantage over targetFaction
 */
export function hasAdvantage(sourceFaction: Faction, targetFaction: Faction): boolean {
    return FACTION_TRIANGLE.advantages[sourceFaction] === targetFaction;
}

/**
 * Get the faction bonus multiplier (1.0 + bonus if advantage, 1.0 otherwise)
 */
export function getFactionMultiplier(sourceFaction: Faction, targetFaction: Faction): number {
    return hasAdvantage(sourceFaction, targetFaction) ? 1.0 + FACTION_TRIANGLE.bonus : 1.0;
}

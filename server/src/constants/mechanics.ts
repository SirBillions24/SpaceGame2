
// Mechanics Constants for Galactic Conquest (GGE Clone)

// 1. UNIT STATS (Upkeep)
// Upkeep measured in Food per hour.
export const UNIT_STATS: Record<string, { upkeep: number }> = {
    // Infantry
    'marine': { upkeep: 4 },      // Standard
    'ranger': { upkeep: 3 },      // Light
    'sentinel': { upkeep: 6 },    // Heavy

    // Fleet / Vehicles (Future)
    'interceptor': { upkeep: 10 },
    'cruiser': { upkeep: 50 },
};

// 2. HOUSING & POPULATION
export const DWELLING_CAPACITY = {
    1: 5,
    2: 10,
    3: 18,
    4: 29,
    5: 42,
    6: 58,
    7: 77,
    8: 98,
    9: 121,
    10: 158, // Lvl 10 jump
    11: 199,
    12: 242  // Max (approx GGE 85 * 3 sci-fi scaling?) 
    // GGE Lvl 12 Dwelling = 85 pop. 
    // Let's stick closer to GGE for balance or scale?
    // User said "sci-fi theming" but mechanics doc says "Max 85". 
    // Let's use EXACT GGE values for safety to start.
};

export const DWELLING_STATS_GGE: Record<number, { pop: number, poPenalty: number }> = {
    1: { pop: 3, poPenalty: 10 },
    2: { pop: 5, poPenalty: 15 },
    3: { pop: 8, poPenalty: 20 },
    4: { pop: 11, poPenalty: 25 },
    5: { pop: 13, poPenalty: 30 },
    6: { pop: 16, poPenalty: 35 },
    7: { pop: 19, poPenalty: 40 },
    8: { pop: 21, poPenalty: 45 },
    9: { pop: 23, poPenalty: 50 },
    10: { pop: 37, poPenalty: 60 },
    11: { pop: 41, poPenalty: 75 },
    12: { pop: 43, poPenalty: 85 } // Doc says 43? Wait, Doc says "Max Population 85 (Level 12)" in Overview, but table says 43. 
    // "Total growth: 10 to 85". 
    // Keep it consistent with Table for now, or use the 85 figure?
    // Let's use the Table values (Lines 41-52 in Dwelling.md) which say Lvl 12 = 43 Pop.
    // Wait, line 10 says "Max Population per Building: 85 (Level 12)". 
    // Table line 52 says: "Level 12 ... 43 Pop". 
    // Contradiction in doc. I will trust the Table for progression curve.
};

// 3. PUBLIC ORDER
export const BASE_STABILITY = 0; // Neutral
export const TAX_EFFICIENCY_FACTOR = 1; // Basic multiplier

// 4. COMBAT / TOOLS (Reference)
export const ATTACK_SLOT_CAP_FLANK = 40;
export const ATTACK_SLOT_CAP_CENTER = 50;

// 5. RESOURCE PRODUCTION
export const BASE_PRODUCTION = 100;

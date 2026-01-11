
// server/src/constants/buildingData.ts

export interface BuildingLevelStats {
    level: number;
    requiredPlayerLevel: number;
    cost: {
        carbon: number;
        titanium: number;
        credits?: number;
        darkMatter?: number;
    };
    production?: number;
    population?: number;
    stability?: number;
    storage?: number;
    defenseBonus?: number; // New: Percentage defense bonus for Defensive Grid
    recruitmentSpeedBonus?: number; // New: Percentage bonus to recruitment speed
    time: number; // in seconds
    xp: number;
}

export interface BuildingTypeStats {
    type: string;
    name: string;
    size: number;
    category: 'civil' | 'military' | 'decoration';
    nonConstructable?: boolean;
    levels: Record<number, BuildingLevelStats>;
}

export const BUILDING_DATA: Record<string, BuildingTypeStats> = {
    carbon_processor: {
        type: 'carbon_processor',
        name: 'Carbon Processor',
        size: 3,
        category: 'civil',
        levels: {
            1: { level: 1, requiredPlayerLevel: 1, cost: { carbon: 13, titanium: 0 }, production: 8, time: 2, xp: 2 },
            2: { level: 2, requiredPlayerLevel: 1, cost: { carbon: 50, titanium: 20 }, production: 13, time: 9, xp: 4 },
            3: { level: 3, requiredPlayerLevel: 8, cost: { carbon: 142, titanium: 76 }, production: 18, time: 300, xp: 6 },
            4: { level: 4, requiredPlayerLevel: 12, cost: { carbon: 441, titanium: 441 }, production: 23, time: 2250, xp: 10 },
            5: { level: 5, requiredPlayerLevel: 16, cost: { carbon: 736, titanium: 900 }, production: 28, time: 3600, xp: 12 },
            6: { level: 6, requiredPlayerLevel: 20, cost: { carbon: 1031, titanium: 1547 }, production: 34, time: 5400, xp: 14 },
            7: { level: 7, requiredPlayerLevel: 24, cost: { carbon: 1467, titanium: 2725 }, production: 41, time: 7200, xp: 16 },
            8: { level: 8, requiredPlayerLevel: 29, cost: { carbon: 1818, titanium: 4243 }, production: 48, time: 10800, xp: 20 },
            9: { level: 9, requiredPlayerLevel: 33, cost: { carbon: 2483, titanium: 5795 }, production: 56, time: 14400, xp: 22 },
            10: { level: 10, requiredPlayerLevel: 37, cost: { carbon: 11760, titanium: 14880 }, production: 63, time: 28800, xp: 25 },
            11: { level: 11, requiredPlayerLevel: 43, cost: { carbon: 49880, titanium: 56120 }, production: 72, time: 86400, xp: 30 },
        }
    },
    titanium_extractor: {
        type: 'titanium_extractor',
        name: 'Titanium Extractor',
        size: 3,
        category: 'civil',
        levels: {
            1: { level: 1, requiredPlayerLevel: 2, cost: { carbon: 14, titanium: 0 }, production: 8, time: 5, xp: 2 },
            2: { level: 2, requiredPlayerLevel: 2, cost: { carbon: 20, titanium: 10 }, production: 13, time: 6, xp: 5 },
            3: { level: 3, requiredPlayerLevel: 9, cost: { carbon: 236, titanium: 79 }, production: 18, time: 390, xp: 7 },
            4: { level: 4, requiredPlayerLevel: 13, cost: { carbon: 799, titanium: 342 }, production: 23, time: 2250, xp: 11 },
            5: { level: 5, requiredPlayerLevel: 17, cost: { carbon: 1262, titanium: 680 }, production: 28, time: 3600, xp: 13 },
            6: { level: 6, requiredPlayerLevel: 21, cost: { carbon: 1920, titanium: 1280 }, production: 34, time: 5400, xp: 15 },
            7: { level: 7, requiredPlayerLevel: 26, cost: { carbon: 2767, titanium: 2264 }, production: 41, time: 7200, xp: 19 },
            8: { level: 8, requiredPlayerLevel: 30, cost: { carbon: 3743, titanium: 3062 }, production: 48, time: 10800, xp: 21 },
            9: { level: 9, requiredPlayerLevel: 34, cost: { carbon: 5298, titanium: 4335 }, production: 56, time: 14400, xp: 23 },
            10: { level: 10, requiredPlayerLevel: 38, cost: { carbon: 14715, titanium: 11145 }, production: 63, time: 28800, xp: 26 },
            11: { level: 11, requiredPlayerLevel: 44, cost: { carbon: 56110, titanium: 49920 }, production: 72, time: 86400, xp: 31 },
        }
    },
    hydroponics: {
        type: 'hydroponics',
        name: 'Hydroponics',
        size: 3,
        category: 'civil',
        levels: {
            1: { level: 1, requiredPlayerLevel: 2, cost: { carbon: 30, titanium: 0 }, production: 16, time: 5, xp: 3 },
            2: { level: 2, requiredPlayerLevel: 2, cost: { carbon: 107, titanium: 19 }, production: 24, time: 6, xp: 5 },
            3: { level: 3, requiredPlayerLevel: 9, cost: { carbon: 236, titanium: 79 }, production: 32, time: 390, xp: 7 },
            4: { level: 4, requiredPlayerLevel: 14, cost: { carbon: 791, titanium: 426 }, production: 40, time: 2250, xp: 11 },
            5: { level: 5, requiredPlayerLevel: 18, cost: { carbon: 1256, titanium: 838 }, production: 48, time: 3600, xp: 13 },
            6: { level: 6, requiredPlayerLevel: 22, cost: { carbon: 1949, titanium: 1595 }, production: 56, time: 5400, xp: 16 },
            7: { level: 7, requiredPlayerLevel: 27, cost: { carbon: 2630, titanium: 2630 }, production: 64, time: 7200, xp: 19 },
            8: { level: 8, requiredPlayerLevel: 31, cost: { carbon: 3295, titanium: 4028 }, production: 72, time: 10800, xp: 21 },
            9: { level: 9, requiredPlayerLevel: 35, cost: { carbon: 3977, titanium: 5965 }, production: 80, time: 14400, xp: 23 },
            10: { level: 10, requiredPlayerLevel: 40, cost: { carbon: 5379, titanium: 9990 }, production: 88, time: 28800, xp: 29 },
        }
    },
    housing_unit: {
        type: 'housing_unit',
        name: 'Housing Unit',
        size: 3,
        category: 'civil',
        levels: {
            1: { level: 1, requiredPlayerLevel: 3, cost: { carbon: 20, titanium: 10 }, population: 10, stability: -10, time: 4, xp: 3 },
            2: { level: 2, requiredPlayerLevel: 8, cost: { carbon: 79, titanium: 47 }, population: 15, stability: -15, time: 5, xp: 5 },
            3: { level: 3, requiredPlayerLevel: 10, cost: { carbon: 277, titanium: 166 }, population: 20, stability: -20, time: 900, xp: 8 },
            4: { level: 4, requiredPlayerLevel: 14, cost: { carbon: 707, titanium: 636 }, population: 25, stability: -25, time: 2250, xp: 11 },
            5: { level: 5, requiredPlayerLevel: 19, cost: { carbon: 1107, titanium: 1144 }, population: 30, stability: -30, time: 3600, xp: 13 },
            6: { level: 6, requiredPlayerLevel: 23, cost: { carbon: 1708, titanium: 1995 }, population: 35, stability: -35, time: 4500, xp: 16 },
            7: { level: 7, requiredPlayerLevel: 28, cost: { carbon: 2353, titanium: 3143 }, population: 40, stability: -40, time: 7200, xp: 19 },
            8: { level: 8, requiredPlayerLevel: 32, cost: { carbon: 3066, titanium: 4509 }, population: 45, stability: -45, time: 10800, xp: 21 },
            9: { level: 9, requiredPlayerLevel: 36, cost: { carbon: 3936, titanium: 6317 }, population: 50, stability: -50, time: 14400, xp: 23 },
            10: { level: 10, requiredPlayerLevel: 41, cost: { carbon: 6949, titanium: 12321 }, population: 60, stability: -60, time: 28800, xp: 37 },
            11: { level: 11, requiredPlayerLevel: 46, cost: { carbon: 25279, titanium: 36841 }, population: 75, stability: -75, time: 43200, xp: 41 },
            12: { level: 12, requiredPlayerLevel: 51, cost: { carbon: 54910, titanium: 65840 }, population: 85, stability: -85, time: 86400, xp: 43 },
        }
    },
    naval_academy: {
        type: 'naval_academy',
        name: 'Naval Academy',
        size: 3,
        category: 'military',
        levels: {
            1: { level: 1, requiredPlayerLevel: 10, cost: { carbon: 100, titanium: 100 }, time: 10, xp: 50 },
        }
    },
    orbital_garrison: {
        type: 'orbital_garrison',
        name: 'Orbital Garrison',
        size: 4,
        category: 'military',
        levels: {
            1: { level: 1, requiredPlayerLevel: 1, cost: { carbon: 40, titanium: 20 }, time: 30, xp: 20, recruitmentSpeedBonus: 0.05 },
            2: { level: 2, requiredPlayerLevel: 5, cost: { carbon: 450, titanium: 300 }, time: 120, xp: 50, recruitmentSpeedBonus: 0.10 },
            3: { level: 3, requiredPlayerLevel: 12, cost: { carbon: 1500, titanium: 1000 }, time: 600, xp: 150, recruitmentSpeedBonus: 0.15 },
            4: { level: 4, requiredPlayerLevel: 25, cost: { carbon: 2750, titanium: 3000 }, time: 1800, xp: 400, recruitmentSpeedBonus: 0.20 },
            5: { level: 5, requiredPlayerLevel: 40, cost: { carbon: 4500, titanium: 5500 }, time: 3600, xp: 1000, recruitmentSpeedBonus: 0.25 },
        }
    },
    tavern: {
        type: 'tavern',
        name: 'Intelligence Hub',
        size: 3,
        category: 'military',
        levels: {
            1: { level: 1, requiredPlayerLevel: 7, cost: { carbon: 145, titanium: 95 }, time: 240, xp: 7 },
            2: { level: 2, requiredPlayerLevel: 20, cost: { carbon: 2494, titanium: 2662 }, time: 1800, xp: 24 },
            3: { level: 3, requiredPlayerLevel: 30, cost: { carbon: 5663, titanium: 7947 }, time: 3600, xp: 36 },
            4: { level: 4, requiredPlayerLevel: 65, cost: { carbon: 74980, titanium: 79880 }, time: 14400, xp: 40 },
        }
    },
    defense_workshop: {
        type: 'defense_workshop',
        name: 'Systems Workshop',
        size: 3,
        category: 'military',
        levels: {
            1: { level: 1, requiredPlayerLevel: 5, cost: { carbon: 61, titanium: 30 }, time: 30, xp: 9 },
            2: { level: 2, requiredPlayerLevel: 16, cost: { carbon: 1693, titanium: 1580 }, time: 1200, xp: 35 },
            3: { level: 3, requiredPlayerLevel: 38, cost: { carbon: 8146, titanium: 13623 }, time: 3600, xp: 65 },
        }
    },
    siege_workshop: {
        type: 'siege_workshop',
        name: 'Munitions Factory',
        size: 3,
        category: 'military',
        levels: {
            1: { level: 1, requiredPlayerLevel: 4, cost: { carbon: 118, titanium: 63 }, time: 20, xp: 12 },
            2: { level: 2, requiredPlayerLevel: 17, cost: { carbon: 1975, titanium: 1908 }, time: 1200, xp: 36 },
            3: { level: 3, requiredPlayerLevel: 38, cost: { carbon: 8146, titanium: 13623 }, time: 3600, xp: 65 },
        }
    },
    storage_depot: {
        type: 'storage_depot',
        name: 'Automated Storage Depot',
        size: 3,
        category: 'civil',
        levels: {
            1: { level: 1, requiredPlayerLevel: 3, cost: { carbon: 79, titanium: 42 }, storage: 1700, time: 300, xp: 5 },
            2: { level: 2, requiredPlayerLevel: 10, cost: { carbon: 454, titanium: 332 }, storage: 6000, time: 1200, xp: 10 },
            3: { level: 3, requiredPlayerLevel: 18, cost: { carbon: 1396, titanium: 1396 }, storage: 12500, time: 3600, xp: 15 },
            4: { level: 4, requiredPlayerLevel: 27, cost: { carbon: 3046, titanium: 3967 }, storage: 23000, time: 7200, xp: 20 },
            5: { level: 5, requiredPlayerLevel: 33, cost: { carbon: 4408, titanium: 6630 }, storage: 40000, time: 14400, xp: 25 },
            6: { level: 6, requiredPlayerLevel: 39, cost: { carbon: 5521, titanium: 9418 }, storage: 60000, time: 28800, xp: 30 },
            7: { level: 7, requiredPlayerLevel: 45, cost: { carbon: 11354, titanium: 15387 }, storage: 80000, time: 43200, xp: 35 },
            // Note: Levels 8-9 require tokens/legendary resources, using simplified costs for now
            8: { level: 8, requiredPlayerLevel: 70, cost: { carbon: 50000, titanium: 50000 }, storage: 100000, time: 86400, xp: 50 },
            9: { level: 9, requiredPlayerLevel: 70, cost: { carbon: 100000, titanium: 100000 }, storage: 250000, time: 172800, xp: 100 },
        }
    },
    colony_hub: {
        type: 'colony_hub',
        name: 'Colony Hub',
        size: 7,
        category: 'civil',
        nonConstructable: true,
        levels: {
            1: { level: 1, requiredPlayerLevel: 1, cost: { carbon: 0, titanium: 0 }, stability: 100, time: 0, xp: 0 },
            2: { level: 2, requiredPlayerLevel: 11, cost: { carbon: 1000, titanium: 500 }, stability: 150, time: 3600, xp: 50 },
            3: { level: 3, requiredPlayerLevel: 24, cost: { carbon: 5000, titanium: 2500 }, stability: 200, time: 10800, xp: 100 },
            4: { level: 4, requiredPlayerLevel: 52, cost: { carbon: 20000, titanium: 10000 }, stability: 300, time: 43200, xp: 200 },
            5: { level: 5, requiredPlayerLevel: 68, cost: { carbon: 50000, titanium: 25000 }, stability: 500, time: 86400, xp: 500 },
        }
    },
    monument: {
        type: 'monument',
        name: 'Holo-Monument',
        size: 1,
        category: 'decoration',
        levels: {
            1: { level: 1, requiredPlayerLevel: 2, cost: { carbon: 50, titanium: 20 }, stability: 10, time: 60, xp: 5 },
            2: { level: 2, requiredPlayerLevel: 5, cost: { carbon: 150, titanium: 75 }, stability: 25, time: 300, xp: 15 },
            3: { level: 3, requiredPlayerLevel: 10, cost: { carbon: 500, titanium: 250 }, stability: 60, time: 1200, xp: 40 },
            4: { level: 4, requiredPlayerLevel: 20, cost: { carbon: 2000, titanium: 1000 }, stability: 150, time: 3600, xp: 100 },
            5: { level: 5, requiredPlayerLevel: 35, cost: { carbon: 10000, titanium: 5000 }, stability: 400, time: 14400, xp: 300 },
        }
    },
    canopy_generator: {
        type: 'canopy_generator',
        name: 'Energy Canopy',
        size: 3,
        category: 'military',
        levels: {
            1: { level: 1, requiredPlayerLevel: 11, cost: { carbon: 1000, titanium: 1000 }, defenseBonus: 0.30, time: 1800, xp: 50 },
            2: { level: 2, requiredPlayerLevel: 24, cost: { carbon: 5000, titanium: 5000 }, defenseBonus: 0.50, time: 7200, xp: 150 },
            3: { level: 3, requiredPlayerLevel: 50, cost: { carbon: 20000, titanium: 20000 }, defenseBonus: 0.70, time: 28800, xp: 400 },
            4: { level: 4, requiredPlayerLevel: 69, cost: { carbon: 100000, titanium: 100000 }, defenseBonus: 0.90, time: 86400, xp: 1000 },
        }
    },
    orbital_minefield: {
        type: 'orbital_minefield',
        name: 'Orbital Minefield',
        size: 3,
        category: 'military',
        levels: {
            1: { level: 1, requiredPlayerLevel: 8, cost: { carbon: 800, titanium: 800 }, defenseBonus: 0.10, time: 1200, xp: 40 },
            2: { level: 2, requiredPlayerLevel: 18, cost: { carbon: 3000, titanium: 3000 }, defenseBonus: 0.10, time: 5400, xp: 100 },
            3: { level: 3, requiredPlayerLevel: 35, cost: { carbon: 12000, titanium: 12000 }, defenseBonus: 0.10, time: 21600, xp: 250 },
            4: { level: 4, requiredPlayerLevel: 55, cost: { carbon: 60000, titanium: 60000 }, defenseBonus: 0.10, time: 64800, xp: 600 },
        }
    },
    docking_hub: {
        type: 'docking_hub',
        name: 'Central Docking Hub',
        size: 4,
        category: 'military',
        levels: {
            1: { level: 1, requiredPlayerLevel: 14, cost: { carbon: 1500, titanium: 1500 }, defenseBonus: 0.35, time: 2400, xp: 75 },
            2: { level: 2, requiredPlayerLevel: 28, cost: { carbon: 6000, titanium: 6000 }, defenseBonus: 0.35, time: 10800, xp: 200 },
            3: { level: 3, requiredPlayerLevel: 45, cost: { carbon: 25000, titanium: 25000 }, defenseBonus: 0.35, time: 36000, xp: 500 },
            4: { level: 4, requiredPlayerLevel: 62, cost: { carbon: 80000, titanium: 80000 }, defenseBonus: 0.35, time: 72000, xp: 900 },
        }
    },
    // Dark Matter Generator - unique to Horizon Harvesters, cannot be recycled only moved
    dark_matter_generator: {
        type: 'dark_matter_generator',
        name: 'Dark Matter Generator',
        size: 5,
        category: 'civil',
        nonConstructable: true,
        levels: {
            1: {
                level: 1,
                requiredPlayerLevel: 50,
                cost: { carbon: 0, titanium: 0 },
                production: 10, // 10 dark matter per hour
                time: 0,
                xp: 0
            },
        }
    }
};

export function getBuildingStats(type: string, level: number): BuildingLevelStats | null {
    const building = BUILDING_DATA[type];
    if (!building) return null;
    return building.levels[level] || null;
}

export function getBuildingType(type: string): BuildingTypeStats | null {
    return BUILDING_DATA[type] || null;
}


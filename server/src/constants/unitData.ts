
// server/src/constants/unitData.ts

export interface UnitStats {
    id: string;
    name: string;
    description: string;
    type: 'melee' | 'ranged' | 'heavy' | 'support';
    meleeAtk: number;
    rangedAtk: number;
    meleeDef: number;
    rangedDef: number;
    capacity: number; // Loot capacity
    upkeep: number; // Food consumption per hour
    cost: {
        carbon: number;
        titanium: number;
        credits?: number;
        darkMatter?: number;
    };
    time: number; // Recruitment time in seconds
    requiredGarrisonLevel: number;
}

export const UNIT_DATA: Record<string, UnitStats> = {
    marine: {
        id: 'marine',
        name: 'Space Marine',
        description: 'Standard multi-purpose infantry unit. Balanced melee and defense.',
        type: 'melee',
        meleeAtk: 12,
        rangedAtk: 0,
        meleeDef: 12,
        rangedDef: 6,
        capacity: 10,
        upkeep: 4,
        cost: { carbon: 0, titanium: 0, credits: 10 },
        time: 20,
        requiredGarrisonLevel: 1
    },
    ranger: {
        id: 'ranger',
        name: 'Scout Ranger',
        description: 'Light infantry specializing in long-range engagement.',
        type: 'ranged',
        meleeAtk: 4,
        rangedAtk: 14,
        meleeDef: 4,
        rangedDef: 10,
        capacity: 5,
        upkeep: 3,
        cost: { carbon: 41, titanium: 0 },
        time: 30,
        requiredGarrisonLevel: 2
    },
    sentinel: {
        id: 'sentinel',
        name: 'Sentinel Heavy',
        description: 'Heavy armored unit designed to hold ground and absorb fire.',
        type: 'heavy',
        meleeAtk: 6,
        rangedAtk: 2,
        meleeDef: 18,
        rangedDef: 18,
        capacity: 20,
        upkeep: 6,
        cost: { carbon: 200, titanium: 0 },
        time: 40,
        requiredGarrisonLevel: 4
    },
    interceptor: {
        id: 'interceptor',
        name: 'Void Interceptor',
        description: 'High-speed attack craft designed for shock tactics.',
        type: 'support',
        meleeAtk: 16,
        rangedAtk: 0,
        meleeDef: 8,
        rangedDef: 8,
        capacity: 15,
        upkeep: 10,
        cost: { carbon: 500, titanium: 250 },
        time: 120,
        requiredGarrisonLevel: 5
    }
};

export function getUnitStats(id: string): UnitStats | null {
    return UNIT_DATA[id] || null;
}


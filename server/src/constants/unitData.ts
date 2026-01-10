
// server/src/constants/unitData.ts

export interface UnitStats {
    id: string;
    name: string;
    description: string;
    unitClass: 'melee' | 'ranged' | 'robotic';
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
        unitClass: 'melee',
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
        unitClass: 'ranged',
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
        unitClass: 'melee',
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
        unitClass: 'robotic',
        type: 'support',
        meleeAtk: 16,
        rangedAtk: 0,
        meleeDef: 8,
        rangedDef: 8,
        capacity: 15,
        upkeep: 10,
        cost: { carbon: 300, titanium: 450, credits: 50 }, // Balanced for Robotic Class
        time: 120,
        requiredGarrisonLevel: 5
    },
    droid_decoy: {
        id: 'droid_decoy',
        name: 'Droid Decoy',
        description: 'Automated high-durability robot designed to soak up damage.',
        unitClass: 'robotic',
        type: 'heavy',
        meleeAtk: 2,
        rangedAtk: 0,
        meleeDef: 25,
        rangedDef: 25,
        capacity: 10,
        upkeep: 5,
        cost: { carbon: 150, titanium: 300, credits: 20 },
        time: 60,
        requiredGarrisonLevel: 3
    },
    heavy_automaton: {
        id: 'heavy_automaton',
        name: 'Heavy Automaton',
        description: 'Tier 2 robotic combatant with heavy kinetic shielding.',
        unitClass: 'robotic',
        type: 'heavy',
        meleeAtk: 20,
        rangedAtk: 10,
        meleeDef: 20,
        rangedDef: 30,
        capacity: 30,
        upkeep: 15,
        cost: { carbon: 800, titanium: 1200, credits: 200 },
        time: 300,
        requiredGarrisonLevel: 5
    }
};

export function getUnitStats(id: string): UnitStats | null {
    return UNIT_DATA[id] || null;
}


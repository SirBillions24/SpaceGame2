/**
 * Unit Data Configuration
 * 
 * All unit definitions for recruitment and combat.
 * Units are organized by faction (Human, Mech, Exo) for the combat triangle.
 */

import { Faction } from './combatBalanceData';

// =============================================================================
// TYPES
// =============================================================================

export interface UnitStats {
    id: string;
    name: string;
    description: string;
    unitFaction: Faction;           // Human > Mech > Exo > Human
    type: 'melee' | 'ranged' | 'heavy' | 'support' | 'elite';
    meleeAtk: number;
    rangedAtk: number;
    meleeDef: number;
    rangedDef: number;
    capacity: number;               // Loot capacity
    upkeep: number;                 // Food consumption per hour
    cost: {
        carbon: number;
        titanium: number;
        credits?: number;
        darkMatter?: number;
    };
    time: number;                   // Recruitment time in seconds
    requiredGarrisonLevel: number;
}

// =============================================================================
// HUMAN FACTION
// Trained soldiers exploiting mechanical weaknesses
// Human > Mech
// =============================================================================

const HUMAN_UNITS: Record<string, UnitStats> = {
    marine: {
        id: 'marine',
        name: 'Marine',
        description: 'Standard infantry. Balanced melee combat specialist.',
        unitFaction: 'human',
        type: 'melee',
        meleeAtk: 12,
        rangedAtk: 0,
        meleeDef: 12,
        rangedDef: 6,
        capacity: 10,
        upkeep: 4,
        cost: { carbon: 0, titanium: 0, credits: 10 },
        time: 20,
        requiredGarrisonLevel: 1,
    },
    sniper: {
        id: 'sniper',
        name: 'Sniper',
        description: 'Precision marksman. High ranged damage, low survivability.',
        unitFaction: 'human',
        type: 'ranged',
        meleeAtk: 2,
        rangedAtk: 16,
        meleeDef: 4,
        rangedDef: 8,
        capacity: 5,
        upkeep: 5,
        cost: { carbon: 60, titanium: 30 },
        time: 35,
        requiredGarrisonLevel: 2,
    },
    guardian: {
        id: 'guardian',
        name: 'Guardian',
        description: 'Heavy infantry in powered armor. High defense, low mobility.',
        unitFaction: 'human',
        type: 'heavy',
        meleeAtk: 8,
        rangedAtk: 4,
        meleeDef: 20,
        rangedDef: 16,
        capacity: 15,
        upkeep: 8,
        cost: { carbon: 200, titanium: 150, credits: 25 },
        time: 60,
        requiredGarrisonLevel: 4,
    },
    commando: {
        id: 'commando',
        name: 'Commando',
        description: 'Elite special forces. Devastating offensive capability.',
        unitFaction: 'human',
        type: 'elite',
        meleeAtk: 18,
        rangedAtk: 12,
        meleeDef: 10,
        rangedDef: 10,
        capacity: 20,
        upkeep: 12,
        cost: { carbon: 400, titanium: 300, credits: 100 },
        time: 120,
        requiredGarrisonLevel: 5,
    },
};

// =============================================================================
// MECH FACTION
// Automated units programmed to counter alien biology
// Mech > Exo
// =============================================================================

const MECH_UNITS: Record<string, UnitStats> = {
    drone: {
        id: 'drone',
        name: 'Drone',
        description: 'Basic reconnaissance bot. Cheap and disposable.',
        unitFaction: 'mech',
        type: 'support',
        meleeAtk: 4,
        rangedAtk: 4,
        meleeDef: 6,
        rangedDef: 6,
        capacity: 5,
        upkeep: 2,
        cost: { carbon: 20, titanium: 40 },
        time: 15,
        requiredGarrisonLevel: 1,
    },
    automaton: {
        id: 'automaton',
        name: 'Automaton',
        description: 'Combat robot optimized for close-quarters engagement.',
        unitFaction: 'mech',
        type: 'melee',
        meleeAtk: 10,
        rangedAtk: 2,
        meleeDef: 10,
        rangedDef: 6,
        capacity: 8,
        upkeep: 4,
        cost: { carbon: 50, titanium: 80 },
        time: 30,
        requiredGarrisonLevel: 2,
    },
    sentinel: {
        id: 'sentinel',
        name: 'Sentinel',
        description: 'Heavy defense platform. Absorbs massive damage.',
        unitFaction: 'mech',
        type: 'heavy',
        meleeAtk: 6,
        rangedAtk: 2,
        meleeDef: 22,
        rangedDef: 22,
        capacity: 12,
        upkeep: 6,
        cost: { carbon: 150, titanium: 200, credits: 20 },
        time: 50,
        requiredGarrisonLevel: 3,
    },
    interceptor: {
        id: 'interceptor',
        name: 'Interceptor',
        description: 'High-speed assault craft. Devastating shock attacks.',
        unitFaction: 'mech',
        type: 'elite',
        meleeAtk: 20,
        rangedAtk: 8,
        meleeDef: 8,
        rangedDef: 8,
        capacity: 15,
        upkeep: 10,
        cost: { carbon: 300, titanium: 450, credits: 50 },
        time: 100,
        requiredGarrisonLevel: 5,
    },
};

// =============================================================================
// EXO FACTION
// Alien organisms that naturally prey on organic humans
// Exo > Human
// =============================================================================

const EXO_UNITS: Record<string, UnitStats> = {
    stalker: {
        id: 'stalker',
        name: 'Stalker',
        description: 'Fast alien predator. Strikes from the shadows.',
        unitFaction: 'exo',
        type: 'melee',
        meleeAtk: 10,
        rangedAtk: 0,
        meleeDef: 6,
        rangedDef: 4,
        capacity: 6,
        upkeep: 3,
        cost: { carbon: 30, titanium: 20 },
        time: 20,
        requiredGarrisonLevel: 1,
    },
    spitter: {
        id: 'spitter',
        name: 'Spitter',
        description: 'Ranged bioform. Projects corrosive acid at distance.',
        unitFaction: 'exo',
        type: 'ranged',
        meleeAtk: 2,
        rangedAtk: 14,
        meleeDef: 4,
        rangedDef: 10,
        capacity: 5,
        upkeep: 4,
        cost: { carbon: 45, titanium: 35 },
        time: 30,
        requiredGarrisonLevel: 2,
    },
    brute: {
        id: 'brute',
        name: 'Brute',
        description: 'Massive alien beast. Incredible resilience.',
        unitFaction: 'exo',
        type: 'heavy',
        meleeAtk: 10,
        rangedAtk: 0,
        meleeDef: 18,
        rangedDef: 14,
        capacity: 18,
        upkeep: 7,
        cost: { carbon: 120, titanium: 100, credits: 15 },
        time: 55,
        requiredGarrisonLevel: 3,
    },
    ravager: {
        id: 'ravager',
        name: 'Ravager',
        description: 'Apex predator. Unmatched killing efficiency.',
        unitFaction: 'exo',
        type: 'elite',
        meleeAtk: 22,
        rangedAtk: 6,
        meleeDef: 12,
        rangedDef: 10,
        capacity: 25,
        upkeep: 14,
        cost: { carbon: 350, titanium: 250, credits: 80 },
        time: 110,
        requiredGarrisonLevel: 5,
    },
};

// =============================================================================
// COMBINED UNIT DATA
// =============================================================================

export const UNIT_DATA: Record<string, UnitStats> = {
    ...HUMAN_UNITS,
    ...MECH_UNITS,
    ...EXO_UNITS,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getUnitStats(id: string): UnitStats | null {
    return UNIT_DATA[id] || null;
}

export function getUnitsByFaction(faction: Faction): UnitStats[] {
    return Object.values(UNIT_DATA).filter(u => u.unitFaction === faction);
}

export function getUnitsByGarrisonLevel(level: number): UnitStats[] {
    return Object.values(UNIT_DATA).filter(u => u.requiredGarrisonLevel <= level);
}

export function getUnitsAtExactGarrisonLevel(level: number): UnitStats[] {
    return Object.values(UNIT_DATA).filter(u => u.requiredGarrisonLevel === level);
}

/**
 * Get all unit IDs
 */
export function getAllUnitIds(): string[] {
    return Object.keys(UNIT_DATA);
}

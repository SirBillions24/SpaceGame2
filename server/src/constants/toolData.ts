
// server/src/constants/toolData.ts

export interface ToolStats {
    id: string;
    name: string;
    description: string;
    cost: {
        carbon: number;
        titanium: number;
    };
    time: number;
    workshop: 'defense_workshop' | 'siege_workshop';
    bonusType: 'canopy' | 'hub' | 'ranged_def' | 'canopy_reduction' | 'hub_reduction' | 'ranged_reduction';
    bonusValue: number; // e.g., 0.25 for +25%
}

export const TOOL_DATA: Record<string, ToolStats> = {
    'sentry_drones': {
        id: 'sentry_drones',
        name: 'Sentry Drones',
        description: 'Automated patrol drones that reinforce the Energy Canopy.',
        cost: { carbon: 40, titanium: 40 },
        time: 30,
        workshop: 'defense_workshop',
        bonusType: 'canopy',
        bonusValue: 0.25 // +25%
    },
    'hardened_bulkheads': {
        id: 'hardened_bulkheads',
        name: 'Hardened Bulkheads',
        description: 'Heavy-duty physical reinforcements for the Central Docking Hub.',
        cost: { carbon: 280, titanium: 120 },
        time: 60,
        workshop: 'defense_workshop',
        bonusType: 'hub',
        bonusValue: 0.35 // +35%
    },
    'targeting_uplinks': {
        id: 'targeting_uplinks',
        name: 'Targeting Uplinks',
        description: 'Advanced sensor array that boosts ranged unit defensive accuracy.',
        cost: { carbon: 525, titanium: 225 },
        time: 60,
        workshop: 'defense_workshop',
        bonusType: 'ranged_def',
        bonusValue: 0.25 // +25%
    },
    'invasion_anchors': {
        id: 'invasion_anchors',
        name: 'Invasion Anchors',
        description: 'Electronic warfare suite that bypasses the Energy Canopy.',
        cost: { carbon: 28, titanium: 12 },
        time: 30,
        workshop: 'siege_workshop',
        bonusType: 'canopy_reduction',
        bonusValue: 0.15 // -15% per tool
    },
    'plasma_breachers': {
        id: 'plasma_breachers',
        name: 'Plasma Breachers',
        description: 'High-energy charges designed to melt through Central Docking Hub bulkheads.',
        cost: { carbon: 56, titanium: 24 },
        time: 60,
        workshop: 'siege_workshop',
        bonusType: 'hub_reduction',
        bonusValue: 0.15 // -15% per tool
    },
    'stealth_field_pods': {
        id: 'stealth_field_pods',
        name: 'Stealth Field Pods',
        description: 'Holographic and electronic decoys that mask attackers from ranged sensors.',
        cost: { carbon: 105, titanium: 45 },
        time: 60,
        workshop: 'siege_workshop',
        bonusType: 'ranged_reduction',
        bonusValue: 0.15 // -15% per tool
    }
};

export function getToolStats(id: string): ToolStats | null {
    return TOOL_DATA[id] || null;
}

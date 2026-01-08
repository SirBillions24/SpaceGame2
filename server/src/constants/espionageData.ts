// server/src/constants/espionageData.ts

export interface ReconProbeStats {
    type: string;
    name: string;
    speed: number; // units per second
    radius: number; // scan radius in world map units
    cost: {
        carbon: number;
        titanium: number;
        credits?: number;
    };
    discoveryChancePerMinute: number; // Base chance increase per minute
    maxDiscoveryChance: number; // Maximum discovery chance (e.g., 0.10 for 10%)
    accuracyGainPerMinute: number; // Percentage gain per minute (e.g., 0.20 for 20%)
}

export const ESPIONAGE_DATA = {
    recon_probe: {
        type: 'recon_probe',
        name: 'Reconnaissance Probe',
        speed: 100, // Speed on world map
        radius: 150,
        cost: {
            carbon: 200,
            titanium: 100,
            credits: 50
        },
        discoveryChancePerMinute: 0.005, // 0.5% per minute
        maxDiscoveryChance: 0.10, // 10% max
        accuracyGainPerMinute: 0.10, // 10% accuracy gain per minute (10 mins to 100%)
    },
    advanced_probe: {
        type: 'advanced_probe',
        name: 'Advanced Orbital Probe',
        speed: 200, // Faster
        radius: 300, // Much bigger
        cost: {
            carbon: 1000,
            titanium: 500,
            credits: 200
        },
        discoveryChancePerMinute: 0.01, // 1% per minute (Higher risk)
        maxDiscoveryChance: 0.20, // 20% max
        accuracyGainPerMinute: 0.20, // 20% accuracy gain per minute (5 mins to 100%)
    }
};


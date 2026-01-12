/**
 * Sprite Configuration
 * 
 * Centralized mapping of game entities to their sprite paths.
 * To add a new sprite:
 *   1. Place the image in client/public/assets/<category>/
 *   2. Add the path to the appropriate section below
 */

export const SPRITE_CONFIG = {
    // Planet sprites by planetType
    planets: {
        default: '/assets/castles/castlesprite.png',
        harvester: '/assets/castles/horizon_harvester.png',
    },

    // NPC sprites by npcClass archetype
    npc: {
        default: '/assets/castles/castlesprite.png',
        melee: '/assets/castles/melee_outpost.jpeg',
        ranged: '/assets/castles/ranged_den.jpeg',
        robotic: '/assets/castles/robotic_forge.jpeg',
    },

    // Fleet/march sprites
    fleets: {
        default: '/assets/map_icons/fleet_ship.png',
    },

    // Probe sprites (future expansion)
    probes: {
        default: null, // Currently uses PIXI.Texture.WHITE placeholder
    },
} as const;

/**
 * Get the sprite path for a planet based on its type and NPC class
 */
export function getPlanetSpritePath(
    planetType?: string,
    npcClass?: string,
    isNpc?: boolean
): string {
    // Check for special planet types first (e.g., harvester)
    if (planetType && planetType in SPRITE_CONFIG.planets) {
        return SPRITE_CONFIG.planets[planetType as keyof typeof SPRITE_CONFIG.planets];
    }

    // NPC planets use class-based sprites
    if (isNpc && npcClass && npcClass in SPRITE_CONFIG.npc) {
        return SPRITE_CONFIG.npc[npcClass as keyof typeof SPRITE_CONFIG.npc];
    }

    // Fallback to default
    return SPRITE_CONFIG.planets.default;
}

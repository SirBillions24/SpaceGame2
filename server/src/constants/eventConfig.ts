/**
 * Event Framework Configuration
 *
 * Centralized config for all event types.
 * Add new event types by extending EVENT_TYPES and adding type-specific configs.
 *
 * All tunable values are here - no magic numbers in service code.
 */

// =============================================================================
// EVENT TYPES REGISTRY
// =============================================================================

export const EVENT_TYPES = {
  ALIEN_INVASION: 'alien_invasion',
  // Future: PIRATE_RAID: 'pirate_raid',
  // Future: VOID_STORM: 'void_storm',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// =============================================================================
// SHIP TIER CONFIGURATION
// =============================================================================

export interface ShipTierConfig {
  tier: number;
  name: string;
  levelRange: { min: number; max: number };
  xenoCoresBase: number;
  respawnMinutes: number | null;
  maxAttacks: number | null;
  spawnPerPlayer: number;
  portalCount: number;
  playerLevelRequired: number;
}

export type ShipType = 'scout' | 'raider' | 'carrier' | 'dreadnought' | 'mothership';

// =============================================================================
// ALIEN INVASION CONFIG
// =============================================================================

export const ALIEN_INVASION_CONFIG = {
  /**
   * Event timing
   */
  timing: {
    defaultDurationDays: 5,
    retaliationPhaseDurationHours: 12,
    announcementLeadTimeHours: 24,
  },

  /**
   * Ship spawn distances (fixed for fairness)
   */
  distances: {
    playerRingDistance: 75, // All player ring ships spawn exactly 75 units away
    portalZoneDistance: 200, // Portal is 200 units from each player's colony
    portalZoneRadius: 50, // Ships within portal spawn in 50-unit radius
  },

  /**
   * Ship tiers and spawning
   */
  shipTiers: {
    scout: {
      tier: 1,
      name: 'Xeno Scout',
      levelRange: { min: 5, max: 15 },
      xenoCoresBase: 50,
      respawnMinutes: 30,
      maxAttacks: 5,
      spawnPerPlayer: 3,
      portalCount: 10,
      playerLevelRequired: 0,
    },
    raider: {
      tier: 2,
      name: 'Xeno Raider',
      levelRange: { min: 15, max: 30 },
      xenoCoresBase: 200,
      respawnMinutes: 120,
      maxAttacks: 8,
      spawnPerPlayer: 2,
      portalCount: 8,
      playerLevelRequired: 20,
    },
    carrier: {
      tier: 3,
      name: 'Xeno Carrier',
      levelRange: { min: 30, max: 50 },
      xenoCoresBase: 500,
      respawnMinutes: 360,
      maxAttacks: 10,
      spawnPerPlayer: 1,
      portalCount: 5,
      playerLevelRequired: 40,
    },
    dreadnought: {
      tier: 4,
      name: 'Xeno Dreadnought',
      levelRange: { min: 50, max: 75 },
      xenoCoresBase: 1500,
      respawnMinutes: 720,
      maxAttacks: 12,
      spawnPerPlayer: 1,
      portalCount: 3,
      playerLevelRequired: 60,
    },
    mothership: {
      tier: 5,
      name: 'Xeno Mothership',
      levelRange: { min: 150, max: 150 },
      xenoCoresBase: 25000, // Split by damage contribution
      respawnMinutes: null, // Does not respawn (or respawns once)
      maxAttacks: null, // Persistent HP instead
      spawnPerPlayer: 0,
      portalCount: 1,
      playerLevelRequired: 0, // Anyone can attempt
    },
  } as Record<ShipType, ShipTierConfig>,

  /**
   * Mothership specific config
   */
  mothership: {
    baseHp: 500000, // Total "damage points" to defeat
    xenoCoresBase: 25000, // Total Xeno Cores pool to split
    garrisonRegenPercent: 50, // Regenerates 50% garrison every cycle
    garrisonRegenHours: 4,
    killBonusPercent: 25, // 25% of reward pool to killing blow
    damageSharePercent: 50, // 50% split by damage contribution
    coalitionSharePercent: 25, // 25% to killing blow coalition

    // Daily weakening if not killed
    dailyWeakening: [
      { day: 1, defenseMultiplier: 1.0, garrisonMultiplier: 1.0 },
      { day: 2, defenseMultiplier: 1.0, garrisonMultiplier: 1.0 },
      { day: 3, defenseMultiplier: 0.85, garrisonMultiplier: 0.9 },
      { day: 4, defenseMultiplier: 0.7, garrisonMultiplier: 0.8 },
      { day: 5, defenseMultiplier: 0.5, garrisonMultiplier: 0.6 },
    ],
  },

  /**
   * Heat system for retaliation
   */
  heat: {
    gainPerTier: {
      scout: 5,
      raider: 15,
      carrier: 40,
      dreadnought: 100,
      mothership: 1, // Per 10 troops killed
    } as Record<ShipType, number>,
    decayPerHour: 10, // Lose 10 heat per hour of inactivity
    decayGracePeriodMinutes: 30, // No decay for 30 min after last attack
    maxHeat: 2000,

    // Retaliation probability
    baseChancePerHour: 0.01, // 1% base chance per hour
    heatDivisor: 500, // chance = heat / 500 * baseChance
    minHeatForRetaliation: 50, // Won't be targeted below 50 heat
    heatReductionOnDefense: 50, // Successful defense reduces heat by 50

    // Cooldown between retaliations
    minRetaliationIntervalHours: 2,
  },

  /**
   * Retaliation wave strength based on cores earned
   */
  retaliationTiers: [
    { minCores: 0, maxCores: 1000, tier: 1, waveName: 'Scout Probe' },
    { minCores: 1000, maxCores: 5000, tier: 2, waveName: 'Raider Strike' },
    { minCores: 5000, maxCores: 20000, tier: 3, waveName: 'Carrier Assault' },
    { minCores: 20000, maxCores: 50000, tier: 4, waveName: 'Dreadnought Siege' },
    { minCores: 50000, maxCores: Infinity, tier: 5, waveName: 'Armada' },
  ],

  /**
   * Coalition scoring
   */
  coalitionScoring: {
    contributionPercent: 50, // Coalition gets 50% of player's cores
  },

  /**
   * Garrison composition by tier (uses existing unit types)
   */
  garrisonTemplates: {
    scout: {
      baseUnits: { marine: 20, sniper: 10 },
      unitsPerLevel: { marine: 2, sniper: 1 },
    },
    raider: {
      baseUnits: { marine: 50, sniper: 30, sentinel: 10 },
      unitsPerLevel: { marine: 3, sniper: 2, sentinel: 1 },
    },
    carrier: {
      baseUnits: { marine: 100, sniper: 60, sentinel: 30, automaton: 10 },
      unitsPerLevel: { marine: 4, sniper: 3, sentinel: 2, automaton: 1 },
    },
    dreadnought: {
      baseUnits: { marine: 200, sniper: 120, sentinel: 60, automaton: 30, interceptor: 10 },
      unitsPerLevel: { marine: 5, sniper: 4, sentinel: 3, automaton: 2, interceptor: 1 },
    },
    mothership: {
      baseUnits: { marine: 1000, sniper: 600, sentinel: 300, automaton: 150, interceptor: 50 },
      unitsPerLevel: { marine: 10, sniper: 6, sentinel: 4, automaton: 3, interceptor: 2 },
    },
  } as Record<ShipType, { baseUnits: Record<string, number>; unitsPerLevel: Record<string, number> }>,

  /**
   * Hull Breach Assault: Per-system garrison distribution
   * Each ship system has its own garrison that must be defeated in lane combat.
   * Percentages of total garrison assigned to each system.
   */
  systemGarrisons: {
    // Shield Generator - defensive units, smaller garrison
    shields: { percent: 0.2 },
    // Core Reactor - main garrison, must destroy to defeat ship
    reactor: { percent: 0.5 },
    // Weapon Systems - offensive units, medium garrison
    weapons: { percent: 0.3 },
  },

  /**
   * Salvage/loot chances
   */
  salvage: {
    baseChanceByTier: {
      scout: 0.05, // 5% chance for rare drop
      raider: 0.1,
      carrier: 0.15,
      dreadnought: 0.25,
      mothership: 1.0, // Guaranteed drop
    } as Record<ShipType, number>,
    // Gear rarity weights for event drops
    rarityWeights: {
      common: 40,
      uncommon: 35,
      rare: 20,
      epic: 4,
      legendary: 1,
    },
  },
};

// =============================================================================
// REWARD TIERS
// =============================================================================

export const ALIEN_INVASION_REWARDS = {
  /**
   * Individual milestone rewards
   */
  individualMilestones: [
    { cores: 500, reward: { type: 'badge', id: 'alien_hunter_1' } },
    { cores: 2000, reward: { type: 'tool', id: 'invasion_mantlet', count: 5 } },
    { cores: 5000, reward: { type: 'decoration', id: 'alien_artifact', stability: 500 } },
    { cores: 15000, reward: { type: 'unit', id: 'xeno_marine', count: 10 } },
    { cores: 50000, reward: { type: 'decoration', id: 'mothership_wreckage', stability: 2500 } },
    { cores: 100000, reward: { type: 'gear', rarity: 'epic', guaranteed: true } },
  ],

  /**
   * Coalition pool milestones
   */
  coalitionMilestones: [
    { poolTotal: 10000, reward: { type: 'coalition_banner', tier: 1 } },
    { poolTotal: 50000, reward: { type: 'boost', id: 'resource_10', durationHours: 24 } },
    { poolTotal: 150000, reward: { type: 'emote', id: 'xeno_salute' } },
    { poolTotal: 500000, reward: { type: 'building', id: 'xeno_hangar' } },
  ],

  /**
   * Leaderboard rewards
   */
  leaderboard: {
    individual: [
      { rank: 1, rewards: [{ type: 'title', id: 'Xeno Slayer' }, { type: 'gear', rarity: 'legendary' }] },
      { rank: 10, rewards: [{ type: 'title', id: 'Alien Hunter' }, { type: 'gear', rarity: 'epic' }] },
      { rank: 100, rewards: [{ type: 'gear', rarity: 'rare' }] },
    ],
    coalition: [
      { rank: 1, rewards: [{ type: 'decoration', id: 'champion_banner' }] },
      { rank: 3, rewards: [{ type: 'decoration', id: 'elite_banner' }] },
      { rank: 10, rewards: [{ type: 'boost', id: 'production_5', durationHours: 48 }] },
    ],
  },

  /**
   * Defense bonus rewards
   */
  defenseBonus: {
    successfulDefense: 100, // Bonus cores for winning defense
    finalWaveSurvival: 500, // Bonus for surviving final wave
  },
};

// =============================================================================
// EVENT CONFIG REGISTRY
// =============================================================================

export interface EventConfig {
  type: EventType;
  config: typeof ALIEN_INVASION_CONFIG;
  rewards: typeof ALIEN_INVASION_REWARDS;
}

// Registry for looking up configs by type
export const EVENT_CONFIGS: Record<EventType, EventConfig> = {
  [EVENT_TYPES.ALIEN_INVASION]: {
    type: EVENT_TYPES.ALIEN_INVASION,
    config: ALIEN_INVASION_CONFIG,
    rewards: ALIEN_INVASION_REWARDS,
  },
};

// =============================================================================
// HELPER TYPES
// =============================================================================

export interface EventGlobalState {
  mothershipCurrentHp: number;
  mothershipMaxHp: number;
  mothershipDefeated: boolean;
  mothershipKillerId: string | null;
  mothershipKillerCoalitionId: string | null;
  totalShipsDefeated: number;
  currentDay: number;
  portalCenter?: { x: number; y: number };
}

export type EventStatus = 'scheduled' | 'active' | 'retaliation' | 'ended';




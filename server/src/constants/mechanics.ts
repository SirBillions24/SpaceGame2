
// Mechanics Constants for Galactic Conquest

// 2. SYSTEM STABILITY
export const BASE_STABILITY = 0; // Neutral
export const TAX_EFFICIENCY_FACTOR = 1; // Basic multiplier

// 3. COMBAT / TOOLS (Reference)
export const ATTACK_SLOT_CAP_FLANK = 40;
export const ATTACK_SLOT_CAP_CENTER = 50;

// 4. RESOURCE PRODUCTION
export const BASE_PRODUCTION = 100;

// 6. DEFENSE TURRET SYSTEM
// Defense Turrets increase total troop capacity (shared across all 3 lanes)
// Level 1 = 10 troops, Level 2 = 20, Level 3 = 30, Level 4 = 40
// Capacity is pooled - total units across all lanes must not exceed total capacity
export const DEFENSE_TURRET_CAPACITY: Record<number, number> = {
    1: 10,
    2: 20,
    3: 30,
    4: 40
};
export const MAX_DEFENSE_TURRETS = 20; // Maximum turrets per planet (after expansions)
export const DEFENSE_TURRET_BASE_COST_CARBON = 500;
export const DEFENSE_TURRET_BASE_COST_TITANIUM = 250;
export const DEFENSE_TURRET_COST_MULTIPLIER = 1.5;
export const DEFENSE_TURRET_BUILD_TIME_SECONDS = 60; // 60 seconds per turret

// 7. PLANET EXPANSION
export const MAX_GRID_SIZE = 50; // Maximum grid size (50x50)
export const MIN_GRID_SIZE = 10; // Starting grid size (10x10)
// Expansion costs (scaling with current size)
export const EXPANSION_BASE_COST_CARBON = 1000;
export const EXPANSION_BASE_COST_TITANIUM = 500;
export const EXPANSION_COST_MULTIPLIER = 1.5; // Cost increases by 50% per expansion

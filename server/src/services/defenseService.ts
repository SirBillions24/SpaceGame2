import { DEFENSE_TURRET_CAPACITY, MAX_DEFENSE_TURRETS } from '../constants/mechanics';

/**
 * Calculate total defensive troop capacity from defense turrets
 * @param defenseTurretsJson JSON string of turret array: [{ level: 1 }, { level: 2 }, ...]
 * @returns Total capacity (sum of all turret capacities) - shared across all 3 lanes
 */
export function calculateDefenseCapacity(defenseTurretsJson: string | null): number {
  if (!defenseTurretsJson) return 0;
  
  try {
    const turrets = JSON.parse(defenseTurretsJson);
    if (!Array.isArray(turrets)) return 0;
    
    let totalCapacity = 0;
    for (const turret of turrets) {
      if (turret && typeof turret.level === 'number') {
        const capacity = DEFENSE_TURRET_CAPACITY[turret.level] || 0;
        totalCapacity += capacity;
      }
    }
    return totalCapacity;
  } catch (e) {
    console.error('Error parsing defense turrets JSON:', e);
    return 0;
  }
}

/**
 * Get defense turret array from JSON
 */
export function getDefenseTurrets(defenseTurretsJson: string | null): Array<{ level: number }> {
  if (!defenseTurretsJson) return [];
  
  try {
    const turrets = JSON.parse(defenseTurretsJson);
    return Array.isArray(turrets) ? turrets.filter(t => t && typeof t.level === 'number') : [];
  } catch (e) {
    return [];
  }
}

/**
 * Validate if a new turret can be added (max 20 turrets)
 */
export function canAddDefenseTurret(defenseTurretsJson: string | null): boolean {
  const turrets = getDefenseTurrets(defenseTurretsJson);
  return turrets.length < MAX_DEFENSE_TURRETS;
}

/**
 * Count total units assigned to a lane
 */
export function countLaneUnits(lane: { units?: Record<string, number> }): number {
  if (!lane.units) return 0;
  return Object.values(lane.units).reduce((sum, count) => sum + (count || 0), 0);
}


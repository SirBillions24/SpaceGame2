import prisma from '../lib/prisma';
import { syncPlanetResources } from './planetService';
import { getDefenseTurrets } from './defenseService';

/**
 * Process turret construction queue
 * Called by timer worker to complete turrets that have finished construction
 */
export async function processTurretQueue(planet: any) {
  if (!planet.turretConstructionQueue) return;

  try {
    const queue: Array<{ level: number; finishTime: string }> = JSON.parse(planet.turretConstructionQueue);
    if (!Array.isArray(queue) || queue.length === 0) return;

    const now = new Date();
    const completed: Array<{ level: number; finishTime: string }> = [];
    const remaining: Array<{ level: number; finishTime: string }> = [];

    for (const item of queue) {
      const finishTime = new Date(item.finishTime);
      if (finishTime <= now) {
        completed.push(item);
      } else {
        remaining.push(item);
      }
    }

    if (completed.length === 0) return; // Nothing to process

    // Get current turrets and add completed ones
    const currentTurrets = getDefenseTurrets(planet.defenseTurretsJson);
    for (const item of completed) {
      currentTurrets.push({ level: item.level });
    }

    // Update planet with new turrets and remaining queue
    await prisma.planet.update({
      where: { id: planet.id },
      data: {
        defenseTurretsJson: JSON.stringify(currentTurrets),
        turretConstructionQueue: remaining.length > 0 ? JSON.stringify(remaining) : null
      }
    });

    console.log(`[Turret Queue] Processed ${completed.length} turret(s) for planet ${planet.id}`);
  } catch (e) {
    console.error('Error processing turret queue:', e);
  }
}




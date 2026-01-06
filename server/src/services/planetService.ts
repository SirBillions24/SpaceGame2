import prisma from '../lib/prisma';
import { spawnPirateBases } from './pveService';
import { processManufacturingQueue } from './toolService';
import { processTurretQueue } from './turretService';

const WORLD_SIZE_X = parseInt(process.env.WORLD_SIZE_X || '5000');
const WORLD_SIZE_Y = parseInt(process.env.WORLD_SIZE_Y || '5000');
const MIN_PLANET_DISTANCE = parseInt(process.env.MIN_PLANET_DISTANCE || '120'); // Increased to prevent visual overlap

// Production constants
const BASE_PRODUCTION_RATE = 100; // Per hour
const LEVEL_MULTIPLIER = 50; // Extra per hour per level
const UNIT_UPKEEP = 1; // Food per unit per hour
const MAX_STORAGE_BASE = 1000;
const STORAGE_LEVEL_MULTIPLIER = 500;

interface UnitCounts {
  [unitType: string]: number;
}

const STARTING_UNITS: UnitCounts = {
  marine: 50,
  ranger: 30,
  sentinel: 20,
};

/**
 * Calculate distance between two points
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Check if a position is too close to existing planets
 */
async function isPositionValid(x: number, y: number): Promise<boolean> {
  const nearbyPlanets = await prisma.planet.findMany({
    where: {
      x: {
        gte: x - MIN_PLANET_DISTANCE,
        lte: x + MIN_PLANET_DISTANCE,
      },
      y: {
        gte: y - MIN_PLANET_DISTANCE,
        lte: y + MIN_PLANET_DISTANCE,
      },
    },
  });

  for (const planet of nearbyPlanets) {
    const dist = distance(x, y, planet.x, planet.y);
    if (dist < MIN_PLANET_DISTANCE) {
      return false;
    }
  }

  return true;
}

/**
 * Generate a random valid position for a new planet, optionally in a specific quadrant
 */
async function generatePlanetPosition(quadrant?: 'NW' | 'NE' | 'SW' | 'SE'): Promise<{ x: number; y: number }> {
  let attempts = 0;
  const maxAttempts = 200;

  // Quadrant Centers (World 5000x5000)
  // NW: 0-2500, 0-2500 -> Center 1250, 1250
  // NE: 2500-5000, 0-2500 -> Center 3750, 1250
  // SW: 0-2500, 2500-5000 -> Center 1250, 3750
  // SE: 2500-5000, 2500-5000 -> Center 3750, 3750

  let baseX = 2500, baseY = 2500, rangeX = 2500, rangeY = 2500;

  if (quadrant) {
    if (quadrant === 'NW') { baseX = 1250; baseY = 1250; }
    if (quadrant === 'NE') { baseX = 3750; baseY = 1250; }
    if (quadrant === 'SW') { baseX = 1250; baseY = 3750; }
    if (quadrant === 'SE') { baseX = 3750; baseY = 3750; }
    // Constrain random range to roughly the quadrant size but allow some chaos
    rangeX = 1200;
    rangeY = 1200;
  } else {
    // Global random if no quadrant specified (legacy fallback)
    baseX = 2500; baseY = 2500; rangeX = 2500; rangeY = 2500;
  }

  while (attempts < maxAttempts) {
    // Random offset from base
    const offsetX = (Math.random() - 0.5) * 2 * rangeX;
    const offsetY = (Math.random() - 0.5) * 2 * rangeY;

    let x = Math.floor(baseX + offsetX);
    let y = Math.floor(baseY + offsetY);

    // Clamp to world bounds
    x = Math.max(50, Math.min(WORLD_SIZE_X - 50, x));
    y = Math.max(50, Math.min(WORLD_SIZE_Y - 50, y));

    if (await isPositionValid(x, y)) {
      return { x, y };
    }

    attempts++;
  }

  console.warn('Could not find valid position after max attempts, using random backup');
  return {
    x: Math.floor(Math.random() * WORLD_SIZE_X),
    y: Math.floor(Math.random() * WORLD_SIZE_Y),
  };
}

/**
 * Lazy Resource Evaluation:
 * Syncs resources based on time elapsed since last update.
 */
import { UNIT_STATS, DWELLING_STATS_GGE, BASE_PRODUCTION } from '../constants/mechanics';

/**
 * Lazy Resource Evaluation:
 * Syncs resources based on time elapsed since last update.
 */
/**
 * Calculate resource rates and stats for a planet
 */
export function calculatePlanetRates(planet: any) {
  let carbonLevel = 0;
  let titaniumLevel = 0;
  let foodLevel = 0;
  let population = 0;
  let dwellingPenalty = 0;
  let decorationBonus = 0;

  // Process Buildings
  if (planet.buildings) {
    for (const b of planet.buildings) {
      if (b.status === 'active' || b.status === 'upgrading') {
        if (b.type === 'carbon_processor') carbonLevel += b.level;
        if (b.type === 'titanium_extractor') titaniumLevel += b.level;
        if (b.type === 'hydroponics') foodLevel += b.level;

        if (b.type === 'housing_unit') {
          const stats = DWELLING_STATS_GGE[b.level as keyof typeof DWELLING_STATS_GGE] || DWELLING_STATS_GGE[1];
          population += stats.pop;
          dwellingPenalty += stats.poPenalty;
        }

        if (b.type === 'monument') {
          decorationBonus += (b.level * 50);
        }
      }
    }
  }

  // Stability logic
  const taxPenalty = (planet.taxRate || 10) * 2;
  const publicOrder = decorationBonus - dwellingPenalty - taxPenalty;

  // Productivity logic
  let productivity = 100;
  if (publicOrder >= 0) {
    productivity = (Math.sqrt(publicOrder) * 2) + 100;
  } else {
    productivity = 100 * (100 / (100 + 2 * Math.sqrt(Math.abs(publicOrder))));
  }
  const prodMult = productivity / 100;

  // Production Rates
  const LEVEL_MULTIPLIER = 50;
  const carbonRate = (BASE_PRODUCTION + (carbonLevel * LEVEL_MULTIPLIER)) * prodMult;
  const titaniumRate = (BASE_PRODUCTION + (titaniumLevel * LEVEL_MULTIPLIER)) * prodMult;
  const foodRate = (BASE_PRODUCTION + (foodLevel * LEVEL_MULTIPLIER)) * prodMult;

  // Consumption
  let foodConsumption = 0;
  if (planet.units) {
    planet.units.forEach((u: any) => {
      const stats = UNIT_STATS[u.unitType];
      const upkeep = stats ? stats.upkeep : 1;
      foodConsumption += (u.count * upkeep);
    });
  }

  const creditRate = population * ((planet.taxRate || 10) / 100) * 5;

  return {
    carbonRate,
    titaniumRate,
    foodRate,
    foodConsumption,
    netFoodRate: foodRate - foodConsumption,
    creditRate,
    population,
    publicOrder,
    productivity
  };
}

export async function syncPlanetResources(planetId: string) {
  const planet = await prisma.planet.findUnique({
    where: { id: planetId },
    include: {
      units: true,
      buildings: true,
      tools: true
    },
  });

  if (!planet) return null;

  const now = new Date();
  const lastUpdate = new Date(planet.lastResourceUpdate);
  const diffMs = now.getTime() - lastUpdate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  // 1. Check Construction Status
  let activeBuildingFinished = false;
  if (planet.activeBuildId && planet.buildFinishTime && planet.buildFinishTime <= now) {
    const building = planet.buildings.find(b => b.id === planet.activeBuildId);
    if (building) {
      const isUpgrade = building.status === 'upgrading';
      await prisma.building.update({
        where: { id: planet.activeBuildId },
        data: {
          status: 'active',
          level: isUpgrade ? { increment: 1 } : undefined
        }
      });
      // Handle Shield Generator Unlock Hook
      if (building.type === 'shield_generator') {
        await prisma.planet.update({
          where: { id: planetId },
          data: { defensiveGridLevel: { increment: 1 } }
        });
      }
    }

    await prisma.planet.update({
      where: { id: planetId },
      data: { isBuilding: false, activeBuildId: null, buildFinishTime: null }
    });

    // Quick refresh of building list locally for calculations
    const builtBuilding = await prisma.building.findUnique({ where: { id: planet.activeBuildId } });
    if (builtBuilding) {
      // Find and update local building
      const bIndex = planet.buildings.findIndex(b => b.id === builtBuilding.id);
      if (bIndex !== -1) planet.buildings[bIndex] = builtBuilding as any;
    }
  }

  // Calculate Rates using helper
  const stats = calculatePlanetRates(planet);

  // 3. Apply Resource Changes
  let newCarbon = planet.carbon + (stats.carbonRate * diffHours);
  let newTitanium = planet.titanium + (stats.titaniumRate * diffHours);
  let newFood = planet.food + (stats.foodRate * diffHours);

  // Apply Consumption
  const consumed = stats.foodConsumption * diffHours;
  newFood -= consumed;

  // 6. Desertion Logic
  if (newFood < 0 && stats.foodConsumption > 0) {
    console.log(`[Desertion] Planet ${planet.name} ran out of food.`);

    const sustainableUpkeep = Math.max(0, stats.foodRate);

    if (stats.foodConsumption > sustainableUpkeep) {
      const deficitRatio = sustainableUpkeep / stats.foodConsumption;

      for (const u of planet.units) {
        if (u.count > 0) {
          const newCount = Math.floor(u.count * deficitRatio);
          if (newCount !== u.count) {
            await prisma.planetUnit.update({
              where: { id: u.id },
              data: { count: newCount }
            });
            u.count = newCount;
          }
        }
      }
    }
    newFood = 0;
  }

  // Credits
  let newCredits = planet.credits + (stats.creditRate * diffHours);

  // 7. Queue Processing
  if (planet.recruitmentQueue) {
    try {
      const queue = JSON.parse(planet.recruitmentQueue);
      if (Array.isArray(queue) && queue.length > 0) {
        const nowMs = now.getTime();
        const pendingQueue = [];
        for (const batch of queue) {
          const finishTime = new Date(batch.finishTime).getTime();
          if (finishTime <= nowMs) {
            await prisma.planetUnit.upsert({
              where: { planetId_unitType: { planetId: planet.id, unitType: batch.unit } },
              update: { count: { increment: batch.count } },
              create: { planetId: planet.id, unitType: batch.unit, count: batch.count }
            });
          } else {
            pendingQueue.push(batch);
          }
        }
        if (pendingQueue.length !== queue.length) {
          await prisma.planet.update({
            where: { id: planet.id },
            data: { recruitmentQueue: JSON.stringify(pendingQueue) }
          });
        }
      }
    } catch (e) { console.error(e); }
  }

  await processManufacturingQueue(planet);
  await processTurretQueue(planet);

  // 8. Final DB Update
  const updatedPlanet = await prisma.planet.update({
    where: { id: planetId },
    data: {
      carbon: newCarbon,
      titanium: newTitanium,
      food: newFood,
      credits: newCredits,
      stability: Math.round(stats.publicOrder),
      population: stats.population,
      lastResourceUpdate: now,
    },
    include: { units: true, buildings: true, tools: true },
  });

  return updatedPlanet;
}

/**
 * Place or Upgrade a Building
 */
export async function placeBuilding(planetId: string, type: string, x: number, y: number) {
  const planet = await syncPlanetResources(planetId);
  if (!planet) throw new Error('Planet not found');

  if (planet.isBuilding) {
    throw new Error('Construction slot occupied');
  }

  // Check Grid Bounds (using new gridSizeX/gridSizeY)
  const gridSizeX = (planet as any).gridSizeX || 10;
  const gridSizeY = (planet as any).gridSizeY || 10;
  if (x < 0 || x >= gridSizeX || y < 0 || y >= gridSizeY) {
    throw new Error('Position out of bounds');
  }

  // Collision Check
  // Assuming 2x2 for resource/academy for now (simplified from query plan)
  // Actually, let's stick to 1x1 for MVP simplicity unless user specifically asked for multi-tile "fit".
  // The user said "plot of land... fit a certain number... free space".
  // Let's implement dynamic size check.
  const BUILDING_SIZES: any = {
    'carbon_processor': 2,
    'titanium_extractor': 2,
    'hydroponics': 2,
    'academy': 3,
    'colony_hub': 4,
    'tavern': 2,           // Intelligence Hub
    'defense_workshop': 2, // Systems Workshop
    'siege_workshop': 2,   // Munitions Factory
    'monument': 1,         // Holo-Monument
    'housing_unit': 2,     // Sci-fi Dwelling
    'shield_generator': 2, // Defensive Grid
  };
  const size = BUILDING_SIZES[type] || 2;

  // Check collision with all existing buildings
  // Simple AABB
  for (const b of (planet as any).buildings) {
    const bSize = BUILDING_SIZES[b.type] || 2;
    // If rectangles overlap
    if (x < b.x + bSize && x + size > b.x &&
      y < b.y + bSize && y + size > b.y) {

      // If it's the SAME building, we might be Upgrading it
      if (b.x === x && b.y === y && b.type === type) {
        return upgradeBuilding(planet, b);
      }
      throw new Error(`Space occupied by ${b.type}`);
    }
  }

  // It's a new building
  const cost = 100; // Base cost for lvl 1
  const time = 30; // Seconds

  if (planet.carbon < cost || planet.titanium < cost) {
    throw new Error('Insufficient resources');
  }

  // Create Building Record (Constructing)
  const finishTime = new Date();
  finishTime.setSeconds(finishTime.getSeconds() + time);

  const building = await prisma.building.create({
    data: {
      planetId: planet.id,
      type,
      x,
      y,
      level: 1,
      status: 'constructing'
    }
  });

  // Set Planet Construction State
  await prisma.planet.update({
    where: { id: planet.id },
    data: {
      carbon: { decrement: cost },
      titanium: { decrement: cost },
      isBuilding: true,
      activeBuildId: building.id,
      buildFinishTime: finishTime
    }
  });

  return building;
}

async function upgradeBuilding(planet: any, building: any) {
  // Current Level
  const level = building.level;
  const cost = Math.floor(100 * Math.pow(1.5, level));
  const time = 30 * (level + 1);

  if (planet.carbon < cost || planet.titanium < cost) {
    throw new Error(`Insufficient resources for upgrade to level ${level + 1}`);
  }

  const finishTime = new Date();
  finishTime.setSeconds(finishTime.getSeconds() + time);

  // Update Building Status
  await prisma.building.update({
    where: { id: building.id },
    data: { status: 'upgrading' }
  });

  // Update Planet State
  await prisma.planet.update({
    where: { id: planet.id },
    data: {
      carbon: { decrement: cost },
      titanium: { decrement: cost },
      isBuilding: true,
      activeBuildId: building.id,
      buildFinishTime: finishTime
    }
  });

  return { ...building, status: 'upgrading' };
}

/**
 * Spawn a new planet for a user with starting units
 */
export async function spawnPlanet(userId: string, username: string, quadrant?: 'NW' | 'NE' | 'SW' | 'SE'): Promise<void> {
  const position = await generatePlanetPosition(quadrant);
  const planetName = `${username}'s Colony`;

  // Create planet
  const planet = await prisma.planet.create({
    data: {
      ownerId: userId,
      x: position.x,
      y: position.y,
      name: planetName,
      lastResourceUpdate: new Date(),
      gridSizeX: 10, // Starting 10x10
      gridSizeY: 10,
    },
  });

  // Create Starting Buildings
  // 1. Colony Hub (Command Center) - Center of grid (5,5)
  // 2. Resource Gen at (2,2), (2,7), (7,2) etc to give them something to upgrade
  await prisma.building.createMany({
    data: [
      { planetId: planet.id, type: 'colony_hub', x: 4, y: 4, level: 1, status: 'active' }, // 4x4, at 4,4 occupies 4,5,6,7
      { planetId: planet.id, type: 'carbon_processor', x: 1, y: 1, level: 1, status: 'active' },
      { planetId: planet.id, type: 'titanium_extractor', x: 1, y: 7, level: 1, status: 'active' },
      { planetId: planet.id, type: 'hydroponics', x: 7, y: 1, level: 1, status: 'active' },
    ]
  });

  // Create starting units
  const unitPromises = Object.entries(STARTING_UNITS).map(([unitType, count]) =>
    prisma.planetUnit.create({
      data: {
        planetId: planet.id,
        unitType,
        count,
      },
    })
  );

  await Promise.all(unitPromises);

  // Spawn NPCs around the new user
  await spawnPirateBases(userId, position.x, position.y).catch(err => console.error('Failed to spawn NPCs:', err));

  console.log(`Spawned planet for user ${userId} at (${position.x}, ${position.y})`);
}

/**
 * Recruit units
 */
export async function recruitUnit(planetId: string, unitType: string, count: number) {
  // Sync first
  const planet = await syncPlanetResources(planetId);
  if (!planet) throw new Error('Planet not found');

  // Validate Academy
  const academyLevel = (planet as any).buildings
    .filter((b: any) => b.type === 'academy' && b.status === 'active')
    .reduce((max: number, b: any) => Math.max(max, b.level), 0);

  if (academyLevel < 1) {
    throw new Error('Fleet Academy required');
  }

  // Costs
  const COSTS: any = {
    marine: { c: 20, t: 0, time: 20 },
    ranger: { c: 30, t: 10, time: 30 },
    sentinel: { c: 10, t: 40, time: 40 },
  };

  const unitStats = COSTS[unitType];
  if (!unitStats) throw new Error('Invalid unit type');

  const totalCarbon = unitStats.c * count;
  const totalTitanium = unitStats.t * count;

  if (planet.carbon < totalCarbon || planet.titanium < totalTitanium) {
    throw new Error(`Insufficient resources`);
  }

  // Calculate Finish Time
  // Queue logic: finishes after the last one in queue
  let recruitmentQueue: any[] = [];
  if (planet.recruitmentQueue) {
    try {
      recruitmentQueue = JSON.parse(planet.recruitmentQueue);
    } catch (e) { }
  }

  const now = new Date();
  let startTime = now;

  if (recruitmentQueue.length > 0) {
    const lastItem = recruitmentQueue[recruitmentQueue.length - 1];
    const lastFinish = new Date(lastItem.finishTime);
    if (lastFinish > now) {
      startTime = lastFinish;
    }
  }

  // Calculate Academy Level
  // Already calculated at start
  const acLvl = academyLevel;

  // Apply Academy Speedup (5% per level)
  const speedup = 1 - (Math.min(0.5, acLvl * 0.05));
  const durationPerUnit = unitStats.time * speedup;
  const totalDuration = durationPerUnit * count;

  const finishTime = new Date(startTime.getTime() + (totalDuration * 1000));

  const newItem = {
    unit: unitType,
    count,
    finishTime: finishTime.toISOString()
  };
  recruitmentQueue.push(newItem);

  // Update DB
  await prisma.planet.update({
    where: { id: planetId },
    data: {
      carbon: { decrement: totalCarbon },
      titanium: { decrement: totalTitanium },
      recruitmentQueue: JSON.stringify(recruitmentQueue)
    }
  });

  return { queue: recruitmentQueue };
}



/**
 * Move a building to a new location
 */
export async function moveBuilding(planetId: string, buildingId: string, newX: number, newY: number) {
  const planet = await prisma.planet.findUnique({
    where: { id: planetId },
    include: { buildings: true }
  });
  if (!planet) throw new Error('Planet not found');

  const building = planet.buildings.find(b => b.id === buildingId);
  if (!building) throw new Error('Building not found');

  if (planet.isBuilding) {
    // Optional: Does moving require construction slot? GGE usually allows moving freely or with small timer.
    // User requested "Move Mode ... freely relocate".
    // So distinct from construction.
  }

  // Check Bounds (using new gridSizeX/gridSizeY)
  const gridSizeX = (planet as any).gridSizeX || 10;
  const gridSizeY = (planet as any).gridSizeY || 10;
  if (newX < 0 || newX >= gridSizeX || newY < 0 || newY >= gridSizeY) {
    throw new Error('Position out of bounds');
  }

  // Define Sizes (Duplicate - should refactor to constant)
  const BUILDING_SIZES: any = {
    'carbon_processor': 2,
    'titanium_extractor': 2,
    'hydroponics': 2,
    'academy': 3,
    'colony_hub': 4,
    'tavern': 2,
    'defense_workshop': 2,
    'siege_workshop': 2,
    'monument': 1,
    'housing_unit': 2,
    'shield_generator': 2
  };
  const size = BUILDING_SIZES[building.type] || 2;

  // Check Collision (Exclude self)
  for (const b of planet.buildings) {
    if (b.id === building.id) continue; // Skip self

    const bSize = BUILDING_SIZES[b.type] || 2;
    if (newX < b.x + bSize && newX + size > b.x &&
      newY < b.y + bSize && newY + size > b.y) {
      throw new Error(`Space occupied by ${b.type}`);
    }
  }

  // Update DB
  const updated = await prisma.building.update({
    where: { id: buildingId },
    data: { x: newX, y: newY }
  });

  return updated;
}

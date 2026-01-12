import prisma from '../lib/prisma';
import { spawnPirateBases } from './pveService';
import { processManufacturingQueue } from './toolService';
import { processTurretQueue } from './turretService';
import {
  BASE_PRODUCTION,
  BASE_STAFFING_REQUIREMENT,
  STAFFING_PER_LEVEL,
  OVERSTAFFING_BONUS_CAP,
  UNDERSTAFFED_MINIMUM
} from '../constants/mechanics';
import { UNIT_DATA } from '../constants/unitData';
import { BUILDING_DATA, getBuildingStats } from '../constants/buildingData';
import { addXp } from './progressionService';
import { getWorldBounds, getQuadrantCenter, maybeExpandWorld, Quadrant } from './worldService';
import { MAP_CONFIG } from '../constants/npcBalanceData';
import { calculateDarkMatterProduction } from './harvesterService';

const MIN_PLANET_DISTANCE = MAP_CONFIG.minPlanetDistance;

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
 * Uses dynamic world bounds from database
 */
async function generatePlanetPosition(quadrant?: Quadrant): Promise<{ x: number; y: number }> {
  const bounds = await getWorldBounds();
  const maxAttempts = 200;
  let attempts = 0;

  // Calculate centers and ranges based on current world size
  const midX = bounds.maxX / 2;
  const midY = bounds.maxY / 2;

  let baseX = midX, baseY = midY;
  let rangeX = midX - 500, rangeY = midY - 500;  // Leave margin from edges

  if (quadrant) {
    // Dynamic quadrant centers based on current world size
    const center = await getQuadrantCenter(quadrant);
    baseX = center.x;
    baseY = center.y;
    // Spawn within quadrant with margin from edges (quadrant is midX x midY sized)
    rangeX = midX / 2 - 200;
    rangeY = midY / 2 - 200;
  }

  while (attempts < maxAttempts) {
    // Random offset from base
    const offsetX = (Math.random() - 0.5) * 2 * rangeX;
    const offsetY = (Math.random() - 0.5) * 2 * rangeY;

    let x = Math.floor(baseX + offsetX);
    let y = Math.floor(baseY + offsetY);

    // Clamp to world bounds
    x = Math.max(50, Math.min(bounds.maxX - 50, x));
    y = Math.max(50, Math.min(bounds.maxY - 50, y));

    if (await isPositionValid(x, y)) {
      return { x, y };
    }

    attempts++;
  }

  console.warn('Could not find valid position after max attempts, using random backup');
  return {
    x: Math.floor(Math.random() * bounds.maxX),
    y: Math.floor(Math.random() * bounds.maxY),
  };
}

/**
 * Calculate resource rates and stats for a planet
 * Includes workforce efficiency: production buildings require workers to operate
 * Returns detailed per-building breakdowns for UI
 */
export function calculatePlanetRates(planet: any) {
  // Track base production values (before workforce efficiency)
  let carbonBaseProduction = 0;
  let titaniumBaseProduction = 0;
  let foodBaseProduction = 0;

  // Track workforce
  let population = 0;
  let workforceRequired = 0;

  // Track stability
  let dwellingPenalty = 0;
  let decorationBonus = 0;
  let maxStorage = 1000; // Base storage

  // Per-building tracking for detailed breakdowns
  const carbonBuildings: any[] = [];
  const titaniumBuildings: any[] = [];
  const foodBuildings: any[] = [];

  // Process Buildings
  if (planet.buildings) {
    for (const b of planet.buildings) {
      if (b.status === 'active' || b.status === 'upgrading') {
        const stats = BUILDING_DATA[b.type]?.levels[b.level];
        if (stats) {
          // Attach stats to building object for UI
          (b as any).stats = stats;

          // Get next level stats for upgrade cost display
          const nextLevelStats = BUILDING_DATA[b.type]?.levels[b.level + 1];
          if (nextLevelStats) {
            (b as any).nextUpgrade = nextLevelStats;
          }

          // Production buildings - track base production and staffing requirements
          if (b.type === 'carbon_processor') {
            const baseRate = stats.production || 0;
            carbonBaseProduction += baseRate;
            workforceRequired += stats.staffingRequirement || (BASE_STAFFING_REQUIREMENT + (b.level - 1) * STAFFING_PER_LEVEL);
            carbonBuildings.push({ id: b.id, type: b.type, level: b.level, baseRate });
          }
          if (b.type === 'titanium_extractor') {
            const baseRate = stats.production || 0;
            titaniumBaseProduction += baseRate;
            workforceRequired += stats.staffingRequirement || (BASE_STAFFING_REQUIREMENT + (b.level - 1) * STAFFING_PER_LEVEL);
            titaniumBuildings.push({ id: b.id, type: b.type, level: b.level, baseRate });
          }
          if (b.type === 'hydroponics') {
            const baseRate = stats.production || 0;
            foodBaseProduction += baseRate;
            workforceRequired += stats.staffingRequirement || (BASE_STAFFING_REQUIREMENT + (b.level - 1) * STAFFING_PER_LEVEL);
            foodBuildings.push({ id: b.id, type: b.type, level: b.level, baseRate });
          }

          // Population sources: Housing units and Colony Hub
          if (b.type === 'housing_unit') {
            population += stats.population || 0;
            dwellingPenalty += Math.abs(stats.stability || 0);
          }

          // Colony Hub provides both stability AND population
          if (b.type === 'colony_hub') {
            decorationBonus += stats.stability || 0;
            population += stats.population || 0;
          }

          // Monuments provide stability only
          if (b.type === 'monument') {
            decorationBonus += stats.stability || 0;
          }

          if (b.type === 'storage_depot') {
            maxStorage = Math.max(maxStorage, stats.storage || 1000);
          }
        }
      }
    }
  }

  // Stability logic
  const taxPenalty = (planet.taxRate || 10) * 2;
  const publicOrder = decorationBonus - dwellingPenalty - taxPenalty;

  // Productivity (stability) multiplier
  let productivity = 100;
  if (publicOrder >= 0) {
    productivity = (Math.sqrt(publicOrder) * 2) + 100;
  } else {
    productivity = 100 * (100 / (100 + 2 * Math.sqrt(Math.abs(publicOrder))));
  }
  const stabilityMultiplier = productivity / 100;

  // Workforce Efficiency Calculation
  let staffingRatio = 1.0;
  let overstaffBonus = 0;
  let workforceEfficiency = 1.0;

  if (workforceRequired > 0) {
    staffingRatio = Math.min(1.0, population / workforceRequired);
    const surplusWorkers = Math.max(0, population - workforceRequired);
    if (surplusWorkers > 0) {
      overstaffBonus = Math.min(
        OVERSTAFFING_BONUS_CAP,
        Math.log10(1 + surplusWorkers / workforceRequired) * 0.15
      );
    }
    workforceEfficiency = Math.max(UNDERSTAFFED_MINIMUM, staffingRatio + overstaffBonus);
  }

  // Combined multiplier for production
  const combinedMultiplier = workforceEfficiency * stabilityMultiplier;

  // Compute per-building final rates
  carbonBuildings.forEach(b => {
    b.workforceApplied = b.baseRate * workforceEfficiency;
    b.finalRate = b.baseRate * combinedMultiplier;
  });
  titaniumBuildings.forEach(b => {
    b.workforceApplied = b.baseRate * workforceEfficiency;
    b.finalRate = b.baseRate * combinedMultiplier;
  });
  foodBuildings.forEach(b => {
    b.workforceApplied = b.baseRate * workforceEfficiency;
    b.finalRate = b.baseRate * combinedMultiplier;
  });

  // Final Production Rates = (Base + BuildingProduction) × workforceEfficiency × stabilityMultiplier
  const carbonRate = (BASE_PRODUCTION + carbonBaseProduction) * combinedMultiplier;
  const titaniumRate = (BASE_PRODUCTION + titaniumBaseProduction) * combinedMultiplier;
  const foodRate = (BASE_PRODUCTION + foodBaseProduction) * combinedMultiplier;

  // Consumption breakdown (units eat food regardless of workforce efficiency)
  let foodConsumption = 0;
  const troopConsumption: any[] = [];
  if (planet.units) {
    planet.units.forEach((u: any) => {
      const stats = UNIT_DATA[u.unitType];
      const upkeep = stats ? stats.upkeep : 1;
      const total = u.count * upkeep;
      foodConsumption += total;
      if (u.count > 0) {
        troopConsumption.push({
          unitType: u.unitType,
          count: u.count,
          upkeepPerUnit: upkeep,
          totalConsumption: total
        });
      }
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
    productivity,
    maxStorage,
    darkMatterRate: calculateDarkMatterProduction(planet.buildings),
    // Workforce stats for UI
    workforceRequired,
    workforceEfficiency,
    staffingRatio,
    overstaffBonus,
    // Detailed breakdowns for economy panel
    productionBreakdown: {
      carbon: {
        baseHubRate: BASE_PRODUCTION,
        buildingBaseTotal: carbonBaseProduction,
        buildings: carbonBuildings,
        workforceMultiplier: workforceEfficiency,
        stabilityMultiplier: stabilityMultiplier,
        finalRate: carbonRate
      },
      titanium: {
        baseHubRate: BASE_PRODUCTION,
        buildingBaseTotal: titaniumBaseProduction,
        buildings: titaniumBuildings,
        workforceMultiplier: workforceEfficiency,
        stabilityMultiplier: stabilityMultiplier,
        finalRate: titaniumRate
      },
      food: {
        baseHubRate: BASE_PRODUCTION,
        buildingBaseTotal: foodBaseProduction,
        buildings: foodBuildings,
        workforceMultiplier: workforceEfficiency,
        stabilityMultiplier: stabilityMultiplier,
        finalRate: foodRate
      }
    },
    consumptionBreakdown: {
      food: {
        troops: troopConsumption,
        totalConsumption: foodConsumption
      }
    }
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
  if (planet.activeBuildId && planet.buildFinishTime && planet.buildFinishTime <= now) {
    const building = planet.buildings.find(b => b.id === planet.activeBuildId);
    if (building) {
      if (building.status === 'demolishing') {
        // Remove building completely
        await prisma.building.delete({
          where: { id: planet.activeBuildId }
        });

        // Also check if it was a defensive building to decrease the appropriate level
        if (building.type === 'canopy_generator') {
          await prisma.planet.update({
            where: { id: planetId },
            data: { energyCanopyLevel: { decrement: 1 } }
          });
        }
        if (building.type === 'orbital_minefield') {
          await prisma.planet.update({
            where: { id: planetId },
            data: { orbitalMinefieldLevel: { decrement: 1 } }
          });
        }
        if (building.type === 'docking_hub') {
          await prisma.planet.update({
            where: { id: planetId },
            data: { dockingHubLevel: { decrement: 1 } }
          });
        }
      } else {
        const isUpgrade = building.status === 'upgrading';
        const nextLevel = isUpgrade ? building.level + 1 : 1;
        const stats = BUILDING_DATA[building.type]?.levels[nextLevel];

        await prisma.building.update({
          where: { id: planet.activeBuildId },
          data: {
            status: 'active',
            level: isUpgrade ? { increment: 1 } : undefined
          }
        });

        // Award XP
        if (stats && stats.xp) {
          await addXp(planet.ownerId, stats.xp);
        }

        // Handle defensive building level sync
        if (building.type === 'canopy_generator') {
          await prisma.planet.update({
            where: { id: planetId },
            data: { energyCanopyLevel: { increment: 1 } }
          });
        }
        if (building.type === 'orbital_minefield') {
          await prisma.planet.update({
            where: { id: planetId },
            data: { orbitalMinefieldLevel: { increment: 1 } }
          });
        }
        if (building.type === 'docking_hub') {
          await prisma.planet.update({
            where: { id: planetId },
            data: { dockingHubLevel: { increment: 1 } }
          });
        }
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

  // Skip production/clamping for NPCs to preserve their custom loot pools
  if (planet.isNpc) {
    return planet;
  }

  // 3. Apply Resource Changes
  let newCarbon = planet.carbon + (stats.carbonRate * diffHours);
  let newTitanium = planet.titanium + (stats.titaniumRate * diffHours);
  let newFood = planet.food + (stats.foodRate * diffHours);

  // Clamp to Max Storage
  newCarbon = Math.min(newCarbon, stats.maxStorage);
  newTitanium = Math.min(newTitanium, stats.maxStorage);
  newFood = Math.min(newFood, stats.maxStorage);

  // Apply Consumption (Consumption happens AFTER production and clamping? 
  // Food can go to 0 regardless of storage cap.
  // Production fills the storage, but consumption takes from it.)
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

  // Credits - Shared across all planets (Global User Resource)
  const creditsProduced = stats.creditRate * diffHours;

  // Dark Matter (from Horizon Harvester generators) - Shared across all planets (Global User Resource)
  const darkMatterRate = calculateDarkMatterProduction(planet.buildings);
  const darkMatterProduced = darkMatterRate * diffHours;

  // Only accumulate global resources for player-owned planets (not NPCs)
  if (!planet.isNpc && planet.ownerId) {
    if (creditsProduced > 0 || darkMatterProduced > 0) {
      await prisma.user.update({
        where: { id: planet.ownerId },
        data: {
          credits: { increment: creditsProduced },
          darkMatter: { increment: darkMatterProduced }
        }
      });
    }
  }

  // Keep internal planet credits and darkMatter at 0 to avoid confusion
  let newCredits = 0;
  let newDarkMatter = 0;

  // 7. Queue Processing
  let updatedRecruitmentQueue = planet.recruitmentQueue;
  if (planet.recruitmentQueue) {
    try {
      const queue = JSON.parse(planet.recruitmentQueue);
      if (Array.isArray(queue) && queue.length > 0) {
        const nowMs = now.getTime();
        const pendingQueue = [];
        let unitsAdded = false;

        for (const batch of queue) {
          const finishTime = new Date(batch.finishTime).getTime();
          if (finishTime <= nowMs) {
            await prisma.planetUnit.upsert({
              where: { planetId_unitType: { planetId: planet.id, unitType: batch.unit } },
              update: { count: { increment: batch.count } },
              create: { planetId: planet.id, unitType: batch.unit, count: batch.count }
            });
            unitsAdded = true;
          } else {
            pendingQueue.push(batch);
          }
        }

        if (unitsAdded || pendingQueue.length !== queue.length) {
          updatedRecruitmentQueue = JSON.stringify(pendingQueue);
        }
      }
    } catch (e) { console.error('Recruitment sync error:', e); }
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
      darkMatter: newDarkMatter, // Always 0 as production moves to user
      stability: Math.round(stats.publicOrder),
      population: stats.population,
      lastResourceUpdate: now,
      recruitmentQueue: updatedRecruitmentQueue,
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

  // Building Limits
  if (type === 'colony_hub') throw new Error('Additional Colony Hubs cannot be constructed.');

  const bType = BUILDING_DATA[type];
  if (bType?.nonConstructable) {
    throw new Error(`${bType.name} cannot be constructed; it must be discovered or captured.`);
  }

  const limitedBuildings = ['storage_depot', 'naval_academy', 'orbital_garrison', 'tavern', 'defense_workshop', 'siege_workshop', 'orbital_minefield', 'docking_hub'];
  if (limitedBuildings.includes(type)) {
    const existing = (planet as any).buildings?.find((b: any) => b.type === type);
    if (existing) {
      // Redirect to upgrade of existing building
      return upgradeBuilding(planet, existing);
    }
  }

  // Check Grid Bounds
  const gridSizeX = (planet as any).gridSizeX || 10;
  const gridSizeY = (planet as any).gridSizeY || 10;
  if (x < 0 || x >= gridSizeX || y < 0 || y >= gridSizeY) {
    throw new Error('Position out of bounds');
  }

  // Collision Check
  const size = BUILDING_DATA[type]?.size || 2;

  // Check collision with all existing buildings
  // Simple AABB
  for (const b of (planet as any).buildings) {
    const bSize = BUILDING_DATA[b.type]?.size || 2;
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
  const stats = BUILDING_DATA[type]?.levels[1];
  if (!stats) throw new Error(`Invalid building type: ${type}`);

  const carbonCost = stats.cost.carbon;
  const titaniumCost = stats.cost.titanium;
  const time = stats.time;

  // Check for Free Build mode (dev tool)
  const isFreeBuild = (global as any).isFreeBuildEnabled?.(planet.ownerId) || false;

  if (!isFreeBuild && (planet.carbon < carbonCost || planet.titanium < titaniumCost)) {
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

  // Set Planet Construction State (skip deduction in Free Build mode)
  await prisma.planet.update({
    where: { id: planet.id },
    data: {
      carbon: isFreeBuild ? planet.carbon : { decrement: carbonCost },
      titanium: isFreeBuild ? planet.titanium : { decrement: titaniumCost },
      isBuilding: true,
      activeBuildId: building.id,
      buildFinishTime: finishTime
    }
  });

  return building;
}

/**
 * Demolish a building
 */
export async function demolishBuilding(planetId: string, buildingId: string) {
  const planet = await syncPlanetResources(planetId);
  if (!planet) throw new Error('Planet not found');

  if (planet.isBuilding) {
    throw new Error('Construction slot occupied');
  }

  const building = (planet as any).buildings?.find((b: any) => b.id === buildingId);
  if (!building) throw new Error('Building not found');

  if (building.type === 'colony_hub') {
    throw new Error('You cannot demolish the Colony Hub.');
  }

  // Dark Matter Generators can only be moved, not recycled
  if (building.type === 'dark_matter_generator') {
    throw new Error('Dark Matter Generators cannot be recycled, only moved.');
  }

  // Calculate Refund (10% of current level cost)
  // And Time (50% of build time)
  const stats = BUILDING_DATA[building.type]?.levels[building.level];
  if (!stats) throw new Error('Building stats not found');

  const carbonRefund = Math.floor(stats.cost.carbon * 0.1);
  const titaniumRefund = Math.floor(stats.cost.titanium * 0.1);
  const demoTime = Math.ceil(stats.time * 0.5);

  const finishTime = new Date();
  finishTime.setSeconds(finishTime.getSeconds() + demoTime);

  // Update Building Status
  await prisma.building.update({
    where: { id: buildingId },
    data: { status: 'demolishing' }
  });

  // Set Planet State
  await prisma.planet.update({
    where: { id: planetId },
    data: {
      carbon: { increment: carbonRefund },
      titanium: { increment: titaniumRefund },
      isBuilding: true,
      activeBuildId: buildingId,
      buildFinishTime: finishTime
    }
  });

  return { buildingId, finishTime, carbonRefund, titaniumRefund };
}

async function upgradeBuilding(planet: any, building: any) {
  // Next Level
  const nextLevel = building.level + 1;
  const stats = BUILDING_DATA[building.type]?.levels[nextLevel];

  if (!stats) {
    throw new Error(`Max level reached for ${building.type}`);
  }

  const carbonCost = stats.cost.carbon;
  const titaniumCost = stats.cost.titanium;
  const time = stats.time;

  if (planet.carbon < carbonCost || planet.titanium < titaniumCost) {
    throw new Error(`Insufficient resources for upgrade to level ${nextLevel}`);
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
      carbon: { decrement: carbonCost },
      titanium: { decrement: titaniumCost },
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
export async function spawnPlanet(userId: string, username: string, quadrant?: Quadrant): Promise<void> {
  // Check if quadrant expansion is needed (only player spawns trigger expansion)
  if (quadrant) {
    const expanded = await maybeExpandWorld(quadrant);
    if (expanded) {
      console.log(`Map expanded before spawning player in ${quadrant}`);
    }
  }

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
  // 1. Colony Hub (Command Center) - 7x7
  await prisma.building.create({
    data: { planetId: planet.id, type: 'colony_hub', x: 1, y: 1, level: 1, status: 'active' }
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

  // Validate Garrison
  const garrisonBuilding = (planet as any).buildings
    .filter((b: any) => b.type === 'orbital_garrison' && b.status === 'active')
    .sort((a: any, b: any) => b.level - a.level)[0];

  const garrisonLevel = garrisonBuilding?.level || 0;

  if (garrisonLevel < 1) {
    throw new Error('Orbital Garrison required for unit recruitment.');
  }

  // Costs
  const unitData = UNIT_DATA[unitType];
  if (!unitData) throw new Error('Invalid unit type');

  if (garrisonLevel < unitData.requiredGarrisonLevel) {
    throw new Error(`Orbital Garrison Level ${unitData.requiredGarrisonLevel} required for ${unitData.name}`);
  }

  const totalCarbon = unitData.cost.carbon * count;
  const totalTitanium = unitData.cost.titanium * count;
  const totalCredits = (unitData.cost.credits || 0) * count;

  // Check for Free Build mode (dev tool)
  const isFreeBuild = (global as any).isFreeBuildEnabled?.(planet.ownerId) || false;

  // Credits are now a User-level (global) resource, not planet-level
  // Fetch user credits if needed
  let userCredits = 0;
  if (totalCredits > 0 && !isFreeBuild) {
    const user = await prisma.user.findUnique({ where: { id: planet.ownerId } });
    userCredits = user?.credits || 0;
  }

  if (!isFreeBuild && (planet.carbon < totalCarbon || planet.titanium < totalTitanium)) {
    throw new Error(`Insufficient resources`);
  }

  if (!isFreeBuild && totalCredits > 0 && userCredits < totalCredits) {
    throw new Error(`Insufficient credits. Need ${totalCredits}, have ${Math.floor(userCredits)}`);
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

  // Calculate Speed Bonus from Garrison
  const garrisonStats = getBuildingStats('orbital_garrison', garrisonLevel);
  const speedBonus = garrisonStats?.recruitmentSpeedBonus || 0;

  // Formula: Time / (1 + Bonus)
  const durationPerUnit = unitData.time / (1 + speedBonus);
  const totalDuration = durationPerUnit * count;

  const finishTime = new Date(startTime.getTime() + (totalDuration * 1000));

  const newItem = {
    unit: unitType,
    count,
    finishTime: finishTime.toISOString()
  };
  recruitmentQueue.push(newItem);

  // Update DB - Deduct planet resources (skip in free build mode)
  await prisma.planet.update({
    where: { id: planetId },
    data: {
      carbon: isFreeBuild ? planet.carbon : { decrement: totalCarbon },
      titanium: isFreeBuild ? planet.titanium : { decrement: totalTitanium },
      recruitmentQueue: JSON.stringify(recruitmentQueue)
    }
  });

  // Deduct user credits if applicable (skip in free build mode)
  if (!isFreeBuild && totalCredits > 0) {
    await prisma.user.update({
      where: { id: planet.ownerId },
      data: { credits: { decrement: totalCredits } }
    });
  }

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
    // Moving buildings is allowed freely.
    // User requested "Move Mode ... freely relocate".
    // So distinct from construction.
  }

  // Check Bounds (using new gridSizeX/gridSizeY)
  const gridSizeX = (planet as any).gridSizeX || 10;
  const gridSizeY = (planet as any).gridSizeY || 10;
  if (newX < 0 || newX >= gridSizeX || newY < 0 || newY >= gridSizeY) {
    throw new Error('Position out of bounds');
  }

  // Define Sizes
  const size = BUILDING_DATA[building.type]?.size || 2;

  // Check Collision (Exclude self)
  for (const b of planet.buildings) {
    if (b.id === building.id) continue; // Skip self

    const bSize = BUILDING_DATA[b.type]?.size || 2;
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

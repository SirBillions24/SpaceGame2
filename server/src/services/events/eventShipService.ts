/**
 * Event Ship Service
 *
 * Handles ship spawning, positioning, combat, and respawning for world events.
 */

import prisma from '../../lib/prisma';
import {
  ALIEN_INVASION_CONFIG,
  ShipType,
  ShipTierConfig,
} from '../../constants/eventConfig';
import { Prisma } from '@prisma/client';

const config = ALIEN_INVASION_CONFIG;

// =============================================================================
// SHIP SPAWNING
// =============================================================================

/**
 * Spawn all ships for an event (portal zone + all active players)
 */
export async function spawnAllEventShips(eventId: string) {
  // Spawn portal zone ships (global)
  await spawnPortalZone(eventId);

  // Spawn player ring ships for all active players
  const players = await prisma.user.findMany({
    where: { planets: { some: { isNpc: false } } },
    select: { id: true },
  });

  let spawned = 0;
  for (const player of players) {
    const count = await spawnPlayerRingShips(eventId, player.id);
    spawned += count;
  }

  console.log(`🛸 Spawned ${spawned} player ring ships for ${players.length} players`);
}

/**
 * Spawn player ring ships for a specific user
 */
export async function spawnPlayerRingShips(eventId: string, userId: string): Promise<number> {
  // Get player's home planet for ring positioning
  const homePlanet = await prisma.planet.findFirst({
    where: { ownerId: userId, isNpc: false },
    orderBy: { createdAt: 'asc' },
  });

  if (!homePlanet) return 0;

  // Get player level to determine which tiers they can access
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const playerLevel = user?.level || 1;

  const shipsToCreate: Prisma.EventShipCreateManyInput[] = [];
  const ringDistance = config.distances.playerRingDistance;

  for (const [shipType, tierConfig] of Object.entries(config.shipTiers)) {
    if (tierConfig.spawnPerPlayer === 0) continue;
    if (playerLevel < tierConfig.playerLevelRequired) continue;

    for (let i = 0; i < tierConfig.spawnPerPlayer; i++) {
      // Distribute ships evenly around the ring with some randomness
      const baseAngle = (2 * Math.PI * i) / tierConfig.spawnPerPlayer;
      const angle = baseAngle + (Math.random() - 0.5) * 0.5;
      const x = Math.floor(homePlanet.x + Math.cos(angle) * ringDistance);
      const y = Math.floor(homePlanet.y + Math.sin(angle) * ringDistance);

      const level = randomInRange(tierConfig.levelRange.min, tierConfig.levelRange.max);
      const garrison = generateGarrison(shipType as ShipType, level);

      shipsToCreate.push({
        eventId,
        shipType,
        tier: tierConfig.tier,
        level,
        name: `${tierConfig.name} (Lvl ${level})`,
        zoneType: 'player_ring',
        ownerUserId: userId,
        x,
        y,
        distanceFromOwner: ringDistance,
        maxAttacks: tierConfig.maxAttacks || 10,
        garrison: garrison as unknown as Prisma.InputJsonValue,
        lootConfig: {
          xenoCores: tierConfig.xenoCoresBase,
          salvageChance: config.salvage.baseChanceByTier[shipType as ShipType] || 0,
        } as unknown as Prisma.InputJsonValue,
      });
    }
  }

  if (shipsToCreate.length > 0) {
    await prisma.eventShip.createMany({ data: shipsToCreate });
  }

  return shipsToCreate.length;
}

/**
 * Spawn portal zone with shared ships + mothership
 */
export async function spawnPortalZone(eventId: string) {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event) return;

  // Calculate portal center (world center)
  const portalCenter = await calculatePortalCenter();
  const portalRadius = config.distances.portalZoneRadius;

  const shipsToCreate: Prisma.EventShipCreateManyInput[] = [];
  let shipIndex = 0;

  for (const [shipType, tierConfig] of Object.entries(config.shipTiers)) {
    if (tierConfig.portalCount === 0) continue;

    for (let i = 0; i < tierConfig.portalCount; i++) {
      // Mothership at center, others in a ring around it
      const isMothership = shipType === 'mothership';
      const angle = (2 * Math.PI * shipIndex) / 20; // Spread ships around
      const dist = isMothership ? 0 : portalRadius * (0.5 + Math.random() * 0.5);
      const x = Math.floor(portalCenter.x + Math.cos(angle) * dist);
      const y = Math.floor(portalCenter.y + Math.sin(angle) * dist);

      const level = randomInRange(tierConfig.levelRange.min, tierConfig.levelRange.max);
      const garrison = generateGarrison(shipType as ShipType, level);

      const shipData: Prisma.EventShipCreateManyInput = {
        eventId,
        shipType,
        tier: tierConfig.tier,
        level,
        name: isMothership ? 'XENO MOTHERSHIP' : `${tierConfig.name} (Lvl ${level})`,
        zoneType: 'portal',
        ownerUserId: null,
        x,
        y,
        distanceFromOwner: null,
        garrison: garrison as unknown as Prisma.InputJsonValue,
        lootConfig: {
          xenoCores: tierConfig.xenoCoresBase,
          salvageChance: config.salvage.baseChanceByTier[shipType as ShipType] || 0,
        } as unknown as Prisma.InputJsonValue,
      };

      // Mothership gets persistent HP
      if (isMothership) {
        shipData.currentHp = config.mothership.baseHp;
        shipData.maxHp = config.mothership.baseHp;
        shipData.maxAttacks = 999999; // Uses HP instead of attack count
      } else {
        shipData.maxAttacks = tierConfig.maxAttacks || 10;
      }

      shipsToCreate.push(shipData);
      shipIndex++;
    }
  }

  if (shipsToCreate.length > 0) {
    await prisma.eventShip.createMany({ data: shipsToCreate });
  }

  // Store portal location in event globalState
  const currentState = (event.globalState as Record<string, unknown>) || {};
  await prisma.worldEvent.update({
    where: { id: eventId },
    data: {
      globalState: {
        ...currentState,
        portalCenter,
      } as Prisma.InputJsonValue,
    },
  });

  console.log(`🌀 Portal Zone spawned at (${portalCenter.x}, ${portalCenter.y}) with ${shipsToCreate.length} ships`);
}

/**
 * Calculate portal center position - find empty space away from black holes
 */
async function calculatePortalCenter(): Promise<{ x: number; y: number }> {
  const worldConfig = await prisma.worldConfig.findFirst();
  const maxX = worldConfig?.sizeX || 10000;
  const maxY = worldConfig?.sizeY || 10000;
  
  // Get all black holes to avoid
  const blackHoles = await prisma.blackHole.findMany();
  const blackHolePositions = blackHoles.map(bh => ({ x: bh.x, y: bh.y, radius: bh.radius }));
  
  // Portal should be at a fixed offset from world center to avoid black hole
  // Place it in the upper-right quadrant, away from center
  const baseX = Math.floor(maxX * 0.7); // 70% across
  const baseY = Math.floor(maxY * 0.3); // 30% down (upper area)
  
  // Check if this collides with any black hole
  const isSafe = (x: number, y: number) => {
    for (const bh of blackHolePositions) {
      const dist = Math.sqrt((x - bh.x) ** 2 + (y - bh.y) ** 2);
      if (dist < bh.radius + 200) return false; // 200 unit buffer
    }
    return true;
  };
  
  // If base position is safe, use it
  if (isSafe(baseX, baseY)) {
    return { x: baseX, y: baseY };
  }
  
  // Otherwise, try different positions
  const candidates = [
    { x: Math.floor(maxX * 0.25), y: Math.floor(maxY * 0.25) }, // Upper-left
    { x: Math.floor(maxX * 0.75), y: Math.floor(maxY * 0.75) }, // Lower-right
    { x: Math.floor(maxX * 0.25), y: Math.floor(maxY * 0.75) }, // Lower-left
    { x: Math.floor(maxX * 0.75), y: Math.floor(maxY * 0.25) }, // Upper-right
  ];
  
  for (const pos of candidates) {
    if (isSafe(pos.x, pos.y)) {
      return pos;
    }
  }
  
  // Fallback: just offset from center
  return {
    x: Math.floor(maxX / 2) + 500,
    y: Math.floor(maxY / 2) - 500,
  };
}

/**
 * Generate garrison for ship based on type and level
 */
function generateGarrison(shipType: ShipType, level: number): Record<string, number> {
  const template = config.garrisonTemplates[shipType];
  if (!template) return { marine: 10 };

  const garrison: Record<string, number> = {};

  for (const [unit, baseCount] of Object.entries(template.baseUnits)) {
    const perLevel = template.unitsPerLevel[unit] || 0;
    garrison[unit] = baseCount + perLevel * level;
  }

  return garrison;
}

// =============================================================================
// SHIP QUERIES
// =============================================================================

/**
 * Get all ships visible to a player (their ring + portal zone)
 */
export async function getVisibleShips(eventId: string, userId: string) {
  return prisma.eventShip.findMany({
    where: {
      eventId,
      isDefeated: false,
      OR: [
        { zoneType: 'portal' },
        { ownerUserId: userId },
      ],
    },
    orderBy: [{ zoneType: 'asc' }, { tier: 'asc' }],
  });
}

/**
 * Get a specific ship by ID
 */
export async function getEventShip(shipId: string) {
  return prisma.eventShip.findUnique({ where: { id: shipId } });
}

/**
 * Get the portal location for an event
 */
export async function getPortalLocation(eventId: string): Promise<{ x: number; y: number } | null> {
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (!event) return null;
  
  const globalState = event.globalState as Record<string, unknown>;
  if (globalState?.portalCenter) {
    return globalState.portalCenter as { x: number; y: number };
  }
  
  // Fallback: find mothership position
  const mothership = await prisma.eventShip.findFirst({
    where: { eventId, shipType: 'mothership' },
  });
  
  if (mothership) {
    return { x: mothership.x, y: mothership.y };
  }
  
  return null;
}

/**
 * Get the mothership for an event
 */
export async function getMothership(eventId: string) {
  return prisma.eventShip.findFirst({
    where: {
      eventId,
      shipType: 'mothership',
    },
  });
}

// =============================================================================
// SHIP RESPAWNING
// =============================================================================

/**
 * Process ship respawns for an event (called by recurring job)
 */
export async function processShipRespawns(eventId: string) {
  const now = new Date();

  const shipsToRespawn = await prisma.eventShip.findMany({
    where: {
      eventId,
      isDefeated: true,
      respawnAt: { lte: now },
      shipType: { not: 'mothership' }, // Mothership doesn't respawn normally
    },
  });

  let respawned = 0;

  for (const ship of shipsToRespawn) {
    // Regenerate garrison
    const newGarrison = generateGarrison(ship.shipType as ShipType, ship.level);

    // Reset position for player ring ships
    let newPosition = { x: ship.x, y: ship.y };
    if (ship.zoneType === 'player_ring' && ship.ownerUserId) {
      newPosition = await calculateNewRingPosition(ship.ownerUserId);
    }

    await prisma.eventShip.update({
      where: { id: ship.id },
      data: {
        isDefeated: false,
        attackCount: 0,
        respawnAt: null,
        garrison: newGarrison as unknown as Prisma.InputJsonValue,
        x: newPosition.x,
        y: newPosition.y,
      },
    });

    respawned++;
  }

  if (respawned > 0) {
    console.log(`🔄 Respawned ${respawned} event ships`);
  }

  return respawned;
}

/**
 * Calculate new ring position for a respawning ship
 */
async function calculateNewRingPosition(userId: string): Promise<{ x: number; y: number }> {
  const homePlanet = await prisma.planet.findFirst({
    where: { ownerId: userId, isNpc: false },
    orderBy: { createdAt: 'asc' },
  });

  if (!homePlanet) return { x: 0, y: 0 };

  const angle = Math.random() * 2 * Math.PI;
  const distance = config.distances.playerRingDistance;

  return {
    x: Math.floor(homePlanet.x + Math.cos(angle) * distance),
    y: Math.floor(homePlanet.y + Math.sin(angle) * distance),
  };
}

/**
 * Mark a ship as defeated and schedule respawn
 */
export async function defeatShip(shipId: string): Promise<void> {
  const ship = await prisma.eventShip.findUnique({ where: { id: shipId } });
  if (!ship) return;

  const tierConfig = config.shipTiers[ship.shipType as ShipType];
  const respawnMinutes = tierConfig?.respawnMinutes;

  const respawnAt = respawnMinutes
    ? new Date(Date.now() + respawnMinutes * 60 * 1000)
    : null;

  await prisma.eventShip.update({
    where: { id: shipId },
    data: {
      isDefeated: true,
      respawnAt,
    },
  });

  console.log(`💀 Ship ${ship.name} defeated, respawns at ${respawnAt?.toISOString() || 'never'}`);
}

/**
 * Increment attack count on a ship, defeat if max reached
 */
export async function incrementShipAttackCount(shipId: string): Promise<boolean> {
  const ship = await prisma.eventShip.findUnique({ where: { id: shipId } });
  if (!ship) return false;

  const newAttackCount = ship.attackCount + 1;
  const maxAttacks = ship.maxAttacks || 10;

  if (newAttackCount >= maxAttacks) {
    await defeatShip(shipId);
    return true; // Ship was defeated
  }

  await prisma.eventShip.update({
    where: { id: shipId },
    data: { attackCount: newAttackCount },
  });

  return false; // Ship still alive
}

// =============================================================================
// MOTHERSHIP MECHANICS
// =============================================================================

/**
 * Deal damage to mothership and track contribution
 */
export async function dealMothershipDamage(
  eventId: string,
  shipId: string,
  userId: string,
  damageDealt: number
): Promise<{ killed: boolean; newHp: number }> {
  const ship = await prisma.eventShip.findUnique({ where: { id: shipId } });
  if (!ship || ship.shipType !== 'mothership') {
    return { killed: false, newHp: 0 };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  // Record damage contribution
  await prisma.eventBossDamage.upsert({
    where: {
      eventId_bossShipId_userId: {
        eventId,
        bossShipId: shipId,
        userId,
      },
    },
    update: {
      damageDealt: { increment: damageDealt },
      attacksLanded: { increment: 1 },
    },
    create: {
      eventId,
      bossShipId: shipId,
      userId,
      coalitionId: user?.coalitionId,
      damageDealt,
      attacksLanded: 1,
    },
  });

  // Update mothership HP
  const currentHp = ship.currentHp || 0;
  const newHp = Math.max(0, currentHp - damageDealt);

  await prisma.eventShip.update({
    where: { id: shipId },
    data: { currentHp: newHp },
  });

  // Check if killed
  if (newHp <= 0) {
    await handleMothershipKill(eventId, shipId, userId);
    return { killed: true, newHp: 0 };
  }

  return { killed: false, newHp };
}

/**
 * Handle mothership kill - mark killing blow and update event state
 */
async function handleMothershipKill(eventId: string, shipId: string, killerId: string) {
  const killer = await prisma.user.findUnique({ where: { id: killerId } });

  // Mark killing blow
  await prisma.eventBossDamage.update({
    where: {
      eventId_bossShipId_userId: {
        eventId,
        bossShipId: shipId,
        userId: killerId,
      },
    },
    data: { wasKillingBlow: true },
  });

  // Mark ship as defeated
  await prisma.eventShip.update({
    where: { id: shipId },
    data: { isDefeated: true },
  });

  // Update event global state
  const event = await prisma.worldEvent.findUnique({ where: { id: eventId } });
  if (event) {
    const currentState = (event.globalState as Record<string, unknown>) || {};
    await prisma.worldEvent.update({
      where: { id: eventId },
      data: {
        globalState: {
          ...currentState,
          mothershipDefeated: true,
          mothershipKillerId: killerId,
          mothershipKillerCoalitionId: killer?.coalitionId || null,
        } as Prisma.InputJsonValue,
      },
    });
  }

  // Notify via socket
  const { socketService } = await import('../socketService');
  socketService.emitToAll('event:mothership-killed', {
    eventId,
    killerId,
    killerName: killer?.username,
  });

  console.log(`💀 MOTHERSHIP DEFEATED by ${killer?.username}!`);
}

/**
 * Apply daily weakening to mothership
 */
export async function applyMothershipWeakening(eventId: string, currentDay: number) {
  const weakening = config.mothership.dailyWeakening.find(w => w.day === currentDay);
  if (!weakening || weakening.defenseMultiplier === 1) return;

  const mothership = await getMothership(eventId);
  if (!mothership || mothership.isDefeated) return;

  // Reduce garrison based on weakening multiplier
  const currentGarrison = mothership.garrison as Record<string, number>;
  const weakenedGarrison: Record<string, number> = {};

  for (const [unit, count] of Object.entries(currentGarrison)) {
    weakenedGarrison[unit] = Math.floor(count * weakening.garrisonMultiplier);
  }

  await prisma.eventShip.update({
    where: { id: mothership.id },
    data: {
      garrison: weakenedGarrison as unknown as Prisma.InputJsonValue,
    },
  });

  console.log(`⚡ Mothership weakened on day ${currentDay}: ${Math.round(weakening.garrisonMultiplier * 100)}% garrison`);
}

// =============================================================================
// HELPERS
// =============================================================================

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get garrison for combat (converts stored JSON to usable format)
 */
export function getShipGarrison(ship: { garrison: unknown }): Record<string, number> {
  if (!ship.garrison) return {};
  if (typeof ship.garrison === 'string') {
    return JSON.parse(ship.garrison);
  }
  return ship.garrison as Record<string, number>;
}

/**
 * Clean up all ships for an event
 */
export async function cleanupEventShips(eventId: string) {
  const result = await prisma.eventShip.deleteMany({
    where: { eventId },
  });
  console.log(`🧹 Cleaned up ${result.count} event ships`);
}


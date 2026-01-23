/**
 * PVE Service
 * 
 * Handles NPC planet spawning, respawning, defense generation, and loot gear creation.
 */

import prisma from '../lib/prisma';
import {
    NPC_BALANCE,
    LOOT_BALANCE,
    MAP_CONFIG,
    GearRarity,
    NPC_THEMES,
    NPC_LOOT_RESOURCES,
    GEAR_NAME_PREFIXES,
    GEAR_NAME_SUFFIXES
} from '../constants/npcBalanceData';
import { getEligibleUniques } from '../constants/gearData';
import { getWorldBounds } from './worldService';

// NOTE: NPC_THEMES is now imported from npcBalanceData.ts

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a bell-curve distributed random number between min and max
 * Uses Box-Muller transform for normal distribution
 */
function rollBellCurveStat(min: number, max: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    // Box-Muller transform to get normal distribution
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    // Scale to roughly 0-1 range with most values in middle
    const normalized = 0.5 + z * 0.2; // ~95% within 0.1-0.9
    const clamped = Math.max(0, Math.min(1, normalized));
    return Math.round(min + clamped * (max - min));
}

/**
 * Weighted random selection from an object of { option: weight }
 */
function weightedRandom<T extends string | number>(options: Record<T, number>): T {
    const entries = Object.entries(options) as [T, number][];
    const total = entries.reduce((sum, [, w]) => sum + (w as number), 0);
    let roll = Math.random() * total;
    for (const [key, weight] of entries) {
        roll -= weight as number;
        if (roll <= 0) return key;
    }
    return entries[0][0];
}

/**
 * Shuffle array (Fisher-Yates)
 */
function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Select a rarity based on NPC level
 * Applies minimum level requirements and level-based weight multipliers
 */
function selectRarityForLevel(npcLevel: number): GearRarity {
    const { rarityWeights, rarityMinLevels, rarityLevelScaling } = LOOT_BALANCE;

    // Find matching level scaling tier (last one where level >= tier level)
    let multipliers: Record<GearRarity, number> = { common: 1, uncommon: 1, rare: 1, epic: 1, legendary: 1 };
    for (const tier of rarityLevelScaling) {
        if (npcLevel >= tier.level) {
            multipliers = tier.multipliers;
        }
    }

    // Build adjusted weights: base weight * multiplier, but 0 if below min level
    const adjustedWeights: Record<string, number> = {};
    for (const [rarity, baseWeight] of Object.entries(rarityWeights)) {
        const minLevel = rarityMinLevels[rarity as GearRarity];
        const multiplier = multipliers[rarity as GearRarity] || 0;

        if (npcLevel >= minLevel && multiplier > 0) {
            adjustedWeights[rarity] = baseWeight * multiplier;
        }
        // If below min level or multiplier is 0, don't add to options
    }

    // Ensure at least common is available as fallback
    if (Object.keys(adjustedWeights).length === 0) {
        adjustedWeights.common = 1;
    }

    return weightedRandom(adjustedWeights as Record<GearRarity, number>);
}

/**
 * Get or create the NPC system user
 */
async function getNpcUser() {
    let npcUser = await prisma.user.findUnique({ where: { username: 'NPC_PIRATES' } });
    if (!npcUser) {
        npcUser = await prisma.user.create({
            data: {
                username: 'NPC_PIRATES',
                email: 'npc@void.net',
                passwordHash: 'npc_secret',
            }
        });
    }
    return npcUser;
}

// =============================================================================
// GLOBAL RANDOM POSITION FINDING
// =============================================================================

/**
 * Find a random unoccupied position anywhere on the map
 * Uses current world bounds (does NOT trigger expansion)
 */
export async function findRandomGlobalPosition(maxAttempts = 50): Promise<{ x: number, y: number } | null> {
    const bounds = await getWorldBounds();
    const minDist = MAP_CONFIG.npcMinDistance;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const x = Math.floor(Math.random() * (bounds.maxX - 200) + 100);
        const y = Math.floor(Math.random() * (bounds.maxY - 200) + 100);

        const nearby = await prisma.planet.findFirst({
            where: {
                x: { gte: x - minDist, lte: x + minDist },
                y: { gte: y - minDist, lte: y + minDist }
            }
        });

        if (!nearby) {
            return { x, y };
        }
    }

    return null; // Couldn't find spot after max attempts
}

// =============================================================================
// GEAR GENERATION
// =============================================================================

/**
 * Generate a random gear piece for an NPC to drop
 * Uses bell curve for stats and weighted selection for rarity/modifiers
 */
export async function generateNpcLootGear(npcLevel: number, npcClass: string): Promise<string | null> {
    const npcUser = await getNpcUser();
    const { dropScalar, rarityWeights, statRanges, modifierCountWeights, uniqueDropRate } = LOOT_BALANCE;

    // Check if we should drop anything (dropScalar)
    if (dropScalar < 1 && Math.random() > dropScalar) {
        return null;
    }

    // Check for unique drop first
    if (Math.random() < uniqueDropRate) {
        const eligibleUniques = getEligibleUniques(npcClass, npcLevel);
        if (eligibleUniques.length > 0) {
            const unique = eligibleUniques[Math.floor(Math.random() * eligibleUniques.length)];
            const gear = await prisma.gearPiece.create({
                data: {
                    userId: npcUser.id,
                    slotType: unique.slotType,
                    name: unique.name,
                    rarity: unique.rarity,
                    level: unique.level,
                    meleeStrengthBonus: unique.meleeStrengthBonus,
                    rangedStrengthBonus: unique.rangedStrengthBonus,
                    canopyReductionBonus: unique.canopyReductionBonus,
                    setName: unique.setName,
                    iconName: unique.iconName,
                }
            });
            console.log(`🌟 Generated UNIQUE gear: ${unique.name} for NPC level ${npcLevel}`);
            return gear.id;
        }
    }

    // Regular gear generation with level-based rarity scaling
    const rarity = selectRarityForLevel(npcLevel);
    const slotType = LOOT_BALANCE.slotTypes[Math.floor(Math.random() * LOOT_BALANCE.slotTypes.length)];
    const range = statRanges[rarity];
    const modCount = weightedRandom(modifierCountWeights[rarity]);

    // Select which modifiers are active
    const allMods = ['melee', 'ranged', 'canopy'];
    const activeMods = modCount >= 3 ? allMods : shuffleArray(allMods).slice(0, Number(modCount));

    const stats = {
        meleeStrengthBonus: activeMods.includes('melee') ? rollBellCurveStat(range.min, range.max) : 0,
        rangedStrengthBonus: activeMods.includes('ranged') ? rollBellCurveStat(range.min, range.max) : 0,
        canopyReductionBonus: activeMods.includes('canopy') ? -rollBellCurveStat(range.min, range.max) : 0,
    };

    // Generate a themed name based on rarity and slot (names from npcBalanceData.ts)
    const prefix = GEAR_NAME_PREFIXES[rarity][Math.floor(Math.random() * GEAR_NAME_PREFIXES[rarity].length)];
    const suffixes = GEAR_NAME_SUFFIXES[slotType] || ['Gear'];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    const name = `${prefix} ${suffix}`;

    const gear = await prisma.gearPiece.create({
        data: {
            userId: npcUser.id,
            slotType,
            name,
            rarity,
            level: Math.max(1, Math.floor(npcLevel / 5)),
            ...stats,
            iconName: slotType,
        }
    });

    console.log(`⚙️ Generated ${rarity} ${slotType}: ${name} (mods: ${activeMods.join(', ')})`);
    return gear.id;
}

// =============================================================================
// DEFENSE GENERATION
// =============================================================================

/**
 * Generate dynamic defense layout for an NPC based on its level and class
 * Includes randomized lane distribution for variety
 */
export async function generateNpcDefense(planetId: string, level: number, npcClass: string) {
    const theme = NPC_THEMES[npcClass as keyof typeof NPC_THEMES];
    if (!theme) return;

    const { baseUnits, unitsPerLevel, toolUnlockLevel, toolCountScaling } = NPC_BALANCE.defenseScaling;
    const totalUnits = baseUnits + (level * unitsPerLevel);

    // Randomize lane distribution (30-50% variance for variety)
    const frontRatio = 0.35 + (Math.random() * 0.15);  // 35-50%
    const leftRatio = (1 - frontRatio) * (0.4 + Math.random() * 0.2);
    const rightRatio = 1 - frontRatio - leftRatio;

    // Determine available units based on level (unlock levels from NPC_THEMES)
    const themeUnlockLevels = theme.unitUnlockLevels || {};
    const availableUnits = theme.units.filter(u => {
        const unlockLevel = themeUnlockLevels[u];
        return !unlockLevel || level >= unlockLevel;
    });

    const distributeUnits = (count: number): Record<string, number> => {
        const lane: Record<string, number> = {};
        let remaining = count;

        // Randomized distribution across available unit types
        const shuffled = shuffleArray([...availableUnits]);
        shuffled.forEach((u, i) => {
            // Heavy units get a smaller allocation ratio (sentinel, guardian, brute are "heavy" types)
            const isHeavy = u === 'sentinel' || u === 'guardian' || u === 'brute';
            const ratio = isHeavy ? 0.2 + Math.random() * 0.1 : 0.4 + Math.random() * 0.2;
            const allocation = i === shuffled.length - 1 ? remaining : Math.floor(remaining * ratio);
            if (allocation > 0) {
                lane[u] = allocation;
                remaining -= allocation;
            }
        });
        return lane;
    };

    const front = distributeUnits(Math.floor(totalUnits * frontRatio));
    const left = distributeUnits(Math.floor(totalUnits * leftRatio));
    const right = distributeUnits(Math.floor(totalUnits * rightRatio));

    // Add tools at higher levels (future expansion)
    const toolCount = level >= toolUnlockLevel ? Math.floor(level * toolCountScaling) : 0;
    const tools: Record<string, number> = toolCount > 0 ? { sentry_drones: toolCount } : {};

    await prisma.defenseLayout.upsert({
        where: { planetId },
        update: {
            frontLaneJson: JSON.stringify({ units: front, tools }),
            leftLaneJson: JSON.stringify({ units: left, tools: {} }),
            rightLaneJson: JSON.stringify({ units: right, tools: {} }),
        },
        create: {
            planetId,
            frontLaneJson: JSON.stringify({ units: front, tools }),
            leftLaneJson: JSON.stringify({ units: left, tools: {} }),
            rightLaneJson: JSON.stringify({ units: right, tools: {} }),
        }
    });

    // Populate planet_units table
    const allUnits: Record<string, number> = {};
    [front, left, right].forEach(lane => {
        for (const [unit, count] of Object.entries(lane)) {
            allUnits[unit] = (allUnits[unit] || 0) + count;
        }
    });

    // Clear old units first
    await prisma.planetUnit.deleteMany({ where: { planetId } });

    for (const [unitType, count] of Object.entries(allUnits)) {
        if (count > 0) {
            await prisma.planetUnit.create({
                data: { planetId, unitType, count }
            });
        }
    }
}

// =============================================================================
// TROOP REGENERATION (Between Attacks)
// =============================================================================

/**
 * Calculate the troop multiplier for a given attack count
 * Uses decay formula: multiplier = decayMultiplier^attackCount
 * Clamped to minimum threshold
 */
export function calculateTroopDecayMultiplier(attackCount: number): number {
    const { decayMultiplier, minimumTroopPercent } = NPC_BALANCE.troopRegeneration;
    const rawMultiplier = Math.pow(decayMultiplier, attackCount);
    return Math.max(minimumTroopPercent, rawMultiplier);
}

/**
 * Regenerate NPC troops for the next attack
 * Called BEFORE combat resolution to ensure defenders are present
 * 
 * Uses decay-based scaling: each subsequent attack faces fewer troops
 * but never zero (minimum floor applies)
 */
export async function regenerateNpcTroops(planetId: string): Promise<void> {
    const planet = await prisma.planet.findUnique({ where: { id: planetId } });
    if (!planet || !planet.isNpc) return;

    const attackCount = planet.attackCount;
    const level = planet.npcLevel;
    const npcClass = planet.npcClass || 'melee';

    // Calculate decay multiplier based on how many times this NPC has been hit
    const troopMultiplier = calculateTroopDecayMultiplier(attackCount);

    // Get theme for unit composition
    const theme = NPC_THEMES[npcClass as keyof typeof NPC_THEMES];
    if (!theme) return;

    // Calculate base troops (what a fresh NPC would have)
    const { baseUnits, unitsPerLevel, toolUnlockLevel, toolCountScaling } = NPC_BALANCE.defenseScaling;
    const baseTroops = baseUnits + (level * unitsPerLevel);

    // Apply decay: this attack's troops
    const scaledTroops = Math.max(1, Math.floor(baseTroops * troopMultiplier));

    console.log(`🛡️ Regenerating NPC ${planetId} troops: ${scaledTroops}/${baseTroops} (${Math.round(troopMultiplier * 100)}% at attack #${attackCount + 1})`);

    // Randomize lane distribution (same logic as generateNpcDefense)
    const frontRatio = 0.35 + (Math.random() * 0.15);
    const leftRatio = (1 - frontRatio) * (0.4 + Math.random() * 0.2);
    const rightRatio = 1 - frontRatio - leftRatio;

    // Determine available units based on level
    const themeUnlockLevels = theme.unitUnlockLevels || {};
    const availableUnits = theme.units.filter(u => {
        const unlockLevel = themeUnlockLevels[u];
        return !unlockLevel || level >= unlockLevel;
    });

    // Distribute units across unit types
    const distributeUnits = (count: number): Record<string, number> => {
        const lane: Record<string, number> = {};
        let remaining = count;

        const shuffled = shuffleArray([...availableUnits]);
        shuffled.forEach((u, i) => {
            const isHeavy = u === 'sentinel' || u === 'guardian' || u === 'brute';
            const ratio = isHeavy ? 0.2 + Math.random() * 0.1 : 0.4 + Math.random() * 0.2;
            const allocation = i === shuffled.length - 1 ? remaining : Math.floor(remaining * ratio);
            if (allocation > 0) {
                lane[u] = allocation;
                remaining -= allocation;
            }
        });
        return lane;
    };

    const front = distributeUnits(Math.floor(scaledTroops * frontRatio));
    const left = distributeUnits(Math.floor(scaledTroops * leftRatio));
    const right = distributeUnits(Math.floor(scaledTroops * rightRatio));

    // Add tools at higher levels (scaled down too)
    const toolCount = level >= toolUnlockLevel ? Math.floor(level * toolCountScaling * troopMultiplier) : 0;
    const tools: Record<string, number> = toolCount > 0 ? { sentry_drones: toolCount } : {};

    // Update defense layout
    await prisma.defenseLayout.upsert({
        where: { planetId },
        update: {
            frontLaneJson: JSON.stringify({ units: front, tools }),
            leftLaneJson: JSON.stringify({ units: left, tools: {} }),
            rightLaneJson: JSON.stringify({ units: right, tools: {} }),
        },
        create: {
            planetId,
            frontLaneJson: JSON.stringify({ units: front, tools }),
            leftLaneJson: JSON.stringify({ units: left, tools: {} }),
            rightLaneJson: JSON.stringify({ units: right, tools: {} }),
        }
    });

    // Update planet_units table
    const allUnits: Record<string, number> = {};
    [front, left, right].forEach(lane => {
        for (const [unit, count] of Object.entries(lane)) {
            allUnits[unit] = (allUnits[unit] || 0) + count;
        }
    });

    // Clear old units and create new ones
    await prisma.planetUnit.deleteMany({ where: { planetId } });

    for (const [unitType, count] of Object.entries(allUnits)) {
        if (count > 0) {
            await prisma.planetUnit.create({
                data: { planetId, unitType, count }
            });
        }
    }
}

// =============================================================================
// LOOT CALCULATION (Distributed across attacks)
// =============================================================================

/**
 * Calculate how much loot is available for a specific attack
 * Uses decay-based distribution: first hit gets most, subsequent hits get less
 * but there's always something to loot until the NPC resets
 * 
 * @param baseLoot - The base loot amount for this resource (from NPC level)
 * @param attackCount - Current attack count (0-indexed, this is the attack about to happen)
 * @param maxAttacks - Maximum attacks before NPC resets
 * @returns The loot available for this specific attack
 */
export function calculateLootForAttack(
    baseLoot: number, 
    attackCount: number, 
    maxAttacks: number
): number {
    const { lootPercentPerHit, minimumLootPercent } = NPC_BALANCE.lootDistribution;

    // Calculate remaining loot after previous attacks
    // Each attack takes lootPercentPerHit of what remains
    let remaining = baseLoot;
    for (let i = 0; i < attackCount; i++) {
        const taken = remaining * lootPercentPerHit;
        remaining -= taken;
    }

    // This attack takes lootPercentPerHit of remaining
    const thisHitLoot = remaining * lootPercentPerHit;

    // Ensure minimum loot (prevents near-zero loot on later hits)
    const minimumLoot = baseLoot * minimumLootPercent;

    return Math.max(minimumLoot, Math.floor(thisHitLoot));
}

/**
 * Get the available loot for an NPC at its current attack state
 * Returns what the attacker can potentially take on this hit
 */
export async function getAvailableLootForNpc(planetId: string): Promise<{
    carbon: number;
    titanium: number;
    food: number;
    credits: number;
}> {
    const planet = await prisma.planet.findUnique({ where: { id: planetId } });
    if (!planet || !planet.isNpc) {
        return { carbon: 0, titanium: 0, food: 0, credits: 0 };
    }

    const attackCount = planet.attackCount;
    const maxAttacks = planet.maxAttacks || 10;
    const level = planet.npcLevel;
    const npcClass = planet.npcClass || 'melee';

    // Calculate base loot from level (same formula as spawn)
    const lootRes = NPC_LOOT_RESOURCES;
    const levelScale = level / lootRes.levelDivisor;

    let baseCarbon = lootRes.baseCarbon * levelScale;
    let baseTitanium = lootRes.baseTitanium * levelScale;
    let baseFood = lootRes.baseFood * levelScale;
    const baseCredits = lootRes.baseCredits * levelScale;

    // Apply archetype multipliers
    if (npcClass === 'melee') baseCarbon *= lootRes.archetypeMultiplier;
    if (npcClass === 'robotic') baseTitanium *= lootRes.archetypeMultiplier;
    if (npcClass === 'ranged') baseFood *= lootRes.archetypeMultiplier;

    // Calculate loot for this specific attack
    return {
        carbon: calculateLootForAttack(baseCarbon, attackCount, maxAttacks),
        titanium: calculateLootForAttack(baseTitanium, attackCount, maxAttacks),
        food: calculateLootForAttack(baseFood, attackCount, maxAttacks),
        credits: Math.floor(baseCredits * NPC_BALANCE.lootDistribution.creditsPerHit),
    };
}

// =============================================================================
// NPC SPAWNING & RESPAWNING
// =============================================================================

/**
 * Spawn starter NPCs around a new player's starting position
 */
export async function spawnPirateBases(ownerId: string, centerX: number, centerY: number) {
    const npcUser = await getNpcUser();
    const { starterNpcs } = NPC_BALANCE;
    const spawnRadius = MAP_CONFIG.npcSpawnRadius;
    const minDist = MAP_CONFIG.npcMinDistance;

    const count = starterNpcs.count.min + Math.floor(Math.random() * (starterNpcs.count.max - starterNpcs.count.min + 1));
    let spawned = 0;
    let attempts = 0;

    const classes = ['melee', 'ranged', 'robotic'];

    while (spawned < count && attempts < 20) {
        attempts++;

        const angle = Math.random() * Math.PI * 2;
        const dist = spawnRadius.min + Math.random() * (spawnRadius.max - spawnRadius.min);

        const x = Math.floor(centerX + Math.cos(angle) * dist);
        const y = Math.floor(centerY + Math.sin(angle) * dist);

        const nearby = await prisma.planet.findFirst({
            where: {
                x: { gte: x - minDist, lte: x + minDist },
                y: { gte: y - minDist, lte: y + minDist }
            }
        });

        if (!nearby) {
            const level = starterNpcs.levelRange.min + Math.floor(Math.random() * (starterNpcs.levelRange.max - starterNpcs.levelRange.min + 1));
            const npcClass = classes[Math.floor(Math.random() * classes.length)];
            const theme = NPC_THEMES[npcClass];

            // Specialized Loot based on archetype (formulas from npcBalanceData.ts)
            const lootRes = NPC_LOOT_RESOURCES;
            const levelScale = level / lootRes.levelDivisor;
            let carbon = lootRes.baseCarbon * levelScale;
            let titanium = lootRes.baseTitanium * levelScale;
            let food = lootRes.baseFood * levelScale;
            const credits = lootRes.baseCredits * levelScale;

            if (npcClass === 'melee') carbon *= lootRes.archetypeMultiplier;
            if (npcClass === 'robotic') titanium *= lootRes.archetypeMultiplier;
            if (npcClass === 'ranged') food *= lootRes.archetypeMultiplier;

            const maxAttacks = starterNpcs.maxAttacks.min + Math.floor(Math.random() * (starterNpcs.maxAttacks.max - starterNpcs.maxAttacks.min + 1));

            // Generate loot gear for this NPC
            const lootGearId = await generateNpcLootGear(level, npcClass);

            const planet = await prisma.planet.create({
                data: {
                    ownerId: npcUser.id,
                    name: `${theme.name} (Lvl ${level})`,
                    x,
                    y,
                    isNpc: true,
                    npcLevel: level,
                    npcClass,
                    carbon,
                    titanium,
                    food,
                    credits,
                    maxAttacks,
                    attackCount: 0,
                    npcLootGearId: lootGearId,
                    npcRespawnCount: 0,
                }
            });

            await generateNpcDefense(planet.id, level, npcClass);
            spawned++;
        }
    }
}

/**
 * Relocate an NPC to a NEW RANDOM GLOBAL location with level scaling
 * Called when NPC reaches max attacks (via job queue after delay)
 */
export async function relocateNpc(planetId: string) {
    const planet = await prisma.planet.findUnique({ where: { id: planetId } });
    if (!planet || !planet.isNpc) return;

    // Find a random global position
    const position = await findRandomGlobalPosition();
    if (!position) {
        console.warn(`⚠️ Could not find empty position for NPC ${planetId}, skipping relocation`);
        return;
    }

    // Calculate new level (current + scaling increment)
    const newLevel = planet.npcLevel + NPC_BALANCE.levelScaling.baseIncrement;
    const theme = NPC_THEMES[planet.npcClass as keyof typeof NPC_THEMES];

    // Generate new loot gear for this life
    const lootGearId = await generateNpcLootGear(newLevel, planet.npcClass || 'melee');

    // Calculate new resources based on level (formulas from npcBalanceData.ts)
    const lootRes = NPC_LOOT_RESOURCES;
    const levelScale = newLevel / lootRes.levelDivisor;
    const baseResource = lootRes.baseCarbon * levelScale;
    const carbon = baseResource * (planet.npcClass === 'melee' ? lootRes.archetypeMultiplier : 1);
    const titanium = baseResource * (planet.npcClass === 'robotic' ? lootRes.archetypeMultiplier : 1);
    const food = baseResource * (planet.npcClass === 'ranged' ? lootRes.archetypeMultiplier : 1);
    const credits = lootRes.baseCredits * levelScale;

    // Random new max attacks (from NPC_BALANCE config)
    const attackRange = NPC_BALANCE.starterNpcs?.maxAttacks || { min: 10, max: 20 };
    const maxAttacks = attackRange.min + Math.floor(Math.random() * (attackRange.max - attackRange.min + 1));

    await prisma.planet.update({
        where: { id: planetId },
        data: {
            x: position.x,
            y: position.y,
            npcLevel: newLevel,
            name: theme ? `${theme.name} (Lvl ${newLevel})` : planet.name,
            attackCount: 0,
            maxAttacks,
            carbon,
            titanium,
            food,
            credits,
            npcLootGearId: lootGearId,
            npcRespawnCount: { increment: 1 },
        }
    });

    // Generate fresh defenses for new level
    await generateNpcDefense(planetId, newLevel, planet.npcClass || 'melee');

    console.log(`🔄 NPC ${planetId} relocated to (${position.x}, ${position.y}) at level ${newLevel}`);
}

// =============================================================================
// MIGRATION
// =============================================================================

/**
 * One-time migration to theme existing NPCs and add loot gear
 */
export async function migrateExistingNpcs() {
    const npcs = await prisma.planet.findMany({
        where: {
            isNpc: true,
            OR: [
                { npcClass: null },
                { name: { contains: 'Pirate Outpost' } },
                { npcLootGearId: null },
            ]
        }
    });

    if (npcs.length === 0) return;

    console.log(`🔧 Migrating ${npcs.length} existing NPCs...`);
    const classes = ['melee', 'ranged', 'robotic'];

    for (const npc of npcs) {
        const npcClass = npc.npcClass || classes[Math.floor(Math.random() * classes.length)];
        const theme = NPC_THEMES[npcClass];
        const level = npc.npcLevel < 10 ? npc.npcLevel * 10 || 10 : npc.npcLevel;

        // Generate loot gear if missing
        let lootGearId = npc.npcLootGearId;
        if (!lootGearId) {
            lootGearId = await generateNpcLootGear(level, npcClass);
        }

        await prisma.planet.update({
            where: { id: npc.id },
            data: {
                npcClass,
                npcLevel: level,
                name: `${theme.name} (Lvl ${level})`,
                carbon: (level / 10) * 500 * (npcClass === 'melee' ? 5 : 1),
                titanium: (level / 10) * 500 * (npcClass === 'robotic' ? 5 : 1),
                food: (level / 10) * 500 * (npcClass === 'ranged' ? 5 : 1),
                credits: (level / 10) * 100,
                maxAttacks: npc.maxAttacks || 10 + Math.floor(Math.random() * 11),
                attackCount: 0,
                npcLootGearId: lootGearId,
            }
        });

        await generateNpcDefense(npc.id, level, npcClass);
    }
    console.log('✅ NPC migration complete.');
}

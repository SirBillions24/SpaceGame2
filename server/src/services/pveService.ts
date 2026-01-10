import prisma from '../lib/prisma';

const NPC_THEMES: Record<string, { name: string, units: string[], primaryLoot: string }> = {
    melee: {
        name: 'Raider Outpost',
        units: ['marine', 'sentinel'],
        primaryLoot: 'carbon'
    },
    ranged: {
        name: 'Sniper Den',
        units: ['ranger'],
        primaryLoot: 'food'
    },
    robotic: {
        name: 'Automaton Forge',
        units: ['interceptor', 'droid_decoy', 'heavy_automaton'],
        primaryLoot: 'titanium'
    }
};

/**
 * Generate a random defense layout for an NPC based on its class
 */
export async function generateNpcDefense(planetId: string, level: number, npcClass: string) {
    const theme = NPC_THEMES[npcClass as keyof typeof NPC_THEMES];
    if (!theme) return;

    // Scaling: more units as level increases
    // Base units = 10 + (level * 5)
    const baseUnits = 10 + (level * 5);
    
    // Determine which units to use based on level
    const availableUnits = theme.units.filter(u => {
        if (u === 'sentinel' && level < 10) return false;
        if (u === 'heavy_automaton' && level < 20) return false;
        return true;
    });

    const generateLane = (count: number) => {
        const lane: Record<string, number> = {};
        let remaining = count;
        
        // Simple distribution: mostly common units, some heavy if available
        availableUnits.reverse().forEach(u => {
            const isHeavy = u === 'sentinel' || u === 'heavy_automaton';
            const allocation = isHeavy ? Math.floor(remaining * 0.3) : remaining;
            if (allocation > 0) {
                lane[u] = allocation;
                remaining -= allocation;
            }
        });
        return lane;
    };

    const front = generateLane(Math.floor(baseUnits * 0.4));
    const left = generateLane(Math.floor(baseUnits * 0.3));
    const right = generateLane(Math.floor(baseUnits * 0.3));

    await prisma.defenseLayout.upsert({
        where: { planetId },
        update: {
            frontLaneJson: JSON.stringify(front),
            leftLaneJson: JSON.stringify(left),
            rightLaneJson: JSON.stringify(right),
        },
        create: {
            planetId,
            frontLaneJson: JSON.stringify(front),
            leftLaneJson: JSON.stringify(left),
            rightLaneJson: JSON.stringify(right),
        }
    });

    // Populate planet_units table
    const allUnits: Record<string, number> = {};
    [front, left, right].forEach(lane => {
        for (const [unit, count] of Object.entries(lane)) {
            allUnits[unit] = (allUnits[unit] || 0) + count;
        }
    });

    for (const [unitType, count] of Object.entries(allUnits)) {
        if (count > 0) {
            await prisma.planetUnit.upsert({
                where: { planetId_unitType: { planetId, unitType } },
                update: { count },
                create: { planetId, unitType, count }
            });
        }
    }
}

/**
 * Spawn Pirate Bases around a central point
 */
export async function spawnPirateBases(ownerId: string, centerX: number, centerY: number) {
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

    const count = Math.floor(Math.random() * 3) + 3; // 3 to 5
    let spawned = 0;
    let attempts = 0;

    const classes = ['melee', 'ranged', 'robotic'];

    while (spawned < count && attempts < 20) {
        attempts++;

        const angle = Math.random() * Math.PI * 2;
        const dist = 150 + Math.random() * 150;

        const x = Math.floor(centerX + Math.cos(angle) * dist);
        const y = Math.floor(centerY + Math.sin(angle) * dist);

        const nearby = await prisma.planet.findFirst({
            where: {
                x: { gte: x - 100, lte: x + 100 },
                y: { gte: y - 100, lte: y + 100 }
            }
        });

        if (!nearby) {
            const level = (Math.floor(Math.random() * 3) + 1) * 10; // Levels 10, 20, 30
            const npcClass = classes[Math.floor(Math.random() * classes.length)];
            const theme = NPC_THEMES[npcClass];
            
            // Specialized Loot
            let carbon = 500 * (level / 10);
            let titanium = 500 * (level / 10);
            let food = 500 * (level / 10);
            let credits = 100 * (level / 10);

            if (npcClass === 'melee') carbon *= 5;
            if (npcClass === 'robotic') titanium *= 5;
            if (npcClass === 'ranged') food *= 5;

            const maxAttacks = Math.floor(Math.random() * 11) + 10; // 10 to 20

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
                    attackCount: 0
                }
            });

            await generateNpcDefense(planet.id, level, npcClass);
            spawned++;
        }
    }
}

/**
 * Relocate an NPC outpost to a new location
 */
export async function relocateNpc(planetId: string) {
    const planet = await prisma.planet.findUnique({ where: { id: planetId } });
    if (!planet || !planet.isNpc) return;

    // Find a new location nearby its current one (or random)
    const angle = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 150;
    const x = Math.floor(planet.x + Math.cos(angle) * dist);
    const y = Math.floor(planet.y + Math.sin(angle) * dist);

    // Collision check
    const nearby = await prisma.planet.findFirst({
        where: {
            x: { gte: x - 50, lte: x + 50 },
            y: { gte: y - 50, lte: y + 50 }
        }
    });

    if (nearby) {
        // Just try again recursively or skip for this tick? 
        // Let's just use random world coords if collision happens to ensure it moves
        return; // For now just skip, worker will try again or we can improve
    }

    const maxAttacks = Math.floor(Math.random() * 11) + 10;
    const theme = NPC_THEMES[planet.npcClass as keyof typeof NPC_THEMES];

    // Update current planet to new location and reset hits
    await prisma.planet.update({
        where: { id: planetId },
        data: {
            x,
            y,
            name: theme ? `${theme.name} (Lvl ${planet.npcLevel})` : planet.name,
            attackCount: 0,
            maxAttacks,
            // Regenerate resources?
            carbon: planet.npcLevel ? 500 * (planet.npcLevel / 10) * (planet.npcClass === 'melee' ? 5 : 1) : 500,
            titanium: planet.npcLevel ? 500 * (planet.npcLevel / 10) * (planet.npcClass === 'robotic' ? 5 : 1) : 500,
            food: planet.npcLevel ? 500 * (planet.npcLevel / 10) * (planet.npcClass === 'ranged' ? 5 : 1) : 500,
            credits: planet.npcLevel ? 100 * (planet.npcLevel / 10) : 100,
        }
    });

    // Also regenerate defense? 
    if (planet.npcLevel && planet.npcClass) {
        await generateNpcDefense(planetId, planet.npcLevel, planet.npcClass);
    }
}

/**
 * One-time migration to theme existing NPCs
 */
export async function migrateExistingNpcs() {
    const npcs = await prisma.planet.findMany({
        where: { 
            isNpc: true,
            OR: [
                { npcClass: null },
                { name: { contains: 'Pirate Outpost' } }
            ]
        }
    });

    if (npcs.length === 0) return;

    console.log(`🔧 Migrating ${npcs.length} existing NPCs to new theme system...`);
    const classes = ['melee', 'ranged', 'robotic'];

    for (const npc of npcs) {
        const npcClass = npc.npcClass || classes[Math.floor(Math.random() * classes.length)];
        const theme = NPC_THEMES[npcClass];
        // Convert old Lvl 1/2/3 to 10/20/30
        const level = npc.npcLevel < 10 ? npc.npcLevel * 10 || 10 : npc.npcLevel;

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
                maxAttacks: npc.maxAttacks || Math.floor(Math.random() * 11) + 10,
                attackCount: 0
            }
        });

        await generateNpcDefense(npc.id, level, npcClass);
    }
    console.log('✅ NPC migration complete.');
}

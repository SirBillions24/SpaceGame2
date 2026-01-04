import prisma from '../lib/prisma';

const NPC_NAMES = [
    'Pirate Outpost', 'Raider Base', 'Smuggler Den', 'Mercenary Camp', 'Rogue Station'
];

/**
 * Generate a random defense layout for an NPC
 */
export async function generateNpcDefense(planetId: string, level: number) {
    // Simple logic: higher level = more units
    const baseUnits = level * 10;

    // Distribute units roughly evenly
    const front = { marine: Math.floor(baseUnits * 0.4), ranger: Math.floor(baseUnits * 0.3) };
    const left = { marine: Math.floor(baseUnits * 0.3), ranger: Math.floor(baseUnits * 0.2) };
    const right = { marine: Math.floor(baseUnits * 0.3), ranger: Math.floor(baseUnits * 0.2) };

    await prisma.defenseLayout.create({
        data: {
            planetId,
            frontLaneJson: JSON.stringify(front),
            leftLaneJson: JSON.stringify(left),
            rightLaneJson: JSON.stringify(right),
        }
    });

    // Also populate the planet_units table for the "Fleet Preview" or looting calculations
    // In a real game, these would need to match. For now, we just ensure they exist.
    const allUnits = { ...front, ...left, ...right };

    // Note: We'd need to upsert these into PlanetUnit if we want them visible in scans
    // For MVP, the defense layout is what matters for combat.
}

/**
 * Spawn Pirate Bases around a central point
 */
export async function spawnPirateBases(ownerId: string, centerX: number, centerY: number) {
    // Create a dummy user for NPCs if not exists? 
    // Actually, we can just assign them to a system NPC user or the player itself but marked as NPC?
    // Better: Create a dedicated NPC user once.

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

    // Spawn 3 bases at random offsets
    // Spawn 3-5 bases at random offsets in a safe ring
    const count = Math.floor(Math.random() * 3) + 3; // 3 to 5
    let spawned = 0;
    let attempts = 0;

    while (spawned < count && attempts < 20) {
        attempts++;

        // Random angle
        const angle = Math.random() * Math.PI * 2;
        // Random distance between 150 and 300 (visually safe but nearby)
        const dist = 150 + Math.random() * 150;

        const x = Math.floor(centerX + Math.cos(angle) * dist);
        const y = Math.floor(centerY + Math.sin(angle) * dist);

        // Check collision (using same logic as planetService roughly)
        // We do a quick DB check here or rely on the fact that distance is large enough from center
        // But we should check against other NPCs we just spawned?
        // For MVP, just checking DB for *any* planet is safest.

        const nearby = await prisma.planet.findFirst({
            where: {
                x: { gte: x - 100, lte: x + 100 },
                y: { gte: y - 100, lte: y + 100 }
            }
        });

        if (!nearby) {
            const level = Math.floor(Math.random() * 3) + 1; // Level 1-3
            const name = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];

            const planet = await prisma.planet.create({
                data: {
                    ownerId: npcUser.id,
                    name: `${name} (Lvl ${level})`,
                    x,
                    y,
                    isNpc: true,
                    npcLevel: level,
                    carbon: 1000 * level,
                    titanium: 1000 * level,
                    credits: 100 * level,
                }
            });

            await generateNpcDefense(planet.id, level);
            spawned++;
        }
    }
}

import prisma from '../src/lib/prisma';
import { spawnPirateBases } from '../src/services/pveService';

async function main() {
    console.log('Spawning initial NPCs for all existing user planets...');

    const userPlanets = await prisma.planet.findMany({
        where: { isNpc: false }
    });

    console.log(`Found ${userPlanets.length} user planets.`);

    for (const p of userPlanets) {
        console.log(`Checking/Spawning NPCs for ${p.name} (${p.x}, ${p.y})...`);
        await spawnPirateBases(p.ownerId, p.x, p.y);
    }

    console.log('Done.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });

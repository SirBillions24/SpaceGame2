
import { PrismaClient } from '@prisma/client';
import { produceTool, processManufacturingQueue } from '../services/toolService';
import { placeBuilding, syncPlanetResources } from '../services/planetService';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Verifying Tool Production ---');

    // 1. Setup User & Planet
    const username = `tool_tester_${Date.now()}`;
    const user = await prisma.user.create({
        data: {
            username,
            email: `${username}@test.com`,
            passwordHash: 'hash',
            planets: {
                create: {
                    name: 'Workshop Prime',
                    x: Math.floor(Math.random() * 1000),
                    y: Math.floor(Math.random() * 1000),
                    carbon: 1000,
                    titanium: 1000,
                    credits: 1000
                }
            }
        },
        include: { planets: true }
    });
    const planetId = user.planets[0].id;
    console.log(`Created user ${username} and planet ${planetId}`);

    // 2. Build Workshop
    console.log('Building Defense Workshop...');
    await placeBuilding(planetId, 'defense_workshop', 2, 2);

    // Hack: Force building to complete immediately for testing
    await prisma.building.updateMany({
        where: { planetId },
        data: { status: 'active' }
    });

    // 3. Manufacture Tool
    console.log('Manufacturing 5 Auto-Turrets...');
    await produceTool(planetId, 'auto_turret', 5);

    // 4. Verify Queue
    let planet = await prisma.planet.findUnique({ where: { id: planetId } });
    const queue = JSON.parse(planet?.manufacturingQueue || '[]');
    console.log('Queue:', queue);

    if (queue.length !== 1 || queue[0].tool !== 'auto_turret' || queue[0].count !== 5) {
        throw new Error('Queue verification failed');
    }

    // 5. Fast Forward Time & Process
    console.log('Fast forwarding time...');
    // Setting finish time to past
    const past = new Date(Date.now() - 10000).toISOString();
    queue[0].finishTime = past;

    await prisma.planet.update({
        where: { id: planetId },
        data: { manufacturingQueue: JSON.stringify(queue) }
    });

    // Process
    console.log('Processing Queue...');
    planet = await prisma.planet.findUnique({ where: { id: planetId } });
    await processManufacturingQueue(planet);

    // 6. Verify Inventory
    const inventory = await prisma.toolInventory.findUnique({
        where: {
            planetId_toolType: {
                planetId: planetId,
                toolType: 'auto_turret'
            }
        }
    });

    console.log('Inventory:', inventory);
    if (!inventory || inventory.count !== 5) {
        throw new Error('Inventory verification failed. Expected 5 auto_turrets.');
    }

    console.log('✅ Tool Production Verified Successfully');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

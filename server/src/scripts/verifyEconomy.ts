
import prisma from '../lib/prisma';
import { syncPlanetResources, spawnPlanet } from '../services/planetService';

const runTest = async (name: string, fn: () => Promise<void>) => {
    try {
        console.log(`\nRUNNING: ${name}`);
        await fn();
        console.log(`[PASS] ${name}`);
    } catch (e) {
        console.error(`[FAIL] ${name}`);
        console.error(e);
    }
};

const assert = (condition: boolean, msg: string) => {
    if (!condition) throw new Error(msg);
};

async function main() {
    // Setup: Create a test user and planet
    const username = `test_eco_${Date.now()}`;
    const user = await prisma.user.create({
        data: {
            username,
            email: `${username}@test.com`,
            passwordHash: 'test',
        }
    });

    await spawnPlanet(user.id, username, 'NW');
    const planet = await prisma.planet.findFirst({ where: { ownerId: user.id } });
    if (!planet) throw new Error("Failed to spawn planet");

    await runTest("Stability Affects Production", async () => {
        // Base production is 100 (plus buildings). Let's assume just base for simplicity or check current rates.
        // Actually, we can check the DELTA.

        // precise setup: Set stability to 50.
        await prisma.planet.update({
            where: { id: planet.id },
            data: {
                stability: 50,
                carbon: 0,
                lastResourceUpdate: new Date(),
                // Remove buildings to ensure just Base Rate (100)
                // Actually safer to just rely on logic: Rate * 0.5
            }
        });

        // Wait 1 second (simulated by backdating lastUpdate by 1 hour)
        const oneHourAgo = new Date(Date.now() - 3600 * 1000);
        await prisma.planet.update({
            where: { id: planet.id },
            data: { lastResourceUpdate: oneHourAgo }
        });

        const synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error("Sync failed");

        // Expected: Base 100 * 0.5 = 50. Plus whatever buildings produced.
        // Let's check if it's LESS than Base 100 * 1.0.
        // With starting buildings (lvl 1 -> +50), total base ~150.
        // 50% stability -> 75.
        // If it was 100% stability -> 150.

        console.log(`Stability 50% -> Carbon: ${synced.carbon.toFixed(2)} (Expected ~half of normal)`);

        // It's hard to assert exact number without knowing building RNG, but distinctively < 100 if base is 100.
        // Let's assert it is roughly 50-80 range (Starter buildings: 1 Carbon Proc = +50. Base 100. Total 150. Half = 75).
        assert(synced.carbon > 70 && synced.carbon < 80, `Carbon should be around 75, got ${synced.carbon}`);
    });

    await runTest("Desertion Logic", async () => {
        // 1. Give 1000 Marines.
        // 2. Set Food to 0.
        // 3. Backdate 1 hour.
        // 4. Expected: Consumption = 1000 * 4 = 4000.
        // 5. Production (Stability 50) ~ 75.
        // 6. Sustainable = 75 / 4 = 18 units.
        // 7. Desertion should leave ~18-19 units.

        // Update existing marines or create if missing (though spawnPlanet creates them)
        await prisma.planetUnit.upsert({
            where: {
                planetId_unitType: {
                    planetId: planet.id,
                    unitType: 'marine'
                }
            },
            update: { count: 1000 },
            create: {
                planetId: planet.id,
                unitType: 'marine',
                count: 1000
            }
        });

        await prisma.planet.update({
            where: { id: planet.id },
            data: {
                food: 0,
                lastResourceUpdate: new Date(Date.now() - 3600 * 1000) // 1 hr ago
            }
        });

        const synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error("Sync failed");

        const marineCount = synced.units.find(u => u.unitType === 'marine')?.count || 0;
        console.log(`Desertion Test: Started with 1000, Remaining: ${marineCount}`);

        assert(marineCount < 50, `Most troops should have deserted! Got ${marineCount}`);
        assert(marineCount > 0, `Some troops should remain (sustainable). Got ${marineCount}`);
    });

    // Cleanup
    await prisma.user.delete({ where: { id: user.id } });
}

main().catch(console.error);

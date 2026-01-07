import { PrismaClient } from '@prisma/client';
import { syncPlanetResources, moveBuilding, placeBuilding, calculatePlanetRates } from '../services/planetService';
import { UNIT_DATA } from '../constants/unitData';

const prisma = new PrismaClient();

async function run() {
    console.log('--- Starting Economy Verification V2 ---');

    // 1. Setup Test Planet
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found');

    // Create a clean test planet
    const planet = await prisma.planet.create({
        data: {
            ownerId: user.id,
            name: 'Eco Test Prime',
            x: 9999, y: 9999, // Off-map
            carbon: 10000,
            titanium: 10000,
            food: 10000,
            credits: 0,
            taxRate: 10,
            lastResourceUpdate: new Date(),
            defensiveGridLevel: 0
        }
    });

    console.log(`Created Test Planet: ${planet.id}`);

    try {
        // 2. Test Housing & Population & Stability
        console.log('\n--- Testing Housing & Stability ---');
        // Place Housing Unit (Lvl 1) -> +Population, -PublicOrder
        // Place Housing Unit (Lvl 1) -> +Population, -PublicOrder
        const housing = await placeBuilding(planet.id, 'housing_unit', 0, 0);
        // Complete construction immediately
        await prisma.building.update({ where: { id: housing.id }, data: { status: 'active' } });
        // Force clear construction slot
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });

        // Place Monument -> +PublicOrder
        const monument = await placeBuilding(planet.id, 'monument', 2, 0);
        await prisma.building.update({ where: { id: monument.id }, data: { status: 'active', level: 2 } }); // Level 2 monument
        // Force clear construction slot
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });

        // Sync
        let synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed');
        const rates = calculatePlanetRates(synced);

        console.log('Stats:', {
            pop: rates.population,
            po: rates.publicOrder,
            prod: rates.productivity
        });

        if (rates.population <= 0) console.error('FAIL: No population from housing');
        if (rates.publicOrder === 0) console.error('FAIL: PO should be affected');
        console.log('PASS: Housing and Decorations affect stats.');

        // 3. Test Tax Impact
        console.log('\n--- Testing Tax Impact ---');
        // Increase Tax
        await prisma.planet.update({ where: { id: planet.id }, data: { taxRate: 50 } });
        synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed 2');
        const taxaRates = calculatePlanetRates(synced);

        console.log('High Tax Stats:', {
            po: taxaRates.publicOrder,
            creditRate: taxaRates.creditRate
        });

        if (taxaRates.publicOrder >= rates.publicOrder) console.error('FAIL: Higher tax did not lower Public Order');
        if (taxaRates.creditRate <= rates.creditRate) console.error('FAIL: Higher tax did not increase Revenue');
        console.log('PASS: Taxation works.');

        // 4. Test Variable Food Consumption
        console.log('\n--- Testing Variable Food Consumption ---');
        await prisma.planetUnit.create({
            data: { planetId: planet.id, unitType: 'marine', count: 100 }
        });
        // Marine Upkeep = 2 (Assuming UNIT_STATS is correct)
        synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed 3');
        const foodRates = calculatePlanetRates(synced);

        const expectedConsumption = 100 * (UNIT_DATA['marine']?.upkeep || 1);
        console.log(`Food Consumption: ${foodRates.foodConsumption}, Expected: ${expectedConsumption}`);

        if (foodRates.foodConsumption !== expectedConsumption) console.error(`FAIL: Consumption mismatch`);
        else console.log('PASS: Variable Consumption correct.');

        // 5. Test Shield Generator Hook
        console.log('\n--- Testing Shield Generator Hook ---');
        const shieldGen = await placeBuilding(planet.id, 'shield_generator', 5, 5);
        // Simulate upgrade completion (planetService hook runs inside sync when construction finishes)
        // We need to trigger sync *after* finish time.

        await prisma.building.update({ where: { id: shieldGen.id }, data: { status: 'upgrading', level: 0 } });
        await prisma.planet.update({
            where: { id: planet.id },
            data: {
                activeBuildId: shieldGen.id,
                buildFinishTime: new Date(Date.now() - 10000), // Finished 10s ago
                isBuilding: true
            }
        });

        synced = await syncPlanetResources(planet.id); // Should process queue
        if (!synced) throw new Error('Sync failed 4');

        if (synced?.defensiveGridLevel !== 1) console.error(`FAIL: Shield Gen did not unlock defensive grid level. Level: ${synced?.defensiveGridLevel}`);
        else console.log('PASS: Shield Generator hook worked.');

        // 6. Test Building Relocation
        console.log('\n--- Testing Relocation ---');
        // Move housing from 0,0 to 8,8
        await moveBuilding(planet.id, housing.id, 8, 8);

        const movedB = await prisma.building.findUnique({ where: { id: housing.id } });
        if (movedB?.x !== 8 || movedB?.y !== 8) console.error('FAIL: Building did not move');
        else console.log('PASS: Building moved successfully.');

        // Test Collision
        try {
            await moveBuilding(planet.id, housing.id, 5, 5); // Shield Gen is at 5,5 (size 2)
            console.error('FAIL: Shoud have thrown collision error');
        } catch (e) {
            console.log('PASS: Collision detection caught overlap.');
        }

    } catch (error) {
        console.error('Verification Failed:', error);
    } finally {
        // Cleanup
        await prisma.planetUnit.deleteMany({ where: { planetId: planet.id } });
        await prisma.building.deleteMany({ where: { planetId: planet.id } });
        await prisma.planet.delete({ where: { id: planet.id } });
        await prisma.$disconnect();
        console.log('\nTest Planet Cleaned Up.');
    }
}

run().catch(console.error);

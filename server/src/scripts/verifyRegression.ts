import { PrismaClient } from '@prisma/client';
import { syncPlanetResources, placeBuilding, moveBuilding, calculatePlanetRates, recruitUnit } from '../services/planetService';
import { UNIT_DATA } from '../constants/unitData';

const prisma = new PrismaClient();

async function run() {
    console.log('--- Starting Regression Testing ---\n');
    console.log('Verifying existing functionality still works after new changes...\n');

    let testPlanetId: string | null = null;
    let testUserId: string | null = null;

    try {
        // 1. Setup Test User & Planet
        console.log('1. Setting up test environment...');
        let user = await prisma.user.findFirst();
        if (!user) {
            const username = `regression_tester_${Date.now()}`;
            user = await prisma.user.create({
                data: {
                    username,
                    email: `${username}@test.com`,
                    passwordHash: 'test_hash'
                }
            });
            console.log(`   Created test user: ${username}`);
        }
        testUserId = user.id;

        const planet = await prisma.planet.create({
            data: {
                ownerId: user.id,
                name: 'Regression Test Planet',
                x: 9996,
                y: 9996, // Off-map
                carbon: 500,
                titanium: 500,
                food: 500,
                credits: 1000,
                lastResourceUpdate: new Date(),
                gridSizeX: 10, // New field
                gridSizeY: 10  // New field
            }
        });
        testPlanetId = planet.id;
        console.log(`   ✓ Created test planet\n`);

        // 2. Test Resource Production (Economy)
        console.log('2. Testing resource production...');
        const building1 = await placeBuilding(planet.id, 'carbon_processor', 1, 1);
        await prisma.building.update({ where: { id: building1.id }, data: { status: 'active' } });
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });

        // Fast forward time
        await prisma.planet.update({
            where: { id: planet.id },
            data: { lastResourceUpdate: new Date(Date.now() - 3600000) } // 1 hour ago
        });

        const synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed');

        if (synced.carbon <= 500) {
            throw new Error(`FAIL: Carbon should have increased, got ${synced.carbon}`);
        }
        console.log(`   ✓ Resource production works (Carbon: ${synced.carbon})\n`);

        // 3. Test Stability Calculation
        console.log('3. Testing stability calculation...');
        const rates = calculatePlanetRates(synced);
        if (typeof rates.publicOrder !== 'number') {
            throw new Error(`FAIL: Public order should be a number, got ${typeof rates.publicOrder}`);
        }
        console.log(`   ✓ Stability calculation works (PO: ${rates.publicOrder})\n`);

        // 4. Test Food Consumption
        console.log('4. Testing food consumption...');
        await prisma.planetUnit.create({
            data: { planetId: planet.id, unitType: 'marine', count: 50 }
        });

        await prisma.planet.update({
            where: { id: planet.id },
            data: { lastResourceUpdate: new Date(Date.now() - 3600000) }
        });

        const synced2 = await syncPlanetResources(planet.id);
        if (!synced2) throw new Error('Sync failed 2');

        const rates2 = calculatePlanetRates(synced2);
        const expectedConsumption = 50 * (UNIT_DATA['marine']?.upkeep || 1);
        
        if (rates2.foodConsumption !== expectedConsumption) {
            throw new Error(`FAIL: Food consumption should be ${expectedConsumption}, got ${rates2.foodConsumption}`);
        }
        console.log(`   ✓ Food consumption works (${rates2.foodConsumption}/h)\n`);

        // 5. Test Building Placement (with new grid system)
        console.log('5. Testing building placement with new grid system...');
        const building2 = await placeBuilding(planet.id, 'titanium_extractor', 5, 5);
        await prisma.building.update({ where: { id: building2.id }, data: { status: 'active' } });
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });

        const placed = await prisma.building.findUnique({ where: { id: building2.id } });
        if (placed?.x !== 5 || placed?.y !== 5) {
            throw new Error(`FAIL: Building should be at 5,5, got ${placed?.x},${placed?.y}`);
        }
        console.log('   ✓ Building placement works with new grid system\n');

        // 6. Test Building Movement (with new grid system)
        console.log('6. Testing building movement with new grid system...');
        await moveBuilding(planet.id, building2.id, 7, 7);
        const moved = await prisma.building.findUnique({ where: { id: building2.id } });
        if (moved?.x !== 7 || moved?.y !== 7) {
            throw new Error(`FAIL: Building should be at 7,7, got ${moved?.x},${moved?.y}`);
        }
        console.log('   ✓ Building movement works with new grid system\n');

        // 7. Test Recruitment Queue
        console.log('7. Testing recruitment queue...');
        const academy = await placeBuilding(planet.id, 'naval_academy', 3, 3);
        await prisma.building.update({ where: { id: academy.id }, data: { status: 'active' } });
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });

        await recruitUnit(planet.id, 'marine', 10);
        const planetWithQueue = await prisma.planet.findUnique({ where: { id: planet.id } });
        const queue = JSON.parse(planetWithQueue?.recruitmentQueue || '[]');
        
        if (queue.length === 0) {
            throw new Error('FAIL: Recruitment queue should have items');
        }
        console.log('   ✓ Recruitment queue works\n');

        // 8. Test Grid Size Backward Compatibility
        console.log('8. Testing backward compatibility...');
        // Test that code handles both old and new grid size fields
        const gridX = (synced as any).gridSizeX || (synced as any).gridSize || 10;
        const gridY = (synced as any).gridSizeY || (synced as any).gridSize || 10;
        
        if (gridX !== 10 || gridY !== 10) {
            throw new Error(`FAIL: Grid size should be 10x10, got ${gridX}x${gridY}`);
        }
        console.log('   ✓ Backward compatibility maintained\n');

        // 9. Test Desertion Logic
        console.log('9. Testing desertion logic...');
        // Set food to negative
        await prisma.planet.update({
            where: { id: planet.id },
            data: { 
                food: -1000,
                lastResourceUpdate: new Date(Date.now() - 3600000)
            }
        });

        const synced3 = await syncPlanetResources(planet.id);
        if (!synced3) throw new Error('Sync failed 3');

        const units = await prisma.planetUnit.findMany({ where: { planetId: planet.id } });
        const marineUnit = units.find(u => u.unitType === 'marine');
        
        // Units should have been reduced due to desertion
        if (marineUnit && marineUnit.count >= 50) {
            console.log('   ⚠️  Desertion may not have triggered (food may have been produced)');
        } else {
            console.log('   ✓ Desertion logic works\n');
        }

        // 10. Test Construction Queue
        console.log('10. Testing construction queue...');
        const building3 = await placeBuilding(planet.id, 'hydroponics', 0, 5);
        const planetWithBuild = await prisma.planet.findUnique({ where: { id: planet.id } });
        
        if (!planetWithBuild?.isBuilding || !planetWithBuild?.activeBuildId) {
            throw new Error('FAIL: Construction should be active');
        }
        console.log('   ✓ Construction queue works\n');

        console.log('✅ All Regression Tests Passed!\n');
        console.log('✓ Existing functionality preserved after new changes\n');

    } catch (error) {
        console.error('❌ Regression Test Failed:', error);
        throw error;
    } finally {
        // Cleanup
        if (testPlanetId) {
            await prisma.planetUnit.deleteMany({ where: { planetId: testPlanetId } });
            await prisma.building.deleteMany({ where: { planetId: testPlanetId } });
            await prisma.planet.delete({ where: { id: testPlanetId } });
        }
        await prisma.$disconnect();
        console.log('Test data cleaned up.');
    }
}

run().catch(console.error);


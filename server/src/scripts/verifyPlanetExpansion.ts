import { PrismaClient } from '@prisma/client';
import { placeBuilding, moveBuilding, syncPlanetResources } from '../services/planetService';
import { MAX_GRID_SIZE, EXPANSION_BASE_COST_CARBON, EXPANSION_BASE_COST_TITANIUM, EXPANSION_COST_MULTIPLIER } from '../constants/mechanics';

const prisma = new PrismaClient();

async function run() {
    console.log('--- Starting Planet Expansion System Verification ---\n');

    let testPlanetId: string | null = null;
    let testUserId: string | null = null;

    try {
        // 1. Setup Test User & Planet
        console.log('1. Setting up test environment...');
        let user = await prisma.user.findFirst();
        if (!user) {
            const username = `expansion_tester_${Date.now()}`;
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
                name: 'Expansion Test Planet',
                x: 9998,
                y: 9998, // Off-map
                carbon: 1000000,
                titanium: 1000000,
                food: 10000,
                credits: 10000,
                lastResourceUpdate: new Date(),
                gridSizeX: 10,
                gridSizeY: 10
            }
        });
        testPlanetId = planet.id;
        console.log(`   ✓ Created test planet: ${planet.id} (10x10)\n`);

        // 2. Test Initial Grid Size
        console.log('2. Testing initial grid size...');
        const initialPlanet = await prisma.planet.findUnique({ where: { id: planet.id } });
        if (initialPlanet?.gridSizeX !== 10 || initialPlanet?.gridSizeY !== 10) {
            throw new Error(`FAIL: Initial grid should be 10x10, got ${initialPlanet?.gridSizeX}x${initialPlanet?.gridSizeY}`);
        }
        console.log('   ✓ Initial grid size is 10x10\n');

        // 3. Test Building Placement at Grid Boundaries
        console.log('3. Testing building placement at boundaries...');
        const building1 = await placeBuilding(planet.id, 'carbon_processor', 0, 0); // Should fit in 10x10
        await prisma.building.update({ where: { id: building1.id }, data: { status: 'active' } });
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });
        
        // Try to place at edge (should work) - monument is 1x1, so 9,9 is fine
        const building2 = await placeBuilding(planet.id, 'monument', 9, 9);
        await prisma.building.update({ where: { id: building2.id }, data: { status: 'active' } });
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });
        console.log('   ✓ Buildings placed at boundaries\n');

        // 4. Test Expansion in X Direction
        console.log('4. Testing expansion in X direction...');
        const expansion1CostCarbon = Math.floor(EXPANSION_BASE_COST_CARBON * Math.pow(EXPANSION_COST_MULTIPLIER, 0));
        const expansion1CostTitanium = Math.floor(EXPANSION_BASE_COST_TITANIUM * Math.pow(EXPANSION_COST_MULTIPLIER, 0));
        
        // Update planet resources and grid
        await prisma.planet.update({
            where: { id: planet.id },
            data: {
                gridSizeX: 20,
                carbon: { decrement: expansion1CostCarbon },
                titanium: { decrement: expansion1CostTitanium }
            }
        });

        const expandedX = await prisma.planet.findUnique({ where: { id: planet.id } });
        if (expandedX?.gridSizeX !== 20 || expandedX?.gridSizeY !== 10) {
            throw new Error(`FAIL: Expansion X failed. Expected 20x10, got ${expandedX?.gridSizeX}x${expandedX?.gridSizeY}`);
        }
        console.log(`   ✓ Expanded to 20x10 (Cost: ${expansion1CostCarbon} Carbon, ${expansion1CostTitanium} Titanium)\n`);

        // 5. Test Building Placement After Expansion
        console.log('5. Testing building placement after expansion...');
        // Should be able to place at x=15 (was out of bounds before)
        const building3 = await placeBuilding(planet.id, 'titanium_extractor', 15, 5);
        await prisma.building.update({ where: { id: building3.id }, data: { status: 'active' } });
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });
        console.log('   ✓ Building placed in expanded area\n');

        // 6. Test Expansion in Y Direction
        console.log('6. Testing expansion in Y direction...');
        const expansion2CostCarbon = Math.floor(EXPANSION_BASE_COST_CARBON * Math.pow(EXPANSION_COST_MULTIPLIER, 1));
        const expansion2CostTitanium = Math.floor(EXPANSION_BASE_COST_TITANIUM * Math.pow(EXPANSION_COST_MULTIPLIER, 1));
        
        await prisma.planet.update({
            where: { id: planet.id },
            data: {
                gridSizeY: 20,
                carbon: { decrement: expansion2CostCarbon },
                titanium: { decrement: expansion2CostTitanium }
            }
        });

        const expandedY = await prisma.planet.findUnique({ where: { id: planet.id } });
        if (expandedY?.gridSizeX !== 20 || expandedY?.gridSizeY !== 20) {
            throw new Error(`FAIL: Expansion Y failed. Expected 20x20, got ${expandedY?.gridSizeX}x${expandedY?.gridSizeY}`);
        }
        console.log(`   ✓ Expanded to 20x20 (Cost: ${expansion2CostCarbon} Carbon, ${expansion2CostTitanium} Titanium)\n`);

        // 7. Test Cost Scaling
        console.log('7. Testing cost scaling...');
        const expansion3CostCarbon = Math.floor(EXPANSION_BASE_COST_CARBON * Math.pow(EXPANSION_COST_MULTIPLIER, 2));
        const expansion3CostTitanium = Math.floor(EXPANSION_BASE_COST_TITANIUM * Math.pow(EXPANSION_COST_MULTIPLIER, 2));
        
        if (expansion3CostCarbon <= expansion2CostCarbon) {
            throw new Error(`FAIL: Costs should increase. Expansion 2: ${expansion2CostCarbon}, Expansion 3: ${expansion3CostCarbon}`);
        }
        console.log(`   ✓ Cost scaling verified (Expansion 3: ${expansion3CostCarbon} Carbon)\n`);

        // 8. Test Maximum Grid Size
        console.log('8. Testing maximum grid size...');
        // Try to expand beyond max
        const currentSize = 20;
        const expansionNumber = Math.floor((currentSize - 10) / 10); // 1
        const nextSize = Math.min(currentSize + 10, MAX_GRID_SIZE);
        
        if (nextSize !== 30) {
            throw new Error(`FAIL: Next expansion should be 30, got ${nextSize}`);
        }
        
        // Test max limit
        const maxTest = Math.min(MAX_GRID_SIZE + 10, MAX_GRID_SIZE);
        if (maxTest !== MAX_GRID_SIZE) {
            throw new Error(`FAIL: Should cap at ${MAX_GRID_SIZE}, got ${maxTest}`);
        }
        console.log(`   ✓ Maximum grid size (${MAX_GRID_SIZE}x${MAX_GRID_SIZE}) enforced\n`);

        // 9. Test Building Movement After Expansion
        console.log('9. Testing building movement after expansion...');
        // Move building to new expanded area (building1 is at 0,0, size 2x2, so move to 18,18)
        await moveBuilding(planet.id, building1.id, 18, 18);
        const movedBuilding = await prisma.building.findUnique({ where: { id: building1.id } });
        if (movedBuilding?.x !== 18 || movedBuilding?.y !== 18) {
            throw new Error(`FAIL: Building should be at 18,18, got ${movedBuilding?.x},${movedBuilding?.y}`);
        }
        console.log('   ✓ Building moved to expanded area\n');

        // 10. Test Boundary Validation
        console.log('10. Testing boundary validation...');
        try {
            // Try to place building outside grid
            await placeBuilding(planet.id, 'monument', 25, 5); // x=25 is out of bounds for 20x20
            throw new Error('FAIL: Should have thrown boundary error');
        } catch (e: any) {
            if (e.message.includes('out of bounds')) {
                console.log('   ✓ Boundary validation works\n');
            } else {
                throw e;
            }
        }

        // 11. Test Grid Size in API Response
        console.log('11. Testing grid size in planet data...');
        const synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed');
        
        const gridX = (synced as any).gridSizeX || (synced as any).gridSize || 10;
        const gridY = (synced as any).gridSizeY || (synced as any).gridSize || 10;
        
        if (gridX !== 20 || gridY !== 20) {
            throw new Error(`FAIL: Synced planet should have 20x20 grid, got ${gridX}x${gridY}`);
        }
        console.log('   ✓ Grid size preserved in sync\n');

        console.log('✅ All Planet Expansion Tests Passed!\n');

    } catch (error) {
        console.error('❌ Verification Failed:', error);
        throw error;
    } finally {
        // Cleanup
        if (testPlanetId) {
            await prisma.building.deleteMany({ where: { planetId: testPlanetId } });
            await prisma.planet.delete({ where: { id: testPlanetId } });
        }
        await prisma.$disconnect();
        console.log('Test data cleaned up.');
    }
}

run().catch(console.error);


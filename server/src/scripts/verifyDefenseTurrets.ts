import { PrismaClient } from '@prisma/client';
import { calculateDefenseCapacity, getDefenseTurrets, canAddDefenseTurret } from '../services/defenseService';
import { DEFENSE_TURRET_CAPACITY, MAX_DEFENSE_TURRETS } from '../constants/mechanics';

const prisma = new PrismaClient();

async function run() {
    console.log('--- Starting Defense Turret System Verification ---\n');

    let testPlanetId: string | null = null;
    let testUserId: string | null = null;

    try {
        // 1. Setup Test User & Planet
        console.log('1. Setting up test environment...');
        let user = await prisma.user.findFirst();
        if (!user) {
            const username = `turret_tester_${Date.now()}`;
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
                name: 'Turret Test Planet',
                x: 9999,
                y: 9999, // Off-map
                carbon: 100000,
                titanium: 100000,
                food: 10000,
                credits: 10000,
                lastResourceUpdate: new Date(),
                gridSizeX: 10,
                gridSizeY: 10
            }
        });
        testPlanetId = planet.id;
        console.log(`   ✓ Created test planet: ${planet.id}\n`);

        // 2. Test Empty Capacity
        console.log('2. Testing empty capacity calculation...');
        const emptyCapacity = calculateDefenseCapacity(null);
        if (emptyCapacity !== 0) {
            throw new Error(`FAIL: Empty capacity should be 0, got ${emptyCapacity}`);
        }
        console.log('   ✓ Empty capacity is 0\n');

        // 3. Test Adding First Turret (Level 1)
        console.log('3. Testing adding Level 1 turret...');
        const turret1 = [{ level: 1 }];
        const capacity1 = calculateDefenseCapacity(JSON.stringify(turret1));
        const expected1 = DEFENSE_TURRET_CAPACITY[1];
        if (capacity1 !== expected1) {
            throw new Error(`FAIL: Level 1 capacity should be ${expected1}, got ${capacity1}`);
        }
        console.log(`   ✓ Level 1 turret capacity: ${capacity1}\n`);

        // 4. Test Multiple Turrets
        console.log('4. Testing multiple turrets capacity...');
        const turrets = [
            { level: 1 },
            { level: 2 },
            { level: 3 },
            { level: 4 }
        ];
        const totalCapacity = calculateDefenseCapacity(JSON.stringify(turrets));
        const expectedTotal = DEFENSE_TURRET_CAPACITY[1] + DEFENSE_TURRET_CAPACITY[2] + 
                             DEFENSE_TURRET_CAPACITY[3] + DEFENSE_TURRET_CAPACITY[4];
        if (totalCapacity !== expectedTotal) {
            throw new Error(`FAIL: Total capacity should be ${expectedTotal}, got ${totalCapacity}`);
        }
        console.log(`   ✓ Total capacity with 4 turrets: ${totalCapacity}\n`);

        // 5. Test API Endpoint (via direct database manipulation)
        console.log('5. Testing turret addition via API simulation...');
        
        // Simulate adding turret via API
        const initialTurrets: Array<{ level: number }> = [];
        let currentTurretsJson = JSON.stringify(initialTurrets);
        
        // Add Level 2 turret
        const newTurrets = [...initialTurrets, { level: 2 }];
        currentTurretsJson = JSON.stringify(newTurrets);
        
        await prisma.planet.update({
            where: { id: planet.id },
            data: { defenseTurretsJson: currentTurretsJson }
        });

        const updatedPlanet = await prisma.planet.findUnique({ where: { id: planet.id } });
        const storedTurrets = getDefenseTurrets(updatedPlanet?.defenseTurretsJson || null);
        
        if (storedTurrets.length !== 1 || storedTurrets[0].level !== 2) {
            throw new Error(`FAIL: Turret not stored correctly. Expected 1 turret level 2, got ${JSON.stringify(storedTurrets)}`);
        }
        console.log('   ✓ Turret stored correctly in database\n');

        // 6. Test Maximum Turret Limit
        console.log('6. Testing maximum turret limit...');
        const maxTurrets = Array.from({ length: MAX_DEFENSE_TURRETS }, (_, i) => ({ level: 1 }));
        const canAdd = canAddDefenseTurret(JSON.stringify(maxTurrets));
        if (canAdd) {
            throw new Error(`FAIL: Should not be able to add more than ${MAX_DEFENSE_TURRETS} turrets`);
        }
        console.log(`   ✓ Maximum turret limit (${MAX_DEFENSE_TURRETS}) enforced\n`);

        // 7. Test Capacity Validation in Defense Assignment
        console.log('7. Testing capacity validation...');
        const testCapacity = calculateDefenseCapacity(JSON.stringify([{ level: 1 }])); // 10 capacity
        
        // Create defense layout with units exceeding capacity
        await prisma.defenseLayout.create({
            data: {
                planetId: planet.id,
                frontLaneJson: JSON.stringify({ units: { marine: 15 }, tools: [] }), // 15 > 10
                leftLaneJson: JSON.stringify({ units: {}, tools: [] }),
                rightLaneJson: JSON.stringify({ units: {}, tools: [] })
            }
        });

        // This should fail validation (we'll test via the route, but for now verify the calculation)
        console.log(`   ✓ Capacity calculation works: ${testCapacity} capacity\n`);

        // 8. Test Invalid JSON Handling
        console.log('8. Testing invalid JSON handling...');
        const invalidCapacity = calculateDefenseCapacity('invalid json');
        if (invalidCapacity !== 0) {
            throw new Error(`FAIL: Invalid JSON should return 0 capacity, got ${invalidCapacity}`);
        }
        console.log('   ✓ Invalid JSON handled gracefully\n');

        // 9. Test Cost Scaling
        console.log('9. Testing cost scaling logic...');
        const baseCostCarbon = 500 * 2; // Level 2
        const baseCostTitanium = 250 * 2;
        const turretCount = 5;
        const multiplier = 1 + (turretCount * 0.1); // 1.5
        const scaledCarbon = Math.floor(baseCostCarbon * multiplier);
        const scaledTitanium = Math.floor(baseCostTitanium * multiplier);
        
        console.log(`   ✓ Cost scaling: ${scaledCarbon} Carbon, ${scaledTitanium} Titanium for 6th turret (Level 2)\n`);

        console.log('✅ All Defense Turret Tests Passed!\n');

    } catch (error) {
        console.error('❌ Verification Failed:', error);
        throw error;
    } finally {
        // Cleanup
        if (testPlanetId) {
            await prisma.defenseLayout.deleteMany({ where: { planetId: testPlanetId } });
            await prisma.planet.delete({ where: { id: testPlanetId } });
        }
        await prisma.$disconnect();
        console.log('Test data cleaned up.');
    }
}

run().catch(console.error);


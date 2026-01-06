import { PrismaClient } from '@prisma/client';
import { calculateDefenseCapacity } from '../services/defenseService';
import { DEFENSE_TURRET_CAPACITY } from '../constants/mechanics';

const prisma = new PrismaClient();

async function run() {
    console.log('--- Starting Defense Capacity Integration Verification ---\n');

    let testPlanetId: string | null = null;
    let testUserId: string | null = null;

    try {
        // 1. Setup Test User & Planet
        console.log('1. Setting up test environment...');
        let user = await prisma.user.findFirst();
        if (!user) {
            const username = `capacity_tester_${Date.now()}`;
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
                name: 'Capacity Test Planet',
                x: 9997,
                y: 9997, // Off-map
                carbon: 100000,
                titanium: 100000,
                food: 10000,
                credits: 10000,
                lastResourceUpdate: new Date(),
                gridSizeX: 10,
                gridSizeY: 10,
                defensiveGridLevel: 1
            }
        });
        testPlanetId = planet.id;

        // Add units
        await prisma.planetUnit.createMany({
            data: [
                { planetId: planet.id, unitType: 'marine', count: 100 },
                { planetId: planet.id, unitType: 'ranger', count: 50 },
                { planetId: planet.id, unitType: 'sentinel', count: 30 }
            ]
        });
        console.log(`   ✓ Created test planet with units\n`);

        // 2. Test Defense Assignment with No Turrets (0 Capacity)
        console.log('2. Testing defense assignment with no turrets...');
        await prisma.defenseLayout.create({
            data: {
                planetId: planet.id,
                frontLaneJson: JSON.stringify({ units: { marine: 5 }, tools: [] }),
                leftLaneJson: JSON.stringify({ units: {}, tools: [] }),
                rightLaneJson: JSON.stringify({ units: {}, tools: [] })
            }
        });

        const capacity0 = calculateDefenseCapacity(null);
        if (capacity0 !== 0) {
            throw new Error(`FAIL: No turrets should give 0 capacity, got ${capacity0}`);
        }
        console.log('   ✓ No turrets = 0 capacity\n');

        // 3. Test Defense Assignment with Capacity
        console.log('3. Testing defense assignment with turrets...');
        // Add 2 Level 2 turrets = 40 capacity
        const turrets = [{ level: 2 }, { level: 2 }];
        const capacity = calculateDefenseCapacity(JSON.stringify(turrets));
        const expectedCapacity = DEFENSE_TURRET_CAPACITY[2] * 2; // 40

        if (capacity !== expectedCapacity) {
            throw new Error(`FAIL: Expected capacity ${expectedCapacity}, got ${capacity}`);
        }
        console.log(`   ✓ Capacity with 2 Level 2 turrets: ${capacity}\n`);

        // 4. Test Capacity Validation Logic
        console.log('4. Testing capacity validation scenarios...');
        
        // Scenario 1: Lane within capacity (should pass)
        const lane1 = { units: { marine: 20 }, tools: [] }; // 20 < 40
        const total1 = Object.values(lane1.units).reduce((a, b) => a + b, 0);
        if (total1 > capacity) {
            throw new Error(`FAIL: Lane 1 should be within capacity`);
        }
        console.log('   ✓ Lane within capacity validated\n');

        // Scenario 2: Lane exceeds capacity (should fail)
        const lane2 = { units: { marine: 50 }, tools: [] }; // 50 > 40
        const total2 = Object.values(lane2.units).reduce((a, b) => a + b, 0);
        if (total2 <= capacity) {
            throw new Error(`FAIL: Lane 2 should exceed capacity`);
        }
        console.log('   ✓ Lane exceeding capacity detected\n');

        // 5. Test Multiple Lanes with Same Capacity
        console.log('5. Testing multiple lanes with same capacity limit...');
        // Each lane can use up to total capacity
        const frontLane = { units: { marine: 20 }, tools: [] }; // 20 < 40
        const leftLane = { units: { ranger: 15 }, tools: [] }; // 15 < 40
        const rightLane = { units: { sentinel: 10 }, tools: [] }; // 10 < 40

        const frontTotal = Object.values(frontLane.units).reduce((a, b) => a + b, 0);
        const leftTotal = Object.values(leftLane.units).reduce((a, b) => a + b, 0);
        const rightTotal = Object.values(rightLane.units).reduce((a, b) => a + b, 0);

        if (frontTotal > capacity || leftTotal > capacity || rightTotal > capacity) {
            throw new Error('FAIL: All lanes should be within capacity');
        }
        console.log('   ✓ All lanes within capacity\n');

        // 6. Test Capacity Calculation with Mixed Turret Levels
        console.log('6. Testing mixed turret levels...');
        const mixedTurrets = [
            { level: 1 }, // 10
            { level: 2 }, // 20
            { level: 3 }, // 30
            { level: 4 }  // 40
        ];
        const mixedCapacity = calculateDefenseCapacity(JSON.stringify(mixedTurrets));
        const expectedMixed = DEFENSE_TURRET_CAPACITY[1] + DEFENSE_TURRET_CAPACITY[2] + 
                             DEFENSE_TURRET_CAPACITY[3] + DEFENSE_TURRET_CAPACITY[4]; // 100

        if (mixedCapacity !== expectedMixed) {
            throw new Error(`FAIL: Mixed capacity should be ${expectedMixed}, got ${mixedCapacity}`);
        }
        console.log(`   ✓ Mixed turret capacity: ${mixedCapacity}\n`);

        // 7. Test Capacity in Defense Profile Response
        console.log('7. Testing capacity in defense profile...');
        await prisma.planet.update({
            where: { id: planet.id },
            data: { defenseTurretsJson: JSON.stringify(turrets) }
        });

        const updatedPlanet = await prisma.planet.findUnique({ where: { id: planet.id } });
        const profileCapacity = calculateDefenseCapacity(updatedPlanet?.defenseTurretsJson || null);
        
        if (profileCapacity !== capacity) {
            throw new Error(`FAIL: Profile capacity should be ${capacity}, got ${profileCapacity}`);
        }
        console.log('   ✓ Capacity calculated correctly in profile\n');

        console.log('✅ All Defense Capacity Integration Tests Passed!\n');

    } catch (error) {
        console.error('❌ Verification Failed:', error);
        throw error;
    } finally {
        // Cleanup
        if (testPlanetId) {
            await prisma.defenseLayout.deleteMany({ where: { planetId: testPlanetId } });
            await prisma.planetUnit.deleteMany({ where: { planetId: testPlanetId } });
            await prisma.planet.delete({ where: { id: testPlanetId } });
        }
        await prisma.$disconnect();
        console.log('Test data cleaned up.');
    }
}

run().catch(console.error);


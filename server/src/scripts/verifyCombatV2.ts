
import { PrismaClient } from '@prisma/client';
import { resolveCombat } from '../services/combatService';
import { validateToolsAvailable, deductTools } from '../services/fleetService';

// Mock context or run standalone
const prisma = new PrismaClient();

async function main() {
    console.log('--- Verifying Combat V2 Mechanics ---');

    // 1. Setup Test Data
    // Create User, Planet, Fleet, Tools
    try {
        // Clean up old test data if possible? Or just make new unique names.
        const suffix = Math.floor(Math.random() * 10000);
        const user = await prisma.user.create({
            data: { username: `Tester${suffix}`, email: `test${suffix}@test.com`, passwordHash: 'hash' }
        });
        console.log('User created:', user.id);

        const planetA = await prisma.planet.create({
            data: { ownerId: user.id, name: `Attacker${suffix}`, x: 0, y: 0, defensiveGridLevel: 1 }
        });
        const planetD = await prisma.planet.create({
            data: { ownerId: user.id, name: `Defender${suffix}`, x: 100, y: 0, defensiveGridLevel: 1 }
        }); // Same owner for simplicity, or different? Combat usually requires different owners? Logic doesn't enforce widely yet.

        // Stockpile Tools
        await prisma.toolInventory.create({
            data: { planetId: planetA.id, toolType: 'signal_jammer', count: 50 }
        });
        await prisma.toolInventory.create({
            data: { planetId: planetD.id, toolType: 'auto_turret', count: 50 }
        });

        // Stockpile Units
        await prisma.planetUnit.createMany({
            data: [
                { planetId: planetA.id, unitType: 'marine', count: 100 },
                { planetId: planetD.id, unitType: 'sentinel', count: 50 }
            ]
        });

        console.log('Planets & Inventory set up.');

        // 2. Setup Defense Layout (Planet D)
        // Front Lane: 10 Sentinels + 10 Auto Turrets (Slot)
        const frontLane = {
            units: { sentinel: 10 },
            tools: [{ type: 'auto_turret', count: 10 }]
        };
        await prisma.defenseLayout.create({
            data: {
                planetId: planetD.id,
                frontLaneJson: JSON.stringify(frontLane),
                leftLaneJson: '{}',
                rightLaneJson: '{}'
            }
        });
        console.log('Defense Layout established.');

        // 3. Create Attack Fleet
        // Front Lane: 20 Marines + 5 Signal Jammers (Wave 1)
        const attackLane = [
            {
                units: { marine: 20 },
                tools: { signal_jammer: 5 }
            }
        ];

        const fleet = await prisma.fleet.create({
            data: {
                ownerId: user.id,
                fromPlanetId: planetA.id,
                toPlanetId: planetD.id,
                type: 'attack',
                status: 'arrived', // Force arrival state for testing
                unitsJson: JSON.stringify({ marine: 20 }),
                laneAssignmentsJson: JSON.stringify({ front: attackLane }),
                toolsJson: JSON.stringify({ signal_jammer: 5 }),
                departAt: new Date(),
                arriveAt: new Date()
            }
        });
        console.log('Fleet created:', fleet.id);

        // 4. Run Combat Resolution
        console.log('Resolving combat...');
        const result = await resolveCombat(fleet.id);

        console.log('Combat Result:', result.winner);
        console.log('Sector Center Winner:', result.sectorResults.center.winner);
        console.log('Defender Losses:', result.sectorResults.center.defenderLosses);

        // 5. Verify Tool Consumption (Defender)
        // Re-fetch Defense Layout
        const updatedLayout = await prisma.defenseLayout.findUnique({ where: { planetId: planetD.id } });
        const updatedFront = JSON.parse(updatedLayout?.frontLaneJson || '{}');
        console.log('Updated Front Lane Tools:', updatedFront.tools);

        // Expected: Auto Turrets should decrease by 1 (per wave fought).
        // If 1 wave fought, count should be 9.

        if (updatedFront.tools[0].count === 9) {
            console.log('PASS: Defender tool consumption verified.');
        } else {
            console.error('FAIL: Defender tool consumption mismatch. Expected 9, got:', updatedFront.tools[0].count);
        }

        // 6. Verify Persisted Inventory Deduction (Defender)
        // Original: 50. Consumed: 1. Expected: 49.
        const turrets = await prisma.toolInventory.findFirst({
            where: { planetId: planetD.id, toolType: 'auto_turret' }
        });
        if (turrets?.count === 49) {
            console.log('PASS: ToolInventory deduction verified.');
        } else {
            console.error('FAIL: Inventory deduction mismatch. Expected 49, got:', turrets?.count);
        }


    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();

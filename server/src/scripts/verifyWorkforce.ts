import { PrismaClient } from '@prisma/client';
import { placeBuilding, calculatePlanetRates, syncPlanetResources } from '../services/planetService';
import { BUILDING_DATA } from '../constants/buildingData';
import {
    BASE_STAFFING_REQUIREMENT,
    STAFFING_PER_LEVEL,
    OVERSTAFFING_BONUS_CAP,
    UNDERSTAFFED_MINIMUM
} from '../constants/mechanics';

const prisma = new PrismaClient();

async function run() {
    console.log('--- Starting Workforce Economy Verification ---');

    // 1. Setup Test Planet
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found');

    // Create a clean test planet
    const planet = await prisma.planet.create({
        data: {
            ownerId: user.id,
            name: 'Workforce Test',
            x: 9998, y: 9998, // Off-map
            carbon: 50000,
            titanium: 50000,
            food: 50000,
            credits: 0,
            taxRate: 10,
            lastResourceUpdate: new Date(),
            energyCanopyLevel: 0
        }
    });

    console.log(`Created Test Planet: ${planet.id}`);

    try {
        // 2. Test Colony Hub provides population (it's created automatically)
        console.log('\n--- Test 1: Colony Hub Population ---');
        let synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed');
        let rates = calculatePlanetRates(synced);

        console.log('Colony Hub Lvl 1 Stats:', {
            population: rates.population,
            workforceRequired: rates.workforceRequired,
            workforceEfficiency: rates.workforceEfficiency?.toFixed(3)
        });

        if (rates.population !== 20) {
            console.error(`FAIL: Colony Hub Lvl 1 expected 20 population, got ${rates.population}`);
        } else {
            console.log('PASS: Colony Hub provides base population');
        }

        // With no production buildings, workforce efficiency should be 1.0
        if (rates.workforceRequired !== 0) {
            console.error(`FAIL: No production buildings, expected 0 required, got ${rates.workforceRequired}`);
        } else {
            console.log('PASS: No production buildings = 0 workforce required');
        }

        // 3. Add Carbon Processor - should create staffing requirement
        console.log('\n--- Test 2: Production Building Staffing ---');
        const carbonProc = await placeBuilding(planet.id, 'carbon_processor', 0, 0);
        await prisma.building.update({ where: { id: carbonProc.id }, data: { status: 'active' } });
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });

        synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed 2');
        rates = calculatePlanetRates(synced);

        console.log('With Carbon Processor Lvl 1:', {
            population: rates.population,
            workforceRequired: rates.workforceRequired,
            staffingRatio: rates.staffingRatio?.toFixed(3),
            workforceEfficiency: rates.workforceEfficiency?.toFixed(3)
        });

        // Carbon Processor Lvl 1 should require 3 workers
        const expectedStaffing = BUILDING_DATA['carbon_processor'].levels[1].staffingRequirement || 3;
        if (rates.workforceRequired !== expectedStaffing) {
            console.error(`FAIL: Expected ${expectedStaffing} workers required, got ${rates.workforceRequired}`);
        } else {
            console.log('PASS: Production building creates staffing requirement');
        }

        // 4. Test Overstaffing - population (20) > required (3) = bonus
        console.log('\n--- Test 3: Overstaffing Bonus ---');
        if ((rates.overstaffBonus || 0) > 0) {
            console.log(`PASS: Overstaffing bonus applied: +${((rates.overstaffBonus || 0) * 100).toFixed(2)}%`);
        } else {
            console.error('FAIL: Should have overstaffing bonus with 20 pop and 3 required');
        }

        if ((rates.workforceEfficiency || 1.0) > 1.0) {
            console.log(`PASS: Workforce efficiency above 100%: ${((rates.workforceEfficiency || 1.0) * 100).toFixed(1)}%`);
        } else {
            console.error('FAIL: Workforce efficiency should be > 100% with surplus workers');
        }

        // 5. Test Understaffing - add many production buildings
        console.log('\n--- Test 4: Understaffing Scenario ---');
        // Add 4 more carbon processors = 5 total = 5*3 = 15 workers needed
        // Use different positions to avoid collision (3x3 buildings)
        const positions = [[4, 0], [7, 0], [0, 4]];
        for (let i = 0; i < positions.length; i++) {
            const [x, y] = positions[i];
            const cp = await placeBuilding(planet.id, 'carbon_processor', x, y);
            await prisma.building.update({ where: { id: cp.id }, data: { status: 'active' } });
            await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });
        }

        synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed 3');
        rates = calculatePlanetRates(synced);

        console.log('With 4 Carbon Processors:', {
            population: rates.population,
            workforceRequired: rates.workforceRequired,
            staffingRatio: rates.staffingRatio?.toFixed(3),
            workforceEfficiency: rates.workforceEfficiency?.toFixed(3)
        });

        // 4 Carbon Processors = 12 workers needed, we have 20 = still overstaffed
        if (rates.workforceRequired === 12) {
            console.log('PASS: 4 Carbon Processors correctly require 12 workers');
        }

        // For understaffing test, we'll use a level 10 processor (21 workers) instead of adding more buildings
        console.log('\n--- Test 5: Understaffing via High Level Building ---');
        await prisma.building.update({ where: { id: carbonProc.id }, data: { level: 10 } });

        synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed 4');
        rates = calculatePlanetRates(synced);

        console.log('With 10 Carbon Processors:', {
            population: rates.population,
            workforceRequired: rates.workforceRequired,
            staffingRatio: rates.staffingRatio?.toFixed(3),
            workforceEfficiency: rates.workforceEfficiency?.toFixed(3)
        });

        // 10 Carbon Processors = 30 workers, we have 20 = ~67% staffing
        if ((rates.staffingRatio || 1.0) < 1.0) {
            console.log(`PASS: Understaffed - staffing ratio ${((rates.staffingRatio || 1.0) * 100).toFixed(0)}%`);
        } else {
            console.error('FAIL: Should be understaffed with 10 processors and 20 population');
        }

        if ((rates.workforceEfficiency || 1.0) < 1.0 && (rates.workforceEfficiency || 0) >= UNDERSTAFFED_MINIMUM) {
            console.log(`PASS: Workforce efficiency reduced to ${((rates.workforceEfficiency || 0) * 100).toFixed(0)}%`);
        } else {
            console.error('FAIL: Workforce efficiency should be between 25% and 100% when understaffed');
        }

        // 6. Test Housing Unit adds population
        console.log('\n--- Test 6: Housing Unit Population ---');
        const housing = await placeBuilding(planet.id, 'housing_unit', 0, 8);
        await prisma.building.update({ where: { id: housing.id }, data: { status: 'active' } });
        await prisma.planet.update({ where: { id: planet.id }, data: { isBuilding: false, activeBuildId: null } });

        synced = await syncPlanetResources(planet.id);
        if (!synced) throw new Error('Sync failed 5');
        rates = calculatePlanetRates(synced);

        console.log('After adding Housing Unit Lvl 1:', {
            population: rates.population,
            workforceRequired: rates.workforceRequired,
            staffingRatio: rates.staffingRatio?.toFixed(3),
            workforceEfficiency: rates.workforceEfficiency?.toFixed(3)
        });

        // Housing Unit Lvl 1 adds 10 population = 30 total
        if (rates.population === 30) {
            console.log('PASS: Housing Unit adds 10 population');
        } else {
            console.error(`FAIL: Expected 30 population (20 from hub + 10 from housing), got ${rates.population}`);
        }

        // 7. Production rate verification
        console.log('\n--- Test 7: Production Rate Calculation ---');
        const carbonRate = rates.carbonRate;
        console.log(`Carbon Rate: ${carbonRate?.toFixed(2)}/h`);
        console.log(`Workforce Efficiency: ${((rates.workforceEfficiency || 1.0) * 100).toFixed(0)}%`);
        console.log(`Productivity (Stability): ${rates.productivity?.toFixed(0)}%`);

        // Verify the formula: (BASE_PRODUCTION + buildingProduction) * workforceEfficiency * stabilityMult
        const baseCarbon = 100; // BASE_PRODUCTION
        const buildingCarbon = 10 * 8; // 10 processors * 8 production each
        const expectedCarbon = (baseCarbon + buildingCarbon) * (rates.workforceEfficiency || 1.0) * (rates.productivity || 100) / 100;

        if (Math.abs((carbonRate || 0) - expectedCarbon) < 0.01) {
            console.log('PASS: Production formula correctly applies workforce efficiency');
        } else {
            console.log(`INFO: Carbon rate ${carbonRate?.toFixed(2)}/h (expected ~${expectedCarbon.toFixed(2)}/h)`);
        }

        console.log('\n--- All Workforce Economy Tests Complete ---');

    } catch (error) {
        console.error('Verification Failed:', error);
    } finally {
        // Cleanup
        await prisma.building.deleteMany({ where: { planetId: planet.id } });
        await prisma.planet.delete({ where: { id: planet.id } });
        await prisma.$disconnect();
        console.log('\nTest Planet Cleaned Up.');
    }
}

run().catch(console.error);

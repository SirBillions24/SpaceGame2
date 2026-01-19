/**
 * Fix Broken NPC Defenses Script
 * 
 * This script identifies NPCs with broken defenses (invalid unit types like "ranger")
 * and regenerates their defense layouts using the correct unit types from NPC_THEMES.
 * 
 * Run: npx ts-node src/scripts/fixBrokenNpcDefenses.ts
 */

import prisma from '../lib/prisma';
import { generateNpcDefense } from '../services/pveService';
import { UNIT_DATA } from '../constants/unitData';

async function main() {
    console.log('🔧 Scanning for NPC planets with broken defenses...\n');

    // Get all valid unit types
    const validUnitTypes = new Set(Object.keys(UNIT_DATA));
    console.log('Valid unit types:', Array.from(validUnitTypes).join(', '));

    // Find all NPC planets
    const npcPlanets = await prisma.planet.findMany({
        where: { isNpc: true },
        include: {
            defenseLayout: true,
            units: true
        }
    });

    let fixed = 0;
    let skipped = 0;

    for (const planet of npcPlanets) {
        const def = planet.defenseLayout;
        if (!def) {
            console.log(`⚠️  ${planet.name} has NO defense layout - regenerating`);
            await generateNpcDefense(planet.id, planet.npcLevel, planet.npcClass || 'melee');
            fixed++;
            continue;
        }

        // Check for invalid unit types in defense layout
        const checkForInvalidUnits = (json: string | null): string[] => {
            if (!json) return [];
            try {
                const data = JSON.parse(json);
                const units = data.units || data;
                const invalid: string[] = [];
                for (const unitType of Object.keys(units)) {
                    if (!validUnitTypes.has(unitType) && units[unitType] > 0) {
                        invalid.push(unitType);
                    }
                }
                return invalid;
            } catch {
                return [];
            }
        };

        const invalidFront = checkForInvalidUnits(def.frontLaneJson);
        const invalidLeft = checkForInvalidUnits(def.leftLaneJson);
        const invalidRight = checkForInvalidUnits(def.rightLaneJson);
        const allInvalid = [...invalidFront, ...invalidLeft, ...invalidRight];

        // Also check if units count is 0 while attackCount is 0 (spawned broken)
        const totalUnits = planet.units.reduce((sum, u) => sum + u.count, 0);
        const neverAttacked = planet.attackCount === 0;

        if (allInvalid.length > 0 || (totalUnits === 0 && neverAttacked)) {
            console.log(`\n🔴 ${planet.name} (${planet.npcClass}) - BROKEN`);
            console.log(`   Invalid units: ${allInvalid.length > 0 ? allInvalid.join(', ') : 'none'}`);
            console.log(`   PlanetUnit total: ${totalUnits}, attackCount: ${planet.attackCount}`);
            console.log(`   Regenerating defense for level ${planet.npcLevel}...`);

            await generateNpcDefense(planet.id, planet.npcLevel, planet.npcClass || 'melee');
            fixed++;
        } else {
            skipped++;
        }
    }

    console.log(`\n✅ Fixed ${fixed} NPC planets`);
    console.log(`⏩ Skipped ${skipped} healthy NPC planets`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

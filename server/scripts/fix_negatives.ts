
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Fixing negative unit counts...');

    // Find all negative units
    const negativeUnits = await prisma.planetUnit.findMany({
        where: {
            count: { lt: 0 }
        }
    });

    console.log(`Found ${negativeUnits.length} negative unit records.`);

    for (const unit of negativeUnits) {
        console.log(`Fixing ${unit.unitType} on planet ${unit.planetId}: ${unit.count} -> 0`);
        await prisma.planetUnit.update({
            where: { id: unit.id },
            data: { count: 0 }
        });
    }

    console.log('Done!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

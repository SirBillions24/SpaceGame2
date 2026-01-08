/**
 * Give starter gear to all users who don't have it yet
 */

import prisma from '../lib/prisma';
import { giveStarterGear } from '../services/admiralService';

async function giveStarterGearToAllUsers() {
  console.log('🎮 Giving starter gear to all users...\n');

  try {
    // Get all users
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${users.length} users\n`);

    let givenCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // Check if user already has gear
      const existingItems = await (prisma as any).gearPiece.findMany({
        where: { userId: user.id },
      });

      if (existingItems.length >= 4) {
        console.log(`⏭️  Skipping ${user.username} (already has ${existingItems.length} items)`);
        skippedCount++;
        continue;
      }

      console.log(`📦 Giving starter gear to ${user.username}...`);
      const created = await giveStarterGear(user.id);
      console.log(`   ✅ Created ${created.length} items`);
      givenCount++;
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Gave gear to ${givenCount} users`);
    console.log(`   ⏭️  Skipped ${skippedCount} users (already have gear)`);
    console.log('\n✅ All done!');

  } catch (error: any) {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

giveStarterGearToAllUsers()
  .then(() => {
    console.log('\n🎉 Script completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });




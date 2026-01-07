/**
 * Give test gear items to a specific user
 * Run this to give the 4 test items to your account
 */

import prisma from '../lib/prisma';
import { createGearFromDefinition } from '../services/admiralService';
import { getStarterGear } from '../constants/gearData';

async function giveTestGearToUser() {
  console.log('🎮 Giving test gear items to user...\n');

  try {
    // Get user ID from command line or use first user
    const userId = process.argv[2];
    
    if (!userId) {
      // Get first user if no ID provided
      const firstUser = await prisma.user.findFirst({
        orderBy: { createdAt: 'asc' },
      });
      
      if (!firstUser) {
        console.error('❌ No users found in database.');
        process.exit(1);
      }
      
      console.log(`✅ Using user: ${firstUser.username} (${firstUser.id})\n`);
      await createTestItemsForUser(firstUser.id);
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      
      if (!user) {
        console.error(`❌ User not found: ${userId}`);
        process.exit(1);
      }
      
      console.log(`✅ Using user: ${user.username} (${user.id})\n`);
      await createTestItemsForUser(user.id);
    }

    console.log('\n✅ Test gear given successfully!');
    console.log('💡 Open Admiral Panel in the game to see your items.');

  } catch (error: any) {
    console.error('\n❌ Error giving test gear:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function createTestItemsForUser(userId: string) {
  // Check if user already has test items
  const existingItems = await (prisma as any).gearPiece.findMany({
    where: { userId },
  });

  if (existingItems.length >= 4) {
    console.log('⚠️  User already has gear items. Skipping creation.');
    console.log(`   Found ${existingItems.length} items:`);
    existingItems.forEach((item: any) => {
      console.log(`   - ${item.name} (${item.slotType})`);
    });
    return;
  }

  // Get starter gear from configuration
  const items = getStarterGear();

  for (const item of items) {
    // Check if item already exists for this slot
    const existing = existingItems.find((i: any) => i.slotType === item.slotType && i.name === item.name);
    
    if (existing) {
      console.log(`⏭️  Skipping ${item.slotType}: ${item.name} (already exists)`);
      continue;
    }

    const piece = await createGearFromDefinition(userId, item);
    console.log(`✅ Created ${item.slotType}: ${piece.name}`);
    console.log(`   Melee: +${item.meleeStrengthBonus}%, Ranged: +${item.rangedStrengthBonus}%, Canopy: ${item.canopyReductionBonus}%`);
  }

  console.log('\n📊 Total Bonuses (when all equipped):');
  console.log(`   Melee: +100%`);
  console.log(`   Ranged: +100%`);
  console.log(`   Wall: -100%`);
}

giveTestGearToUser()
  .then(() => {
    console.log('\n🎉 Script completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });


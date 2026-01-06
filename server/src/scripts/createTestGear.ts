/**
 * Create 4 test gear items for testing admiral bonuses
 * These items total exactly: +100% melee, +100% ranged, -100% wall
 */

import prisma from '../lib/prisma';
import { createGearFromDefinition } from '../services/admiralService';
import { getStarterGear } from '../constants/gearData';

async function createTestGear() {
  console.log('🎮 Creating test gear items...\n');

  try {
    // Find a test user
    const testUser = await prisma.user.findFirst({
      where: { username: { contains: 'test' } },
    });

    if (!testUser) {
      console.error('❌ No test user found. Please create a user first.');
      process.exit(1);
    }

    console.log(`✅ Using user: ${testUser.username}\n`);

    // Get starter gear from configuration
    const items = getStarterGear();

    for (const item of items) {
      const piece = await createGearFromDefinition(testUser.id, item);
      console.log(`✅ Created ${item.slotType}: ${piece.name}`);
      console.log(`   Melee: +${item.meleeStrengthBonus}%, Ranged: +${item.rangedStrengthBonus}%, Wall: ${item.wallReductionBonus}%`);
    }

    console.log('\n📊 Total Bonuses:');
    console.log(`   Melee: +100%`);
    console.log(`   Ranged: +100%`);
    console.log(`   Wall: -100%`);
    console.log('\n✅ All test gear created successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Open Admiral Panel in the game');
    console.log('   2. Equip all 4 items');
    console.log('   3. Verify bonuses show +100% melee, +100% ranged, -100% wall');
    console.log('   4. Launch an attack to test combat bonuses');

  } catch (error: any) {
    console.error('\n❌ Error creating test gear:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestGear()
  .then(() => {
    console.log('\n🎉 Script completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });


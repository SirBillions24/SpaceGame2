/**
 * Test script for Gear Management System
 * Tests the new gear inventory and admiral equipment functionality
 */

import prisma from '../lib/prisma';
import {
  getOrCreateAdmiral,
  equipGearPiece,
  unequipGearPiece,
  getGearInventory,
  createGearPiece,
  calculateAdmiralBonuses,
} from '../services/admiralService';

async function testGearSystem() {
  console.log('🧪 Testing Gear Management System...\n');

  try {
    // Find or create a test user
    let testUser = await prisma.user.findFirst({
      where: { username: { contains: 'test' } },
    });

    if (!testUser) {
      // Create a test user if none exists
      testUser = await prisma.user.create({
        data: {
          username: 'test_user_gear',
          email: `test_gear_${Date.now()}@test.com`,
          passwordHash: 'test_hash',
        },
      });
      console.log('✅ Created test user:', testUser.username);
    } else {
      console.log('✅ Using existing test user:', testUser.username);
    }

    // Test 1: Create gear pieces
    console.log('\n📦 Test 1: Creating gear pieces...');
    const weapon = await createGearPiece(
      testUser.id,
      'weapon',
      'Plasma Rifle',
      'rare',
      5,
      15, // meleeStrengthBonus
      5,  // rangedStrengthBonus
      -5, // wallReductionBonus
      'Vanguard',
      '⚔️'
    );
    console.log('✅ Created weapon:', weapon.name);

    const helmet = await createGearPiece(
      testUser.id,
      'helmet',
      'Command Helmet',
      'uncommon',
      3,
      5,  // meleeStrengthBonus
      10, // rangedStrengthBonus
      -10, // wallReductionBonus
      undefined,
      '🪖'
    );
    console.log('✅ Created helmet:', helmet.name);

    const spacesuit = await createGearPiece(
      testUser.id,
      'spacesuit',
      'Combat Spacesuit',
      'epic',
      7,
      10, // meleeStrengthBonus
      20, // rangedStrengthBonus
      -20, // wallReductionBonus
      'Vanguard',
      '👨‍🚀'
    );
    console.log('✅ Created spacesuit:', spacesuit.name);

    const shield = await createGearPiece(
      testUser.id,
      'shield',
      'Defense Matrix',
      'legendary',
      10,
      5,  // meleeStrengthBonus
      30, // rangedStrengthBonus
      -30, // wallReductionBonus
      undefined,
      '🛡️'
    );
    console.log('✅ Created shield:', shield.name);

    // Test 2: Get inventory
    console.log('\n📋 Test 2: Getting gear inventory...');
    const inventory = await getGearInventory(testUser.id);
    console.log(`✅ Inventory contains ${inventory.length} pieces`);
    inventory.forEach((piece: any) => {
      console.log(`   - ${piece.name} (${piece.slotType}, ${piece.rarity})`);
    });

    // Test 3: Get or create admiral
    console.log('\n👤 Test 3: Getting/Creating admiral...');
    const admiral = await getOrCreateAdmiral(testUser.id);
    console.log('✅ Admiral:', admiral.name);
    console.log('   Current gear:', JSON.parse(admiral.gearJson || '{}'));

    // Test 4: Equip gear pieces
    console.log('\n⚙️ Test 4: Equipping gear pieces...');
    
    await equipGearPiece(testUser.id, weapon.id, 'weapon');
    console.log('✅ Equipped weapon');

    await equipGearPiece(testUser.id, helmet.id, 'helmet');
    console.log('✅ Equipped helmet');

    await equipGearPiece(testUser.id, spacesuit.id, 'spacesuit');
    console.log('✅ Equipped spacesuit');

    await equipGearPiece(testUser.id, shield.id, 'shield');
    console.log('✅ Equipped shield');

    // Test 5: Verify bonuses
    console.log('\n📊 Test 5: Verifying bonuses...');
    const updatedAdmiral = await prisma.admiral.findUnique({
      where: { id: admiral.id },
    });
    if (updatedAdmiral) {
      const gear = JSON.parse(updatedAdmiral.gearJson || '{}');
      const bonuses = calculateAdmiralBonuses(updatedAdmiral.gearJson || '{}');
      
      console.log('✅ Gear equipped:');
      Object.entries(gear).forEach(([slot, piece]: [string, any]) => {
        console.log(`   ${slot}: ${piece.name} (+${piece.meleeStrengthBonus || 0}% Melee, +${piece.rangedStrengthBonus || 0}% Ranged, ${piece.wallReductionBonus || 0}% Wall)`);
      });
      
      console.log(`✅ Total Melee Bonus: ${bonuses.meleeStrengthBonus}%`);
      console.log(`✅ Total Ranged Bonus: ${bonuses.rangedStrengthBonus}%`);
      console.log(`✅ Total Wall Reduction: ${bonuses.wallReductionBonus}%`);
      console.log(`✅ Cached Melee Bonus: ${(updatedAdmiral as any).meleeStrengthBonus || 0}%`);
      console.log(`✅ Cached Ranged Bonus: ${(updatedAdmiral as any).rangedStrengthBonus || 0}%`);
      console.log(`✅ Cached Wall Reduction: ${(updatedAdmiral as any).wallReductionBonus || 0}%`);
      
      // Verify bonuses match
      if (bonuses.meleeStrengthBonus === ((updatedAdmiral as any).meleeStrengthBonus || 0) && 
          bonuses.rangedStrengthBonus === ((updatedAdmiral as any).rangedStrengthBonus || 0) &&
          bonuses.wallReductionBonus === ((updatedAdmiral as any).wallReductionBonus || 0)) {
        console.log('✅ Bonus calculation matches cached values!');
      } else {
        console.error('❌ Bonus mismatch!');
      }
    }

    // Test 6: Unequip gear
    console.log('\n🔓 Test 6: Unequipping gear...');
    await unequipGearPiece(testUser.id, 'weapon');
    console.log('✅ Unequipped weapon');

    const afterUnequip = await prisma.admiral.findUnique({
      where: { id: admiral.id },
    });
    if (afterUnequip) {
      const gear = JSON.parse(afterUnequip.gearJson || '{}');
      console.log(`✅ Gear after unequip: ${Object.keys(gear).length} pieces`);
      const bonuses = calculateAdmiralBonuses(afterUnequip.gearJson || '{}');
      console.log(`✅ Bonuses after unequip: +${bonuses.meleeStrengthBonus}% Melee, +${bonuses.rangedStrengthBonus}% Ranged, ${bonuses.wallReductionBonus}% Wall`);
    }

    // Test 7: Test invalid slot
    console.log('\n🚫 Test 7: Testing invalid slot type...');
    try {
      await equipGearPiece(testUser.id, weapon.id, 'invalid_slot' as any);
      console.error('❌ Should have thrown error for invalid slot');
    } catch (error: any) {
      if (error.message.includes('Invalid gear slot')) {
        console.log('✅ Correctly rejected invalid slot type');
      } else {
        console.error('❌ Unexpected error:', error.message);
      }
    }

    // Test 8: Test wrong slot type for piece
    console.log('\n🚫 Test 8: Testing wrong slot type for piece...');
    try {
      await equipGearPiece(testUser.id, weapon.id, 'helmet');
      console.error('❌ Should have thrown error for wrong slot type');
    } catch (error: any) {
      if (error.message.includes('does not match slot type')) {
        console.log('✅ Correctly rejected wrong slot type');
      } else {
        console.error('❌ Unexpected error:', error.message);
      }
    }

    console.log('\n✅ All tests completed successfully!');
    
    // Cleanup (optional - comment out if you want to keep test data)
    // console.log('\n🧹 Cleaning up test data...');
    // await prisma.gearPiece.deleteMany({ where: { userId: testUser.id } });
    // console.log('✅ Cleanup complete');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testGearSystem()
  .then(() => {
    console.log('\n🎉 Test suite completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });


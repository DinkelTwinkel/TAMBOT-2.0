// test_pickaxe_durability.js - Test script to verify the pickaxe durability fix

const { handlePickaxeDurability, getPickaxeDurability } = require('./mining/improvedDurabilityHandling');
const PlayerInventory = require('../../models/inventory');

/**
 * Test the pickaxe durability fix
 * Run this to verify that pickaxes properly reset durability when breaking
 */
async function testPickaxeDurability() {
    console.log('=== PICKAXE DURABILITY TEST ===\n');
    
    // Test configuration
    const testPlayerId = 'test_player_123';
    const testPlayerTag = 'TestPlayer#1234';
    const testPickaxeId = 'iron_pickaxe';
    
    try {
        // Step 1: Setup test inventory
        console.log('1. Setting up test inventory...');
        
        // Create or update test inventory
        await PlayerInventory.findOneAndUpdate(
            { playerId: testPlayerId },
            {
                $set: {
                    playerId: testPlayerId,
                    playerTag: testPlayerTag,
                    items: [
                        {
                            itemId: testPickaxeId,
                            name: 'Iron Pickaxe',
                            type: 'pickaxe',
                            quantity: 3,
                            currentDurability: 10, // Low durability for testing
                            stats: { mining: 5 }
                        }
                    ]
                }
            },
            { upsert: true, new: true }
        );
        
        console.log('✓ Test inventory created with Iron Pickaxe (qty: 3, durability: 10)\n');
        
        // Step 2: Simulate mining until pickaxe breaks
        console.log('2. Simulating mining actions...');
        
        // First mining action (durability: 10 -> 5)
        console.log('Mining action 1: Durability loss = 5');
        let result = await handlePickaxeDurability(
            testPlayerId,
            testPlayerTag,
            { itemId: testPickaxeId, name: 'Iron Pickaxe', currentDurability: 10 },
            5
        );
        console.log(`Result: Broke=${result.broke}, New Durability=${result.newDurability}\n`);
        
        // Second mining action (durability: 5 -> 0, should break!)
        console.log('Mining action 2: Durability loss = 5 (should break)');
        result = await handlePickaxeDurability(
            testPlayerId,
            testPlayerTag,
            { itemId: testPickaxeId, name: 'Iron Pickaxe', currentDurability: 5 },
            5
        );
        console.log(`Result: Broke=${result.broke}, New Durability=${result.newDurability || 'N/A'}`);
        
        if (result.broke) {
            console.log('✓ Pickaxe broke as expected!\n');
        } else {
            console.log('✗ ERROR: Pickaxe should have broken!\n');
        }
        
        // Step 3: Verify the inventory state
        console.log('3. Verifying inventory state after break...');
        
        const durabilityInfo = await getPickaxeDurability(testPlayerId, testPickaxeId);
        
        if (durabilityInfo) {
            console.log(`Current state:`);
            console.log(`- Quantity: ${durabilityInfo.quantity}`);
            console.log(`- Current Durability: ${durabilityInfo.currentDurability}`);
            console.log(`- Max Durability: ${durabilityInfo.maxDurability}`);
            
            // Verify the fix worked
            if (durabilityInfo.quantity === 2 && durabilityInfo.currentDurability === durabilityInfo.maxDurability) {
                console.log('\n✓✓✓ SUCCESS! Pickaxe durability was properly reset to maximum!');
                console.log('The bug is FIXED - quantity decreased and durability reset correctly.\n');
            } else if (durabilityInfo.quantity === 2 && durabilityInfo.currentDurability === 0) {
                console.log('\n✗✗✗ BUG DETECTED! Durability is still 0 after break!');
                console.log('The fix has NOT been applied properly.\n');
            } else {
                console.log('\n⚠ Unexpected state - please check the implementation.\n');
            }
        } else {
            console.log('✗ ERROR: Could not retrieve pickaxe info\n');
        }
        
        // Step 4: Test complete removal (when quantity = 1)
        console.log('4. Testing complete removal when last pickaxe breaks...');
        
        // Set quantity to 1
        await PlayerInventory.findOneAndUpdate(
            { playerId: testPlayerId, 'items.itemId': testPickaxeId },
            { $set: { 'items.$.quantity': 1, 'items.$.currentDurability': 5, playerTag: testPlayerTag } }
        );
        
        // Break the last pickaxe
        result = await handlePickaxeDurability(
            testPlayerId,
            testPlayerTag,
            { itemId: testPickaxeId, name: 'Iron Pickaxe', currentDurability: 5 },
            5
        );
        
        if (result.removed) {
            console.log('✓ Last pickaxe was properly removed from inventory\n');
        } else {
            console.log('✗ ERROR: Last pickaxe should have been removed!\n');
        }
        
        // Cleanup
        console.log('5. Cleaning up test data...');
        await PlayerInventory.deleteOne({ playerId: testPlayerId });
        console.log('✓ Test data cleaned up\n');
        
        console.log('=== TEST COMPLETE ===');
        
    } catch (error) {
        console.error('Test failed with error:', error);
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testPickaxeDurability()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { testPickaxeDurability };

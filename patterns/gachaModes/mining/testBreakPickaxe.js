// Test file to verify breakPickaxe is working correctly
const mongoose = require('mongoose');
const PlayerInventory = require('../../../models/inventory');

// Import the fixed function (update path as needed)
const { breakPickaxe } = require('./breakPickaxe_fixed');

async function testBreakPickaxe() {
    // Test configuration
    const testPlayerId = '123456789'; // Replace with actual player ID
    const testPlayerTag = 'TestUser#1234';
    const testPickaxeId = 'stone_pickaxe'; // Replace with actual pickaxe ID
    
    console.log('=== TESTING BREAKPICKAXE FUNCTION ===\n');
    
    try {
        // Step 1: Setup - Add a test pickaxe to inventory
        console.log('Step 1: Setting up test data...');
        
        // First, clear any existing test data
        await PlayerInventory.findOneAndDelete({ playerId: testPlayerId });
        
        // Create test inventory with pickaxe
        const testInventory = await PlayerInventory.create({
            playerId: testPlayerId,
            playerTag: testPlayerTag,
            items: [
                { itemId: testPickaxeId, quantity: 3 },
                { itemId: 'iron_ore', quantity: 10 }
            ]
        });
        
        console.log('✅ Test inventory created with:');
        console.log('  - Pickaxe:', testPickaxeId, 'x3');
        console.log('  - Iron ore x10\n');
        
        // Step 2: Test breaking pickaxe (should decrement from 3 to 2)
        console.log('Step 2: Testing first break (quantity 3 -> 2)...');
        
        const pickaxeObject = {
            id: testPickaxeId,  // Note: using 'id' field
            name: 'Stone Pickaxe'
        };
        
        const result1 = await breakPickaxe(testPlayerId, testPlayerTag, pickaxeObject);
        
        if (result1) {
            const inv1 = await PlayerInventory.findOne({ playerId: testPlayerId });
            const pickaxe1 = inv1.items.find(i => i.itemId === testPickaxeId);
            console.log(`✅ First break successful. New quantity: ${pickaxe1?.quantity || 0}\n`);
        } else {
            console.log('❌ First break failed\n');
        }
        
        // Step 3: Test breaking pickaxe again (should decrement from 2 to 1)
        console.log('Step 3: Testing second break (quantity 2 -> 1)...');
        
        const result2 = await breakPickaxe(testPlayerId, testPlayerTag, pickaxeObject);
        
        if (result2) {
            const inv2 = await PlayerInventory.findOne({ playerId: testPlayerId });
            const pickaxe2 = inv2.items.find(i => i.itemId === testPickaxeId);
            console.log(`✅ Second break successful. New quantity: ${pickaxe2?.quantity || 0}\n`);
        } else {
            console.log('❌ Second break failed\n');
        }
        
        // Step 4: Test breaking pickaxe final time (should remove from inventory)
        console.log('Step 4: Testing final break (should remove item)...');
        
        const result3 = await breakPickaxe(testPlayerId, testPlayerTag, pickaxeObject);
        
        if (result3) {
            const inv3 = await PlayerInventory.findOne({ playerId: testPlayerId });
            const pickaxe3 = inv3.items.find(i => i.itemId === testPickaxeId);
            
            if (!pickaxe3) {
                console.log('✅ Final break successful. Item removed from inventory\n');
            } else {
                console.log(`⚠️ Item still exists with quantity: ${pickaxe3.quantity}\n`);
            }
        } else {
            console.log('❌ Final break failed\n');
        }
        
        // Step 5: Test breaking non-existent pickaxe (should fail gracefully)
        console.log('Step 5: Testing break on non-existent item (should fail gracefully)...');
        
        const result4 = await breakPickaxe(testPlayerId, testPlayerTag, pickaxeObject);
        
        if (!result4) {
            console.log('✅ Correctly handled non-existent item\n');
        } else {
            console.log('⚠️ Unexpected success on non-existent item\n');
        }
        
        // Step 6: Test with numeric ID (common issue)
        console.log('Step 6: Testing with numeric ID...');
        
        // Add item with numeric-looking ID
        await PlayerInventory.findOneAndUpdate(
            { playerId: testPlayerId },
            { $push: { items: { itemId: '12345', quantity: 2 } } }
        );
        
        const numericPickaxe = {
            id: 12345,  // Numeric ID (will be converted to string)
            name: 'Numeric Pickaxe'
        };
        
        const result5 = await breakPickaxe(testPlayerId, testPlayerTag, numericPickaxe);
        
        if (result5) {
            console.log('✅ Successfully handled numeric ID\n');
        } else {
            console.log('❌ Failed to handle numeric ID\n');
        }
        
        // Final: Show final inventory state
        console.log('=== FINAL INVENTORY STATE ===');
        const finalInventory = await PlayerInventory.findOne({ playerId: testPlayerId });
        
        if (finalInventory) {
            console.log('Player items:');
            finalInventory.items.forEach(item => {
                console.log(`  - ${item.itemId}: ${item.quantity}`);
            });
        } else {
            console.log('No inventory found');
        }
        
        // Cleanup
        await PlayerInventory.findOneAndDelete({ playerId: testPlayerId });
        console.log('\n✅ Test data cleaned up');
        
    } catch (error) {
        console.error('Test error:', error);
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    // Connect to MongoDB first
    mongoose.connect('your-mongodb-connection-string-here', {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(() => {
        console.log('Connected to MongoDB');
        return testBreakPickaxe();
    }).then(() => {
        console.log('\n=== TEST COMPLETE ===');
        process.exit(0);
    }).catch(error => {
        console.error('Failed to run test:', error);
        process.exit(1);
    });
} else {
    module.exports = { testBreakPickaxe };
}

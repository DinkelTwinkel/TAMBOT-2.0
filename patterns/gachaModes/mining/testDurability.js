// testDurability.js - Test script to verify durability saving works
const mongoose = require('mongoose');
const PlayerInventory = require('../../../models/inventory');

async function testDurabilitySave(playerId = 'test123') {
    console.log('\n=== Testing Durability Save ===\n');
    
    try {
        // Create a test inventory with an item
        const testInventory = await PlayerInventory.findOneAndUpdate(
            { playerId: playerId },
            {
                playerId: playerId,
                playerTag: 'TestUser#0000',
                items: [
                    {
                        itemId: '1',
                        quantity: 1,
                        currentDurability: 75,
                        durability: 100
                    },
                    {
                        itemId: '2',
                        quantity: 1,
                        currentDurability: 50
                    }
                ]
            },
            { upsert: true, new: true }
        );
        
        console.log('Step 1: Created test inventory');
        console.log('Items saved:', JSON.stringify(testInventory.items, null, 2));
        
        // Now fetch it back to verify it saved
        const fetchedInventory = await PlayerInventory.findOne({ playerId: playerId });
        console.log('\nStep 2: Fetched inventory from database');
        console.log('Items retrieved:', JSON.stringify(fetchedInventory.items, null, 2));
        
        // Check if currentDurability was saved
        const item1 = fetchedInventory.items[0];
        const item2 = fetchedInventory.items[1];
        
        console.log('\nStep 3: Verification');
        console.log(`Item 1 currentDurability: ${item1.currentDurability} (expected: 75)`);
        console.log(`Item 2 currentDurability: ${item2.currentDurability} (expected: 50)`);
        
        if (item1.currentDurability === 75 && item2.currentDurability === 50) {
            console.log('\n✅ SUCCESS: currentDurability is being saved correctly!');
        } else {
            console.log('\n❌ FAILED: currentDurability is NOT being saved!');
        }
        
        // Clean up test data
        await PlayerInventory.deleteOne({ playerId: playerId });
        console.log('\nTest data cleaned up.');
        
    } catch (error) {
        console.error('Error during test:', error);
    }
}

// Export for use in other files or run directly
module.exports = testDurabilitySave;

// If running this file directly
if (require.main === module) {
    // You'll need to connect to MongoDB first
    // Add your MongoDB connection code here if running standalone
    console.log('Run this test from a file that already has MongoDB connected.');
}

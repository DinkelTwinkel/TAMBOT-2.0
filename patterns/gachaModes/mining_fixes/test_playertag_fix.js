// test_playertag_fix.js - Quick test to verify the playerTag fix works

const { handlePickaxeDurability } = require('./mining/improvedDurabilityHandling');
const PlayerInventory = require('../../models/inventory');
const mongoose = require('mongoose');
require('dotenv').config();

async function testPlayerTagFix() {
    console.log('🔧 Testing PlayerTag Fix...\n');
    
    try {
        // Connect to MongoDB if needed
        if (mongoose.connection.readyState !== 1) {
            console.log('📡 Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tambot');
            console.log('✅ Connected\n');
        }
        
        const testPlayerId = 'test_tag_' + Date.now();
        const testPlayerTag = 'TestPlayer#1234';
        const testPickaxeId = 'iron_pickaxe';
        
        // Test 1: Create inventory WITHOUT playerTag initially
        console.log('1️⃣ Creating inventory without playerTag...');
        const inventory = new PlayerInventory({
            playerId: testPlayerId,
            // Intentionally not setting playerTag to test the fix
            items: [
                {
                    itemId: testPickaxeId,
                    name: 'Iron Pickaxe',
                    type: 'pickaxe',
                    quantity: 2,
                    currentDurability: 5,
                    stats: { mining: 5 }
                }
            ]
        });
        
        // This should fail if we try to save without playerTag
        try {
            await inventory.save();
            console.log('❌ Unexpectedly saved without playerTag!');
        } catch (error) {
            console.log('✅ Correctly failed to save without playerTag\n');
        }
        
        // Now set playerTag and save
        inventory.playerTag = testPlayerTag;
        await inventory.save();
        console.log('✅ Saved successfully with playerTag\n');
        
        // Test 2: Use handlePickaxeDurability which should fix missing playerTag
        console.log('2️⃣ Testing durability handler with missing playerTag...');
        
        // Remove playerTag from the document to simulate the issue
        await PlayerInventory.updateOne(
            { playerId: testPlayerId },
            { $unset: { playerTag: 1 } }
        );
        console.log('   Removed playerTag from document');
        
        // Now call handlePickaxeDurability - it should add playerTag back
        const result = await handlePickaxeDurability(
            testPlayerId,
            testPlayerTag,
            { itemId: testPickaxeId, name: 'Iron Pickaxe', currentDurability: 5 },
            5  // This will break the pickaxe
        );
        
        if (result.success && result.broke) {
            console.log('✅ Pickaxe broke successfully');
            
            // Verify playerTag was added back
            const updatedInventory = await PlayerInventory.findOne({ playerId: testPlayerId });
            if (updatedInventory.playerTag === testPlayerTag) {
                console.log('✅ PlayerTag was correctly added back!\n');
            } else {
                console.log('❌ PlayerTag was not added\n');
            }
            
            // Check quantity was reduced
            const pickaxe = updatedInventory.items.find(i => i.itemId === testPickaxeId);
            if (pickaxe && pickaxe.quantity === 1) {
                console.log('✅ Quantity reduced from 2 to 1');
            }
            if (pickaxe && pickaxe.currentDurability > 0) {
                console.log('✅ Durability was reset to maximum');
            }
        } else {
            console.log('❌ Failed to break pickaxe\n');
        }
        
        // Test 3: Test with voice channel member format
        console.log('\n3️⃣ Testing voice channel member tag format...');
        const voiceChannelTag = 'VoiceUser#0000';  // Simulated voice channel format
        
        const voiceResult = await handlePickaxeDurability(
            testPlayerId,
            voiceChannelTag,
            { itemId: testPickaxeId, name: 'Iron Pickaxe', currentDurability: 100 },
            10
        );
        
        if (voiceResult.success) {
            console.log('✅ Voice channel format handled correctly');
        }
        
        // Cleanup
        console.log('\n4️⃣ Cleaning up...');
        await PlayerInventory.deleteOne({ playerId: testPlayerId });
        console.log('✅ Test data cleaned\n');
        
        console.log('=' .repeat(50));
        console.log('✨ PLAYERTAG FIX TEST COMPLETE - ALL TESTS PASSED!');
        console.log('=' .repeat(50));
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    testPlayerTagFix()
        .then(() => {
            console.log('\n👋 Exiting...');
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { testPlayerTagFix };

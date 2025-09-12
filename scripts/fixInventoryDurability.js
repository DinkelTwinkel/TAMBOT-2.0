// scripts/fixInventoryDurability.js
// Script to fix durability display issues in existing inventories

const mongoose = require('mongoose');
const PlayerInventory = require('../models/inventory');
const itemSheet = require('../data/itemSheet.json');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

async function fixInventoryDurability() {
    console.log('🔧 Starting inventory durability fix...');
    
    try {
        // Connect to MongoDB if not already connected
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            console.log('📦 Connected to MongoDB');
        }

        // Get all player inventories
        const inventories = await PlayerInventory.find({});
        console.log(`📋 Found ${inventories.length} player inventories to check`);

        let playersFixed = 0;
        let itemsFixed = 0;

        for (const inventory of inventories) {
            let needsUpdate = false;

            // Check each item in the player's inventory
            for (let i = 0; i < inventory.items.length; i++) {
                const invItem = inventory.items[i];
                const itemId = invItem.itemId || invItem.id;

                // Find the item in itemSheet
                const itemData = itemMap.get(itemId);
                
                if (!itemData) continue;

                // Only process tools, equipment, and charms (items that should have durability)
                if (itemData.type === 'tool' || itemData.type === 'equipment' || itemData.type === 'charm') {
                    // Check if currentDurability is not set properly
                    if (invItem.currentDurability === undefined || invItem.currentDurability === null) {
                        // Set currentDurability to the default from itemSheet
                        inventory.items[i].currentDurability = itemData.durability || 100;
                        needsUpdate = true;
                        itemsFixed++;
                        console.log(`  ✅ Fixed ${itemData.name} (${itemId}) durability for player ${inventory.playerId}`);
                    }
                }
            }

            // Save the inventory if we made any updates
            if (needsUpdate) {
                // Mark the items array as modified so Mongoose knows to save it
                inventory.markModified('items');
                await inventory.save();
                playersFixed++;
                console.log(`💾 Saved inventory for player ${inventory.playerId}`);
            }
        }

        console.log(`✅ Durability fix complete!`);
        console.log(`   Players fixed: ${playersFixed}`);
        console.log(`   Items fixed: ${itemsFixed}`);

        return { playersFixed, itemsFixed };

    } catch (error) {
        console.error('❌ Error fixing inventory durability:', error);
        throw error;
    }
}

// Run the fix if this script is called directly
if (require.main === module) {
    require('dotenv').config();
    
    fixInventoryDurability()
        .then(result => {
            console.log(`🎉 Fix completed successfully: ${result.playersFixed} players, ${result.itemsFixed} items`);
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Fix failed:', error);
            process.exit(1);
        });
}

module.exports = { fixInventoryDurability };

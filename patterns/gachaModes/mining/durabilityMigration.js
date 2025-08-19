// durabilityMigration.js - Initialize durability for existing items
const PlayerInventory = require('../../../models/inventory');
const itemSheet = require('../../../data/itemSheet.json');

/**
 * Initialize durability values for all items in player inventories
 * This ensures all tools, equipment, and charms have currentDurability set
 * if they don't already have it.
 */
async function initializeDurabilityForAllPlayers() {
    console.log('Starting durability migration for all player inventories...');
    
    try {
        // Get all player inventories
        const inventories = await PlayerInventory.find({});
        
        let playersUpdated = 0;
        let itemsUpdated = 0;
        
        for (const inventory of inventories) {
            let needsUpdate = false;
            
            // Check each item in the player's inventory
            for (let i = 0; i < inventory.items.length; i++) {
                const invItem = inventory.items[i];
                const itemId = invItem.itemId || invItem.id;
                
                // Find the item in itemSheet
                const itemData = itemSheet.find(it => String(it.id) === String(itemId));
                
                if (!itemData) continue;
                
                // Only process tools, equipment, and charms (items that can have durability)
                if (itemData.type === 'tool' || itemData.type === 'equipment' || itemData.type === 'charm') {
                    // Check if currentDurability is not set
                    if (invItem.currentDurability === undefined || invItem.currentDurability === null) {
                        // Set currentDurability to the default from itemSheet
                        inventory.items[i].currentDurability = itemData.durability || 100;
                        needsUpdate = true;
                        itemsUpdated++;
                        console.log(`  Set durability for ${itemData.name} (${itemId}) to ${itemData.durability || 100} for player ${inventory.playerId}`);
                    }
                }
            }
            
            // Save the inventory if we made any updates
            if (needsUpdate) {
                // Mark the items array as modified so Mongoose knows to save it
                inventory.markModified('items');
                await inventory.save();
                playersUpdated++;
                
                // Verify the save worked
                const verification = await PlayerInventory.findOne({ playerId: inventory.playerId });
                const verifyCount = verification.items.filter(item => {
                    const itemData = itemSheet.find(it => String(it.id) === String(item.itemId || item.id));
                    return itemData && (itemData.type === 'tool' || itemData.type === 'equipment' || itemData.type === 'charm') && 
                           item.currentDurability !== undefined;
                }).length;
                console.log(`  Saved changes for player ${inventory.playerId} - Verified ${verifyCount} items have durability`);
            }
        }
        
        console.log(`Durability migration complete!`);
        console.log(`  Players updated: ${playersUpdated}`);
        console.log(`  Items updated: ${itemsUpdated}`);
        
        return { playersUpdated, itemsUpdated };
    } catch (error) {
        console.error('Error during durability migration:', error);
        throw error;
    }
}

/**
 * Initialize durability for a specific player's inventory
 * @param {string} playerId - The player's Discord ID
 */
async function initializeDurabilityForPlayer(playerId) {
    try {
        const inventory = await PlayerInventory.findOne({ playerId });
        
        if (!inventory) {
            console.log(`No inventory found for player ${playerId}`);
            return { itemsUpdated: 0 };
        }
        
        let itemsUpdated = 0;
        let needsUpdate = false;
        
        for (let i = 0; i < inventory.items.length; i++) {
            const invItem = inventory.items[i];
            const itemId = invItem.itemId || invItem.id;
            
            // Find the item in itemSheet
            const itemData = itemSheet.find(it => String(it.id) === String(itemId));
            
            if (!itemData) continue;
            
            // Only process tools, equipment, and charms
            if (itemData.type === 'tool' || itemData.type === 'equipment' || itemData.type === 'charm') {
                // Check if currentDurability is not set
                if (invItem.currentDurability === undefined || invItem.currentDurability === null) {
                    // Set currentDurability to the default from itemSheet
                    inventory.items[i].currentDurability = itemData.durability || 100;
                    needsUpdate = true;
                    itemsUpdated++;
                    console.log(`  Set durability for ${itemData.name} to ${itemData.durability || 100}`);
                }
            }
        }
        
        if (needsUpdate) {
            // Mark the items array as modified so Mongoose knows to save it
            inventory.markModified('items');
            await inventory.save();
            console.log(`Updated ${itemsUpdated} items for player ${playerId}`);
            
            // Verify the save worked
            const verification = await PlayerInventory.findOne({ playerId });
            const verifyCount = verification.items.filter(item => {
                const itemData = itemSheet.find(it => String(it.id) === String(item.itemId || item.id));
                return itemData && (itemData.type === 'tool' || itemData.type === 'equipment' || itemData.type === 'charm') && 
                       item.currentDurability !== undefined;
            }).length;
            console.log(`  Verification: ${verifyCount} items now have durability in database`);
        }
        
        return { itemsUpdated };
    } catch (error) {
        console.error(`Error initializing durability for player ${playerId}:`, error);
        throw error;
    }
}

/**
 * Check if an item needs durability repair
 * @param {Object} item - The item object with currentDurability and durability
 * @returns {boolean} - True if the item needs repair
 */
function needsRepair(item) {
    if (!item.currentDurability || !item.durability) return false;
    return item.currentDurability < item.durability * 0.5; // Needs repair if below 50%
}

/**
 * Repair an item to full durability
 * @param {string} playerId - The player's Discord ID
 * @param {string} itemId - The item's ID
 * @returns {Promise<boolean>} - True if repair was successful
 */
async function repairItem(playerId, itemId) {
    try {
        const inventory = await PlayerInventory.findOne({ playerId });
        if (!inventory) return false;
        
        const invItem = inventory.items.find(item => 
            (item.itemId === itemId || item.id === itemId)
        );
        
        if (!invItem) return false;
        
        // Find the item in itemSheet to get max durability
        const itemData = itemSheet.find(it => String(it.id) === String(itemId));
        if (!itemData) return false;
        
        const maxDurability = itemData.durability || 100;
        
        // Update the item's current durability to max
        const result = await PlayerInventory.findOneAndUpdate(
            { 
                playerId,
                'items.itemId': itemId
            },
            {
                $set: { 'items.$.currentDurability': maxDurability }
            },
            { new: true }
        );
        
        if (!result) {
            // Try with 'id' field if 'itemId' didn't work
            const resultAlt = await PlayerInventory.findOneAndUpdate(
                { 
                    playerId,
                    'items.id': itemId
                },
                {
                    $set: { 'items.$.currentDurability': maxDurability }
                },
                { new: true }
            );
            
            return !!resultAlt;
        }
        
        return !!result;
    } catch (error) {
        console.error(`Error repairing item ${itemId} for player ${playerId}:`, error);
        return false;
    }
}

/**
 * Debug function to check durability status for a player
 * @param {string} playerId - The player's Discord ID
 */
async function checkDurabilityStatus(playerId) {
    try {
        const inventory = await PlayerInventory.findOne({ playerId });
        
        if (!inventory) {
            console.log(`No inventory found for player ${playerId}`);
            return;
        }
        
        console.log(`\nDurability Status for Player ${playerId}:`);
        console.log(`Total items: ${inventory.items.length}`);
        
        let toolsWithDurability = 0;
        let toolsWithoutDurability = 0;
        
        for (const invItem of inventory.items) {
            const itemId = invItem.itemId || invItem.id;
            const itemData = itemSheet.find(it => String(it.id) === String(itemId));
            
            if (itemData && (itemData.type === 'tool' || itemData.type === 'equipment' || itemData.type === 'charm')) {
                if (invItem.currentDurability !== undefined && invItem.currentDurability !== null) {
                    toolsWithDurability++;
                    console.log(`  ✓ ${itemData.name}: ${invItem.currentDurability}/${itemData.durability || 100}`);
                } else {
                    toolsWithoutDurability++;
                    console.log(`  ✗ ${itemData.name}: NO DURABILITY SET`);
                }
            }
        }
        
        console.log(`\nSummary:`);
        console.log(`  Tools/Equipment with durability: ${toolsWithDurability}`);
        console.log(`  Tools/Equipment WITHOUT durability: ${toolsWithoutDurability}`);
        
    } catch (error) {
        console.error(`Error checking durability status for player ${playerId}:`, error);
    }
}

module.exports = {
    initializeDurabilityForAllPlayers,
    initializeDurabilityForPlayer,
    needsRepair,
    repairItem,
    checkDurabilityStatus
};

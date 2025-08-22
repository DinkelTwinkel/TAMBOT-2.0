// utils/cleanupInventory.js - Utility to clean up duplicate inventory items
const PlayerInventory = require('../models/inventory');

class InventoryCleanup {
    /**
     * Clean up duplicate items in all player inventories
     * Consolidates duplicate itemIds into single entries with combined quantities
     */
    static async cleanupAllInventories() {
        console.log('🧹 Starting inventory cleanup...');
        
        try {
            const inventories = await PlayerInventory.find({});
            let totalCleaned = 0;
            let inventoriesProcessed = 0;
            
            for (const inventory of inventories) {
                const cleanedCount = await this.cleanupSingleInventory(inventory);
                if (cleanedCount > 0) {
                    totalCleaned += cleanedCount;
                    inventoriesProcessed++;
                }
            }
            
            console.log(`✅ Inventory cleanup complete! Cleaned ${totalCleaned} duplicate entries across ${inventoriesProcessed} inventories.`);
            return { totalCleaned, inventoriesProcessed };
            
        } catch (error) {
            console.error('❌ Error during inventory cleanup:', error);
            throw error;
        }
    }
    
    /**
     * Clean up duplicate items in a single player's inventory
     * @param {Object} inventory - The inventory document to clean
     * @returns {Number} Number of duplicate entries cleaned
     */
    static async cleanupSingleInventory(inventory) {
        if (!inventory.items || inventory.items.length === 0) {
            return 0;
        }
        
        const itemMap = new Map();
        let duplicatesFound = 0;
        
        // Group items by itemId and sum quantities
        for (const item of inventory.items) {
            if (itemMap.has(item.itemId)) {
                // Duplicate found - add quantity to existing entry
                const existing = itemMap.get(item.itemId);
                existing.quantity += item.quantity;
                duplicatesFound++;
            } else {
                // First occurrence of this item
                itemMap.set(item.itemId, {
                    itemId: item.itemId,
                    quantity: item.quantity
                });
            }
        }
        
        // If duplicates were found, update the inventory
        if (duplicatesFound > 0) {
            console.log(`  🔧 Cleaning inventory for player ${inventory.playerId}: Found ${duplicatesFound} duplicate entries`);
            
            // Convert map back to array
            inventory.items = Array.from(itemMap.values());
            
            // Save the cleaned inventory
            inventory.markModified('items');
            await inventory.save();
            
            console.log(`  ✅ Consolidated into ${inventory.items.length} unique items`);
        }
        
        return duplicatesFound;
    }
    
    /**
     * Clean a specific player's inventory
     * @param {String} playerId - The player ID to clean
     * @returns {Object} Cleanup results
     */
    static async cleanupPlayerInventory(playerId) {
        console.log(`🧹 Cleaning inventory for player ${playerId}...`);
        
        try {
            const inventory = await PlayerInventory.findOne({ playerId });
            
            if (!inventory) {
                console.log(`ℹ️ No inventory found for player ${playerId}`);
                return { found: false, cleaned: 0 };
            }
            
            const cleanedCount = await this.cleanupSingleInventory(inventory);
            
            if (cleanedCount > 0) {
                console.log(`✅ Successfully cleaned ${cleanedCount} duplicate entries for player ${playerId}`);
            } else {
                console.log(`ℹ️ No duplicates found for player ${playerId}`);
            }
            
            return { found: true, cleaned: cleanedCount };
            
        } catch (error) {
            console.error(`❌ Error cleaning inventory for player ${playerId}:`, error);
            throw error;
        }
    }
    
    /**
     * Get statistics about duplicate items across all inventories
     * @returns {Object} Statistics about duplicates
     */
    static async getDuplicateStats() {
        console.log('📊 Analyzing inventory duplicates...');
        
        try {
            const inventories = await PlayerInventory.find({});
            let totalDuplicates = 0;
            let affectedPlayers = 0;
            const duplicateDetails = [];
            
            for (const inventory of inventories) {
                const itemCount = new Map();
                
                // Count occurrences of each itemId
                for (const item of inventory.items) {
                    itemCount.set(item.itemId, (itemCount.get(item.itemId) || 0) + 1);
                }
                
                // Check for duplicates
                const duplicates = Array.from(itemCount.entries()).filter(([_, count]) => count > 1);
                
                if (duplicates.length > 0) {
                    affectedPlayers++;
                    const playerDuplicates = duplicates.reduce((sum, [_, count]) => sum + (count - 1), 0);
                    totalDuplicates += playerDuplicates;
                    
                    duplicateDetails.push({
                        playerId: inventory.playerId,
                        playerTag: inventory.playerTag,
                        duplicateCount: playerDuplicates,
                        duplicateItems: duplicates.map(([itemId, count]) => ({ itemId, occurrences: count }))
                    });
                }
            }
            
            console.log(`📊 Analysis complete:`);
            console.log(`  - Total duplicate entries: ${totalDuplicates}`);
            console.log(`  - Affected players: ${affectedPlayers}`);
            console.log(`  - Total inventories checked: ${inventories.length}`);
            
            return {
                totalDuplicates,
                affectedPlayers,
                totalInventories: inventories.length,
                details: duplicateDetails
            };
            
        } catch (error) {
            console.error('❌ Error analyzing duplicates:', error);
            throw error;
        }
    }
    
    /**
     * Remove items with zero or negative quantities
     */
    static async removeInvalidQuantities() {
        console.log('🧹 Removing items with invalid quantities...');
        
        try {
            const inventories = await PlayerInventory.find({});
            let totalRemoved = 0;
            let inventoriesProcessed = 0;
            
            for (const inventory of inventories) {
                const originalLength = inventory.items.length;
                
                // Filter out items with invalid quantities
                inventory.items = inventory.items.filter(item => item.quantity > 0);
                
                const removedCount = originalLength - inventory.items.length;
                
                if (removedCount > 0) {
                    inventory.markModified('items');
                    await inventory.save();
                    totalRemoved += removedCount;
                    inventoriesProcessed++;
                    console.log(`  🔧 Removed ${removedCount} invalid items from player ${inventory.playerId}`);
                }
            }
            
            console.log(`✅ Removed ${totalRemoved} invalid items across ${inventoriesProcessed} inventories.`);
            return { totalRemoved, inventoriesProcessed };
            
        } catch (error) {
            console.error('❌ Error removing invalid quantities:', error);
            throw error;
        }
    }
}

// Export for use in other files
module.exports = InventoryCleanup;

// If run directly, execute cleanup
if (require.main === module) {
    const mongoose = require('mongoose');
    require('dotenv').config();
    
    async function runCleanup() {
        try {
            // Connect to MongoDB
            await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tambot', {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            
            console.log('📊 Connected to MongoDB');
            
            // First, analyze the current state
            const stats = await InventoryCleanup.getDuplicateStats();
            
            if (stats.totalDuplicates > 0) {
                console.log('\n🚀 Starting cleanup process...\n');
                
                // Perform cleanup
                await InventoryCleanup.cleanupAllInventories();
                
                // Also remove invalid quantities
                await InventoryCleanup.removeInvalidQuantities();
                
                // Show stats after cleanup
                console.log('\n📊 Verifying cleanup...');
                const afterStats = await InventoryCleanup.getDuplicateStats();
                
                if (afterStats.totalDuplicates === 0) {
                    console.log('✅ All duplicates successfully cleaned!');
                } else {
                    console.log(`⚠️ ${afterStats.totalDuplicates} duplicates remain - may need manual inspection`);
                }
            } else {
                console.log('\n✅ No duplicates found - inventories are clean!');
            }
            
        } catch (error) {
            console.error('❌ Cleanup failed:', error);
        } finally {
            await mongoose.connection.close();
            console.log('\n👋 Disconnected from MongoDB');
        }
    }
    
    runCleanup();
}
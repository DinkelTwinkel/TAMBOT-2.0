// patterns/uniqueItemFinding.js
// System for finding and assigning unique items to players

const UniqueItem = require('../models/uniqueItems');
const PlayerInventory = require('../models/inventory');
const { 
    UNIQUE_ITEMS, 
    getUniqueItemById, 
    getAvailableUniqueItems,
    calculateUniqueItemDropWeights 
} = require('../data/uniqueItemsSheet');
const { 
    ITEM_FINDING_CONFIG,
    calculateItemFindChance,
    getAvailableRegularItems 
} = require('./gachaModes/mining/miningConstants');
const { 
    tryConditionalDrop,
    isConditionalItem 
} = require('./conditionalUniqueItems');

// Initialize unique items in database if they don't exist
async function initializeUniqueItems() {
    try {
        console.log('[UNIQUE ITEMS] Initializing unique items database...');
        
        for (const itemData of UNIQUE_ITEMS) {
            const exists = await UniqueItem.findOne({ itemId: itemData.id });
            
            if (!exists) {
                await UniqueItem.create({
                    itemId: itemData.id,
                    maintenanceType: itemData.maintenanceType,
                    maintenanceCost: itemData.maintenanceCost,
                    requiresMaintenance: itemData.requiresMaintenance,
                    maintenanceLevel: 10
                });
                
                console.log(`[UNIQUE ITEMS] Created database entry for: ${itemData.name}`);
            }
        }
        
        console.log('[UNIQUE ITEMS] Initialization complete');
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error initializing:', error);
    }
}

// Roll for item finding
async function rollForItemFind(playerId, playerTag, powerLevel, luckStat, activityType = 'mining', biome = null, guildId = null) {
    try {
        // First check for conditional drops (like Midas' Burden)
        // These have special conditions but still require luck
        if (guildId && Math.random() < 0.001) { // 0.1% chance to check conditional
            const conditionalItems = [10]; // Midas' Burden
            for (const itemId of conditionalItems) {
                const result = await tryConditionalDrop(
                    { id: playerId, user: { tag: playerTag }, displayName: playerTag },
                    guildId,
                    itemId
                );
                if (result) {
                    return {
                        type: 'unique',
                        item: getUniqueItemById(itemId),
                        message: result.message
                    };
                }
            }
        }
        // Calculate if an item should be found
        const findChance = calculateItemFindChance(powerLevel, luckStat, activityType);
        
        if (Math.random() > findChance) {
            return null; // No item found
        }
        
        // Determine if it should be unique or regular
        const isUnique = Math.random() < ITEM_FINDING_CONFIG.uniqueItemWeight;
        
        if (isUnique) {
            // Try to find an unowned unique item
            const uniqueItem = await rollForUniqueItem(playerId, playerTag, powerLevel, biome);
            if (uniqueItem) {
                return uniqueItem;
            }
        }
        
        // Fall back to regular item
        return await rollForRegularItem(playerId, playerTag, powerLevel);
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error in item roll:', error);
        return null;
    }
}

// Roll for a unique item
async function rollForUniqueItem(playerId, playerTag, powerLevel, biome = null) {
    try {
        // Get available unique items for this power level
        const availableItems = getAvailableUniqueItems(powerLevel);
        if (availableItems.length === 0) return null;
        
        // Find which ones are unowned (excluding conditional items)
        const unownedItems = [];
        for (const itemData of availableItems) {
            // Skip conditional items in normal rolling
            if (isConditionalItem(itemData.id)) continue;
            
            const dbItem = await UniqueItem.findOne({ itemId: itemData.id });
            if (dbItem && !dbItem.ownerId) {
                unownedItems.push({ itemData, dbItem });
            }
        }
        
        if (unownedItems.length === 0) return null;
        
        // Calculate weights for unowned items
        const weights = calculateUniqueItemDropWeights(powerLevel, biome)
            .filter(w => unownedItems.some(u => u.itemData.id === w.item.id));
        
        if (weights.length === 0) return null;
        
        // Weighted random selection
        const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
        let random = Math.random() * totalWeight;
        
        let selectedItem = null;
        for (const weightedItem of weights) {
            random -= weightedItem.weight;
            if (random <= 0) {
                const found = unownedItems.find(u => u.itemData.id === weightedItem.item.id);
                if (found) {
                    selectedItem = found;
                    break;
                }
            }
        }
        
        if (!selectedItem) {
            selectedItem = unownedItems[0]; // Fallback
        }
        
        // Assign the item to the player
        await selectedItem.dbItem.assignToPlayer(playerId, playerTag);
        
        console.log(`[UNIQUE ITEMS] Player ${playerTag} found unique item: ${selectedItem.itemData.name}`);
        
        return {
            type: 'unique',
            item: selectedItem.itemData,
            dbItem: selectedItem.dbItem,
            message: `🌟 LEGENDARY FIND! You discovered **${selectedItem.itemData.name}**! This unique item is now yours!`
        };
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error rolling for unique:', error);
        return null;
    }
}

// Roll for a regular item
async function rollForRegularItem(playerId, playerTag, powerLevel) {
    try {
        const availableItems = getAvailableRegularItems(powerLevel);
        if (availableItems.length === 0) return null;
        
        // Weighted random selection
        const totalWeight = availableItems.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;
        
        let selectedItem = availableItems[0];
        for (const item of availableItems) {
            random -= item.weight;
            if (random <= 0) {
                selectedItem = item;
                break;
            }
        }
        
        // Add to player inventory
        await addItemToPlayerInventory(playerId, playerTag, selectedItem.itemId, 1);
        
        return {
            type: 'regular',
            item: selectedItem,
            message: `📦 You found: **${selectedItem.name}**!`
        };
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error rolling for regular item:', error);
        return null;
    }
}

// Add item to player inventory (for regular items)
async function addItemToPlayerInventory(playerId, playerTag, itemId, quantity) {
    try {
        let inventory = await PlayerInventory.findOne({ playerId });
        
        if (!inventory) {
            inventory = await PlayerInventory.create({
                playerId,
                playerTag,
                items: []
            });
        }
        
        // Find existing item or add new
        const existingItem = inventory.items.find(i => i.itemId === itemId);
        
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            inventory.items.push({
                itemId,
                quantity
            });
        }
        
        await inventory.save();
        return true;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error adding to inventory:', error);
        return false;
    }
}

// Get all unique items owned by a player
async function getPlayerUniqueItems(playerId) {
    try {
        const items = await UniqueItem.findPlayerUniqueItems(playerId);
        const itemsWithData = [];
        
        for (const dbItem of items) {
            const itemData = getUniqueItemById(dbItem.itemId);
            if (itemData) {
                itemsWithData.push({
                    ...itemData,
                    maintenanceLevel: dbItem.maintenanceLevel,
                    lastMaintenance: dbItem.lastMaintenanceDate,
                    statistics: dbItem.statistics
                });
            }
        }
        
        return itemsWithData;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error getting player items:', error);
        return [];
    }
}

// Check if a player owns any unique items
async function playerHasUniqueItems(playerId) {
    try {
        const count = await UniqueItem.countDocuments({ ownerId: playerId });
        return count > 0;
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error checking player items:', error);
        return false;
    }
}

// Transfer unique item between players (for trading)
async function transferUniqueItem(fromPlayerId, toPlayerId, toPlayerTag, itemId) {
    try {
        const item = await UniqueItem.findOne({ itemId, ownerId: fromPlayerId });
        
        if (!item) {
            throw new Error('Item not found or you do not own it');
        }
        
        // Add to history
        item.previousOwners.push({
            userId: fromPlayerId,
            userTag: item.ownerTag,
            acquiredDate: item.updatedAt,
            lostDate: new Date(),
            lostReason: 'traded'
        });
        
        // Transfer ownership
        item.ownerId = toPlayerId;
        item.ownerTag = toPlayerTag;
        item.maintenanceLevel = 10; // Reset maintenance for new owner
        
        await item.save();
        
        const itemData = getUniqueItemById(itemId);
        console.log(`[UNIQUE ITEMS] ${itemData.name} transferred from ${fromPlayerId} to ${toPlayerTag}`);
        
        return true;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error transferring item:', error);
        throw error;
    }
}

// Get global unique item statistics
async function getGlobalUniqueItemStats() {
    try {
        const allItems = await UniqueItem.find({});
        const stats = {
            totalItems: UNIQUE_ITEMS.length,
            ownedItems: 0,
            unownedItems: 0,
            mostFound: null,
            mostLost: null,
            items: []
        };
        
        for (const dbItem of allItems) {
            const itemData = getUniqueItemById(dbItem.itemId);
            if (!itemData) continue;
            
            const itemStat = {
                name: itemData.name,
                owner: dbItem.ownerTag || 'Unowned',
                timesFound: dbItem.statistics.timesFound,
                timesLost: dbItem.statistics.timesLostToMaintenance,
                maintenanceLevel: dbItem.maintenanceLevel
            };
            
            stats.items.push(itemStat);
            
            if (dbItem.ownerId) {
                stats.ownedItems++;
            } else {
                stats.unownedItems++;
            }
            
            if (!stats.mostFound || itemStat.timesFound > stats.mostFound.timesFound) {
                stats.mostFound = itemStat;
            }
            
            if (!stats.mostLost || itemStat.timesLost > stats.mostLost.timesLost) {
                stats.mostLost = itemStat;
            }
        }
        
        return stats;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error getting global stats:', error);
        return null;
    }
}

module.exports = {
    initializeUniqueItems,
    rollForItemFind,
    rollForUniqueItem,
    rollForRegularItem,
    getPlayerUniqueItems,
    playerHasUniqueItems,
    transferUniqueItem,
    getGlobalUniqueItemStats
};

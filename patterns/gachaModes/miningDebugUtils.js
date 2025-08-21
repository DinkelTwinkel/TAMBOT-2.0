// miningDebugUtils.js
// Utility functions for debugging the mining system

const gachaVC = require('../../models/activevcs');
const { createMiningSummary } = require('./mining/miningDatabase');
const { getMinecartSummary } = require('./mining/miningUtils');

/**
 * Force sells all items in a channel's mine cart
 * @param {Channel} channel - Discord voice channel
 * @returns {Object} Result object with success status and details
 */
async function forceSellMineCart(channel) {
    try {
        const dbEntry = await gachaVC.findOne({ channelId: channel.id });
        
        if (!dbEntry) {
            return { 
                success: false, 
                error: 'No database entry found for channel' 
            };
        }
        
        if (!dbEntry.gameData || !dbEntry.gameData.minecart) {
            return { 
                success: false, 
                error: 'No mine cart data found' 
            };
        }
        
        // Get summary before selling
        const beforeSummary = getMinecartSummary(dbEntry);
        
        // Create mining summary (sells items and distributes coins)
        const result = await createMiningSummary(channel, dbEntry);
        
        // Clear the mine cart
        await gachaVC.updateOne(
            { channelId: channel.id },
            { $set: { 'gameData.minecart': {} } }
        );
        
        return {
            success: true,
            itemsSold: beforeSummary.totalItems,
            totalValue: beforeSummary.totalValue,
            summary: beforeSummary.summary
        };
        
    } catch (error) {
        console.error('[DEBUG] Error in forceSellMineCart:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Gets detailed mine cart contents for a channel
 * @param {string} channelId - Channel ID
 * @returns {Object} Detailed cart contents
 */
async function getMineCartDetails(channelId) {
    try {
        const dbEntry = await gachaVC.findOne({ channelId });
        
        if (!dbEntry || !dbEntry.gameData || !dbEntry.gameData.minecart) {
            return null;
        }
        
        const minecart = dbEntry.gameData.minecart;
        const details = {
            players: {},
            totalItems: 0,
            totalValue: 0
        };
        
        // Get mining item pool for value calculation
        const { miningItemPool } = require('./mining/miningConstants');
        const itemValueMap = {};
        miningItemPool.forEach(item => {
            itemValueMap[item.itemId] = item.value;
        });
        
        for (const [playerId, playerCart] of Object.entries(minecart)) {
            if (!playerCart || typeof playerCart !== 'object') continue;
            
            const playerItems = [];
            let playerValue = 0;
            let playerItemCount = 0;
            
            for (const [itemId, quantity] of Object.entries(playerCart)) {
                if (quantity > 0) {
                    const value = itemValueMap[itemId] || 0;
                    playerItems.push({
                        itemId,
                        quantity,
                        value: value * quantity
                    });
                    playerValue += value * quantity;
                    playerItemCount += quantity;
                }
            }
            
            if (playerItemCount > 0) {
                details.players[playerId] = {
                    items: playerItems,
                    totalItems: playerItemCount,
                    totalValue: playerValue
                };
                details.totalItems += playerItemCount;
                details.totalValue += playerValue;
            }
        }
        
        return details;
        
    } catch (error) {
        console.error('[DEBUG] Error getting mine cart details:', error);
        return null;
    }
}

/**
 * Clears the mine cart without selling (emergency reset)
 * @param {string} channelId - Channel ID
 * @returns {boolean} Success status
 */
async function clearMineCart(channelId) {
    try {
        const result = await gachaVC.updateOne(
            { channelId },
            { $set: { 'gameData.minecart': {} } }
        );
        
        return result.modifiedCount > 0;
        
    } catch (error) {
        console.error('[DEBUG] Error clearing mine cart:', error);
        return false;
    }
}

/**
 * Adds test items to a player's mine cart for debugging
 * @param {string} channelId - Channel ID
 * @param {string} playerId - Player ID
 * @param {string} itemId - Item ID to add
 * @param {number} quantity - Quantity to add
 * @returns {boolean} Success status
 */
async function addTestItemToCart(channelId, playerId, itemId, quantity) {
    try {
        const dbEntry = await gachaVC.findOne({ channelId });
        
        if (!dbEntry) {
            console.log('[DEBUG] No DB entry found for channel:', channelId);
            return false;
        }
        
        // Initialize structures if needed
        if (!dbEntry.gameData) {
            dbEntry.gameData = {};
        }
        if (!dbEntry.gameData.minecart) {
            dbEntry.gameData.minecart = {};
        }
        if (!dbEntry.gameData.minecart[playerId]) {
            dbEntry.gameData.minecart[playerId] = {};
        }
        
        // Add the item
        const currentQuantity = dbEntry.gameData.minecart[playerId][itemId] || 0;
        dbEntry.gameData.minecart[playerId][itemId] = currentQuantity + quantity;
        
        await dbEntry.save();
        
        console.log(`[DEBUG] Added ${quantity}x ${itemId} to player ${playerId}'s cart`);
        return true;
        
    } catch (error) {
        console.error('[DEBUG] Error adding test item to cart:', error);
        return false;
    }
}

/**
 * Force ends a mining session and distributes rewards
 * @param {Channel} channel - Discord voice channel
 * @returns {Object} Result object
 */
async function forceEndMiningSession(channel) {
    try {
        // First, force sell the cart
        const sellResult = await forceSellMineCart(channel);
        
        if (!sellResult.success) {
            return sellResult;
        }
        
        // Clear the game data to end the session
        await gachaVC.updateOne(
            { channelId: channel.id },
            { 
                $unset: { 
                    'gameData': 1,
                    'nextShopRefresh': 1,
                    'nextTrigger': 1
                } 
            }
        );
        
        // Clear any active intervals
        const { concurrencyManager } = require('./mining_concurrency_fix');
        concurrencyManager.clearAllIntervalsForChannel(channel.id);
        concurrencyManager.releaseLock(channel.id);
        
        return {
            success: true,
            itemsSold: sellResult.itemsSold,
            totalValue: sellResult.totalValue,
            message: 'Mining session ended and rewards distributed'
        };
        
    } catch (error) {
        console.error('[DEBUG] Error ending mining session:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    forceSellMineCart,
    getMineCartDetails,
    clearMineCart,
    addTestItemToCart,
    forceEndMiningSession
};
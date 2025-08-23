// Simplified fix for minecart display - no cache dependencies
// This version only uses direct database access

const gachaVC = require('../../../models/activevcs');

// Try to import miningConstants from the correct path
let miningItemPool, treasureItems;
try {
    const constants = require('../mining/miningConstants_unified');
    miningItemPool = constants.miningItemPool;
    treasureItems = constants.treasureItems;
} catch (e) {
    console.warn('[MINECART] Could not load mining constants, using empty pools');
    miningItemPool = [];
    treasureItems = [];
}

// Enhanced getMinecartSummary that fetches fresh data from database
async function getMinecartSummaryFresh(channelId) {
    try {
        // Always get fresh data from database for minecart summary
        const dbEntry = await gachaVC.findOne({ channelId }).lean();
        
        if (!dbEntry?.gameData?.minecart) {
            return {
                totalValue: 0,
                itemCount: 0,
                contributorCount: 0,
                summary: 'No items yet'
            };
        }
        
        const minecart = dbEntry.gameData.minecart;
        let totalValue = 0;
        let itemCount = 0;
        
        // Ensure we have the items object
        const items = minecart.items || {};
        const contributors = minecart.contributors || {};
        
        // Calculate totals from the database data
        for (const [itemId, itemData] of Object.entries(items)) {
            // Handle both old format (direct number) and new format (object with quantity)
            let quantity = 0;
            if (typeof itemData === 'number') {
                quantity = itemData;
            } else if (itemData && typeof itemData.quantity === 'number') {
                quantity = itemData.quantity;
            }
            
            if (quantity > 0) {
                itemCount += quantity;
                
                // Find item value - try to use the pools if available
                if (miningItemPool.length > 0 || treasureItems.length > 0) {
                    const itemInfo = miningItemPool.find(i => i.itemId === itemId) || 
                                   treasureItems.find(i => i.itemId === itemId);
                    
                    if (itemInfo) {
                        totalValue += itemInfo.value * quantity;
                    }
                }
            }
        }
        
        // Count contributors
        const contributorCount = Object.keys(contributors).length;
        
        // Format the summary
        let summary;
        if (itemCount === 0) {
            summary = 'No items yet';
        } else {
            summary = `${itemCount} items`;
            if (totalValue > 0) {
                summary += ` worth ${totalValue} coins`;
            }
            if (contributorCount > 0) {
                summary += ` (${contributorCount} contributor${contributorCount !== 1 ? 's' : ''})`;
            }
        }
        
        return {
            totalValue,
            itemCount,
            contributorCount,
            summary
        };
        
    } catch (error) {
        console.error(`[MINECART] Error getting fresh summary for channel ${channelId}:`, error);
        return {
            totalValue: 0,
            itemCount: 0,
            contributorCount: 0,
            summary: 'Error loading minecart'
        };
    }
}

// Simplified version that doesn't update cache
async function addItemToMinecartFixed(dbEntry, playerId, itemId, amount) {
    const channelId = dbEntry.channelId;
    
    try {
        // Update database directly
        const updateResult = await gachaVC.findOneAndUpdate(
            { channelId },
            {
                $inc: {
                    [`gameData.minecart.items.${itemId}.quantity`]: amount,
                    [`gameData.minecart.items.${itemId}.contributors.${playerId}`]: amount,
                    [`gameData.minecart.contributors.${playerId}`]: amount,
                    'gameData.stats.totalOreFound': amount
                }
            },
            { 
                new: true, // Return updated document
                upsert: true
            }
        );
        
        // Debug log for verification
        if (Math.random() < 0.05) { // 5% logging to avoid spam
            console.log(`[MINECART] Added ${amount}x ${itemId} for player ${playerId}. New total in DB:`, 
                updateResult?.gameData?.minecart?.items?.[itemId]?.quantity || 0);
        }
        
        return true;
        
    } catch (error) {
        console.error(`[MINECART] Error adding item to minecart:`, error);
        
        // Fallback: ensure structure exists and try again
        try {
            await gachaVC.updateOne(
                { channelId },
                {
                    $set: {
                        'gameData.minecart': { items: {}, contributors: {} }
                    }
                }
            );
            
            // Retry the update
            await gachaVC.updateOne(
                { channelId },
                {
                    $inc: {
                        [`gameData.minecart.items.${itemId}.quantity`]: amount,
                        [`gameData.minecart.items.${itemId}.contributors.${playerId}`]: amount,
                        [`gameData.minecart.contributors.${playerId}`]: amount
                    }
                }
            );
            
            return true;
        } catch (retryError) {
            console.error(`[MINECART] Retry failed:`, retryError);
            return false;
        }
    }
}

module.exports = {
    getMinecartSummaryFresh,
    addItemToMinecartFixed
};

// IMMEDIATE FIX for getMinecartSummary in miningUtils.js
// Replace the existing getMinecartSummary function with this enhanced version

const gachaVC = require('../../../models/activevcs');
const { miningItemPool, treasureItems } = require('../mining/miningConstants_unified');

// Enhanced getMinecartSummary that handles all data formats correctly
function getMinecartSummary(dbEntry) {
    try {
        // Ensure we're looking in the right place
        const minecart = dbEntry?.gameData?.minecart;
        
        if (!minecart || !minecart.items) {
            // Try to get fresh data if missing
            console.log('[MINECART] Warning: Minecart data missing in provided entry');
            return {
                totalValue: 0,
                itemCount: 0,
                contributorCount: 0,
                summary: 'No items yet'
            };
        }
        
        let totalValue = 0;
        let itemCount = 0;
        const itemDetails = [];
        
        // Process items - handle both old and new data formats
        for (const [itemId, itemData] of Object.entries(minecart.items)) {
            let quantity = 0;
            
            // Handle different data formats
            if (typeof itemData === 'number') {
                // Old format: direct number
                quantity = itemData;
            } else if (itemData && typeof itemData === 'object') {
                // New format: object with quantity
                quantity = itemData.quantity || 0;
            }
            
            if (quantity > 0) {
                itemCount += quantity;
                
                // Find item value from pools
                const itemInfo = miningItemPool.find(i => i.itemId === itemId) || 
                               treasureItems.find(i => i.itemId === itemId);
                
                if (itemInfo) {
                    const itemValue = itemInfo.value * quantity;
                    totalValue += itemValue;
                    itemDetails.push({ 
                        itemId, 
                        name: itemInfo.name, 
                        quantity, 
                        value: itemValue 
                    });
                } else {
                    // Item not in pools, log for debugging
                    console.log(`[MINECART] Unknown item: ${itemId} x${quantity}`);
                }
            }
        }
        
        // Count contributors
        const contributorCount = Object.keys(minecart.contributors || {}).length;
        
        // Generate summary text
        let summary;
        if (itemCount === 0) {
            summary = 'No items yet';
        } else {
            summary = `${itemCount} items worth ${totalValue} coins`;
            if (contributorCount > 0) {
                summary += ` (${contributorCount} contributor${contributorCount !== 1 ? 's' : ''})`;
            }
        }
        
        // Debug logging (5% chance to avoid spam)
        if (Math.random() < 0.05 && itemCount > 0) {
            console.log(`[MINECART SUMMARY] ${summary}`);
            console.log(`[MINECART DETAILS]`, itemDetails.slice(0, 3));
        }
        
        return {
            totalValue,
            itemCount,
            contributorCount,
            summary,
            details: itemDetails // Extra info for debugging
        };
        
    } catch (error) {
        console.error('[MINECART] Error getting summary:', error);
        return {
            totalValue: 0,
            itemCount: 0,
            contributorCount: 0,
            summary: 'Error loading minecart',
            details: []
        };
    }
}

// Async version that gets fresh data from database
async function getMinecartSummaryAsync(channelId) {
    try {
        // Get fresh data directly from database
        const dbEntry = await gachaVC.findOne({ channelId }).lean();
        
        if (!dbEntry) {
            return {
                totalValue: 0,
                itemCount: 0,
                contributorCount: 0,
                summary: 'No mining session found'
            };
        }
        
        // Use the sync function with fresh data
        return getMinecartSummary(dbEntry);
        
    } catch (error) {
        console.error(`[MINECART] Error getting async summary for ${channelId}:`, error);
        return {
            totalValue: 0,
            itemCount: 0,
            contributorCount: 0,
            summary: 'Error loading minecart'
        };
    }
}

module.exports = {
    getMinecartSummary,
    getMinecartSummaryAsync
};

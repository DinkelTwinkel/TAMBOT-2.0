// Complete patch for mining_optimized_v5_performance.js to fix minecart display
// Apply these changes to the main file

// =======================
// CHANGE 1: Add import at the top (after other imports)
// =======================
const { getMinecartSummaryFresh } = require('./mining_fixes/fix_minecart_display');

// =======================
// CHANGE 2: Replace the logEvent function's minecart line (around line 1143)
// =======================
// REPLACE THIS LINE:
// const minecartSummary = getMinecartSummary(result);
// WITH:
// const minecartSummary = await getMinecartSummaryFresh(channel.id);

// =======================
// CHANGE 3: Update addItemToMinecart calls to flush cache (optional but recommended)
// =======================
// After any addItemToMinecart call, add:
// await mapCacheSystem.forceFlush();

// =======================
// FULL REPLACEMENT FOR getMinecartSummary function in miningUtils.js
// =======================
function getMinecartSummary(dbEntry) {
    try {
        // Ensure minecart exists at correct location
        const minecart = dbEntry?.gameData?.minecart || { items: {}, contributors: {} };
        
        // Ensure sub-structures
        if (!minecart.items) minecart.items = {};
        if (!minecart.contributors) minecart.contributors = {};
        
        let totalValue = 0;
        let itemCount = 0;
        
        // Handle both old and new formats
        for (const [itemId, itemData] of Object.entries(minecart.items)) {
            let quantity = 0;
            
            // Handle different data formats
            if (typeof itemData === 'number') {
                quantity = itemData;
            } else if (itemData && typeof itemData === 'object') {
                quantity = itemData.quantity || 0;
            }
            
            if (quantity > 0) {
                const item = miningItemPool.find(i => i.itemId === itemId) || 
                           treasureItems.find(i => i.itemId === itemId);
                
                if (item) {
                    totalValue += item.value * quantity;
                    itemCount += quantity;
                } else {
                    // Item not found in pools, just count it
                    itemCount += quantity;
                }
            }
        }
        
        const contributorCount = Object.keys(minecart.contributors).length;
        
        // Generate summary text
        let summary = 'No items yet';
        if (itemCount > 0) {
            summary = `${itemCount} items worth ${totalValue} coins`;
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
        console.error('[MINECART] Error getting summary:', error);
        return {
            totalValue: 0,
            itemCount: 0,
            contributorCount: 0,
            summary: 'No items yet'
        };
    }
}

// =======================
// ENHANCED addItemToMinecart in miningDatabase.js
// =======================
async function addItemToMinecart(dbEntry, playerId, itemId, amount) {
    const channelId = dbEntry.channelId;
    
    try {
        // Use findOneAndUpdate to get the updated document
        const updatedDoc = await gachaVC.findOneAndUpdate(
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
                new: true, // Return the updated document
                upsert: true 
            }
        );
        
        // Update the cache with fresh minecart data
        if (updatedDoc?.gameData?.minecart) {
            mapCacheSystem.updateMultiple(channelId, {
                'minecart': updatedDoc.gameData.minecart,
                'stats': updatedDoc.gameData.stats
            });
        }
        
        // Debug logging
        if (Math.random() < 0.1) { // 10% chance to log
            const newQuantity = updatedDoc?.gameData?.minecart?.items?.[itemId]?.quantity || 0;
            console.log(`[MINECART] Added ${amount}x ${itemId} for player ${playerId}. New total: ${newQuantity}`);
        }
        
        return true;
        
    } catch (error) {
        console.error(`[MINECART] Error adding item to minecart:`, error);
        
        // Fallback: ensure structure exists
        try {
            // First ensure the structure exists
            await gachaVC.updateOne(
                { channelId },
                {
                    $setOnInsert: {
                        'gameData.minecart': { items: {}, contributors: {} },
                        'gameData.stats': { totalOreFound: 0, wallsBroken: 0, treasuresFound: 0 }
                    }
                },
                { upsert: true }
            );
            
            // Then add the item
            await gachaVC.updateOne(
                { channelId },
                {
                    $inc: {
                        [`gameData.minecart.items.${itemId}.quantity`]: amount,
                        [`gameData.minecart.items.${itemId}.contributors.${playerId}`]: amount,
                        [`gameData.minecart.contributors.${playerId}`]: amount,
                        'gameData.stats.totalOreFound': amount
                    }
                }
            );
            
            // Force cache refresh
            mapCacheSystem.clearChannel(channelId);
            
            return true;
        } catch (fallbackError) {
            console.error(`[MINECART] Fallback also failed:`, fallbackError);
            return false;
        }
    }
}

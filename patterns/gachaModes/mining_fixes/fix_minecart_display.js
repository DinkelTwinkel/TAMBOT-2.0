// Fix for minecart display not showing correct/latest amounts
// This fixes the issue where logEvent doesn't show the latest minecart totals

const gachaVC = require('../../../models/activevcs');
const mapCacheSystem = require('../mining/cache/mapCacheSystem');
const { miningItemPool, treasureItems } = require('../mining/miningConstants_unified');

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
                
                // Find item value
                const itemInfo = miningItemPool.find(i => i.itemId === itemId) || 
                               treasureItems.find(i => i.itemId === itemId);
                
                if (itemInfo) {
                    totalValue += itemInfo.value * quantity;
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
        console.error(`[MINECART] Error getting fresh summary for channel ${channelId}:`, error);
        return {
            totalValue: 0,
            itemCount: 0,
            contributorCount: 0,
            summary: 'Error loading minecart'
        };
    }
}

// Fixed addItemToMinecart that properly updates both DB and cache
async function addItemToMinecartFixed(dbEntry, playerId, itemId, amount) {
    const channelId = dbEntry.channelId;
    
    try {
        // Update database with new format
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
        
        // Update cache with the new minecart data
        if (mapCacheSystem && updateResult) {
            const minecartData = updateResult.gameData?.minecart;
            if (minecartData) {
                mapCacheSystem.updateMultiple(channelId, {
                    'minecart': minecartData
                });
            }
        }
        
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

// Patch for logEvent to use fresh minecart data
async function logEventWithFreshMinecart(channel, eventText, forceNew = false, powerLevelInfo = null) {
    try {
        const channelId = channel.id;
        
        // Get fresh minecart summary directly from database
        const minecartSummary = await getMinecartSummaryFresh(channelId);
        
        // Get other data from cache (for performance)
        const result = await getCachedDBEntry(channelId);
        if (!result) {
            console.error(`[MINING] Cannot log event - no DB entry for channel ${channelId}`);
            return;
        }
        
        const now = new Date();
        let timeStatus = "MINING";
        let timeRemaining = 0;
        let endTimestamp = null;

        if (result.gameData?.breakInfo?.inBreak) {
            const breakEndTime = result.gameData.breakInfo.breakEndTime;
            timeRemaining = Math.max(0, Math.floor((breakEndTime - now) / (1000 * 60)));
            endTimestamp = Math.floor(breakEndTime / 1000);

            if (result.gameData.breakInfo.isLongBreak) {
                timeStatus = result.gameData?.specialEvent ? "LONG BREAK (EVENT)" : "LONG BREAK (SHOP)";
            } else {
                timeStatus = "SHORT BREAK";
            }
        } else if (result.nextShopRefresh) {
            timeRemaining = Math.max(0, Math.floor((result.nextShopRefresh - now) / (1000 * 60)));
            endTimestamp = Math.floor(result.nextShopRefresh / 1000);
            timeStatus = "MINING";
        }
        
        // Continue with rest of logEvent using fresh minecart summary...
        const logEntry = eventText ? `${eventText} \n-------------------------------` : null;
        
        // ... rest of the logEvent code remains the same
        // But now uses the fresh minecartSummary instead of cached
        
        let titleText = endTimestamp
            ? `🗺️ MINING MAP | ${timeStatus} ends <t:${endTimestamp}:R>`
            : `🗺️ MINING MAP | ${timeStatus}`;
            
        if (powerLevelInfo) {
            titleText += ` | ${powerLevelInfo.name} (Lv.${powerLevelInfo.level})`;
        }
        
        // Use the FRESH minecart summary here
        const footerText = `MINECART: ${minecartSummary.summary}`;
        
        // ... continue with embed creation using fresh data
        
        console.log(`[MINECART DISPLAY] Showing: ${minecartSummary.summary}`);
        
        return { minecartSummary, footerText };
        
    } catch (error) {
        console.error('[MINING] Error in logEvent with fresh minecart:', error);
    }
}

// Helper to force refresh minecart cache
async function forceRefreshMinecartCache(channelId) {
    try {
        const dbEntry = await gachaVC.findOne({ channelId }).lean();
        
        if (dbEntry?.gameData?.minecart) {
            // Update cache with fresh minecart data
            mapCacheSystem.updateMultiple(channelId, {
                'minecart': dbEntry.gameData.minecart
            });
            
            console.log(`[MINECART] Force refreshed cache for channel ${channelId}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`[MINECART] Error refreshing cache:`, error);
        return false;
    }
}

module.exports = {
    getMinecartSummaryFresh,
    addItemToMinecartFixed,
    logEventWithFreshMinecart,
    forceRefreshMinecartCache
};

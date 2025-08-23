// IMMEDIATE HOTFIX for mining_optimized_v5_performance.js
// Apply these changes to fix the critical bugs

// 1. ADD THIS IMPORT at the top of the file (after other requires):
const miningFixes = require('./mining_fixes/fix_mining_bugs');

// 2. REPLACE the addItemToMinecart function in miningDatabase.js with this safer version:
async function addItemToMinecart(dbEntry, memberId, itemId, quantity) {
    try {
        // Use the safe version from fixes
        return await miningFixes.safeAddToMinecart(dbEntry, memberId, itemId, quantity);
    } catch (error) {
        console.error(`[MINECART] Error adding item:`, error);
        
        // Fallback: ensure structure exists
        if (!dbEntry.gameData) dbEntry.gameData = {};
        if (!dbEntry.gameData.minecart) {
            dbEntry.gameData.minecart = { items: {}, contributors: {} };
        }
        if (!dbEntry.gameData.minecart.items) {
            dbEntry.gameData.minecart.items = {};
        }
        if (!dbEntry.gameData.minecart.contributors) {
            dbEntry.gameData.minecart.contributors = {};
        }
        
        // Try again
        const currentQuantity = dbEntry.gameData.minecart.items[itemId] || 0;
        dbEntry.gameData.minecart.items[itemId] = currentQuantity + quantity;
        
        const currentContribution = dbEntry.gameData.minecart.contributors[memberId] || 0;
        dbEntry.gameData.minecart.contributors[memberId] = currentContribution + quantity;
        
        return true;
    }
}

// 3. REPLACE getMinecartSummary function in miningUtils.js with this safer version:
function getMinecartSummary(dbEntry) {
    try {
        // Ensure minecart exists at correct location
        const minecart = dbEntry?.gameData?.minecart || { items: {}, contributors: {} };
        
        // Ensure sub-structures
        if (!minecart.items) minecart.items = {};
        if (!minecart.contributors) minecart.contributors = {};
        
        let totalValue = 0;
        let itemCount = 0;
        
        // Use Object.entries for safer iteration
        for (const [itemId, quantity] of Object.entries(minecart.items)) {
            if (typeof quantity === 'number' && quantity > 0) {
                const item = miningItemPool.find(i => i.itemId === itemId);
                if (item) {
                    totalValue += item.value * quantity;
                    itemCount += quantity;
                }
            }
        }
        
        const contributorCount = Object.keys(minecart.contributors).length;
        
        return {
            totalValue,
            itemCount,
            contributorCount,
            summary: `${itemCount} items worth ${totalValue} coins (${contributorCount} contributors)`
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

// 4. ADD this check at the START of the main module.exports function:
module.exports = async (channel, dbEntry, json, client) => {
    const channelId = channel.id;
    const processingStartTime = Date.now();
    
    // === CRITICAL HOTFIX START ===
    try {
        // Quick validation and fix
        const now = Date.now();
        
        // Fix 1: Ensure minecart structure
        if (!dbEntry.gameData) dbEntry.gameData = {};
        if (!dbEntry.gameData.minecart) {
            dbEntry.gameData.minecart = { items: {}, contributors: {} };
            dbEntry.markModified('gameData.minecart');
            await dbEntry.save();
            console.log(`[HOTFIX] Fixed minecart structure for ${channelId}`);
        }
        
        // Fix 2: Check and fix expired breaks
        if (dbEntry.gameData?.breakInfo?.inBreak) {
            const breakEndTime = dbEntry.gameData.breakInfo.breakEndTime;
            if (breakEndTime && now >= breakEndTime) {
                console.log(`[HOTFIX] Clearing expired break for ${channelId}`);
                
                // Clear break state
                delete dbEntry.gameData.breakInfo;
                dbEntry.gameData.breakJustEnded = now;
                dbEntry.nextTrigger = new Date(now + 1000);
                dbEntry.markModified('gameData');
                await dbEntry.save();
                
                // Clear from cache
                mapCacheSystem.deleteField(channelId, 'breakInfo');
                await mapCacheSystem.forceFlush();
                
                // Force refresh
                dbEntry = await getCachedDBEntry(channelId, true);
                if (!dbEntry) {
                    console.error(`[HOTFIX] Failed to refresh after break clear`);
                    return;
                }
            }
        }
        
        // Fix 3: Validate timers
        if (dbEntry.nextShopRefresh && new Date(dbEntry.nextShopRefresh) < now) {
            if (!dbEntry.gameData?.breakInfo?.inBreak) {
                console.log(`[HOTFIX] Timer mismatch detected for ${channelId}`);
                // Will be handled by normal break start logic
            }
        }
        
        // Fix 4: Clear stuck instances
        if (concurrencyManager.isLocked(channelId)) {
            const lastProcessed = healthMetrics.lastProcessed.get(channelId);
            if (lastProcessed && (now - lastProcessed) > 120000) { // 2 minutes
                console.log(`[HOTFIX] Clearing stuck lock for ${channelId}`);
                concurrencyManager.forceUnlock(channelId);
                instanceManager.forceKillChannel(channelId);
            }
        }
        
    } catch (hotfixError) {
        console.error(`[HOTFIX] Error applying hotfix for ${channelId}:`, hotfixError);
    }
    // === CRITICAL HOTFIX END ===
    
    // Continue with original processing...
    // [Rest of original code]

// IMMEDIATE BUG FIXES FOR MINING GAME
// Apply these patches to your mining_optimized_v5_performance.js file

// ========================================
// PATCH 1: Fix Minecart Data Structure
// ========================================
// Replace the existing getCachedDBEntry function (around line 324) with this:

async function getCachedDBEntry(channelId, forceRefresh = false, retryCount = 0) {
    try {
        const now = Date.now();
        
        // Always force refresh if we have stale break data
        if (!forceRefresh && mapCacheSystem.isCached(channelId)) {
            const cached = mapCacheSystem.getCachedData(channelId);
            if (cached?.breakInfo?.breakEndTime && now >= cached.breakInfo.breakEndTime) {
                console.log(`[MINING] Cached break expired, forcing refresh for ${channelId}`);
                forceRefresh = true;
            }
        }
        
        // For critical operations, always get fresh data
        if (forceRefresh) {
            // Clear cache first
            mapCacheSystem.clearChannel(channelId);
            
            // Get fresh from database
            const dbEntry = await gachaVC.findOne({ channelId });
            if (!dbEntry) return null;
            
            // FIX: Ensure minecart structure exists at gameData level
            if (!dbEntry.gameData) {
                dbEntry.gameData = {};
            }
            if (!dbEntry.gameData.minecart) {
                dbEntry.gameData.minecart = { items: {}, contributors: {} };
                dbEntry.markModified('gameData.minecart');
                await dbEntry.save();
                console.log(`[MINECART FIX] Created minecart structure for ${channelId}`);
            }
            
            // Validate minecart substructures
            if (!dbEntry.gameData.minecart.items || typeof dbEntry.gameData.minecart.items !== 'object') {
                dbEntry.gameData.minecart.items = {};
                dbEntry.markModified('gameData.minecart.items');
            }
            if (!dbEntry.gameData.minecart.contributors || typeof dbEntry.gameData.minecart.contributors !== 'object') {
                dbEntry.gameData.minecart.contributors = {};
                dbEntry.markModified('gameData.minecart.contributors');
            }
            
            // Save if we made changes
            if (dbEntry.isModified()) {
                await dbEntry.save();
            }
            
            // Reinitialize cache with correct data
            await mapCacheSystem.initialize(channelId, true);
            
            return dbEntry;
        }
        
        // Initialize cache if not already done
        if (!mapCacheSystem.isCached(channelId)) {
            await mapCacheSystem.initialize(channelId, forceRefresh);
        }
        
        // Get cached data
        const cached = mapCacheSystem.getCachedData(channelId);
        
        if (!cached) {
            // Fallback to direct DB read
            console.error(`[MINING] Cache miss for channel ${channelId}, falling back to DB`);
            const entry = await gachaVC.findOne({ channelId });
            if (entry) {
                // Ensure minecart exists
                if (!entry.gameData) entry.gameData = {};
                if (!entry.gameData.minecart) {
                    entry.gameData.minecart = { items: {}, contributors: {} };
                    entry.markModified('gameData.minecart');
                    await entry.save();
                }
                return entry;
            }
            return null;
        }
        
        // FIX: Ensure cached data has proper minecart structure
        if (!cached.minecart || typeof cached.minecart !== 'object') {
            cached.minecart = { items: {}, contributors: {} };
        }
        if (!cached.minecart.items) cached.minecart.items = {};
        if (!cached.minecart.contributors) cached.minecart.contributors = {};
        
        // Return properly structured cached entry
        return {
            channelId: channelId,
            gameData: {
                ...cached,
                minecart: cached.minecart  // Ensure minecart is at gameData level
            },
            nextShopRefresh: cached.nextShopRefresh,
            nextTrigger: cached.nextTrigger,
            save: async function() {
                // Direct database update for critical saves
                const updates = {};
                
                // Ensure minecart updates are properly formatted
                if (this.gameData.minecart) {
                    updates['gameData.minecart'] = {
                        items: this.gameData.minecart.items || {},
                        contributors: this.gameData.minecart.contributors || {}
                    };
                }
                
                // Include other critical updates
                for (const [key, value] of Object.entries(this.gameData)) {
                    if (key !== 'minecart' && key !== 'lastUpdated' && key !== 'channelId') {
                        updates[`gameData.${key}`] = value;
                    }
                }
                
                // Direct database update
                await gachaVC.updateOne(
                    { channelId: channelId },
                    { $set: updates }
                );
                
                // Update cache
                await mapCacheSystem.updateMultiple(channelId, this.gameData);
                await mapCacheSystem.forceFlush();
                
                console.log(`[SAVE] Updated minecart and game data for ${channelId}`);
                return true;
            },
            markModified: function(path) {
                console.log(`[MODIFIED] Marked ${path} as modified`);
            }
        };
        
    } catch (error) {
        console.error(`[MINING] Error fetching cached entry for channel ${channelId}:`, error);
        if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return getCachedDBEntry(channelId, true, retryCount + 1);  // Force refresh on retry
        }
        return null;
    }
}

// ========================================
// PATCH 2: Fix Break Timer Logic
// ========================================
// Replace the isBreakPeriod function (around line 656) with this:

function isBreakPeriod(dbEntry) {
    const now = Date.now();
    const breakInfo = dbEntry?.gameData?.breakInfo;
    
    // No break info = not in break
    if (!breakInfo || !breakInfo.inBreak) {
        return false;
    }
    
    // Check if break has expired
    if (breakInfo.breakEndTime) {
        if (now >= breakInfo.breakEndTime) {
            console.log(`[BREAK] Break has expired (ended ${Math.floor((now - breakInfo.breakEndTime) / 1000)}s ago)`);
            return false;  // Break time has passed
        }
        
        // Log remaining time periodically
        const remaining = breakInfo.breakEndTime - now;
        if (Math.random() < 0.1) {  // 10% chance to log
            console.log(`[BREAK] Still in break, ${Math.ceil(remaining / 60000)} minutes remaining`);
        }
    }
    
    // Only return true if actually in break and time hasn't expired
    return breakInfo.inBreak === true;
}

// ========================================
// PATCH 3: Fix Mining Action Processing
// ========================================
// Add this helper function to ensure players can mine:

async function ensurePlayerCanMine(member, dbEntry, mapData) {
    const playerId = member.id;
    
    // Check if player position exists
    if (!mapData.playerPositions) {
        mapData.playerPositions = {};
    }
    
    if (!mapData.playerPositions[playerId]) {
        console.log(`[PLAYER] Initializing position for ${member.displayName}`);
        mapData.playerPositions[playerId] = {
            x: mapData.entranceX || Math.floor(mapData.width / 2),
            y: mapData.entranceY || Math.floor(mapData.height / 2),
            hidden: false,
            disabled: false,
            stuck: false,
            trapped: false
        };
        return true;  // Position was initialized
    }
    
    // Check if player is stuck or disabled
    const position = mapData.playerPositions[playerId];
    
    if (position.disabled || position.stuck || position.trapped) {
        // Check if we should re-enable them
        const disabledInfo = dbEntry.gameData?.disabledPlayers?.[playerId];
        
        if (disabledInfo?.enableAt) {
            const now = Date.now();
            if (now >= disabledInfo.enableAt) {
                // Re-enable player
                console.log(`[PLAYER] Re-enabling ${member.displayName}`);
                position.disabled = false;
                position.stuck = false;
                position.trapped = false;
                
                if (dbEntry.gameData?.disabledPlayers) {
                    delete dbEntry.gameData.disabledPlayers[playerId];
                }
                
                return true;  // Player was re-enabled
            }
        } else {
            // No disable timer, just clear the flags
            position.disabled = false;
            position.stuck = false;
            position.trapped = false;
            return true;
        }
    }
    
    return false;  // No changes needed
}

// ========================================
// PATCH 4: Fix Minecart Adding Function
// ========================================
// In your miningDatabase.js file, ensure addItemToMinecart works correctly:

async function addItemToMinecart(dbEntry, playerId, itemId, quantity) {
    try {
        // Validate inputs
        if (!dbEntry || !playerId || !itemId || quantity <= 0) {
            console.error(`[MINECART] Invalid inputs: dbEntry=${!!dbEntry}, playerId=${playerId}, itemId=${itemId}, quantity=${quantity}`);
            return false;
        }
        
        // Ensure structure exists
        if (!dbEntry.gameData) {
            dbEntry.gameData = {};
        }
        if (!dbEntry.gameData.minecart) {
            dbEntry.gameData.minecart = { items: {}, contributors: {} };
            console.log(`[MINECART] Created minecart structure`);
        }
        if (!dbEntry.gameData.minecart.items) {
            dbEntry.gameData.minecart.items = {};
        }
        if (!dbEntry.gameData.minecart.contributors) {
            dbEntry.gameData.minecart.contributors = {};
        }
        
        // Update items count
        const currentQuantity = dbEntry.gameData.minecart.items[itemId] || 0;
        dbEntry.gameData.minecart.items[itemId] = currentQuantity + quantity;
        
        // Update contributor count
        const currentContribution = dbEntry.gameData.minecart.contributors[playerId] || 0;
        dbEntry.gameData.minecart.contributors[playerId] = currentContribution + quantity;
        
        console.log(`[MINECART] Added ${quantity}x ${itemId} for player ${playerId}. New total: ${dbEntry.gameData.minecart.items[itemId]}`);
        
        // Mark as modified
        if (dbEntry.markModified) {
            dbEntry.markModified('gameData.minecart');
        }
        
        // Save immediately for critical data
        if (dbEntry.save) {
            await dbEntry.save();
        } else {
            // Direct database update if save method not available
            await gachaVC.updateOne(
                { channelId: dbEntry.channelId },
                { 
                    $set: { 
                        'gameData.minecart.items': dbEntry.gameData.minecart.items,
                        'gameData.minecart.contributors': dbEntry.gameData.minecart.contributors
                    }
                }
            );
        }
        
        // Also update cache if available
        if (typeof mapCacheSystem !== 'undefined' && mapCacheSystem.updateMultiple) {
            await mapCacheSystem.updateMultiple(dbEntry.channelId, {
                'minecart.items': dbEntry.gameData.minecart.items,
                'minecart.contributors': dbEntry.gameData.minecart.contributors
            });
            await mapCacheSystem.forceFlush();
        }
        
        return true;
    } catch (error) {
        console.error('[MINECART] Error adding item:', error);
        console.error('[MINECART] Stack:', error.stack);
        return false;
    }
}

// ========================================
// PATCH 5: Emergency Recovery Function
// ========================================
// Add this function to recover from stuck states:

async function emergencyRecovery(channel) {
    const channelId = channel.id;
    console.log(`[EMERGENCY] Starting emergency recovery for ${channelId}`);
    
    try {
        // 1. Force clear all locks and instances
        if (instanceManager) {
            instanceManager.forceKillChannel(channelId);
        }
        if (concurrencyManager) {
            concurrencyManager.forceUnlock(channelId);
            concurrencyManager.clearAllIntervalsForChannel(channelId);
        }
        
        // 2. Clear all caches
        if (mapCacheSystem) {
            mapCacheSystem.clearChannel(channelId);
        }
        if (dbCache) {
            dbCache.delete(channelId);
        }
        if (efficiencyCache) {
            efficiencyCache.clear();
        }
        if (visibilityCalculator) {
            visibilityCalculator.invalidate();
        }
        
        // 3. Get fresh database entry
        const dbEntry = await gachaVC.findOne({ channelId });
        if (!dbEntry) {
            console.error(`[EMERGENCY] No database entry found for ${channelId}`);
            return false;
        }
        
        // 4. Fix critical structures
        if (!dbEntry.gameData) {
            dbEntry.gameData = {};
        }
        
        // Fix minecart
        if (!dbEntry.gameData.minecart) {
            dbEntry.gameData.minecart = { items: {}, contributors: {} };
        }
        if (!dbEntry.gameData.minecart.items) {
            dbEntry.gameData.minecart.items = {};
        }
        if (!dbEntry.gameData.minecart.contributors) {
            dbEntry.gameData.minecart.contributors = {};
        }
        
        // 5. Check and fix break state
        const now = Date.now();
        if (dbEntry.gameData.breakInfo) {
            if (dbEntry.gameData.breakInfo.breakEndTime && now >= dbEntry.gameData.breakInfo.breakEndTime) {
                // Break should have ended
                console.log(`[EMERGENCY] Clearing expired break`);
                delete dbEntry.gameData.breakInfo;
                dbEntry.nextTrigger = new Date(now + 1000);
            }
        }
        
        // 6. Fix player positions
        if (dbEntry.gameData.map) {
            const members = channel.members.filter(m => !m.user.bot);
            if (!dbEntry.gameData.map.playerPositions) {
                dbEntry.gameData.map.playerPositions = {};
            }
            
            for (const member of members.values()) {
                if (!dbEntry.gameData.map.playerPositions[member.id]) {
                    dbEntry.gameData.map.playerPositions[member.id] = {
                        x: dbEntry.gameData.map.entranceX || 0,
                        y: dbEntry.gameData.map.entranceY || 0,
                        hidden: false,
                        disabled: false
                    };
                } else {
                    // Clear stuck/disabled flags
                    const pos = dbEntry.gameData.map.playerPositions[member.id];
                    pos.disabled = false;
                    pos.stuck = false;
                    pos.trapped = false;
                    pos.hidden = false;
                }
            }
        }
        
        // 7. Save all fixes
        dbEntry.markModified('gameData');
        await dbEntry.save();
        
        console.log(`[EMERGENCY] Recovery completed for ${channelId}`);
        
        // 8. Send recovery message
        await channel.send('⚠️ **Mining System Recovery** - The mining system has been reset due to an error. Mining will resume shortly.');
        
        return true;
        
    } catch (error) {
        console.error(`[EMERGENCY] Recovery failed for ${channelId}:`, error);
        return false;
    }
}

// ========================================
// INSTRUCTIONS FOR APPLYING PATCHES:
// ========================================
/*
1. BACKUP your current mining_optimized_v5_performance.js file first!

2. Find and replace the following functions in your main file:
   - getCachedDBEntry (around line 324)
   - isBreakPeriod (around line 656)
   
3. Add the new helper functions:
   - ensurePlayerCanMine
   - emergencyRecovery
   
4. In your miningDatabase.js file, replace the addItemToMinecart function

5. In the main mining module.exports function (around line 1714), add this at the start:
   // Check if emergency recovery is needed
   if (healthMetrics.stuckChannels?.has(channelId)) {
       await emergencyRecovery(channel);
       healthMetrics.stuckChannels.delete(channelId);
   }

6. Test with a small group first to ensure everything works correctly.

7. Monitor the console logs for any [MINECART], [BREAK], or [EMERGENCY] messages.
*/

console.log('[PATCH] Mining bug fixes loaded. Please apply the patches as instructed.');

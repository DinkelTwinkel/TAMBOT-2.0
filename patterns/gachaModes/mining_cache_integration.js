// mining_cache_integration.js - Integration patch for mining_optimized_v5_performance.js
// This file shows the key changes needed to integrate the cache system

// ============ ADD THESE IMPORTS AT THE TOP ============
const mapCacheSystem = require('./mining/cache/mapCacheSystem');

// ============ REPLACE getCachedDBEntry FUNCTION ============
async function getCachedDBEntry(channelId, forceRefresh = false, retryCount = 0) {
    try {
        // Initialize cache if not already done
        if (!mapCacheSystem.isCached(channelId) || forceRefresh) {
            await mapCacheSystem.initialize(channelId, forceRefresh);
        }
        
        // Get cached data (instant, from memory)
        const cached = mapCacheSystem.getCachedData(channelId);
        
        if (!cached) {
            // Fallback to direct DB read if cache fails
            console.error(`[MINING] Cache miss for channel ${channelId}, falling back to DB`);
            const entry = await gachaVC.findOne({ channelId });
            if (entry) {
                // Try to cache it
                await mapCacheSystem.initialize(channelId, true);
            }
            return entry;
        }
        
        // Return cached data formatted like DB entry
        return {
            channelId: channelId,
            gameData: cached,
            nextShopRefresh: cached.nextShopRefresh,
            nextTrigger: cached.nextTrigger,
            // Add save method that updates cache instead of DB
            save: async function() {
                // Update cache with current gameData
                const updates = {};
                for (const [key, value] of Object.entries(this.gameData)) {
                    if (key !== 'lastUpdated' && key !== 'channelId') {
                        updates[key] = value;
                    }
                }
                return mapCacheSystem.updateMultiple(channelId, updates);
            },
            markModified: function() {
                // No-op for cache
            }
        };
        
    } catch (error) {
        console.error(`[MINING] Error fetching cached entry for channel ${channelId}:`, error);
        
        if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return getCachedDBEntry(channelId, forceRefresh, retryCount + 1);
        }
        
        return null;
    }
}

// ============ REPLACE addItemToMinecart FUNCTION ============
async function addItemToMinecart(dbEntry, playerId, itemId, quantity) {
    const channelId = dbEntry.channelId;
    
    // Update cache directly (instant)
    const success = mapCacheSystem.updateMinecart(channelId, playerId, itemId, quantity);
    
    if (!success) {
        console.error(`[MINING] Failed to update minecart for player ${playerId}`);
        return false;
    }
    
    // Update the dbEntry object for consistency within this session
    if (!dbEntry.gameData.minecarts) {
        dbEntry.gameData.minecarts = {};
    }
    if (!dbEntry.gameData.minecarts[playerId]) {
        dbEntry.gameData.minecarts[playerId] = {};
    }
    
    const current = dbEntry.gameData.minecarts[playerId][itemId] || 0;
    dbEntry.gameData.minecarts[playerId][itemId] = current + quantity;
    
    return true;
}

// ============ REPLACE DatabaseTransaction CLASS ============
class DatabaseTransaction {
    constructor() {
        this.channelUpdates = new Map();
        this.pickaxeBreaks = [];
    }
    
    addMinecartItem(channelId, playerId, itemId, quantity) {
        // Use cache system for minecart updates
        mapCacheSystem.updateMinecart(channelId, playerId, itemId, quantity);
    }
    
    setMapUpdate(channelId, mapData) {
        // Store map update in cache immediately
        mapCacheSystem.updateMapData(channelId, mapData);
    }
    
    updatePickaxeDurability(playerId, itemId, newDurability) {
        // This still needs to go to player inventory DB
        // Add to batch for later processing
        if (!this.pickaxeBreaks.find(pb => pb.playerId === playerId && pb.itemId === itemId)) {
            this.pickaxeBreaks.push({
                playerId,
                itemId,
                newDurability,
                type: 'update'
            });
        }
    }
    
    addPickaxeBreak(playerId, playerTag, pickaxe) {
        this.pickaxeBreaks.push({
            playerId,
            playerTag,
            pickaxe,
            type: 'break'
        });
    }
    
    async commit() {
        try {
            // Cache system handles map and minecart updates automatically
            
            // Process pickaxe breaks (still need direct DB for player inventory)
            if (this.pickaxeBreaks.length > 0) {
                await this.processPickaxeBreaks();
            }
            
            return true;
            
        } catch (error) {
            console.error('[TRANSACTION] Commit error:', error);
            throw error;
        }
    }
    
    async processPickaxeBreaks() {
        // Keep your existing pickaxe break logic here
        // This affects player inventory, not map data
        const User = require('../../../models/user');
        
        for (const breakData of this.pickaxeBreaks) {
            try {
                if (breakData.type === 'break') {
                    // Handle pickaxe breaking
                    await User.updateOne(
                        { userId: breakData.playerId },
                        { $unset: { [`equippedItems.${breakData.pickaxe.itemId}`]: 1 } }
                    );
                    console.log(`[MINING] ${breakData.playerTag}'s ${breakData.pickaxe.name} broke!`);
                } else if (breakData.type === 'update') {
                    // Update durability
                    await User.updateOne(
                        { userId: breakData.playerId },
                        { $set: { [`equippedItems.${breakData.itemId}.currentDurability`]: breakData.newDurability } }
                    );
                }
            } catch (error) {
                console.error(`[MINING] Error processing pickaxe break:`, error);
            }
        }
    }
}

// ============ REPLACE batchDB CLASS ============
class OptimizedBatchDB {
    constructor() {
        // No longer need a queue - cache handles everything
    }
    
    queueUpdate(channelId, updates) {
        // Send directly to cache system (instant)
        mapCacheSystem.updateMultiple(channelId, updates);
    }
    
    async flush() {
        // Cache system handles flushing automatically
        // This becomes a no-op
        return true;
    }
    
    async forceFlush() {
        // Force write all pending changes to DB
        await mapCacheSystem.forceFlush();
    }
}

// Replace the global batchDB instance
const batchDB = new OptimizedBatchDB();

// ============ MODIFY startBreak FUNCTION ============
async function startBreak(channel, dbEntry, isLongBreak = false, powerLevel = 1, preSelectedEvent = null) {
    try {
        const channelId = channel.id;
        const now = Date.now();
        const members = channel.members.filter(m => !m.user.bot);
        
        // ... existing instance management code ...
        
        if (isLongBreak) {
            const breakEndTime = now + LONG_BREAK_DURATION;
            const eventEndTime = now + LONG_EVENT_DURATION;
            
            // Use cache for updates (instant)
            mapCacheSystem.updateMultiple(channelId, {
                'breakInfo': {
                    inBreak: true,
                    isLongBreak: true,
                    breakStartTime: now,
                    breakEndTime: breakEndTime,
                    eventEndTime: eventEndTime
                },
                'nextTrigger': new Date(breakEndTime),
                'nextShopRefresh': new Date(breakEndTime)
            });
            
            const mapData = dbEntry.gameData.map;
            const updatedPositions = {};
            for (const member of members.values()) {
                updatedPositions[member.id] = {
                    x: mapData.entranceX,
                    y: mapData.entranceY,
                    hidden: true
                };
            }
            
            // Update map positions in cache
            mapCacheSystem.updateField(channelId, 'map.playerPositions', updatedPositions);
            
            // Get updated data from cache
            const updatedDbEntry = await getCachedDBEntry(channelId, true);
            
            // ... rest of long break logic ...
            
        } else {
            // Similar cache updates for short break
            const breakEndTime = now + SHORT_BREAK_DURATION;
            const mapData = dbEntry.gameData.map;
            const gatherPoint = getRandomFloorTile(mapData);
            const scatteredPositions = scatterPlayersForBreak(
                mapData.playerPositions || {}, 
                gatherPoint.x, 
                gatherPoint.y, 
                members.size,
                mapData
            );
            
            mapCacheSystem.updateMultiple(channelId, {
                'breakInfo': {
                    inBreak: true,
                    isLongBreak: false,
                    breakStartTime: now,
                    breakEndTime: breakEndTime,
                    gatherPoint: gatherPoint
                },
                'map.playerPositions': scatteredPositions,
                'nextTrigger': new Date(breakEndTime),
                'nextShopRefresh': new Date(breakEndTime)
            });
            
            // ... rest of short break logic ...
        }
    } catch (error) {
        console.error(`[MINING] Error starting break for channel ${channel.id}:`, error);
    }
}

// ============ MODIFY endBreak FUNCTION ============
async function endBreak(channel, dbEntry, powerLevel = 1) {
    try {
        const channelId = channel.id;
        
        // ... existing instance management code ...
        
        const mapData = dbEntry.gameData.map;
        const members = channel.members.filter(m => !m.user.bot);
        const breakInfo = dbEntry.gameData.breakInfo;
        
        // ... calculate reset positions ...
        
        const cycleCount = (dbEntry.gameData?.cycleCount || 0) + 1;
        const nextBreakInfo = calculateNextBreakTime({ gameData: { cycleCount } });
        
        // Update cache with break end data
        mapCacheSystem.updateMultiple(channelId, {
            'map.playerPositions': resetPositions,
            'cycleCount': cycleCount,
            'breakJustEnded': Date.now(),
            'nextShopRefresh': nextBreakInfo.nextShopRefresh,
            'nextTrigger': new Date(Date.now() + 1000)
        });
        
        // Delete break info from cache
        mapCacheSystem.deleteField(channelId, 'breakInfo');
        
        // Clear any local caches
        dbCache.delete(channelId);
        efficiencyCache.delete(channelId);
        
        // ... rest of end break logic ...
        
    } catch (error) {
        console.error(`[MINING] Error ending break for channel ${channel.id}:`, error);
    }
}

// ============ MAIN MODULE EXPORT - OPTIMIZED VERSION ============
module.exports = async (channel, dbEntry, json, client) => {
    const channelId = channel.id;
    const processingStartTime = Date.now();
    
    // Initialize cache for this channel if not already done
    if (!mapCacheSystem.isCached(channelId)) {
        console.log(`[MINING] Initializing cache for new channel ${channelId}`);
        await mapCacheSystem.initialize(channelId);
    }
    
    // Multi-level instance checking
    if (instanceManager.hasActiveInstance(channelId)) {
        const instance = instanceManager.getInstanceInfo(channelId);
        if (!instance || instance.pid !== process.pid) {
            console.log(`[MINING] Channel ${channelId} is owned by another process, skipping...`);
            return;
        }
    }
    
    if (concurrencyManager.isProcessing(channelId)) {
        console.log(`[MINING] Channel ${channelId} is already being processed locally, skipping...`);
        return;
    }
    
    const lockAcquired = await concurrencyManager.acquireLock(channelId, 3000);
    if (!lockAcquired) {
        console.log(`[MINING] Could not acquire lock for channel ${channelId}, skipping...`);
        return;
    }
    
    try {
        const now = Date.now();
        
        // Get cached entry (instant, from memory)
        const cachedEntry = await getCachedDBEntry(channelId);
        if (!cachedEntry) {
            console.error(`[MINING] Failed to get cached entry for ${channelId}`);
            return;
        }
        
        // Use cachedEntry instead of dbEntry from now on
        dbEntry = cachedEntry;
        
        // Check if we just ended a break
        if (dbEntry.gameData?.breakJustEnded) {
            const timeSinceBreakEnd = now - dbEntry.gameData.breakJustEnded;
            if (timeSinceBreakEnd < 5000) {
                console.log(`[MINING] Channel ${channelId} just ended break ${timeSinceBreakEnd}ms ago, waiting...`);
                return;
            }
            
            // Clear the flag using cache
            mapCacheSystem.deleteField(channelId, 'breakJustEnded');
        }
        
        // ... rest of your existing mining logic ...
        // BUT replace all database operations with cache operations:
        
        // Example replacements:
        
        // OLD: await gachaVC.updateOne({ channelId }, { $set: { 'gameData.map': mapData } });
        // NEW: mapCacheSystem.updateMapData(channelId, mapData);
        
        // OLD: batchDB.queueUpdate(channel.id, { 'gameData.stats.wallsBroken': newValue });
        // NEW: mapCacheSystem.updateField(channelId, 'stats.wallsBroken', newValue);
        
        // OLD: await dbEntry.save();
        // NEW: // No need - cache auto-saves
        
        // Process mining actions...
        // Your existing mining logic here, but using cache...
        
        // If map changed, update cache
        if (mapChanged) {
            mapCacheSystem.updateMapData(channelId, mapData);
            console.log(`[MINING] Map updated in cache for ${channelId}`);
        }
        
        // Update stats if needed
        if (wallsBroken > 0 || treasuresFound > 0) {
            mapCacheSystem.updateMultiple(channelId, {
                'stats.wallsBroken': (dbEntry.gameData.stats?.wallsBroken || 0) + wallsBroken,
                'stats.treasuresFound': (dbEntry.gameData.stats?.treasuresFound || 0) + treasuresFound
            });
        }
        
        const processingTime = Date.now() - processingStartTime;
        console.log(`[MINING] Processed ${channelId} in ${processingTime}ms (cached)`);
        
    } catch (error) {
        console.error(`[MINING] Error processing channel ${channelId}:`, error);
    } finally {
        concurrencyManager.releaseLock(channelId);
    }
};

// ============ ADD CACHE MANAGEMENT EXPORTS ============
module.exports.cacheCommands = {
    // Force save all cached data to DB
    forceSave: async () => {
        console.log('[CACHE] Forcing save of all cached data...');
        await mapCacheSystem.forceFlush();
        console.log('[CACHE] Force save completed');
    },
    
    // Get cache statistics
    getStats: () => {
        const stats = mapCacheSystem.getStats();
        console.log('[CACHE] Statistics:', stats);
        return stats;
    },
    
    // Clear cache for a specific channel
    clearChannel: (channelId) => {
        mapCacheSystem.clearChannel(channelId);
        console.log(`[CACHE] Cleared cache for channel ${channelId}`);
    },
    
    // Preload all channels
    preloadAll: async () => {
        const count = await mapCacheSystem.preloadAll();
        console.log(`[CACHE] Preloaded ${count} channels`);
        return count;
    }
};

// Export cache system for external use
module.exports.mapCacheSystem = mapCacheSystem;

// ============ ADD GRACEFUL SHUTDOWN ============
process.on('SIGINT', async () => {
    console.log('[MINING] Gracefully shutting down, saving cache...');
    await mapCacheSystem.forceFlush();
    console.log('[MINING] Cache saved, exiting...');
    process.exit(0);
});
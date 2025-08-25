// COMPLETE INTEGRATION GUIDE FOR mining_optimized_v5_performance.js
// Apply these changes to your existing file

// ========================================================================
// STEP 1: ADD THIS IMPORT AT THE TOP (around line 4, after existing requires)
// ========================================================================
const mapCacheSystem = require('./mining/cache/mapCacheSystem');


// ========================================================================
// STEP 2: REPLACE THE ENTIRE getCachedDBEntry FUNCTION (around line 270)
// ========================================================================
// DELETE the old getCachedDBEntry function and REPLACE with:

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
            save: async function() {
                const updates = {};
                for (const [key, value] of Object.entries(this.gameData)) {
                    if (key !== 'lastUpdated' && key !== 'channelId') {
                        updates[key] = value;
                    }
                }
                return mapCacheSystem.updateMultiple(channelId, updates);
            },
            markModified: function() {}
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


// ========================================================================
// STEP 3: FIND AND REPLACE ALL batchDB.queueUpdate CALLS
// ========================================================================
// Search for: batchDB.queueUpdate(
// Replace with: mapCacheSystem.updateMultiple(

// Example:
// OLD: batchDB.queueUpdate(channel.id, { 'gameData.breakInfo': breakInfo });
// NEW: mapCacheSystem.updateMultiple(channel.id, { 'breakInfo': breakInfo });


// ========================================================================
// STEP 4: FIND AND REPLACE ALL gachaVC.updateOne CALLS IN THE MAIN FLOW
// ========================================================================
// Search for: await gachaVC.updateOne(
// Replace with cache operations

// Examples:
// OLD: await gachaVC.updateOne({ channelId }, { $set: { 'gameData.map': mapData } });
// NEW: mapCacheSystem.updateMapData(channelId, mapData);

// OLD: await gachaVC.updateOne({ channelId }, { $set: { 'gameData.hazardRollDone': true } });
// NEW: mapCacheSystem.updateField(channelId, 'hazardRollDone', true);

// OLD: await gachaVC.updateOne({ channelId }, { $unset: { 'gameData.breakInfo': 1 } });
// NEW: mapCacheSystem.deleteField(channelId, 'breakInfo');


// ========================================================================
// STEP 5: MODIFY THE addItemToMinecart FUNCTION (find it in miningDatabase.js)
// ========================================================================
// If it's imported, create a local override:

async function addItemToMinecart(dbEntry, playerId, itemId, quantity) {
    const channelId = dbEntry.channelId;
    
    // Update cache directly (instant)
    const success = mapCacheSystem.updateMinecart(channelId, playerId, itemId, quantity);
    
    if (!success) {
        console.error(`[MINING] Failed to update minecart for player ${playerId}`);
        return false;
    }
    
    // Update the dbEntry object for consistency
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


// ========================================================================
// STEP 6: IN THE MAIN MODULE.EXPORTS FUNCTION (around line 1500)
// ========================================================================
// Add cache initialization at the beginning:

module.exports = async (channel, dbEntry, json, client) => {
    const channelId = channel.id;
    const processingStartTime = Date.now();
    
    // ADD THIS: Initialize cache for this channel if not already done
    if (!mapCacheSystem.isCached(channelId)) {
        console.log(`[MINING] Initializing cache for new channel ${channelId}`);
        await mapCacheSystem.initialize(channelId);
    }
    
    // ... existing instance checking code ...
    
    // CHANGE THIS LINE:
    // OLD: (uses the dbEntry parameter)
    // NEW: Get cached entry
    const cachedEntry = await getCachedDBEntry(channelId);
    if (!cachedEntry) {
        console.error(`[MINING] Failed to get cached entry for ${channelId}`);
        return;
    }
    dbEntry = cachedEntry; // Use cached entry as dbEntry
    
    // ... rest of function continues as normal ...
}


// ========================================================================
// STEP 7: REPLACE THE batchDB CLASS (around line 250 if it exists locally)
// ========================================================================
// If batchDB is defined in this file, replace it with:

const batchDB = {
    queueUpdate(channelId, updates) {
        mapCacheSystem.updateMultiple(channelId, updates);
    },
    async flush() {
        return true; // Cache handles this automatically
    },
    async forceFlush() {
        await mapCacheSystem.forceFlush();
    }
};


// ========================================================================
// STEP 8: UPDATE DatabaseTransaction CLASS IF IT EXISTS LOCALLY
// ========================================================================
// Find the commit() method and simplify it:

class DatabaseTransaction {
    constructor() {
        this.pickaxeBreaks = [];
    }
    
    setMapUpdate(channelId, mapData) {
        mapCacheSystem.updateMapData(channelId, mapData);
    }
    
    async commit() {
        // Only process pickaxe breaks - everything else is handled by cache
        if (this.pickaxeBreaks.length > 0) {
            await this.processPickaxeBreaks();
        }
        return true;
    }
    
    // Keep existing processPickaxeBreaks method
}


// ========================================================================
// STEP 9: ADD EXPORTS AT THE BOTTOM OF THE FILE
// ========================================================================
// Add these after your module.exports:

module.exports.cacheCommands = {
    forceSave: async () => {
        await mapCacheSystem.forceFlush();
        console.log('[CACHE] Force save completed');
    },
    getStats: () => mapCacheSystem.getStats(),
    clearChannel: (channelId) => mapCacheSystem.clearChannel(channelId),
    preloadAll: async () => await mapCacheSystem.preloadAll()
};

module.exports.mapCacheSystem = mapCacheSystem;


// ========================================================================
// STEP 10: ADD GRACEFUL SHUTDOWN (at the very bottom)
// ========================================================================
process.on('SIGINT', async () => {
    console.log('[MINING] Saving cache before shutdown...');
    await mapCacheSystem.forceFlush();
    process.exit(0);
});


// ========================================================================
// SPECIFIC LINE-BY-LINE REPLACEMENTS
// ========================================================================

// Line ~1627: In performInitialHazardRoll function
// OLD: await gachaVC.updateOne({ channelId: channel.id }, { $set: { 'gameData.hazardRollDone': true, 'gameData.dangerLevel': dangerLevel, 'gameData.hazardSeed': hazardSeed } });
// NEW: mapCacheSystem.updateMultiple(channel.id, { 'hazardRollDone': true, 'dangerLevel': dangerLevel, 'hazardSeed': hazardSeed });

// Line ~1900: In startBreak function
// OLD: batchDB.queueUpdate(channel.id, { 'gameData.breakInfo': {...} });
// NEW: mapCacheSystem.updateField(channel.id, 'breakInfo', {...});

// Line ~2000: In endBreak function  
// OLD: await gachaVC.updateOne({ channelId: channel.id }, { $unset: { 'gameData.breakInfo': 1 } });
// NEW: mapCacheSystem.deleteField(channel.id, 'breakInfo');

// Line ~2100: When updating map
// OLD: transaction.setMapUpdate(channel.id, mapData);
// NEW: mapCacheSystem.updateMapData(channel.id, mapData);

// Line ~2200: When updating stats
// OLD: batchDB.queueUpdate(channel.id, { 'gameData.stats.wallsBroken': value });
// NEW: mapCacheSystem.updateField(channel.id, 'stats.wallsBroken', value);
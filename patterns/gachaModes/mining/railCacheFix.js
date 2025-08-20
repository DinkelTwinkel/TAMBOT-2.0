// railCacheFix.js - Fixes for rail data persistence issues
// This module provides patches to ensure rail data persists through mining updates

/**
 * Clear the mining system cache for a specific channel
 */
function clearMiningCache(channelId) {
    // Clear the dbCache used in mining_optimized_v5_performance.js
    if (global.dbCache && global.dbCache instanceof Map) {
        global.dbCache.delete(channelId);
    }
    
    // Clear efficiency cache
    if (global.efficiencyCache && global.efficiencyCache instanceof Map) {
        global.efficiencyCache.clear();
    }
    
    // Clear visibility calculator cache if available
    if (global.visibilityCalculator) {
        global.visibilityCalculator.invalidate();
    }
    
    console.log(`[RAILS] Cleared mining cache for channel ${channelId}`);
}

/**
 * Preserve rail data when updating map
 * This function should be used when the mining system updates the map
 */
function preserveRailData(oldMapData, newMapData) {
    if (!oldMapData || !newMapData || !oldMapData.tiles || !newMapData.tiles) {
        return newMapData;
    }
    
    // Preserve rail data from old map to new map
    for (let y = 0; y < oldMapData.tiles.length && y < newMapData.tiles.length; y++) {
        for (let x = 0; x < oldMapData.tiles[y].length && x < newMapData.tiles[y].length; x++) {
            if (oldMapData.tiles[y][x]?.hasRail) {
                if (newMapData.tiles[y] && newMapData.tiles[y][x]) {
                    newMapData.tiles[y][x].hasRail = true;
                }
            }
        }
    }
    
    return newMapData;
}

/**
 * Atomic update for rail data that bypasses caching
 * Use this instead of activeVC.save() for critical rail updates
 */
async function atomicRailUpdate(channelId, mapData) {
    const gachaVC = require('../../../models/activevcs');
    
    // Use MongoDB's atomic update to ensure data isn't lost
    const result = await gachaVC.findOneAndUpdate(
        { channelId: channelId },
        { $set: { 'gameData.map': mapData } },
        { 
            new: true, // Return the updated document
            runValidators: false, // Skip validation for speed
            upsert: false // Don't create if doesn't exist
        }
    );
    
    // Clear all caches after update
    clearMiningCache(channelId);
    
    console.log(`[RAILS] Atomic update completed for channel ${channelId}`);
    
    return result;
}

module.exports = {
    clearMiningCache,
    preserveRailData,
    atomicRailUpdate
};
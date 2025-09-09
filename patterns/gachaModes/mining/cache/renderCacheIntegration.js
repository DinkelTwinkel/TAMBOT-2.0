// renderCacheIntegration.js - Ensures mining render system uses same cache as main system
// This prevents desynchronization between what players see and what the system processes

const path = require('path');

/**
 * Initialize render cache integration
 * This ensures all render functions use the same cache as the main mining system
 */
function initializeRenderCacheIntegration() {
    console.log('[RENDER_CACHE] Initializing render cache integration...');
    
    // Check if map cache system is available
    let mapCacheSystem = null;
    try {
        mapCacheSystem = require('./mapCacheSystem');
        console.log('[RENDER_CACHE] Map cache system found and loaded');
    } catch (error) {
        console.warn('[RENDER_CACHE] Map cache system not available:', error.message);
        return false;
    }
    
    // Validate cache system has required methods
    const requiredMethods = ['getCachedData', 'initialize', 'isCached'];
    const missingMethods = requiredMethods.filter(method => 
        typeof mapCacheSystem[method] !== 'function'
    );
    
    if (missingMethods.length > 0) {
        console.error('[RENDER_CACHE] Map cache system missing methods:', missingMethods);
        return false;
    }
    
    console.log('[RENDER_CACHE] Cache integration initialized successfully');
    return true;
}

/**
 * Get cached database entry for render system
 * This is the same function that should be used in all render files
 */
async function getCachedDBEntryForRender(channelId) {
    let mapCacheSystem = null;
    
    try {
        mapCacheSystem = require('./mapCacheSystem');
    } catch (error) {
        // Cache system not available, fall back to direct DB access
        console.warn(`[RENDER_CACHE] Cache system not available for channel ${channelId}, using direct DB`);
        const gachaVC = require('../../../../models/activevcs');
        return await gachaVC.findOne({ channelId });
    }
    
    try {
        // Check if channel is cached
        if (!mapCacheSystem.isCached(channelId)) {
            console.log(`[RENDER_CACHE] Channel ${channelId} not cached, initializing...`);
            await mapCacheSystem.initialize(channelId);
        }
        
        // Get cached data
        const cached = mapCacheSystem.getCachedData(channelId);
        
        if (cached) {
            console.log(`[RENDER_CACHE] Using cached data for channel ${channelId}`);
            // Return cached data formatted like DB entry
            return {
                channelId: channelId,
                gameData: cached,
                nextShopRefresh: cached.nextShopRefresh,
                nextTrigger: cached.nextTrigger,
                typeId: cached.typeId || null,
                // Add lean() method for compatibility
                lean: function() { return this; }
            };
        }
        
        // Cache miss - fall back to direct DB access
        console.warn(`[RENDER_CACHE] Cache miss for channel ${channelId}, using direct DB access`);
        const gachaVC = require('../../../../models/activevcs');
        const dbEntry = await gachaVC.findOne({ channelId });
        
        // Try to populate cache for next time
        if (dbEntry) {
            try {
                await mapCacheSystem.initialize(channelId, true);
            } catch (cacheError) {
                console.warn(`[RENDER_CACHE] Failed to populate cache for ${channelId}:`, cacheError);
            }
        }
        
        return dbEntry;
        
    } catch (error) {
        console.error(`[RENDER_CACHE] Error getting cached data for channel ${channelId}:`, error);
        
        // Last resort - direct DB access
        const gachaVC = require('../../../../models/activevcs');
        return await gachaVC.findOne({ channelId });
    }
}

/**
 * Validate that render system and main mining system are using same data
 * This can be called periodically to ensure synchronization
 */
async function validateRenderSynchronization(channelId) {
    try {
        // Get data from render cache
        const renderData = await getCachedDBEntryForRender(channelId);
        
        // Get data from main mining system cache
        let miningData = null;
        try {
            const mapCacheSystem = require('./mapCacheSystem');
            if (mapCacheSystem.isCached(channelId)) {
                const cached = mapCacheSystem.getCachedData(channelId);
                if (cached) {
                    miningData = {
                        gameData: cached,
                        channelId: channelId
                    };
                }
            }
        } catch (error) {
            console.warn('[RENDER_CACHE] Could not get mining cache data for validation');
        }
        
        if (!renderData || !miningData) {
            return {
                synchronized: false,
                reason: 'Missing data from one or both systems',
                renderData: !!renderData,
                miningData: !!miningData
            };
        }
        
        // Compare key data points
        const renderMap = renderData.gameData?.map;
        const miningMap = miningData.gameData?.map;
        
        if (!renderMap || !miningMap) {
            return {
                synchronized: false,
                reason: 'Missing map data',
                renderMap: !!renderMap,
                miningMap: !!miningMap
            };
        }
        
        // Check map dimensions
        if (renderMap.width !== miningMap.width || renderMap.height !== miningMap.height) {
            return {
                synchronized: false,
                reason: 'Map dimensions mismatch',
                renderDimensions: `${renderMap.width}x${renderMap.height}`,
                miningDimensions: `${miningMap.width}x${miningMap.height}`
            };
        }
        
        // Check player position count
        const renderPlayerCount = Object.keys(renderMap.playerPositions || {}).length;
        const miningPlayerCount = Object.keys(miningMap.playerPositions || {}).length;
        
        if (renderPlayerCount !== miningPlayerCount) {
            return {
                synchronized: false,
                reason: 'Player position count mismatch',
                renderPlayerCount,
                miningPlayerCount
            };
        }
        
        return {
            synchronized: true,
            reason: 'Data synchronized',
            mapDimensions: `${renderMap.width}x${renderMap.height}`,
            playerCount: renderPlayerCount
        };
        
    } catch (error) {
        return {
            synchronized: false,
            reason: 'Error during validation',
            error: error.message
        };
    }
}

/**
 * Force refresh of render cache to match main mining system
 */
async function refreshRenderCache(channelId) {
    try {
        const mapCacheSystem = require('./mapCacheSystem');
        
        // Force reload cache from database
        await mapCacheSystem.initialize(channelId, true);
        
        console.log(`[RENDER_CACHE] Refreshed cache for channel ${channelId}`);
        return true;
        
    } catch (error) {
        console.error(`[RENDER_CACHE] Error refreshing cache for channel ${channelId}:`, error);
        return false;
    }
}

module.exports = {
    initializeRenderCacheIntegration,
    getCachedDBEntryForRender,
    validateRenderSynchronization,
    refreshRenderCache
};

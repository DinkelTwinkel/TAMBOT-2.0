// map_expansion_handler.js
// Handles exit tile position updates when map expands or changes

const deeperMineChecker = require('../../mining/deeperMineChecker');

/**
 * Call this function whenever the map expands or changes size
 * @param {Object} channel - Discord channel
 * @param {Object} dbEntry - Database entry
 * @param {Object} oldMapData - Previous map state
 * @param {Object} newMapData - New map state after expansion
 */
async function handleMapExpansion(channel, dbEntry, oldMapData, newMapData) {
    console.log('[MAP EXPANSION] Handling map size change');
    
    // Store old boundaries
    const oldBounds = {
        width: oldMapData.width,
        height: oldMapData.height,
        entranceX: oldMapData.entranceX,
        entranceY: oldMapData.entranceY
    };
    
    // Store new boundaries
    const newBounds = {
        width: newMapData.width,
        height: newMapData.height,
        entranceX: newMapData.entranceX,
        entranceY: newMapData.entranceY
    };
    
    // Update exit tile position if it exists
    await deeperMineChecker.updateExitTileAfterExpansion(dbEntry, oldBounds, newBounds);
    
    // Get updated exit tile data
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    
    if (exitTile && exitTile.active) {
        console.log(`[MAP EXPANSION] Exit tile updated to (${exitTile.x}, ${exitTile.y})`);
        
        // Verify the tile at new position is valid (not a wall)
        if (newMapData.tiles[exitTile.y] && newMapData.tiles[exitTile.y][exitTile.x]) {
            const tileAtPosition = newMapData.tiles[exitTile.y][exitTile.x];
            
            // If the new position is a wall, convert it to floor
            if (tileAtPosition.type === 'WALL') {
                tileAtPosition.type = 'FLOOR';
                tileAtPosition.discovered = true;
                console.log('[MAP EXPANSION] Converted wall to floor at exit tile position');
            }
        }
    }
    
    return newMapData;
}

/**
 * Check exit tile position on every map update
 * @param {Object} mapData - Current map data
 * @param {Object} dbEntry - Database entry
 * @returns {Object} - Map data with exit tile properly positioned
 */
function validateExitTilePosition(mapData, dbEntry) {
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    
    if (!exitTile || !exitTile.active) {
        return mapData;
    }
    
    // Ensure exit tile position is valid
    if (exitTile.x < 0 || exitTile.x >= mapData.width ||
        exitTile.y < 0 || exitTile.y >= mapData.height) {
        console.warn('[EXIT TILE] Position out of bounds, recalculating...');
        
        // Recalculate from relative position
        const entranceX = mapData.entranceX || 0;
        const entranceY = mapData.entranceY || 0;
        
        exitTile.x = Math.max(0, Math.min(entranceX + exitTile.relativeX, mapData.width - 1));
        exitTile.y = Math.max(0, Math.min(entranceY + exitTile.relativeY, mapData.height - 1));
    }
    
    return mapData;
}

/**
 * Integration example for your map expansion code
 */
async function exampleMapExpansionIntegration(channel, dbEntry) {
    // Your existing map expansion logic
    const oldMap = dbEntry.gameData.map;
    
    // Expand map (example: increase size by 10 in each direction)
    const newMap = {
        width: oldMap.width + 20,
        height: oldMap.height + 20,
        entranceX: oldMap.entranceX + 10, // Entrance moves with expansion
        entranceY: oldMap.entranceY + 10,
        tiles: [] // ... expanded tile array
    };
    
    // Handle exit tile repositioning
    await handleMapExpansion(channel, dbEntry, oldMap, newMap);
    
    // Save the updated map
    dbEntry.gameData.map = newMap;
    await dbEntry.save();
    
    return newMap;
}

/**
 * Add this to your regular map rendering to ensure exit tile is shown
 */
function renderExitTileOnMap(mapData, dbEntry) {
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    
    if (!exitTile || !exitTile.active) {
        return mapData;
    }
    
    // Validate position first
    mapData = validateExitTilePosition(mapData, dbEntry);
    
    // Add visual marker at exit tile position
    if (mapData.tiles[exitTile.y] && mapData.tiles[exitTile.y][exitTile.x]) {
        // Store original tile type
        const originalType = mapData.tiles[exitTile.y][exitTile.x].type;
        
        // Override with exit tile visual
        mapData.tiles[exitTile.y][exitTile.x] = {
            ...mapData.tiles[exitTile.y][exitTile.x],
            type: 'EXIT_TILE',
            originalType: originalType,
            symbol: '🚪',
            color: '#FFD700',
            glow: true,
            discovered: true
        };
    }
    
    return mapData;
}

module.exports = {
    handleMapExpansion,
    validateExitTilePosition,
    renderExitTileOnMap,
    exampleMapExpansionIntegration
};
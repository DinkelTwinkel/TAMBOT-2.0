// entranceCoordinateFix.js - Fix for entrance coordinate inconsistency
// Ensures all systems use the same entrance coordinates by scanning for the actual entrance tile

const { TILE_TYPES } = require('./miningConstants_unified');

/**
 * Find the actual entrance tile coordinates by scanning the tile array
 * This is the authoritative method that matches what the renderer uses
 * @param {Object} mapData - The map data object
 * @returns {Object} - {x, y} coordinates of the actual entrance tile, or null if not found
 */
function findActualEntranceCoordinates(mapData) {
    if (!mapData || !mapData.tiles) {
        console.log('[ENTRANCE FIX] No map data or tiles available');
        return null;
    }

    // Scan the entire tile array to find the entrance tile
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            const tile = mapData.tiles[y] && mapData.tiles[y][x];
            if (tile && tile.type === TILE_TYPES.ENTRANCE) {
                console.log(`[ENTRANCE FIX] Found actual entrance at (${x}, ${y})`);
                return { x, y };
            }
        }
    }

    console.log('[ENTRANCE FIX] No entrance tile found in map');
    return null;
}

/**
 * Verify and fix entrance coordinates in map data
 * Updates mapData.entranceX and mapData.entranceY to match the actual entrance tile position
 * @param {Object} mapData - The map data object to fix
 * @returns {boolean} - True if coordinates were updated, false if they were already correct
 */
function verifyAndFixEntranceCoordinates(mapData) {
    const actualEntrance = findActualEntranceCoordinates(mapData);
    
    if (!actualEntrance) {
        console.log('[ENTRANCE FIX] Cannot fix coordinates - no entrance tile found');
        return false;
    }

    const currentEntranceX = mapData.entranceX;
    const currentEntranceY = mapData.entranceY;

    // Check if coordinates are already correct
    if (currentEntranceX === actualEntrance.x && currentEntranceY === actualEntrance.y) {
        console.log(`[ENTRANCE FIX] Entrance coordinates are already correct: (${currentEntranceX}, ${currentEntranceY})`);
        return false;
    }

    // Fix the coordinates
    console.log(`[ENTRANCE FIX] Fixing entrance coordinates: (${currentEntranceX}, ${currentEntranceY}) -> (${actualEntrance.x}, ${actualEntrance.y})`);
    mapData.entranceX = actualEntrance.x;
    mapData.entranceY = actualEntrance.y;

    return true;
}

/**
 * Get reliable entrance coordinates (always scans for actual entrance tile)
 * Use this function instead of directly accessing mapData.entranceX/entranceY
 * @param {Object} mapData - The map data object
 * @returns {Object} - {x, y} coordinates of the entrance, or null if not found
 */
function getReliableEntranceCoordinates(mapData) {
    return findActualEntranceCoordinates(mapData);
}

/**
 * Update player positions after entrance coordinate fix
 * Adjusts all player positions that were relative to the old entrance position
 * @param {Object} mapData - The map data object
 * @param {number} oldEntranceX - Previous entrance X coordinate
 * @param {number} oldEntranceY - Previous entrance Y coordinate
 */
function updatePlayerPositionsAfterEntranceFix(mapData, oldEntranceX, oldEntranceY) {
    if (!mapData.playerPositions) return;

    const newEntranceX = mapData.entranceX;
    const newEntranceY = mapData.entranceY;
    
    const deltaX = newEntranceX - oldEntranceX;
    const deltaY = newEntranceY - oldEntranceY;

    if (deltaX === 0 && deltaY === 0) return;

    console.log(`[ENTRANCE FIX] Updating player positions by (${deltaX}, ${deltaY})`);

    for (const [playerId, position] of Object.entries(mapData.playerPositions)) {
        // Only update players who are at the old entrance position (spawn point)
        if (position.x === oldEntranceX && position.y === oldEntranceY) {
            position.x = newEntranceX;
            position.y = newEntranceY;
            console.log(`[ENTRANCE FIX] Updated player ${playerId} position to entrance`);
        }
    }
}

/**
 * Comprehensive entrance coordinate fix for a database entry
 * Call this before any operation that relies on entrance coordinates
 * @param {Object} dbEntry - Database entry containing gameData.map
 * @returns {boolean} - True if any fixes were applied
 */
async function fixEntranceCoordinates(dbEntry) {
    if (!dbEntry || !dbEntry.gameData || !dbEntry.gameData.map) {
        console.log('[ENTRANCE FIX] No map data in database entry');
        return false;
    }

    const mapData = dbEntry.gameData.map;
    const oldEntranceX = mapData.entranceX;
    const oldEntranceY = mapData.entranceY;

    const wasFixed = verifyAndFixEntranceCoordinates(mapData);

    if (wasFixed) {
        // Update player positions if entrance moved
        updatePlayerPositionsAfterEntranceFix(mapData, oldEntranceX, oldEntranceY);
        
        // Save the updated coordinates to database
        try {
            await dbEntry.save();
            console.log('[ENTRANCE FIX] Updated entrance coordinates saved to database');
        } catch (error) {
            console.error('[ENTRANCE FIX] Error saving updated coordinates:', error);
        }
    }

    return wasFixed;
}

module.exports = {
    findActualEntranceCoordinates,
    verifyAndFixEntranceCoordinates,
    getReliableEntranceCoordinates,
    updatePlayerPositionsAfterEntranceFix,
    fixEntranceCoordinates
};

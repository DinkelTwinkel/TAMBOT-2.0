// patterns/gachaModes/mining/coordinateManager.js
// Manages coordinate system changes when map expands

const gachaVC = require('../../../models/activevcs');
const railStorage = require('./railStorage');

/**
 * Track map dimensions and detect expansions
 * @param {Object} oldMap - Previous map data
 * @param {Object} newMap - New map data after expansion
 * @returns {Object} Expansion info with coordinate shifts
 */
function detectMapExpansion(oldMap, newMap) {
    if (!oldMap || !newMap) {
        return { expanded: false };
    }
    
    const expansion = {
        expanded: false,
        shiftX: 0,
        shiftY: 0,
        oldWidth: oldMap.width,
        oldHeight: oldMap.height,
        newWidth: newMap.width,
        newHeight: newMap.height
    };
    
    // Check if map expanded
    if (newMap.width !== oldMap.width || newMap.height !== oldMap.height) {
        expansion.expanded = true;
        
        // Calculate shifts based on entrance position changes
        // The entrance position is a good reference point
        if (oldMap.entranceX !== undefined && newMap.entranceX !== undefined) {
            expansion.shiftX = newMap.entranceX - oldMap.entranceX;
            expansion.shiftY = newMap.entranceY - oldMap.entranceY;
        }
    }
    
    return expansion;
}

/**
 * Update rail positions after map expansion
 * @param {string} channelId - Channel ID
 * @param {number} shiftX - X coordinate shift
 * @param {number} shiftY - Y coordinate shift
 */
async function updateRailCoordinates(channelId, shiftX, shiftY) {
    if (shiftX === 0 && shiftY === 0) return;
    
    console.log(`[COORDINATE MANAGER] Updating rail coordinates with shift (${shiftX}, ${shiftY})`);
    
    const railsData = await railStorage.getRailsData(channelId);
    if (!railsData || !railsData.positions) return;
    
    const updatedPositions = {};
    
    for (const [key, rail] of Object.entries(railsData.positions)) {
        const newX = rail.x + shiftX;
        const newY = rail.y + shiftY;
        const newKey = `${newX},${newY}`;
        
        updatedPositions[newKey] = {
            ...rail,
            x: newX,
            y: newY
        };
    }
    
    // Update all positions at once
    await gachaVC.updateOne(
        { channelId },
        { 
            $set: { 
                'gameData.rails.positions': updatedPositions
            } 
        }
    );
    
    console.log(`[COORDINATE MANAGER] Updated ${Object.keys(updatedPositions).length} rail positions`);
}

/**
 * Update hazard positions after map expansion
 * @param {string} channelId - Channel ID
 * @param {number} shiftX - X coordinate shift
 * @param {number} shiftY - Y coordinate shift
 */
async function updateHazardCoordinates(channelId, shiftX, shiftY) {
    if (shiftX === 0 && shiftY === 0) return;
    
    console.log(`[COORDINATE MANAGER] Updating hazard coordinates with shift (${shiftX}, ${shiftY})`);
    
    const entry = await gachaVC.findOne({ channelId });
    if (!entry || !entry.gameData || !entry.gameData.hazards) return;
    
    const hazards = entry.gameData.hazards;
    const updatedHazards = [];
    const updatedRevealed = [];
    
    // Update hazard positions in the array
    if (hazards.hazards && Array.isArray(hazards.hazards)) {
        for (const hazard of hazards.hazards) {
            updatedHazards.push({
                ...hazard,
                x: hazard.x + shiftX,
                y: hazard.y + shiftY
            });
        }
    }
    
    // Update revealed positions
    if (hazards.revealed && Array.isArray(hazards.revealed)) {
        for (const key of hazards.revealed) {
            const [x, y] = key.split(',').map(Number);
            const newKey = `${x + shiftX},${y + shiftY}`;
            updatedRevealed.push(newKey);
        }
    }
    
    // Update all positions at once
    await gachaVC.updateOne(
        { channelId },
        { 
            $set: { 
                'gameData.hazards.hazards': updatedHazards,
                'gameData.hazards.revealed': updatedRevealed
            } 
        }
    );
    
    console.log(`[COORDINATE MANAGER] Updated ${updatedHazards.length} hazard positions`);
}

/**
 * Handle map expansion and update all coordinate-based storage
 * @param {string} channelId - Channel ID
 * @param {Object} oldMap - Previous map state
 * @param {Object} newMap - New map state
 */
async function handleMapExpansion(channelId, oldMap, newMap) {
    const expansion = detectMapExpansion(oldMap, newMap);
    
    if (!expansion.expanded) {
        return { updated: false };
    }
    
    console.log(`[COORDINATE MANAGER] Map expanded from ${expansion.oldWidth}x${expansion.oldHeight} to ${expansion.newWidth}x${expansion.newHeight}`);
    console.log(`[COORDINATE MANAGER] Coordinate shift: (${expansion.shiftX}, ${expansion.shiftY})`);
    
    // Update all coordinate-based systems
    await Promise.all([
        updateRailCoordinates(channelId, expansion.shiftX, expansion.shiftY),
        updateHazardCoordinates(channelId, expansion.shiftX, expansion.shiftY)
    ]);
    
    return {
        updated: true,
        shiftX: expansion.shiftX,
        shiftY: expansion.shiftY,
        oldSize: `${expansion.oldWidth}x${expansion.oldHeight}`,
        newSize: `${expansion.newWidth}x${expansion.newHeight}`
    };
}

/**
 * Store map dimensions for tracking expansions
 * @param {string} channelId - Channel ID
 * @param {Object} mapData - Current map data
 */
async function storeMapDimensions(channelId, mapData) {
    await gachaVC.updateOne(
        { channelId },
        { 
            $set: { 
                'gameData.mapDimensions': {
                    width: mapData.width,
                    height: mapData.height,
                    entranceX: mapData.entranceX,
                    entranceY: mapData.entranceY,
                    lastUpdated: Date.now()
                }
            } 
        }
    );
}

/**
 * Get stored map dimensions
 * @param {string} channelId - Channel ID
 * @returns {Object} Stored dimensions or null
 */
async function getStoredMapDimensions(channelId) {
    const entry = await gachaVC.findOne({ channelId });
    if (!entry || !entry.gameData) return null;
    return entry.gameData.mapDimensions || null;
}

/**
 * Check and handle map changes
 * @param {string} channelId - Channel ID
 * @param {Object} currentMap - Current map data
 */
async function checkAndHandleMapChanges(channelId, currentMap) {
    const storedDimensions = await getStoredMapDimensions(channelId);
    
    if (!storedDimensions) {
        // First time, just store dimensions
        await storeMapDimensions(channelId, currentMap);
        return { updated: false, firstTime: true };
    }
    
    // Check if dimensions changed
    if (storedDimensions.width !== currentMap.width || 
        storedDimensions.height !== currentMap.height ||
        storedDimensions.entranceX !== currentMap.entranceX ||
        storedDimensions.entranceY !== currentMap.entranceY) {
        
        // Handle the expansion
        const result = await handleMapExpansion(channelId, storedDimensions, currentMap);
        
        // Store new dimensions
        await storeMapDimensions(channelId, currentMap);
        
        return result;
    }
    
    return { updated: false };
}

module.exports = {
    detectMapExpansion,
    updateRailCoordinates,
    updateHazardCoordinates,
    handleMapExpansion,
    storeMapDimensions,
    getStoredMapDimensions,
    checkAndHandleMapChanges
};
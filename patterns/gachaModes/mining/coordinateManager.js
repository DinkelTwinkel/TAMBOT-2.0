// coordinateManager.js - Manage coordinate updates when map expands
const gachaVC = require('../../../models/activevcs');
const railStorage = require('./railStorage');
const hazardStorage = require('./hazardStorage');

/**
 * Update rail coordinates when map shifts
 */
async function updateRailCoordinates(channelId, shiftX, shiftY) {
    if (shiftX === 0 && shiftY === 0) return;
    
    console.log(`[COORD] Updating rail coordinates: shift (${shiftX}, ${shiftY})`);
    
    try {
        const railsData = await railStorage.getRailsData(channelId);
        if (!railsData || !railsData.positions || Object.keys(railsData.positions).length === 0) {
            return;
        }
        
        // Create new object with shifted coordinates
        const shiftedRails = {};
        for (const [key, rail] of Object.entries(railsData.positions)) {
            const [oldX, oldY] = key.split(',').map(Number);
            const newX = oldX + shiftX;
            const newY = oldY + shiftY;
            const newKey = `${newX},${newY}`;
            
            shiftedRails[newKey] = {
                ...rail,
                x: newX,
                y: newY
            };
        }
        
        // Update the rails data
        railsData.positions = shiftedRails;
        await railStorage.setRailsData(channelId, railsData);
        
        console.log(`[COORD] Updated ${Object.keys(shiftedRails).length} rail segments`);
    } catch (error) {
        console.error('[COORD] Error updating rail coordinates:', error);
    }
}

/**
 * Update hazard coordinates when map shifts
 */
async function updateHazardCoordinates(channelId, shiftX, shiftY) {
    if (shiftX === 0 && shiftY === 0) return;
    
    console.log(`[COORD] Updating hazard coordinates: shift (${shiftX}, ${shiftY})`);
    
    try {
        const hazardsData = await hazardStorage.getHazardsData(channelId);
        if (!hazardsData || !hazardsData.hazards || hazardsData.hazards.size === 0) {
            return;
        }
        
        // Create new Map with shifted coordinates
        const shiftedHazards = new Map();
        for (const [key, hazard] of hazardsData.hazards) {
            const [oldX, oldY] = key.split(',').map(Number);
            const newX = oldX + shiftX;
            const newY = oldY + shiftY;
            const newKey = `${newX},${newY}`;
            
            shiftedHazards.set(newKey, {
                ...hazard,
                x: newX,
                y: newY
            });
        }
        
        // Update revealed set with shifted coordinates
        const shiftedRevealed = new Set();
        for (const key of hazardsData.revealed) {
            const [oldX, oldY] = key.split(',').map(Number);
            const newX = oldX + shiftX;
            const newY = oldY + shiftY;
            shiftedRevealed.add(`${newX},${newY}`);
        }
        
        // Update the hazards data
        hazardsData.hazards = shiftedHazards;
        hazardsData.revealed = shiftedRevealed;
        await hazardStorage.saveHazardsData(channelId, hazardsData);
        
        console.log(`[COORD] Updated ${shiftedHazards.size} hazard positions`);
    } catch (error) {
        console.error('[COORD] Error updating hazard coordinates:', error);
    }
}

/**
 * Store map dimensions for reference
 */
async function storeMapDimensions(channelId, mapData) {
    try {
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
    } catch (error) {
        console.error('[COORD] Error storing map dimensions:', error);
    }
}

/**
 * Get stored map dimensions
 */
async function getMapDimensions(channelId) {
    try {
        const entry = await gachaVC.findOne({ channelId });
        return entry?.gameData?.mapDimensions || null;
    } catch (error) {
        console.error('[COORD] Error getting map dimensions:', error);
        return null;
    }
}

/**
 * Check if map has changed and handle coordinate updates
 */
async function checkAndHandleMapChanges(channelId, currentMapData) {
    try {
        const storedDimensions = await getMapDimensions(channelId);
        
        // If no stored dimensions, store current ones
        if (!storedDimensions) {
            await storeMapDimensions(channelId, currentMapData);
            return { updated: false, shiftX: 0, shiftY: 0 };
        }
        
        // Check if map dimensions have changed
        if (storedDimensions.width !== currentMapData.width || 
            storedDimensions.height !== currentMapData.height ||
            storedDimensions.entranceX !== currentMapData.entranceX ||
            storedDimensions.entranceY !== currentMapData.entranceY) {
            
            // Calculate shift amounts (map expands from center)
            const shiftX = currentMapData.entranceX - storedDimensions.entranceX;
            const shiftY = currentMapData.entranceY - storedDimensions.entranceY;
            
            console.log(`[COORD] Map dimensions changed: ${storedDimensions.width}x${storedDimensions.height} -> ${currentMapData.width}x${currentMapData.height}`);
            console.log(`[COORD] Entrance shifted: (${storedDimensions.entranceX},${storedDimensions.entranceY}) -> (${currentMapData.entranceX},${currentMapData.entranceY})`);
            
            // Update stored rails and hazards with new coordinates
            await updateRailCoordinates(channelId, shiftX, shiftY);
            await updateHazardCoordinates(channelId, shiftX, shiftY);
            
            // Store new dimensions
            await storeMapDimensions(channelId, currentMapData);
            
            return { updated: true, shiftX, shiftY };
        }
        
        return { updated: false, shiftX: 0, shiftY: 0 };
    } catch (error) {
        console.error('[COORD] Error checking map changes:', error);
        return { updated: false, shiftX: 0, shiftY: 0 };
    }
}

module.exports = {
    updateRailCoordinates,
    updateHazardCoordinates,
    storeMapDimensions,
    getMapDimensions,
    checkAndHandleMapChanges
};
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
        if (!railsData || !railsData.rails || railsData.rails.size === 0) {
            return;
        }
        
        // Create new Map with shifted coordinates
        const shiftedRails = new Map();
        for (const [key, rail] of railsData.rails) {
            const [oldX, oldY] = key.split(',').map(Number);
            const newX = oldX + shiftX;
            const newY = oldY + shiftY;
            const newKey = `${newX},${newY}`;
            
            shiftedRails.set(newKey, {
                ...rail,
                x: newX,
                y: newY
            });
        }
        
        // Update the rails data
        railsData.rails = shiftedRails;
        await railStorage.saveRailsData(channelId, railsData);
        
        console.log(`[COORD] Updated ${shiftedRails.size} rail segments`);
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

module.exports = {
    updateRailCoordinates,
    updateHazardCoordinates,
    storeMapDimensions,
    getMapDimensions
};
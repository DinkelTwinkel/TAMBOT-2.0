// hazardStorage.js - Efficient hazard storage and management system
// Store hazards separately from the main map for performance

/**
 * Initialize hazards data structure for a channel
 */
function initializeHazards(channelId) {
    return {
        channelId,
        hazards: new Map(), // Map of "x,y" -> hazard object
        revealed: new Set(), // Set of "x,y" coordinates that have been revealed
        lastUpdated: Date.now()
    };
}

/**
 * Add a hazard at a specific position
 */
function addHazard(hazardsData, x, y, hazardType, properties = {}) {
    const key = `${x},${y}`;
    hazardsData.hazards.set(key, {
        x,
        y,
        type: hazardType,
        revealed: false,
        triggered: false,
        properties: properties,
        createdAt: Date.now()
    });
    hazardsData.lastUpdated = Date.now();
    return hazardsData;
}

/**
 * Check if a tile has a hazard
 */
function hasHazard(hazardsData, x, y) {
    if (!hazardsData || !hazardsData.hazards) return false;
    return hazardsData.hazards.has(`${x},${y}`);
}

/**
 * Get hazard at a specific position
 */
function getHazard(hazardsData, x, y) {
    if (!hazardsData || !hazardsData.hazards) return null;
    return hazardsData.hazards.get(`${x},${y}`);
}

/**
 * Check if a hazard has been revealed
 */
function isHazardRevealed(hazardsData, x, y) {
    if (!hazardsData) return false;
    const hazard = getHazard(hazardsData, x, y);
    return hazard ? hazard.revealed : false;
}

/**
 * Reveal a hazard (make it visible)
 */
function revealHazard(hazardsData, x, y) {
    const hazard = getHazard(hazardsData, x, y);
    if (hazard) {
        hazard.revealed = true;
        hazardsData.revealed.add(`${x},${y}`);
        hazardsData.lastUpdated = Date.now();
    }
    return hazardsData;
}

/**
 * Trigger a hazard (activate its effect)
 */
function triggerHazard(hazardsData, x, y) {
    const hazard = getHazard(hazardsData, x, y);
    if (hazard && !hazard.triggered) {
        hazard.triggered = true;
        hazard.revealed = true;
        hazardsData.revealed.add(`${x},${y}`);
        hazardsData.lastUpdated = Date.now();
        return hazard;
    }
    return null;
}

/**
 * Remove a hazard
 */
function removeHazard(hazardsData, x, y) {
    const key = `${x},${y}`;
    hazardsData.hazards.delete(key);
    hazardsData.revealed.delete(key);
    hazardsData.lastUpdated = Date.now();
    return hazardsData;
}

/**
 * Get all hazards in a radius
 */
function getHazardsInRadius(hazardsData, centerX, centerY, radius) {
    const hazards = [];
    if (!hazardsData || !hazardsData.hazards) return hazards;
    
    for (const [key, hazard] of hazardsData.hazards) {
        const distance = Math.sqrt(
            Math.pow(hazard.x - centerX, 2) + 
            Math.pow(hazard.y - centerY, 2)
        );
        if (distance <= radius) {
            hazards.push(hazard);
        }
    }
    return hazards;
}

/**
 * Get all revealed hazards
 */
function getRevealedHazards(hazardsData) {
    const revealed = [];
    if (!hazardsData || !hazardsData.hazards) return revealed;
    
    for (const hazard of hazardsData.hazards.values()) {
        if (hazard.revealed) {
            revealed.push(hazard);
        }
    }
    return revealed;
}

/**
 * Clear all hazards (for reset)
 */
function clearHazards(hazardsData) {
    if (hazardsData) {
        hazardsData.hazards.clear();
        hazardsData.revealed.clear();
        hazardsData.lastUpdated = Date.now();
    }
    return hazardsData;
}

/**
 * Get hazards data from database entry
 */
async function getHazardsData(channelId) {
    const gachaVC = require('../../../models/activevcs');
    const result = await gachaVC.findOne({ channelId });
    
    if (!result || !result.gameData) {
        return initializeHazards(channelId);
    }
    
    // Convert stored format back to Map/Set if needed
    if (result.gameData.hazards) {
        const hazardsData = {
            channelId,
            hazards: new Map(),
            revealed: new Set(result.gameData.hazards.revealed || []),
            lastUpdated: result.gameData.hazards.lastUpdated || Date.now()
        };
        
        // Convert array/object back to Map
        if (result.gameData.hazards.hazards) {
            if (Array.isArray(result.gameData.hazards.hazards)) {
                for (const hazard of result.gameData.hazards.hazards) {
                    hazardsData.hazards.set(`${hazard.x},${hazard.y}`, hazard);
                }
            } else if (result.gameData.hazards.hazards instanceof Map) {
                hazardsData.hazards = result.gameData.hazards.hazards;
            }
        }
        
        return hazardsData;
    }
    
    return initializeHazards(channelId);
}

/**
 * Save hazards data to database
 */
async function saveHazardsData(channelId, hazardsData) {
    const gachaVC = require('../../../models/activevcs');
    
    // Convert Map/Set to storable format
    const hazardsArray = Array.from(hazardsData.hazards.values());
    const revealedArray = Array.from(hazardsData.revealed);
    
    await gachaVC.updateOne(
        { channelId },
        {
            $set: {
                'gameData.hazards': {
                    hazards: hazardsArray,
                    revealed: revealedArray,
                    lastUpdated: hazardsData.lastUpdated
                }
            }
        },
        { upsert: true }
    );
    
    return hazardsData;
}

/**
 * Generate hazards and treasures for a new map area
 */
function generateHazardsForArea(hazardsData, startX, startY, width, height, spawnChance, powerLevel) {
    const { ENCOUNTER_TYPES, getEncounterTypeForPowerLevel } = require('./miningConstants');
    
    for (let y = startY; y < startY + height; y++) {
        for (let x = startX; x < startX + width; x++) {
            // Don't place hazards at entrance or starting area
            if (Math.abs(x) <= 1 && Math.abs(y) <= 1) continue;
            
            if (Math.random() < spawnChance) {
                // Use encounter system which includes both hazards and treasures
                const encounterType = getEncounterTypeForPowerLevel(powerLevel);
                if (encounterType) {
                    addHazard(hazardsData, x, y, encounterType, {
                        powerLevel: powerLevel
                    });
                }
            }
        }
    }
    
    return hazardsData;
}

module.exports = {
    initializeHazards,
    addHazard,
    hasHazard,
    getHazard,
    isHazardRevealed,
    revealHazard,
    triggerHazard,
    removeHazard,
    getHazardsInRadius,
    getRevealedHazards,
    clearHazards,
    getHazardsData,
    saveHazardsData,
    generateHazardsForArea
};
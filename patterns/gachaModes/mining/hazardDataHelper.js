const ActiveVCS = require('../../../models/activevcs');

/**
 * Get hazard data for a specific voice channel
 * @param {string} channelId - The channel ID to get hazard data for
 * @returns {Object|null} - The hazard data or null if not found
 */
async function getHazardDataForChannel(channelId) {
    try {
        const vcData = await ActiveVCS.findOne({ channelId: channelId });
        
        if (!vcData || !vcData.gameData || !vcData.gameData.hazardData) {
            console.log(`No hazard data found for channel ${channelId}`);
            return null;
        }
        
        return vcData.gameData.hazardData;
    } catch (error) {
        console.error(`Error fetching hazard data for channel ${channelId}:`, error);
        return null;
    }
}

/**
 * Update hazard data for a channel (if hazards change during gameplay)
 * @param {string} channelId - The channel ID to update
 * @param {Object} hazardData - The new hazard data
 * @returns {boolean} - Success status
 */
async function updateHazardDataForChannel(channelId, hazardData) {
    try {
        const vcData = await ActiveVCS.findOne({ channelId: channelId });
        
        if (!vcData) {
            console.error(`VC data not found for channel ${channelId}`);
            return false;
        }
        
        if (!vcData.gameData) {
            vcData.gameData = {};
        }
        
        vcData.gameData.hazardData = {
            ...vcData.gameData.hazardData,
            ...hazardData,
            lastUpdated: new Date()
        };
        
        await vcData.save();
        return true;
    } catch (error) {
        console.error(`Error updating hazard data for channel ${channelId}:`, error);
        return false;
    }
}

/**
 * Check if a specific hazard type is present in the channel
 * @param {string} channelId - The channel ID to check
 * @param {string} hazardType - The hazard type to check for
 * @returns {Object|null} - The hazard object if present, null otherwise
 */
async function getHazardByType(channelId, hazardType) {
    const hazardData = await getHazardDataForChannel(channelId);
    
    if (!hazardData || !hazardData.hazards) {
        return null;
    }
    
    return hazardData.hazards.find(h => h.type === hazardType) || null;
}

/**
 * Get spawn chance modifier based on hazard level
 * @param {number} hazardLevel - The hazard level (1-7)
 * @returns {number} - Spawn chance multiplier
 */
function getHazardSpawnChanceModifier(hazardLevel) {
    // Higher hazard levels increase the spawn frequency
    const modifiers = {
        1: 0.5,   // 50% spawn rate
        2: 0.75,  // 75% spawn rate
        3: 1.0,   // Normal spawn rate
        4: 1.25,  // 125% spawn rate
        5: 1.5,   // 150% spawn rate
        6: 1.75,  // 175% spawn rate
        7: 2.0    // 200% spawn rate
    };
    
    return modifiers[hazardLevel] || 1.0;
}

/**
 * Calculate if a hazard should spawn based on hazard data
 * @param {Object} hazardData - The hazard data from the channel
 * @param {string} hazardType - The specific hazard type to check
 * @returns {boolean} - Whether the hazard should spawn
 */
function shouldSpawnHazard(hazardData, hazardType = null) {
    if (!hazardData || !hazardData.hazards || hazardData.hazards.length === 0) {
        return false;
    }
    
    const spawnModifier = getHazardSpawnChanceModifier(hazardData.hazardLevel);
    const baseChance = 0.02; // 2% base chance per tile
    const modifiedChance = baseChance * spawnModifier;
    
    // If checking for specific hazard type
    if (hazardType) {
        const hazard = hazardData.hazards.find(h => h.type === hazardType);
        if (!hazard) return false;
        
        // Use hazard intensity to further modify spawn chance
        const hazardSpecificChance = modifiedChance * (hazard.intensity || 1.0);
        return Math.random() < hazardSpecificChance;
    }
    
    // General hazard spawn check
    return Math.random() < modifiedChance;
}

module.exports = {
    getHazardDataForChannel,
    updateHazardDataForChannel,
    getHazardByType,
    getHazardSpawnChanceModifier,
    shouldSpawnHazard
};

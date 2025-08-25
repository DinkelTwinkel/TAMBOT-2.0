// Fix for hazard spawning to respect server-specific allowed types
// This module ensures that only hazards listed in the server's allowedTypes configuration will spawn

const { ENCOUNTER_CONFIG, ENCOUNTER_TYPES } = require('../miningConstants_unified');

/**
 * Get the server configuration for a specific mine
 * @param {string|number} mineTypeId - The ID of the mine/server
 * @returns {Object} Server configuration including hazardConfig
 */
function getServerConfig(mineTypeId) {
    try {
        // Load the gacha servers configuration
        const gachaServers = require('../../../../data/gachaServers.json');
        
        // Find the server by ID
        const server = gachaServers.find(s => 
            String(s.id) === String(mineTypeId) && s.type === 'mining'
        );
        
        if (!server) {
            console.log(`[HAZARD FIX] No server config found for mine ${mineTypeId}, using defaults`);
            return null;
        }
        
        return server;
    } catch (error) {
        console.error('[HAZARD FIX] Error loading server config:', error);
        return null;
    }
}

/**
 * Filter encounter types based on server's allowed types
 * @param {Array} availableTypes - Types available for the power level
 * @param {Object} serverConfig - Server configuration with hazardConfig
 * @returns {Array} Filtered list of allowed encounter types
 */
function filterAllowedTypes(availableTypes, serverConfig) {
    if (!serverConfig || !serverConfig.hazardConfig || !serverConfig.hazardConfig.allowedTypes) {
        // No restrictions, return all available types
        return availableTypes;
    }
    
    const allowedTypes = serverConfig.hazardConfig.allowedTypes;
    
    // If allowedTypes is empty, no hazards should spawn
    if (allowedTypes.length === 0) {
        console.log(`[HAZARD FIX] No hazards allowed for ${serverConfig.name}`);
        return [];
    }
    
    // Filter to only allowed types
    const filtered = availableTypes.filter(type => {
        // Check if this is a hazard type
        const config = ENCOUNTER_CONFIG[type];
        if (!config || !config.isHazard) {
            // Not a hazard (might be treasure), keep it
            return true;
        }
        
        // Check if this hazard is in the allowed list
        return allowedTypes.includes(type);
    });
    
    console.log(`[HAZARD FIX] ${serverConfig.name}: Filtered ${availableTypes.length} types to ${filtered.length} allowed types`);
    
    return filtered;
}

/**
 * Get encounter type for power level with server-specific filtering
 * @param {number} powerLevel - The power level of the mine
 * @param {string|number} mineTypeId - The ID of the mine/server
 * @returns {string|null} The selected encounter type or null
 */
function getFilteredEncounterType(powerLevel, mineTypeId) {
    const { ENCOUNTER_SPAWN_CONFIG } = require('../miningConstants_unified');
    
    // Get base configuration for power level
    const config = ENCOUNTER_SPAWN_CONFIG[powerLevel] || ENCOUNTER_SPAWN_CONFIG[1];
    let availableTypes = config.availableTypes || [];
    
    // Get server configuration
    const serverConfig = getServerConfig(mineTypeId);
    
    // Filter to only allowed types for this server
    availableTypes = filterAllowedTypes(availableTypes, serverConfig);
    
    if (availableTypes.length === 0) {
        return null;
    }
    
    // Apply server-specific spawn chance modifier if exists
    let spawnChanceModifier = 1.0;
    if (serverConfig && serverConfig.hazardConfig && serverConfig.hazardConfig.spawnChance) {
        spawnChanceModifier = serverConfig.hazardConfig.spawnChance / config.spawnChance;
    }
    
    // Random chance to spawn nothing (based on modified spawn chance)
    if (Math.random() > spawnChanceModifier) {
        return null;
    }
    
    // Weighted random selection from allowed types
    const eligibleEncounters = availableTypes
        .map(type => ({ type, config: ENCOUNTER_CONFIG[type] }))
        .filter(e => e.config && e.config.powerRequirement <= powerLevel);
    
    if (eligibleEncounters.length === 0) {
        return null;
    }
    
    const totalWeight = eligibleEncounters.reduce((sum, e) => sum + (e.config.weight || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (const encounter of eligibleEncounters) {
        random -= (encounter.config.weight || 1);
        if (random <= 0) {
            return encounter.type;
        }
    }
    
    return eligibleEncounters[0].type;
}

/**
 * Enhanced hazard generation that respects server allowed types
 * @param {Object} hazardsData - Existing hazards data
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate
 * @param {number} width - Width of area
 * @param {number} height - Height of area
 * @param {number} spawnChance - Base spawn chance
 * @param {number} powerLevel - Power level of the mine
 * @param {string|number} mineTypeId - The ID of the mine/server
 * @returns {Object} Updated hazards data
 */
function generateFilteredHazards(hazardsData, startX, startY, width, height, spawnChance, powerLevel, mineTypeId) {
    const hazardStorage = require('../hazardStorage');
    
    // Get server configuration
    const serverConfig = getServerConfig(mineTypeId);
    
    // Use server-specific spawn chance if available
    if (serverConfig && serverConfig.hazardConfig && serverConfig.hazardConfig.spawnChance) {
        spawnChance = serverConfig.hazardConfig.spawnChance;
        console.log(`[HAZARD FIX] Using server spawn chance ${spawnChance} for ${serverConfig.name}`);
    }
    
    // Log allowed types for this server
    if (serverConfig && serverConfig.hazardConfig && serverConfig.hazardConfig.allowedTypes) {
        console.log(`[HAZARD FIX] ${serverConfig.name} (ID: ${mineTypeId}) allows: ${serverConfig.hazardConfig.allowedTypes.join(', ')}`);
        console.log(`[HAZARD FIX] Power level: ${powerLevel}, Spawn chance: ${spawnChance}`);
    } else {
        console.log(`[HAZARD FIX] No hazard config for mine ${mineTypeId}, using default spawning`);
    }
    
    let hazardsAdded = 0;
    let attempts = 0;
    
    for (let y = startY; y < startY + height; y++) {
        for (let x = startX; x < startX + width; x++) {
            // Don't place hazards at entrance or starting area
            if (Math.abs(x) <= 1 && Math.abs(y) <= 1) continue;
            
            attempts++;
            
            if (Math.random() < spawnChance) {
                // Use filtered encounter type selection
                const encounterType = getFilteredEncounterType(powerLevel, mineTypeId);
                
                if (encounterType) {
                    // Log what type was selected (only occasionally to avoid spam)
                    if (Math.random() < 0.1) { // 10% chance to log
                        console.log(`[HAZARD FIX] Selected ${encounterType} for position (${x},${y})`);
                    }
                    hazardStorage.addHazard(hazardsData, x, y, encounterType, {
                        powerLevel: powerLevel,
                        serverId: mineTypeId
                    });
                    hazardsAdded++;
                }
            }
        }
    }
    
    console.log(`[HAZARD FIX] Generated ${hazardsAdded} hazards out of ${attempts} tiles for ${serverConfig?.name || 'unknown mine'}`);
    
    return hazardsData;
}

/**
 * Patch the existing hazardStorage module to use filtered generation
 */
function patchHazardStorage() {
    const hazardStorage = require('../hazardStorage');
    const miningContext = require('../miningContext');
    
    // Store original function
    const originalGenerateHazardsForArea = hazardStorage.generateHazardsForArea;
    
    // Replace with filtered version
    hazardStorage.generateHazardsForArea = function(hazardsData, startX, startY, width, height, spawnChance, powerLevel, mineTypeId) {
        // Try to get mineTypeId from context if not provided
        if (mineTypeId === undefined || mineTypeId === null) {
            const context = miningContext.getMiningContext();
            if (context && context.mineTypeId) {
                mineTypeId = context.mineTypeId;
                console.log(`[HAZARD FIX] Using mineTypeId ${mineTypeId} from mining context`);
            } else {
                console.warn('[HAZARD FIX] No mineTypeId provided and no context available, using unfiltered hazard generation');
                console.warn('[HAZARD FIX] This may result in incorrect hazard types spawning!');
                return originalGenerateHazardsForArea.call(this, hazardsData, startX, startY, width, height, spawnChance, powerLevel);
            }
        }
        
        // If mineTypeId is provided or retrieved from context, use filtered generation
        return generateFilteredHazards(hazardsData, startX, startY, width, height, spawnChance, powerLevel, mineTypeId);
    };
    
    console.log('[HAZARD FIX] Hazard storage patched to respect allowed types');
}

/**
 * Debug function to check hazard configuration for a specific mine
 * @param {string|number} mineTypeId - The mine ID to check
 */
function debugHazardConfig(mineTypeId) {
    console.log(`\n[HAZARD DEBUG] Checking configuration for mine ID: ${mineTypeId}`);
    
    const serverConfig = getServerConfig(mineTypeId);
    if (!serverConfig) {
        console.log(`[HAZARD DEBUG] No server configuration found for mine ${mineTypeId}`);
        return;
    }
    
    console.log(`[HAZARD DEBUG] Mine name: ${serverConfig.name}`);
    console.log(`[HAZARD DEBUG] Mine type: ${serverConfig.type}`);
    console.log(`[HAZARD DEBUG] Power level: ${serverConfig.power}`);
    
    if (serverConfig.hazardConfig) {
        console.log(`[HAZARD DEBUG] Hazard configuration found:`);
        console.log(`  - Spawn chance: ${serverConfig.hazardConfig.spawnChance}`);
        console.log(`  - Allowed types: ${serverConfig.hazardConfig.allowedTypes ? serverConfig.hazardConfig.allowedTypes.join(', ') : 'none'}`);
        
        // Check if the allowed types exist in ENCOUNTER_CONFIG
        if (serverConfig.hazardConfig.allowedTypes) {
            const { ENCOUNTER_CONFIG } = require('../miningConstants_unified');
            for (const type of serverConfig.hazardConfig.allowedTypes) {
                if (ENCOUNTER_CONFIG[type]) {
                    console.log(`  ✓ ${type} is valid (${ENCOUNTER_CONFIG[type].name})`);
                } else {
                    console.log(`  ✗ ${type} is INVALID - not found in ENCOUNTER_CONFIG!`);
                }
            }
        }
    } else {
        console.log(`[HAZARD DEBUG] No hazard configuration for this mine`);
    }
    
    console.log(`[HAZARD DEBUG] End of debug for mine ${mineTypeId}\n`);
}

module.exports = {
    getServerConfig,
    filterAllowedTypes,
    getFilteredEncounterType,
    generateFilteredHazards,
    patchHazardStorage,
    debugHazardConfig  // Export debug function
};

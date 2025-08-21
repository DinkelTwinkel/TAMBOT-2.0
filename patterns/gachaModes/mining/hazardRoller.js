const { 
    ENCOUNTER_CONFIG, 
    ENCOUNTER_SPAWN_CONFIG,
    ENCOUNTER_TYPES 
} = require('./miningConstants');

/**
 * Calculate hazard level based on base power level with randomness
 * @param {number} basePowerLevel - The base power level (1-7)
 * @param {number} seed - Seed for consistent randomness (optional)
 * @returns {number} - The final hazard level (1-7)
 */
function calculateHazardLevel(basePowerLevel, seed = null) {
    // Use seed for consistent randomness if provided
    const random = seed ? seedRandom(seed) : Math.random();
    
    // Base variance: -1 to +1 level with higher chance of staying at base
    let variance = 0;
    const roll = random;
    
    if (roll < 0.15) {
        // 15% chance to be 1 level lower (safer)
        variance = -1;
    } else if (roll < 0.70) {
        // 55% chance to stay at base level
        variance = 0;
    } else if (roll < 0.95) {
        // 25% chance to be 1 level higher (more dangerous)
        variance = 1;
    } else {
        // 5% chance for extreme danger (+2 levels)
        variance = 2;
    }
    
    // Apply variance and clamp between 1 and 7
    const finalLevel = Math.max(1, Math.min(7, basePowerLevel + variance));
    
    return finalLevel;
}

/**
 * Roll for specific hazards based on hazard level
 * @param {number} hazardLevel - The hazard level (1-7)
 * @param {number} seed - Seed for consistent randomness (optional)
 * @returns {Array} - Array of hazard objects present on the map
 */
function rollHazards(hazardLevel, seed = null) {
    const config = ENCOUNTER_SPAWN_CONFIG[hazardLevel] || ENCOUNTER_SPAWN_CONFIG[1];
    const hazards = [];
    const encounteredTypes = new Set();
    
    // Get only hazards (not treasures) from available types
    const availableHazards = config.availableTypes
        .filter(type => ENCOUNTER_CONFIG[type] && ENCOUNTER_CONFIG[type].isHazard);
    
    if (!availableHazards.length) return hazards;
    
    // Calculate number of hazard rolls based on level
    const baseRolls = Math.floor(hazardLevel / 2) + 1; // 1-2 rolls for low levels, up to 4 for high
    const bonusRoll = Math.random() < (hazardLevel * 0.1) ? 1 : 0; // Chance for extra roll
    const totalRolls = baseRolls + bonusRoll;
    
    // Roll for each potential hazard
    for (let i = 0; i < totalRolls; i++) {
        const roll = seed ? seedRandom(seed + i) : Math.random();
        
        // Use spawn chance from config
        if (roll < config.spawnChance * 2) { // Double chance for initial roll
            // Select a hazard type (weighted)
            const hazardType = selectWeightedHazard(availableHazards, hazardLevel, encounteredTypes);
            
            if (hazardType && !encounteredTypes.has(hazardType)) {
                const hazardConfig = ENCOUNTER_CONFIG[hazardType];
                encounteredTypes.add(hazardType);
                
                // Calculate intensity/count based on hazard level
                const intensity = calculateHazardIntensity(hazardLevel, hazardConfig);
                
                hazards.push({
                    type: hazardType,
                    name: hazardConfig.name,
                    symbol: hazardConfig.symbol,
                    color: hazardConfig.color,
                    description: hazardConfig.description,
                    intensity: intensity,
                    count: Math.floor(Math.random() * (hazardLevel + 1)) + 1 // 1 to hazardLevel+1 instances
                });
            }
        }
    }
    
    return hazards;
}

/**
 * Select a weighted hazard type
 */
function selectWeightedHazard(availableTypes, hazardLevel, excludeTypes) {
    const eligibleHazards = availableTypes
        .filter(type => !excludeTypes.has(type))
        .map(type => ({
            type,
            config: ENCOUNTER_CONFIG[type],
            weight: ENCOUNTER_CONFIG[type].weight * (ENCOUNTER_CONFIG[type].powerRequirement <= hazardLevel ? 1 : 0.5)
        }))
        .filter(h => h.weight > 0);
    
    if (!eligibleHazards.length) return null;
    
    const totalWeight = eligibleHazards.reduce((sum, h) => sum + h.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const hazard of eligibleHazards) {
        random -= hazard.weight;
        if (random <= 0) {
            return hazard.type;
        }
    }
    
    return eligibleHazards[0].type;
}

/**
 * Calculate hazard intensity based on level
 */
function calculateHazardIntensity(hazardLevel, hazardConfig) {
    const baseIntensity = 1.0;
    const levelMultiplier = 1 + (hazardLevel - 1) * 0.2; // 20% increase per level
    
    // Special intensity modifiers for specific hazard types
    let typeModifier = 1.0;
    if (hazardConfig.name === 'Bomb Trap') {
        typeModifier = 1 + (hazardLevel - 2) * 0.15; // Bombs scale more with level
    } else if (hazardConfig.name === 'Toxic Fog') {
        typeModifier = 1 + (hazardLevel - 3) * 0.25; // Fog scales heavily at high levels
    }
    
    return baseIntensity * levelMultiplier * typeModifier;
}

/**
 * Simple seeded random number generator
 */
function seedRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Get hazard level description
 */
function getHazardLevelDescription(level) {
    const descriptions = {
        1: { name: "Safe", color: "#00FF00", emoji: "🟢" },
        2: { name: "Low Risk", color: "#ADFF2F", emoji: "🟡" },
        3: { name: "Moderate", color: "#FFD700", emoji: "🟠" },
        4: { name: "Dangerous", color: "#FF8C00", emoji: "🔶" },
        5: { name: "High Risk", color: "#FF4500", emoji: "🔴" },
        6: { name: "Extreme", color: "#DC143C", emoji: "⚠️" },
        7: { name: "Lethal", color: "#8B0000", emoji: "☠️" }
    };
    
    return descriptions[level] || descriptions[1];
}

/**
 * Generate complete hazard data for a mining VC
 */
function generateHazardData(basePowerLevel, seed = null) {
    const hazardLevel = calculateHazardLevel(basePowerLevel, seed);
    const hazards = rollHazards(hazardLevel, seed);
    const levelInfo = getHazardLevelDescription(hazardLevel);
    
    return {
        hazardLevel,
        levelInfo,
        hazards,
        seed: seed || Math.floor(Math.random() * 1000000),
        generatedAt: new Date()
    };
}

/**
 * Format hazard announcement message
 */
function formatHazardAnnouncement(hazardData, locationName) {
    const { hazardLevel, levelInfo, hazards } = hazardData;
    
    let message = `**⚠️ HAZARD ASSESSMENT - ${locationName} ⚠️**\n`;
    message += `\n${levelInfo.emoji} **Danger Level:** ${levelInfo.name} (Level ${hazardLevel}/7)\n`;
    
    if (hazards.length > 0) {
        message += `\n**🚨 Hazards Detected:**\n`;
        hazards.forEach(hazard => {
            message += `• ${hazard.symbol} **${hazard.name}** (×${hazard.count})\n`;
            message += `  *${hazard.description}*\n`;
            if (hazard.intensity > 1.0) {
                message += `  ⚡ Intensity: ${Math.round(hazard.intensity * 100)}%\n`;
            }
        });
    } else {
        message += `\n✅ **No immediate hazards detected!** Stay vigilant.\n`;
    }
    
    message += `\n*Use caution when exploring. Hazards may appear randomly during mining operations.*`;
    
    return message;
}

module.exports = {
    calculateHazardLevel,
    rollHazards,
    generateHazardData,
    getHazardLevelDescription,
    formatHazardAnnouncement
};

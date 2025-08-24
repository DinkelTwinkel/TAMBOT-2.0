// hazardServerMapping.js - Maps gachaServers.json data to hazard profiles
// This file demonstrates how the hazard scanner reflects server configuration

/**
 * Server Power Level to Hazard Mapping
 * Based on gachaServers.json power levels
 */
const SERVER_HAZARD_MAPPING = {
    // Power Level 1 - Starter Mine
    1: {
        serverNames: ["Coal Mines"],
        rockHardness: {
            min: 10,
            max: 20,
            typical: 15
        },
        hazardTypes: ["basic_structural", "minor_gas", "standard_resources"],
        oreQuality: "Common ores, basic materials",
        specialFeatures: [
            "Tutorial-friendly environment",
            "Minimal environmental hazards",
            "Stable geological formations"
        ]
    },
    
    // Power Level 2 - Early Game
    2: {
        serverNames: ["Copper Quarry", "Topaz Mine"],
        rockHardness: {
            min: 20,
            max: 30,
            typical: 25
        },
        hazardTypes: ["moderate_structural", "toxic_gas", "water_hazards", "enhanced_resources"],
        oreQuality: "Uncommon ores, copper and topaz veins",
        specialFeatures: [
            "Occasional ground shifts",
            "Minor water infiltration",
            "Sulfur dioxide presence"
        ]
    },
    
    // Power Level 3 - Mid Game
    3: {
        serverNames: ["Iron Stronghold", "Fossil Excavation"],
        rockHardness: {
            min: 30,
            max: 35,
            typical: 32
        },
        hazardTypes: ["unstable_structures", "explosive_gas", "spatial_anomalies", "rare_resources"],
        oreQuality: "Rare ores, iron deposits, fossil materials",
        specialFeatures: [
            "Magnetite interference",
            "Ancient organic materials",
            "Moderate fault line activity"
        ]
    },
    
    // Power Level 4 - Advanced
    4: {
        serverNames: ["Diamond Mines", "Emerald Caverns"],
        rockHardness: {
            min: 40,
            max: 45,
            typical: 43
        },
        hazardTypes: ["major_collapses", "chain_explosions", "hostile_entities", "ancient_caches"],
        oreQuality: "Epic materials, precious gems",
        specialFeatures: [
            "High-pressure formations",
            "Kimberlite pipes",
            "Beryllium concentrations",
            "Frequent micro-quakes"
        ]
    },
    
    // Power Level 5 - Expert
    5: {
        serverNames: ["Ruby Depths", "Crystal Grottos"],
        rockHardness: {
            min: 45,
            max: 50,
            typical: 48
        },
        hazardTypes: ["seismic_cascades", "radiation_zones", "psychological_hazards", "legendary_materials"],
        oreQuality: "Legendary crystals, corundum formations",
        specialFeatures: [
            "Extreme heat signatures",
            "Electromagnetic anomalies",
            "Resonant crystal matrices",
            "Major structural failures"
        ]
    },
    
    // Power Level 6 - Extreme
    6: {
        serverNames: ["Obsidian Forge", "Mythril Sanctum"],
        rockHardness: {
            min: 60,
            max: 65,
            typical: 62
        },
        hazardTypes: ["dimensional_rifts", "gravitational_anomalies", "lava_intrusion", "divine_artifacts"],
        oreQuality: "Mythic materials, reality-warping substances",
        specialFeatures: [
            "Active magma chambers",
            "Volcanic glass formations",
            "Reality distortion fields",
            "Temporal particle emissions",
            "3x hazard frequency multiplier"
        ]
    },
    
    // Power Level 7 - Apocalyptic
    7: {
        serverNames: ["Adamantite Abyss"],
        rockHardness: {
            min: 70,
            max: 80,
            typical: 75
        },
        hazardTypes: ["total_structural_failure", "singularities", "entropic_cascades", "impossible_materials"],
        oreQuality: "Impossible materials, reality-breaking substances",
        specialFeatures: [
            "Gravitational anomalies",
            "Catastrophic pressure zones",
            "Void energy emissions",
            "Reality coherence failures",
            "5x hazard frequency multiplier"
        ]
    }
};

/**
 * Calculate dynamic properties based on server configuration
 */
function calculateServerHazardProfile(serverJson) {
    const powerLevel = serverJson.power || 1;
    const mapping = SERVER_HAZARD_MAPPING[powerLevel];
    
    if (!mapping) {
        console.warn(`No hazard mapping for power level ${powerLevel}`);
        return SERVER_HAZARD_MAPPING[1]; // Default to level 1
    }
    
    return {
        ...mapping,
        calculatedProperties: {
            // Reinforced wall percentage increases with power
            reinforcedWallPercentage: mapping.rockHardness.typical,
            
            // Standard wall percentage (inverse of reinforced)
            standardWallPercentage: 100 - mapping.rockHardness.typical,
            
            // Ore spawn chance scales with power
            oreSpawnChance: 0.2 + (powerLevel * 0.05),
            
            // Rare ore chance
            rareOreChance: 0.05 + (powerLevel * 0.02),
            
            // Hazard spawn base chance
            hazardSpawnChance: 0.05 + (powerLevel * 0.03),
            
            // Value multiplier for found items
            valueMultiplier: 1 + (powerLevel * 0.2),
            
            // Mining speed modifier (inverse - higher levels are harder)
            miningSpeedModifier: Math.max(0.5, 1.5 - (powerLevel * 0.1))
        }
    };
}

/**
 * Get hazard intensity description based on power level
 */
function getHazardIntensityDescription(powerLevel) {
    const descriptions = {
        1: "Minimal - Basic safety hazards only",
        2: "Low - Occasional environmental dangers",
        3: "Moderate - Regular hazardous encounters",
        4: "High - Frequent dangerous situations",
        5: "Severe - Constant threat presence",
        6: "Extreme - Reality-warping dangers",
        7: "Apocalyptic - Existence-threatening anomalies"
    };
    
    return descriptions[powerLevel] || descriptions[1];
}

/**
 * Example usage with a server from gachaServers.json
 */
function demonstrateServerMapping() {
    // Example server data (as would come from gachaServers.json)
    const exampleServers = [
        { id: 1, name: "⛏️ Coal Mines", power: 1 },
        { id: 6, name: "⛏️ Diamond Mines", power: 4 },
        { id: 11, name: "⛏️ Obsidian Forge", power: 6 },
        { id: 12, name: "⛏️ Adamantite Abyss", power: 7 }
    ];
    
    console.log("=== SERVER HAZARD PROFILE EXAMPLES ===\n");
    
    for (const server of exampleServers) {
        const profile = calculateServerHazardProfile(server);
        console.log(`Server: ${server.name}`);
        console.log(`Power Level: ${server.power}`);
        console.log(`Rock Hardness: ${profile.rockHardness.typical}% reinforced walls`);
        console.log(`Ore Quality: ${profile.oreQuality}`);
        console.log(`Hazard Intensity: ${getHazardIntensityDescription(server.power)}`);
        console.log(`Calculated Properties:`);
        console.log(`  - Ore Spawn Chance: ${(profile.calculatedProperties.oreSpawnChance * 100).toFixed(1)}%`);
        console.log(`  - Hazard Spawn Chance: ${(profile.calculatedProperties.hazardSpawnChance * 100).toFixed(1)}%`);
        console.log(`  - Value Multiplier: ${profile.calculatedProperties.valueMultiplier}x`);
        console.log(`  - Mining Speed: ${(profile.calculatedProperties.miningSpeedModifier * 100).toFixed(0)}%`);
        console.log("---\n");
    }
}

// Export for use in other modules
module.exports = {
    SERVER_HAZARD_MAPPING,
    calculateServerHazardProfile,
    getHazardIntensityDescription,
    demonstrateServerMapping
};

// Run demonstration if executed directly
if (require.main === module) {
    demonstrateServerMapping();
}

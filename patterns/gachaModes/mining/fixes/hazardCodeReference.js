// hazardCodeReference.js - Quick reference for hazard codes displayed in scans

const HAZARD_CODE_REFERENCE = {
    title: "GEOLOGICAL SCAN CODE REFERENCE",
    version: "v2.0",
    
    // Structural Hazard Codes
    structural: {
        category: "🏗️ STRUCTURAL HAZARDS",
        codes: {
            "RKF-01": { severity: "LOW", desc: "Loose ceiling material - Minor falling debris risk" },
            "RKF-02": { severity: "MED", desc: "Rock slide zones - Significant rockfall danger" },
            
            "COL-01": { severity: "HIGH", desc: "Structural failure - Imminent collapse risk" },
            "COL-02": { severity: "SEVERE", desc: "Cascading collapse - Multiple section failure" },
            "COL-03": { severity: "CRITICAL", desc: "Seismic collapse - Earthquake-triggered failure" },
            
            "FSR-01": { severity: "HIGH", desc: "Fissure network - Ground splitting hazard" },
            "TEC-01": { severity: "SEVERE", desc: "Tectonic activity - Active fault lines" },
            
            "MAG-01": { severity: "CRITICAL", desc: "Magnetic anomalies - Equipment malfunction risk" },
            
            "DIM-01": { severity: "EXTREME", desc: "Dimensional rifts - Space-time distortions" },
            "GRV-01": { severity: "EXTREME", desc: "Gravity wells - Localized gravity changes" },
            "VOL-01": { severity: "EXTREME", desc: "Lava intrusion - Molten rock presence" },
            
            "APO-01": { severity: "APOCALYPTIC", desc: "Total failure - Complete structural breakdown" },
            "BLK-01": { severity: "APOCALYPTIC", desc: "Singularity - Gravitational collapse point" },
            "OBL-01": { severity: "APOCALYPTIC", desc: "Matter dissolution - Atomic destabilization" }
        }
    },
    
    // Environmental Hazard Codes
    environmental: {
        category: "☢️ ENVIRONMENTAL HAZARDS",
        codes: {
            "GAS-01": { severity: "LOW", desc: "Gas accumulation - Minor toxic vapors" },
            "GAS-02": { severity: "MED", desc: "Toxic concentration - Dangerous gas levels" },
            
            "TMP-01": { severity: "LOW", desc: "Temperature +5°C - Minor heat increase" },
            "TMP-02": { severity: "MED", desc: "Temperature +15°C - Moderate heat zones" },
            "TMP-03": { severity: "CRITICAL", desc: "Extreme variance - Severe temperature swings" },
            "TMP-04": { severity: "EXTREME", desc: "Plasma discharge - Ionized gas eruptions" },
            
            "WTR-01": { severity: "MED", desc: "Water infiltration - Flooding risk" },
            
            "EXP-01": { severity: "HIGH", desc: "Explosive pockets - Volatile gas zones" },
            "EXP-02": { severity: "SEVERE", desc: "Chain volatiles - Cascading explosions" },
            
            "ANM-01": { severity: "HIGH", desc: "Spatial distortion - Reality warping zones" },
            
            "BIO-01": { severity: "SEVERE", desc: "Hostile organisms - Dangerous life forms" },
            
            "RAD-01": { severity: "CRITICAL", desc: "Radiation elevated - Hazardous isotopes" },
            "PSY-01": { severity: "CRITICAL", desc: "Psychological zones - Mental hazards" },
            
            "CHR-01": { severity: "EXTREME", desc: "Temporal distortion - Time anomalies" },
            "VOI-01": { severity: "EXTREME", desc: "Reality breakdown - Void sectors" },
            
            "END-01": { severity: "APOCALYPTIC", desc: "Entropic cascade - Energy dissolution" },
            "NUC-01": { severity: "APOCALYPTIC", desc: "Nuclear decay - Atomic breakdown" },
            "COS-01": { severity: "APOCALYPTIC", desc: "Cosmic horror - Eldritch presence" },
            "REA-01": { severity: "APOCALYPTIC", desc: "Reality failure - Existence instability" }
        }
    },
    
    // Resource Indicators
    resources: {
        category: "📦 RESOURCE OPPORTUNITIES",
        codes: {
            "RES-01": { severity: "BONUS", desc: "Standard deposits - Common ore veins" },
            "RES-02": { severity: "BONUS", desc: "Enhanced density - Rich mineral zones" },
            "RES-03": { severity: "BONUS", desc: "Rare elements - Uncommon materials" },
            "RES-04": { severity: "BONUS", desc: "Ancient cache - Historical treasures" },
            "RES-05": { severity: "BONUS", desc: "Legendary materials - Epic discoveries" },
            "RES-06": { severity: "BONUS", desc: "Divine artifacts - Mythic items" },
            "RES-07": { severity: "BONUS", desc: "Impossible materials - Reality-defying substances" }
        }
    },
    
    // Severity Scale
    severityScale: {
        LOW: { color: "🟢", risk: 1, description: "Minor inconvenience" },
        MED: { color: "🟡", risk: 2, description: "Moderate danger" },
        HIGH: { color: "🟠", risk: 3, description: "Significant threat" },
        SEVERE: { color: "🔴", risk: 4, description: "Major danger" },
        CRITICAL: { color: "🟣", risk: 5, description: "Extreme threat" },
        EXTREME: { color: "⚫", risk: 6, description: "Near-catastrophic" },
        APOCALYPTIC: { color: "💀", risk: 7, description: "Reality-ending" },
        BONUS: { color: "💎", risk: 0, description: "Beneficial discovery" }
    },
    
    // Power Level to Risk Mapping
    powerLevelRisk: {
        1: { maxSeverity: "LOW", typical: ["RKF-01", "GAS-01", "TMP-01", "RES-01"] },
        2: { maxSeverity: "MED", typical: ["RKF-02", "GAS-02", "WTR-01", "RES-02"] },
        3: { maxSeverity: "HIGH", typical: ["COL-01", "FSR-01", "EXP-01", "RES-03"] },
        4: { maxSeverity: "SEVERE", typical: ["COL-02", "TEC-01", "EXP-02", "BIO-01", "RES-04"] },
        5: { maxSeverity: "CRITICAL", typical: ["COL-03", "MAG-01", "RAD-01", "PSY-01", "RES-05"] },
        6: { maxSeverity: "EXTREME", typical: ["DIM-01", "GRV-01", "VOL-01", "CHR-01", "RES-06"] },
        7: { maxSeverity: "APOCALYPTIC", typical: ["APO-01", "BLK-01", "END-01", "COS-01", "RES-07"] }
    }
};

/**
 * Get hazard description by code
 */
function getHazardByCode(code) {
    for (const category of [HAZARD_CODE_REFERENCE.structural, HAZARD_CODE_REFERENCE.environmental, HAZARD_CODE_REFERENCE.resources]) {
        if (category.codes[code]) {
            return {
                code: code,
                ...category.codes[code],
                category: category.category
            };
        }
    }
    return null;
}

/**
 * Get all hazards for a power level
 */
function getHazardsForPowerLevel(powerLevel) {
    const hazards = [];
    const maxLevel = Math.min(powerLevel, 7);
    
    for (let level = 1; level <= maxLevel; level++) {
        const levelData = HAZARD_CODE_REFERENCE.powerLevelRisk[level];
        if (levelData && levelData.typical) {
            levelData.typical.forEach(code => {
                const hazard = getHazardByCode(code);
                if (hazard) {
                    hazards.push(hazard);
                }
            });
        }
    }
    
    return hazards;
}

/**
 * Format hazard for display
 */
function formatHazardDisplay(hazardCode) {
    const hazard = getHazardByCode(hazardCode);
    if (!hazard) return `[${hazardCode}] Unknown hazard`;
    
    const severity = HAZARD_CODE_REFERENCE.severityScale[hazard.severity];
    return `${severity.color} [${hazardCode}] ${hazard.desc} (${hazard.severity})`;
}

/**
 * Generate player-friendly hazard summary
 */
function generateHazardSummary(hazardCodes) {
    const summary = {
        structural: [],
        environmental: [],
        resources: [],
        maxRisk: 0
    };
    
    hazardCodes.forEach(code => {
        const hazard = getHazardByCode(code);
        if (!hazard) return;
        
        const severity = HAZARD_CODE_REFERENCE.severityScale[hazard.severity];
        summary.maxRisk = Math.max(summary.maxRisk, severity.risk);
        
        const entry = formatHazardDisplay(code);
        
        if (hazard.category.includes("STRUCTURAL")) {
            summary.structural.push(entry);
        } else if (hazard.category.includes("ENVIRONMENTAL")) {
            summary.environmental.push(entry);
        } else if (hazard.category.includes("RESOURCE")) {
            summary.resources.push(entry);
        }
    });
    
    return summary;
}

// Export for use
module.exports = {
    HAZARD_CODE_REFERENCE,
    getHazardByCode,
    getHazardsForPowerLevel,
    formatHazardDisplay,
    generateHazardSummary
};

// Display reference if run directly
if (require.main === module) {
    console.log("=== HAZARD CODE QUICK REFERENCE ===\n");
    
    // Display all codes by category
    for (const category of [HAZARD_CODE_REFERENCE.structural, HAZARD_CODE_REFERENCE.environmental, HAZARD_CODE_REFERENCE.resources]) {
        console.log(`\n${category.category}`);
        console.log("─".repeat(50));
        
        for (const [code, data] of Object.entries(category.codes)) {
            const severity = HAZARD_CODE_REFERENCE.severityScale[data.severity];
            console.log(`${severity.color} [${code}] ${data.severity.padEnd(12)} - ${data.desc}`);
        }
    }
    
    // Display severity scale
    console.log("\n⚡ SEVERITY SCALE");
    console.log("─".repeat(50));
    for (const [level, data] of Object.entries(HAZARD_CODE_REFERENCE.severityScale)) {
        console.log(`${data.color} ${level.padEnd(12)} - Risk: ${data.risk} - ${data.description}`);
    }
    
    // Display power level mapping
    console.log("\n📊 POWER LEVEL TYPICAL HAZARDS");
    console.log("─".repeat(50));
    for (const [level, data] of Object.entries(HAZARD_CODE_REFERENCE.powerLevelRisk)) {
        console.log(`Level ${level}: Max ${data.maxSeverity} - Codes: ${data.typical.join(", ")}`);
    }
}

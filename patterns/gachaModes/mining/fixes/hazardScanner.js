// hazardScanner.js - Geological Anomaly Detection System
const { EmbedBuilder } = require('discord.js');
const { getHazardSpawnChance } = require('../miningConstants_unified');

// Server geological profiles based on gachaServers.json
const GEOLOGICAL_PROFILES = {
    "coalMines": {
        rockHardness: 15,  // % of reinforced walls
        oreRichness: "Low density minerals detected",
        geologicalType: "Sedimentary formations",
        seismicActivity: "Minimal tremor activity",
        depthIndicator: "◇◇◇◇◇◇◇",
        gasPresence: "Methane traces: 2.3%"
    },
    "copperQuarry": {
        rockHardness: 22,
        oreRichness: "Moderate copper veins identified",
        geologicalType: "Igneous intrusions present",
        seismicActivity: "Occasional ground shifts",
        depthIndicator: "◈◇◇◇◇◇◇",
        gasPresence: "Sulfur dioxide: 4.1%"
    },
    "topazMine": {
        rockHardness: 28,
        oreRichness: "Crystal formations detected",
        geologicalType: "Metamorphic rock layers",
        seismicActivity: "Minor structural instability",
        depthIndicator: "◈◈◇◇◇◇◇",
        gasPresence: "Radon levels: 5.8%"
    },
    "ironStronghold": {
        rockHardness: 35,
        oreRichness: "Dense ferrous deposits",
        geologicalType: "Magnetite-rich strata",
        seismicActivity: "Moderate fault line activity",
        depthIndicator: "◈◈◈◇◇◇◇",
        gasPresence: "Carbon monoxide: 8.2%"
    },
    "fossilExcavation": {
        rockHardness: 30,
        oreRichness: "Organic material traces",
        geologicalType: "Ancient sediment layers",
        seismicActivity: "Unstable cavern systems",
        depthIndicator: "◈◈◈◇◇◇◇",
        gasPresence: "Natural gas pockets: 7.5%"
    },
    "diamondMines": {
        rockHardness: 45,
        oreRichness: "High-pressure carbon deposits",
        geologicalType: "Kimberlite pipes detected",
        seismicActivity: "Significant tectonic stress",
        depthIndicator: "◈◈◈◈◇◇◇",
        gasPresence: "Hydrogen sulfide: 11.3%"
    },
    "emeraldCaverns": {
        rockHardness: 42,
        oreRichness: "Beryllium-rich formations",
        geologicalType: "Pegmatite veins present",
        seismicActivity: "Frequent micro-quakes",
        depthIndicator: "◈◈◈◈◇◇◇",
        gasPresence: "Toxic vapors: 12.7%"
    },
    "rubyDepths": {
        rockHardness: 50,
        oreRichness: "Corundum concentration high",
        geologicalType: "Extreme heat signatures",
        seismicActivity: "Major structural failures",
        depthIndicator: "◈◈◈◈◈◇◇",
        gasPresence: "Volatile compounds: 18.4%"
    },
    "crystalGrottos": {
        rockHardness: 48,
        oreRichness: "Resonant crystal matrices",
        geologicalType: "Electromagnetic anomalies",
        seismicActivity: "Energy field fluctuations",
        depthIndicator: "◈◈◈◈◈◇◇",
        gasPresence: "Unknown emissions: 15.9%"
    },
    "obsidianForge": {
        rockHardness: 60,
        oreRichness: "Volcanic glass formations",
        geologicalType: "Active magma chambers below",
        seismicActivity: "Extreme thermal expansion",
        depthIndicator: "◈◈◈◈◈◈◇",
        gasPresence: "Sulfurous fumes: 22.1%"
    },
    "mythrilSanctum": {
        rockHardness: 65,
        oreRichness: "Anomalous metal signatures",
        geologicalType: "Reality distortion detected",
        seismicActivity: "Dimensional instability",
        depthIndicator: "◈◈◈◈◈◈◇",
        gasPresence: "Temporal particles: ???"
    },
    "adamantiteAbyss": {
        rockHardness: 75,
        oreRichness: "Extreme density materials",
        geologicalType: "Gravitational anomalies",
        seismicActivity: "Catastrophic pressure zones",
        depthIndicator: "◈◈◈◈◈◈◈",
        gasPresence: "Void energy: CRITICAL"
    }
};

// Get server key from name
function getServerKey(serverName) {
    const nameToKey = {
        "Coal Mines": "coalMines",
        "Copper Quarry": "copperQuarry",
        "Topaz Mine": "topazMine",
        "Iron Stronghold": "ironStronghold",
        "Fossil Excavation": "fossilExcavation",
        "Diamond Mines": "diamondMines",
        "Emerald Caverns": "emeraldCaverns",
        "Ruby Depths": "rubyDepths",
        "Crystal Grottos": "crystalGrottos",
        "Obsidian Forge": "obsidianForge",
        "Mythril Sanctum": "mythrilSanctum",
        "Adamantite Abyss": "adamantiteAbyss"
    };
    
    const cleanName = serverName.replace(/⛏️|️/g, '').trim();
    return nameToKey[cleanName] || null;
}

// Technical hazard descriptions (less mystical, more industrial)
function getTechnicalHazards(dangerLevel) {
    const hazardCategories = {
        1: {
            structural: [
                { code: 'RKF-01', desc: 'Loose ceiling material', severity: 'LOW' },
                { code: 'GAS-01', desc: 'Minor gas accumulation', severity: 'LOW' }
            ],
            environmental: [
                { code: 'TMP-01', desc: 'Temperature variance +5°C', severity: 'LOW' }
            ],
            resources: [
                { code: 'RES-01', desc: 'Standard ore deposits', severity: 'BONUS' }
            ]
        },
        2: {
            structural: [
                { code: 'RKF-02', desc: 'Unstable rock formations', severity: 'MED' },
                { code: 'WTR-01', desc: 'Groundwater infiltration', severity: 'MED' }
            ],
            environmental: [
                { code: 'GAS-02', desc: 'Toxic gas concentration', severity: 'MED' },
                { code: 'TMP-02', desc: 'Temperature variance +15°C', severity: 'MED' }
            ],
            resources: [
                { code: 'RES-02', desc: 'Enhanced mineral density', severity: 'BONUS' }
            ]
        },
        3: {
            structural: [
                { code: 'COL-01', desc: 'Structural integrity failure', severity: 'HIGH' },
                { code: 'FSR-01', desc: 'Fissure network detected', severity: 'HIGH' }
            ],
            environmental: [
                { code: 'EXP-01', desc: 'Explosive gas pockets', severity: 'HIGH' },
                { code: 'ANM-01', desc: 'Spatial distortion zones', severity: 'HIGH' }
            ],
            resources: [
                { code: 'RES-03', desc: 'Rare element concentration', severity: 'BONUS' }
            ]
        },
        4: {
            structural: [
                { code: 'COL-02', desc: 'Cascading collapse zones', severity: 'SEVERE' },
                { code: 'TEC-01', desc: 'Tectonic shift activity', severity: 'SEVERE' }
            ],
            environmental: [
                { code: 'EXP-02', desc: 'Chain reaction volatiles', severity: 'SEVERE' },
                { code: 'BIO-01', desc: 'Hostile organisms detected', severity: 'SEVERE' }
            ],
            resources: [
                { code: 'RES-04', desc: 'Ancient cache located', severity: 'BONUS' }
            ]
        },
        5: {
            structural: [
                { code: 'COL-03', desc: 'Seismic cascade imminent', severity: 'CRITICAL' },
                { code: 'MAG-01', desc: 'Magnetic field anomalies', severity: 'CRITICAL' }
            ],
            environmental: [
                { code: 'RAD-01', desc: 'Radiation levels elevated', severity: 'CRITICAL' },
                { code: 'PSY-01', desc: 'Psychological hazard zones', severity: 'CRITICAL' },
                { code: 'TMP-03', desc: 'Extreme thermal variance', severity: 'CRITICAL' }
            ],
            resources: [
                { code: 'RES-05', desc: 'Legendary materials detected', severity: 'BONUS' }
            ]
        },
        6: {
            structural: [
                { code: 'DIM-01', desc: 'Dimensional rifts forming', severity: 'EXTREME' },
                { code: 'GRV-01', desc: 'Gravitational anomalies', severity: 'EXTREME' },
                { code: 'VOL-01', desc: 'Lava intrusion detected', severity: 'EXTREME' }
            ],
            environmental: [
                { code: 'TMP-04', desc: 'Plasma discharge zones', severity: 'EXTREME' },
                { code: 'CHR-01', desc: 'Temporal distortions', severity: 'EXTREME' },
                { code: 'VOI-01', desc: 'Reality breakdown sectors', severity: 'EXTREME' }
            ],
            resources: [
                { code: 'RES-06', desc: 'Divine artifact signatures', severity: 'BONUS' }
            ]
        },
        7: {
            structural: [
                { code: 'APO-01', desc: 'Total structural failure', severity: 'APOCALYPTIC' },
                { code: 'BLK-01', desc: 'Singularity formation', severity: 'APOCALYPTIC' },
                { code: 'OBL-01', desc: 'Matter dissolution zones', severity: 'APOCALYPTIC' }
            ],
            environmental: [
                { code: 'END-01', desc: 'Entropic cascade detected', severity: 'APOCALYPTIC' },
                { code: 'NUC-01', desc: 'Nuclear decay acceleration', severity: 'APOCALYPTIC' },
                { code: 'COS-01', desc: 'Cosmic horror emergence', severity: 'APOCALYPTIC' },
                { code: 'REA-01', desc: 'Reality coherence failure', severity: 'APOCALYPTIC' }
            ],
            resources: [
                { code: 'RES-07', desc: 'Impossible materials present', severity: 'BONUS' }
            ]
        }
    };
    
    const allHazards = [];
    for (let level = 1; level <= Math.min(dangerLevel, 7); level++) {
        if (hazardCategories[level]) {
            if (hazardCategories[level].structural) {
                allHazards.push(...hazardCategories[level].structural);
            }
            if (hazardCategories[level].environmental) {
                allHazards.push(...hazardCategories[level].environmental);
            }
            if (hazardCategories[level].resources) {
                allHazards.push(...hazardCategories[level].resources);
            }
        }
    }
    
    return allHazards;
}

// Calculate hazard frequency based on power level
function calculateHazardFrequency(powerLevel) {
    let baseChance = getHazardSpawnChance(powerLevel);
    
    // Exponential scaling for higher levels
    if (powerLevel >= 6) {
        baseChance *= 3;
    }
    if (powerLevel >= 7) {
        baseChance *= 5;
    }
    
    return {
        percentage: Math.round(baseChance * 100),
        frequency: getFrequencyDescription(baseChance),
        interval: getIntervalEstimate(baseChance)
    };
}

function getFrequencyDescription(chance) {
    if (chance >= 0.5) return "EXTREME - Multiple per sector";
    if (chance >= 0.3) return "HIGH - Every few sectors";
    if (chance >= 0.15) return "MODERATE - Periodic encounters";
    if (chance >= 0.08) return "LOW - Occasional anomalies";
    return "MINIMAL - Rare occurrences";
}

function getIntervalEstimate(chance) {
    const avgTilesPerHazard = Math.round(1 / chance);
    if (avgTilesPerHazard <= 2) return "1-2 tiles";
    if (avgTilesPerHazard <= 5) return "3-5 tiles";
    if (avgTilesPerHazard <= 10) return "6-10 tiles";
    if (avgTilesPerHazard <= 20) return "11-20 tiles";
    return "20+ tiles";
}

// Get threat assessment color
function getThreatColor(powerLevel) {
    if (powerLevel >= 7) return 0xFF0000; // Red
    if (powerLevel >= 6) return 0xFF4500; // Orange Red
    if (powerLevel >= 5) return 0xFF8C00; // Dark Orange
    if (powerLevel >= 4) return 0xFFD700; // Gold
    if (powerLevel >= 3) return 0xFFFF00; // Yellow
    if (powerLevel >= 2) return 0x9ACD32; // Yellow Green
    return 0x00FF00; // Green
}

// Main scanning function
async function performGeologicalScan(channel, dbEntry, powerLevel, serverName) {
    try {
        // Check if scan already performed
        if (dbEntry.gameData?.hazardRollDone) {
            return null;
        }
        
        const serverKey = getServerKey(serverName);
        const geologicalProfile = GEOLOGICAL_PROFILES[serverKey] || GEOLOGICAL_PROFILES.coalMines;
        const hazardFrequency = calculateHazardFrequency(powerLevel);
        const technicalHazards = getTechnicalHazards(powerLevel);
        
        // Generate scan ID
        const scanId = `SCAN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        
        // Create technical scan report
        const embed = new EmbedBuilder()
            .setTitle(`⚡ GEOLOGICAL SCAN REPORT - ${serverName}`)
            .setColor(getThreatColor(powerLevel))
            .setDescription(`\`\`\`Scan ID: ${scanId}\nDepth Level: ${powerLevel}\nTimestamp: ${new Date().toISOString()}\`\`\``)
            .setTimestamp();
        
        // Add geological data
        embed.addFields({
            name: '🪨 ROCK ANALYSIS',
            value: `\`\`\`Hardness: ${geologicalProfile.rockHardness}% reinforced\nType: ${geologicalProfile.geologicalType}\nIntegrity: ${100 - geologicalProfile.rockHardness}% standard\`\`\``,
            inline: true
        });
        
        // Add ore presence
        embed.addFields({
            name: '💎 ORE DETECTION',
            value: `\`\`\`${geologicalProfile.oreRichness}\nDistribution: ${hazardFrequency.interval}\nQuality: Level ${powerLevel} materials\`\`\``,
            inline: true
        });
        
        // Add environmental data
        embed.addFields({
            name: '🌡️ ENVIRONMENTAL',
            value: `\`\`\`${geologicalProfile.gasPresence}\n${geologicalProfile.seismicActivity}\nDepth: ${geologicalProfile.depthIndicator}\`\`\``,
            inline: true
        });
        
        // Add hazard frequency
        embed.addFields({
            name: '⚠️ ANOMALY FREQUENCY',
            value: `\`\`\`Probability: ${hazardFrequency.percentage}%\nDensity: ${hazardFrequency.frequency}\nExpected: ${hazardFrequency.interval} between events\`\`\``,
            inline: false
        });
        
        // Group hazards by category
        const structuralHazards = technicalHazards.filter(h => h.code.match(/RKF|COL|FSR|TEC|MAG|DIM|GRV|VOL|APO|BLK|OBL/));
        const environmentalHazards = technicalHazards.filter(h => h.code.match(/GAS|TMP|EXP|ANM|BIO|RAD|PSY|CHR|VOI|END|NUC|COS|REA|WTR/));
        const resourceBonuses = technicalHazards.filter(h => h.code.match(/RES/));
        
        // Add hazard listings
        if (structuralHazards.length > 0) {
            const structList = structuralHazards
                .map(h => `[${h.code}] ${h.desc} (${h.severity})`)
                .join('\n');
            embed.addFields({
                name: '🏗️ STRUCTURAL HAZARDS',
                value: `\`\`\`${structList.substring(0, 1000)}\`\`\``,
                inline: false
            });
        }
        
        if (environmentalHazards.length > 0) {
            const envList = environmentalHazards
                .map(h => `[${h.code}] ${h.desc} (${h.severity})`)
                .join('\n');
            embed.addFields({
                name: '☢️ ENVIRONMENTAL HAZARDS',
                value: `\`\`\`${envList.substring(0, 1000)}\`\`\``,
                inline: false
            });
        }
        
        if (resourceBonuses.length > 0) {
            const resList = resourceBonuses
                .map(h => `[${h.code}] ${h.desc}`)
                .join('\n');
            embed.addFields({
                name: '📦 RESOURCE OPPORTUNITIES',
                value: `\`\`\`${resList.substring(0, 1000)}\`\`\``,
                inline: false
            });
        }
        
        // Add warning level
        let warningMessage = '';
        if (powerLevel >= 7) {
            warningMessage = '⛔ **CRITICAL WARNING**: Environmental conditions exceed safety parameters. Extreme caution required.';
        } else if (powerLevel >= 6) {
            warningMessage = '⚠️ **SEVERE WARNING**: Multiple catastrophic hazards detected. Proceed with maximum caution.';
        } else if (powerLevel >= 5) {
            warningMessage = '⚠️ **HIGH ALERT**: Dangerous anomalies present. Enhanced safety protocols recommended.';
        } else if (powerLevel >= 3) {
            warningMessage = '⚠️ **CAUTION**: Unstable conditions detected. Standard safety measures advised.';
        } else {
            warningMessage = 'ℹ️ **NOTICE**: Minor anomalies detected. Routine safety procedures sufficient.';
        }
        
        embed.addFields({
            name: '📊 THREAT ASSESSMENT',
            value: warningMessage,
            inline: false
        });
        
        // Get member list
        const members = channel.members.filter(m => !m.user.bot);
        const minerList = Array.from(members.values()).map(m => m.displayName).join(', ');
        
        embed.setFooter({
            text: `Active Miners: ${minerList}`
        });
        
        // Store scan data
        const hazardSeed = Date.now() + Math.floor(Math.random() * 1000000);
        await require('../../../../models/activevcs').updateOne(
            { channelId: channel.id },
            {
                $set: {
                    'gameData.hazardRollDone': true,
                    'gameData.dangerLevel': powerLevel,
                    'gameData.hazardSeed': hazardSeed,
                    'gameData.geologicalProfile': geologicalProfile,
                    'gameData.scanId': scanId
                }
            }
        );
        
        // Send the scan report
        await channel.send({ embeds: [embed] });
        
        console.log(`[HAZARD SCAN] Geological scan completed for ${channel.id}: Level ${powerLevel}, Scan ${scanId}`);
        
        return {
            embed,
            scanId,
            hazardSeed,
            geologicalProfile
        };
        
    } catch (error) {
        console.error('[HAZARD SCAN] Error performing geological scan:', error);
        return null;
    }
}

// Export functions
module.exports = {
    performGeologicalScan,
    getTechnicalHazards,
    calculateHazardFrequency,
    getServerKey,
    GEOLOGICAL_PROFILES
};

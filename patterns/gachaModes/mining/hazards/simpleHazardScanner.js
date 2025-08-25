// simpleHazardScanner.js - Simplified hazard detection that shows what's actually spawning
const { EmbedBuilder } = require('discord.js');

// Define the actual hazard types that exist in the game
const HAZARD_TYPES = {
    PORTAL_TRAP: 'portal_trap',
    BOMB_TRAP: 'bomb_trap',
    GREEN_FOG: 'green_fog',
    WALL_TRAP: 'wall_trap',
    FIRE_BLAST: 'fire_blast'
};

// Human-readable hazard info
const HAZARD_INFO = {
    [HAZARD_TYPES.PORTAL_TRAP]: {
        name: '🌀 Portal Trap',
        emoji: '🌀',
        description: 'Teleports players randomly',
        color: 0x9B59B6
    },
    [HAZARD_TYPES.BOMB_TRAP]: {
        name: '💣 Bomb Trap',
        emoji: '💣',
        description: 'Explodes and knocks out players',
        color: 0xFF6B6B
    },
    [HAZARD_TYPES.GREEN_FOG]: {
        name: '☠️ Toxic Fog',
        emoji: '☠️',
        description: 'Damages equipment durability',
        color: 0x27AE60
    },
    [HAZARD_TYPES.WALL_TRAP]: {
        name: '🧱 Wall Trap',
        emoji: '🧱',
        description: 'Creates walls around players',
        color: 0x95A5A6
    },
    [HAZARD_TYPES.FIRE_BLAST]: {
        name: '🔥 Fire Blast',
        emoji: '🔥',
        description: 'Burns minecart items',
        color: 0xE74C3C
    }
};

/**
 * Scan the current map for active hazards
 * @param {Object} hazardsData - The hazards data from hazardStorage
 * @returns {Object} Summary of active hazards
 */
function scanActiveHazards(hazardsData) {
    const hazardCounts = {};
    const hazardLocations = {};
    let totalHazards = 0;
    let triggeredCount = 0;
    
    // Initialize counts
    for (const type of Object.values(HAZARD_TYPES)) {
        hazardCounts[type] = 0;
        hazardLocations[type] = [];
    }
    
    // Count hazards from the hazards Map
    if (hazardsData && hazardsData.hazards && hazardsData.hazards.size > 0) {
        for (const [key, hazard] of hazardsData.hazards) {
            if (hazard && hazard.type) {
                totalHazards++;
                
                // Count by type
                if (hazardCounts[hazard.type] !== undefined) {
                    hazardCounts[hazard.type]++;
                    
                    // Extract position from key (format: "x,y")
                    const [x, y] = key.split(',').map(Number);
                    hazardLocations[hazard.type].push({ x, y, triggered: hazard.triggered });
                    
                    if (hazard.triggered) {
                        triggeredCount++;
                    }
                }
            }
        }
    }
    
    return {
        total: totalHazards,
        active: totalHazards - triggeredCount,
        triggered: triggeredCount,
        counts: hazardCounts,
        locations: hazardLocations
    };
}

/**
 * Get hazards allowed for a specific mine
 * @param {string|number} mineTypeId - The mine type ID
 * @returns {Array} List of allowed hazard types
 */
function getAllowedHazards(mineTypeId) {
    // Import the actual server data
    const gachaServers = require('../../../../data/gachaServers.json');
    
    // Find the mine configuration
    const mineConfig = gachaServers.find(server => 
        String(server.id) === String(mineTypeId)
    );
    
    if (!mineConfig || !mineConfig.hazardConfig) {
        // Default: allow basic hazards
        return [HAZARD_TYPES.BOMB_TRAP];
    }
    
    const allowedTypes = mineConfig.hazardConfig.allowedTypes || [];
    
    // Map the allowed types to our HAZARD_TYPES constants
    const mappedTypes = [];
    for (const type of allowedTypes) {
        switch(type) {
            case 'portal_trap':
                mappedTypes.push(HAZARD_TYPES.PORTAL_TRAP);
                break;
            case 'bomb_trap':
                mappedTypes.push(HAZARD_TYPES.BOMB_TRAP);
                break;
            case 'green_fog':
                mappedTypes.push(HAZARD_TYPES.GREEN_FOG);
                break;
            case 'wall_trap':
                mappedTypes.push(HAZARD_TYPES.WALL_TRAP);
                break;
            case 'fire_blast':
                mappedTypes.push(HAZARD_TYPES.FIRE_BLAST);
                break;
        }
    }
    
    return mappedTypes;
}

/**
 * Simple hazard scan - shows what's actually on the map
 * @param {Object} channel - Discord channel
 * @param {Object} hazardsData - Current hazards data
 * @param {number} powerLevel - Server power level
 * @param {string} serverName - Name of the server/mine
 * @param {string|number} mineTypeId - Mine type ID
 * @returns {Object} Embed and scan data
 */
async function performSimpleHazardScan(channel, hazardsData, powerLevel, serverName, mineTypeId) {
    try {
        // Scan current hazards
        const scanResult = scanActiveHazards(hazardsData);
        
        // Get allowed hazards for this mine
        const allowedHazards = getAllowedHazards(mineTypeId);
        
        // Determine embed color based on danger level
        let embedColor = 0x00FF00; // Green - safe
        if (scanResult.active > 20) embedColor = 0xFF0000; // Red - very dangerous
        else if (scanResult.active > 10) embedColor = 0xFF8C00; // Orange - dangerous
        else if (scanResult.active > 5) embedColor = 0xFFFF00; // Yellow - caution
        
        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(`⚠️ HAZARD SCAN - ${serverName}`)
            .setColor(embedColor)
            .setDescription(`**Active Hazards:** ${scanResult.active} / ${scanResult.total} total`)
            .setTimestamp();
        
        // Add active hazard types
        const activeTypes = [];
        for (const [type, count] of Object.entries(scanResult.counts)) {
            if (count > 0) {
                const info = HAZARD_INFO[type];
                activeTypes.push(`${info.emoji} **${info.name}**: ${count} active`);
            }
        }
        
        if (activeTypes.length > 0) {
            embed.addFields({
                name: '🎯 Detected Hazard Types',
                value: activeTypes.join('\n'),
                inline: false
            });
        } else {
            embed.addFields({
                name: '✅ Status',
                value: 'No hazards currently active on the map',
                inline: false
            });
        }
        
        // Add mine configuration info
        const allowedInfo = [];
        for (const type of allowedHazards) {
            const info = HAZARD_INFO[type];
            if (info) {
                allowedInfo.push(`${info.emoji} ${info.name}`);
            }
        }
        
        if (allowedInfo.length > 0) {
            embed.addFields({
                name: '📋 This Mine Can Spawn',
                value: allowedInfo.join('\n'),
                inline: true
            });
        }
        
        // Add power level info
        embed.addFields({
            name: '⚡ Danger Level',
            value: `Power Level ${powerLevel}\nSpawn Rate: ${getSpawnRateDescription(powerLevel)}`,
            inline: true
        });
        
        // Add a summary footer
        if (scanResult.active > 0) {
            embed.setFooter({
                text: `${scanResult.triggered} hazards already triggered this session`
            });
        }
        
        // Send the scan
        await channel.send({ embeds: [embed] });
        
        // Log for debugging
        console.log(`[HAZARD SCAN] Simple scan completed for ${channel.id}:`);
        console.log(`  - Total hazards: ${scanResult.total}`);
        console.log(`  - Active: ${scanResult.active}`);
        console.log(`  - Types:`, Object.entries(scanResult.counts)
            .filter(([_, count]) => count > 0)
            .map(([type, count]) => `${type}(${count})`)
            .join(', '));
        
        return {
            embed,
            scanResult,
            allowedHazards
        };
        
    } catch (error) {
        console.error('[HAZARD SCAN] Error performing simple scan:', error);
        return null;
    }
}

/**
 * Get spawn rate description for power level
 */
function getSpawnRateDescription(powerLevel) {
    if (powerLevel >= 7) return 'Extreme (40%+ chance)';
    if (powerLevel >= 6) return 'Very High (30%+ chance)';
    if (powerLevel >= 5) return 'High (20%+ chance)';
    if (powerLevel >= 4) return 'Moderate (15%+ chance)';
    if (powerLevel >= 3) return 'Low (10%+ chance)';
    if (powerLevel >= 2) return 'Minimal (5%+ chance)';
    return 'Very Low (1-2% chance)';
}

/**
 * Quick hazard check - for debugging
 * @param {Object} hazardsData - Hazards data
 * @returns {string} Quick summary string
 */
function getQuickHazardSummary(hazardsData) {
    const scan = scanActiveHazards(hazardsData);
    
    if (scan.total === 0) {
        return 'No hazards on map';
    }
    
    const types = [];
    for (const [type, count] of Object.entries(scan.counts)) {
        if (count > 0) {
            const info = HAZARD_INFO[type];
            types.push(`${info.emoji}×${count}`);
        }
    }
    
    return `Hazards: ${scan.active}/${scan.total} active (${types.join(' ')})`;
}

/**
 * Check if a specific position has a hazard
 * @param {Object} hazardsData - Hazards data
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Object|null} Hazard at position or null
 */
function getHazardAtPosition(hazardsData, x, y) {
    if (!hazardsData || !hazardsData.hazards) return null;
    
    const key = `${x},${y}`;
    const hazard = hazardsData.hazards.get(key);
    
    if (hazard) {
        const info = HAZARD_INFO[hazard.type];
        return {
            ...hazard,
            info: info || { name: 'Unknown Hazard', emoji: '❓' }
        };
    }
    
    return null;
}

/**
 * Get distribution of hazards across the map
 * @param {Object} hazardsData - Hazards data
 * @param {Object} mapData - Map data for dimensions
 * @returns {Object} Distribution info
 */
function getHazardDistribution(hazardsData, mapData) {
    if (!hazardsData || !mapData) return null;
    
    const scan = scanActiveHazards(hazardsData);
    const mapArea = mapData.width * mapData.height;
    const coverage = (scan.total / mapArea * 100).toFixed(1);
    
    // Find clusters (hazards near each other)
    const clusters = [];
    const processed = new Set();
    
    for (const [key, hazard] of hazardsData.hazards || new Map()) {
        if (processed.has(key)) continue;
        
        const [x, y] = key.split(',').map(Number);
        const cluster = { center: { x, y }, hazards: 1, types: new Set([hazard.type]) };
        processed.add(key);
        
        // Check adjacent tiles
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const adjacentKey = `${x + dx},${y + dy}`;
                
                if (hazardsData.hazards.has(adjacentKey) && !processed.has(adjacentKey)) {
                    const adjacentHazard = hazardsData.hazards.get(adjacentKey);
                    cluster.hazards++;
                    cluster.types.add(adjacentHazard.type);
                    processed.add(adjacentKey);
                }
            }
        }
        
        if (cluster.hazards > 1) {
            clusters.push(cluster);
        }
    }
    
    return {
        coverage: `${coverage}%`,
        density: scan.total > 0 ? (mapArea / scan.total).toFixed(1) : 'N/A',
        clusters: clusters.length,
        largestCluster: clusters.length > 0 ? Math.max(...clusters.map(c => c.hazards)) : 0
    };
}

// Export all functions
module.exports = {
    HAZARD_TYPES,
    HAZARD_INFO,
    scanActiveHazards,
    getAllowedHazards,
    performSimpleHazardScan,
    getQuickHazardSummary,
    getHazardAtPosition,
    getHazardDistribution
};
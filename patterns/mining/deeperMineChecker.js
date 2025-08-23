// patterns/mining/deeperMineChecker.js
// Module to check if conditions are met for accessing deeper mine levels

const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Load gacha servers data
const gachaServersPath = path.join(__dirname, '../../data/gachaServers.json');
let gachaServers = null;

// Reload gacha servers data
function reloadGachaServers() {
    try {
        delete require.cache[require.resolve(gachaServersPath)];
        gachaServers = require(gachaServersPath);
        return gachaServers;
    } catch (error) {
        console.error('[DEEPER_MINE] Error loading gachaServers.json:', error);
        return null;
    }
}

// Initialize on first load
reloadGachaServers();

/**
 * Check if the mine has deeper level conditions defined
 * @param {number|string} mineTypeId - The ID of the current mine type
 * @returns {Object|null} - The mine configuration or null if not found
 */
function getMineConfig(mineTypeId) {
    if (!gachaServers) reloadGachaServers();
    
    const mine = gachaServers.find(s => s.id == mineTypeId);
    if (!mine || !mine.nextLevelConditionType || !mine.conditionCost) {
        return null;
    }
    
    return mine;
}

/**
 * Check if deeper mine conditions are met
 * @param {Object} dbEntry - The database entry for the channel
 * @param {Object} mineConfig - The mine configuration
 * @returns {boolean} - Whether conditions are met
 */
function checkConditions(dbEntry, mineConfig) {
    if (!dbEntry.gameData) return false;
    
    const stats = dbEntry.gameData.miningStats || {};
    const conditionType = mineConfig.nextLevelConditionType;
    const conditionCost = mineConfig.conditionCost;
    
    switch (conditionType) {
        case 'wallsBroken':
            return (stats.totalWallsBroken || 0) >= conditionCost;
            
        case 'oresFound':
            return (stats.totalOresFound || 0) >= conditionCost;
            
        case 'treasuresFound':
            return (stats.totalTreasuresFound || 0) >= conditionCost;
            
        case 'totalValue':
            return (stats.totalValueMined || 0) >= conditionCost;
            
        case 'rareOresFound':
            // Count rare, epic, and legendary ores
            return ((stats.rareOresFound || 0) + 
                    (stats.epicOresFound || 0) + 
                    (stats.legendaryOresFound || 0)) >= conditionCost;
            
        case 'fossilsFound':
            // Track fossils specifically (would need to be implemented in main mining)
            return (stats.fossilsFound || 0) >= conditionCost;
            
        default:
            console.warn(`[DEEPER_MINE] Unknown condition type: ${conditionType}`);
            return false;
    }
}

/**
 * Get progress towards deeper mine
 * @param {Object} dbEntry - The database entry
 * @param {Object} mineConfig - The mine configuration
 * @returns {Object} - Progress information
 */
function getProgress(dbEntry, mineConfig) {
    if (!dbEntry.gameData) return { current: 0, required: 0, percentage: 0 };
    
    const stats = dbEntry.gameData.miningStats || {};
    const conditionType = mineConfig.nextLevelConditionType;
    const conditionCost = mineConfig.conditionCost;
    
    let current = 0;
    
    switch (conditionType) {
        case 'wallsBroken':
            current = stats.totalWallsBroken || 0;
            break;
        case 'oresFound':
            current = stats.totalOresFound || 0;
            break;
        case 'treasuresFound':
            current = stats.totalTreasuresFound || 0;
            break;
        case 'totalValue':
            current = stats.totalValueMined || 0;
            break;
        case 'rareOresFound':
            current = (stats.rareOresFound || 0) + 
                     (stats.epicOresFound || 0) + 
                     (stats.legendaryOresFound || 0);
            break;
        case 'fossilsFound':
            current = stats.fossilsFound || 0;
            break;
    }
    
    return {
        current: current,
        required: conditionCost,
        percentage: Math.min(100, Math.floor((current / conditionCost) * 100))
    };
}

/**
 * Create the "Dig Deeper" button for the embed
 * @param {string} channelId - The channel ID
 * @param {string} gachaServerId - The gacha server type ID
 * @param {boolean} enabled - Whether the button should be enabled
 * @returns {ActionRowBuilder} - The action row with the button
 */
function createDigDeeperButton(channelId, gachaServerId, enabled = true) {
    const button = new ButtonBuilder()
        .setCustomId(`dig_deeper_${channelId}_${gachaServerId}`)
        .setLabel('⛏️ Dig Deeper')
        .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!enabled);
    
    return new ActionRowBuilder().addComponents(button);
}

/**
 * Get condition description for display
 * @param {Object} mineConfig - The mine configuration
 * @returns {string} - Human-readable condition description
 */
function getConditionDescription(mineConfig) {
    const conditionType = mineConfig.nextLevelConditionType;
    const conditionCost = mineConfig.conditionCost;
    
    switch (conditionType) {
        case 'wallsBroken':
            return `Break ${conditionCost} walls`;
        case 'oresFound':
            return `Find ${conditionCost} ores`;
        case 'treasuresFound':
            return `Discover ${conditionCost} treasures`;
        case 'totalValue':
            return `Mine ${conditionCost} coins worth of materials`;
        case 'rareOresFound':
            return `Find ${conditionCost} rare or better ores`;
        case 'fossilsFound':
            return `Excavate ${conditionCost} fossils`;
        default:
            return `Complete mining objectives`;
    }
}

/**
 * Check and add deeper mine button to embed if conditions allow
 * @param {Object} embed - The Discord embed to modify
 * @param {Object} dbEntry - The database entry
 * @param {string} channelId - The channel ID
 * @returns {Object} - Object containing embed and components
 */
async function checkAndAddDeeperMineButton(embed, dbEntry, channelId) {
    try {
        // Get the mine type from the database
        const mineTypeId = dbEntry.typeId;
        if (!mineTypeId) {
            return { embed, components: [] };
        }
        
        // Get mine configuration
        const mineConfig = getMineConfig(mineTypeId);
        if (!mineConfig) {
            return { embed, components: [] };
        }
        
        // Check if already in a deeper mine
        if (mineConfig.isDeeper) {
            return { embed, components: [] };
        }
        
        // Check if conditions are met
        const conditionsMet = checkConditions(dbEntry, mineConfig);
        const progress = getProgress(dbEntry, mineConfig);
        
        // Add progress field to embed
        const progressBar = createProgressBar(progress.percentage);
        const conditionDesc = getConditionDescription(mineConfig);
        
        embed.addFields({
            name: '🔓 Deeper Level Progress',
            value: `${conditionDesc}\n${progressBar} ${progress.current}/${progress.required} (${progress.percentage}%)`,
            inline: false
        });
        
        // Create button (enabled only if conditions are met)
        if (conditionsMet) {
            const buttonRow = createDigDeeperButton(channelId, mineTypeId, true);
            embed.addFields({
                name: '✅ Deeper Level Available!',
                value: `You've unlocked access to the deeper section of this mine! Click "Dig Deeper" to explore.`,
                inline: false
            });
            return { embed, components: [buttonRow] };
        }
        
        return { embed, components: [] };
        
    } catch (error) {
        console.error('[DEEPER_MINE] Error checking conditions:', error);
        return { embed, components: [] };
    }
}

/**
 * Create a visual progress bar
 * @param {number} percentage - Progress percentage (0-100)
 * @returns {string} - Progress bar string
 */
function createProgressBar(percentage) {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Initialize mining stats if they don't exist
 * @param {Object} dbEntry - The database entry to initialize
 */
function initializeMiningStats(dbEntry) {
    if (!dbEntry.gameData) {
        dbEntry.gameData = {};
    }
    
    if (!dbEntry.gameData.miningStats) {
        dbEntry.gameData.miningStats = {
            totalWallsBroken: 0,
            totalOresFound: 0,
            totalTreasuresFound: 0,
            totalValueMined: 0,
            rareOresFound: 0,
            epicOresFound: 0,
            legendaryOresFound: 0,
            fossilsFound: 0,
            startTime: Date.now()
        };
    }
}

/**
 * Update mining statistics
 * @param {Object} dbEntry - The database entry
 * @param {string} statType - The type of stat to update
 * @param {number} amount - The amount to add
 */
function updateMiningStats(dbEntry, statType, amount = 1) {
    initializeMiningStats(dbEntry);
    
    const stats = dbEntry.gameData.miningStats;
    
    switch (statType) {
        case 'wallsBroken':
            stats.totalWallsBroken = (stats.totalWallsBroken || 0) + amount;
            break;
        case 'oresFound':
            stats.totalOresFound = (stats.totalOresFound || 0) + amount;
            break;
        case 'treasuresFound':
            stats.totalTreasuresFound = (stats.totalTreasuresFound || 0) + amount;
            break;
        case 'totalValue':
            stats.totalValueMined = (stats.totalValueMined || 0) + amount;
            break;
        case 'rareOre':
            stats.rareOresFound = (stats.rareOresFound || 0) + amount;
            stats.totalOresFound = (stats.totalOresFound || 0) + amount;
            break;
        case 'epicOre':
            stats.epicOresFound = (stats.epicOresFound || 0) + amount;
            stats.totalOresFound = (stats.totalOresFound || 0) + amount;
            break;
        case 'legendaryOre':
            stats.legendaryOresFound = (stats.legendaryOresFound || 0) + amount;
            stats.totalOresFound = (stats.totalOresFound || 0) + amount;
            break;
        case 'fossil':
            stats.fossilsFound = (stats.fossilsFound || 0) + amount;
            break;
    }
    
    // Mark as modified for mongoose
    if (dbEntry.markModified) {
        dbEntry.markModified('gameData.miningStats');
    }
}

module.exports = {
    getMineConfig,
    checkConditions,
    getProgress,
    createDigDeeperButton,
    getConditionDescription,
    checkAndAddDeeperMineButton,
    initializeMiningStats,
    updateMiningStats,
    createProgressBar,
    reloadGachaServers
};
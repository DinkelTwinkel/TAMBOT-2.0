// patterns/mining/deeperMineChecker.js
// Module to check if conditions are met for accessing deeper mine levels
// UPDATED TO USE EXISTING STAT TRACKING

const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const gachaVC = require('../../models/activevcs');

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
    console.log('[DEBUG-DEEPER] getMineConfig called with mineTypeId:', mineTypeId);
    
    if (!gachaServers) {
        console.log('[DEBUG-DEEPER] gachaServers not loaded, reloading...');
        reloadGachaServers();
    }
    
    console.log('[DEBUG-DEEPER] Total gacha servers loaded:', gachaServers ? gachaServers.length : 0);
    
    const mine = gachaServers.find(s => s.id == mineTypeId);
    
    if (!mine) {
        console.log('[DEBUG-DEEPER] No mine found with ID:', mineTypeId);
        console.log('[DEBUG-DEEPER] Available mine IDs:', gachaServers.map(s => s.id));
        return null;
    }
    
    console.log('[DEBUG-DEEPER] Mine found:', mine.name);
    console.log('[DEBUG-DEEPER] Mine has nextLevelConditionType:', mine.nextLevelConditionType);
    console.log('[DEBUG-DEEPER] Mine has conditionCost:', mine.conditionCost);
    
    if (!mine.nextLevelConditionType || !mine.conditionCost) {
        console.log('[DEBUG-DEEPER] Mine missing required deeper level config');
        return null;
    }
    
    return mine;
}

/**
 * Calculate total value in minecart
 * @param {Object} minecart - The minecart object with items
 * @returns {number} - Total value of all items
 */
function calculateMinecartValue(minecart) {
    console.log('[DEBUG-DEEPER] calculateMinecartValue called');
    
    if (!minecart || !minecart.items) {
        console.log('[DEBUG-DEEPER] No minecart or items found');
        return 0;
    }
    
    console.log('[DEBUG-DEEPER] Minecart has items:', Object.keys(minecart.items).length);
    
    // Import item pools to get values
    const { miningItemPool, treasureItems } = require('../gachaModes/mining/miningConstants_unified');
    
    let totalValue = 0;
    let itemCount = 0;
    
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        if (!itemData || itemData.quantity <= 0) continue;
        
        // Find item in pools to get its value
        const poolItem = miningItemPool.find(item => item.itemId === itemId) || 
                        treasureItems.find(item => item.itemId === itemId);
        
        if (poolItem) {
            const itemValue = poolItem.value * itemData.quantity;
            totalValue += itemValue;
            itemCount++;
            console.log(`[DEBUG-DEEPER] Item ${itemId}: ${itemData.quantity} x ${poolItem.value} = ${itemValue}`);
        }
    }
    
    console.log(`[DEBUG-DEEPER] Total value calculated: ${totalValue} from ${itemCount} item types`);
    return totalValue;
}

/**
 * Count rare or better ores in minecart
 * @param {Object} minecart - The minecart object
 * @returns {number} - Count of rare+ ores
 */
function countRareOres(minecart) {
    console.log('[DEBUG-DEEPER] countRareOres called');
    
    if (!minecart || !minecart.items) {
        console.log('[DEBUG-DEEPER] No minecart or items for rare ore count');
        return 0;
    }
    
    const { miningItemPool } = require('./miningConstants_unified');
    
    let rareCount = 0;
    let itemsChecked = 0;
    
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        if (!itemData || itemData.quantity <= 0) continue;
        
        itemsChecked++;
        const poolItem = miningItemPool.find(item => item.itemId === itemId);
        
        if (poolItem && (poolItem.tier === 'rare' || poolItem.tier === 'epic' || 
            poolItem.tier === 'legendary' || poolItem.tier === 'unique' || 
            poolItem.tier === 'mythic')) {
            console.log(`[DEBUG-DEEPER] Found rare+ item: ${itemId} (${poolItem.tier}) x${itemData.quantity}`);
            rareCount += itemData.quantity;
        }
    }
    
    console.log(`[DEBUG-DEEPER] Rare ore count: ${rareCount} from ${itemsChecked} item types`);
    return rareCount;
}

/**
 * Count fossils in minecart
 * @param {Object} minecart - The minecart object
 * @returns {number} - Count of fossils
 */
function countFossils(minecart) {
    console.log('[DEBUG-DEEPER] countFossils called');
    
    if (!minecart || !minecart.items) {
        console.log('[DEBUG-DEEPER] No minecart or items for fossil count');
        return 0;
    }
    
    const { miningItemPool } = require('./miningConstants_unified');
    
    let fossilCount = 0;
    let itemsChecked = 0;
    
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        if (!itemData || itemData.quantity <= 0) continue;
        
        itemsChecked++;
        const poolItem = miningItemPool.find(item => item.itemId === itemId);
        
        // Check if item name contains 'fossil' (case insensitive)
        if (poolItem && poolItem.name && poolItem.name.toLowerCase().includes('fossil')) {
            console.log(`[DEBUG-DEEPER] Found fossil: ${poolItem.name} x${itemData.quantity}`);
            fossilCount += itemData.quantity;
        }
    }
    
    console.log(`[DEBUG-DEEPER] Fossil count: ${fossilCount} from ${itemsChecked} item types`);
    return fossilCount;
}

/**
 * Check if deeper mine conditions are met using existing stats
 * @param {Object} dbEntry - The database entry for the channel
 * @param {Object} mineConfig - The mine configuration
 * @returns {boolean} - Whether conditions are met
 */
function checkConditions(dbEntry, mineConfig) {
    console.log('[DEBUG-DEEPER] checkConditions called');
    
    if (!dbEntry.gameData) {
        console.log('[DEBUG-DEEPER] No gameData in dbEntry');
        return false;
    }
    
    // Use the existing stats from gameData.stats
    const stats = dbEntry.gameData.stats || {};
    const minecart = dbEntry.gameData.minecart || {};
    const conditionType = mineConfig.nextLevelConditionType;
    const conditionCost = mineConfig.conditionCost;
    
    console.log('[DEBUG-DEEPER] Checking condition type:', conditionType);
    console.log('[DEBUG-DEEPER] Required cost:', conditionCost);
    console.log('[DEBUG-DEEPER] Current stats:', stats);
    
    switch (conditionType) {
        case 'wallsBroken':
            console.log(`[DEBUG-DEEPER] Walls broken: ${stats.wallsBroken || 0} / ${conditionCost}`);
            return (stats.wallsBroken || 0) >= conditionCost;
            
        case 'oresFound':
            console.log(`[DEBUG-DEEPER] Ores found: ${stats.totalOreFound || 0} / ${conditionCost}`);
            return (stats.totalOreFound || 0) >= conditionCost;
            
        case 'treasuresFound':
            console.log(`[DEBUG-DEEPER] Treasures found: ${stats.treasuresFound || 0} / ${conditionCost}`);
            return (stats.treasuresFound || 0) >= conditionCost;
            
        case 'totalValue':
            // Calculate current minecart value
            const currentValue = calculateMinecartValue(minecart);
            console.log(`[DEBUG-DEEPER] Total value: ${currentValue} / ${conditionCost}`);
            return currentValue >= conditionCost;
            
        case 'rareOresFound':
            // Count rare, epic, and legendary ores in minecart
            const rareCount = countRareOres(minecart);
            console.log(`[DEBUG-DEEPER] Rare ores: ${rareCount} / ${conditionCost}`);
            return rareCount >= conditionCost;
            
        case 'fossilsFound':
            // Count fossils in minecart
            const fossilCount = countFossils(minecart);
            console.log(`[DEBUG-DEEPER] Fossils: ${fossilCount} / ${conditionCost}`);
            return fossilCount >= conditionCost;
            
        default:
            console.warn(`[DEEPER_MINE] Unknown condition type: ${conditionType}`);
            return false;
    }
}

/**
 * Get progress towards deeper mine using existing stats
 * @param {Object} dbEntry - The database entry
 * @param {Object} mineConfig - The mine configuration
 * @returns {Object} - Progress information
 */
function getProgress(dbEntry, mineConfig) {
    console.log('[DEBUG-DEEPER] getProgress called');
    
    if (!dbEntry.gameData) {
        console.log('[DEBUG-DEEPER] No gameData in dbEntry for progress');
        return { current: 0, required: 0, percentage: 0 };
    }
    
    const stats = dbEntry.gameData.stats || {};
    const minecart = dbEntry.gameData.minecart || {};
    const conditionType = mineConfig.nextLevelConditionType;
    const conditionCost = mineConfig.conditionCost;
    
    let current = 0;
    
    switch (conditionType) {
        case 'wallsBroken':
            current = stats.wallsBroken || 0;
            break;
        case 'oresFound':
            current = stats.totalOreFound || 0;
            break;
        case 'treasuresFound':
            current = stats.treasuresFound || 0;
            break;
        case 'totalValue':
            current = calculateMinecartValue(minecart);
            break;
        case 'rareOresFound':
            current = countRareOres(minecart);
            break;
        case 'fossilsFound':
            current = countFossils(minecart);
            break;
    }
    
    const result = {
        current: current,
        required: conditionCost,
        percentage: Math.min(100, Math.floor((current / conditionCost) * 100))
    };
    
    console.log('[DEBUG-DEEPER] Progress calculated:', result);
    return result;
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
    console.log('[DEBUG-DEEPER] ====== START checkAndAddDeeperMineButton ======');
    console.log('[DEBUG-DEEPER] Channel ID:', channelId);
    console.log('[DEBUG-DEEPER] Embed received:', embed ? 'Yes' : 'No');
    console.log('[DEBUG-DEEPER] dbEntry received:', dbEntry ? 'Yes' : 'No');

    const result = await gachaVC.findOne({ channelId: channelId}).lean();
    
    try {
        // Get the mine type from the database
        const mineTypeId = result.typeId;
        console.log('[DEBUG-DEEPER] Mine type ID from dbEntry:', mineTypeId);
        console.log('[DEBUG-DEEPER] dbEntry structure:', {
            hasGameData: !!dbEntry.gameData,
            hasStats: !!dbEntry.gameData?.stats,
            hasMinecart: !!dbEntry.gameData?.minecart,
            typeId: dbEntry.typeId
        });
        
        if (!mineTypeId) {
            console.log('[DEBUG-DEEPER] ERROR: No typeId found in database entry for channel:', channelId);
            console.log('[DEBUG-DEEPER] Full dbEntry keys:', Object.keys(dbEntry));
            // Try to add a generic progress message
            embed.addFields({
                name: '🔓 Deeper Level Progress',
                value: '⚠️ Mine type not detected. Unable to track progress.',
                inline: false
            });
            return { embed, components: [] };
        }
        
        // Get mine configuration
        console.log('[DEBUG-DEEPER] Getting mine configuration for typeId:', mineTypeId);
        const mineConfig = getMineConfig(mineTypeId);
        
        if (!mineConfig) {
            console.log('[DEBUG-DEEPER] WARNING: No deeper level config for mine type:', mineTypeId);
            // Show that this mine doesn't have deeper levels
            embed.addFields({
                name: '🔓 Deeper Level Progress',
                value: 'This mine type does not have deeper levels available.',
                inline: false
            });
            return { embed, components: [] };
        }
        
        // Check if already in a deeper mine
        console.log('[DEBUG-DEEPER] Checking if already in deeper mine. isDeeper:', mineConfig.isDeeper);
        
        if (mineConfig.isDeeper) {
            console.log('[DEBUG-DEEPER] Already in deeper mine, adding field to embed');
            embed.addFields({
                name: '🔓 Deeper Level',
                value: '✅ You are already in the deeper section of this mine!',
                inline: false
            });
            return { embed, components: [] };
        }
        
        // Check if conditions are met
        console.log('[DEBUG-DEEPER] Starting condition check...');
        const conditionsMet = checkConditions(dbEntry, mineConfig);
        console.log('[DEBUG-DEEPER] Conditions met result:', conditionsMet);
        
        console.log('[DEBUG-DEEPER] Getting progress...');
        const progress = getProgress(dbEntry, mineConfig);
        console.log('[DEBUG-DEEPER] Progress result:', progress);
        
        // Debug logging
        console.log(`[DEBUG-DEEPER] SUMMARY - Progress check for channel ${channelId}:`, {
            mineType: mineConfig.name,
            conditionType: mineConfig.nextLevelConditionType,
            current: progress.current,
            required: progress.required,
            percentage: progress.percentage,
            conditionsMet: conditionsMet
        });
        
        // Add progress field to embed
        console.log('[DEBUG-DEEPER] Creating progress bar...');
        const progressBar = createProgressBar(progress.percentage);
        const conditionDesc = getConditionDescription(mineConfig);
        
        console.log('[DEBUG-DEEPER] Adding progress field to embed');
        console.log('[DEBUG-DEEPER] Condition description:', conditionDesc);
        console.log('[DEBUG-DEEPER] Progress bar:', progressBar);
        
        embed.addFields({
            name: '🔓 Deeper Level Progress',
            value: `${conditionDesc}\n${progressBar} ${progress.current}/${progress.required} (${progress.percentage}%)`,
            inline: false
        });
        
        // Create button (enabled only if conditions are met)
        if (conditionsMet) {
            console.log('[DEBUG-DEEPER] CONDITIONS MET! Creating button...');
            const buttonRow = createDigDeeperButton(channelId, mineTypeId, true);
            console.log('[DEBUG-DEEPER] Button created successfully');
            
            embed.addFields({
                name: '✅ Deeper Level Available!',
                value: `You've unlocked access to the deeper section of this mine! Click "Dig Deeper" to explore.`,
                inline: false
            });
            
            console.log(`[DEBUG-DEEPER] SUCCESS: Button enabled for channel ${channelId}!`);
            console.log('[DEBUG-DEEPER] Returning embed with components');
            console.log('[DEBUG-DEEPER] ====== END checkAndAddDeeperMineButton (SUCCESS) ======');
            return { embed, components: [buttonRow] };
        }
        
        console.log(`[DEBUG-DEEPER] Progress shown but conditions NOT met for channel ${channelId}`);
        console.log('[DEBUG-DEEPER] ====== END checkAndAddDeeperMineButton (NO BUTTON) ======');
        return { embed, components: [] };
        
    } catch (error) {
        console.error('[DEBUG-DEEPER] ERROR in checkAndAddDeeperMineButton:', error);
        console.error('[DEBUG-DEEPER] Error stack:', error.stack);
        console.log('[DEBUG-DEEPER] ====== END checkAndAddDeeperMineButton (ERROR) ======');
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

module.exports = {
    getMineConfig,
    checkConditions,
    getProgress,
    createDigDeeperButton,
    getConditionDescription,
    checkAndAddDeeperMineButton,
    createProgressBar,
    reloadGachaServers,
    calculateMinecartValue,
    countRareOres,
    countFossils
};
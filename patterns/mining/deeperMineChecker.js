// patterns/mining/deeperMineChecker.js
// Module to check if conditions are met for accessing deeper mine levels
// UPDATED TO USE EXISTING STAT TRACKING + EXIT TILE SYSTEM

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
 * Calculate persistent total run value (lifetime accumulated value)
 * @param {Object} dbEntry - The database entry
 * @returns {number} - Total lifetime value accumulated
 */
function calculatePersistentRunValue(dbEntry) {
    console.log('[DEBUG-DEEPER] calculatePersistentRunValue called');
    
    if (!dbEntry.gameData || !dbEntry.gameData.stats) {
        console.log('[DEBUG-DEEPER] No gameData or stats for persistent value');
        return 0;
    }
    
    const stats = dbEntry.gameData.stats;
    
    // Use lifetime value if it exists, otherwise initialize it
    const lifetimeValue = stats.lifetimeValue || 0;
    
    console.log(`[DEBUG-DEEPER] Persistent lifetime value: ${lifetimeValue}`);
    return lifetimeValue;
}

/**
 * Update persistent run value when items are added
 * @param {Object} dbEntry - The database entry
 * @param {number} addedValue - Value to add to lifetime total
 */
async function updatePersistentRunValue(dbEntry, addedValue) {
    console.log('[DEBUG-DEEPER] updatePersistentRunValue called with value:', addedValue);
    
    if (!dbEntry.gameData) {
        dbEntry.gameData = {};
    }
    if (!dbEntry.gameData.stats) {
        dbEntry.gameData.stats = {};
    }
    
    // Initialize if doesn't exist
    if (!dbEntry.gameData.stats.lifetimeValue) {
        dbEntry.gameData.stats.lifetimeValue = 0;
    }
    
    // Add to lifetime value
    dbEntry.gameData.stats.lifetimeValue += addedValue;
    
    console.log(`[DEBUG-DEEPER] Updated lifetime value to: ${dbEntry.gameData.stats.lifetimeValue}`);
    
    // Save to database
    await gachaVC.updateOne(
        { channelId: dbEntry.channelId },
        { $set: { 'gameData.stats.lifetimeValue': dbEntry.gameData.stats.lifetimeValue } }
    );
}

/**
 * Check if exit tile has been found and broken
 * @param {Object} dbEntry - The database entry
 * @returns {boolean} - Whether exit tile has been found
 */
function checkExitTileFound(dbEntry) {
    if (!dbEntry.gameData || !dbEntry.gameData.stats) {
        return false;
    }
    
    return dbEntry.gameData.stats.exitTileFound === true;
}

/**
 * Mark exit tile as found and store its position relative to entrance
 * @param {Object} dbEntry - The database entry
 * @param {Object} exitTileData - Exit tile data including position
 */
async function markExitTileFound(dbEntry, exitTileData) {
    console.log('[DEBUG-DEEPER] Marking exit tile as found at position:', exitTileData);
    
    if (!dbEntry.gameData) {
        dbEntry.gameData = {};
    }
    if (!dbEntry.gameData.stats) {
        dbEntry.gameData.stats = {};
    }
    
    dbEntry.gameData.stats.exitTileFound = true;
    dbEntry.gameData.stats.exitTileFoundAt = new Date();
    
    // Get entrance position from map for relative positioning
    const entranceX = dbEntry.gameData?.map?.entranceX || 0;
    const entranceY = dbEntry.gameData?.map?.entranceY || 0;
    
    // Store exit tile with BOTH absolute and relative positions
    dbEntry.gameData.exitTile = {
        // Absolute position (may become invalid on map expansion)
        x: exitTileData.x,
        y: exitTileData.y,
        // Relative position to entrance (stable across map changes)
        relativeX: exitTileData.x - entranceX,
        relativeY: exitTileData.y - entranceY,
        // Store map dimensions when found (to detect expansion)
        mapWidth: dbEntry.gameData?.map?.width || 50,
        mapHeight: dbEntry.gameData?.map?.height || 50,
        // Metadata
        discoveredAt: exitTileData.discoveredAt,
        discoveredBy: exitTileData.discoveredBy,
        active: true
    };
    
    // Save to database
    await gachaVC.updateOne(
        { channelId: dbEntry.channelId },
        { 
            $set: { 
                'gameData.stats.exitTileFound': true,
                'gameData.stats.exitTileFoundAt': new Date(),
                'gameData.exitTile': dbEntry.gameData.exitTile
            } 
        }
    );
    
    console.log('[DEBUG-DEEPER] Exit tile marked with relative position:', 
                `Relative: (${dbEntry.gameData.exitTile.relativeX}, ${dbEntry.gameData.exitTile.relativeY})`);
}

/**
 * Reset exit tile status (for when entering a new mine level)
 * @param {Object} dbEntry - The database entry
 */
async function resetExitTileStatus(dbEntry) {
    console.log('[DEBUG-DEEPER] Resetting exit tile status');
    
    if (dbEntry.gameData && dbEntry.gameData.stats) {
        dbEntry.gameData.stats.exitTileFound = false;
        delete dbEntry.gameData.stats.exitTileFoundAt;
        delete dbEntry.gameData.exitTile;
        
        // Save to database
        await gachaVC.updateOne(
            { channelId: dbEntry.channelId },
            { 
                $set: { 'gameData.stats.exitTileFound': false },
                $unset: { 
                    'gameData.stats.exitTileFoundAt': 1,
                    'gameData.exitTile': 1
                }
            }
        );
    }
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
    
    const { miningItemPool } = require('../gachaModes/mining/miningConstants_unified');
    
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
    
    const { miningItemPool } = require('../gachaModes/mining/miningConstants_unified');
    
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
            
        case 'persistentValue':
            // Use lifetime accumulated value instead of current minecart
            const lifetimeValue = calculatePersistentRunValue(dbEntry);
            console.log(`[DEBUG-DEEPER] Persistent lifetime value: ${lifetimeValue} / ${conditionCost}`);
            return lifetimeValue >= conditionCost;
            
        case 'exitTile':
            // Check if exit tile has been found and broken
            const exitFound = checkExitTileFound(dbEntry);
            console.log(`[DEBUG-DEEPER] Exit tile found: ${exitFound}`);
            return exitFound;
            
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
        case 'persistentValue':
            current = calculatePersistentRunValue(dbEntry);
            break;
        case 'exitTile':
            // For exit tile, show if found or not
            current = checkExitTileFound(dbEntry) ? 1 : 0;
            break;
        case 'rareOresFound':
            current = countRareOres(minecart);
            break;
        case 'fossilsFound':
            current = countFossils(minecart);
            break;
    }
    
    // Special handling for exit tile condition
    if (conditionType === 'exitTile') {
        const result = {
            current: current,
            required: 1,
            percentage: current * 100
        };
        console.log('[DEBUG-DEEPER] Exit tile progress:', result);
        return result;
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
        case 'persistentValue':
            return `Accumulate ${conditionCost} lifetime value`;
        case 'exitTile':
            return `Find and break the Exit Tile (1/1000 chance)`;
        case 'rareOresFound':
            return `Find ${conditionCost} rare or better ores`;
        case 'fossilsFound':
            return `Excavate ${conditionCost} fossils`;
        default:
            return `Complete mining objectives`;
    }
}

/**
 * Check if a wall break spawns the exit tile
 * @param {Object} dbEntry - The database entry
 * @param {number} x - X coordinate of the broken wall
 * @param {number} y - Y coordinate of the broken wall
 * @returns {Object|null} - Exit tile data if spawned, null otherwise
 */
async function checkForExitTileSpawn(dbEntry, x, y) {
    // First check if this mine's condition type is exitTile
    const mineTypeId = dbEntry.typeId;
    if (!mineTypeId) {
        return null; // No mine type configured
    }
    
    const mineConfig = getMineConfig(mineTypeId);
    if (!mineConfig) {
        return null; // No mine configuration found
    }
    
    // Only spawn exit tiles if the condition type is 'exitTile'
    if (mineConfig.nextLevelConditionType !== 'exitTile') {
        return null; // This mine doesn't use exit tile condition
    }
    
    // Don't spawn if already found
    if (checkExitTileFound(dbEntry)) {
        return null;
    }
    
    // Don't spawn on entrance tile or adjacent to it
    const entranceX = dbEntry.gameData?.map?.entranceX || 0;
    const entranceY = dbEntry.gameData?.map?.entranceY || 0;
    const distFromEntrance = Math.abs(x - entranceX) + Math.abs(y - entranceY);
    
    if (distFromEntrance < 2) {
        return null; // Too close to entrance
    }
    
    // 1 in 10000 chance (simplified)
    const roll = Math.random();
    const spawnChance = 1 / 10000;
    
    if (roll < spawnChance) {
        console.log('[DEBUG-DEEPER] EXIT TILE SPAWNED! Roll:', roll, 'vs chance:', spawnChance);
        console.log('[DEBUG-DEEPER] Exit tile location: (' + x + ', ' + y + ')');
        console.log('[DEBUG-DEEPER] Distance from entrance:', distFromEntrance);
        console.log('[DEBUG-DEEPER] Mine type:', mineConfig.name);
        
        // Return exit tile data with position
        return {
            x: x,
            y: y,
            discoveredAt: Date.now(),
            discoveredBy: null // Will be set by caller
        };
    }
    
    return null;
}

/**
 * Create exit tile visual data for map rendering
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Object} - Exit tile visual data
 */
function createExitTileVisual(x, y) {
    return {
        x: x,
        y: y,
        type: 'exit_tile',
        symbol: '🚪',
        color: '#FFD700',  // Gold color
        glow: true,
        animation: 'pulse',
        name: 'Exit Tile',
        description: 'A mysterious glowing tile that leads to deeper sections of the mine'
    };
}

/**
 * Get exit tile data from database entry (with map expansion handling)
 * @param {Object} dbEntry - The database entry
 * @returns {Object|null} - Exit tile data if exists
 */
function getExitTileData(dbEntry) {
    if (!dbEntry.gameData || !dbEntry.gameData.exitTile || !dbEntry.gameData.exitTile.active) {
        return null;
    }
    
    const exitTile = dbEntry.gameData.exitTile;
    const currentMap = dbEntry.gameData.map;
    
    if (!currentMap) {
        return exitTile;
    }
    
    // Check if map has expanded since exit tile was found
    const mapExpanded = (currentMap.width !== exitTile.mapWidth || 
                        currentMap.height !== exitTile.mapHeight);
    
    if (mapExpanded || !isValidPosition(exitTile.x, exitTile.y, currentMap)) {
        console.log('[DEBUG-DEEPER] Map has changed, recalculating exit tile position');
        
        // Recalculate position based on relative coordinates
        const newX = currentMap.entranceX + exitTile.relativeX;
        const newY = currentMap.entranceY + exitTile.relativeY;
        
        // Ensure new position is within bounds
        exitTile.x = Math.max(0, Math.min(newX, currentMap.width - 1));
        exitTile.y = Math.max(0, Math.min(newY, currentMap.height - 1));
        
        // Update the stored dimensions
        exitTile.mapWidth = currentMap.width;
        exitTile.mapHeight = currentMap.height;
        
        console.log('[DEBUG-DEEPER] Exit tile repositioned to:', exitTile.x, exitTile.y);
    }
    
    return exitTile;
}

/**
 * Check if position is valid on current map
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} map - Map data
 * @returns {boolean} - Whether position is valid
 */
function isValidPosition(x, y, map) {
    return x >= 0 && x < map.width && y >= 0 && y < map.height;
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
        
        // Special display for exit tile condition
        if (mineConfig.nextLevelConditionType === 'exitTile') {
            const exitTileStatus = checkExitTileFound(dbEntry) ? '✅ Found!' : '❌ Not found yet';
            embed.addFields({
                name: '🔓 Deeper Level Progress',
                value: `${conditionDesc}\nStatus: ${exitTileStatus}\n\n*Break walls to have a chance at finding the Exit Tile!*`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '🔓 Deeper Level Progress',
                value: `${conditionDesc}\n${progressBar} ${progress.current}/${progress.required} (${progress.percentage}%)`,
                inline: false
            });
        }
        
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

/**
 * Update exit tile position after map expansion
 * @param {Object} dbEntry - The database entry
 * @param {Object} oldMapBounds - Previous map boundaries
 * @param {Object} newMapBounds - New map boundaries
 */
async function updateExitTileAfterExpansion(dbEntry, oldMapBounds, newMapBounds) {
    const exitTile = dbEntry.gameData?.exitTile;
    
    if (!exitTile || !exitTile.active) {
        return;
    }
    
    console.log('[DEBUG-DEEPER] Updating exit tile after map expansion');
    
    // If entrance moved, update relative position remains the same
    // But absolute position needs to be recalculated
    const newEntranceX = newMapBounds.entranceX || dbEntry.gameData.map.entranceX;
    const newEntranceY = newMapBounds.entranceY || dbEntry.gameData.map.entranceY;
    
    // Recalculate absolute position from relative
    const newX = newEntranceX + exitTile.relativeX;
    const newY = newEntranceY + exitTile.relativeY;
    
    // Ensure within new bounds
    exitTile.x = Math.max(0, Math.min(newX, newMapBounds.width - 1));
    exitTile.y = Math.max(0, Math.min(newY, newMapBounds.height - 1));
    exitTile.mapWidth = newMapBounds.width;
    exitTile.mapHeight = newMapBounds.height;
    
    // Save updated position
    await gachaVC.updateOne(
        { channelId: dbEntry.channelId },
        { $set: { 'gameData.exitTile': exitTile } }
    );
    
    console.log('[DEBUG-DEEPER] Exit tile repositioned from', 
                `(${exitTile.x}, ${exitTile.y}) to (${newX}, ${newY})`);
}

/**
 * Check if a mine uses exit tile condition
 * @param {number|string} mineTypeId - The mine type ID
 * @returns {boolean} - Whether this mine uses exit tile condition
 */
function usesExitTileCondition(mineTypeId) {
    if (!mineTypeId) return false;
    
    const mineConfig = getMineConfig(mineTypeId);
    if (!mineConfig) return false;
    
    return mineConfig.nextLevelConditionType === 'exitTile';
}

/**
 * Get the condition type for a mine
 * @param {number|string} mineTypeId - The mine type ID
 * @returns {string|null} - The condition type or null
 */
function getMineConditionType(mineTypeId) {
    if (!mineTypeId) return null;
    
    const mineConfig = getMineConfig(mineTypeId);
    if (!mineConfig) return null;
    
    return mineConfig.nextLevelConditionType || null;
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
    calculatePersistentRunValue,
    updatePersistentRunValue,
    checkExitTileFound,
    markExitTileFound,
    resetExitTileStatus,
    checkForExitTileSpawn,
    createExitTileVisual,
    getExitTileData,
    updateExitTileAfterExpansion,
    usesExitTileCondition,
    getMineConditionType,
    countRareOres,
    countFossils
};
// exit_tile_renderer.js
// Helper module for rendering exit tiles on the mining map

const deeperMineChecker = require('../../mining/deeperMineChecker');

/**
 * Add exit tile to map tiles for visual rendering
 * @param {Object} mapData - The map data object
 * @param {Object} dbEntry - Database entry with gameData
 * @returns {Object} - Modified map data with exit tile
 */
function addExitTileToMap(mapData, dbEntry) {
    // Get exit tile data if it exists
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    
    if (!exitTile || !exitTile.active) {
        return mapData; // No exit tile to render
    }
    
    // Ensure the coordinates are valid
    if (exitTile.y < 0 || exitTile.y >= mapData.height || 
        exitTile.x < 0 || exitTile.x >= mapData.width) {
        console.warn(`[EXIT TILE] Invalid position: (${exitTile.x}, ${exitTile.y})`);
        return mapData;
    }
    
    // Ensure the tile exists
    if (!mapData.tiles[exitTile.y] || !mapData.tiles[exitTile.y][exitTile.x]) {
        console.warn(`[EXIT TILE] Tile doesn't exist at: (${exitTile.x}, ${exitTile.y})`);
        return mapData;
    }
    
    // Override the tile with exit tile properties
    mapData.tiles[exitTile.y][exitTile.x] = {
        ...mapData.tiles[exitTile.y][exitTile.x],
        type: 'EXIT_TILE',
        originalType: mapData.tiles[exitTile.y][exitTile.x].type, // Store original
        symbol: '🚪',
        color: '#FFD700', // Gold
        backgroundColor: '#4B0082', // Indigo background
        glow: true,
        pulse: true,
        special: true,
        discovered: true, // Always visible once found
        name: 'Exit Tile',
        description: 'A glowing portal to deeper mine levels'
    };
    
    console.log(`[EXIT TILE] Added to map at (${exitTile.x}, ${exitTile.y})`);
    return mapData;
}

/**
 * Get exit tile symbol for text-based rendering
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} dbEntry - Database entry
 * @param {string} defaultSymbol - Default symbol if not exit tile
 * @returns {string} - Symbol to render
 */
function getExitTileSymbol(x, y, dbEntry, defaultSymbol) {
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    
    if (exitTile && exitTile.active && exitTile.x === x && exitTile.y === y) {
        return '🚪'; // Exit tile symbol
    }
    
    return defaultSymbol;
}

/**
 * Check if coordinates are the exit tile
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} dbEntry - Database entry
 * @returns {boolean} - True if this is the exit tile
 */
function isExitTile(x, y, dbEntry) {
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    return exitTile && exitTile.active && exitTile.x === x && exitTile.y === y;
}

/**
 * Get exit tile info for UI display
 * @param {Object} dbEntry - Database entry
 * @returns {Object|null} - Exit tile info or null
 */
function getExitTileInfo(dbEntry) {
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    
    if (!exitTile || !exitTile.active) {
        return null;
    }
    
    return {
        position: `(${exitTile.x}, ${exitTile.y})`,
        discoveredBy: exitTile.discoveredBy,
        discoveredAt: new Date(exitTile.discoveredAt).toLocaleString(),
        symbol: '🚪',
        status: 'Active',
        message: 'Exit tile found! Path to deeper levels available.'
    };
}

/**
 * Create exit tile notification embed
 * @param {Object} member - Discord member who found it
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Object} - Discord embed object
 */
function createExitTileEmbed(member, x, y) {
    const { EmbedBuilder } = require('discord.js');
    
    return new EmbedBuilder()
        .setTitle('🚪 EXIT TILE DISCOVERED!')
        .setDescription(`${member.displayName} has discovered the mystical Exit Tile!`)
        .addFields(
            { name: '📍 Location', value: `Position: (${x}, ${y})`, inline: true },
            { name: '✨ Effect', value: 'Unlocks deeper mine levels', inline: true },
            { name: '🎯 Rarity', value: '1 in 10,000 chance', inline: true }
        )
        .setColor(0xFFD700) // Gold color
        .setFooter({ text: 'The path to greater riches has been revealed!' })
        .setTimestamp();
}

/**
 * Add exit tile status to mining map embed
 * @param {Object} embed - Discord embed to modify
 * @param {Object} dbEntry - Database entry
 * @returns {Object} - Modified embed
 */
function addExitTileToEmbed(embed, dbEntry) {
    const exitTileInfo = getExitTileInfo(dbEntry);
    
    if (exitTileInfo) {
        embed.addFields({
            name: '🚪 Exit Tile Status',
            value: `Found at ${exitTileInfo.position} by <@${exitTileInfo.discoveredBy}>`,
            inline: false
        });
    }
    
    return embed;
}

/**
 * Handle player interaction with exit tile
 * @param {Object} player - Player object
 * @param {number} x - Player X coordinate
 * @param {number} y - Player Y coordinate
 * @param {Object} dbEntry - Database entry
 * @returns {Object|null} - Interaction result
 */
function checkExitTileInteraction(player, x, y, dbEntry) {
    if (!isExitTile(x, y, dbEntry)) {
        return null;
    }
    
    // Check if deeper mine conditions are met
    const mineConfig = deeperMineChecker.getMineConfig(dbEntry.typeId);
    if (!mineConfig) {
        return null;
    }
    
    const conditionsMet = deeperMineChecker.checkConditions(dbEntry, mineConfig);
    
    return {
        isExitTile: true,
        playerName: player.displayName,
        canProgress: conditionsMet,
        message: conditionsMet 
            ? `${player.displayName} can use the Exit Tile to go deeper!`
            : `${player.displayName} found the Exit Tile but needs to meet conditions first.`
    };
}

module.exports = {
    addExitTileToMap,
    getExitTileSymbol,
    isExitTile,
    getExitTileInfo,
    createExitTileEmbed,
    addExitTileToEmbed,
    checkExitTileInteraction
};
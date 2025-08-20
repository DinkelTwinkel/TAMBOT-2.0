// patterns/gachaModes/mining/railStorage.js
// Separate rail storage system to prevent conflicts with mining operations

const gachaVC = require('../../../models/activevcs');

/**
 * Get rails data for a channel
 * Rails are stored separately from the main map in gameData.rails
 * @param {string} channelId - The channel ID
 * @returns {Object} Rails data object with positions
 */
async function getRailsData(channelId) {
    const entry = await gachaVC.findOne({ channelId });
    if (!entry || !entry.gameData) {
        return { positions: {} };
    }
    
    // Initialize rails data if it doesn't exist
    if (!entry.gameData.rails) {
        entry.gameData.rails = { positions: {} };
        await entry.save();
    }
    
    return entry.gameData.rails;
}

/**
 * Set rails data for a channel
 * @param {string} channelId - The channel ID
 * @param {Object} railsData - The rails data to save
 */
async function setRailsData(channelId, railsData) {
    await gachaVC.updateOne(
        { channelId },
        { 
            $set: { 
                'gameData.rails': railsData 
            } 
        }
    );
}

/**
 * Add a rail at a specific position
 * @param {string} channelId - The channel ID
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} railInfo - Additional rail information (optional)
 */
async function addRail(channelId, x, y, railInfo = {}) {
    const key = `${x},${y}`;
    await gachaVC.updateOne(
        { channelId },
        { 
            $set: { 
                [`gameData.rails.positions.${key}`]: {
                    x,
                    y,
                    timestamp: Date.now(),
                    ...railInfo
                }
            } 
        }
    );
}

/**
 * Remove a rail at a specific position
 * @param {string} channelId - The channel ID
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
async function removeRail(channelId, x, y) {
    const key = `${x},${y}`;
    await gachaVC.updateOne(
        { channelId },
        { 
            $unset: { 
                [`gameData.rails.positions.${key}`]: 1
            } 
        }
    );
}

/**
 * Clear all rails for a channel
 * @param {string} channelId - The channel ID
 */
async function clearAllRails(channelId) {
    await gachaVC.updateOne(
        { channelId },
        { 
            $set: { 
                'gameData.rails.positions': {}
            } 
        }
    );
}

/**
 * Check if a tile has a rail
 * @param {Object} railsData - The rails data object
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} True if the tile has a rail
 */
function hasRail(railsData, x, y) {
    if (!railsData || !railsData.positions) return false;
    const key = `${x},${y}`;
    return key in railsData.positions;
}

/**
 * Get all rail positions as an array
 * @param {Object} railsData - The rails data object
 * @returns {Array} Array of {x, y} positions
 */
function getAllRailPositions(railsData) {
    if (!railsData || !railsData.positions) return [];
    
    return Object.values(railsData.positions).map(rail => ({
        x: rail.x,
        y: rail.y
    }));
}

/**
 * Build rails along a path (REPLACES all existing rails)
 * Use mergeRailPath to preserve existing rails
 * @param {string} channelId - The channel ID
 * @param {Array} path - Array of {x, y} positions forming the path
 */
async function buildRailPath(channelId, path) {
    if (!path || path.length === 0) return;
    
    const railPositions = {};
    for (const pos of path) {
        const key = `${pos.x},${pos.y}`;
        railPositions[key] = {
            x: pos.x,
            y: pos.y,
            timestamp: Date.now()
        };
    }
    
    await gachaVC.updateOne(
        { channelId },
        { 
            $set: { 
                'gameData.rails.positions': railPositions
            } 
        }
    );
}

/**
 * Merge existing rails with new rails (PRESERVES existing rails)
 * This is the preferred method for adding new rails
 * @param {string} channelId - The channel ID
 * @param {Array} newPath - Array of {x, y} positions to add
 */
async function mergeRailPath(channelId, newPath) {
    if (!newPath || newPath.length === 0) return;
    
    const existingRails = await getRailsData(channelId);
    const mergedPositions = { ...existingRails.positions };
    
    for (const pos of newPath) {
        const key = `${pos.x},${pos.y}`;
        if (!mergedPositions[key]) {
            mergedPositions[key] = {
                x: pos.x,
                y: pos.y,
                timestamp: Date.now()
            };
        }
    }
    
    await gachaVC.updateOne(
        { channelId },
        { 
            $set: { 
                'gameData.rails.positions': mergedPositions
            } 
        }
    );
}

/**
 * Get rail connections for a specific tile (for rendering)
 * @param {Object} railsData - The rails data object
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Object} Object with north, south, east, west boolean values
 */
function getRailConnections(railsData, x, y) {
    return {
        north: hasRail(railsData, x, y - 1),
        south: hasRail(railsData, x, y + 1),
        east: hasRail(railsData, x + 1, y),
        west: hasRail(railsData, x - 1, y)
    };
}

/**
 * Count total number of rails
 * @param {Object} railsData - The rails data object
 * @returns {number} Total number of rail tiles
 */
function countRails(railsData) {
    if (!railsData || !railsData.positions) return 0;
    return Object.keys(railsData.positions).length;
}

/**
 * Export rail data for backup or debugging
 * @param {string} channelId - The channel ID
 * @returns {Object} Complete rails data
 */
async function exportRailData(channelId) {
    const railsData = await getRailsData(channelId);
    return {
        channelId,
        railCount: countRails(railsData),
        positions: getAllRailPositions(railsData),
        raw: railsData
    };
}

/**
 * Import rail data (for restoration or testing)
 * @param {string} channelId - The channel ID
 * @param {Object} railsData - The rails data to import
 */
async function importRailData(channelId, railsData) {
    await setRailsData(channelId, railsData);
}

module.exports = {
    getRailsData,
    setRailsData,
    addRail,
    removeRail,
    clearAllRails,
    hasRail,
    getAllRailPositions,
    buildRailPath,
    mergeRailPath,
    getRailConnections,
    countRails,
    exportRailData,
    importRailData
};

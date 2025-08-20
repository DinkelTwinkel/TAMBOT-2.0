// patterns/gachaModes/mining/railPathfinding.js
// Rail pathfinding system using separate rail storage

const railStorage = require('./railStorage');

const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor',
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore',
    RARE_ORE: 'rare_ore',
    TREASURE_CHEST: 'treasure',
    HAZARD: 'hazard',
    REINFORCED_WALL: 'reinforced'
};

/**
 * A* pathfinding algorithm to find the shortest path
 * @param {Object} mapData - The map data
 * @param {Object} start - Starting position {x, y}
 * @param {Object} end - Target position {x, y}
 * @returns {Array|null} Array of positions forming the path, or null if no path found
 */
function findPath(mapData, start, end) {
    const { tiles, width, height } = mapData;
    
    // Check if start and end are valid
    if (!isValidPosition(start, width, height) || !isValidPosition(end, width, height)) {
        return null;
    }
    
    // Check if end position is walkable
    if (!isWalkable(tiles[end.y][end.x])) {
        return null;
    }
    
    const openSet = [];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    
    const startKey = `${start.x},${start.y}`;
    openSet.push(start);
    gScore.set(startKey, 0);
    fScore.set(startKey, heuristic(start, end));
    
    while (openSet.length > 0) {
        // Get node with lowest fScore
        let current = openSet.reduce((lowest, node) => {
            const nodeKey = `${node.x},${node.y}`;
            const lowestKey = `${lowest.x},${lowest.y}`;
            return (fScore.get(nodeKey) || Infinity) < (fScore.get(lowestKey) || Infinity) ? node : lowest;
        });
        
        if (current.x === end.x && current.y === end.y) {
            // Reconstruct path
            return reconstructPath(cameFrom, current);
        }
        
        // Remove current from openSet
        const currentIndex = openSet.findIndex(n => n.x === current.x && n.y === current.y);
        openSet.splice(currentIndex, 1);
        
        const currentKey = `${current.x},${current.y}`;
        closedSet.add(currentKey);
        
        // Check all neighbors
        const neighbors = getNeighbors(current, width, height);
        
        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;
            
            if (closedSet.has(neighborKey)) {
                continue;
            }
            
            // Check if neighbor is walkable
            if (!isWalkable(tiles[neighbor.y][neighbor.x])) {
                continue;
            }
            
            const tentativeGScore = (gScore.get(currentKey) || Infinity) + 1;
            
            if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
                openSet.push(neighbor);
            } else if (tentativeGScore >= (gScore.get(neighborKey) || Infinity)) {
                continue;
            }
            
            // This path is the best so far
            cameFrom.set(neighborKey, current);
            gScore.set(neighborKey, tentativeGScore);
            fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, end));
        }
    }
    
    // No path found
    return null;
}

/**
 * Check if a position is valid within the map bounds
 */
function isValidPosition(pos, width, height) {
    return pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height;
}

/**
 * Check if a tile is walkable (floor or entrance)
 */
function isWalkable(tile) {
    if (!tile) return false;
    return tile.type === TILE_TYPES.FLOOR || tile.type === TILE_TYPES.ENTRANCE;
}

/**
 * Get valid neighbors for a position
 */
function getNeighbors(pos, width, height) {
    const neighbors = [];
    const directions = [
        { x: pos.x, y: pos.y - 1 }, // North
        { x: pos.x + 1, y: pos.y }, // East
        { x: pos.x, y: pos.y + 1 }, // South
        { x: pos.x - 1, y: pos.y }  // West
    ];
    
    for (const dir of directions) {
        if (isValidPosition(dir, width, height)) {
            neighbors.push(dir);
        }
    }
    
    return neighbors;
}

/**
 * Manhattan distance heuristic
 */
function heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Reconstruct the path from start to end
 */
function reconstructPath(cameFrom, current) {
    const path = [current];
    let currentKey = `${current.x},${current.y}`;
    
    while (cameFrom.has(currentKey)) {
        current = cameFrom.get(currentKey);
        path.unshift(current);
        currentKey = `${current.x},${current.y}`;
    }
    
    return path;
}

/**
 * Build minecart rails from start to end position
 * @param {Object} dbEntry - Database entry with map data
 * @param {Object} start - Starting position {x, y}
 * @param {Object} end - Target position {x, y}
 * @returns {Object} Result object with success status and message
 */
async function buildMinecartRails(dbEntry, start, end) {
    try {
        const mapData = dbEntry.gameData.map;
        
        // Find path from start to end
        const path = findPath(mapData, start, end);
        
        if (!path) {
            return {
                success: false,
                error: 'No valid path found between start and end positions'
            };
        }
        
        // Build rails along the path using merge to preserve existing rails
        await railStorage.mergeRailPath(dbEntry.channelId, path);
        
        return {
            success: true,
            message: `Successfully built ${path.length} rail segments`,
            path: path,
            pathLength: path.length
        };
        
    } catch (error) {
        console.error('[RAIL PATHFINDING] Error building rails:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Clear all rails from the map using the new storage system
 * @param {string} channelId - The channel ID
 */
async function clearAllRails(channelId) {
    await railStorage.clearAllRails(channelId);
    return { success: true, message: 'All rails cleared' };
}

/**
 * Get all rail positions for a channel
 * @param {string} channelId - The channel ID
 * @returns {Array} Array of {x, y} positions
 */
async function getRailPositions(channelId) {
    const railsData = await railStorage.getRailsData(channelId);
    return railStorage.getAllRailPositions(railsData);
}

/**
 * Check if a specific tile has a rail
 * @param {string} channelId - The channel ID
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} True if the tile has a rail
 */
async function hasRailAt(channelId, x, y) {
    const railsData = await railStorage.getRailsData(channelId);
    return railStorage.hasRail(railsData, x, y);
}

module.exports = {
    findPath,
    buildMinecartRails,
    clearAllRails,
    getRailPositions,
    hasRailAt,
    // Export utility functions for extended pathfinding
    isValidPosition,
    isWalkable,
    getNeighbors,
    heuristic
};

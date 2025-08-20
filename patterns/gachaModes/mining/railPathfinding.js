// railPathfinding.js - Central rail building and pathfinding system
const { TILE_TYPES } = require('./miningConstants');

/**
 * Priority Queue implementation for A* pathfinding
 */
class PriorityQueue {
    constructor() {
        this.elements = [];
    }

    enqueue(element, priority) {
        this.elements.push({ element, priority });
        this.elements.sort((a, b) => a.priority - b.priority);
    }

    dequeue() {
        return this.elements.shift()?.element;
    }

    isEmpty() {
        return this.elements.length === 0;
    }
}

/**
 * Calculate Manhattan distance heuristic for A*
 */
function heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Get valid neighboring tiles for pathfinding
 * @param {Object} position - Current position {x, y}
 * @param {Array} tiles - 2D array of tile data
 * @returns {Array} Array of valid neighbor positions
 */
function getNeighbors(position, tiles) {
    const neighbors = [];
    const directions = [
        { x: 0, y: -1 }, // Up
        { x: 1, y: 0 },  // Right
        { x: 0, y: 1 },  // Down
        { x: -1, y: 0 }  // Left
    ];

    for (const dir of directions) {
        const newX = position.x + dir.x;
        const newY = position.y + dir.y;

        // Check bounds
        if (newY >= 0 && newY < tiles.length && 
            newX >= 0 && newX < tiles[0].length) {
            
            const tile = tiles[newY][newX];
            // Can only build rails on floor tiles or entrance
            if (tile && (tile.type === TILE_TYPES.FLOOR || 
                        tile.type === TILE_TYPES.ENTRANCE)) {
                neighbors.push({ x: newX, y: newY });
            }
        }
    }

    return neighbors;
}

/**
 * A* pathfinding algorithm
 * @param {Object} start - Start position {x, y}
 * @param {Object} end - End position {x, y}
 * @param {Array} tiles - 2D array of tile data
 * @returns {Array|null} Array of positions forming the path, or null if no path exists
 */
function findPath(start, end, tiles) {
    // Quick validation
    if (!tiles || tiles.length === 0 || !tiles[0]) {
        console.error('[RAILS] Invalid tiles array');
        return null;
    }

    // Check if start and end are valid floor tiles
    const startTile = tiles[start.y]?.[start.x];
    const endTile = tiles[end.y]?.[end.x];
    
    if (!startTile || !endTile) {
        console.error('[RAILS] Start or end position out of bounds');
        return null;
    }

    if (startTile.type !== TILE_TYPES.FLOOR && startTile.type !== TILE_TYPES.ENTRANCE) {
        console.error(`[RAILS] Start position is not a floor tile: ${startTile.type}`);
        return null;
    }

    if (endTile.type !== TILE_TYPES.FLOOR && endTile.type !== TILE_TYPES.ENTRANCE) {
        console.error(`[RAILS] End position is not a floor tile: ${endTile.type}`);
        return null;
    }

    // Initialize A* algorithm
    const frontier = new PriorityQueue();
    frontier.enqueue(start, 0);
    
    const cameFrom = new Map();
    const costSoFar = new Map();
    
    const startKey = `${start.x},${start.y}`;
    const endKey = `${end.x},${end.y}`;
    
    cameFrom.set(startKey, null);
    costSoFar.set(startKey, 0);

    // A* search
    while (!frontier.isEmpty()) {
        const current = frontier.dequeue();
        const currentKey = `${current.x},${current.y}`;

        // Found the goal
        if (current.x === end.x && current.y === end.y) {
            // Reconstruct path
            const path = [];
            let step = end;
            let stepKey = endKey;
            
            while (stepKey !== startKey) {
                path.unshift(step);
                const previous = cameFrom.get(stepKey);
                if (!previous) break;
                step = previous;
                stepKey = `${step.x},${step.y}`;
            }
            path.unshift(start);
            
            return path;
        }

        // Check all neighbors
        const neighbors = getNeighbors(current, tiles);
        for (const next of neighbors) {
            const nextKey = `${next.x},${next.y}`;
            const newCost = costSoFar.get(currentKey) + 1;

            if (!costSoFar.has(nextKey) || newCost < costSoFar.get(nextKey)) {
                costSoFar.set(nextKey, newCost);
                const priority = newCost + heuristic(next, end);
                frontier.enqueue(next, priority);
                cameFrom.set(nextKey, current);
            }
        }
    }

    // No path found
    return null;
}

/**
 * Build rails along a path
 * @param {Object} mapData - The map data object
 * @param {Array} path - Array of positions forming the path
 * @returns {Object} Updated map data with rails
 */
function buildRailsOnPath(mapData, path) {
    if (!path || path.length === 0) {
        return mapData;
    }

    let railsBuilt = 0;
    
    for (const position of path) {
        const tile = mapData.tiles[position.y]?.[position.x];
        if (tile) {
            // Add rail field to tile
            if (!tile.hasRail) {
                tile.hasRail = true;
                railsBuilt++;
            }
        }
    }

    console.log(`[RAILS] Built ${railsBuilt} rail tiles`);
    return mapData;
}

/**
 * Main function to build minecart rails between two points
 * @param {Object} activeVC - The active voice channel data from database
 * @param {Object} start - Start position {x, y}
 * @param {Object} end - End position {x, y}
 * @returns {Object} Result object with success status and updated map data
 */
async function buildMinecartRails(activeVC, start, end) {
    // Validate activeVC data
    if (!activeVC) {
        return {
            success: false,
            error: 'No active voice channel data provided'
        };
    }

    if (!activeVC.gameData || !activeVC.gameData.map) {
        return {
            success: false,
            error: 'No map data exists for this channel'
        };
    }

    const mapData = activeVC.gameData.map;
    
    // Validate map structure
    if (!mapData.tiles || !Array.isArray(mapData.tiles) || mapData.tiles.length === 0) {
        return {
            success: false,
            error: 'Invalid or empty map tiles'
        };
    }

    // Validate positions
    if (!start || typeof start.x !== 'number' || typeof start.y !== 'number') {
        return {
            success: false,
            error: 'Invalid start position'
        };
    }

    if (!end || typeof end.x !== 'number' || typeof end.y !== 'number') {
        return {
            success: false,
            error: 'Invalid end position'
        };
    }

    // Check bounds
    const height = mapData.tiles.length;
    const width = mapData.tiles[0].length;

    if (start.x < 0 || start.x >= width || start.y < 0 || start.y >= height) {
        return {
            success: false,
            error: `Start position (${start.x}, ${start.y}) is out of bounds`
        };
    }

    if (end.x < 0 || end.x >= width || end.y < 0 || end.y >= height) {
        return {
            success: false,
            error: `End position (${end.x}, ${end.y}) is out of bounds`
        };
    }

    console.log(`[RAILS] Attempting to build rails from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`);

    // Find path using A*
    const path = findPath(start, end, mapData.tiles);

    if (!path) {
        return {
            success: false,
            error: `No valid path found between (${start.x}, ${start.y}) and (${end.x}, ${end.y}). Make sure both points are on floor tiles and a path of floor tiles exists between them.`,
            mapData: mapData
        };
    }

    console.log(`[RAILS] Found path with ${path.length} tiles`);

    // Build rails on the path
    const updatedMapData = buildRailsOnPath(mapData, path);

    return {
        success: true,
        path: path,
        pathLength: path.length,
        mapData: updatedMapData,
        message: `Successfully built ${path.length} rail tiles from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`
    };
}

/**
 * Clear all rails from the map
 * @param {Object} mapData - The map data object
 * @returns {Object} Updated map data without rails
 */
function clearAllRails(mapData) {
    if (!mapData || !mapData.tiles) {
        return mapData;
    }

    let railsCleared = 0;
    
    for (let y = 0; y < mapData.tiles.length; y++) {
        for (let x = 0; x < mapData.tiles[0].length; x++) {
            const tile = mapData.tiles[y][x];
            if (tile && tile.hasRail) {
                delete tile.hasRail;
                railsCleared++;
            }
        }
    }

    console.log(`[RAILS] Cleared ${railsCleared} rail tiles`);
    return mapData;
}

/**
 * Get all positions that have rails
 * @param {Object} mapData - The map data object
 * @returns {Array} Array of positions {x, y} that have rails
 */
function getRailPositions(mapData) {
    const railPositions = [];
    
    if (!mapData || !mapData.tiles) {
        return railPositions;
    }

    for (let y = 0; y < mapData.tiles.length; y++) {
        for (let x = 0; x < mapData.tiles[0].length; x++) {
            const tile = mapData.tiles[y][x];
            if (tile && tile.hasRail) {
                railPositions.push({ x, y });
            }
        }
    }

    return railPositions;
}

/**
 * Check if a specific tile has rails
 * @param {Object} mapData - The map data object
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} True if tile has rails
 */
function hasRailAt(mapData, x, y) {
    return mapData?.tiles?.[y]?.[x]?.hasRail || false;
}

/**
 * Build rails connecting multiple waypoints
 * @param {Object} activeVC - The active voice channel data
 * @param {Array} waypoints - Array of positions to connect with rails
 * @returns {Object} Result object with success status and updated map data
 */
async function buildRailNetwork(activeVC, waypoints) {
    if (!waypoints || waypoints.length < 2) {
        return {
            success: false,
            error: 'Need at least 2 waypoints to build a rail network'
        };
    }

    let currentMapData = activeVC.gameData.map;
    const segments = [];
    let totalRails = 0;

    // Build rails between each consecutive pair of waypoints
    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i + 1];
        
        // Update activeVC with current map data for each segment
        activeVC.gameData.map = currentMapData;
        
        const result = await buildMinecartRails(activeVC, start, end);
        
        if (!result.success) {
            return {
                success: false,
                error: `Failed to build segment ${i + 1}: ${result.error}`,
                segments: segments,
                mapData: currentMapData
            };
        }

        segments.push({
            from: start,
            to: end,
            length: result.pathLength
        });
        
        totalRails += result.pathLength;
        currentMapData = result.mapData;
    }

    return {
        success: true,
        segments: segments,
        totalRails: totalRails,
        mapData: currentMapData,
        message: `Successfully built rail network with ${segments.length} segments and ${totalRails} total rail tiles`
    };
}

module.exports = {
    buildMinecartRails,
    clearAllRails,
    getRailPositions,
    hasRailAt,
    buildRailNetwork,
    findPath
};
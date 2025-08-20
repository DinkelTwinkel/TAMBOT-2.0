// patterns/gachaModes/mining/railPathfindingExtended.js
// Extended rail pathfinding with closest rail detection

const railStorage = require('./railStorage');
const { findPath } = require('./railPathfinding');

/**
 * Find the closest rail tile to a target position that has a valid path
 * @param {Object} mapData - The map data
 * @param {Object} targetPos - Target position {x, y}
 * @param {string} channelId - Channel ID for rail data
 * @returns {Object|null} Closest rail position {x, y, distance, path} or null if no rails/paths exist
 */
async function findClosestReachableRail(mapData, targetPos, channelId) {
    // Get all existing rail positions
    const railsData = await railStorage.getRailsData(channelId);
    const railPositions = railStorage.getAllRailPositions(railsData);
    
    if (railPositions.length === 0) {
        return null;
    }
    
    let closestRail = null;
    let shortestPath = null;
    let shortestDistance = Infinity;
    
    // Check each rail position for reachability
    for (const railPos of railPositions) {
        // Try to find a path from this rail to the target
        const path = findPath(mapData, railPos, targetPos);
        
        if (path && path.length > 0) {
            // Calculate path length (more accurate than straight-line distance)
            const pathDistance = path.length;
            
            if (pathDistance < shortestDistance) {
                shortestDistance = pathDistance;
                shortestPath = path;
                closestRail = railPos;
            }
        }
    }
    
    if (closestRail) {
        return {
            x: closestRail.x,
            y: closestRail.y,
            distance: shortestDistance,
            path: shortestPath
        };
    }
    
    return null;
}

/**
 * Find the optimal starting point for rail building
 * Prioritizes closest reachable rail, falls back to entrance
 * @param {Object} mapData - The map data
 * @param {Object} targetPos - Target position {x, y}
 * @param {string} channelId - Channel ID
 * @returns {Object} Starting point {x, y, isRail, isEntrance, path}
 */
async function findOptimalRailStart(mapData, targetPos, channelId) {
    // First, try to find the closest reachable rail
    const closestRail = await findClosestReachableRail(mapData, targetPos, channelId);
    
    if (closestRail) {
        console.log(`[RAIL PATHFINDING] Found closest rail at (${closestRail.x}, ${closestRail.y}) with distance ${closestRail.distance}`);
        return {
            x: closestRail.x,
            y: closestRail.y,
            isRail: true,
            isEntrance: false,
            path: closestRail.path,
            distance: closestRail.distance
        };
    }
    
    // No reachable rails found, use entrance
    const entrancePos = {
        x: mapData.entranceX,
        y: mapData.entranceY
    };
    
    // Find path from entrance to target
    const entrancePath = findPath(mapData, entrancePos, targetPos);
    
    if (!entrancePath) {
        return {
            x: entrancePos.x,
            y: entrancePos.y,
            isRail: false,
            isEntrance: true,
            path: null,
            distance: Infinity,
            error: 'No path found from entrance to target'
        };
    }
    
    console.log(`[RAIL PATHFINDING] Using entrance at (${entrancePos.x}, ${entrancePos.y}) as starting point`);
    return {
        x: entrancePos.x,
        y: entrancePos.y,
        isRail: false,
        isEntrance: true,
        path: entrancePath,
        distance: entrancePath.length
    };
}

/**
 * Get all rail tiles connected to a specific rail tile
 * @param {Object} railsData - Rails data
 * @param {Object} startPos - Starting position {x, y}
 * @returns {Set} Set of connected rail positions as "x,y" strings
 */
function getConnectedRails(railsData, startPos) {
    const visited = new Set();
    const toVisit = [`${startPos.x},${startPos.y}`];
    
    while (toVisit.length > 0) {
        const current = toVisit.pop();
        if (visited.has(current)) continue;
        
        visited.add(current);
        const [x, y] = current.split(',').map(Number);
        
        // Check all four directions
        const neighbors = [
            `${x},${y-1}`, // North
            `${x+1},${y}`, // East
            `${x},${y+1}`, // South
            `${x-1},${y}`  // West
        ];
        
        for (const neighbor of neighbors) {
            const [nx, ny] = neighbor.split(',').map(Number);
            if (railStorage.hasRail(railsData, nx, ny) && !visited.has(neighbor)) {
                toVisit.push(neighbor);
            }
        }
    }
    
    return visited;
}

/**
 * Check if building rails along a path would connect to existing network
 * @param {string} channelId - Channel ID
 * @param {Array} path - Path array of {x, y} positions
 * @returns {Object} Connection info {connects: boolean, connectionPoint: {x, y}}
 */
async function checkRailNetworkConnection(channelId, path) {
    if (!path || path.length === 0) return { connects: false };
    
    const railsData = await railStorage.getRailsData(channelId);
    
    // Check if any point in the path connects to existing rails
    for (const pos of path) {
        if (railStorage.hasRail(railsData, pos.x, pos.y)) {
            return {
                connects: true,
                connectionPoint: pos
            };
        }
        
        // Also check adjacent tiles for connection
        const adjacent = [
            { x: pos.x, y: pos.y - 1 },
            { x: pos.x + 1, y: pos.y },
            { x: pos.x, y: pos.y + 1 },
            { x: pos.x - 1, y: pos.y }
        ];
        
        for (const adj of adjacent) {
            if (railStorage.hasRail(railsData, adj.x, adj.y)) {
                return {
                    connects: true,
                    connectionPoint: adj
                };
            }
        }
    }
    
    return { connects: false };
}

/**
 * Get statistics about the rail network
 * @param {string} channelId - Channel ID
 * @returns {Object} Network statistics
 */
async function getRailNetworkStats(channelId) {
    const railsData = await railStorage.getRailsData(channelId);
    const allRails = railStorage.getAllRailPositions(railsData);
    
    if (allRails.length === 0) {
        return {
            totalRails: 0,
            networks: 0,
            largestNetwork: 0,
            isolated: 0
        };
    }
    
    // Find all separate networks
    const visited = new Set();
    const networks = [];
    
    for (const rail of allRails) {
        const key = `${rail.x},${rail.y}`;
        if (visited.has(key)) continue;
        
        const network = getConnectedRails(railsData, rail);
        networks.push(network);
        
        for (const pos of network) {
            visited.add(pos);
        }
    }
    
    const largestNetwork = Math.max(...networks.map(n => n.size));
    const isolatedRails = networks.filter(n => n.size === 1).length;
    
    return {
        totalRails: allRails.length,
        networks: networks.length,
        largestNetwork: largestNetwork,
        isolated: isolatedRails,
        networkSizes: networks.map(n => n.size).sort((a, b) => b - a)
    };
}

module.exports = {
    findClosestReachableRail,
    findOptimalRailStart,
    getConnectedRails,
    checkRailNetworkConnection,
    getRailNetworkStats
};
// miningUtils.js - Utility functions for mining operations
const gachaVC = require('../../../models/activevcs');
const { TILE_TYPES, miningItemPool, treasureItems } = require('./miningConstants_unified');

// Enhanced RNG System
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function createPlayerSeed(channelId, memberId) {
    let seed = 0;
    const combined = channelId + memberId;
    for (let i = 0; i < combined.length; i++) {
        seed = (seed * 31 + combined.charCodeAt(i)) % 2147483647;
    }
    return seed;
}

function createMapSeed(channelId, x, y) {
    const combined = `${channelId}_${x}_${y}`;
    let seed = 0;
    for (let i = 0; i < combined.length; i++) {
        seed = (seed * 31 + combined.charCodeAt(i)) % 2147483647;
    }
    return seed;
}

// Individual Player Visibility System
function calculatePlayerVisibility(playerPosition, playerSightRadius, tiles, sightThroughWalls = 0) {
    const visible = new Set();
    
    if (!playerPosition) {
        return visible;
    }
    
    const { x: px, y: py } = playerPosition;
    
    if (playerSightRadius <= 0) {
        // Basic visibility - just adjacent tiles
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const newX = px + dx;
                const newY = py + dy;
                if (newY >= 0 && newY < tiles.length && 
                    newX >= 0 && newX < tiles[0].length) {
                    visible.add(`${newX},${newY}`);
                }
            }
        }
        return visible;
    }
    
    // Player's current position is always visible
    visible.add(`${px},${py}`);
    
    // Ray casting for visibility
    const rayCount = Math.min(64, playerSightRadius * 8);
    for (let i = 0; i < rayCount; i++) {
        const angle = (i * 360) / rayCount;
        const radians = (angle * Math.PI) / 180;
        const dx = Math.cos(radians);
        const dy = Math.sin(radians);
        
        for (let dist = 1; dist <= playerSightRadius; dist++) {
            const checkX = Math.round(px + dx * dist);
            const checkY = Math.round(py + dy * dist);
            
            if (checkY < 0 || checkY >= tiles.length || 
                checkX < 0 || checkX >= tiles[0].length) {
                break;
            }
            
            visible.add(`${checkX},${checkY}`);
            
            const tile = tiles[checkY][checkX];
            if (tile && (tile.type === TILE_TYPES.WALL || 
                       tile.type === TILE_TYPES.WALL_WITH_ORE ||
                       tile.type === TILE_TYPES.REINFORCED_WALL)) {
                // Check if player can see through walls
                if (sightThroughWalls <= 0) {
                    break;
                } else {
                    // Reduce sight through walls ability for each wall encountered
                    sightThroughWalls -= 1;
                }
            }
        }
    }
    
    return visible;
}

// Enhanced Visibility System (Legacy - keeping for compatibility)
function calculateTeamVisibility(playerPositions, teamSightRadius, tiles) {
    const visible = new Set();
    
    if (teamSightRadius <= 0) {
        for (const position of Object.values(playerPositions)) {
            if (!position) continue;
            
            visible.add(`${position.x},${position.y}`);
            
            // Add adjacent tiles in all 8 directions
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const newX = position.x + dx;
                    const newY = position.y + dy;
                    if (newY >= 0 && newY < tiles.length && 
                        newX >= 0 && newX < tiles[0].length) {
                        visible.add(`${newX},${newY}`);
                    }
                }
            }
        }
        return visible;
    }
    
    // Enhanced visibility with light sources
    for (const position of Object.values(playerPositions)) {
        if (!position) continue;
        
        const { x: px, y: py } = position;
        visible.add(`${px},${py}`);
        
        const rayCount = Math.min(64, teamSightRadius * 8);
        for (let i = 0; i < rayCount; i++) {
            const angle = (i * 360) / rayCount;
            const radians = (angle * Math.PI) / 180;
            const dx = Math.cos(radians);
            const dy = Math.sin(radians);
            
            for (let dist = 1; dist <= teamSightRadius; dist++) {
                const checkX = Math.round(px + dx * dist);
                const checkY = Math.round(py + dy * dist);
                
                if (checkY < 0 || checkY >= tiles.length || 
                    checkX < 0 || checkX >= tiles[0].length) {
                    break;
                }
                
                visible.add(`${checkX},${checkY}`);
                
                const tile = tiles[checkY][checkX];
                if (tile && (tile.type === TILE_TYPES.WALL || 
                           tile.type === TILE_TYPES.WALL_WITH_ORE ||
                           tile.type === TILE_TYPES.REINFORCED_WALL)) {
                    break;
                }
            }
        }
    }
    
    return visible;
}

// Enhanced Ore Finding with Caching
let oreCache = { tiles: null, positions: [], rarePositions: [], timestamp: 0 };

function findNearestTarget(position, visibleTiles, tiles, targetTypes = [TILE_TYPES.WALL_WITH_ORE]) {
    const now = Date.now();
    
    if (oreCache.timestamp < now - 15000 || oreCache.tiles !== tiles) {
        oreCache.positions = [];
        oreCache.rarePositions = [];
        oreCache.tiles = tiles;
        oreCache.timestamp = now;
        
        for (let y = 0; y < tiles.length; y++) {
            for (let x = 0; x < tiles[y].length; x++) {
                const tile = tiles[y][x];
                if (tile) {
                    if (tile.type === TILE_TYPES.WALL_WITH_ORE) {
                        oreCache.positions.push({ x, y, type: tile.type });
                    } else if (tile.type === TILE_TYPES.RARE_ORE || tile.type === TILE_TYPES.TREASURE_CHEST) {
                        oreCache.rarePositions.push({ x, y, type: tile.type });
                    }
                }
            }
        }
    }
    
    let nearestTarget = null;
    let minDistance = Infinity;
    
    const allTargets = [...oreCache.rarePositions, ...oreCache.positions];
    
    for (const target of allTargets) {
        if (targetTypes.includes(target.type)) {
            const tileKey = `${target.x},${target.y}`;
            if (visibleTiles.has(tileKey)) {
                const distance = Math.abs(target.x - position.x) + Math.abs(target.y - position.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestTarget = target;
                }
            }
        }
    }
    
    return nearestTarget;
}

// Function to clear ore cache when map changes
function clearOreCache() {
    oreCache.timestamp = 0;
}

// Enhanced Mining System
function pickWeightedItem(powerLevel, tileType = TILE_TYPES.WALL_WITH_ORE) {
    let itemPool = miningItemPool;
    
    if (tileType === TILE_TYPES.RARE_ORE) {
        itemPool = miningItemPool.filter(item => item.tier === 'epic' || item.tier === 'legendary');
    } else if (tileType === TILE_TYPES.TREASURE_CHEST) {
        if (Math.random() < 0.3) {
            const treasureItem = treasureItems[Math.floor(Math.random() * treasureItems.length)];
            return { ...treasureItem, itemId: treasureItem.itemId };
        }
        itemPool = miningItemPool.filter(item => item.tier === 'rare' || item.tier === 'epic');
    }
    
    const weightedItems = itemPool.map(item => {
        let weight = item.baseWeight;
        
        if (powerLevel === item.boostedPowerLevel) {
            weight *= 2;
        }
        
        switch (item.tier) {
            case 'legendary': weight *= 0.3; break;
            case 'epic': weight *= 0.6; break;
            case 'rare': weight *= 0.8; break;
        }
        
        return { ...item, weight };
    });
    
    const totalWeight = weightedItems.reduce((sum, i) => sum + i.weight, 0);
    let rand = Math.random() * totalWeight;
    return weightedItems.find(i => (rand -= i.weight) < 0) || weightedItems[0];
}

// Enhanced Movement System
function getDirectionToTarget(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    
    if (Math.abs(dx) === Math.abs(dy) && Math.random() < 0.5) {
        return dy > 0 ? { dx: 0, dy: 1, name: 'south' } : { dx: 0, dy: -1, name: 'north' };
    }
    
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? { dx: 1, dy: 0, name: 'east' } : { dx: -1, dy: 0, name: 'west' };
    } else if (dy !== 0) {
        return dy > 0 ? { dx: 0, dy: 1, name: 'south' } : { dx: 0, dy: -1, name: 'north' };
    } else if (dx !== 0) {
        return dx > 0 ? { dx: 1, dy: 0, name: 'east' } : { dx: -1, dy: 0, name: 'west' };
    }
    
    return { dx: 0, dy: 0, name: 'none' };
}

function getRandomDirection(seed) {
    const directions = [
        { dx: 0, dy: -1, name: 'north' },
        { dx: 1, dy: 0, name: 'east' },
        { dx: 0, dy: 1, name: 'south' },
        { dx: -1, dy: 0, name: 'west' }
    ];
    
    const index = Math.floor(seededRandom(seed) * directions.length);
    return directions[index];
}

// Tile Breaking Logic
async function canBreakTile(playerId, miningPower, tile) {
    if (!tile || !tile.hardness) return true;

    const hardness = tile.hardness;

    // Flat 5% chance if mining power is 0 or below
    if (miningPower <= 0) {
        return Math.random() < 0.05;
    }

    // Increased multiplier: easier to break at low power
    const breakChance = Math.min(0.95, (miningPower / hardness) * 0.5);

    const seed = parseInt(playerId) + Date.now();
    return seededRandom(seed) < breakChance;
}



// Enhanced Pickaxe Durability System
function calculateDurabilityLoss(tileHardness = 1) {
    // Base durability loss is 1, multiplied by tile hardness
    // Harder tiles cause more durability damage
    const baseLoss = 1;
    const hardnessMultiplier = Math.max(1, tileHardness / 2); // Scale hardness impact
    return Math.ceil(baseLoss * hardnessMultiplier);
}

function checkPickaxeBreak(pickaxe, tileHardness = 1) {
    if (!pickaxe) return { shouldBreak: false, durabilityLoss: 0 };
    
    // Get current durability (check various possible locations)
    const currentDurability = pickaxe.currentDurability || pickaxe.durability || pickaxe.stats?.durability || 0;
    
    // Calculate how much durability is lost from this mining action
    const durabilityLoss = calculateDurabilityLoss(tileHardness);
    
    // Check if pickaxe should break (durability would go to 0 or below)
    const newDurability = currentDurability - durabilityLoss;
    const shouldBreak = newDurability <= 0;
    
    if (shouldBreak) {
        console.log(`Pickaxe ${pickaxe.name} broke! Durability: ${currentDurability} - ${durabilityLoss} = ${newDurability}`);
    }
    
    return { shouldBreak, durabilityLoss, newDurability };
}

// Minecart Summary Helper
async function getMinecartSummary(channelId) {
    // Fetch only minecart data
    const freshEntry = await gachaVC.findOne(
        { channelId }, 
        { 'gameData.minecart': 1 }
    ).lean();

    const minecart = freshEntry?.gameData?.minecart;
    
    if (!minecart || !minecart.items) return { totalValue: 0, itemCount: 0, summary: "Empty" };

    const showAmount = 10;
    let totalValue = 0;
    let totalItems = 0;
    const itemSummaries = [];
    
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        const poolItem = miningItemPool.find(item => item.itemId === itemId) ||
                        treasureItems.find(item => item.itemId === itemId);
        
        if (poolItem && itemData.quantity > 0) {
            const itemValue = poolItem.value * itemData.quantity;
            totalValue += itemValue;
            totalItems += itemData.quantity;
            
            // Show only top 3 items in summary to keep it concise
            if (itemSummaries.length < showAmount) {
                itemSummaries.push(`${poolItem.name} x${itemData.quantity}`);
            }
        }
    }
    
    let summary;
    if (itemSummaries.length === 0) {
        summary = "Empty";
    } else {
        summary = itemSummaries.join(', ');
        if (Object.keys(minecart.items).length > showAmount) {
            summary += `, +${Object.keys(minecart.items).length - showAmount} more`;
        }
    }
    
    return {
        totalValue,
        itemCount: totalItems,
        summary
    };
}

/**
 * Find the nearest undiscovered wall that could contain ore
 * @param {Object} position - Player position
 * @param {Object} mapData - Map data
 * @param {Set} teamVisibleTiles - Currently visible tiles
 * @returns {Object|null} Target position or null
 */
function findNearestUndiscoveredWall(position, mapData, teamVisibleTiles) {
    let nearestTarget = null;
    let minDistance = Infinity;
    
    // Look for walls adjacent to discovered areas (likely to be worth breaking)
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            const tile = mapData.tiles[y]?.[x];
            if (!tile || tile.discovered) continue;
            
            // Check if this undiscovered tile is a wall adjacent to discovered areas
            const isWall = tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.WALL_WITH_ORE;
            if (!isWall) continue;
            
            // Check if adjacent to any discovered tile (good exploration candidate)
            const hasDiscoveredNeighbor = [
                { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, 
                { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
            ].some(dir => {
                const adjX = x + dir.dx;
                const adjY = y + dir.dy;
                const adjTile = mapData.tiles[adjY]?.[adjX];
                return adjTile && adjTile.discovered;
            });
            
            if (hasDiscoveredNeighbor) {
                const distance = Math.abs(x - position.x) + Math.abs(y - position.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestTarget = { x, y, type: tile.type };
                }
            }
        }
    }
    
    return nearestTarget;
}

/**
 * Get direction biased toward unexplored areas and map expansion
 * @param {Object} position - Player position
 * @param {Object} mapData - Map data
 * @param {string} memberId - Member ID for seeding
 * @returns {Object} Direction object
 */
function getExplorationDirection(position, mapData, memberId) {
    const directions = [
        { dx: 0, dy: -1, name: 'north' },
        { dx: 1, dy: 0, name: 'east' },
        { dx: 0, dy: 1, name: 'south' },
        { dx: -1, dy: 0, name: 'west' }
    ];
    
    // Calculate bias toward less explored areas
    const directionScores = directions.map(dir => {
        const targetX = position.x + dir.dx;
        const targetY = position.y + dir.dy;
        
        let score = 1; // Base score
        
        // Bias toward map edges (expansion)
        const distanceToEdge = Math.min(
            targetX, mapData.width - 1 - targetX,
            targetY, mapData.height - 1 - targetY
        );
        
        if (distanceToEdge < 3) {
            score += 2; // Prefer moving toward edges
        }
        
        // Bias toward areas with fewer discovered tiles nearby
        let discoveredNearby = 0;
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const checkX = targetX + dx;
                const checkY = targetY + dy;
                const tile = mapData.tiles[checkY]?.[checkX];
                if (tile && tile.discovered) {
                    discoveredNearby++;
                }
            }
        }
        
        // Prefer directions with fewer discovered tiles nearby
        score += Math.max(0, 10 - discoveredNearby);
        
        return { ...dir, score };
    });
    
    // Weighted random selection based on scores
    const totalScore = directionScores.reduce((sum, dir) => sum + dir.score, 0);
    let rand = Math.random() * totalScore;
    
    for (const dir of directionScores) {
        rand -= dir.score;
        if (rand <= 0) {
            return dir;
        }
    }
    
    // Fallback to first direction
    return directionScores[0];
}

module.exports = {
    seededRandom,
    createPlayerSeed,
    createMapSeed,
    calculateTeamVisibility,
    calculatePlayerVisibility,
    findNearestTarget,
    clearOreCache,
    pickWeightedItem,
    getDirectionToTarget,
    getRandomDirection,
    canBreakTile,
    calculateDurabilityLoss,
    checkPickaxeBreak,
    getMinecartSummary,
    findNearestUndiscoveredWall,
    getExplorationDirection
};

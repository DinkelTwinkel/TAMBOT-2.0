// miningUtils.js - Utility functions for mining operations
const { TILE_TYPES, miningItemPool, treasureItems } = require('./miningConstants');

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

// Enhanced Visibility System
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
    
    if (miningPower <= 0) {
        return Math.random() < 0.005;
    }
    
    const breakChance = Math.min(0.95, (miningPower / hardness) * 0.25);
    const seed = parseInt(playerId) + Date.now();
    // return seededRandom(seed) < breakChance;
    return Math.random() < 0.5;
}

// Enhanced Pickaxe System
function checkPickaxeBreak(pickaxe, tileHardness = 1) {
    if (!pickaxe || !pickaxe.durability) return false;
    
    const hardnessPenalty = tileHardness * 5;
    const adjustedDurability = Math.max(10, pickaxe.durability - hardnessPenalty);
    
    const roll = Math.floor(Math.random() * 100) + 1;
    return roll > adjustedDurability;
}

// Minecart Summary Helper
function getMinecartSummary(dbEntry) {
    const minecart = dbEntry.gameData?.minecart;
    if (!minecart || !minecart.items) return { totalValue: 0, itemCount: 0, summary: "Empty" };
    
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
            if (itemSummaries.length < 3) {
                itemSummaries.push(`${poolItem.name} x${itemData.quantity}`);
            }
        }
    }
    
    let summary;
    if (itemSummaries.length === 0) {
        summary = "Empty";
    } else {
        summary = itemSummaries.join(', ');
        if (Object.keys(minecart.items).length > 3) {
            summary += `, +${Object.keys(minecart.items).length - 3} more`;
        }
    }
    
    return {
        totalValue,
        itemCount: totalItems,
        summary
    };
}

module.exports = {
    seededRandom,
    createPlayerSeed,
    createMapSeed,
    calculateTeamVisibility,
    findNearestTarget,
    clearOreCache,
    pickWeightedItem,
    getDirectionToTarget,
    getRandomDirection,
    canBreakTile,
    checkPickaxeBreak,
    getMinecartSummary
};

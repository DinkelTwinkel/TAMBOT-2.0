// miningMap.js - Map generation and management for mining
const { 
    INITIAL_MAP_WIDTH, 
    INITIAL_MAP_HEIGHT, 
    BASE_ORE_SPAWN_CHANCE, 
    MAX_MAP_SIZE, 
    TILE_TYPES 
} = require('./miningConstants');
const { createMapSeed, seededRandom } = require('./miningUtils');

// Enhanced Map Generation
function generateTileType(channelId, x, y) {
    const mapSeed = createMapSeed(channelId, x, y);
    const random = seededRandom(mapSeed);
    
    if (random < 0.01) return TILE_TYPES.TREASURE_CHEST;
    if (random < 0.03) return TILE_TYPES.RARE_ORE;
    //if (random < 0.05) return TILE_TYPES.HAZARD;
    //if (random < 0.15) return TILE_TYPES.REINFORCED_WALL;
    if (random < BASE_ORE_SPAWN_CHANCE + 0.15) return TILE_TYPES.WALL_WITH_ORE;
    
    return TILE_TYPES.WALL;
}

function getTileHardness(tileType) {
    switch (tileType) {
        case TILE_TYPES.WALL: return 1;
        case TILE_TYPES.WALL_WITH_ORE: return 1;
        case TILE_TYPES.RARE_ORE: return 2;
        case TILE_TYPES.REINFORCED_WALL: return 2;
        case TILE_TYPES.TREASURE_CHEST: return 1;
        default: return 0;
    }
}

function initializeMap(channelId) {
    const map = [];
    
    for (let y = 0; y < INITIAL_MAP_HEIGHT; y++) {
        const row = [];
        for (let x = 0; x < INITIAL_MAP_WIDTH; x++) {
            const tileType = generateTileType(channelId, x, y);
            row.push({ 
                type: tileType, 
                discovered: false,
                hardness: getTileHardness(tileType)
            });
        }
        map.push(row);
    }
    
    // Create starting area
    const centerX = Math.floor(INITIAL_MAP_WIDTH / 2);
    const centerY = Math.floor(INITIAL_MAP_HEIGHT / 2);
    
    for (let y = centerY - 1; y <= centerY + 1; y++) {
        for (let x = centerX - 1; x <= centerX + 1; x++) {
            if (y >= 0 && y < INITIAL_MAP_HEIGHT && x >= 0 && x < INITIAL_MAP_WIDTH) {
                map[y][x] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
            }
        }
    }
    
    const entranceX = centerX;
    const entranceY = 0;
    map[entranceY][entranceX] = { type: TILE_TYPES.ENTRANCE, discovered: true, hardness: 0 };
    
    return {
        tiles: map,
        width: INITIAL_MAP_WIDTH,
        height: INITIAL_MAP_HEIGHT,
        entranceX,
        entranceY,
        playerPositions: {}
    };
}

function expandMap(mapData, direction, channelId) {
    const { tiles, width, height } = mapData;
    
    // Prevent infinite expansion
    if (width >= MAX_MAP_SIZE || height >= MAX_MAP_SIZE) {
        return mapData;
    }
    
    let newTiles, newWidth, newHeight;
    
    switch (direction) {
        case 'north':
            const newNorthRow = [];
            for (let x = 0; x < width; x++) {
                const tileType = generateTileType(channelId, x, -1);
                newNorthRow.push({ 
                    type: tileType, 
                    discovered: false,
                    hardness: getTileHardness(tileType)
                });
            }
            newTiles = [newNorthRow, ...tiles];
            newWidth = width;
            newHeight = height + 1;
            
            for (const [playerId, pos] of Object.entries(mapData.playerPositions || {})) {
                pos.y += 1;
            }
            mapData.entranceY += 1;
            break;
            
        case 'south':
            newTiles = [...tiles];
            const newSouthRow = [];
            for (let x = 0; x < width; x++) {
                const tileType = generateTileType(channelId, x, height);
                newSouthRow.push({ 
                    type: tileType, 
                    discovered: false,
                    hardness: getTileHardness(tileType)
                });
            }
            newTiles.push(newSouthRow);
            newWidth = width;
            newHeight = height + 1;
            break;
            
        case 'east':
            newTiles = tiles.map((row, y) => {
                const tileType = generateTileType(channelId, width, y);
                return [...row, { 
                    type: tileType, 
                    discovered: false,
                    hardness: getTileHardness(tileType)
                }];
            });
            newWidth = width + 1;
            newHeight = height;
            break;
            
        case 'west':
            newTiles = tiles.map((row, y) => {
                const tileType = generateTileType(channelId, -1, y);
                return [{ 
                    type: tileType, 
                    discovered: false,
                    hardness: getTileHardness(tileType)
                }, ...row];
            });
            newWidth = width + 1;
            newHeight = height;
            
            for (const [playerId, pos] of Object.entries(mapData.playerPositions || {})) {
                pos.x += 1;
            }
            mapData.entranceX += 1;
            break;
    }
    
    // Clear ore cache since map changed
    const { clearOreCache } = require('./miningUtils');
    clearOreCache();
    
    return {
        ...mapData,
        tiles: newTiles,
        width: newWidth,
        height: newHeight
    };
}

/**
 * Initialize player positions during breaks (scattered around entrance as tents)
 */
function initializeBreakPositions(mapData, members, isBreak = false) {
    if (!isBreak) {
        // Normal mining - all players at entrance
        for (const member of members.values()) {
            if (!mapData.playerPositions[member.id]) {
                mapData.playerPositions[member.id] = {
                    x: mapData.entranceX,
                    y: mapData.entranceY
                };
            }
        }
        return mapData;
    }

    // Break mode - scatter players as tents around entrance
    const { scatterPlayersForBreak } = require('./miningEvents');
    const playerCount = members.size;
    
    // Create scattered positions for all players
    const scatteredPositions = scatterPlayersForBreak(
        mapData.playerPositions, 
        mapData.entranceX, 
        mapData.entranceY, 
        playerCount
    );
    
    // Apply scattered positions to all current players
    for (const member of members.values()) {
        if (scatteredPositions[member.id]) {
            mapData.playerPositions[member.id] = scatteredPositions[member.id];
        } else {
            // Fallback for any players not in scattered positions
            mapData.playerPositions[member.id] = {
                x: mapData.entranceX,
                y: mapData.entranceY,
                isTent: true
            };
        }
    }
    
    return mapData;
}

/**
 * Remove positions for players no longer in VC
 */
function cleanupPlayerPositions(mapData, currentPlayerIds) {
    for (const playerId of Object.keys(mapData.playerPositions)) {
        if (!currentPlayerIds.includes(playerId)) {
            delete mapData.playerPositions[playerId];
        }
    }
    return mapData;
}

/**
 * Check if map expansion is needed and perform it
 */
function checkMapExpansion(mapData, newX, newY, channelId) {
    let needsExpansion = false;
    let expansionDirection = '';
    
    if (newY < 0 && mapData.height < MAX_MAP_SIZE) {
        needsExpansion = true;
        expansionDirection = 'north';
    } else if (newX < 0 && mapData.width < MAX_MAP_SIZE) {
        needsExpansion = true;
        expansionDirection = 'west';
    } else if (newX >= mapData.width && mapData.width < MAX_MAP_SIZE) {
        needsExpansion = true;
        expansionDirection = 'east';
    } else if (newY >= mapData.height && mapData.height < MAX_MAP_SIZE) {
        needsExpansion = true;
        expansionDirection = 'south';
    }
    
    if (needsExpansion) {
        return expandMap(mapData, expansionDirection, channelId);
    }
    
    return mapData;
}

module.exports = {
    generateTileType,
    getTileHardness,
    initializeMap,
    expandMap,
    initializeBreakPositions,
    cleanupPlayerPositions,
    checkMapExpansion
};

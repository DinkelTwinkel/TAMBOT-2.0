// miningMap.js - Map generation and management for mining
const { 
    INITIAL_MAP_WIDTH, 
    INITIAL_MAP_HEIGHT, 
    BASE_ORE_SPAWN_CHANCE, 
    MAX_MAP_SIZE, 
    TILE_TYPES,
    POWER_LEVEL_CONFIG,
    getHazardSpawnChance
} = require('./miningConstants_unified');
const hazardStorage = require('./hazardStorage');
const { createMapSeed, seededRandom } = require('./miningUtils');
const coordinateManager = require('./coordinateManager');

// Enhanced Map Generation with power level support
function generateTileType(channelId, x, y, powerLevel = 1) {
    const mapSeed = createMapSeed(channelId, x, y);
    const random = seededRandom(mapSeed);
    
    // Get reinforced wall chance from power level config
    const powerConfig = POWER_LEVEL_CONFIG[powerLevel] || POWER_LEVEL_CONFIG[1];
    const reinforcedWallChance = powerConfig.reinforcedWallChance || 0.05;
    
    //if (random < 0.01) return TILE_TYPES.TREASURE_CHEST;
    if (random < 0.03) return TILE_TYPES.RARE_ORE;
    // Note: Hazards are now stored separately, not as tile types
    if (random < reinforcedWallChance) return TILE_TYPES.REINFORCED_WALL;  // Dynamic based on power level
    if (random < BASE_ORE_SPAWN_CHANCE + 0.15) return TILE_TYPES.WALL_WITH_ORE;
    
    return TILE_TYPES.WALL;
}

function getTileHardness(tileType, powerLevel = 1) {
    // Base hardness values
    let baseHardness;
    switch (tileType) {
        case TILE_TYPES.WALL: baseHardness = 1; break;
        case TILE_TYPES.WALL_WITH_ORE: baseHardness = 2; break;
        case TILE_TYPES.RARE_ORE: baseHardness = 3; break;
        case TILE_TYPES.REINFORCED_WALL: baseHardness = 5; break;
        case TILE_TYPES.TREASURE_CHEST: baseHardness = 1; break;
        default: return 0;
    }
    
    // Scale hardness with power level (25% increase per level)
    const hardnessMultiplier = 1 + ((powerLevel - 1) * 0.25);
    return Math.max(1, Math.ceil(baseHardness * hardnessMultiplier));
}

function initializeMap(channelId, powerLevel = 1) {
    const map = [];
    
    for (let y = 0; y < INITIAL_MAP_HEIGHT; y++) {
        const row = [];
        for (let x = 0; x < INITIAL_MAP_WIDTH; x++) {
            const tileType = generateTileType(channelId, x, y, powerLevel);
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

function expandMap(mapData, direction, channelId, powerLevel = 1) {
    const { tiles, width, height } = mapData;
    
    console.log(`[MAP] Attempting to expand map ${direction} from ${width}x${height}`);
    
    // Prevent infinite expansion
    if (width >= MAX_MAP_SIZE || height >= MAX_MAP_SIZE) {
        console.log(`[MAP] Cannot expand - reached MAX_MAP_SIZE (${MAX_MAP_SIZE})`);
        return mapData;
    }
    
    let newTiles, newWidth, newHeight;
    
    switch (direction) {
        case 'north':
            const newNorthRow = [];
            for (let x = 0; x < width; x++) {
                const tileType = generateTileType(channelId, x, -1, powerLevel);
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
                const tileType = generateTileType(channelId, x, height, powerLevel);
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
                const tileType = generateTileType(channelId, width, y, powerLevel);
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
                const tileType = generateTileType(channelId, -1, y, powerLevel);
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
    
    console.log(`[MAP] Map expanded ${direction}: ${width}x${height} -> ${newWidth}x${newHeight}`);
    
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

    // Break mode - scatter players as tents around entrance on floor tiles
    const { scatterPlayersForBreak } = require('./miningEvents');
    const playerCount = members.size;
    
    // Create scattered positions for all players on floor tiles
    const scatteredPositions = scatterPlayersForBreak(
        mapData.playerPositions, 
        mapData.entranceX, 
        mapData.entranceY, 
        playerCount,
        mapData
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
 * Returns the expanded map if expansion occurred, or the original map if not
 * @param {Object} mapData - The current map data
 * @param {number} newX - X coordinate to check
 * @param {number} newY - Y coordinate to check
 * @param {string} channelId - Channel ID for the map
 * @param {Object} hazardsData - Optional hazards data to generate hazards for new area
 * @param {number} serverPowerLevel - Optional server power level for hazard generation
 * @param {number} hazardSpawnChanceOverride - Optional override for hazard spawn chance (for danger 6-7)
 */
async function checkMapExpansion(mapData, newX, newY, channelId, hazardsData = null, serverPowerLevel = 1, hazardSpawnChanceOverride = null, mineTypeId = null) {
    // Note: serverPowerLevel is already passed in, use it for map expansion
    let needsExpansion = false;
    let expansionDirection = '';
    
    // Store original dimensions for coordinate updates
    const originalEntranceX = mapData.entranceX;
    const originalEntranceY = mapData.entranceY;
    
    // Check if expansion is needed and possible
    if (newY < 0) {
        if (mapData.height < MAX_MAP_SIZE) {
            needsExpansion = true;
            expansionDirection = 'north';
        }
    } else if (newX < 0) {
        if (mapData.width < MAX_MAP_SIZE) {
            needsExpansion = true;
            expansionDirection = 'west';
        }
    } else if (newX >= mapData.width) {
        if (mapData.width < MAX_MAP_SIZE) {
            needsExpansion = true;
            expansionDirection = 'east';
        }
    } else if (newY >= mapData.height) {
        if (mapData.height < MAX_MAP_SIZE) {
            needsExpansion = true;
            expansionDirection = 'south';
        }
    }
    
    if (needsExpansion && expansionDirection) {
        console.log(`[MAP] Expansion needed at (${newX}, ${newY}) - direction: ${expansionDirection}`);
        const expandedMap = expandMap(mapData, expansionDirection, channelId, serverPowerLevel);
        
        // Calculate coordinate shift
        const shiftX = expandedMap.entranceX - originalEntranceX;
        const shiftY = expandedMap.entranceY - originalEntranceY;
        
        // Update rail and hazard coordinates if they shifted
        if (shiftX !== 0 || shiftY !== 0) {
            console.log(`[MAP] Coordinate shift detected: (${shiftX}, ${shiftY})`);
            await Promise.all([
                coordinateManager.updateRailCoordinates(channelId, shiftX, shiftY),
                coordinateManager.updateHazardCoordinates(channelId, shiftX, shiftY)
            ]);
        }
        
        // Store new map dimensions
        await coordinateManager.storeMapDimensions(channelId, expandedMap);
        
        // Generate hazards for the new expanded area if hazardsData provided
        if (hazardsData && serverPowerLevel) {
            // Use override if provided (for enhanced danger levels), otherwise use normal chance
            const hazardSpawnChance = hazardSpawnChanceOverride !== null ? hazardSpawnChanceOverride : getHazardSpawnChance(serverPowerLevel);
            let startX, startY, width, height;
            
            switch (expansionDirection) {
                case 'north':
                    startX = 0;
                    startY = 0;
                    width = expandedMap.width;
                    height = 1;
                    break;
                case 'south':
                    startX = 0;
                    startY = expandedMap.height - 1;
                    width = expandedMap.width;
                    height = 1;
                    break;
                case 'east':
                    startX = expandedMap.width - 1;
                    startY = 0;
                    width = 1;
                    height = expandedMap.height;
                    break;
                case 'west':
                    startX = 0;
                    startY = 0;
                    width = 1;
                    height = expandedMap.height;
                    break;
            }
            
            hazardStorage.generateHazardsForArea(
                hazardsData,
                startX,
                startY,
                width,
                height,
                hazardSpawnChance,
                serverPowerLevel,
                mineTypeId  // Pass mine type ID for filtering allowed hazards
            );
        }
        
        return expandedMap;
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

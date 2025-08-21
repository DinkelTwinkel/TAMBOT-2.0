// generateMiningProcedural_layered.js - Enhanced with layered rendering system
const { createCanvas, loadImage } = require('canvas');
const gachaVC = require('../../../../models/activevcs');
const getPlayerStats = require('../../../calculatePlayerStat');
const itemSheet = require('../../../../data/itemSheet.json');
const PlayerInventory = require('../../../../models/inventory');
const path = require('path');
const fs = require('fs').promises;
const { generateThemeImages } = require('./generateMissingImages');
const railStorage = require('../railStorage');

// Import the proper modules - check if they exist as encounter or hazard
let encounterStorage, ENCOUNTER_TYPES, ENCOUNTER_CONFIG;
try {
    // Try loading as encounter modules first
    encounterStorage = require('../encounterStorage');
    const constants = require('../miningConstants');
    ENCOUNTER_TYPES = constants.ENCOUNTER_TYPES;
    ENCOUNTER_CONFIG = constants.ENCOUNTER_CONFIG;
} catch (e) {
    // Fall back to hazard modules if encounter modules don't exist yet
    try {
        encounterStorage = require('../hazardStorage');
        const constants = require('../miningConstants');
        ENCOUNTER_TYPES = constants.HAZARD_TYPES;
        ENCOUNTER_CONFIG = constants.HAZARD_CONFIG;
    } catch (e2) {
        console.warn('Neither encounter nor hazard modules found, using defaults');
        // Provide defaults if neither exists
        ENCOUNTER_TYPES = {
            PORTAL_TRAP: 'portal_trap',
            BOMB_TRAP: 'bomb_trap',
            GREEN_FOG: 'green_fog',
            WALL_TRAP: 'wall_trap',
            TREASURE: 'treasure'
        };
        ENCOUNTER_CONFIG = {};
        encounterStorage = {
            getEncountersData: async () => ({}),
            getEncounter: () => null,
            hasEncounter: () => false
        };
    }
}

// Constants
const FLOOR_TILE_SIZE = 64;
const WALL_TILE_HEIGHT = 90; // Taller for perspective, same width as floor
const PLAYER_AVATAR_SIZE = 50;
const STACKED_OFFSET = 10;

// Image optimization constants
const MAX_IMAGE_WIDTH = 1000;
const MAX_IMAGE_HEIGHT = 1000;
const MIN_TILE_SIZE = 5;
const JPEG_QUALITY = 0.8;
const USE_JPEG_THRESHOLD = 300;
const BORDER_SIZE = 5;

// Render layers
const RENDER_LAYERS = {
    FLOOR: 0,      // Bottom layer - floor tiles and floor decorations
    MIDGROUND: 1,  // Middle layer - walls, players, hazards, treasure
    TOP: 2         // Top layer - clouds, transparent effects
};

// Enhanced tile types (treasure is now part of encounters)
const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor', 
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore',
    RARE_ORE: 'rare_ore',
    REINFORCED_WALL: 'reinforced'
};

// Mine themes mapped to gachaServers.json image field
const MINE_THEMES = {
    COAL: 'coalMine',
    COPPER: 'copperMine',
    TOPAZ: 'topazMine',
    IRON: 'ironMine',
    DIAMOND: 'diamondMine',
    EMERALD: 'emeraldMine',
    RUBY: 'rubyMine',
    CRYSTAL: 'crystalMine',
    OBSIDIAN: 'obsidianMine',
    MYTHRIL: 'mythrilMine',
    ADAMANTITE: 'adamantiteMine',
    FOSSIL: 'fossilMine',
    GENERIC: 'generic'
};

// Cache for loaded tile images
const tileImageCache = new Map();

// Fallback colors when images aren't available
const TILE_COLORS = {
    [TILE_TYPES.WALL]: '#444444',
    [TILE_TYPES.FLOOR]: '#DDDDDD',
    [TILE_TYPES.ENTRANCE]: '#FF4444',
    [TILE_TYPES.WALL_WITH_ORE]: '#444444',
    [TILE_TYPES.RARE_ORE]: '#6A0DAD',
    [TILE_TYPES.REINFORCED_WALL]: '#2F2F2F'
};

/**
 * Get the current mine theme from gachaServers.json image field
 */
function getMineTheme(dbEntry) {
    // Get theme from the server's image field in gachaServers.json
    const imageField = dbEntry?.activeGachaServer?.image;
    
    if (!imageField || imageField === 'placeHolder') {
        // Try to infer from server name
        const serverName = dbEntry?.activeGachaServer?.name || '';
        const cleanName = serverName.replace(/⛏️|️/g, '').trim().toLowerCase();
        
        if (cleanName.includes('coal')) return MINE_THEMES.COAL;
        if (cleanName.includes('copper')) return MINE_THEMES.COPPER;
        if (cleanName.includes('topaz')) return MINE_THEMES.TOPAZ;
        if (cleanName.includes('iron')) return MINE_THEMES.IRON;
        if (cleanName.includes('diamond')) return MINE_THEMES.DIAMOND;
        if (cleanName.includes('emerald')) return MINE_THEMES.EMERALD;
        if (cleanName.includes('ruby')) return MINE_THEMES.RUBY;
        if (cleanName.includes('crystal')) return MINE_THEMES.CRYSTAL;
        if (cleanName.includes('obsidian')) return MINE_THEMES.OBSIDIAN;
        if (cleanName.includes('mythril')) return MINE_THEMES.MYTHRIL;
        if (cleanName.includes('adamantite')) return MINE_THEMES.ADAMANTITE;
        if (cleanName.includes('fossil')) return MINE_THEMES.FOSSIL;
        
        return MINE_THEMES.GENERIC;
    }
    
    // Use the image field directly as theme if it's not a placeholder
    return imageField;
}

/**
 * Load a random variation of a tile image
 * Tries to load variations like: coalMine_floor_1.png, coalMine_floor_2.png, etc.
 * If not found, generates the image programmatically and saves it
 */
async function loadTileImageVariation(tileType, theme = MINE_THEMES.GENERIC, variationSeed = 0) {
    const cacheKey = `${theme}_${tileType}_${variationSeed}`;
    
    if (tileImageCache.has(cacheKey)) {
        return tileImageCache.get(cacheKey);
    }
    
    // Determine base name for tile type
    let baseName;
    switch (tileType) {
        case TILE_TYPES.WALL:
            baseName = 'wall';
            break;
        case TILE_TYPES.FLOOR:
            baseName = 'floor';
            break;
        case TILE_TYPES.ENTRANCE:
            baseName = 'entrance';
            break;
        case TILE_TYPES.WALL_WITH_ORE:
            baseName = 'wallOre';
            break;
        case TILE_TYPES.RARE_ORE:
            baseName = 'rareOre';
            break;
        case TILE_TYPES.REINFORCED_WALL:
            baseName = 'wallReinforced';
            break;
        default:
            baseName = 'floor';
    }
    
    // Try to load variations (1-3 by default)
    const maxVariations = 3;
    const variation = (variationSeed % maxVariations) + 1;
    
    // Try theme-specific image first
    const primaryPath = variation > 1 ?
        `./assets/game/tiles/${theme}_${baseName}_${variation}.png` :
        `./assets/game/tiles/${theme}_${baseName}.png`;
    
    try {
        const image = await loadImage(primaryPath);
        tileImageCache.set(cacheKey, image);
        return image;
    } catch (error) {
        // Image doesn't exist, try to generate it
        console.log(`Image not found: ${primaryPath}, generating...`);
        
        try {
            // Generate missing images for this theme
            await generateThemeImages(theme);
            
            // Try loading again after generation
            const image = await loadImage(primaryPath);
            tileImageCache.set(cacheKey, image);
            return image;
        } catch (genError) {
            console.warn(`Failed to generate or load tile image: ${primaryPath}`);
            // Try fallback to generic theme
            const genericPath = variation > 1 ?
                `./assets/game/tiles/generic_${baseName}_${variation}.png` :
                `./assets/game/tiles/generic_${baseName}.png`;
            
            try {
                const image = await loadImage(genericPath);
                tileImageCache.set(cacheKey, image);
                return image;
            } catch (genericError) {
                // Generate generic version
                try {
                    await generateThemeImages('generic');
                    const image = await loadImage(genericPath);
                    tileImageCache.set(cacheKey, image);
                    return image;
                } catch (finalError) {
                    // Cache the failure
                    tileImageCache.set(cacheKey, null);
                    return null;
                }
            }
        }
    }
}

/**
 * Load an encounter image (hazards, treasures, etc.)
 * If not found, generates the image programmatically and saves it
 */
async function loadEncounterImage(encounterType, theme = MINE_THEMES.GENERIC) {
    const cacheKey = `encounter_${theme}_${encounterType}`;
    
    if (tileImageCache.has(cacheKey)) {
        return tileImageCache.get(cacheKey);
    }
    
    // Get image filename from ENCOUNTER_CONFIG if available
    const config = ENCOUNTER_CONFIG[encounterType];
    const imageFileName = config?.image || encounterType;
    
    // Try to load the encounter image
    const primaryPath = `./assets/game/encounters/${theme}_${imageFileName}.png`;
    
    try {
        const image = await loadImage(primaryPath);
        tileImageCache.set(cacheKey, image);
        return image;
    } catch (error) {
        // Image doesn't exist, try to generate it
        console.log(`Encounter image not found: ${primaryPath}, generating...`);
        
        try {
            // Generate missing images for this theme
            await generateThemeImages(theme);
            
            // Try loading again after generation
            const image = await loadImage(primaryPath);
            tileImageCache.set(cacheKey, image);
            return image;
        } catch (genError) {
            console.warn(`Failed to generate or load encounter image: ${primaryPath}`);
            // Try fallback to generic theme
            const genericPath = `./assets/game/encounters/generic_${imageFileName}.png`;
            
            try {
                const image = await loadImage(genericPath);
                tileImageCache.set(cacheKey, image);
                return image;
            } catch (genericError) {
                // Generate generic version
                try {
                    await generateThemeImages('generic');
                    const image = await loadImage(genericPath);
                    tileImageCache.set(cacheKey, image);
                    return image;
                } catch (finalError) {
                    // Cache the failure
                    tileImageCache.set(cacheKey, null);
                    return null;
                }
            }
        }
    }
}

/**
 * Get wall connections for a tile
 */
function getWallConnections(tiles, x, y) {
    const connections = {
        north: false,
        south: false,
        east: false,
        west: false,
        northEast: false,
        northWest: false,
        southEast: false,
        southWest: false
    };
    
    const isWall = (tx, ty) => {
        if (ty < 0 || ty >= tiles.length || tx < 0 || tx >= tiles[0].length) {
            return true; // Treat out of bounds as walls
        }
        const tile = tiles[ty][tx];
        return tile && (
            tile.type === TILE_TYPES.WALL || 
            tile.type === TILE_TYPES.WALL_WITH_ORE ||
            tile.type === TILE_TYPES.REINFORCED_WALL ||
            tile.type === TILE_TYPES.RARE_ORE
        );
    };
    
    // Check cardinal directions
    connections.north = isWall(x, y - 1);
    connections.south = isWall(x, y + 1);
    connections.east = isWall(x + 1, y);
    connections.west = isWall(x - 1, y);
    
    // Check diagonal directions
    connections.northEast = isWall(x + 1, y - 1);
    connections.northWest = isWall(x - 1, y - 1);
    connections.southEast = isWall(x + 1, y + 1);
    connections.southWest = isWall(x - 1, y + 1);
    
    return connections;
}

/**
 * Check if a wall tile is completely surrounded (for fade to black effect)
 */
function isWallSurrounded(tiles, x, y) {
    const connections = getWallConnections(tiles, x, y);
    return connections.north && connections.south && connections.east && connections.west &&
           connections.northEast && connections.northWest && connections.southEast && connections.southWest;
}

/**
 * Calculate optimal tile size and output format based on map dimensions
 */
function calculateOptimalImageSettings(mapWidth, mapHeight) {
    let baseTileSize = FLOOR_TILE_SIZE;
    let outputWidth = mapWidth * baseTileSize;
    // Account for taller walls in height calculation
    let outputHeight = mapHeight * baseTileSize + (WALL_TILE_HEIGHT - FLOOR_TILE_SIZE);
    
    const availableWidth = MAX_IMAGE_WIDTH - (BORDER_SIZE * 2);
    const availableHeight = MAX_IMAGE_HEIGHT - (BORDER_SIZE * 2);
    
    const widthScale = availableWidth / outputWidth;
    const heightScale = availableHeight / outputHeight;
    const minScale = Math.min(widthScale, heightScale, 1);
    
    if (minScale < 1) {
        baseTileSize = Math.max(MIN_TILE_SIZE, Math.floor(baseTileSize * minScale));
        outputWidth = mapWidth * baseTileSize;
        outputHeight = mapHeight * baseTileSize + Math.floor((WALL_TILE_HEIGHT - FLOOR_TILE_SIZE) * minScale);
    }
    
    const finalWidth = outputWidth + (BORDER_SIZE * 2);
    const finalHeight = outputHeight + (BORDER_SIZE * 2);
    const useJPEG = (finalWidth > USE_JPEG_THRESHOLD || finalHeight > USE_JPEG_THRESHOLD);
    
    // Calculate wall tile height (taller for perspective)
    const wallTileHeight = Math.floor(baseTileSize * (WALL_TILE_HEIGHT / FLOOR_TILE_SIZE));
    
    return {
        floorTileSize: baseTileSize,
        wallTileHeight: wallTileHeight,
        outputWidth,
        outputHeight,
        finalWidth,
        finalHeight,
        useJPEG,
        scaleFactor: minScale,
        playerAvatarSize: Math.max(12, Math.floor(PLAYER_AVATAR_SIZE * minScale)),
        stackedOffset: Math.max(3, Math.floor(STACKED_OFFSET * minScale))
    };
}

/**
 * Calculate visibility for a player
 */
function calculateVisibleTiles(position, sightRadius, tiles, imageSettings) {
    const visible = new Set();
    const { x: px, y: py } = position;
    
    visible.add(`${px},${py}`);
    
    if (sightRadius <= 0) {
        // Basic visibility
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
    
    // Ray casting for visibility
    const rayCount = Math.min(64, sightRadius * 8);
    for (let i = 0; i < rayCount; i++) {
        const angle = (i * 360) / rayCount;
        const radians = (angle * Math.PI) / 180;
        const dx = Math.cos(radians);
        const dy = Math.sin(radians);
        
        for (let dist = 1; dist <= sightRadius; dist++) {
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
    
    return visible;
}

/**
 * Simple seeded random number generator
 */
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Draw floor layer
 */
async function drawFloorLayer(ctx, tiles, width, height, tileSize, visibilityMap, theme, channelId) {
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = tiles[y] && tiles[y][x];
            if (!tile) continue;
            
            const tileKey = `${x},${y}`;
            let isVisible = visibilityMap.visible.has(tileKey);
            const wasDiscovered = tile.discovered;
            
            if (!isVisible && !wasDiscovered) continue;
            
            const pixelX = x * tileSize;
            const pixelY = y * tileSize;
            
            // Apply darkness for non-visible but discovered tiles
            ctx.globalAlpha = 1.0;
            
            // Only draw floor for non-wall tiles
            if (tile.type === TILE_TYPES.FLOOR || tile.type === TILE_TYPES.ENTRANCE) {
                if (tile.type === TILE_TYPES.ENTRANCE) {
                    // Draw floor underneath entrance (entrance itself will be drawn in midground)
                    const variationSeed = (x * 7 + y * 13) % 100;
                    const floorImage = await loadTileImageVariation(TILE_TYPES.FLOOR, theme, variationSeed);
                    
                    // Generate seed for rotation based on channel ID and tile position
                    const channelHash = parseInt(channelId.slice(-6), 10) || 123456;
                    const rotationSeed = channelHash + x * 1337 + y * 7919;
                    const rotation = Math.floor(seededRandom(rotationSeed) * 4) * 90; // 0, 90, 180, or 270 degrees
                    
                    ctx.save();
                    ctx.translate(pixelX + tileSize/2, pixelY + tileSize/2);
                    ctx.rotate(rotation * Math.PI / 180);
                    
                    if (floorImage) {
                        ctx.drawImage(floorImage, -tileSize/2, -tileSize/2, tileSize, tileSize);
                    } else {
                        // Fallback to color
                        ctx.fillStyle = isVisible ? '#D2B48C' : '#3A2F20';
                        ctx.fillRect(-tileSize/2, -tileSize/2, tileSize, tileSize);
                    }
                    
                    ctx.restore();
                    
                    // Darken if not visible
                    if (!isVisible && wasDiscovered) {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                        ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
                    }
                } else {
                    // Regular floor tile with random rotation
                    const variationSeed = (x * 7 + y * 13) % 100;
                    const floorImage = await loadTileImageVariation(TILE_TYPES.FLOOR, theme, variationSeed);
                    
                    // Generate seed for rotation based on channel ID and tile position
                    const channelHash = parseInt(channelId.slice(-6), 10) || 123456;
                    const rotationSeed = channelHash + x * 1337 + y * 7919;
                    const rotation = Math.floor(seededRandom(rotationSeed) * 4) * 90; // 0, 90, 180, or 270 degrees
                    
                    ctx.save();
                    ctx.translate(pixelX + tileSize/2, pixelY + tileSize/2);
                    ctx.rotate(rotation * Math.PI / 180);
                    
                    if (floorImage) {
                        ctx.drawImage(floorImage, -tileSize/2, -tileSize/2, tileSize, tileSize);
                    } else {
                        // Fallback to color
                        ctx.fillStyle = isVisible ? '#D2B48C' : '#3A2F20';
                        ctx.fillRect(-tileSize/2, -tileSize/2, tileSize, tileSize);
                    }
                    
                    ctx.restore();
                    
                    // Darken if not visible
                    if (!isVisible && wasDiscovered) {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                        ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
                    }
                }
                
                // Add random floor decorations (cracks, pebbles, etc.)
                if (isVisible && tileSize >= 32 && Math.random() < 0.1) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                    const decorSize = tileSize * 0.2;
                    const decorX = pixelX + Math.random() * (tileSize - decorSize);
                    const decorY = pixelY + Math.random() * (tileSize - decorSize);
                    ctx.fillRect(decorX, decorY, decorSize, decorSize);
                }
            } else {
                // Draw a dark floor under walls
                ctx.fillStyle = isVisible ? '#2C2C2C' : '#0A0A0A';
                ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
            }
        }
    }
    
    ctx.globalAlpha = 1.0;
}

/**
 * Draw a single wall tile with connection logic
 */
async function drawWallTile(ctx, tile, x, y, tiles, floorTileSize, wallTileHeight, isVisible, wasDiscovered, theme, visibilityMap, channelId) {
    // Check what type of tile is below this wall
    let tileBelow = null;
    let isTileBelowVisible = true;
    if (y < tiles.length - 1) {
        tileBelow = tiles[y + 1] && tiles[y + 1][x];
        if (tileBelow) {
            const tileBelowKey = `${x},${y + 1}`;
            isTileBelowVisible = visibilityMap.visible.has(tileBelowKey);
        }
    }
    
    // Only darken tiles when the tile below is a wall-type and not visible
    const hasFloorBelow = tileBelow && (tileBelow.type === TILE_TYPES.FLOOR || tileBelow.type === TILE_TYPES.ENTRANCE);
    const hasWallBelow = tileBelow && (tileBelow.type === TILE_TYPES.WALL || 
                                        tileBelow.type === TILE_TYPES.WALL_WITH_ORE ||
                                        tileBelow.type === TILE_TYPES.REINFORCED_WALL ||
                                        tileBelow.type === TILE_TYPES.RARE_ORE);
    
    // Adjust visibility: only make darker if tile below is a wall and not visible
    if (hasWallBelow && !isTileBelowVisible) {
        isVisible = false;
    }
    
    // If no floor below, render as black wall (depth effect)
    const shouldRenderBlack = !hasFloorBelow;
    
    // Don't render if completely hidden
    if (!isVisible && !wasDiscovered && !shouldRenderBlack) return;
    
    const pixelX = x * floorTileSize;
    const pixelY = y * floorTileSize;
    
    // Wall tiles are taller - they extend upward from the floor position
    // The bottom of the wall aligns with the floor tile bottom
    const wallPixelY = pixelY + floorTileSize - wallTileHeight;
    
    // Render black walls for depth effect (walls without floor beneath)
    if (shouldRenderBlack) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        return;
    }
    
    // Check if completely surrounded (for fade to black)
    const isSurrounded = isWallSurrounded(tiles, x, y);
    
    if (isSurrounded && !wasDiscovered) {
        // Don't render completely hidden walls
        return;
    }
    
    if (isSurrounded && wasDiscovered) {
        // Fade to black for surrounded walls
        ctx.fillStyle = isVisible ? '#1A1A1A' : '#000000';
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        return;
    }
    
    // Get wall connections for visual connection behavior
    const connections = getWallConnections(tiles, x, y);
    
    // Choose wall image based on connections
    const variationSeed = (x * 11 + y * 17) % 100;
    const wallImage = await loadTileImageVariation(tile.type, theme, variationSeed);
    
    // Determine if we should flip horizontally based on channel ID and position
    const channelHash = parseInt(channelId.slice(-6), 10) || 123456;
    const flipSeed = channelHash + x * 2347 + y * 3571;
    const shouldFlip = seededRandom(flipSeed) > 0.5;
    
    if (wallImage) {
        // Draw the wall image with proper dimensions and potential horizontal flip
        ctx.save();
        if (shouldFlip) {
            ctx.translate(pixelX + floorTileSize, wallPixelY);
            ctx.scale(-1, 1);
            ctx.drawImage(wallImage, 0, 0, floorTileSize, wallTileHeight);
        } else {
            ctx.drawImage(wallImage, pixelX, wallPixelY, floorTileSize, wallTileHeight);
        }
        ctx.restore();
        
        // Darken if not visible
        if (!isVisible && wasDiscovered) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        }
    } else {
        // Fallback rendering with connection-aware drawing
        let wallColor = TILE_COLORS[tile.type] || '#444444';
        
        // Base wall with darkening for non-visible
        ctx.fillStyle = isVisible ? wallColor : '#1A1A1A';
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        
        // Add connection details
        ctx.fillStyle = isVisible ? '#333333' : '#0A0A0A';
        const edgeSize = floorTileSize * 0.1;
        
        // Draw edge highlights based on connections
        if (!connections.north) {
            ctx.fillRect(pixelX, wallPixelY, floorTileSize, edgeSize);
        }
        if (!connections.south) {
            ctx.fillRect(pixelX, wallPixelY + wallTileHeight - edgeSize, floorTileSize, edgeSize);
        }
        if (!connections.west) {
            ctx.fillRect(pixelX, wallPixelY, edgeSize, wallTileHeight);
        }
        if (!connections.east) {
            ctx.fillRect(pixelX + floorTileSize - edgeSize, wallPixelY, edgeSize, wallTileHeight);
        }
        
        // Special rendering for ore walls
        if (tile.type === TILE_TYPES.WALL_WITH_ORE && wasDiscovered) {
            const oreSize = floorTileSize * 0.4;
            const oreOffset = (floorTileSize - oreSize) / 2;
            
            const gradient = ctx.createLinearGradient(
                pixelX + oreOffset, wallPixelY + wallTileHeight/2 - oreSize/2,
                pixelX + oreOffset + oreSize, wallPixelY + wallTileHeight/2 + oreSize/2
            );
            gradient.addColorStop(0, isVisible ? '#FFD700' : '#7F6B00');
            gradient.addColorStop(0.5, isVisible ? '#FFA500' : '#7F5200');
            gradient.addColorStop(1, isVisible ? '#FF8C00' : '#7F4600');
            ctx.fillStyle = gradient;
            
            ctx.fillRect(pixelX + oreOffset, wallPixelY + wallTileHeight/2 - oreSize/2, oreSize, oreSize);
        }
    }
}

/**
 * Draw encounter on a tile (hazards, treasures, etc.)
 */
async function drawEncounter(ctx, pixelX, pixelY, tileSize, encountersData, tileX, tileY, isVisible, wasDiscovered, theme) {
    // Support both encounter and hazard storage methods
    const encounter = encounterStorage.getEncounter ? 
        encounterStorage.getEncounter(encountersData, tileX, tileY) :
        encounterStorage.getHazard ? 
        encounterStorage.getHazard(encountersData, tileX, tileY) : null;
    
    if (!encounter) return;
    
    if (!isVisible && !encounter.revealed) return;
    
    ctx.save();
    
    const centerX = pixelX + tileSize / 2;
    const centerY = pixelY + tileSize / 2;
    
    // Try to load encounter image
    const encounterImage = await loadEncounterImage(encounter.type, theme);
    
    if (encounterImage) {
        // Draw the encounter image
        const encounterSize = Math.max(16, tileSize * 0.8);
        const imageX = centerX - encounterSize / 2;
        const imageY = centerY - encounterSize / 2;
        
        ctx.drawImage(encounterImage, imageX, imageY, encounterSize, encounterSize);
        
        // Darken if not visible
        if (!isVisible && wasDiscovered) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(imageX, imageY, encounterSize, encounterSize);
        }
        
        // Add reveal state overlay if not revealed
        if (!encounter.revealed) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(imageX, imageY, encounterSize, encounterSize);
            
            // Add question mark
            if (tileSize >= 20) {
                ctx.fillStyle = '#FFD700';
                ctx.font = `bold ${Math.floor(encounterSize * 0.4)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', centerX, centerY);
            }
        }
    } else {
        // Fallback to programmatic rendering
        drawEncounterFallback(ctx, encounter, centerX, centerY, tileSize, isVisible, wasDiscovered);
    }
    
    ctx.restore();
}

/**
 * Fallback rendering for encounters without images
 */
function drawEncounterFallback(ctx, encounter, centerX, centerY, tileSize, isVisible, wasDiscovered) {
    const encounterSize = Math.max(10, tileSize * 0.7);
    const config = ENCOUNTER_CONFIG[encounter.type];
    
    if (!encounter.revealed) {
        // Unrevealed encounter - show generic danger/mystery indicator
        ctx.fillStyle = isVisible ? '#8B0000' : '#2A0000';
        ctx.beginPath();
        ctx.arc(centerX, centerY, encounterSize / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw exclamation or question mark
        if (tileSize >= 16) {
            ctx.fillStyle = isVisible ? '#FFD700' : '#7F6B00';
            ctx.font = `bold ${Math.floor(encounterSize * 0.8)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', centerX, centerY);
        }
    } else {
        // Revealed encounter - show specific type with darkening
        const baseColor = config?.color || '#FF0000';
        const darkColor = config ? `rgba(${parseInt(baseColor.slice(1,3),16)/2},${parseInt(baseColor.slice(3,5),16)/2},${parseInt(baseColor.slice(5,7),16)/2},1)` : '#7F0000';
        
        ctx.fillStyle = isVisible ? baseColor : darkColor;
        ctx.beginPath();
        ctx.arc(centerX, centerY, encounterSize / 2, 0, Math.PI * 2);
        ctx.fill();
        
        if (tileSize >= 20 && config?.symbol) {
            ctx.fillStyle = isVisible ? '#FFFFFF' : '#7F7F7F';
            ctx.font = `bold ${Math.floor(encounterSize * 0.6)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(config.symbol, centerX, centerY);
        }
    }
}

/**
 * Draw mine entrance tile
 */
async function drawMineEntrance(ctx, x, y, floorTileSize, wallTileHeight, isVisible, wasDiscovered, theme) {
    const pixelX = x * floorTileSize;
    const pixelY = y * floorTileSize;
    
    // Wall tiles are taller - they extend upward from the floor position
    // The bottom of the wall aligns with the floor tile bottom
    const wallPixelY = pixelY + floorTileSize - wallTileHeight;
    
    try {
        // Try to load the generic_entrance.png image
        const entranceImage = await loadImage('./assets/game/tiles/generic_entrance.png');
        
        ctx.save();
        // Draw the entrance image at wall dimensions (64x90 or scaled)
        ctx.drawImage(entranceImage, pixelX, wallPixelY, floorTileSize, wallTileHeight);
        
        // Darken if not visible
        if (!isVisible && wasDiscovered) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        }
        ctx.restore();
    } catch (error) {
        // Fallback to programmatic rendering if image not found
        ctx.save();
        
        // Draw entrance background
        ctx.fillStyle = isVisible ? '#8B7355' : '#3A2F20';
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        
        // Draw entrance arch/doorway
        const archWidth = floorTileSize * 0.7;
        const archHeight = wallTileHeight * 0.8;
        const archX = pixelX + (floorTileSize - archWidth) / 2;
        const archY = wallPixelY + (wallTileHeight - archHeight) / 2;
        
        // Dark interior
        ctx.fillStyle = '#000000';
        ctx.fillRect(archX, archY, archWidth, archHeight);
        
        // Entrance glow
        const entranceGradient = ctx.createRadialGradient(
            pixelX + floorTileSize/2, wallPixelY + wallTileHeight/2, 0,
            pixelX + floorTileSize/2, wallPixelY + wallTileHeight/2, floorTileSize/2
        );
        entranceGradient.addColorStop(0, isVisible ? 'rgba(255, 215, 0, 0.3)' : 'rgba(139, 117, 0, 0.3)');
        entranceGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = entranceGradient;
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        
        // Draw entrance symbol
        if (floorTileSize >= 20) {
            ctx.fillStyle = isVisible ? '#FFD700' : '#8B7500';
            ctx.font = `bold ${Math.floor(floorTileSize * 0.4)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⊕', pixelX + floorTileSize/2, wallPixelY + wallTileHeight/2);
        }
        
        ctx.restore();
    }
}

/**
 * Draw midground layer (walls, players, hazards, etc.) with Y-sorting
 */
async function drawMidgroundLayer(ctx, tiles, width, height, floorTileSize, wallTileHeight, 
                                  visibilityMap, theme, members, playerPositions, 
                                  railsData, encountersData, imageSettings, channelId, inShortBreak = false) {
    
    // Collect all midground objects with their Y positions
    const midgroundObjects = [];
    
    // Add walls to midground objects
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = tiles[y] && tiles[y][x];
            if (!tile) continue;
            
            const tileKey = `${x},${y}`;
            const isVisible = visibilityMap.visible.has(tileKey);
            const wasDiscovered = tile.discovered;
            
            // Check if there's a floor tile beneath this position
            let hasFloorBelow = false;
            if (y < height - 1) {
                const tileBelow = tiles[y + 1] && tiles[y + 1][x];
                if (tileBelow && (tileBelow.type === TILE_TYPES.FLOOR || tileBelow.type === TILE_TYPES.ENTRANCE)) {
                    hasFloorBelow = true;
                }
            }
            
            // Render all walls that don't have a floor below (depth walls) as black
            const shouldRenderAsDepth = !hasFloorBelow;
            
            // Skip if not visible/discovered AND not a depth wall
            if (!isVisible && !wasDiscovered && !shouldRenderAsDepth) continue;
            
            // Check if it's a wall-type tile or entrance
            if (tile.type === TILE_TYPES.WALL || 
                tile.type === TILE_TYPES.WALL_WITH_ORE ||
                tile.type === TILE_TYPES.REINFORCED_WALL ||
                tile.type === TILE_TYPES.RARE_ORE) {
                
                midgroundObjects.push({
                    type: 'wall',
                    y: y,
                    x: x,
                    tile: tile,
                    isVisible: isVisible,
                    wasDiscovered: wasDiscovered,
                    renderY: y * floorTileSize + floorTileSize // Bottom of wall aligns with floor
                });
            } else if (tile.type === TILE_TYPES.ENTRANCE) {
                // Add entrance to midground (it acts like a wall but renders before players)
                midgroundObjects.push({
                    type: 'entrance',
                    y: y,
                    x: x,
                    tile: tile,
                    isVisible: isVisible,
                    wasDiscovered: wasDiscovered,
                    renderY: y * floorTileSize + floorTileSize * 0.3 // Render entrance early so players appear above it
                });
            }
            
            // Check if tile below is visible (for visibility propagation)
            let isTileBelowVisible = true; // Default to true for bottom row
            if (y < height - 1) {
                const tileBelowKey = `${x},${y + 1}`;
                isTileBelowVisible = visibilityMap.visible.has(tileBelowKey);
            }
            
            // Adjust visibility based on tile below
            const effectiveIsVisible = isVisible && isTileBelowVisible;
            
            // Add encounters
            const hasEncounter = encounterStorage.hasEncounter ? 
                encounterStorage.hasEncounter(encountersData, x, y) :
                encounterStorage.hasHazard ?
                encounterStorage.hasHazard(encountersData, x, y) : false;
                
            if (hasEncounter && (effectiveIsVisible || wasDiscovered)) {
                midgroundObjects.push({
                    type: 'encounter',
                    y: y,
                    x: x,
                    isVisible: effectiveIsVisible,
                    wasDiscovered: wasDiscovered,
                    renderY: y * floorTileSize + floorTileSize * 0.5
                });
            }
            
            // Add rails
            if (railStorage.hasRail(railsData, x, y) && (effectiveIsVisible || wasDiscovered)) {
                midgroundObjects.push({
                    type: 'rail',
                    y: y,
                    x: x,
                    isVisible: effectiveIsVisible,
                    wasDiscovered: wasDiscovered,
                    renderY: y * floorTileSize + floorTileSize * 0.3
                });
            }
        }
    }
    
    // Group players by position to handle multiple players on same tile
    const playersAtPosition = new Map();
    
    for (const member of members.values()) {
        const position = playerPositions[member.id];
        if (!position) continue;
        
        const posKey = `${position.x},${position.y}`;
        if (!playersAtPosition.has(posKey)) {
            playersAtPosition.set(posKey, []);
        }
        playersAtPosition.get(posKey).push({ member, position });
    }
    
    // Add player groups to midground objects
    for (const [posKey, players] of playersAtPosition) {
        const [x, y] = posKey.split(',').map(Number);
        const tileKey = posKey;
        const isVisible = visibilityMap.visible.has(tileKey);
        
        // Check if tile below player is visible
        let isTileBelowVisible = true; // Default to true for bottom row
        if (y < height - 1) {
            const tileBelowKey = `${x},${y + 1}`;
            isTileBelowVisible = visibilityMap.visible.has(tileBelowKey);
        }
        
        // Player is only visible if both their tile is visible AND tile below is visible
        const effectiveIsVisible = isVisible && isTileBelowVisible;
        
        if (effectiveIsVisible || tiles[y]?.[x]?.discovered) {
            midgroundObjects.push({
                type: 'playerGroup',
                y: y,
                x: x,
                players: players,
                isVisible: effectiveIsVisible,
                renderY: y * floorTileSize + floorTileSize * 0.6,
                inShortBreak: inShortBreak
            });
        }
    }
    
    // Sort all midground objects by Y position (top to bottom)
    midgroundObjects.sort((a, b) => a.renderY - b.renderY);
    
    // Render all midground objects in sorted order
    for (const obj of midgroundObjects) {
        switch (obj.type) {
            case 'wall':
                await drawWallTile(ctx, obj.tile, obj.x, obj.y, tiles, 
                                 floorTileSize, wallTileHeight, 
                                 obj.isVisible, obj.wasDiscovered, theme, visibilityMap, channelId);
                break;
                
            case 'entrance':
                await drawMineEntrance(ctx, obj.x, obj.y, floorTileSize, wallTileHeight,
                                     obj.isVisible, obj.wasDiscovered, theme);
                break;
                
            case 'encounter':
                await drawEncounter(ctx, obj.x * floorTileSize, obj.y * floorTileSize,
                                  floorTileSize, encountersData, obj.x, obj.y,
                                  obj.isVisible, obj.wasDiscovered, theme);
                break;
                
            case 'rail':
                drawRails(ctx, obj.x * floorTileSize, obj.y * floorTileSize,
                        floorTileSize, railsData, tiles, obj.x, obj.y,
                        obj.isVisible, obj.wasDiscovered);
                break;
                
            case 'playerGroup':
                const tileCenterX = obj.x * floorTileSize + floorTileSize / 2;
                const tileCenterY = obj.y * floorTileSize + floorTileSize / 2;
                
                // Draw campfire for short breaks when players are in tents
                if (obj.inShortBreak && obj.players[0].position.isTent) {
                    await drawCampfire(ctx, tileCenterX + floorTileSize * 0.7, tileCenterY, floorTileSize);
                }
                
                if (obj.players.length === 1) {
                    // Single player
                    const { member, position } = obj.players[0];
                    if (position.isTent) {
                        await drawTent(ctx, tileCenterX, tileCenterY, floorTileSize, 
                                     member, imageSettings);
                    } else {
                        await drawPlayerAvatar(ctx, member, tileCenterX, tileCenterY,
                                             imageSettings.playerAvatarSize, imageSettings);
                        
                        // Draw player name for larger images
                        if (floorTileSize >= 40) {
                            ctx.fillStyle = '#FFFFFF';
                            ctx.strokeStyle = '#000000';
                            ctx.font = `${Math.max(8, Math.floor(floorTileSize * 0.17))}px Arial`;
                            ctx.textAlign = 'center';
                            ctx.lineWidth = Math.max(1, Math.floor(imageSettings.scaleFactor * 2));
                            const nameY = tileCenterY + imageSettings.playerAvatarSize/2 + Math.max(8, floorTileSize * 0.2);
                            ctx.strokeText(member.displayName, tileCenterX, nameY);
                            ctx.fillText(member.displayName, tileCenterX, nameY);
                        }
                    }
                } else {
                    // Multiple players on same tile - stack them
                    await drawStackedPlayers(ctx, obj.players, tileCenterX, tileCenterY, 
                                           floorTileSize, imageSettings);
                }
                break;
        }
    }
}

/**
 * Draw top layer (clouds, effects, etc.)
 */
async function drawTopLayer(ctx, width, height, tileSize, theme) {
    // Add atmospheric effects, clouds, etc.
    ctx.save();
    ctx.globalAlpha = 0.1;
    
    for (let i = 0; i < 5; i++) {
        const fogX = Math.random() * (width * tileSize);
        const fogY = Math.random() * (height * tileSize);
        const fogRadius = Math.random() * 100 + 50;
        
        const gradient = ctx.createRadialGradient(
            fogX, fogY, 0,
            fogX, fogY, fogRadius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(fogX, fogY, fogRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

// Keep the existing helper functions from the original file
// Draw rails on a tile (from original file)
function drawRails(ctx, pixelX, pixelY, tileSize, railsData, mapData, tileX, tileY, isVisible, wasDiscovered) {
    if (!railStorage.hasRail(railsData, tileX, tileY)) return;
    if (!isVisible && !wasDiscovered) return;

    ctx.save();
    
    const connections = railStorage.getRailConnections(railsData, tileX, tileY);

    const centerX = pixelX + tileSize / 2;
    const centerY = pixelY + tileSize / 2;
    const railWidth = Math.max(2, tileSize * 0.15);
    const tieWidth = Math.max(1, tileSize * 0.08);
    const tieLength = Math.max(4, tileSize * 0.4);

    // Darken colors if not visible
    ctx.fillStyle = isVisible ? '#654321' : '#1A0F0A';
    const tieSpacing = Math.max(4, tileSize * 0.25);
    const numTies = Math.floor(tileSize / tieSpacing);
    
    const isVertical = connections.north || connections.south;
    const isHorizontal = connections.east || connections.west;
    
    if (isVertical || (!isHorizontal && !isVertical)) {
        for (let i = 0; i < numTies; i++) {
            const tieY = pixelY + (i + 0.5) * tieSpacing;
            ctx.fillRect(centerX - tieLength/2, tieY - tieWidth/2, tieLength, tieWidth);
        }
    }
    
    if (isHorizontal && !isVertical) {
        for (let i = 0; i < numTies; i++) {
            const tieX = pixelX + (i + 0.5) * tieSpacing;
            ctx.fillRect(tieX - tieWidth/2, centerY - tieLength/2, tieWidth, tieLength);
        }
    }

    ctx.strokeStyle = isVisible ? '#C0C0C0' : '#404040';
    ctx.lineWidth = railWidth;
    ctx.lineCap = 'square';

    const railOffset = Math.max(3, tileSize * 0.12);
    const connectionCount = Object.values(connections).filter(c => c).length;

    ctx.beginPath();

    const drawRailSegment = (fromX, fromY, toX, toY, offset) => {
        if (Math.abs(fromX - toX) > Math.abs(fromY - toY)) {
            ctx.moveTo(fromX, fromY - offset);
            ctx.lineTo(toX, toY - offset);
            ctx.moveTo(fromX, fromY + offset);
            ctx.lineTo(toX, toY + offset);
        } else {
            ctx.moveTo(fromX - offset, fromY);
            ctx.lineTo(toX - offset, toY);
            ctx.moveTo(fromX + offset, fromY);
            ctx.lineTo(toX + offset, toY);
        }
    };

    if (connections.north && connections.south) {
        drawRailSegment(centerX, pixelY, centerX, pixelY + tileSize, railOffset);
    } else if (connections.east && connections.west) {
        drawRailSegment(pixelX, centerY, pixelX + tileSize, centerY, railOffset);
    } else if (connections.north && connections.east) {
        drawRailSegment(centerX, pixelY, centerX, centerY, railOffset);
        drawRailSegment(centerX, centerY, pixelX + tileSize, centerY, railOffset);
    } else if (connections.north && connections.west) {
        drawRailSegment(centerX, pixelY, centerX, centerY, railOffset);
        drawRailSegment(pixelX, centerY, centerX, centerY, railOffset);
    } else if (connections.south && connections.east) {
        drawRailSegment(centerX, centerY, centerX, pixelY + tileSize, railOffset);
        drawRailSegment(centerX, centerY, pixelX + tileSize, centerY, railOffset);
    } else if (connections.south && connections.west) {
        drawRailSegment(centerX, centerY, centerX, pixelY + tileSize, railOffset);
        drawRailSegment(pixelX, centerY, centerX, centerY, railOffset);
    } else if (connections.north && !connections.south && !connections.east && !connections.west) {
        drawRailSegment(centerX, pixelY, centerX, centerY + tileSize * 0.1, railOffset);
        ctx.moveTo(centerX - railOffset, centerY + tileSize * 0.1);
        ctx.lineTo(centerX + railOffset, centerY + tileSize * 0.1);
    } else if (connections.south && !connections.north && !connections.east && !connections.west) {
        drawRailSegment(centerX, centerY - tileSize * 0.1, centerX, pixelY + tileSize, railOffset);
        ctx.moveTo(centerX - railOffset, centerY - tileSize * 0.1);
        ctx.lineTo(centerX + railOffset, centerY - tileSize * 0.1);
    } else if (connections.east && !connections.west && !connections.north && !connections.south) {
        drawRailSegment(centerX - tileSize * 0.1, centerY, pixelX + tileSize, centerY, railOffset);
        ctx.moveTo(centerX - tileSize * 0.1, centerY - railOffset);
        ctx.lineTo(centerX - tileSize * 0.1, centerY + railOffset);
    } else if (connections.west && !connections.east && !connections.north && !connections.south) {
        drawRailSegment(pixelX, centerY, centerX + tileSize * 0.1, centerY, railOffset);
        ctx.moveTo(centerX + tileSize * 0.1, centerY - railOffset);
        ctx.lineTo(centerX + tileSize * 0.1, centerY + railOffset);
    } else if (connectionCount >= 3) {
        if (connections.north) {
            drawRailSegment(centerX, pixelY, centerX, centerY, railOffset);
        }
        if (connections.south) {
            drawRailSegment(centerX, centerY, centerX, pixelY + tileSize, railOffset);
        }
        if (connections.east) {
            drawRailSegment(centerX, centerY, pixelX + tileSize, centerY, railOffset);
        }
        if (connections.west) {
            drawRailSegment(pixelX, centerY, centerX, centerY, railOffset);
        }
    }
    
    if (connectionCount === 0) {
        drawRailSegment(centerX, centerY - tileSize * 0.2, centerX, centerY + tileSize * 0.2, railOffset);
    }

    ctx.stroke();

    if (connectionCount === 1 && tileSize >= 16) {
        ctx.fillStyle = isVisible ? '#8B4513' : '#2A1505';
        const bufferSize = Math.max(4, tileSize * 0.15);
        
        if (connections.north && !connections.south && !connections.east && !connections.west) {
            ctx.fillRect(centerX - bufferSize/2, centerY, bufferSize, bufferSize/2);
        } else if (connections.south && !connections.north && !connections.east && !connections.west) {
            ctx.fillRect(centerX - bufferSize/2, centerY - bufferSize/2, bufferSize, bufferSize/2);
        } else if (connections.east && !connections.west && !connections.north && !connections.south) {
            ctx.fillRect(centerX - bufferSize/2, centerY - bufferSize/2, bufferSize/2, bufferSize);
        } else if (connections.west && !connections.east && !connections.north && !connections.south) {
            ctx.fillRect(centerX, centerY - bufferSize/2, bufferSize/2, bufferSize);
        }
    }

    if (tileSize >= 20) {
        if (connectionCount > 2) {
            ctx.fillStyle = isVisible ? '#808080' : '#2A2A2A';
            const plateSize = Math.max(6, tileSize * 0.2);
            ctx.fillRect(centerX - plateSize/2, centerY - plateSize/2, plateSize, plateSize);
            
            ctx.fillStyle = isVisible ? '#404040' : '#151515';
            const boltSize = Math.max(2, plateSize * 0.3);
            ctx.beginPath();
            ctx.arc(centerX, centerY, boltSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.globalAlpha = 1.0;
    ctx.restore();
}

/**
 * Enhanced avatar drawing with pickaxe display and headlamp indicator (from original)
 */
async function drawPlayerAvatar(ctx, member, centerX, centerY, size, imageSettings) {
    try {
        const avatarSize = imageSettings.scaleFactor < 0.5 ? 64 : 128;
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: avatarSize });
        const avatar = await loadImage(avatarURL);
        
        const radius = size / 2;
        
        if (size > 20) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.arc(centerX + 1, centerY + 1, radius + 1, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        
        ctx.drawImage(avatar, centerX - radius, centerY - radius, size, size);
        ctx.restore();
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, Math.floor(imageSettings.scaleFactor * 2));
        ctx.stroke();

        try {
            const playerData = await getPlayerStats(member.user.id);
            
            let sightTool = null;
            if (playerData.equippedItems) {
                for (const equipped of Object.values(playerData.equippedItems)) {
                    if (equipped.type === 'tool' && equipped.slot === 'sight') {
                        sightTool = equipped;
                        break;
                    }
                }
            }
            
            if (sightTool && size > 20) {
                const sightToolSize = Math.max(8, size * 0.25);
                const sightToolX = centerX - sightToolSize/1.5;
                const sightToolY = centerY - radius/2 - sightToolSize;
                
                ctx.save();
                
                ctx.fillStyle = '#2C2C2C';
                ctx.fillRect(sightToolX - 1, sightToolY - 1, sightToolSize + 2, sightToolSize + 2);
                
                const sightPower = sightTool.abilities?.find(a => a.name === 'sight')?.power || 0;
                let toolColor = '#FFD700';
                
                if (sightPower <= 2) {
                    toolColor = '#FFD700';
                } else if (sightPower <= 4) {
                    toolColor = '#00CED1';
                } else if (sightPower <= 6) {
                    toolColor = '#FF6347';
                } else {
                    toolColor = '#9932CC';
                }
                
                ctx.fillStyle = toolColor;
                ctx.fillRect(sightToolX, sightToolY, sightToolSize, sightToolSize);
                
                if (size > 30) {
                    ctx.globalAlpha = 0.3;
                    ctx.fillStyle = toolColor;
                    ctx.beginPath();
                    ctx.moveTo(centerX, sightToolY + sightToolSize);
                    ctx.lineTo(centerX - sightToolSize * 0.8, sightToolY + sightToolSize * 2);
                    ctx.lineTo(centerX + sightToolSize * 0.8, sightToolY + sightToolSize * 2);
                    ctx.closePath();
                    ctx.fill();
                }
                
                if (size > 40 && sightPower > 0) {
                    ctx.globalAlpha = 1.0;
                    ctx.font = `bold ${Math.floor(sightToolSize * 0.4)}px Arial`;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 1;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const powerText = `${sightPower}`;
                    ctx.strokeText(powerText, centerX, sightToolY + sightToolSize/2);
                    ctx.fillText(powerText, centerX, sightToolY + sightToolSize/2);
                }
                
                ctx.restore();
            }
        } catch (error) {
            console.error(`Error checking sight tool for user ${member.user.username}:`, error);
        }

        try {
            const bestPickaxe = await getBestMiningPickaxe(member.user.id);
            if (bestPickaxe && bestPickaxe.image && size > 2) {
                const pickaxeImagePath = `./assets/items/${bestPickaxe.image}.png`;
                const pickaxeImage = await loadImage(pickaxeImagePath);
                
                const pickaxeSize = size * 1;
                const pickaxeX = centerX - radius * 1.7;
                const pickaxeY = centerY - pickaxeSize/3;
                
                ctx.save();
                ctx.globalAlpha = 0.9;
                ctx.drawImage(pickaxeImage, pickaxeX, pickaxeY, pickaxeSize, pickaxeSize);
                ctx.restore();

                const miningAbility = bestPickaxe.abilities?.find(a => a.name === 'mining');
                if (miningAbility && miningAbility.powerlevel && size > 30) {
                    ctx.save();
                    ctx.font = `bold ${Math.floor(size * 0.25)}px Arial`;
                    ctx.fillStyle = '#FFD700';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.textAlign = 'center';
                    
                    const powerText = `+${miningAbility.powerlevel}`;
                    const textX = centerX;
                    const textY = centerY - radius - 8;
                    
                    ctx.strokeText(powerText, textX, textY);
                    ctx.fillText(powerText, textX, textY);
                    ctx.restore();
                }
            }
        } catch (error) {
            console.error(`Error loading pickaxe for user ${member.user.username}:`, error);
        }

        return true;
    } catch (error) {
        console.error(`Error loading avatar for ${member.user.username}:`, error);
        
        const radius = size / 2;
        ctx.fillStyle = '#666666';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${Math.floor(size * 0.4)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(member.displayName.charAt(0).toUpperCase(), centerX, centerY);
        
        return false;
    }
}

/**
 * Draw campfire next to tents during short break
 */
async function drawCampfire(ctx, centerX, centerY, tileSize) {
    const fireSize = Math.max(tileSize * 0.3, 10);
    
    // Draw logs
    ctx.fillStyle = '#654321';
    ctx.fillRect(centerX - fireSize/2, centerY - fireSize/4, fireSize, fireSize/8);
    ctx.fillRect(centerX - fireSize/4, centerY - fireSize/3, fireSize/8, fireSize/2);
    
    // Draw fire with gradient
    const fireGradient = ctx.createRadialGradient(
        centerX, centerY - fireSize/4, 0,
        centerX, centerY - fireSize/4, fireSize/2
    );
    fireGradient.addColorStop(0, '#FFFF00');
    fireGradient.addColorStop(0.4, '#FFA500');
    fireGradient.addColorStop(0.7, '#FF4500');
    fireGradient.addColorStop(1, 'rgba(255, 69, 0, 0)');
    
    ctx.fillStyle = fireGradient;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - fireSize/2);
    ctx.quadraticCurveTo(centerX - fireSize/3, centerY, centerX - fireSize/4, centerY + fireSize/4);
    ctx.lineTo(centerX + fireSize/4, centerY + fireSize/4);
    ctx.quadraticCurveTo(centerX + fireSize/3, centerY, centerX, centerY - fireSize/2);
    ctx.fill();
    
    // Add glow effect
    ctx.globalAlpha = 0.3;
    const glowGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, fireSize
    );
    glowGradient.addColorStop(0, '#FFA500');
    glowGradient.addColorStop(1, 'rgba(255, 165, 0, 0)');
    
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, fireSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
}

/**
 * Draw multiple players stacked on the same tile
 */
async function drawStackedPlayers(ctx, players, centerX, centerY, tileSize, imageSettings) {
    const maxStack = Math.min(players.length, 4); // Limit visual stack to 4
    const stackOffset = Math.max(3, imageSettings.stackedOffset);
    const baseSize = imageSettings.playerAvatarSize;
    const scaledSize = Math.max(baseSize * 0.7, 16); // Slightly smaller when stacked
    
    for (let i = 0; i < maxStack; i++) {
        const { member, position } = players[i];
        const offsetX = (i % 2) * stackOffset * (i % 2 === 0 ? -1 : 1);
        const offsetY = Math.floor(i / 2) * stackOffset * -1;
        
        const playerX = centerX + offsetX;
        const playerY = centerY + offsetY;
        
        if (position.isTent) {
            await drawTent(ctx, playerX, playerY, tileSize * 0.8, member, imageSettings);
        } else {
            await drawPlayerAvatar(ctx, member, playerX, playerY, scaledSize, imageSettings);
        }
    }
    
    // If more than 4 players, show count
    if (players.length > 4) {
        ctx.save();
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.font = `bold ${Math.max(10, tileSize * 0.2)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const countText = `+${players.length - 4}`;
        ctx.strokeText(countText, centerX, centerY - baseSize/2 - 10);
        ctx.fillText(countText, centerX, centerY - baseSize/2 - 10);
        ctx.restore();
    }
}

/**
 * Draw a single tent for a player during breaks (from original)
 */
async function drawTent(ctx, centerX, centerY, tileSize, member, imageSettings) {
    const tentSize = Math.min(tileSize * 0.8, imageSettings.playerAvatarSize * 1.2);
    const tentHeight = tentSize * 0.8;
    
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(centerX - tentSize/2 + 2, centerY - tentHeight/2 + 2, tentSize, tentHeight);
    
    ctx.fillStyle = member.displayColor || '#8B4513';
    ctx.fillRect(centerX - tentSize/2, centerY - tentHeight/2, tentSize, tentHeight);
    
    const roofHeight = tentSize * 0.3;
    ctx.fillStyle = '#654321';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - tentHeight/2 - roofHeight);
    ctx.lineTo(centerX - tentSize/2, centerY - tentHeight/2);
    ctx.lineTo(centerX + tentSize/2, centerY - tentHeight/2);
    ctx.closePath();
    ctx.fill();
    
    const entranceWidth = tentSize * 0.3;
    const entranceHeight = tentHeight * 0.6;
    ctx.fillStyle = '#2F1B14';
    ctx.fillRect(
        centerX - entranceWidth/2, 
        centerY - entranceHeight/2, 
        entranceWidth, 
        entranceHeight
    );
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, imageSettings.scaleFactor);
    ctx.strokeRect(centerX - tentSize/2, centerY - tentHeight/2, tentSize, tentHeight);
    
    if (tentSize >= 20) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.floor(tentSize * 0.3)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            member.displayName.charAt(0).toUpperCase(), 
            centerX, 
            centerY + tentHeight * 0.1
        );
    }
    
    ctx.restore();
}

/**
 * Get best mining pickaxe for a player (from original)
 */
async function getBestMiningPickaxe(userId) {
    try {
        const inventory = await PlayerInventory.findOne({ playerId: userId });
        if (!inventory || !inventory.items || inventory.items.length === 0) {
            return null;
        }

        let bestPickaxe = null;
        let bestMiningPower = 0;

        for (const invItem of inventory.items) {
            if (invItem.quantity <= 0) continue;

            const item = itemSheet.find(i => i.id === invItem.itemId);
            if (!item || item.type !== 'tool' || item.slot !== 'mining') continue;

            const miningAbility = item.abilities?.find(a => a.name === 'mining');
            if (!miningAbility || !miningAbility.powerlevel) continue;

            if (miningAbility.powerlevel > bestMiningPower) {
                bestMiningPower = miningAbility.powerlevel;
                bestPickaxe = item;
            }
        }

        return bestPickaxe;
    } catch (error) {
        console.error(`Error getting best pickaxe for user ${userId}:`, error);
        return null;
    }
}

/**
 * Check if we're in a break period (from original)
 */
function isBreakPeriod(dbEntry) {
    return dbEntry.gameData?.breakInfo?.inBreak || false;
}

/**
 * Check if we're in a long break (from original)
 */
function isLongBreak(dbEntry) {
    return dbEntry.gameData?.breakInfo?.inBreak && dbEntry.gameData?.breakInfo?.isLongBreak;
}

/**
 * Main function to generate enhanced layered mining map
 */
async function generateTileMapImage(channel) {
    if (!channel?.isVoiceBased()) throw new Error('Channel must be a voice channel');

    const result = await gachaVC.findOne({ channelId: channel.id });
    if (!result || !result.gameData || !result.gameData.map) {
        throw new Error('No map data found for this channel');
    }

    const mapData = result.gameData.map;
    const { tiles, width, height, playerPositions } = mapData;
    
    // Get theme for this mine from gachaServers.json image field
    const theme = getMineTheme(result);
    
    // Get rails and encounters data
    const railsData = await railStorage.getRailsData(channel.id);
    const encountersData = await (encounterStorage.getEncountersData || encounterStorage.getHazardsData)?.call(encounterStorage, channel.id) || {};
    
    // Calculate image settings
    const imageSettings = calculateOptimalImageSettings(width, height);
    const { floorTileSize, wallTileHeight, outputWidth, outputHeight, 
            finalWidth, finalHeight, useJPEG, playerAvatarSize, stackedOffset } = imageSettings;
    
    console.log(`Generating layered mining map: ${finalWidth}x${finalHeight} (${useJPEG ? 'JPEG' : 'PNG'}) with theme: ${theme}`);
    
    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Calculate visibility for all players
    const members = channel.members.filter(m => !m.user.bot);
    const allVisibleTiles = new Set();
    
    for (const member of members.values()) {
        const position = playerPositions[member.id];
        if (!position) continue;
        
        const playerData = await getPlayerStats(member.id);
        const sightRadius = playerData.stats.sight || 0;
        
        const visibleTiles = calculateVisibleTiles(position, sightRadius, tiles, imageSettings);
        for (const tile of visibleTiles) {
            allVisibleTiles.add(tile);
        }
    }
    
    const visibilityMap = {
        visible: allVisibleTiles
    };

    // Fill background (fog of war) - use finalWidth/finalHeight to fill entire canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, finalWidth, finalHeight);
    
    // Translate for border
    ctx.save();
    ctx.translate(BORDER_SIZE, BORDER_SIZE);

    // Check if we're in a break period
    const refreshedEntry = await gachaVC.findOne({ channelId: channel.id });
    const inBreak = isBreakPeriod(refreshedEntry);
    const inLongBreak = isLongBreak(refreshedEntry);
    const inShortBreak = inBreak && !inLongBreak;
    
    // During long breaks, hide players (they're in shop/event)
    if (inLongBreak) {
        // === LAYER 1: FLOOR LAYER ===
        await drawFloorLayer(ctx, tiles, width, height, floorTileSize, visibilityMap, theme);
        
        // === LAYER 2: MIDGROUND LAYER (Y-sorted) - pass empty members to hide players ===
        const emptyMembers = new Map(); // Hide all players during long break
        await drawMidgroundLayer(ctx, tiles, width, height, floorTileSize, wallTileHeight,
                                visibilityMap, theme, emptyMembers, {},
                                railsData, encountersData, imageSettings, channel.id, false);
        
        // === LAYER 3: TOP LAYER ===
        await drawTopLayer(ctx, width, height, floorTileSize, theme);
        
        // Draw break indicator at entrance
        const entrancePixelX = mapData.entranceX * floorTileSize;
        const entrancePixelY = mapData.entranceY * floorTileSize;
        
        ctx.save();
        ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.fillRect(entrancePixelX, entrancePixelY, floorTileSize, floorTileSize);
        
        if (floorTileSize >= 32) {
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${Math.floor(floorTileSize * 0.3)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('LONG BREAK', entrancePixelX + floorTileSize/2, entrancePixelY + floorTileSize/2);
        }
        ctx.restore();
        
        ctx.restore();
        return useJPEG ? canvas.toBuffer('image/jpeg', { quality: JPEG_QUALITY }) : canvas.toBuffer('image/png', { compressionLevel: 9 });
    }

    // === LAYER 1: FLOOR LAYER ===
    await drawFloorLayer(ctx, tiles, width, height, floorTileSize, visibilityMap, theme, channel.id);
    
    // === LAYER 2: MIDGROUND LAYER (Y-sorted) ===
    await drawMidgroundLayer(ctx, tiles, width, height, floorTileSize, wallTileHeight,
                            visibilityMap, theme, members, playerPositions,
                            railsData, encountersData, imageSettings, channel.id, inShortBreak);
    
    // === LAYER 3: TOP LAYER ===
    await drawTopLayer(ctx, width, height, floorTileSize, theme);

    // Restore translation
    ctx.restore();
    
    // === BORDER (last step) ===
    ctx.save();
    ctx.lineWidth = 8;  // thickness of border
    ctx.strokeStyle = '#333333'; // border color
    ctx.strokeRect(0, 0, finalWidth, finalHeight);
    ctx.restore();

    // Return optimized buffer
    if (useJPEG) {
        return canvas.toBuffer('image/jpeg', { quality: JPEG_QUALITY });
    } else {
        return canvas.toBuffer('image/png', { compressionLevel: 9 });
    }
}

module.exports = generateTileMapImage;
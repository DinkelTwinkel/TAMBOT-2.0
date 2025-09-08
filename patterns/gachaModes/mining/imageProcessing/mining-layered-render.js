// generateMiningProcedural_layered.js - Enhanced with layered rendering system
const { createCanvas, loadImage } = require('canvas');
const gachaVC = require('../../../../models/activevcs');
const getPlayerStats = require('../../../calculatePlayerStat');
const itemSheet = require('../../../../data/itemSheet.json');
const PlayerInventory = require('../../../../models/inventory');
const UniqueItem = require('../../../../models/uniqueItems');
const { getUniqueItemById } = require('../../../../data/uniqueItemsSheet');
const path = require('path');
const fs = require('fs').promises;
const { generateThemeImages } = require('./generateMissingImages');
const railStorage = require('../railStorage');

// Import the tileset blending functionality
const {
    analyzeMineProgression,
    calculateBlendingPercentage,
    getBlendedTileTheme,
    debugMineProgression,
    shouldUseNextTierTile,
    createTileSeed,
    seededRandom,
    TIER_GROUPS
} = require('./tileset-blender');

// Import the proper modules - check if they exist as encounter or hazard
let encounterStorage, ENCOUNTER_TYPES, ENCOUNTER_CONFIG;
try {
    // Try loading as encounter modules first
    encounterStorage = require('../encounterStorage');
    const constants = require('../miningConstants_unified');
    ENCOUNTER_TYPES = constants.ENCOUNTER_TYPES;
    ENCOUNTER_CONFIG = constants.ENCOUNTER_CONFIG;
} catch (e) {
    // Fall back to hazard modules if encounter modules don't exist yet
    try {
        encounterStorage = require('../hazardStorage');
        const constants = require('../miningConstants_unified');
        ENCOUNTER_TYPES = constants.HAZARD_TYPES || constants.ENCOUNTER_TYPES;
        ENCOUNTER_CONFIG = constants.HAZARD_CONFIG || constants.ENCOUNTER_CONFIG;
    } catch (e2) {
        console.warn('Neither encounter nor hazard modules found, using defaults');
        // Provide defaults if neither exists - INCLUDING FIRE_BLAST
        ENCOUNTER_TYPES = {
            PORTAL_TRAP: 'portal_trap',
            BOMB_TRAP: 'bomb_trap',
            GREEN_FOG: 'green_fog',
            WALL_TRAP: 'wall_trap',
            FIRE_BLAST: 'fire_blast',  // Add fire blast
            TREASURE: 'treasure'
        };
        ENCOUNTER_CONFIG = {
            fire_blast: {
                name: 'Fire Blast',
                symbol: '🔥',
                color: '#FF6B35',
                image: 'fire_blast'
            }
        };
        encounterStorage = {
            getEncountersData: async () => ({}),
            getHazardsData: async () => ({}),
            getEncounter: () => null,
            getHazard: () => null,
            hasEncounter: () => false,
            hasHazard: () => false
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

// Enhanced cache for loaded tile images with TTL and memory management
class TileImageCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 500; // Limit cache size to prevent memory issues
        this.ttl = 5 * 60 * 1000; // 5 minutes TTL
        this.accessTimes = new Map(); // Track last access for LRU
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        // Check if expired
        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            this.accessTimes.delete(key);
            return null;
        }
        
        // Update access time for LRU
        this.accessTimes.set(key, Date.now());
        return item.image;
    }
    
    has(key) {
        const item = this.cache.get(key);
        if (!item) return false;
        
        // Check if expired
        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            this.accessTimes.delete(key);
            return false;
        }
        
        return true;
    }
    
    set(key, image) {
        // Remove oldest items if cache is full
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }
        
        this.cache.set(key, {
            image,
            timestamp: Date.now()
        });
        this.accessTimes.set(key, Date.now());
    }
    
    evictOldest() {
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, time] of this.accessTimes.entries()) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.accessTimes.delete(oldestKey);
        }
    }
    
    clear() {
        this.cache.clear();
        this.accessTimes.clear();
    }
    
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: this.cache.size / this.maxSize
        };
    }
}

const tileImageCache = new TileImageCache();

// Performance monitoring for rendering operations
class RenderPerformanceMonitor {
    constructor() {
        this.metrics = {
            totalRenders: 0,
            slowRenders: 0,
            averageRenderTime: 0,
            layerTimes: {
                floor: [],
                midground: [],
                top: []
            },
            cacheHits: 0,
            cacheMisses: 0
        };
    }
    
    recordRender(totalTime) {
        this.metrics.totalRenders++;
        this.metrics.averageRenderTime = (this.metrics.averageRenderTime + totalTime) / 2;
        
        if (totalTime > 2000) {
            this.metrics.slowRenders++;
        }
    }
    
    recordLayerTime(layer, time) {
        this.metrics.layerTimes[layer].push(time);
        if (this.metrics.layerTimes[layer].length > 100) {
            this.metrics.layerTimes[layer].shift();
        }
    }
    
    recordCacheHit() {
        this.metrics.cacheHits++;
    }
    
    recordCacheMiss() {
        this.metrics.cacheMisses++;
    }
    
    getStats() {
        return {
            ...this.metrics,
            cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
            slowRenderRate: this.metrics.slowRenders / this.metrics.totalRenders || 0
        };
    }
}

const renderMonitor = new RenderPerformanceMonitor();

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
 * Get the current mine theme from gachaServers.json - ENHANCED with blending support
 */
function getMineTheme(dbEntry, tileX = undefined, tileY = undefined, tileType = 'floor', channelId = '') {
    // Get the server type ID from the database entry
    const typeId = dbEntry?.typeId;
    if (!typeId) {
        console.log(`No typeId found in database entry, using generic theme`);
        return MINE_THEMES.GENERIC;
    }
    
    // Load gachaServers.json to get the theme
    const gachaServers = require('../../../../data/gachaServers.json');
    
    // ENHANCED: Use blended tile theme if position is provided
    if (tileX !== undefined && tileY !== undefined && channelId) {
        const blendedTheme = getBlendedTileTheme(String(typeId), tileX, tileY, tileType, channelId, gachaServers);
        if (blendedTheme) {
            // Only log occasionally to avoid spam
            if ((tileX + tileY) % 20 === 0) {
                console.log(`Using blended theme: ${blendedTheme} for tile (${tileX}, ${tileY}) type ${tileType}`);
            }
            return blendedTheme;
        }
    }
    
    const serverConfig = gachaServers.find(s => s.id === String(typeId));
    
    if (!serverConfig) {
        console.log(`No server config found for typeId ${typeId}, using generic theme`);
        return MINE_THEMES.GENERIC;
    }
    
    // Use the theme field if it exists
    if (serverConfig.theme) {
        console.log(`Using theme from config: ${serverConfig.theme} for ${serverConfig.name}`);
        return serverConfig.theme;
    }
    
    // Use the image field as the theme if no theme field exists
    // This handles deeper and ultra mines which use image names like:
    // coalMineDeep, coalMineUltra, diamondMineDeep, etc.
    if (serverConfig.image) {
        console.log(`Using image field as theme: ${serverConfig.image} for ${serverConfig.name}`);
        return serverConfig.image;
    }
    
    // Fallback: Try to infer from server name (mostly for backwards compatibility)
    const serverName = serverConfig.name || '';
    const cleanName = serverName.replace(/⛏️|️/g, '').trim().toLowerCase();
    
    console.log(`No theme or image field found, inferring from server name: ${serverName}`);
    
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
    
    console.log(`No specific theme found, using generic theme`);
    return MINE_THEMES.GENERIC;
}

/**
 * ENHANCED: Load a random variation of a tile image with position-aware theming
 * Now supports blended themes based on tile position
 */
async function loadTileImageVariation(tileType, theme = MINE_THEMES.GENERIC, variationSeed = 0, dbEntry = null, tileX = undefined, tileY = undefined, channelId = '') {
    // Input validation
    if (!tileType || typeof tileType !== 'string') {
        console.warn('[IMAGE LOADER] Invalid tileType provided');
        return null;
    }
    
    // ENHANCED: Get position-specific theme if context is provided
    let actualTheme = theme;
    if (dbEntry && channelId && tileX !== undefined && tileY !== undefined) {
        try {
            actualTheme = getMineTheme(dbEntry, tileX, tileY, tileType, channelId);
        } catch (error) {
            console.warn('[IMAGE LOADER] Error getting position theme:', error);
        }
    }
    
    const cacheKey = `${actualTheme}_${tileType}_${variationSeed}_${tileX}_${tileY}`;
    
    // Check cache first using the new cache system
    const cachedImage = tileImageCache.get(cacheKey);
    if (cachedImage) {
        return cachedImage;
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
        path.join(__dirname, '../../../../assets/game/tiles', `${actualTheme}_${baseName}_${variation}.png`) :
        path.join(__dirname, '../../../../assets/game/tiles', `${actualTheme}_${baseName}.png`);
    
    try {
        const image = await loadImage(primaryPath);
        tileImageCache.set(cacheKey, image);
        // Successfully loaded blended tile (log removed to reduce spam)
        return image;
    } catch (error) {
        // Image doesn't exist, try to generate it
        console.log(`Blended image not found: ${primaryPath}, attempting to generate theme images...`);
        
        try {
            // Generate missing images for this theme
            await generateThemeImages(actualTheme);
            console.log(`Generated images for theme: ${actualTheme}`);
            
            // Try loading again after generation
            const image = await loadImage(primaryPath);
            tileImageCache.set(cacheKey, image);
            console.log(`Successfully loaded after generation: ${primaryPath}`);
            return image;
        } catch (genError) {
            console.warn(`Failed to generate or load tile image for theme ${actualTheme}: ${primaryPath}`);
            console.warn(`Error details:`, genError.message);
            
            // Try fallback to generic theme
            const genericPath = variation > 1 ?
                path.join(__dirname, '../../../../assets/game/tiles', `generic_${baseName}_${variation}.png`) :
                path.join(__dirname, '../../../../assets/game/tiles', `generic_${baseName}.png`);
            
            console.log(`Attempting generic fallback: ${genericPath}`);
            
            try {
                const image = await loadImage(genericPath);
                tileImageCache.set(cacheKey, image);
                console.log(`Loaded generic fallback: ${genericPath}`);
                return image;
            } catch (genericError) {
                // Generate generic version
                console.log(`Generic not found, generating generic theme images...`);
                try {
                    await generateThemeImages('generic');
                    const image = await loadImage(genericPath);
                    tileImageCache.set(cacheKey, image);
                    console.log(`Successfully loaded generic after generation: ${genericPath}`);
                    return image;
                } catch (finalError) {
                    console.error(`Failed to load or generate any tile image for ${baseName}`);
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
    const primaryPath = path.join(__dirname, '../../../../assets/game/encounters', `${theme}_${imageFileName}.png`);
    
    try {
        const image = await loadImage(primaryPath);
        tileImageCache.set(cacheKey, image);
        console.log(`Successfully loaded encounter: ${primaryPath}`);
        return image;
    } catch (error) {
        // Image doesn't exist, try to generate it
        console.log(`Encounter image not found: ${primaryPath}, attempting to generate...`);
        
        try {
            // Generate missing images for this theme
            await generateThemeImages(theme);
            console.log(`Generated encounter images for theme: ${theme}`);
            
            // Try loading again after generation
            const image = await loadImage(primaryPath);
            tileImageCache.set(cacheKey, image);
            console.log(`Successfully loaded encounter after generation: ${primaryPath}`);
            return image;
        } catch (genError) {
            console.warn(`Failed to generate or load encounter image for theme ${theme}: ${primaryPath}`);
            // Try fallback to generic theme
            const genericPath = path.join(__dirname, '../../../../assets/game/encounters', `generic_${imageFileName}.png`);
            
            console.log(`Attempting generic encounter fallback: ${genericPath}`);
            
            try {
                const image = await loadImage(genericPath);
                tileImageCache.set(cacheKey, image);
                console.log(`Loaded generic encounter: ${genericPath}`);
                return image;
            } catch (genericError) {
                // Generate generic version
                console.log(`Generic encounter not found, generating...`);
                try {
                    await generateThemeImages('generic');
                    const image = await loadImage(genericPath);
                    tileImageCache.set(cacheKey, image);
                    console.log(`Successfully loaded generic encounter after generation: ${genericPath}`);
                    return image;
                } catch (finalError) {
                    console.error(`Failed to load or generate encounter image for ${imageFileName}`);
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

// /**
//  * Simple seeded random number generator
//  */
// function seededRandom(seed) {
//     const x = Math.sin(seed) * 10000;
//     return x - Math.floor(x);
// }

/**
 * Check if a tile is a wall type
 */
function isWallType(tile) {
    return tile && (
        tile.type === TILE_TYPES.WALL || 
        tile.type === TILE_TYPES.WALL_WITH_ORE ||
        tile.type === TILE_TYPES.REINFORCED_WALL ||
        tile.type === TILE_TYPES.RARE_ORE
    );
}

/**
 * Draw shadow gradients on floor tiles adjacent to walls
 */
function drawFloorShadowGradients(ctx, tiles, x, y, pixelX, pixelY, tileSize, isVisible) {
    // Check adjacent tiles for walls (but not walls below)
    const wallNorth = y > 0 && isWallType(tiles[y - 1][x]);
    const wallSouth = false; // Never draw shadow from below
    const wallEast = x < tiles[0].length - 1 && isWallType(tiles[y][x + 1]);
    const wallWest = x > 0 && isWallType(tiles[y][x - 1]);
    
    // Also check diagonal walls for corner shadows
    const wallNorthEast = y > 0 && x < tiles[0].length - 1 && isWallType(tiles[y - 1][x + 1]);
    const wallNorthWest = y > 0 && x > 0 && isWallType(tiles[y - 1][x - 1]);
    
    const shadowIntensity = isVisible ? 0.15 : 0.25; // Darker shadows in non-visible areas
    const gradientSize = tileSize * 0.4; // How far the gradient extends into the tile
    
    ctx.save();
    
    // North wall shadow (strongest, as walls are above)
    if (wallNorth) {
        const gradient = ctx.createLinearGradient(
            pixelX + tileSize / 2, pixelY,
            pixelX + tileSize / 2, pixelY + gradientSize
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${shadowIntensity * 1.5})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX, pixelY, tileSize, gradientSize);
    }
    
    // East wall shadow
    if (wallEast) {
        const gradient = ctx.createLinearGradient(
            pixelX + tileSize, pixelY + tileSize / 2,
            pixelX + tileSize - gradientSize, pixelY + tileSize / 2
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${shadowIntensity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX + tileSize - gradientSize, pixelY, gradientSize, tileSize);
    }
    
    // West wall shadow
    if (wallWest) {
        const gradient = ctx.createLinearGradient(
            pixelX, pixelY + tileSize / 2,
            pixelX + gradientSize, pixelY + tileSize / 2
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${shadowIntensity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX, pixelY, gradientSize, tileSize);
    }
    
    // Corner shadows (diagonal walls create subtle corner darkening)
    const cornerSize = tileSize * 0.3;
    const cornerIntensity = shadowIntensity * 0.7;
    
    // Northeast corner
    if (wallNorthEast && !wallNorth && !wallEast) {
        const gradient = ctx.createRadialGradient(
            pixelX + tileSize, pixelY,
            0,
            pixelX + tileSize, pixelY,
            cornerSize
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${cornerIntensity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX + tileSize - cornerSize, pixelY, cornerSize, cornerSize);
    }
    
    // Northwest corner
    if (wallNorthWest && !wallNorth && !wallWest) {
        const gradient = ctx.createRadialGradient(
            pixelX, pixelY,
            0,
            pixelX, pixelY,
            cornerSize
        );
        gradient.addColorStop(0, `rgba(0, 0, 0, ${cornerIntensity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(pixelX, pixelY, cornerSize, cornerSize);
    }
    
    ctx.restore();
}

/**
 * Draw floor layer
 */
async function drawFloorLayer(ctx, tiles, width, height, tileSize, visibilityMap, theme, channelId, dbEntry = null) {
    const startTime = Date.now();
    let tilesDrawn = 0;
    
    // Pre-calculate common values
    const channelHash = parseInt(channelId.slice(-6), 10) || 123456;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = tiles[y] && tiles[y][x];
            if (!tile) continue;
            
            const tileKey = `${x},${y}`;
            let isVisible = visibilityMap.visible.has(tileKey);
            const wasDiscovered = tile.discovered;
            
            if (!isVisible && !wasDiscovered) continue;
            
            tilesDrawn++;
            
            const pixelX = x * tileSize;
            const pixelY = y * tileSize;
            
            // Apply darkness for non-visible but discovered tiles
            ctx.globalAlpha = 1.0;
            
            // Only draw floor for non-wall tiles
            if (tile.type === TILE_TYPES.FLOOR || tile.type === TILE_TYPES.ENTRANCE) {
                if (tile.type === TILE_TYPES.ENTRANCE) {
                    // Skip drawing floor here since entrance will draw its own themed floor
                    // The entrance function will handle the floor rendering
                } else {
                    // Regular floor tile with random rotation
                    const variationSeed = (x * 7 + y * 13) % 100;
                    const floorImage = await loadTileImageVariation(TILE_TYPES.FLOOR, theme, variationSeed, dbEntry, x, y, channelId);
                    
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
                    
                    // Draw shadow gradients from adjacent walls
                    drawFloorShadowGradients(ctx, tiles, x, y, pixelX, pixelY, tileSize, isVisible);
                    
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
    
    // Performance monitoring
    const layerTime = Date.now() - startTime;
    if (layerTime > 500) {
        console.warn(`[FLOOR LAYER] Slow rendering: ${layerTime}ms for ${tilesDrawn} tiles`);
    }
}

/**
 * Draw a single wall tile with connection logic
 */
async function drawWallTile(ctx, tile, x, y, tiles, floorTileSize, wallTileHeight, isVisible, wasDiscovered, theme, visibilityMap, channelId, dbEntry = null) {
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
    const wallImage = await loadTileImageVariation(tile.type, theme, variationSeed, dbEntry, x, y, channelId);
    
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
    
    // Double-check that the hazard actually exists in storage (not already triggered/removed)
    const stillExists = encounterStorage.hasEncounter ? 
        encounterStorage.hasEncounter(encountersData, tileX, tileY) :
        encounterStorage.hasHazard ?
        encounterStorage.hasHazard(encountersData, tileX, tileY) : false;
        
    if (!stillExists) {
        console.log(`[RENDER] Skipping removed hazard at (${tileX}, ${tileY})`);
        return;
    }
    
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
        
        // Darken if not visible but was discovered
        if (!isVisible && wasDiscovered) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(imageX, imageY, encounterSize, encounterSize);
        }
        
        // Removed question mark and reveal overlay for clearer visibility
    } else {
        // Fallback to programmatic rendering
        drawEncounterFallback(ctx, encounter, centerX, centerY, tileSize, isVisible, wasDiscovered);
    }
    
    ctx.restore();
}

/**
 * Draw animated fire trap with enhanced visual effects
 */
function drawFireTrap(ctx, centerX, centerY, tileSize, isVisible, wasDiscovered, animationFrame = 0) {
    const fireSize = Math.max(tileSize * 0.8, 16);
    
    // Create multiple flame layers for depth
    const flames = [
        { size: fireSize, offset: 0, alpha: 0.9 },
        { size: fireSize * 0.8, offset: -fireSize * 0.1, alpha: 0.7 },
        { size: fireSize * 0.6, offset: -fireSize * 0.2, alpha: 0.5 }
    ];
    
    ctx.save();
    
    // Draw base embers/coals
    const emberGradient = ctx.createRadialGradient(
        centerX, centerY + fireSize * 0.3, 0,
        centerX, centerY + fireSize * 0.3, fireSize * 0.5
    );
    emberGradient.addColorStop(0, isVisible ? '#FF4500' : '#7F2200');
    emberGradient.addColorStop(0.5, isVisible ? '#8B0000' : '#450000');
    emberGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = emberGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + fireSize * 0.3, fireSize * 0.4, fireSize * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw flame layers
    flames.forEach((flame, index) => {
        ctx.save();
        ctx.globalAlpha = flame.alpha;
        
        // Animate flame with sine wave
        const waveOffset = Math.sin(animationFrame * 0.1 + index) * fireSize * 0.05;
        const heightVariation = 1 + Math.sin(animationFrame * 0.15 + index * 0.5) * 0.1;
        
        // Create flame gradient
        const flameGradient = ctx.createRadialGradient(
            centerX + waveOffset, centerY + flame.offset, 0,
            centerX + waveOffset, centerY + flame.offset, flame.size / 2
        );
        
        // Inner core - white hot
        flameGradient.addColorStop(0, isVisible ? '#FFFFFF' : '#808080');
        flameGradient.addColorStop(0.2, isVisible ? '#FFFF99' : '#7F7F4C');
        flameGradient.addColorStop(0.4, isVisible ? '#FFD700' : '#7F6B00');
        flameGradient.addColorStop(0.6, isVisible ? '#FFA500' : '#7F5200');
        flameGradient.addColorStop(0.8, isVisible ? '#FF6B35' : '#7F351A');
        flameGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        
        // Draw flame shape using bezier curves
        ctx.fillStyle = flameGradient;
        ctx.beginPath();
        
        const flameHeight = flame.size * heightVariation;
        const flameWidth = flame.size * 0.6;
        
        // Flame path
        ctx.moveTo(centerX + waveOffset, centerY + flame.offset - flameHeight * 0.5);
        ctx.bezierCurveTo(
            centerX + waveOffset - flameWidth * 0.5, centerY + flame.offset - flameHeight * 0.3,
            centerX + waveOffset - flameWidth * 0.4, centerY + flame.offset + flameHeight * 0.2,
            centerX + waveOffset, centerY + flame.offset + flameHeight * 0.3
        );
        ctx.bezierCurveTo(
            centerX + waveOffset + flameWidth * 0.4, centerY + flame.offset + flameHeight * 0.2,
            centerX + waveOffset + flameWidth * 0.5, centerY + flame.offset - flameHeight * 0.3,
            centerX + waveOffset, centerY + flame.offset - flameHeight * 0.5
        );
        
        ctx.fill();
        ctx.restore();
    });
    
    // Add sparks/particles
    if (tileSize >= 32) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 5; i++) {
            const sparkTime = (animationFrame * 0.02 + i * 0.4) % 1;
            const sparkY = centerY + fireSize * 0.3 - sparkTime * fireSize * 1.5;
            const sparkX = centerX + Math.sin(i * 2 + animationFrame * 0.05) * fireSize * 0.3;
            const sparkSize = Math.max(1, (1 - sparkTime) * tileSize * 0.05);
            
            ctx.fillStyle = isVisible ? '#FFD700' : '#7F6B00';
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    
    // Add heat distortion effect (shimmer)
    ctx.save();
    ctx.globalAlpha = 0.2;
    const shimmerGradient = ctx.createRadialGradient(
        centerX, centerY - fireSize * 0.2, 0,
        centerX, centerY - fireSize * 0.2, fireSize
    );
    shimmerGradient.addColorStop(0, isVisible ? 'rgba(255, 255, 255, 0.5)' : 'rgba(128, 128, 128, 0.5)');
    shimmerGradient.addColorStop(0.5, 'rgba(255, 165, 0, 0.2)');
    shimmerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = shimmerGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - fireSize * 0.2, fireSize * 0.8, fireSize * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Add ground scorch marks
    ctx.save();
    ctx.globalAlpha = 0.5;
    const scorchGradient = ctx.createRadialGradient(
        centerX, centerY + fireSize * 0.35, 0,
        centerX, centerY + fireSize * 0.35, fireSize * 0.7
    );
    scorchGradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
    scorchGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.3)');
    scorchGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = scorchGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + fireSize * 0.35, fireSize * 0.6, fireSize * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    ctx.restore();
}

/**
 * Draw lightning trap with animated electric effects
 */
function drawLightningTrap(ctx, centerX, centerY, tileSize, isVisible, wasDiscovered) {
    ctx.save();
    
    const trapSize = Math.max(8, tileSize * 0.6);
    const animationFrame = Date.now() / 100; // Animation timing
    
    if (isVisible) {
        // Draw electric field background
        ctx.fillStyle = 'rgba(255, 215, 0, 0.3)'; // Golden glow
        ctx.beginPath();
        ctx.arc(centerX, centerY, trapSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw animated lightning bolts
        ctx.strokeStyle = '#FFD700'; // Gold
        ctx.lineWidth = Math.max(1, tileSize * 0.05);
        ctx.lineCap = 'round';
        
        // Draw multiple lightning bolts radiating from center
        const boltCount = 6;
        for (let i = 0; i < boltCount; i++) {
            const angle = (i * Math.PI * 2 / boltCount) + (animationFrame * 0.1);
            const length = trapSize * (0.5 + Math.sin(animationFrame + i) * 0.3);
            
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            
            // Create jagged lightning bolt
            const segments = 3;
            for (let j = 1; j <= segments; j++) {
                const segmentLength = length / segments;
                const baseX = centerX + Math.cos(angle) * segmentLength * j;
                const baseY = centerY + Math.sin(angle) * segmentLength * j;
                
                // Add random jaggedness
                const jaggerX = baseX + (Math.random() - 0.5) * tileSize * 0.2;
                const jaggerY = baseY + (Math.random() - 0.5) * tileSize * 0.2;
                
                ctx.lineTo(jaggerX, jaggerY);
            }
            
            ctx.stroke();
        }
        
        // Draw central electric core
        ctx.fillStyle = '#FFFF00'; // Bright yellow
        ctx.beginPath();
        ctx.arc(centerX, centerY, trapSize * 0.2, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw pulsing electric ring
        const pulseSize = trapSize * (0.8 + Math.sin(animationFrame * 0.5) * 0.2);
        ctx.strokeStyle = '#00FFFF'; // Cyan
        ctx.lineWidth = Math.max(1, tileSize * 0.03);
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseSize, 0, Math.PI * 2);
        ctx.stroke();
        
    } else if (wasDiscovered) {
        // Dimmed version for discovered but not visible
        ctx.fillStyle = 'rgba(255, 215, 0, 0.1)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, trapSize * 0.8, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#7F7F00'; // Dim yellow
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, trapSize * 0.6, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // Draw lightning symbol if tile is large enough
    if (tileSize >= 20) {
        ctx.fillStyle = isVisible ? '#FFFFFF' : '#7F7F7F';
        ctx.font = `bold ${Math.floor(trapSize * 0.8)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', centerX, centerY);
    }
    
    ctx.restore();
}

/**
 * Fallback rendering for encounters without images
 */
function drawEncounterFallback(ctx, encounter, centerX, centerY, tileSize, isVisible, wasDiscovered) {
    const encounterSize = Math.max(10, tileSize * 0.7);
    const config = ENCOUNTER_CONFIG[encounter.type];
    
    // Removed unrevealed state handling - always show actual encounter
    {
        // Special rendering for fire_blast
        if (encounter.type === 'fire_blast' || encounter.type === ENCOUNTER_TYPES?.FIRE_BLAST) {
            // Use the enhanced fire trap rendering
            const animationFrame = Date.now() / 50; // Simple animation based on time
            drawFireTrap(ctx, centerX, centerY, tileSize, isVisible, wasDiscovered, animationFrame);
        } 
        // Special rendering for lightning_strike
        else if (encounter.type === 'lightning_strike' || encounter.type === ENCOUNTER_TYPES?.LIGHTNING_STRIKE) {
            drawLightningTrap(ctx, centerX, centerY, tileSize, isVisible, wasDiscovered);
        } else {
            // Default rendering for other hazards
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
}

/**
 * Draw mine entrance tile
 */
async function drawMineEntrance(ctx, x, y, floorTileSize, wallTileHeight, isVisible, wasDiscovered, theme, channelId, dbEntry = null) {
    const pixelX = x * floorTileSize;
    const pixelY = y * floorTileSize;
    
    // Wall tiles are taller - they extend upward from the floor position
    // The bottom of the wall aligns with the floor tile bottom
    const wallPixelY = pixelY + floorTileSize - wallTileHeight;
    
    ctx.save();
    
    // First, draw a themed floor tile underneath the entrance
    const variationSeed = (x * 7 + y * 13) % 100;
    const floorImage = await loadTileImageVariation(TILE_TYPES.FLOOR, theme, variationSeed, dbEntry, x, y, channelId);
    
    if (floorImage) {
        // Generate seed for rotation based on channel ID and tile position
        const channelHash = parseInt(channelId.slice(-6), 10) || 123456;
        const rotationSeed = channelHash + x * 1337 + y * 7919;
        const rotation = Math.floor(seededRandom(rotationSeed) * 4) * 90; // 0, 90, 180, or 270 degrees
        
        ctx.save();
        ctx.translate(pixelX + floorTileSize/2, pixelY + floorTileSize/2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(floorImage, -floorTileSize/2, -floorTileSize/2, floorTileSize, floorTileSize);
        ctx.restore();
    } else {
        // Fallback to themed color
        ctx.fillStyle = isVisible ? '#D2B48C' : '#3A2F20';
        ctx.fillRect(pixelX, pixelY, floorTileSize, floorTileSize);
    }
    
    // Try to load a theme-specific entrance image first
    const themeEntrancePath = path.join(__dirname, '../../../../assets/game/tiles', `${theme}_entrance.png`);
    let entranceImage = null;
    
    try {
        entranceImage = await loadImage(themeEntrancePath);
    } catch (error) {
        // Try generic entrance as fallback
        try {
            const genericEntrancePath = path.join(__dirname, '../../../../assets/game/tiles/generic_entrance.png');
            entranceImage = await loadImage(genericEntrancePath);
        } catch (genericError) {
            // No entrance images available
        }
    }
    
    if (entranceImage) {
        // Draw the entrance image at full opacity (no transparency darkening)
        // It extends upward into the tile above for perspective
        ctx.drawImage(entranceImage, pixelX, wallPixelY, floorTileSize, wallTileHeight);
    } else {
        // Programmatic rendering with themed elements
        // Draw entrance frame/walls on sides
        const frameWidth = floorTileSize * 0.15;
        
        // Use theme colors for the entrance frame
        const themeConfig = require('./generateMissingImages').THEMES[theme] || require('./generateMissingImages').THEMES.generic;
        
        // Left wall
        ctx.fillStyle = isVisible ? themeConfig.primaryColor : '#1A1A1A';
        ctx.fillRect(pixelX, wallPixelY, frameWidth, wallTileHeight);
        
        // Right wall
        ctx.fillRect(pixelX + floorTileSize - frameWidth, wallPixelY, frameWidth, wallTileHeight);
        
        // Top arch/frame
        const archHeight = wallTileHeight * 0.3;
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, archHeight);
        
        // Draw dark entrance opening
        const openingX = pixelX + frameWidth;
        const openingY = wallPixelY + archHeight;
        const openingWidth = floorTileSize - (frameWidth * 2);
        const openingHeight = wallTileHeight - archHeight;
        
        // Create depth gradient for entrance
        const depthGradient = ctx.createLinearGradient(
            openingX, openingY,
            openingX, openingY + openingHeight
        );
        depthGradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
        depthGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.85)');
        depthGradient.addColorStop(1, '#000000');
        
        ctx.fillStyle = depthGradient;
        ctx.fillRect(openingX, openingY, openingWidth, openingHeight);
        
        // Add entrance glow effect
        const entranceGradient = ctx.createRadialGradient(
            pixelX + floorTileSize/2, wallPixelY + wallTileHeight/2, 0,
            pixelX + floorTileSize/2, wallPixelY + wallTileHeight/2, floorTileSize/2
        );
        entranceGradient.addColorStop(0, isVisible ? 'rgba(255, 215, 0, 0.2)' : 'rgba(139, 117, 0, 0.2)');
        entranceGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = entranceGradient;
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        
        // Draw EXIT text or symbol
        if (floorTileSize >= 20) {
            ctx.fillStyle = isVisible ? '#FFD700' : '#8B7500';
            ctx.font = `bold ${Math.floor(floorTileSize * 0.25)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('EXIT', pixelX + floorTileSize/2, wallPixelY + archHeight/2);
        }
    }
    
    // Darken if not visible
    if (!isVisible && wasDiscovered) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
    }
    
    ctx.restore();
}

/**
 * Draw midground layer (walls, players, hazards, etc.) with Y-sorting
 */
async function drawMidgroundLayer(ctx, tiles, width, height, floorTileSize, wallTileHeight, 
                                  visibilityMap, theme, members, playerPositions, 
                                  railsData, encountersData, imageSettings, channelId, inShortBreak = false, dbEntry = null) {
    
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
            
            // Add encounters (only if they still exist in storage - not triggered/removed)
            const hasEncounter = encounterStorage.hasEncounter ? 
                encounterStorage.hasEncounter(encountersData, x, y) :
                encounterStorage.hasHazard ?
                encounterStorage.hasHazard(encountersData, x, y) : false;
                
            if (hasEncounter && (effectiveIsVisible || wasDiscovered)) {
                // Verify the hazard/encounter data is valid and not a removed placeholder
                const encounter = encounterStorage.getEncounter ? 
                    encounterStorage.getEncounter(encountersData, x, y) :
                    encounterStorage.getHazard ? 
                    encounterStorage.getHazard(encountersData, x, y) : null;
                    
                // Only add if we have valid encounter data
                if (encounter && encounter.type) {
                    midgroundObjects.push({
                        type: 'encounter',
                        y: y,
                        x: x,
                        isVisible: effectiveIsVisible,
                        wasDiscovered: wasDiscovered,
                        renderY: y * floorTileSize + floorTileSize * 0.5
                    });
                }
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
                                 obj.isVisible, obj.wasDiscovered, theme, visibilityMap, channelId, dbEntry);
                break;
                
            case 'entrance':
                await drawMineEntrance(ctx, obj.x, obj.y, floorTileSize, wallTileHeight,
                                     obj.isVisible, obj.wasDiscovered, theme, channelId, dbEntry);
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
                        // Check if player should be invisible to others (includes dead players)
                        const isDead = position.dead || position.invisible;
                        const shouldRenderPlayer = !member.visibilityInfo?.isInvisible && !isDead;
                        
                        if (shouldRenderPlayer) {
                            // Apply reduced visibility effect
                            if (member.visibilityInfo?.hasReducedVisibility) {
                                ctx.save();
                                ctx.globalAlpha = 0.6; // Semi-transparent
                            }
                            
                            await drawPlayerAvatar(ctx, member, tileCenterX, tileCenterY,
                                                 imageSettings.playerAvatarSize, imageSettings, channelId);
                            
                            // Draw player name for larger images with role color
                            if (floorTileSize >= 40) {
                                const roleColor = getUserRoleColor(member);
                                ctx.fillStyle = roleColor;
                                ctx.strokeStyle = '#000000';
                                ctx.font = `${Math.max(8, Math.floor(floorTileSize * 0.17))}px Arial`;
                                ctx.textAlign = 'center';
                                ctx.lineWidth = Math.max(1, Math.floor(imageSettings.scaleFactor * 2));
                                const nameY = tileCenterY + imageSettings.playerAvatarSize/2 + Math.max(8, floorTileSize * 0.2);
                                ctx.strokeText(member.displayName, tileCenterX, nameY);
                                ctx.fillText(member.displayName, tileCenterX, nameY);
                            }
                            
                            if (member.visibilityInfo?.hasReducedVisibility) {
                                ctx.restore();
                            }
                        } else {
                            // Player is invisible - don't render them
                            console.log(`[RENDER] ${member.displayName} is invisible due to Shadowstep Boots`);
                        }
                    }
                } else {
                    // Multiple players on same tile - stack them
                    await drawStackedPlayers(ctx, obj.players, tileCenterX, tileCenterY, 
                                           floorTileSize, imageSettings, channelId);
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
async function drawPlayerAvatar(ctx, member, centerX, centerY, size, imageSettings, channelId) {
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
        
        // Avatar border with role color
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.strokeStyle = getUserRoleColor(member);
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
                
                try {
                    const pickaxeImage = await loadImage(pickaxeImagePath);
                    
                    const pickaxeSize = size * 1;
                    const pickaxeX = centerX - radius * 1.7;
                    const pickaxeY = centerY - pickaxeSize/3;
                    
                    ctx.save();
                    ctx.globalAlpha = 0.9;
                    ctx.drawImage(pickaxeImage, pickaxeX, pickaxeY, pickaxeSize, pickaxeSize);
                    ctx.restore();

                    // Display player health above avatar instead of mining level
                    if (size > 30) {
                        try {
                            // Get player health from their data
                            let currentHealth = 100;
                            let maxHealth = 100;
                            
                            try {
                                const playerData = await getPlayerStats(member.user.id);
                                if (playerData && playerData.health) {
                                    currentHealth = playerData.health.current || 100;
                                    maxHealth = playerData.health.max || 100;
                                }
                            } catch (playerError) {
                                console.warn(`[RENDER] Could not get player data for health display:`, playerError);
                            }
                            
                            // Calculate health percentage for color coding
                            const healthPercent = currentHealth / maxHealth;
                            let healthColor = '#00FF00'; // Green for full health
                            if (healthPercent < 0.25) {
                                healthColor = '#FF0000'; // Red for critical health
                            } else if (healthPercent < 0.5) {
                                healthColor = '#FF8000'; // Orange for low health
                            } else if (healthPercent < 0.75) {
                                healthColor = '#FFFF00'; // Yellow for medium health
                            }
                            
                            ctx.save();
                            ctx.font = `bold ${Math.floor(size * 0.22)}px Arial`;
                            ctx.fillStyle = healthColor;
                            ctx.strokeStyle = '#000000';
                            ctx.lineWidth = 2;
                            ctx.textAlign = 'center';
                            
                            const healthText = `${currentHealth}/${maxHealth}`;
                            const textX = centerX;
                            const textY = centerY - radius - 8;
                            
                            ctx.strokeText(healthText, textX, textY);
                            ctx.fillText(healthText, textX, textY);
                            
                            // Draw a small health bar background
                            const barWidth = size * 0.8;
                            const barHeight = 4;
                            const barX = centerX - barWidth / 2;
                            const barY = centerY - radius - 20;
                            
                            // Health bar background
                            ctx.fillStyle = '#333333';
                            ctx.fillRect(barX, barY, barWidth, barHeight);
                            
                            // Health bar fill
                            ctx.fillStyle = healthColor;
                            ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
                            
                            // Health bar border
                            ctx.strokeStyle = '#FFFFFF';
                            ctx.lineWidth = 1;
                            ctx.strokeRect(barX, barY, barWidth, barHeight);
                            
                            ctx.restore();
                        } catch (healthError) {
                            console.warn(`[RENDER] Error displaying health for ${member.displayName}:`, healthError);
                        }
                    }
                } catch (imageError) {
                    // If the unique pickaxe image doesn't exist, try to use a fallback
                    console.warn(`Unique pickaxe image not found: ${pickaxeImagePath}, using fallback`);
                    
                    // Try to use a regular pickaxe image as fallback
                    const fallbackImagePath = `./assets/items/ironpickaxe.png`;
                    try {
                        const fallbackImage = await loadImage(fallbackImagePath);
                        
                        const pickaxeSize = size * 1;
                        const pickaxeX = centerX - radius * 1.7;
                        const pickaxeY = centerY - pickaxeSize/3;
                        
                        ctx.save();
                        ctx.globalAlpha = 0.9;
                        ctx.drawImage(fallbackImage, pickaxeX, pickaxeY, pickaxeSize, pickaxeSize);
                        ctx.restore();

                        // Display player health above avatar (fallback case)
                        if (size > 30) {
                            try {
                                // Get player health from their data
                                let currentHealth = 100;
                                let maxHealth = 100;
                                
                                if (playerData && playerData.health) {
                                    currentHealth = playerData.health.current || 100;
                                    maxHealth = playerData.health.max || 100;
                                }
                                
                                // Calculate health percentage for color coding
                                const healthPercent = currentHealth / maxHealth;
                                let healthColor = '#00FF00'; // Green for full health
                                if (healthPercent < 0.25) {
                                    healthColor = '#FF0000'; // Red for critical health
                                } else if (healthPercent < 0.5) {
                                    healthColor = '#FF8000'; // Orange for low health
                                } else if (healthPercent < 0.75) {
                                    healthColor = '#FFFF00'; // Yellow for medium health
                                }
                                
                                ctx.save();
                                ctx.font = `bold ${Math.floor(size * 0.22)}px Arial`;
                                ctx.fillStyle = healthColor;
                                ctx.strokeStyle = '#000000';
                                ctx.lineWidth = 2;
                                ctx.textAlign = 'center';
                                
                                const healthText = `${currentHealth}/${maxHealth}`;
                                const textX = centerX;
                                const textY = centerY - radius - 8;
                                
                                ctx.strokeText(healthText, textX, textY);
                                ctx.fillText(healthText, textX, textY);
                                
                                // Draw a small health bar
                                const barWidth = size * 0.8;
                                const barHeight = 4;
                                const barX = centerX - barWidth / 2;
                                const barY = centerY - radius - 20;
                                
                                // Health bar background
                                ctx.fillStyle = '#333333';
                                ctx.fillRect(barX, barY, barWidth, barHeight);
                                
                                // Health bar fill
                                ctx.fillStyle = healthColor;
                                ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
                                
                                // Health bar border
                                ctx.strokeStyle = '#FFFFFF';
                                ctx.lineWidth = 1;
                                ctx.strokeRect(barX, barY, barWidth, barHeight);
                                
                                ctx.restore();
                            } catch (healthError) {
                                console.warn(`[RENDER] Error displaying health for ${member.displayName}:`, healthError);
                            }
                        }
                    } catch (fallbackError) {
                        console.error(`Fallback pickaxe image also failed: ${fallbackImagePath}`, fallbackError);
                    }
                }
            }
        } catch (error) {
            console.error(`Error loading pickaxe for user ${member.user.username}:`, error);
        }

        // Always display health above avatar when size is large enough
        const shouldShowHealth = size > 30;
        
        if (shouldShowHealth) {
            try {
                // Get player health from their data
                let currentHealth = 100;
                let maxHealth = 100;
                
                try {
                    // Get health from separate PlayerHealth schema
                    const PlayerHealth = require('../../../../models/PlayerHealth');
                    const playerHealth = await PlayerHealth.findPlayerHealth(member.user.id, channelId);
                    
                if (playerHealth) {
                    // Dead players show 0 health
                    if (playerHealth.isDead) {
                        currentHealth = 0;
                        maxHealth = playerHealth.maxHealth || 100;
                    } else {
                        currentHealth = playerHealth.currentHealth || 100;
                        maxHealth = playerHealth.maxHealth || 100;
                    }
                } else {
                    // Fallback to default health
                    currentHealth = 100;
                    maxHealth = 100;
                }
                } catch (playerError) {
                    console.warn(`[RENDER] Could not get player health data for display:`, playerError);
                }
                
                // Calculate health percentage for color coding
                const healthPercent = currentHealth / maxHealth;
                let healthColor = '#00FF00'; // Green for full health
                if (healthPercent < 0.25) {
                    healthColor = '#FF0000'; // Red for critical health
                } else if (healthPercent < 0.5) {
                    healthColor = '#FF8000'; // Orange for low health
                } else if (healthPercent < 0.75) {
                    healthColor = '#FFFF00'; // Yellow for medium health
                }
                
                const radius = size / 2;
                
                ctx.save();
                ctx.font = `bold ${Math.floor(size * 0.22)}px Arial`;
                ctx.fillStyle = healthColor;
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.textAlign = 'center';
                
                const healthText = `${currentHealth}/${maxHealth}`;
                const textX = centerX;
                const textY = centerY - radius - 8;
                
                ctx.strokeText(healthText, textX, textY);
                ctx.fillText(healthText, textX, textY);
                
                // Draw a small health bar
                const barWidth = size * 0.8;
                const barHeight = 4;
                const barX = centerX - barWidth / 2;
                const barY = centerY - radius - 20;
                
                // Health bar background
                ctx.fillStyle = '#333333';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // Health bar fill
                ctx.fillStyle = healthColor;
                ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
                
                // Health bar border
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX, barY, barWidth, barHeight);
                
                ctx.restore();
            } catch (healthError) {
                console.warn(`[RENDER] Error displaying health for ${member.displayName}:`, healthError);
            }
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
async function drawStackedPlayers(ctx, players, centerX, centerY, tileSize, imageSettings, channelId) {
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
            await drawPlayerAvatar(ctx, member, playerX, playerY, scaledSize, imageSettings, channelId);
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
 * Get best mining pickaxe for a player (enhanced to include unique items)
 */
async function getBestMiningPickaxe(userId) {
    try {
        let bestPickaxe = null;
        let bestMiningPower = 0;
        const debugInfo = [];

        // Check regular inventory items first
        const inventory = await PlayerInventory.findOne({ playerId: userId });
        if (inventory && inventory.items && inventory.items.length > 0) {
            for (const invItem of inventory.items) {
                if (invItem.quantity <= 0) continue;

                const item = itemSheet.find(i => i.id === invItem.itemId);
                if (!item || item.type !== 'tool' || item.slot !== 'mining') continue;

                const miningAbility = item.abilities?.find(a => a.name === 'mining');
                if (!miningAbility || !miningAbility.powerlevel) continue;

                debugInfo.push(`Regular: ${item.name} (power: ${miningAbility.powerlevel})`);

                if (miningAbility.powerlevel > bestMiningPower) {
                    bestMiningPower = miningAbility.powerlevel;
                    bestPickaxe = item;
                }
            }
        }

        // Check unique items owned by the player
        try {
            const uniqueItems = await UniqueItem.findPlayerUniqueItems(userId);
            debugInfo.push(`Found ${uniqueItems ? uniqueItems.length : 0} unique items`);
            
            if (uniqueItems && uniqueItems.length > 0) {
                for (const uniqueItem of uniqueItems) {
                    console.log(`[PICKAXE DEBUG] Processing unique item:`, JSON.stringify(uniqueItem, null, 2));
                    
                    // The database field is 'itemId', not 'uniqueItemId'
                    const uniqueItemData = getUniqueItemById(uniqueItem.itemId);
                    console.log(`[PICKAXE DEBUG] Retrieved unique item data:`, uniqueItemData ? uniqueItemData.name : 'null');
                    
                    if (!uniqueItemData) {
                        console.log(`[PICKAXE DEBUG] No data found for unique item ID: ${uniqueItem.itemId}`);
                        continue;
                    }
                    
                    if (uniqueItemData.type !== 'tool') {
                        console.log(`[PICKAXE DEBUG] Item ${uniqueItemData.name} is not a tool (type: ${uniqueItemData.type})`);
                        continue;
                    }
                    
                    if (uniqueItemData.slot !== 'mining') {
                        console.log(`[PICKAXE DEBUG] Item ${uniqueItemData.name} is not a mining tool (slot: ${uniqueItemData.slot})`);
                        continue;
                    }

                    const miningAbility = uniqueItemData.abilities?.find(a => a.name === 'mining');
                    if (!miningAbility || !miningAbility.powerlevel) {
                        console.log(`[PICKAXE DEBUG] Item ${uniqueItemData.name} has no mining ability or powerlevel`);
                        continue;
                    }

                    debugInfo.push(`Unique: ${uniqueItemData.name} (power: ${miningAbility.powerlevel})`);

                    // If this unique pickaxe is better than the current best, use it
                    if (miningAbility.powerlevel > bestMiningPower) {
                        bestMiningPower = miningAbility.powerlevel;
                        bestPickaxe = uniqueItemData;
                    }
                }
            }
        } catch (uniqueError) {
            console.error(`Error checking unique items for user ${userId}:`, uniqueError);
        }

        // Debug logging
        console.log(`[PICKAXE DEBUG] User ${userId}:`);
        console.log(`  Available pickaxes: ${debugInfo.join(', ')}`);
        console.log(`  Selected: ${bestPickaxe ? bestPickaxe.name : 'none'} (power: ${bestMiningPower})`);

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
 * Final pass shader - randomly replaces black pixels with the pixel below
 * Creates a dripping/bleeding effect for shadows and dark areas
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} replaceChance - Chance to replace a black pixel (0-1)
 * @param {number} blackThreshold - RGB values below this are considered "black" (0-255)
 */
function applyFinalPassShader(ctx, width, height, replaceChance = 0.3, blackThreshold = 20) {
    // Get the image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Create a copy of the original data to read from
    const originalData = new Uint8ClampedArray(data);
    
    // Iterate through pixels from top to bottom (skip last row since we need pixel below)
    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width; x++) {
            // Calculate pixel index (RGBA format, so 4 values per pixel)
            const currentIndex = (y * width + x) * 4;
            const belowIndex = ((y + 1) * width + x) * 4;
            
            // Get current pixel RGB values from original data
            const r = originalData[currentIndex];
            const g = originalData[currentIndex + 1];
            const b = originalData[currentIndex + 2];
            const a = originalData[currentIndex + 3];
            
            // Check if pixel is black (or very dark)
            const isBlack = r <= blackThreshold && g <= blackThreshold && b <= blackThreshold;
            
            if (isBlack && a > 0) { // Only process non-transparent black pixels
                // Random chance to replace with pixel below
                if (Math.random() < replaceChance) {
                    // Copy the pixel below to current position
                    data[currentIndex] = originalData[belowIndex];       // R
                    data[currentIndex + 1] = originalData[belowIndex + 1]; // G
                    data[currentIndex + 2] = originalData[belowIndex + 2]; // B
                    // Keep original alpha to maintain transparency
                    data[currentIndex + 3] = a;
                }
            }
        }
    }
    
    // Put the modified image data back
    ctx.putImageData(imageData, 0, 0);
}

/**
 * Get user's role color from Discord
 */
function getUserRoleColor(member) {
    try {
        // Get the highest role with a color
        const roleColor = member.displayHexColor;
        
        // If no role color or default color, use white
        if (!roleColor || roleColor === '#000000') {
            return '#FFFFFF';
        }
        
        return roleColor;
    } catch (error) {
        console.warn(`[RENDER] Error getting role color for ${member.displayName}:`, error);
        return '#FFFFFF'; // Fallback to white
    }
}

/**
 * Draw HP bars for all players in the top left corner when map is too large
 */
async function drawCornerHPDisplay(ctx, members, channelId, canvasWidth, canvasHeight) {
    try {
        // Get health data for all players
        const gachaVC = require('../../../../models/activevcs');
        const dbEntry = await gachaVC.findOne({ channelId: channelId }).lean();
        
        const playersWithHealth = [];
        
        for (const member of members.values()) {
            if (member.user.bot) continue;
            
            let currentHealth = 100;
            let maxHealth = 100;
            
            // Get health from separate PlayerHealth schema
            try {
                const PlayerHealth = require('../../../../models/PlayerHealth');
                const playerHealth = await PlayerHealth.findPlayerHealth(member.user.id, channelId);
                
                if (playerHealth) {
                    // Dead players show 0 health
                    if (playerHealth.isDead) {
                        currentHealth = 0;
                        maxHealth = playerHealth.maxHealth || 100;
                    } else {
                        currentHealth = playerHealth.currentHealth || 100;
                        maxHealth = playerHealth.maxHealth || 100;
                    }
                }
            } catch (healthError) {
                console.warn(`[RENDER] Could not get health for ${member.displayName}:`, healthError);
            }
            
            playersWithHealth.push({
                name: member.displayName,
                currentHealth,
                maxHealth,
                healthPercent: currentHealth / maxHealth,
                roleColor: getUserRoleColor(member)
            });
        }
        
        if (playersWithHealth.length === 0) return;
        
        // Position in top left corner with more padding from border
        const startX = 20;
        const startY = 40; // Increased from 20 to 40 for more top padding
        const barWidth = 120;
        const barHeight = 8; // Thinner bars
        const spacing = 30; // More padding between bars
        const maxPlayers = Math.min(12, playersWithHealth.length); // Reduced to fit better with more spacing
        
        ctx.save();
        
        // Draw HP bars for each player
        for (let i = 0; i < maxPlayers; i++) {
            const player = playersWithHealth[i];
            const y = startY + (i * spacing);
            
            // Player name with role color
            ctx.fillStyle = player.roleColor;
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(player.name, startX, y - 8);
            
            // HP bar background
            ctx.fillStyle = '#333333';
            ctx.fillRect(startX, y, barWidth, barHeight);
            
            // HP bar fill
            let healthColor = '#00FF00'; // Green
            if (player.healthPercent < 0.25) {
                healthColor = '#FF0000'; // Red
            } else if (player.healthPercent < 0.5) {
                healthColor = '#FF8000'; // Orange
            } else if (player.healthPercent < 0.75) {
                healthColor = '#FFFF00'; // Yellow
            }
            
            ctx.fillStyle = healthColor;
            ctx.fillRect(startX, y, barWidth * player.healthPercent, barHeight);
            
            // HP text
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`${player.currentHealth}/${player.maxHealth}`, startX + barWidth + 5, y + 6);
        }
        
        ctx.restore();
        
    } catch (error) {
        console.error('[RENDER] Error in drawCornerHPDisplay:', error);
    }
}

/**
 * Main function to generate enhanced layered mining map
 */
async function generateTileMapImage(channel) {
    const startTime = Date.now();
    
    // Input validation
    if (!channel?.isVoiceBased()) {
        throw new Error('Channel must be a voice channel');
    }
    
    if (!channel.id) {
        throw new Error('Channel ID is required');
    }

    const result = await gachaVC.findOne({ channelId: channel.id });
    if (!result || !result.gameData || !result.gameData.map) {
        throw new Error('No map data found for this channel');
    }

    const mapData = result.gameData.map;
    const { tiles, width, height, playerPositions } = mapData;
    
    // Get theme for this mine from gachaServers.json image field
    const theme = getMineTheme(result);
    console.log(`Using theme: ${theme} for channel ${channel.id}`);
    
    // Get rails and encounters data - always fetch fresh to ensure we have latest state
    let railsData, encountersData;
    try {
        railsData = await railStorage.getRailsData(channel.id);
    } catch (error) {
        console.warn(`[RENDER] Error loading rails data for channel ${channel.id}:`, error);
        railsData = null;
    }
    
    try {
        // Force a fresh fetch of hazards data to ensure triggered hazards are not shown
        encountersData = await (encounterStorage.getEncountersData || encounterStorage.getHazardsData)?.call(encounterStorage, channel.id) || {};
    } catch (error) {
        console.warn(`[RENDER] Error loading encounters data for channel ${channel.id}:`, error);
        encountersData = {};
    }
    
    // Log hazard count for debugging
    const hazardCount = encountersData.hazards ? encountersData.hazards.size : 0;
    console.log(`[RENDER] Found ${hazardCount} active hazards for channel ${channel.id}`);
    
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
        try {
            const position = playerPositions[member.id];
            if (!position) continue;
            
            const playerData = await getPlayerStats(member.id);
            const sightRadius = playerData?.stats?.sight || 0;
            
            // Check if player has unique item visibility effects
            let isInvisible = false;
            let hasReducedVisibility = false;
            
            if (playerData && playerData.equippedItems) {
                const { parseUniqueItemBonuses } = require('../uniqueItemBonuses');
                const uniqueBonuses = parseUniqueItemBonuses(playerData.equippedItems);
                
                if (uniqueBonuses.minimapSystem) {
                    isInvisible = uniqueBonuses.minimapSystem.invisible;
                    hasReducedVisibility = uniqueBonuses.minimapSystem.reducedVisibility > 0;
                }
            }
            
            // Apply visibility modifiers
            let effectiveSightRadius = sightRadius;
            if (hasReducedVisibility) {
                effectiveSightRadius = Math.floor(sightRadius * 0.8); // Reduced sight
            }
            
            const visibleTiles = calculateVisibleTiles(position, effectiveSightRadius, tiles, imageSettings);
            for (const tile of visibleTiles) {
                allVisibleTiles.add(tile);
            }
            
            // Store visibility info for later use in player rendering
            if (!member.visibilityInfo) {
                member.visibilityInfo = {};
            }
            member.visibilityInfo = {
                isInvisible,
                hasReducedVisibility,
                effectiveSightRadius
            };
            
        } catch (error) {
            console.warn(`[RENDER] Error calculating visibility for member ${member.id}:`, error);
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
        await drawFloorLayer(ctx, tiles, width, height, floorTileSize, visibilityMap, theme, channel.id, refreshedEntry);
        
        // === LAYER 2: MIDGROUND LAYER (Y-sorted) - pass empty members to hide players ===
        const emptyMembers = new Map(); // Hide all players during long break
        await drawMidgroundLayer(ctx, tiles, width, height, floorTileSize, wallTileHeight,
                                visibilityMap, theme, emptyMembers, {},
                                railsData, encountersData, imageSettings, channel.id, false, refreshedEntry);
        
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
    try {
        await drawFloorLayer(ctx, tiles, width, height, floorTileSize, visibilityMap, theme, channel.id, result);
    } catch (error) {
        console.error(`[RENDER] Error drawing floor layer for channel ${channel.id}:`, error);
    }
    
    // === LAYER 2: MIDGROUND LAYER (Y-sorted) ===
    try {
        await drawMidgroundLayer(ctx, tiles, width, height, floorTileSize, wallTileHeight,
                                visibilityMap, theme, members, playerPositions,
                                railsData, encountersData, imageSettings, channel.id, inShortBreak, result);
    } catch (error) {
        console.error(`[RENDER] Error drawing midground layer for channel ${channel.id}:`, error);
    }
    
    // === LAYER 3: TOP LAYER ===
    try {
        await drawTopLayer(ctx, width, height, floorTileSize, theme);
    } catch (error) {
        console.error(`[RENDER] Error drawing top layer for channel ${channel.id}:`, error);
    }
    
    // === CORNER HP DISPLAY (when individual HP bars are too small) ===
    if (floorTileSize <= 30) {
        try {
            await drawCornerHPDisplay(ctx, members, channel.id, finalWidth, finalHeight);
        } catch (error) {
            console.error(`[RENDER] Error drawing corner HP display for channel ${channel.id}:`, error);
        }
    }

    // Restore translation
    ctx.restore();
    
    // === FINAL PASS SHADER ===
    // Apply the dripping/bleeding effect to black pixels
    // Disabled for now due to entrance rendering issues
    // applyFinalPassShader(ctx, finalWidth, finalHeight, 0.25, 10);
    
    // === BORDER (last step) ===
    ctx.save();
    ctx.lineWidth = 8;  // thickness of border
    ctx.strokeStyle = '#333333'; // border color
    ctx.strokeRect(0, 0, finalWidth, finalHeight);
    ctx.restore();

    // Performance monitoring
    const totalTime = Date.now() - startTime;
    renderMonitor.recordRender(totalTime);
    
    if (totalTime > 2000) {
        console.warn(`[RENDER] Slow image generation: ${totalTime}ms for channel ${channel.id}`);
    }
    
    // Log cache statistics
    const cacheStats = tileImageCache.getStats();
    if (cacheStats.size > 0) {
        console.log(`[RENDER] Cache stats: ${cacheStats.size}/${cacheStats.maxSize} (${Math.round(cacheStats.hitRate * 100)}% full)`);
    }
    
    // Log performance statistics
    const perfStats = renderMonitor.getStats();
    if (perfStats.totalRenders % 10 === 0) { // Log every 10 renders
        console.log(`[RENDER] Performance stats: Avg ${Math.round(perfStats.averageRenderTime)}ms, Cache hit rate: ${Math.round(perfStats.cacheHitRate * 100)}%`);
    }

    // Return optimized buffer
    if (useJPEG) {
        return canvas.toBuffer('image/jpeg', { quality: JPEG_QUALITY });
    } else {
        return canvas.toBuffer('image/png', { compressionLevel: 9 });
    }
}

module.exports = {
    generateTileMapImage,
    getBestMiningPickaxe,
    loadTileImageVariation,
    getMineTheme
};
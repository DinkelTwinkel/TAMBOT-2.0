// mining-layered-render-blended.js - Enhanced version with tileset blending support
const { createCanvas, loadImage } = require('canvas');
const gachaVC = require('../../../../models/activevcs');
const getPlayerStats = require('../../../calculatePlayerStat');
const itemSheet = require('../../../../data/itemSheet.json');
const PlayerInventory = require('../../../../models/inventory');
const path = require('path');
const fs = require('fs').promises;
const { generateThemeImages } = require('./generateMissingImages');
const railStorage = require('../railStorage');

// Import the tileset blending functionality
const {
    analyzeMineProgression,
    calculateBlendingPercentage,
    getBlendedTileTheme,
    createBlendedTileImage,
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

// Cache for loaded tile images - now includes position-specific caching for blended themes
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
 * Get the current mine theme from gachaServers.json - ENHANCED with blending support
 */
function getMineTheme(dbEntry, tileX = 0, tileY = 0, tileType = 'floor', channelId = '') {
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
            console.log(`Using blended theme: ${blendedTheme} for tile (${tileX}, ${tileY}) type ${tileType}`);
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
async function loadTileImageVariation(tileType, theme = MINE_THEMES.GENERIC, variationSeed = 0, dbEntry = null, tileX = 0, tileY = 0, channelId = '') {
    // ENHANCED: Get position-specific theme if context is provided
    let actualTheme = theme;
    if (dbEntry && channelId && tileX !== undefined && tileY !== undefined) {
        actualTheme = getMineTheme(dbEntry, tileX, tileY, tileType, channelId);
    }
    
    const cacheKey = `${actualTheme}_${tileType}_${variationSeed}_${tileX}_${tileY}`;
    
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
        path.join(__dirname, '../../../../assets/game/tiles', `${actualTheme}_${baseName}_${variation}.png`) :
        path.join(__dirname, '../../../../assets/game/tiles', `${actualTheme}_${baseName}.png`);
    
    try {
        const image = await loadImage(primaryPath);
        tileImageCache.set(cacheKey, image);
        console.log(`Successfully loaded blended tile: ${primaryPath}`);
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

// NOTE: The rest of the functions are identical to the original implementation
// I'll include a few key ones that needed modification and indicate where others would be copied

/**
 * ENHANCED: Draw floor layer with blended tile support
 */
async function drawFloorLayer(ctx, tiles, width, height, tileSize, visibilityMap, theme, channelId, dbEntry) {
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
                    // Skip drawing floor here since entrance will draw its own themed floor
                    // The entrance function will handle the floor rendering
                } else {
                    // ENHANCED: Regular floor tile with blended theme and random rotation
                    const variationSeed = (x * 7 + y * 13) % 100;
                    const floorImage = await loadTileImageVariation(TILE_TYPES.FLOOR, theme, variationSeed, dbEntry, x, y, channelId);
                    
                    // Generate seed for rotation based on channel ID and tile position
                    const channelHash = parseInt(channelId.slice(-6), 16) || 0x123456;
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
                    
                    // Draw shadow gradients from adjacent walls (same as original)
                    drawFloorShadowGradients(ctx, tiles, x, y, pixelX, pixelY, tileSize, isVisible);
                    
                    // Darken if not visible
                    if (!isVisible && wasDiscovered) {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                        ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
                    }
                }
                
                // Add random floor decorations (same as original)
                if (isVisible && tileSize >= 32 && Math.random() < 0.1) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                    const decorSize = tileSize * 0.2;
                    const decorX = pixelX + Math.random() * (tileSize - decorSize);
                    const decorY = pixelY + Math.random() * (tileSize - decorSize);
                    ctx.fillRect(decorX, decorY, decorSize, decorSize);
                }
            } else {
                // Draw a dark floor under walls (same as original)
                ctx.fillStyle = isVisible ? '#2C2C2C' : '#0A0A0A';
                ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
            }
        }
    }
    
    ctx.globalAlpha = 1.0;
}

/**
 * ENHANCED: Draw a single wall tile with blended theme support
 */
async function drawWallTile(ctx, tile, x, y, tiles, floorTileSize, wallTileHeight, isVisible, wasDiscovered, theme, visibilityMap, channelId, dbEntry) {
    // [Same visibility logic as original...]
    
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
    
    // ENHANCED: Choose wall image based on connections with blended theme
    const variationSeed = (x * 11 + y * 17) % 100;
    const wallImage = await loadTileImageVariation(tile.type, theme, variationSeed, dbEntry, x, y, channelId);
    
    // Determine if we should flip horizontally based on channel ID and position
    const channelHash = parseInt(channelId.slice(-6), 16) || 0x123456;
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
        // Fallback rendering (same as original)
        let wallColor = TILE_COLORS[tile.type] || '#444444';
        
        // Base wall with darkening for non-visible
        ctx.fillStyle = isVisible ? wallColor : '#1A1A1A';
        ctx.fillRect(pixelX, wallPixelY, floorTileSize, wallTileHeight);
        
        // [Rest of fallback rendering logic same as original...]
    }
}

// Import all other helper functions from the original
// These don't need modification for blending support:
// - getWallConnections
// - isWallSurrounded  
// - calculateOptimalImageSettings
// - calculateVisibleTiles
// - drawFloorShadowGradients
// - drawEncounter
// - drawFireTrap
// - drawEncounterFallback  
// - drawMineEntrance
// - drawMidgroundLayer
// - drawTopLayer
// - drawRails
// - drawPlayerAvatar
// - drawCampfire
// - drawStackedPlayers
// - drawTent
// - getBestMiningPickaxe
// - isBreakPeriod
// - isLongBreak

// [Include all the helper functions from the original file...]
// [For brevity, I'll include placeholders but you would copy them all]

/**
 * Copy all helper functions from the original mining-layered-render.js:
 * - getWallConnections
 * - isWallSurrounded
 * - calculateOptimalImageSettings  
 * - calculateVisibleTiles
 * - drawFloorShadowGradients
 * - drawEncounter
 * - drawFireTrap
 * - drawEncounterFallback
 * - drawMineEntrance
 * - drawMidgroundLayer
 * - drawTopLayer
 * - drawRails
 * - drawPlayerAvatar
 * - drawCampfire
 * - drawStackedPlayers
 * - drawTent
 * - getBestMiningPickaxe
 * - isBreakPeriod
 * - isLongBreak
 */

// NOTE: Copy all the helper functions from the original file here
// I'll indicate where they would go with comments to save space in this example

// [COPY ALL HELPER FUNCTIONS FROM ORIGINAL HERE]

/**
 * ENHANCED: Main function to generate enhanced layered mining map with tileset blending
 */
async function generateTileMapImage(channel, debugMode = false) {
    if (!channel?.isVoiceBased()) throw new Error('Channel must be a voice channel');

    const result = await gachaVC.findOne({ channelId: channel.id });
    if (!result || !result.gameData || !result.gameData.map) {
        throw new Error('No map data found for this channel');
    }

    const mapData = result.gameData.map;
    const { tiles, width, height, playerPositions } = mapData;
    
    // ENHANCED: Debug mine progression if requested
    if (debugMode) {
        const gachaServers = require('../../../../data/gachaServers.json');
        debugMineProgression(gachaServers);
        
        // Show current mine analysis
        const progression = analyzeMineProgression(String(result.typeId), gachaServers);
        if (progression) {
            console.log(`\nCURRENT MINE: ${progression.mineEntry.name}`);
            console.log(`Level: ${progression.level} (Deep: ${progression.isDeepLevel})`);
            console.log(`Current theme: ${progression.currentTierTheme}`);
            console.log(`Next theme: ${progression.nextTierTheme || 'None'}`);
            console.log(`Blend percentage: ${calculateBlendingPercentage(progression)}%\n`);
        }
    }
    
    // Get theme for this mine from gachaServers.json image field - base theme only
    const baseTheme = getMineTheme(result);
    console.log(`Using base theme: ${baseTheme} for channel ${channel.id}`);
    
    // Get rails and encounters data - always fetch fresh to ensure we have latest state
    const railsData = await railStorage.getRailsData(channel.id);
    const encountersData = await (encounterStorage.getEncountersData || encounterStorage.getHazardsData)?.call(encounterStorage, channel.id) || {};
    
    // Log hazard count for debugging
    const hazardCount = encountersData.hazards ? encountersData.hazards.size : 0;
    console.log(`[RENDER] Found ${hazardCount} active hazards for channel ${channel.id}`);
    
    // Calculate image settings
    const imageSettings = calculateOptimalImageSettings(width, height);
    const { floorTileSize, wallTileHeight, outputWidth, outputHeight, 
            finalWidth, finalHeight, useJPEG, playerAvatarSize, stackedOffset } = imageSettings;
    
    console.log(`Generating BLENDED layered mining map: ${finalWidth}x${finalHeight} (${useJPEG ? 'JPEG' : 'PNG'}) with base theme: ${baseTheme}`);
    
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

    // Fill background (fog of war)
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
        await drawFloorLayer(ctx, tiles, width, height, floorTileSize, visibilityMap, baseTheme, channel.id, result);
        
        // === LAYER 2: MIDGROUND LAYER (Y-sorted) - pass empty members to hide players ===
        const emptyMembers = new Map(); // Hide all players during long break
        await drawMidgroundLayer(ctx, tiles, width, height, floorTileSize, wallTileHeight,
                                visibilityMap, baseTheme, emptyMembers, {},
                                railsData, encountersData, imageSettings, channel.id, false, result);
        
        // === LAYER 3: TOP LAYER ===
        await drawTopLayer(ctx, width, height, floorTileSize, baseTheme);
        
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

    // === LAYER 1: ENHANCED FLOOR LAYER with blending ===
    await drawFloorLayer(ctx, tiles, width, height, floorTileSize, visibilityMap, baseTheme, channel.id, result);
    
    // === LAYER 2: ENHANCED MIDGROUND LAYER with blending ===
    await drawMidgroundLayer(ctx, tiles, width, height, floorTileSize, wallTileHeight,
                            visibilityMap, baseTheme, members, playerPositions,
                            railsData, encountersData, imageSettings, channel.id, inShortBreak, result);
    
    // === LAYER 3: TOP LAYER ===
    await drawTopLayer(ctx, width, height, floorTileSize, baseTheme);

    // Restore translation
    ctx.restore();
    
    // === BORDER ===
    ctx.save();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#333333';
    ctx.strokeRect(0, 0, finalWidth, finalHeight);
    ctx.restore();

    // Return optimized buffer
    if (useJPEG) {
        return canvas.toBuffer('image/jpeg', { quality: JPEG_QUALITY });
    } else {
        return canvas.toBuffer('image/png', { compressionLevel: 9 });
    }
}

module.exports = {
    generateTileMapImage,
    // Export the blending utilities for external use
    analyzeMineProgression,
    calculateBlendingPercentage,
    getBlendedTileTheme,
    debugMineProgression,
    TIER_GROUPS
};
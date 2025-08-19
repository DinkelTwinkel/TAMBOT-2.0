// generateMiningProcedural_enhanced.js - Enhanced with new tile types
const { createCanvas, loadImage } = require('canvas');
const gachaVC = require('../models/activevcs');
const getPlayerStats = require('./calculatePlayerStat');
const itemSheet = require('../data/itemSheet.json');
const PlayerInventory = require('../models/inventory');
const path = require('path');

// Constants
const BASE_TILE_SIZE = 64;
const PLAYER_AVATAR_SIZE = 50;
const STACKED_OFFSET = 10;

// Image optimization constants
const MAX_IMAGE_WIDTH = 1000;
const MAX_IMAGE_HEIGHT = 1000;
const MIN_TILE_SIZE = 5;
const JPEG_QUALITY = 0.8;
const USE_JPEG_THRESHOLD = 300;
const BORDER_SIZE = 5;

// Enhanced tile types (updated to match mining_optimized_v2.js)
const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor', 
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore',
    RARE_ORE: 'rare_ore',           // New: High-value ore nodes
    TREASURE_CHEST: 'treasure',    // New: Special treasure finds
    HAZARD: 'hazard',              // New: Dangerous tiles
    REINFORCED_WALL: 'reinforced'  // New: Harder to break walls
};

// Tile image paths (REPLACE THESE WITH YOUR ACTUAL IMAGE FILES)
const TILE_IMAGES = {
    [TILE_TYPES.WALL]: './assets/tiles/wall.png',                    // Standard stone wall
    [TILE_TYPES.FLOOR]: './assets/tiles/floor.png',                 // Cleared floor tiles
    [TILE_TYPES.ENTRANCE]: './assets/tiles/entrance.png',           // Mine entrance
    [TILE_TYPES.WALL_WITH_ORE]: './assets/tiles/ore_wall.png',      // Wall with visible ore veins
    [TILE_TYPES.RARE_ORE]: './assets/tiles/rare_ore.png',           // Rare crystalline ore formations
    [TILE_TYPES.TREASURE_CHEST]: './assets/tiles/treasure.png',     // Treasure chest
    [TILE_TYPES.HAZARD]: './assets/tiles/hazard.png',               // Dangerous area (spikes, gas, etc.)
    [TILE_TYPES.REINFORCED_WALL]: './assets/tiles/reinforced.png'   // Extra tough wall
};

// Fallback colors when images aren't available
const TILE_COLORS = {
    [TILE_TYPES.WALL]: '#444444',
    [TILE_TYPES.FLOOR]: '#DDDDDD',
    [TILE_TYPES.ENTRANCE]: '#FF4444',
    [TILE_TYPES.WALL_WITH_ORE]: '#444444', // Base color, ore will be overlaid
    [TILE_TYPES.RARE_ORE]: '#6A0DAD',      // Purple for rare ore
    [TILE_TYPES.TREASURE_CHEST]: '#FFD700', // Gold for treasure
    [TILE_TYPES.HAZARD]: '#FF0000',        // Red for danger
    [TILE_TYPES.REINFORCED_WALL]: '#2F2F2F' // Darker gray for reinforced
};

// Configuration: Set to true to use images, false for colors
const USE_TILE_IMAGES = false; // Change to true when you have tile images ready

// Cache for loaded tile images
const tileImageCache = new Map();

/**
 * Load and cache a tile image
 */
async function loadTileImage(tileType) {
    if (!USE_TILE_IMAGES) return null;
    
    if (tileImageCache.has(tileType)) {
        return tileImageCache.get(tileType);
    }
    
    try {
        const imagePath = TILE_IMAGES[tileType];
        if (!imagePath) return null;
        
        const image = await loadImage(imagePath);
        tileImageCache.set(tileType, image);
        return image;
    } catch (error) {
        console.warn(`Failed to load tile image for ${tileType}:`, error.message);
        tileImageCache.set(tileType, null); // Cache the failure
        return null;
    }
}

/**
 * Calculate optimal tile size and output format based on map dimensions
 */
function calculateOptimalImageSettings(mapWidth, mapHeight) {
    let tileSize = BASE_TILE_SIZE;
    let outputWidth = mapWidth * tileSize;
    let outputHeight = mapHeight * tileSize;
    
    const availableWidth = MAX_IMAGE_WIDTH - (BORDER_SIZE * 2);
    const availableHeight = MAX_IMAGE_HEIGHT - (BORDER_SIZE * 2);
    
    const widthScale = availableWidth / outputWidth;
    const heightScale = availableHeight / outputHeight;
    const minScale = Math.min(widthScale, heightScale, 1);
    
    if (minScale < 1) {
        tileSize = Math.max(MIN_TILE_SIZE, Math.floor(tileSize * minScale));
        outputWidth = mapWidth * tileSize;
        outputHeight = mapHeight * tileSize;
    }
    
    const finalWidth = outputWidth + (BORDER_SIZE * 2);
    const finalHeight = outputHeight + (BORDER_SIZE * 2);
    const useJPEG = (finalWidth > USE_JPEG_THRESHOLD || finalHeight > USE_JPEG_THRESHOLD);
    
    return {
        tileSize,
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
 * Enhanced visibility calculation matching the new mining system
 */
function calculateVisibleTiles(position, sightRadius, tiles, imageSettings) {
    const visible = new Set();
    const { x: px, y: py } = position;
    
    visible.add(`${px},${py}`);
    
    if (sightRadius <= 0) {
        // Basic visibility: current tile + adjacent in 8 directions
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
    
    // Enhanced ray casting for better visibility
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
                break; // Stop ray at walls
            }
        }
    }
    
    return visible;
}

/**
 * Enhanced tile drawing with support for new tile types
 */
async function drawTile(ctx, tile, pixelX, pixelY, tileSize, isVisible, wasDiscovered) {
    if (!isVisible && !wasDiscovered) return;
    
    const alpha = isVisible ? 1.0 : 0.4;
    ctx.globalAlpha = alpha;
    
    // Try to load and use tile image
    const tileImage = await loadTileImage(tile.type);
    
    if (tileImage) {
        // Draw tile image
        ctx.drawImage(tileImage, pixelX, pixelY, tileSize, tileSize);
    } else {
        // Fallback to color-based rendering
        await drawTileWithColors(ctx, tile, pixelX, pixelY, tileSize, isVisible, wasDiscovered);
    }
    
    // Add special effects for certain tiles
    await addTileEffects(ctx, tile, pixelX, pixelY, tileSize, isVisible);
    
    ctx.globalAlpha = 1.0;
}

/**
 * Color-based tile rendering (fallback or when USE_TILE_IMAGES is false)
 */
async function drawTileWithColors(ctx, tile, pixelX, pixelY, tileSize, isVisible, wasDiscovered) {
    let tileColor = TILE_COLORS[tile.type] || '#000000';
    
    // Special handling for certain tile types
    switch (tile.type) {
        case TILE_TYPES.WALL_WITH_ORE:
            if (wasDiscovered) {
                // Draw wall background
                ctx.fillStyle = TILE_COLORS[TILE_TYPES.WALL];
                ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
                
                // Draw ore veins
                const oreSize = Math.max(4, tileSize * 0.5);
                const oreOffset = (tileSize - oreSize) / 2;
                
                if (tileSize < 32) {
                    ctx.fillStyle = '#FFD700';
                } else {
                    const gradient = ctx.createLinearGradient(
                        pixelX + oreOffset, pixelY + oreOffset,
                        pixelX + oreOffset + oreSize, pixelY + oreOffset + oreSize
                    );
                    gradient.addColorStop(0, '#FFD700');
                    gradient.addColorStop(0.5, '#FFA500');
                    gradient.addColorStop(1, '#FF8C00');
                    ctx.fillStyle = gradient;
                }
                
                ctx.fillRect(pixelX + oreOffset, pixelY + oreOffset, oreSize, oreSize);
                
                // if (tileSize >= 24) {
                //     ctx.strokeStyle = '#FFD700';
                //     ctx.lineWidth = Math.max(1, Math.floor(tileSize / 32));
                //     ctx.strokeRect(pixelX + oreOffset, pixelY + oreOffset, oreSize, oreSize);
                // }
                return;
            } else {
                tileColor = '#333300';
            }
            break;
            
        case TILE_TYPES.RARE_ORE:
            if (wasDiscovered) {
                // Create shimmering effect for rare ore
                const gradient = ctx.createRadialGradient(
                    pixelX + tileSize/2, pixelY + tileSize/2, 0,
                    pixelX + tileSize/2, pixelY + tileSize/2, tileSize/2
                );
                gradient.addColorStop(0, '#9932CC'); // Dark orchid center
                gradient.addColorStop(0.5, '#6A0DAD'); // Blue violet
                gradient.addColorStop(1, '#4B0082'); // Indigo edge
                ctx.fillStyle = gradient;
            } else {
                tileColor = '#2D1B69'; // Dark purple when not fully visible
            }
            break;
            
        case TILE_TYPES.TREASURE_CHEST:
            if (wasDiscovered) {
                // Golden treasure chest
                const gradient = ctx.createLinearGradient(
                    pixelX, pixelY,
                    pixelX + tileSize, pixelY + tileSize
                );
                gradient.addColorStop(0, '#FFD700'); // Gold
                gradient.addColorStop(0.5, '#FFA500'); // Orange
                gradient.addColorStop(1, '#B8860B'); // Dark goldenrod
                ctx.fillStyle = gradient;
            } else {
                tileColor = '#8B6914'; // Darker gold when not visible
            }
            break;
            
        case TILE_TYPES.HAZARD:
            if (wasDiscovered) {
                // Animated hazard pattern (alternating stripes)
                const time = Date.now() * 0.005;
                const stripe1 = Math.sin(time) > 0 ? '#FF0000' : '#8B0000';
                const stripe2 = Math.sin(time) > 0 ? '#8B0000' : '#FF0000';
                
                // Draw diagonal stripes
                const stripeWidth = tileSize / 4;
                for (let i = 0; i < 4; i++) {
                    ctx.fillStyle = i % 2 === 0 ? stripe1 : stripe2;
                    ctx.fillRect(pixelX, pixelY + i * stripeWidth, tileSize, stripeWidth);
                }
                return;
            } else {
                tileColor = '#4D0000'; // Dark red when not visible
            }
            break;
            
        case TILE_TYPES.REINFORCED_WALL:
            if (wasDiscovered) {
                // Reinforced wall with metallic look
                const gradient = ctx.createLinearGradient(
                    pixelX, pixelY,
                    pixelX + tileSize, pixelY + tileSize
                );
                gradient.addColorStop(0, '#696969'); // Dim gray
                gradient.addColorStop(0.3, '#2F2F2F'); // Very dark gray
                gradient.addColorStop(0.7, '#1C1C1C'); // Almost black
                gradient.addColorStop(1, '#2F2F2F'); // Very dark gray
                ctx.fillStyle = gradient;
            } else {
                tileColor = '#1A1A1A'; // Very dark when not visible
            }
            break;
    }
    
    // Draw the base tile
    ctx.fillStyle = tileColor;
    ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
}

/**
 * Add special visual effects to tiles
 */
async function addTileEffects(ctx, tile, pixelX, pixelY, tileSize, isVisible) {
    if (!isVisible || tileSize < 20) return;
    
    switch (tile.type) {
        case TILE_TYPES.TREASURE_CHEST:
            // Add sparkle effect
            const sparkles = 3;
            ctx.fillStyle = '#FFFFFF';
            for (let i = 0; i < sparkles; i++) {
                const sparkleX = pixelX + Math.random() * tileSize;
                const sparkleY = pixelY + Math.random() * tileSize;
                const sparkleSize = Math.random() * 3 + 1;
                ctx.fillRect(sparkleX, sparkleY, sparkleSize, sparkleSize);
            }
            break;
            
        case TILE_TYPES.RARE_ORE:
            // Add crystal shine effect
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#FFFFFF';
            const shineSize = tileSize * 0.2;
            ctx.fillRect(
                pixelX + tileSize * 0.7, 
                pixelY + tileSize * 0.2, 
                shineSize, 
                shineSize * 3
            );
            ctx.restore();
            break;
            
        case TILE_TYPES.HAZARD:
            // Add warning symbols
            if (tileSize >= 32) {
                ctx.save();
                ctx.fillStyle = '#FFFF00'; // Yellow warning
                ctx.font = `bold ${Math.floor(tileSize * 0.4)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('!', pixelX + tileSize/2, pixelY + tileSize/2);
                ctx.restore();
            }
            break;
            
        case TILE_TYPES.REINFORCED_WALL:
            // Add metallic bolts/rivets
            if (tileSize >= 24) {
                ctx.fillStyle = '#C0C0C0'; // Silver
                const rivetSize = Math.max(2, tileSize * 0.08);
                const positions = [
                    [0.2, 0.2], [0.8, 0.2],
                    [0.2, 0.8], [0.8, 0.8]
                ];
                
                positions.forEach(([relX, relY]) => {
                    const rivetX = pixelX + tileSize * relX - rivetSize/2;
                    const rivetY = pixelY + tileSize * relY - rivetSize/2;
                    ctx.fillRect(rivetX, rivetY, rivetSize, rivetSize);
                });
            }
            break;
    }
}

/**
 * Groups players by their tile position
 */
function groupPlayersByTile(members, playerPositions) {
    const tileGroups = {};
    
    for (const member of members.values()) {
        const position = playerPositions[member.id];
        if (!position) continue;
        
        const key = `${position.x},${position.y}`;
        if (!tileGroups[key]) {
            tileGroups[key] = [];
        }
        tileGroups[key].push({member, position});
    }
    
    return tileGroups;
}

/**
 * Check if we're currently in a break period
 */
function isBreakPeriod(dbEntry) {
    // Check the new break info structure
    return dbEntry.gameData?.breakInfo?.inBreak || false;
}

/**
 * Check if we're in a long break (for hiding avatars)
 */
function isLongBreak(dbEntry) {
    return dbEntry.gameData?.breakInfo?.inBreak && dbEntry.gameData?.breakInfo?.isLongBreak;
}

/**
 * Enhanced avatar drawing with pickaxe display and headlamp indicator
 */
async function drawPlayerAvatar(ctx, member, centerX, centerY, size, imageSettings) {
    try {
        const avatarSize = imageSettings.scaleFactor < 0.5 ? 64 : 128;
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: avatarSize });
        const avatar = await loadImage(avatarURL);
        
        const radius = size / 2;
        
        // Draw shadow for larger images
        if (size > 20) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.arc(centerX + 1, centerY + 1, radius + 1, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw circular avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        
        ctx.drawImage(avatar, centerX - radius, centerY - radius, size, size);
        ctx.restore();
        
        // Draw border
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, Math.floor(imageSettings.scaleFactor * 2));
        ctx.stroke();

        // Draw headlamp indicator if equipped
        try {
            const playerData = await getPlayerStats(member.user.id);
            const hasHeadlamp = playerData.equippedItems && playerData.equippedItems['28']; // Check for Miner's Headlamp (id: 28)
            
            if (hasHeadlamp && size > 20) {
                // Position headlamp indicator above the avatar
                const headlampSize = Math.max(8, size * 0.25);
                const headlampX = centerX - headlampSize/2;
                const headlampY = centerY - radius - headlampSize; // Position above avatar
                
                // TODO: Replace this square with actual headlamp image
                // const headlampImagePath = './assets/items/miners_headlamp.png';
                // const headlampImage = await loadImage(headlampImagePath);
                // ctx.drawImage(headlampImage, headlampX, headlampY, headlampSize, headlampSize);
                
                // For now, draw a yellow square to represent the headlamp
                ctx.save();
                
                // Draw background/outline
                ctx.fillStyle = '#2C2C2C';
                ctx.fillRect(headlampX - 1, headlampY - 1, headlampSize + 2, headlampSize + 2);
                
                // Draw headlamp square (yellow to represent light)
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(headlampX, headlampY, headlampSize, headlampSize);
                
                // Add a small "light beam" effect
                if (size > 30) {
                    ctx.globalAlpha = 0.3;
                    ctx.fillStyle = '#FFFF00';
                    ctx.beginPath();
                    ctx.moveTo(centerX, headlampY + headlampSize);
                    ctx.lineTo(centerX - headlampSize * 0.8, headlampY + headlampSize * 2);
                    ctx.lineTo(centerX + headlampSize * 0.8, headlampY + headlampSize * 2);
                    ctx.closePath();
                    ctx.fill();
                }
                
                ctx.restore();
            }
        } catch (error) {
            console.error(`Error checking headlamp for user ${member.user.username}:`, error);
        }

        // Draw pickaxe if available
        try {
            const bestPickaxe = await getBestMiningPickaxe(member.user.id);
            if (bestPickaxe && bestPickaxe.image && size > 24) {
                const pickaxeImagePath = `./assets/items/${bestPickaxe.image}.png`;
                const pickaxeImage = await loadImage(pickaxeImagePath);
                
                const pickaxeSize = size * 0.8;
                const pickaxeX = centerX - radius;
                const pickaxeY = centerY - pickaxeSize/2;
                
                ctx.save();
                ctx.globalAlpha = 0.9;
                ctx.drawImage(pickaxeImage, pickaxeX, pickaxeY, pickaxeSize, pickaxeSize);
                ctx.restore();

                // Show mining power
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
        
        // Draw placeholder
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
 * Enhanced entrance marker
 */
function drawEntranceMarker(ctx, pixelX, pixelY, tileSize, isVisible, wasDiscovered) {
    if (!wasDiscovered || tileSize < 20) return;
    
    const triangleX = pixelX + tileSize/2;
    const triangleY = pixelY + tileSize/2;
    const triangleSize = Math.min(15, tileSize * 0.3);
    
    ctx.save();
    ctx.globalAlpha = isVisible ? 1.0 : 0.4;
    
    // Draw upward-pointing triangle
    ctx.beginPath();
    ctx.moveTo(triangleX, triangleY - triangleSize); // Top point
    ctx.lineTo(triangleX - triangleSize, triangleY + triangleSize); // Bottom left
    ctx.lineTo(triangleX + triangleSize, triangleY + triangleSize); // Bottom right
    ctx.closePath();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, tileSize * 0.03);
    ctx.stroke();
    
    ctx.restore();
}

/**
 * Main function to generate enhanced mining map
 */
async function generateTileMapImage(channel) {
    if (!channel?.isVoiceBased()) throw new Error('Channel must be a voice channel');

    const result = await gachaVC.findOne({ channelId: channel.id });
    if (!result || !result.gameData || !result.gameData.map) {
        throw new Error('No map data found for this channel');
    }

    const mapData = result.gameData.map;
    const { tiles, width, height, playerPositions } = mapData;
    
    const imageSettings = calculateOptimalImageSettings(width, height);
    const { tileSize, outputWidth, outputHeight, finalWidth, finalHeight, useJPEG, playerAvatarSize, stackedOffset } = imageSettings;
    
    console.log(`Generating enhanced mining map: ${finalWidth}x${finalHeight} (${useJPEG ? 'JPEG' : 'PNG'})`);
    
    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Draw border
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, finalWidth, finalHeight);

    // Set up main map area
    ctx.save();
    ctx.translate(BORDER_SIZE, BORDER_SIZE);

    // Get players and calculate visibility
    const members = channel.members.filter(m => !m.user.bot);
    const playerSightInfo = new Map();
    const allVisibleTiles = new Set();
    
    for (const member of members.values()) {
        const position = playerPositions[member.id];
        if (!position) continue;
        
        const playerData = await getPlayerStats(member.id);
        const sightRadius = playerData.stats.sight || 0;
        playerSightInfo.set(member.id, sightRadius);
        
        const visibleTiles = calculateVisibleTiles(position, sightRadius, tiles, imageSettings);
        for (const tile of visibleTiles) {
            allVisibleTiles.add(tile);
        }
    }

    // Fill background (fog of war)
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    // Draw tiles with enhanced rendering
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = tiles[y] && tiles[y][x];
            if (!tile) continue;

            const pixelX = x * tileSize;
            const pixelY = y * tileSize;
            const tileKey = `${x},${y}`;
            
            const isCurrentlyVisible = allVisibleTiles.has(tileKey);
            const wasDiscovered = tile.discovered;
            
            if (!isCurrentlyVisible && !wasDiscovered) continue;
            
            // Draw the tile
            await drawTile(ctx, tile, pixelX, pixelY, tileSize, isCurrentlyVisible, wasDiscovered);
            
            // Draw entrance marker
            if (tile.type === TILE_TYPES.ENTRANCE) {
                drawEntranceMarker(ctx, pixelX, pixelY, tileSize, isCurrentlyVisible, wasDiscovered);
            }
            
            // Draw grid lines for larger tiles
            if (isCurrentlyVisible && tileSize >= 24) {
                ctx.strokeStyle = '#666666';
                ctx.lineWidth = Math.max(0.5, imageSettings.scaleFactor);
                ctx.globalAlpha = 0.5;
                ctx.strokeRect(pixelX, pixelY, tileSize, tileSize);
                ctx.globalAlpha = 1.0;
            }
        }
    }

    // Draw grid overlay for larger images
    if (tileSize >= 32) {
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.2;
        
        for (let x = 0; x <= width; x++) {
            ctx.beginPath();
            ctx.moveTo(x * tileSize, 0);
            ctx.lineTo(x * tileSize, height * tileSize);
            ctx.stroke();
        }
        
        for (let y = 0; y <= height; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * tileSize);
            ctx.lineTo(width * tileSize, y * tileSize);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1.0;
    }

    // Draw players (as avatars or tents depending on break status)
    const refreshedEntry = await gachaVC.findOne({ channelId: channel.id });
    const inBreak = isBreakPeriod(refreshedEntry);
    const inLongBreak = isLongBreak(refreshedEntry);
    const playerGroups = groupPlayersByTile(members, playerPositions);
    
    // During long breaks, don't draw any player avatars (they're at entrance but hidden)
    if (inLongBreak) {
        // Draw a special indicator at entrance instead
        const entrancePixelX = mapData.entranceX * tileSize;
        const entrancePixelY = mapData.entranceY * tileSize;
        
        ctx.save();
        ctx.fillStyle = 'rgba(255, 215, 0, 0.3)'; // Semi-transparent gold
        ctx.fillRect(entrancePixelX, entrancePixelY, tileSize, tileSize);
        
        if (tileSize >= 32) {
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${Math.floor(tileSize * 0.3)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('BREAK', entrancePixelX + tileSize/2, entrancePixelY + tileSize/2);
        }
        ctx.restore();
        
        // Skip drawing individual players
        ctx.restore();
        return useJPEG ? canvas.toBuffer('image/jpeg', { quality: JPEG_QUALITY }) : canvas.toBuffer('image/png', { compressionLevel: 9 });
    }
    
    for (const [tileKey, playersOnTile] of Object.entries(playerGroups)) {
        const [tileX, tileY] = tileKey.split(',').map(Number);
        const tileCenterX = tileX * tileSize + tileSize / 2;
        const tileCenterY = tileY * tileSize + tileSize / 2;
        
        if (playersOnTile.length === 1) {
            const {member, position} = playersOnTile[0];
            
            if (position.isTent) {
                await drawTent(ctx, tileCenterX, tileCenterY, tileSize, member, imageSettings);
            } else {
                await drawPlayerAvatar(ctx, member, tileCenterX, tileCenterY, playerAvatarSize, imageSettings);
            }
            
            // Draw player name for larger images
            if (tileSize >= 40) {
                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = '#000000';
                ctx.font = `${Math.max(8, Math.floor(tileSize * 0.17))}px Arial`;
                ctx.textAlign = 'center';
                ctx.lineWidth = Math.max(1, Math.floor(imageSettings.scaleFactor * 2));
                const nameY = tileCenterY + playerAvatarSize/2 + Math.max(8, tileSize * 0.2);
                ctx.strokeText(member.displayName, tileCenterX, nameY);
                ctx.fillText(member.displayName, tileCenterX, nameY);
            }
            
        } else {
            // Handle multiple players on same tile
            const totalPlayers = playersOnTile.length;
            
            if (playersOnTile[0].position.isTent) {
                // Draw camp with multiple tents
                await drawCamp(ctx, tileCenterX, tileCenterY, tileSize, playersOnTile.map(p => p.member), imageSettings);
            } else if (tileSize >= 32) {
                // Arrange in circle for larger images
                const radius = Math.min(stackedOffset * Math.min(totalPlayers - 1, 5), tileSize * 0.3);
                const angleStep = (Math.PI * 2) / totalPlayers;
                
                for (let i = 0; i < totalPlayers; i++) {
                    const {member} = playersOnTile[i];
                    const angle = angleStep * i - Math.PI / 2;
                    const offsetX = Math.cos(angle) * radius;
                    const offsetY = Math.sin(angle) * radius;
                    
                    const playerX = tileCenterX + offsetX;
                    const playerY = tileCenterY + offsetY;
                    
                    const avatarSize = Math.max(12, playerAvatarSize - Math.min(totalPlayers * 2, 10));
                    await drawPlayerAvatar(ctx, member, playerX, playerY, avatarSize, imageSettings);
                }
            } else {
                // Single avatar with count for smaller images
                const {member} = playersOnTile[0];
                await drawPlayerAvatar(ctx, member, tileCenterX, tileCenterY, playerAvatarSize, imageSettings);
            }
            
            // Draw player count
            if (!playersOnTile[0].position.isTent) {
                ctx.fillStyle = '#FFD700';
                ctx.strokeStyle = '#000000';
                ctx.font = `bold ${Math.max(10, Math.floor(tileSize * 0.22))}px Arial`;
                ctx.textAlign = 'center';
                ctx.lineWidth = Math.max(1, Math.floor(imageSettings.scaleFactor * 3));
                const countText = `×${totalPlayers}`;
                const countY = tileCenterY + tileSize/2 - Math.max(3, tileSize * 0.08);
                ctx.strokeText(countText, tileCenterX, countY);
                ctx.fillText(countText, tileCenterX, countY);
            }
        }
    }

    ctx.restore();

    // Return optimized buffer
    if (useJPEG) {
        return canvas.toBuffer('image/jpeg', { quality: JPEG_QUALITY });
    } else {
        return canvas.toBuffer('image/png', { compressionLevel: 9 });
    }
}

/**
 * Draw a single tent for a player during breaks
 */
async function drawTent(ctx, centerX, centerY, tileSize, member, imageSettings) {
    const tentSize = Math.min(tileSize * 0.8, imageSettings.playerAvatarSize * 1.2);
    const tentHeight = tentSize * 0.8;
    
    // Draw tent shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(centerX - tentSize/2 + 2, centerY - tentHeight/2 + 2, tentSize, tentHeight);
    
    // Draw tent body
    ctx.fillStyle = member.displayColor || '#8B4513'; // Use member's role color or brown
    ctx.fillRect(centerX - tentSize/2, centerY - tentHeight/2, tentSize, tentHeight);
    
    // Draw tent roof (triangle)
    const roofHeight = tentSize * 0.3;
    ctx.fillStyle = '#654321'; // Darker brown for roof
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - tentHeight/2 - roofHeight); // Top point
    ctx.lineTo(centerX - tentSize/2, centerY - tentHeight/2); // Bottom left
    ctx.lineTo(centerX + tentSize/2, centerY - tentHeight/2); // Bottom right
    ctx.closePath();
    ctx.fill();
    
    // Draw tent entrance (dark rectangle)
    const entranceWidth = tentSize * 0.3;
    const entranceHeight = tentHeight * 0.6;
    ctx.fillStyle = '#2F1B14';
    ctx.fillRect(
        centerX - entranceWidth/2, 
        centerY - entranceHeight/2, 
        entranceWidth, 
        entranceHeight
    );
    
    // Draw tent outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, imageSettings.scaleFactor);
    ctx.strokeRect(centerX - tentSize/2, centerY - tentHeight/2, tentSize, tentHeight);
    
    // Draw player initial in tent
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
 * Draw a camp (multiple tents) for multiple players on same tile during breaks
 */
async function drawCamp(ctx, centerX, centerY, tileSize, members, imageSettings) {
    const memberCount = members.length;
    const tentSize = Math.min(tileSize * 0.6 / Math.sqrt(memberCount), imageSettings.playerAvatarSize);
    
    if (memberCount <= 4) {
        // Arrange tents in a small circle
        const radius = Math.min(tileSize * 0.2, tentSize * 0.6);
        const angleStep = (Math.PI * 2) / memberCount;
        
        for (let i = 0; i < memberCount; i++) {
            const member = members[i];
            const angle = angleStep * i;
            const tentX = centerX + Math.cos(angle) * radius;
            const tentY = centerY + Math.sin(angle) * radius;
            
            await drawTent(ctx, tentX, tentY, tentSize, member, {
                ...imageSettings,
                playerAvatarSize: tentSize
            });
        }
    } else {
        // For many players, draw a large camp tent with count
        const largeTentSize = Math.min(tileSize * 0.9, imageSettings.playerAvatarSize * 1.5);
        
        // Draw large tent representing the camp
        await drawTent(ctx, centerX, centerY, largeTentSize, members[0], {
            ...imageSettings,
            playerAvatarSize: largeTentSize
        });
        
        // Draw camp size indicator
        ctx.save();
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000000';
        ctx.font = `bold ${Math.max(10, Math.floor(largeTentSize * 0.25))}px Arial`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 2;
        const countText = `${memberCount} campers`;
        const textY = centerY + largeTentSize/2 + 15;
        ctx.strokeText(countText, centerX, textY);
        ctx.fillText(countText, centerX, textY);
        ctx.restore();
    }
}

/**
 * Get best mining pickaxe for a player
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

module.exports = generateTileMapImage;
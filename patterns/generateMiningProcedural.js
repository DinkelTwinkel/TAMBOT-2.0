// generateMiningProcedural_final.js
const { createCanvas, loadImage } = require('canvas');
const gachaVC = require('../models/activevcs');
const getPlayerStats = require('./calculatePlayerStat');

// Constants
const BASE_TILE_SIZE = 64;
const PLAYER_AVATAR_SIZE = 40;
const STACKED_OFFSET = 10;

// Image optimization constants
const MAX_IMAGE_WIDTH = 5000;
const MAX_IMAGE_HEIGHT = 5000;
const MIN_TILE_SIZE = 16; // Minimum tile size when scaling down
const JPEG_QUALITY = 0.8; // JPEG quality for large images
const USE_JPEG_THRESHOLD = 300; // Switch to JPEG if either dimension > 300px
const BORDER_SIZE = 5; // Adjustable border size in pixels

// Tile types
const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor', 
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore'
};

/**
 * Calculate optimal tile size and output format based on map dimensions
 */
function calculateOptimalImageSettings(mapWidth, mapHeight) {
    let tileSize = BASE_TILE_SIZE;
    let outputWidth = mapWidth * tileSize;
    let outputHeight = mapHeight * tileSize;
    
    // Calculate scale factor needed to fit within limits (accounting for border)
    const availableWidth = MAX_IMAGE_WIDTH - (BORDER_SIZE * 2);
    const availableHeight = MAX_IMAGE_HEIGHT - (BORDER_SIZE * 2);
    
    const widthScale = availableWidth / outputWidth;
    const heightScale = availableHeight / outputHeight;
    const minScale = Math.min(widthScale, heightScale, 1); // Don't upscale
    
    // Apply scaling if needed
    if (minScale < 1) {
        tileSize = Math.max(MIN_TILE_SIZE, Math.floor(tileSize * minScale));
        outputWidth = mapWidth * tileSize;
        outputHeight = mapHeight * tileSize;
    }
    
    // Add border to final dimensions
    const finalWidth = outputWidth + (BORDER_SIZE * 2);
    const finalHeight = outputHeight + (BORDER_SIZE * 2);
    
    // Determine output format
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
 * Optimized visibility calculation with reduced ray casting for performance
 */
function calculateVisibleTiles(position, sightRadius, tiles, imageSettings) {
    const visible = new Set();
    const { x: px, y: py } = position;
    
    visible.add(`${px},${py}`);
    
    if (sightRadius <= 0) {
        const adjacent = [
            { x: px, y: py - 1 },
            { x: px + 1, y: py },
            { x: px, y: py + 1 },
            { x: px - 1, y: py }
        ];
        
        for (const adj of adjacent) {
            if (adj.y >= 0 && adj.y < tiles.length && 
                adj.x >= 0 && adj.x < tiles[0].length) {
                visible.add(`${adj.x},${adj.y}`);
            }
        }
        return visible;
    }
    
    // Reduce ray count for smaller images (performance optimization)
    const rayDensity = imageSettings.scaleFactor < 0.5 ? 120 : 240; // Fewer rays for small images
    
    for (let angle = 0; angle < rayDensity; angle += 3) {
        const radians = (angle * Math.PI) / 180;
        const dx = Math.cos(radians);
        const dy = Math.sin(radians);
        
        for (let dist = 0; dist <= sightRadius; dist++) {
            const checkX = Math.round(px + dx * dist);
            const checkY = Math.round(py + dy * dist);
            
            if (checkY < 0 || checkY >= tiles.length || 
                checkX < 0 || checkX >= tiles[0].length) {
                break;
            }
            
            visible.add(`${checkX},${checkY}`);
            
            const tile = tiles[checkY][checkX];
            if (tile && (tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.WALL_WITH_ORE)) {
                break;
            }
        }
    }
    
    return visible;
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
        tileGroups[key].push(member);
    }
    
    return tileGroups;
}

/**
 * Optimized avatar drawing with size adjustments
 */
async function drawPlayerAvatar(ctx, member, centerX, centerY, size, imageSettings) {
    try {
        // Use lower resolution avatars for small images
        const avatarSize = imageSettings.scaleFactor < 0.5 ? 64 : 128;
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: avatarSize });
        const avatar = await loadImage(avatarURL);
        
        const radius = size / 2;
        
        // Skip shadow for very small images (performance)
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
        
        // Simplified border for small images
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, Math.floor(imageSettings.scaleFactor * 2));
        ctx.stroke();
        
        return true;
    } catch (error) {
        console.error(`Error loading avatar for ${member.user.username}:`, error);
        
        // Simplified placeholder
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
 * Generates an optimized tile-based mining map image with size limits and border
 * @param {object} channel - The voice channel object
 * @returns {Buffer} Canvas buffer of the generated map
 */
async function generateTileMapImage(channel) {
    if (!channel?.isVoiceBased()) throw new Error('Channel must be a voice channel');

    // Get map data from database
    const result = await gachaVC.findOne({ channelId: channel.id });
    if (!result || !result.gameData || !result.gameData.map) {
        throw new Error('No map data found for this channel');
    }

    const mapData = result.gameData.map;
    const { tiles, width, height, playerPositions } = mapData;
    
    // Calculate optimal image settings
    const imageSettings = calculateOptimalImageSettings(width, height);
    const { tileSize, outputWidth, outputHeight, finalWidth, finalHeight, useJPEG, playerAvatarSize, stackedOffset } = imageSettings;
    
    console.log(`Generating ${finalWidth}x${finalHeight} image (map: ${outputWidth}x${outputHeight}, tile size: ${tileSize}, format: ${useJPEG ? 'JPEG' : 'PNG'})`);
    
    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Draw border first
    ctx.fillStyle = '#333333'; // Dark gray border
    ctx.fillRect(0, 0, finalWidth, finalHeight);

    // Set up translation for the main map area (offset by border size)
    ctx.save();
    ctx.translate(BORDER_SIZE, BORDER_SIZE);

    // Get all players and their sight stats
    const members = channel.members.filter(m => !m.user.bot);
    const playerSightInfo = new Map();
    const allVisibleTiles = new Set();
    
    // Calculate visibility for all players (optimized)
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

    // Draw tiles with optimizations
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = tiles[y] && tiles[y][x];
            if (!tile) continue;

            const pixelX = x * tileSize;
            const pixelY = y * tileSize;
            const tileKey = `${x},${y}`;
            
            const isCurrentlyVisible = allVisibleTiles.has(tileKey);
            const wasDiscovered = tile.discovered;
            
            if (!isCurrentlyVisible && !wasDiscovered) {
                continue;
            }
            
            let tileColor;
            let alpha = isCurrentlyVisible ? 1.0 : 0.4;
            
            switch (tile.type) {
                case TILE_TYPES.WALL:
                    tileColor = wasDiscovered ? '#444444' : '#222222';
                    break;
                case TILE_TYPES.FLOOR:
                    tileColor = '#DDDDDD';
                    break;
                case TILE_TYPES.ENTRANCE:
                    tileColor = '#FF4444';
                    break;
                case TILE_TYPES.WALL_WITH_ORE:
                    if (wasDiscovered) {
                        // Draw wall background
                        ctx.fillStyle = '#444444';
                        ctx.globalAlpha = alpha;
                        ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
                        
                        // Simplified ore indicator for small tiles
                        const oreSize = Math.max(4, tileSize * 0.5);
                        const oreOffset = (tileSize - oreSize) / 2;
                        
                        // Use solid color instead of gradient for small images (performance)
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
                        
                        // Skip border for very small tiles
                        if (tileSize >= 24) {
                            ctx.strokeStyle = '#FFD700';
                            ctx.lineWidth = Math.max(1, Math.floor(tileSize / 32));
                            ctx.strokeRect(pixelX + oreOffset, pixelY + oreOffset, oreSize, oreSize);
                        }
                        
                        ctx.globalAlpha = 1.0;
                        continue;
                    } else {
                        tileColor = '#333300';
                    }
                    break;
                default:
                    tileColor = '#000000';
            }
            
            // Draw tile
            ctx.globalAlpha = alpha;
            ctx.fillStyle = tileColor;
            ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
            ctx.globalAlpha = 1.0;
            
            // Skip grid lines for very small images (performance and clarity)
            if (isCurrentlyVisible && tileSize >= 24) {
                ctx.strokeStyle = '#666666';
                ctx.lineWidth = Math.max(0.5, imageSettings.scaleFactor);
                ctx.globalAlpha = 0.5;
                ctx.strokeRect(pixelX, pixelY, tileSize, tileSize);
                ctx.globalAlpha = 1.0;
            }

            // Entrance marker
            if (tile.type === TILE_TYPES.ENTRANCE && wasDiscovered && tileSize >= 20) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = `bold ${Math.floor(tileSize * 0.3)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = isCurrentlyVisible ? 1.0 : 0.4;
                ctx.fillText('↓', pixelX + tileSize/2, pixelY + tileSize/2);
                ctx.globalAlpha = 1.0;
            }
        }
    }

    // Skip detailed grid overlay for small images
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

    // Draw players (optimized for small images)
    const playerGroups = groupPlayersByTile(members, playerPositions);
    
    for (const [tileKey, playersOnTile] of Object.entries(playerGroups)) {
        const [tileX, tileY] = tileKey.split(',').map(Number);
        const tileCenterX = tileX * tileSize + tileSize / 2;
        const tileCenterY = tileY * tileSize + tileSize / 2;
        
        if (playersOnTile.length === 1) {
            const member = playersOnTile[0];
            await drawPlayerAvatar(ctx, member, tileCenterX, tileCenterY, playerAvatarSize, imageSettings);
            
            // Skip names for very small images
            if (tileSize >= 32) {
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
            // Simplified stacking for small images
            const totalPlayers = playersOnTile.length;
            const radius = Math.min(stackedOffset * Math.min(totalPlayers - 1, 3), tileSize * 0.3);
            
            if (tileSize >= 32) {
                // Full stacking for larger images
                const angleStep = (Math.PI * 2) / totalPlayers;
                
                for (let i = 0; i < totalPlayers; i++) {
                    const member = playersOnTile[i];
                    const angle = angleStep * i - Math.PI / 2;
                    const offsetX = Math.cos(angle) * radius;
                    const offsetY = Math.sin(angle) * radius;
                    
                    const playerX = tileCenterX + offsetX;
                    const playerY = tileCenterY + offsetY;
                    
                    const avatarSize = Math.max(12, playerAvatarSize - Math.min(totalPlayers * 2, 10));
                    await drawPlayerAvatar(ctx, member, playerX, playerY, avatarSize, imageSettings);
                }
            } else {
                // Simplified representation for small images - just draw one avatar with count
                const member = playersOnTile[0];
                await drawPlayerAvatar(ctx, member, tileCenterX, tileCenterY, playerAvatarSize, imageSettings);
            }
            
            // Draw count indicator
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

    // Restore the transformation (remove the border offset)
    ctx.restore();

    // Return optimized buffer
    if (useJPEG) {
        // Use JPEG for large images to reduce file size
        return canvas.toBuffer('image/jpeg', { quality: JPEG_QUALITY });
    } else {
        // Use PNG for smaller images to maintain quality
        return canvas.toBuffer('image/png', { compressionLevel: 9 });
    }
}

module.exports = generateTileMapImage;
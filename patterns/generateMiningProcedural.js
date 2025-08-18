const { createCanvas, loadImage } = require('canvas');
const gachaVC = require('../models/activevcs');

// Constants
const TILE_SIZE = 64;

// Tile types
const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor', 
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore'
};

/**
 * Generates a tile-based mining map image
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
    
    const canvas = createCanvas(width * TILE_SIZE, height * TILE_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Fill background
    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw tiles
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = tiles[y] && tiles[y][x];
            if (!tile) continue;

            const pixelX = x * TILE_SIZE;
            const pixelY = y * TILE_SIZE;
            
            // Set tile color based on type and discovery status
            let tileColor;
            switch (tile.type) {
                case TILE_TYPES.WALL:
                    tileColor = tile.discovered ? '#444444' : '#000000';
                    break;
                case TILE_TYPES.FLOOR:
                    tileColor = '#DDDDDD';
                    break;
                case TILE_TYPES.ENTRANCE:
                    tileColor = '#FF4444';
                    break;
                case TILE_TYPES.WALL_WITH_ORE:
                    tileColor = tile.discovered ? '#FFD700' : '#333300';
                    break;
                default:
                    tileColor = '#000000';
            }
            
            // Draw tile
            ctx.fillStyle = tileColor;
            ctx.fillRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE);
            
            // Draw tile border for discovered tiles
            if (tile.discovered) {
                ctx.strokeStyle = '#888888';
                ctx.lineWidth = 1;
                ctx.strokeRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE);
            }

            // Add special effects for certain tile types
            if (tile.type === TILE_TYPES.ENTRANCE && tile.discovered) {
                // Draw entrance arrow
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('↑', pixelX + TILE_SIZE/2, pixelY + TILE_SIZE/2 + 7);
            }

            if (tile.type === TILE_TYPES.WALL_WITH_ORE && tile.discovered) {
                // Draw ore sparkles
                ctx.fillStyle = '#FFFF00';
                ctx.beginPath();
                ctx.arc(pixelX + 16, pixelY + 16, 3, 0, Math.PI * 2);
                ctx.arc(pixelX + 48, pixelY + 32, 2, 0, Math.PI * 2);
                ctx.arc(pixelX + 32, pixelY + 48, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Draw grid overlay for better visibility
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * TILE_SIZE, 0);
        ctx.lineTo(x * TILE_SIZE, height * TILE_SIZE);
        ctx.stroke();
    }
    for (let y = 0; y <= height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * TILE_SIZE);
        ctx.lineTo(width * TILE_SIZE, y * TILE_SIZE);
        ctx.stroke();
    }

    // Draw players
    const members = channel.members.filter(m => !m.user.bot);
    for (const member of members.values()) {
        const position = playerPositions[member.id];
        if (!position) continue;
        
        try {
            const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 128 });
            const avatar = await loadImage(avatarURL);
            
            const centerX = position.x * TILE_SIZE + TILE_SIZE / 2;
            const centerY = position.y * TILE_SIZE + TILE_SIZE / 2;
            const avatarSize = 60;
            const radius = avatarSize / 2;
            
            // Draw shadow/background circle
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(centerX + 2, centerY + 2, radius + 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw circular avatar
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();
            
            ctx.drawImage(avatar, centerX - radius, centerY - radius, avatarSize, avatarSize);
            ctx.restore();
            
            // Draw border around avatar
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Draw inner border
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius - 1, 0, Math.PI * 2, true);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Draw player name below avatar
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#000000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.lineWidth = 2;
            
            const nameY = centerY + radius + 15;
            ctx.strokeText(member.displayName, centerX, nameY);
            ctx.fillText(member.displayName, centerX, nameY);
            
        } catch (error) {
            console.error(`Error loading avatar for ${member.user.username}:`, error);
            
            // Draw placeholder circle if avatar fails to load
            const centerX = position.x * TILE_SIZE + TILE_SIZE / 2;
            const centerY = position.y * TILE_SIZE + TILE_SIZE / 2;
            
            ctx.fillStyle = '#666666';
            ctx.beginPath();
            ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(member.displayName.charAt(0).toUpperCase(), centerX, centerY + 5);
        }
    }

    return canvas.toBuffer();
}

module.exports = generateTileMapImage;
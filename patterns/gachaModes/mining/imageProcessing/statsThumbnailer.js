// statsThumbnailer.js - Generate custom thumbnail images for /stats command
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// Thumbnail caching configuration
const THUMBNAIL_CACHE_CHANNEL = '1408543899185840250';
const THUMBNAIL_CACHE_GUILD = '1221772148385910835';

// In-memory cache for thumbnail hashes and URLs
const thumbnailCache = new Map();

// Register custom fonts if available
try {
    registerFont(path.join(__dirname, '../../../../assets/font/LiberationSans-Regular.ttf'), { family: 'Liberation Sans' });
} catch (error) {
    console.warn('[STATS THUMBNAIL] Custom font not found, using default');
}

/**
 * Generate a custom thumbnail for stats command
 * @param {Object} member - Discord member object
 * @param {Object} playerStats - Player stats and equipment data
 * @param {string} channelId - Current channel ID for mine background
 * @returns {Buffer} - PNG image buffer
 */
async function generateStatsThumb(member, playerStats, channelId = null) {
    try {
        const canvasWidth = 300;
        const canvasHeight = 300;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Get mine background if player is in a mining channel
        const mineBackground = await getMineBackground(channelId);
        
        // Draw 3x3 tile background
        await draw3x3TileBackground(ctx, canvasWidth, canvasHeight, mineBackground);
        
        // Draw player avatar in the center (20% bigger)
        const avatarSize = 144; // 120 * 1.2 = 20% bigger
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2 - 20; // Centered with room for HP bar
        await drawPlayerAvatar(ctx, member, centerX, centerY, avatarSize);
        
        // Draw HP bar at the bottom with full width
        await drawHealthBar(ctx, member, centerX, canvasHeight - 40, canvasWidth - 40, channelId);
        
        // Draw pickaxe with original positioning (before refinement changes)
        if (playerStats.equippedItems) {
            await drawPickaxeFromMiningSystem(ctx, member, centerX - 60, centerY + 5, 126); // Back to before the "refined" changes
        }
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error generating thumbnail:', error);
        return null;
    }
}

/**
 * Get mine background information
 */
async function getMineBackground(channelId) {
    if (!channelId) return null;
    
    try {
        const gachaVC = require('../../../../models/activevcs');
        const dbEntry = await gachaVC.findOne({ channelId: channelId }).lean();
        
        if (!dbEntry || !dbEntry.gameData || dbEntry.gameData.gamemode !== 'mining') {
            return null;
        }
        
        // Get mine theme
        const { getMineTheme } = require('../mining-layered-render');
        const theme = getMineTheme(dbEntry);
        
        return {
            theme: theme,
            powerLevel: dbEntry.power || 1,
            mapData: dbEntry.gameData.map
        };
        
    } catch (error) {
        console.warn('[STATS THUMBNAIL] Could not get mine background:', error);
        return null;
    }
}

/**
 * Draw 3x3 tile background with walls at top and floor tiles below
 */
async function draw3x3TileBackground(ctx, width, height, mineBackground) {
    try {
        // Zoom into center of 3x3 grid: show full center tile + half of surrounding tiles
        const fullTileSize = width; // Center tile takes full canvas width
        const halfTileSize = fullTileSize / 2; // Surrounding tiles show half
        
        // Load tile images from mining system
        const { loadTileImageVariation } = require('./mining-layered-render');
        
        // Draw 3x3 grid with center tile fully visible and surrounding tiles half-visible
        for (let row = -1; row <= 1; row++) {
            for (let col = -1; col <= 1; col++) {
                // Calculate position and size
                let x, y, tileWidth, tileHeight;
                
                if (col === 0) {
                    // Center column: full width
                    x = 0;
                    tileWidth = fullTileSize;
                } else if (col === -1) {
                    // Left column: half tile on left edge
                    x = -halfTileSize;
                    tileWidth = fullTileSize;
                } else {
                    // Right column: half tile on right edge
                    x = halfTileSize;
                    tileWidth = fullTileSize;
                }
                
                if (row === 0) {
                    // Center row: full height
                    y = 0;
                    tileHeight = fullTileSize;
                } else if (row === -1) {
                    // Top row: half tile on top edge
                    y = -halfTileSize;
                    tileHeight = fullTileSize;
                } else {
                    // Bottom row: half tile on bottom edge
                    y = halfTileSize;
                    tileHeight = fullTileSize;
                }
                
                try {
                    let tileImage;
                    if (row === -1) {
                        // Top row: walls
                        tileImage = await loadTileImageVariation('wall', mineBackground?.theme || 'generic');
                    } else {
                        // Center and bottom rows: floor tiles
                        tileImage = await loadTileImageVariation('floor', mineBackground?.theme || 'generic');
                    }
                    
                    if (tileImage) {
                        ctx.drawImage(tileImage, x, y, tileWidth, tileHeight);
                    } else {
                        // Fallback to colored rectangles
                        if (row === -1) {
                            ctx.fillStyle = '#4A4A4A'; // Wall color
                        } else {
                            ctx.fillStyle = '#8B4513'; // Floor color
                        }
                        ctx.fillRect(x, y, tileWidth, tileHeight);
                    }
                } catch (tileError) {
                    // Fallback to colored rectangles
                    if (row === -1) {
                        ctx.fillStyle = '#4A4A4A'; // Wall color
                    } else {
                        ctx.fillStyle = '#8B4513'; // Floor color
                    }
                    ctx.fillRect(x, y, tileWidth, tileHeight);
                }
            }
        }
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error drawing tile background:', error);
        // Fallback to solid background
        ctx.fillStyle = '#2C3E50';
        ctx.fillRect(0, 0, width, height);
    }
}

/**
 * Get theme colors for mine backgrounds
 */
function getThemeColors(theme) {
    const themes = {
        'coal': { primary: '#1a1a1a', secondary: '#2d2d2d' },
        'copper': { primary: '#8B4513', secondary: '#A0522D' },
        'iron': { primary: '#2F4F4F', secondary: '#708090' },
        'gold': { primary: '#DAA520', secondary: '#FFD700' },
        'diamond': { primary: '#4169E1', secondary: '#6495ED' },
        'emerald': { primary: '#50C878', secondary: '#90EE90' },
        'ruby': { primary: '#E0115F', secondary: '#FF6B9D' },
        'generic': { primary: '#2C3E50', secondary: '#34495E' }
    };
    
    return themes[theme] || themes.generic;
}

/**
 * Draw player avatar with role color border
 */
async function drawPlayerAvatar(ctx, member, centerX, centerY, size) {
    try {
        // Load player avatar - use the actual member object, not member.user
        const avatarURL = member.displayAvatarURL({ extension: 'png', size: 128 });
        const avatar = await loadImage(avatarURL);
        
        const radius = size / 2;
        
        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(centerX + 3, centerY + 3, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Clip for circular avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        // Draw avatar
        ctx.drawImage(avatar, centerX - radius, centerY - radius, size, size);
        ctx.restore();
        
        // Draw border with role color
        const roleColor = getUserRoleColor(member);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = roleColor;
        ctx.lineWidth = 4;
        ctx.stroke();
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error drawing avatar:', error);
        // Fallback to circle with initial
        const radius = size / 2;
        ctx.fillStyle = '#666666';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${size * 0.4}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(member.displayName.charAt(0).toUpperCase(), centerX, centerY);
    }
}

/**
 * Get user's role color
 */
function getUserRoleColor(member) {
    try {
        const roleColor = member.displayHexColor;
        if (!roleColor || roleColor === '#000000') {
            return '#FFFFFF';
        }
        return roleColor;
    } catch (error) {
        return '#FFFFFF';
    }
}

/**
 * Draw health bar at bottom with HP text above
 */
async function drawHealthBar(ctx, member, centerX, barY, barWidth, channelId) {
    try {
        // Get health data
        let currentHealth = 100;
        let maxHealth = 100;
        
        if (channelId) {
            try {
                const PlayerHealth = require('../../../../models/PlayerHealth');
                const playerHealth = await PlayerHealth.findPlayerHealth(member.id, channelId);
                
                if (playerHealth) {
                    currentHealth = playerHealth.currentHealth || 100;
                    maxHealth = playerHealth.maxHealth || 100;
                    console.log(`[STATS THUMBNAIL] Player health: ${currentHealth}/${maxHealth}`);
                } else {
                    console.log(`[STATS THUMBNAIL] No health data found for player ${member.id}`);
                }
            } catch (healthError) {
                console.warn(`[STATS THUMBNAIL] Error getting health data:`, healthError);
            }
        }
        
        const healthPercent = currentHealth / maxHealth;
        const barHeight = 16;
        const barX = centerX - barWidth / 2;
        
        // Health text above the bar
        const healthText = `${currentHealth}/${maxHealth}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Liberation Sans, Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(healthText, centerX, barY - 8);
        ctx.fillText(healthText, centerX, barY - 8);
        
        // Health bar background with border
        ctx.fillStyle = '#000000';
        ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
        
        ctx.fillStyle = '#333333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health bar fill with color coding
        let healthColor = '#00FF00'; // Green for full health
        if (healthPercent < 0.25) {
            healthColor = '#FF0000'; // Red for critical health
        } else if (healthPercent < 0.5) {
            healthColor = '#FF8000'; // Orange for low health
        } else if (healthPercent < 0.75) {
            healthColor = '#FFFF00'; // Yellow for medium health
        }
        
        ctx.fillStyle = healthColor;
        ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
        
        // Health bar border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error drawing health bar:', error);
    }
}

/**
 * Draw pickaxe using the same system as mining render layer
 */
async function drawPickaxeFromMiningSystem(ctx, member, x, y, size) {
    try {
        // Use the same pickaxe loading system as mining render
        const { getBestMiningPickaxe } = require('./mining-layered-render');
        
        const bestPickaxe = await getBestMiningPickaxe(member.id);
        if (!bestPickaxe) {
            console.log('[STATS THUMBNAIL] No pickaxe found for player');
            return;
        }
        
        console.log(`[STATS THUMBNAIL] Found pickaxe: ${bestPickaxe.name}`);
        
        // Try to load pickaxe image the same way as mining render
        if (bestPickaxe.image) {
            try {
                const pickaxeImagePath = path.join(__dirname, '../../../../assets/items', `${bestPickaxe.image}.png`);
                
                if (fs.existsSync(pickaxeImagePath)) {
                    const pickaxeImage = await loadImage(pickaxeImagePath);
                    
                    // Draw pickaxe with shadow
                    ctx.save();
                    ctx.globalAlpha = 0.3;
                    ctx.drawImage(pickaxeImage, x - size/2 + 2, y - size/2 + 2, size, size);
                    ctx.globalAlpha = 1.0;
                    ctx.drawImage(pickaxeImage, x - size/2, y - size/2, size, size);
                    ctx.restore();
                    
                    console.log(`[STATS THUMBNAIL] Rendered pickaxe image: ${bestPickaxe.image}`);
                } else {
                    console.log(`[STATS THUMBNAIL] Pickaxe image not found: ${pickaxeImagePath}`);
                    drawFallbackPickaxe(ctx, x, y, size);
                }
            } catch (imageError) {
                console.error('[STATS THUMBNAIL] Error loading pickaxe image:', imageError);
                drawFallbackPickaxe(ctx, x, y, size);
            }
        } else {
            console.log('[STATS THUMBNAIL] Pickaxe has no image property');
            drawFallbackPickaxe(ctx, x, y, size);
        }
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error drawing pickaxe from mining system:', error);
        drawFallbackPickaxe(ctx, x, y, size);
    }
}

/**
 * Draw fallback pickaxe shape
 */
function drawFallbackPickaxe(ctx, x, y, size) {
    // Draw a simple pickaxe shape
    const handleHeight = size * 0.8;
    const headWidth = size * 0.6;
    
    // Handle
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x - 2, y - handleHeight/2, 4, handleHeight);
    
    // Pickaxe head
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(x - headWidth/2, y - handleHeight/2 - 8, headWidth, 12);
    
    // Add some detail
    ctx.strokeStyle = '#A0A0A0';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - headWidth/2, y - handleHeight/2 - 8, headWidth, 12);
}

/**
 * Legacy pickaxe drawing function (kept for compatibility)
 */
async function drawPickaxe(ctx, equippedItems, x, y) {
    try {
        // Find the best pickaxe
        let bestPickaxe = null;
        for (const item of Object.values(equippedItems)) {
            if (item.type === 'tool' && item.abilities && item.abilities.some(a => a.name === 'mining')) {
                bestPickaxe = item;
                break;
            }
        }
        
        if (!bestPickaxe) {
            console.log('[STATS THUMBNAIL] No pickaxe found in equipped items');
            return;
        }
        
        console.log(`[STATS THUMBNAIL] Found pickaxe: ${bestPickaxe.name} (ID: ${bestPickaxe.itemId})`);
        
        // Try different image path variations
        const possiblePaths = [
            path.join(__dirname, '../../../../assets/items', `${bestPickaxe.itemId}.png`),
            path.join(__dirname, '../../../../assets/items', `${bestPickaxe.name.toLowerCase().replace(/\s+/g, '_')}.png`),
            path.join(__dirname, '../../../../assets/items', 'default_pickaxe.png')
        ];
        
        let pickaxeImage = null;
        for (const imagePath of possiblePaths) {
            if (fs.existsSync(imagePath)) {
                try {
                    pickaxeImage = await loadImage(imagePath);
                    console.log(`[STATS THUMBNAIL] Loaded pickaxe image from: ${imagePath}`);
                    break;
                } catch (loadError) {
                    console.warn(`[STATS THUMBNAIL] Failed to load image from ${imagePath}:`, loadError);
                }
            }
        }
        
        if (pickaxeImage) {
            const pickaxeSize = 40;
            
            // Draw pickaxe with shadow
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.drawImage(pickaxeImage, x - pickaxeSize/2 + 2, y - pickaxeSize/2 + 2, pickaxeSize, pickaxeSize);
            ctx.globalAlpha = 1.0;
            ctx.drawImage(pickaxeImage, x - pickaxeSize/2, y - pickaxeSize/2, pickaxeSize, pickaxeSize);
            ctx.restore();
        } else {
            // Fallback: draw a simple pickaxe shape
            console.log('[STATS THUMBNAIL] Drawing fallback pickaxe shape');
            const pickaxeSize = 30;
            
            ctx.fillStyle = '#8B4513'; // Brown handle
            ctx.fillRect(x - 2, y - pickaxeSize/2, 4, pickaxeSize);
            
            ctx.fillStyle = '#C0C0C0'; // Silver head
            ctx.fillRect(x - pickaxeSize/3, y - pickaxeSize/2 - 5, pickaxeSize/1.5, 8);
        }
        
        // Draw mining power indicator
        const miningAbility = bestPickaxe.abilities.find(a => a.name === 'mining');
        if (miningAbility) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px Liberation Sans, Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            const powerText = `⛏️ +${miningAbility.powerlevel || miningAbility.power || 0}`;
            ctx.strokeText(powerText, x, y + 35);
            ctx.fillText(powerText, x, y + 35);
        }
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error drawing pickaxe:', error);
    }
}

/**
 * Draw other equipment (armor, boots, etc.)
 */
async function drawEquipment(ctx, equippedItems, startX, startY) {
    try {
        let yOffset = 0;
        const equipmentSize = 30;
        const spacing = 35;
        
        for (const item of Object.values(equippedItems)) {
            if (item.type === 'equipment' && item.slot !== 'tool') {
                // Try to load equipment image
                const imagePath = path.join(__dirname, '../../../../assets/items', `${item.itemId}.png`);
                
                if (fs.existsSync(imagePath)) {
                    const equipImage = await loadImage(imagePath);
                    
                    // Draw equipment
                    ctx.drawImage(equipImage, startX - equipmentSize/2, startY + yOffset - equipmentSize/2, equipmentSize, equipmentSize);
                    
                    // Draw equipment name (shortened)
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = '8px Liberation Sans, Arial';
                    ctx.textAlign = 'center';
                    const shortName = item.name.length > 12 ? item.name.substring(0, 10) + '...' : item.name;
                    ctx.fillText(shortName, startX, startY + yOffset + 20);
                    
                    yOffset += spacing;
                    
                    // Limit to 4 equipment pieces to fit in thumbnail
                    if (yOffset > spacing * 3) break;
                }
            }
        }
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error drawing equipment:', error);
    }
}

/**
 * Draw minimal mine tiles as decoration
 */
async function drawMineTiles(ctx, width, height, theme) {
    try {
        const tileSize = 20;
        const tilesX = Math.floor(width / tileSize);
        const tilesY = Math.floor(height / tileSize);
        
        // Draw subtle tile pattern
        ctx.globalAlpha = 0.1;
        
        for (let y = 0; y < tilesY; y++) {
            for (let x = 0; x < tilesX; x++) {
                const pixelX = x * tileSize;
                const pixelY = y * tileSize;
                
                // Alternate between two shades for subtle pattern
                if ((x + y) % 2 === 0) {
                    ctx.fillStyle = '#FFFFFF';
                } else {
                    ctx.fillStyle = '#000000';
                }
                
                ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
            }
        }
        
        ctx.globalAlpha = 1.0;
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error drawing mine tiles:', error);
    }
}

/**
 * Generate fallback thumbnail when not in mining channel
 */
async function generateFallbackThumb(member, playerStats) {
    try {
        const canvasWidth = 400;
        const canvasHeight = 300;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');
        
        // Simple gradient background
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#34495E');
        gradient.addColorStop(1, '#2C3E50');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Draw player avatar (centered)
        const avatarSize = 100;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        
        await drawPlayerAvatar(ctx, member, centerX, centerY, avatarSize);
        
        // Draw basic stats text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Liberation Sans, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Player Stats', centerX, centerY - avatarSize/2 - 20);
        
        // Add border
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error generating fallback thumbnail:', error);
        return null;
    }
}

/**
 * Generate a hash of player stats for caching
 */
function generateStatsHash(member, playerStats, channelId, healthData) {
    const crypto = require('crypto');
    
    const hashData = {
        userId: member.id,
        username: member.displayName,
        roleColor: member.displayHexColor,
        channelId: channelId,
        health: healthData,
        equippedItems: Object.keys(playerStats.equippedItems || {}).sort(),
        stats: playerStats.stats,
        timestamp: Math.floor(Date.now() / (1000 * 60 * 5)) // Update every 5 minutes max
    };
    
    return crypto.createHash('md5').update(JSON.stringify(hashData)).digest('hex');
}

/**
 * Store thumbnail in Discord channel and cache URL
 */
async function storeThumbnailInChannel(buffer, hash, member) {
    try {
        const { Client } = require('discord.js');
        const client = member.client;
        
        const guild = await client.guilds.fetch(THUMBNAIL_CACHE_GUILD);
        const channel = await guild.channels.fetch(THUMBNAIL_CACHE_CHANNEL);
        
        if (!channel || !channel.isTextBased()) {
            console.error('[THUMBNAIL CACHE] Cache channel not found or not text-based');
            return null;
        }
        
        // Send thumbnail to cache channel
        const message = await channel.send({
            content: `Stats thumbnail for ${member.displayName} (${hash})`,
            files: [{ attachment: buffer, name: `stats-${hash}.png` }]
        });
        
        const imageUrl = message.attachments.first()?.url;
        if (imageUrl) {
            // Cache the URL
            thumbnailCache.set(hash, {
                url: imageUrl,
                timestamp: Date.now(),
                userId: member.id
            });
            
            console.log(`[THUMBNAIL CACHE] Stored thumbnail for ${member.displayName}: ${hash}`);
            return imageUrl;
        }
        
        return null;
        
    } catch (error) {
        console.error('[THUMBNAIL CACHE] Error storing thumbnail:', error);
        return null;
    }
}

/**
 * Get cached thumbnail URL if available
 */
async function getCachedThumbnailUrl(hash) {
    try {
        const cached = thumbnailCache.get(hash);
        if (cached) {
            // Check if cache is still valid (24 hours)
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            if (Date.now() - cached.timestamp < maxAge) {
                console.log(`[THUMBNAIL CACHE] Using cached thumbnail: ${hash}`);
                return cached.url;
            } else {
                // Remove expired cache
                thumbnailCache.delete(hash);
                console.log(`[THUMBNAIL CACHE] Cache expired for: ${hash}`);
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('[THUMBNAIL CACHE] Error getting cached thumbnail:', error);
        return null;
    }
}

/**
 * Main function to generate stats thumbnail with caching
 */
async function createStatsThumb(member, playerStats, channelId = null) {
    try {
        // Get health data for hash generation
        let healthData = { current: 100, max: 100 };
        if (channelId) {
            try {
                const PlayerHealth = require('../../../models/PlayerHealth');
                const playerHealth = await PlayerHealth.findPlayerHealth(member.id, channelId);
                if (playerHealth) {
                    healthData = {
                        current: playerHealth.currentHealth,
                        max: playerHealth.maxHealth
                    };
                }
            } catch (healthError) {
                console.warn('[STATS THUMBNAIL] Error getting health for hash:', healthError);
            }
        }
        
        // Generate hash for caching
        const statsHash = generateStatsHash(member, playerStats, channelId, healthData);
        
        // Check for cached version
        const cachedUrl = await getCachedThumbnailUrl(statsHash);
        if (cachedUrl) {
            // Return cached URL instead of buffer
            return { url: cachedUrl, cached: true };
        }
        
        // Generate new thumbnail
        let thumbnailBuffer;
        if (channelId) {
            thumbnailBuffer = await generateStatsThumb(member, playerStats, channelId);
        } else {
            thumbnailBuffer = await generateFallbackThumb(member, playerStats);
        }
        
        if (!thumbnailBuffer) return null;
        
        // Store in cache channel
        const cachedUrl2 = await storeThumbnailInChannel(thumbnailBuffer, statsHash, member);
        
        if (cachedUrl2) {
            return { url: cachedUrl2, cached: false };
        } else {
            // Return buffer if caching failed
            return { buffer: thumbnailBuffer, cached: false };
        }
        
    } catch (error) {
        console.error('[STATS THUMBNAIL] Error creating thumbnail:', error);
        return null;
    }
}

module.exports = {
    createStatsThumb,
    generateStatsThumb,
    generateFallbackThumb
};

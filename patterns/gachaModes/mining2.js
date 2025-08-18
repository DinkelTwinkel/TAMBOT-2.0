const PlayerInventory = require('../../models/inventory');
const Currency = require('../../models/currency');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
const itemSheet = require('../../data/itemSheet.json');
const { db } = require('../../models/GuildConfig');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const registerBotMessage = require('../registerBotMessage');
const gachaVC = require('../../models/activevcs');
const path = require('path');
const generateTileMapImage = require('../generateMiningProcedural');

// ---------------- Constants ----------------
const INITIAL_MAP_WIDTH = 7;
const INITIAL_MAP_HEIGHT = 5;
const TILE_SIZE = 64;

// Tile types
const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor', 
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore'
};

// ---------------- Deterministic RNG ----------------
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function createPlayerSeed(channelId, memberId) {
    // Create a numeric seed from channelId and memberId
    let seed = 0;
    const combined = channelId + memberId;
    for (let i = 0; i < combined.length; i++) {
        seed = (seed * 31 + combined.charCodeAt(i)) % 2147483647;
    }
    return seed;
}

// ---------------- Map Generation ----------------
function initializeMap() {
    const map = [];
    
    // Create initial 7x5 wall map
    for (let y = 0; y < INITIAL_MAP_HEIGHT; y++) {
        const row = [];
        for (let x = 0; x < INITIAL_MAP_WIDTH; x++) {
            row.push({ type: TILE_TYPES.WALL, discovered: false });
        }
        map.push(row);
    }
    
    // Place 3x3 floor area in the middle
    const centerX = Math.floor(INITIAL_MAP_WIDTH / 2);
    const centerY = Math.floor(INITIAL_MAP_HEIGHT / 2);
    
    for (let y = centerY - 1; y <= centerY + 1; y++) {
        for (let x = centerX - 1; x <= centerX + 1; x++) {
            if (y >= 0 && y < INITIAL_MAP_HEIGHT && x >= 0 && x < INITIAL_MAP_WIDTH) {
                map[y][x] = { type: TILE_TYPES.FLOOR, discovered: true };
            }
        }
    }
    
    // Set entrance at top center
    const entranceX = centerX;
    const entranceY = 0;
    map[entranceY][entranceX] = { type: TILE_TYPES.ENTRANCE, discovered: true };
    
    return {
        tiles: map,
        width: INITIAL_MAP_WIDTH,
        height: INITIAL_MAP_HEIGHT,
        entranceX,
        entranceY
    };
}

// ---------------- Map Expansion ----------------
function expandMap(mapData, direction) {
    const { tiles, width, height } = mapData;
    let newTiles, newWidth, newHeight;
    
    switch (direction) {
        case 'north':
            newTiles = [new Array(width).fill(null).map(() => ({ type: TILE_TYPES.WALL, discovered: false }))];
            newTiles.push(...tiles);
            newWidth = width;
            newHeight = height + 1;
            // Update all player positions (shift Y down by 1)
            for (const [playerId, pos] of Object.entries(mapData.playerPositions || {})) {
                pos.y += 1;
            }
            mapData.entranceY += 1;
            break;
            
        case 'south':
            newTiles = [...tiles];
            newTiles.push(new Array(width).fill(null).map(() => ({ type: TILE_TYPES.WALL, discovered: false })));
            newWidth = width;
            newHeight = height + 1;
            break;
            
        case 'east':
            newTiles = tiles.map(row => [...row, { type: TILE_TYPES.WALL, discovered: false }]);
            newWidth = width + 1;
            newHeight = height;
            break;
            
        case 'west':
            newTiles = tiles.map(row => [{ type: TILE_TYPES.WALL, discovered: false }, ...row]);
            newWidth = width + 1;
            newHeight = height;
            // Update all player positions (shift X right by 1)
            for (const [playerId, pos] of Object.entries(mapData.playerPositions || {})) {
                pos.x += 1;
            }
            mapData.entranceX += 1;
            break;
    }
    
    return {
        ...mapData,
        tiles: newTiles,
        width: newWidth,
        height: newHeight
    };
}

// ---------------- Player Movement ----------------
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

async function canBreakWall(playerId, miningPower) {
    if (miningPower <= 0) return false;
    
    // Higher mining power = higher chance to break wall
    // Max 90% chance at high levels
    const breakChance = Math.min(0.9, miningPower * 0.15);
    const seed = parseInt(playerId) + Date.now();
    return seededRandom(seed) < breakChance;
}

// ---------------- Atomic Database Operations ----------------
async function updateMapData(channelId, mapData) {
    await gachaVC.updateOne(
        { channelId: channelId },
        {
            $set: {
                'gameData.map': mapData
            }
        },
        { upsert: true }
    );
}

async function initializePlayerPosition(channelId, playerId, x, y) {
    await gachaVC.updateOne(
        { channelId: channelId },
        {
            $set: {
                [`gameData.map.playerPositions.${playerId}`]: { x, y }
            }
        }
    );
}

// ---------------- Game Data Helpers ----------------
function initializeGameData(dbEntry) {
    if (!dbEntry.gameData || dbEntry.gameData.gamemode !== 'mining') {
        dbEntry.gameData = {
            gamemode: 'mining',
            map: initializeMap(),
            sessionStart: new Date(),
            breakCount: 0
        };
        
        // Initialize player positions object
        dbEntry.gameData.map.playerPositions = {};
        
        dbEntry.markModified('gameData');
    }
    
    // Ensure map structure exists
    if (!dbEntry.gameData.map) {
        dbEntry.gameData.map = initializeMap();
        dbEntry.gameData.map.playerPositions = {};
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.map.playerPositions) {
        dbEntry.gameData.map.playerPositions = {};
        dbEntry.markModified('gameData');
    }
}

// ---------------- Map Rendering ----------------
async function generateMapImage(mapData, channel) {
    const { createCanvas, loadImage } = require('canvas');
    const { tiles, width, height, playerPositions } = mapData;
    
    const canvas = createCanvas(width * TILE_SIZE, height * TILE_SIZE);
    const ctx = canvas.getContext('2d');
    
    // Draw tiles
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = tiles[y][x];
            const pixelX = x * TILE_SIZE;
            const pixelY = y * TILE_SIZE;
            
            // Set tile color based on type
            switch (tile.type) {
                case TILE_TYPES.WALL:
                    ctx.fillStyle = tile.discovered ? '#444444' : '#000000';
                    break;
                case TILE_TYPES.FLOOR:
                    ctx.fillStyle = '#FFFFFF';
                    break;
                case TILE_TYPES.ENTRANCE:
                    ctx.fillStyle = '#FF0000';
                    break;
                case TILE_TYPES.WALL_WITH_ORE:
                    ctx.fillStyle = '#FFD700';
                    break;
                default:
                    ctx.fillStyle = '#000000';
            }
            
            ctx.fillRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE);
            
            // Draw tile border
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = 1;
            ctx.strokeRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE);
        }
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
            ctx.lineWidth = 2;
            ctx.stroke();
            
        } catch (error) {
            console.error(`Error loading avatar for ${member.user.username}:`, error);
        }
    }
    
    return canvas.toBuffer();
}

// ---------------- Event Log System ----------------
async function logEvent(channel, eventText) {
    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const logEntry = `[${timestamp}] ${eventText}`;

    try {
        // Fetch last 5 messages to look for existing EVENT LOG
        const messages = await channel.messages.fetch({ limit: 5 });
        let eventLogMessage = null;

        for (const [, message] of messages) {
            if (message.embeds.length > 0 && 
                message.embeds[0].title === 'MINING MAP' && 
                message.author.bot) {
                eventLogMessage = message;
                break;
            }
        }

        // Get current map data for image
        const dbEntry = await gachaVC.findOne({ channelId: channel.id });
        // const mapBuffer = await generateMapImage(dbEntry.gameData.map, channel);
        const mapBuffer = await generateTileMapImage(channel);
        const attachment = new AttachmentBuilder(mapBuffer, { name: 'mine_map.png' });

        const embed = new EmbedBuilder()
            .setTitle('MINING MAP')
            .setDescription('```\n' + logEntry + '\n```')
            .setColor(0x8B4513)
            .setImage('attachment://mine_map.png')
            .setTimestamp();

        if (eventLogMessage) {
            // Update existing embed with new log entry
            const existingEmbed = eventLogMessage.embeds[0];
            let currentDescription = existingEmbed.description || '';
            
            // Remove code block markers if present
            currentDescription = currentDescription.replace(/^```\n?|```$/g, '');
            
            // Prepare new lines
            const lines = currentDescription.split('\n').filter(line => line.trim());
            if (lines.length >= 20) {
                lines.shift();
            }
            lines.push(logEntry);

            const newDescription = '```\n' + lines.join('\n') + '\n```';
            
            if (newDescription.length > 3000) {
                // Create new embed if too long
                const newEmbed = new EmbedBuilder()
                    .setTitle('MINING MAP')
                    .setDescription('```\n' + logEntry + '\n```')
                    .setColor(0x8B4513)
                    .setImage('attachment://mine_map.png')
                    .setTimestamp();

                await channel.send({ embeds: [newEmbed], files: [attachment] });
            } else {
                // Update existing embed
                const updatedEmbed = new EmbedBuilder()
                    .setTitle('MINING MAP')
                    .setDescription(newDescription)
                    .setColor(0x8B4513)
                    .setImage('attachment://mine_map.png')
                    .setTimestamp();

                await eventLogMessage.edit({ embeds: [updatedEmbed], files: [attachment] });
            }
        } else {
            // Create new map embed
            await channel.send({ embeds: [embed], files: [attachment] });
        }
    } catch (error) {
        console.error('Error updating mining map:', error);
        await channel.send(`\`${logEntry}\``);
    }
}

// ---------------- Main Mining Event ----------------
module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();
    
    // Initialize game data
    initializeGameData(dbEntry);
    
    // Save initial setup
    await dbEntry.save();

    if (!channel?.isVoiceBased()) return;
    const members = channel.members.filter(m => !m.user.bot);
    if (!members.size) return;

    // Get current map data
    let mapData = dbEntry.gameData.map;
    let mapChanged = false;

    // Initialize player positions for new players
    for (const member of members.values()) {
        if (!mapData.playerPositions[member.id]) {
            mapData.playerPositions[member.id] = {
                x: mapData.entranceX,
                y: mapData.entranceY
            };
            mapChanged = true;
        }
    }

    // Remove positions for players no longer in VC
    const currentPlayerIds = Array.from(members.keys());
    for (const playerId of Object.keys(mapData.playerPositions)) {
        if (!currentPlayerIds.includes(playerId)) {
            delete mapData.playerPositions[playerId];
            mapChanged = true;
        }
    }

    const movementEvents = [];

    // Process movement for each player
    for (const member of members.values()) {
        const position = mapData.playerPositions[member.id];
        const playerStats = await getPlayerStats(member.id);
        console.log (playerStats);
        const miningPower = playerStats.mining || 0;
        
        // Generate movement using seeded RNG
        const seed = createPlayerSeed(channel.id, member.id) + Math.floor(now / 30000); // Changes every 30 seconds
        const direction = getRandomDirection(seed);
        
        const newX = position.x + direction.dx;
        const newY = position.y + direction.dy;
        
        // Check if player would move into top row (forbidden)
        if (newY < 0) {
            movementEvents.push(`${member.displayName} tried to move ${direction.name} but hit the mine entrance barrier!`);
            continue;
        }
        
        // Check if we need to expand the map
        let needsExpansion = false;
        let expansionDirection = '';
        
        if (newX < 0) {
            needsExpansion = true;
            expansionDirection = 'west';
        } else if (newX >= mapData.width) {
            needsExpansion = true;
            expansionDirection = 'east';
        } else if (newY >= mapData.height) {
            needsExpansion = true;
            expansionDirection = 'south';
        }
        
        if (needsExpansion) {
            mapData = expandMap(mapData, expansionDirection);
            mapChanged = true;
            movementEvents.push(`🗺️ Mine expanded ${expansionDirection}ward as ${member.displayName} explores new areas!`);
        }
        
        // Check destination tile
        const targetTile = mapData.tiles[newY] && mapData.tiles[newY][newX];
        if (!targetTile) continue; // Shouldn't happen after expansion check
        
        if (targetTile.type === TILE_TYPES.WALL || targetTile.type === TILE_TYPES.WALL_WITH_ORE) {
            // Try to break wall
            if (await canBreakWall(member.id, miningPower)) {
                // Success - convert wall to floor
                mapData.tiles[newY][newX] = { type: TILE_TYPES.FLOOR, discovered: true };
                position.x = newX;
                position.y = newY;
                mapChanged = true;
                
                if (targetTile.type === TILE_TYPES.WALL_WITH_ORE) {
                    movementEvents.push(`⛏️ ${member.displayName} broke through an ore wall ${direction.name} and found precious materials!`);
                } else {
                    movementEvents.push(`⛏️ ${member.displayName} broke through a wall ${direction.name}!`);
                }
            } else {
                if (miningPower <= 0) {
                    movementEvents.push(`❌ ${member.displayName} tried to move ${direction.name} but has no pickaxe to break the wall!`);
                } else {
                    movementEvents.push(`💥 ${member.displayName} struck the wall ${direction.name} but it held firm!`);
                }
            }
        } else {
            // Free movement on floor/entrance tiles
            position.x = newX;
            position.y = newY;
            mapChanged = true;
            movementEvents.push(`🚶 ${member.displayName} moved ${direction.name}!`);
        }
        
        // Mark tile as discovered
        if (mapData.tiles[position.y] && mapData.tiles[position.y][position.x]) {
            mapData.tiles[position.y][position.x].discovered = true;
        }
    }

    // Update map data atomically if changes were made
    if (mapChanged) {
        await updateMapData(channel.id, mapData);
    }

    // Log all movement events
    if (movementEvents.length > 0) {
        await logEvent(channel, movementEvents.join(' | '));
    }

    // Handle shop breaks and other events (keeping existing logic)
    if (now > dbEntry.nextShopRefresh) {
        await generateShop(channel, 5);
        
        const nextTrigger = new Date(now + 5 * 60 * 1000);
        const nextShopRefresh = new Date(now + 30 * 60 * 1000);
        
        await gachaVC.updateOne(
            { channelId: channel.id },
            {
                $set: {
                    nextTrigger: nextTrigger,
                    nextShopRefresh: nextShopRefresh
                }
            }
        );
        
        await logEvent(channel, '🛒 Mining paused for shop break! Explore the expanded mine when mining resumes.');
    }
};
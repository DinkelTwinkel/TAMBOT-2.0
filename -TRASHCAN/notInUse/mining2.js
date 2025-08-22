// mining2_enhanced.js
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
const ORE_SPAWN_CHANCE = 0.25; // 25% chance for a wall to have ore

// Tile types
const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor', 
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore'
};

// Mining item pool
const miningItemPool = [
    { itemId: "1", name: "Coal Ore", baseWeight: 50, boostedPowerLevel: 1, value: 2 },
    { itemId: "21", name: "Copper Ore", baseWeight: 35, boostedPowerLevel: 1, value: 8 },
    { itemId: "22", name: "Iron Ore", baseWeight: 25, boostedPowerLevel: 2, value: 15 },
    { itemId: "2", name: "Topaz Gem", baseWeight: 20, boostedPowerLevel: 2, value: 25 },
    { itemId: "23", name: "Emerald Gem", baseWeight: 10, boostedPowerLevel: 3, value: 50 },
    { itemId: "24", name: "Ruby Gem", baseWeight: 7, boostedPowerLevel: 3, value: 75 },
    { itemId: "6", name: "Diamond Gem", baseWeight: 3, boostedPowerLevel: 4, value: 100 },
    { itemId: "25", name: "Obsidian", baseWeight: 2, boostedPowerLevel: 5, value: 150 },
    { itemId: "26", name: "Mythril Ore", baseWeight: 1, boostedPowerLevel: 6, value: 200 }
];

// ---------------- Deterministic RNG ----------------
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function createPlayerSeed(channelId, memberId) {
    let seed = 0;
    const combined = channelId + memberId;
    for (let i = 0; i < combined.length; i++) {
        seed = (seed * 31 + combined.charCodeAt(i)) % 2147483647;
    }
    return seed;
}

// Generate a map-specific seed for ore placement
function createMapSeed(channelId, x, y) {
    const combined = `${channelId}_${x}_${y}`;
    let seed = 0;
    for (let i = 0; i < combined.length; i++) {
        seed = (seed * 31 + combined.charCodeAt(i)) % 2147483647;
    }
    return seed;
}

// ---------------- Visibility System ----------------
function calculateVisibleTiles(position, sightRadius, tiles) {
    const visible = new Set();
    const { x: px, y: py } = position;
    
    // Always see the tile you're on
    visible.add(`${px},${py}`);
    
    // If no sight radius, only see adjacent tiles
    if (sightRadius <= 0) {
        // Check 4 adjacent tiles
        const adjacent = [
            { x: px, y: py - 1 }, // north
            { x: px + 1, y: py }, // east
            { x: px, y: py + 1 }, // south
            { x: px - 1, y: py }  // west
        ];
        
        for (const adj of adjacent) {
            if (adj.y >= 0 && adj.y < tiles.length && 
                adj.x >= 0 && adj.x < tiles[0].length) {
                visible.add(`${adj.x},${adj.y}`);
            }
        }
        return visible;
    }
    
    // Cast rays in all directions for sight radius
    const numRays = 360;
    for (let angle = 0; angle < numRays; angle++) {
        const radians = (angle * Math.PI) / 180;
        const dx = Math.cos(radians);
        const dy = Math.sin(radians);
        
        for (let dist = 0; dist <= sightRadius; dist++) {
            const checkX = Math.round(px + dx * dist);
            const checkY = Math.round(py + dy * dist);
            
            // Check bounds
            if (checkY < 0 || checkY >= tiles.length || 
                checkX < 0 || checkX >= tiles[0].length) {
                break;
            }
            
            visible.add(`${checkX},${checkY}`);
            
            // Stop ray if hit a wall (but still mark the wall as visible)
            const tile = tiles[checkY][checkX];
            if (tile && (tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.WALL_WITH_ORE)) {
                break;
            }
        }
    }
    
    return visible;
}

// Find nearest visible ore wall
function findNearestOreWall(position, visibleTiles, tiles) {
    let nearestOre = null;
    let minDistance = Infinity;
    
    for (const tileKey of visibleTiles) {
        const [x, y] = tileKey.split(',').map(Number);
        const tile = tiles[y] && tiles[y][x];
        
        if (tile && tile.type === TILE_TYPES.WALL_WITH_ORE) {
            const distance = Math.abs(x - position.x) + Math.abs(y - position.y); // Manhattan distance
            if (distance < minDistance) {
                minDistance = distance;
                nearestOre = { x, y };
            }
        }
    }
    
    return nearestOre;
}

// ---------------- Map Generation ----------------
function initializeMap(channelId) {
    const map = [];
    
    // Create initial 7x5 wall map
    for (let y = 0; y < INITIAL_MAP_HEIGHT; y++) {
        const row = [];
        for (let x = 0; x < INITIAL_MAP_WIDTH; x++) {
            // Determine if this wall should have ore
            const mapSeed = createMapSeed(channelId, x, y);
            const hasOre = seededRandom(mapSeed) < ORE_SPAWN_CHANCE;
            
            row.push({ 
                type: hasOre ? TILE_TYPES.WALL_WITH_ORE : TILE_TYPES.WALL, 
                discovered: false 
            });
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
function expandMap(mapData, direction, channelId) {
    const { tiles, width, height } = mapData;
    let newTiles, newWidth, newHeight;
    
    switch (direction) {
        case 'north':
            // Generate new row with ore chances
            const newNorthRow = [];
            for (let x = 0; x < width; x++) {
                const mapSeed = createMapSeed(channelId, x, -1); // Use -1 for north expansion
                const hasOre = seededRandom(mapSeed) < ORE_SPAWN_CHANCE;
                newNorthRow.push({ 
                    type: hasOre ? TILE_TYPES.WALL_WITH_ORE : TILE_TYPES.WALL, 
                    discovered: false 
                });
            }
            newTiles = [newNorthRow];
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
            const newSouthRow = [];
            for (let x = 0; x < width; x++) {
                const mapSeed = createMapSeed(channelId, x, height); // Use current height for south
                const hasOre = seededRandom(mapSeed) < ORE_SPAWN_CHANCE;
                newSouthRow.push({ 
                    type: hasOre ? TILE_TYPES.WALL_WITH_ORE : TILE_TYPES.WALL, 
                    discovered: false 
                });
            }
            newTiles.push(newSouthRow);
            newWidth = width;
            newHeight = height + 1;
            break;
            
        case 'east':
            newTiles = tiles.map((row, y) => {
                const mapSeed = createMapSeed(channelId, width, y); // Use current width for east
                const hasOre = seededRandom(mapSeed) < ORE_SPAWN_CHANCE;
                return [...row, { 
                    type: hasOre ? TILE_TYPES.WALL_WITH_ORE : TILE_TYPES.WALL, 
                    discovered: false 
                }];
            });
            newWidth = width + 1;
            newHeight = height;
            break;
            
        case 'west':
            newTiles = tiles.map((row, y) => {
                const mapSeed = createMapSeed(channelId, -1, y); // Use -1 for west expansion
                const hasOre = seededRandom(mapSeed) < ORE_SPAWN_CHANCE;
                return [{ 
                    type: hasOre ? TILE_TYPES.WALL_WITH_ORE : TILE_TYPES.WALL, 
                    discovered: false 
                }, ...row];
            });
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

// ---------------- Ore Mining Functions ----------------
function pickWeightedItem(powerLevel) {
    const weightedItems = miningItemPool.map(item => {
        const weight = item.baseWeight * (powerLevel === item.boostedPowerLevel ? 10 : 1);
        return { ...item, weight };
    });
    const totalWeight = weightedItems.reduce((sum, i) => sum + i.weight, 0);
    let rand = Math.random() * totalWeight;
    return weightedItems.find(i => (rand -= i.weight) < 0) || weightedItems[0];
}

async function mineOreFromWall(member, miningPower, luckStat, powerLevel) {
    const item = pickWeightedItem(powerLevel);
    
    // Base quantity is 1, increases with mining power
    let quantity = 1;
    if (miningPower > 0) {
        quantity = 1 + Math.floor(Math.random() * Math.min(miningPower, 3));
    }
    
    // Luck increases chance for bonus items
    if (luckStat && luckStat > 0) {
        const bonusChance = Math.min(0.5, luckStat * 0.05); // 5% per luck level, max 50%
        if (Math.random() < bonusChance) {
            quantity += Math.floor(1 + Math.random() * 2); // 1-2 bonus items
        }
    }
    
    return { item, quantity };
}

// ---------------- Player Movement ----------------
function getDirectionToTarget(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    
    // Prioritize the axis with greater distance
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? { dx: 1, dy: 0, name: 'east' } : { dx: -1, dy: 0, name: 'west' };
    } else if (dy !== 0) {
        return dy > 0 ? { dx: 0, dy: 1, name: 'south' } : { dx: 0, dy: -1, name: 'north' };
    } else if (dx !== 0) {
        return dx > 0 ? { dx: 1, dy: 0, name: 'east' } : { dx: -1, dy: 0, name: 'west' };
    }
    
    // Already at target
    return { dx: 0, dy: 0, name: 'none' };
}

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

async function addToInventory(player, itemId, quantity) {
    let inv = await PlayerInventory.findOne({ playerId: player.id, playerTag: player.user.tag });
    if (!inv) {
        inv = new PlayerInventory({ playerId: player.id, playerTag: player.user.tag, items: [{ itemId, quantity }] });
    } else {
        const existing = inv.items.find(i => i.itemId === itemId);
        if (existing) existing.quantity += quantity;
        else inv.items.push({ itemId, quantity });
    }
    await inv.save();
}

// ---------------- Game Data Helpers ----------------
function initializeGameData(dbEntry, channelId) {
    if (!dbEntry.gameData || dbEntry.gameData.gamemode !== 'mining') {
        dbEntry.gameData = {
            gamemode: 'mining',
            map: initializeMap(channelId), // Pass channelId for ore generation
            sessionStart: new Date(),
            breakCount: 0
        };
        
        // Initialize player positions object
        dbEntry.gameData.map.playerPositions = {};
        
        dbEntry.markModified('gameData');
    }
    
    // Ensure map structure exists
    if (!dbEntry.gameData.map) {
        dbEntry.gameData.map = initializeMap(channelId);
        dbEntry.gameData.map.playerPositions = {};
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.map.playerPositions) {
        dbEntry.gameData.map.playerPositions = {};
        dbEntry.markModified('gameData');
    }
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
    initializeGameData(dbEntry, channel.id);
    
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
    const powerLevel = json.power || 1;

    // Process movement for each player
    for (const member of members.values()) {
        const playerStats = await getPlayerStats(member.id);
        const miningPower = playerStats.mining || 0;
        const sightStat = playerStats.sight || 0;
        const luckStat = playerStats.luck || 0;
        const speedStat = playerStats.speed || 1; // Default to 1 action if no speed stat
        
        // Calculate number of actions based on speed stat
        // Random between 1 and speed stat (inclusive)
        const numActions = speedStat > 0 ? Math.floor(Math.random() * speedStat) + 1 : 1;
        
        // Perform multiple actions based on speed
        for (let actionNum = 0; actionNum < numActions; actionNum++) {
            const position = mapData.playerPositions[member.id];
            if (!position) break; // Safety check
            
            // Calculate visible tiles for this player
            const visibleTiles = calculateVisibleTiles(position, sightStat, mapData.tiles);
            
            // Mark visible tiles as discovered
            for (const tileKey of visibleTiles) {
                const [x, y] = tileKey.split(',').map(Number);
                if (mapData.tiles[y] && mapData.tiles[y][x]) {
                    if (!mapData.tiles[y][x].discovered) {
                        mapData.tiles[y][x].discovered = true;
                        mapChanged = true;
                    }
                }
            }
            
            // Check if player is next to an ore wall
            const adjacentPositions = [
                { x: position.x, y: position.y - 1 },
                { x: position.x + 1, y: position.y },
                { x: position.x, y: position.y + 1 },
                { x: position.x - 1, y: position.y }
            ];
            
            let adjacentOre = null;
            for (const adj of adjacentPositions) {
                // Handle negative Y values (north expansion)
                const tileY = adj.y < 0 ? 0 : adj.y;
                const tileX = adj.x < 0 ? 0 : adj.x;
                
                if (tileY < mapData.height && tileX < mapData.width && 
                    mapData.tiles[tileY] && mapData.tiles[tileY][tileX]) {
                    const tile = mapData.tiles[tileY][tileX];
                    if (tile && tile.type === TILE_TYPES.WALL_WITH_ORE) {
                        adjacentOre = adj;
                        break;
                    }
                }
            }
            
            // If next to ore, try to mine it
            if (adjacentOre) {
                if (await canBreakWall(member.id, miningPower)) {
                    // Mine the ore
                    const { item, quantity } = await mineOreFromWall(member, miningPower, luckStat, powerLevel);
                    
                    // Add to inventory
                    await addToInventory(member, item.itemId, quantity);
                    
                    // Handle tile coordinates for north expansion
                    const mineY = adjacentOre.y < 0 ? 0 : adjacentOre.y;
                    const mineX = adjacentOre.x < 0 ? 0 : adjacentOre.x;
                    
                    // Convert wall to floor
                    mapData.tiles[mineY][mineX] = { type: TILE_TYPES.FLOOR, discovered: true };
                    mapChanged = true;
                    
                    const actionText = numActions > 1 ? ` [Action ${actionNum + 1}/${numActions}]` : '';
                    movementEvents.push(`⛏️💎 ${member.displayName} mined an ore wall and found『 ${item.name} 』x ${quantity}!${actionText}`);
                } else {
                    if (miningPower <= 0) {
                        const actionText = numActions > 1 ? ` [Action ${actionNum + 1}/${numActions}]` : '';
                        movementEvents.push(`❌ ${member.displayName} tried to mine ore but has no pickaxe!${actionText}`);
                    } else {
                        const actionText = numActions > 1 ? ` [Action ${actionNum + 1}/${numActions}]` : '';
                        movementEvents.push(`💥 ${member.displayName} struck the ore wall but couldn't break through!${actionText}`);
                    }
                }
                continue; // Skip movement if mining
            }
            
            // Find nearest visible ore wall
            const nearestOre = findNearestOreWall(position, visibleTiles, mapData.tiles);
            
            let direction;
            if (nearestOre) {
                // Move toward the ore
                direction = getDirectionToTarget(position, nearestOre);
                if (direction.name !== 'none' && actionNum === 0) { // Only log once per turn
                    movementEvents.push(`👁️ ${member.displayName} spotted ore and moves toward it! (Speed: ${numActions} actions)`);
                }
            } else {
                // Random movement
                const seed = createPlayerSeed(channel.id, member.id) + Math.floor(now / 30000) + actionNum;
                direction = getRandomDirection(seed);
            }
            
            if (direction.dx === 0 && direction.dy === 0) continue; // No movement needed
            
            const newX = position.x + direction.dx;
            const newY = position.y + direction.dy;
        
        // Check if we need to expand the map
        let needsExpansion = false;
        let expansionDirection = '';
        
        if (newY < 0) {
            needsExpansion = true;
            expansionDirection = 'north';
        } else if (newX < 0) {
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
            mapData = expandMap(mapData, expansionDirection, channel.id);
            mapChanged = true;
            movementEvents.push(`🗺️ Mine expanded ${expansionDirection}ward as ${member.displayName} explores new areas!`);
        }
        
        // Check destination tile
        const targetTile = mapData.tiles[newY] && mapData.tiles[newY][newX];
        if (!targetTile) continue;
        
        if (targetTile.type === TILE_TYPES.WALL || targetTile.type === TILE_TYPES.WALL_WITH_ORE) {
            // Try to break wall
            if (await canBreakWall(member.id, miningPower)) {
                // If it's an ore wall, mine it
                if (targetTile.type === TILE_TYPES.WALL_WITH_ORE) {
                    const { item, quantity } = await mineOreFromWall(member, miningPower, luckStat, powerLevel);
                    await addToInventory(member, item.itemId, quantity);
                    movementEvents.push(`⛏️💎 ${member.displayName} broke through an ore wall ${direction.name} and found『 ${item.name} 』x ${quantity}!`);
                } else {
                    movementEvents.push(`⛏️ ${member.displayName} broke through a wall ${direction.name}!`);
                }
                
                // Convert wall to floor and move
                mapData.tiles[newY][newX] = { type: TILE_TYPES.FLOOR, discovered: true };
                position.x = newX;
                position.y = newY;
                mapChanged = true;
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
            
            if (!nearestOre) {
                movementEvents.push(`🚶 ${member.displayName} moved ${direction.name}!`);
            }
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
 }
}
// mining2_final.js - Final Optimized Version
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
const ORE_SPAWN_CHANCE = 0.25;
const IMAGE_GENERATION_INTERVAL = 1; // Generate image every event (adjustable)
const MAX_SPEED_ACTIONS = 3; // Cap speed stat for performance

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

// Global event counter for image generation
let eventCounter = 0;

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

function createMapSeed(channelId, x, y) {
    const combined = `${channelId}_${x}_${y}`;
    let seed = 0;
    for (let i = 0; i < combined.length; i++) {
        seed = (seed * 31 + combined.charCodeAt(i)) % 2147483647;
    }
    return seed;
}

// ---------------- Optimized Visibility System (Team-wide) ----------------
function calculateTeamVisibility(playerPositions, teamSightRadius, tiles) {
    const visible = new Set();
    
    // If no sight radius, only see tiles where players are and adjacent
    if (teamSightRadius <= 0) {
        for (const position of Object.values(playerPositions)) {
            if (!position) continue;
            
            // Add current tile
            visible.add(`${position.x},${position.y}`);
            
            // Add adjacent tiles
            const adjacent = [
                { x: position.x, y: position.y - 1 },
                { x: position.x + 1, y: position.y },
                { x: position.x, y: position.y + 1 },
                { x: position.x - 1, y: position.y }
            ];
            
            for (const adj of adjacent) {
                if (adj.y >= 0 && adj.y < tiles.length && 
                    adj.x >= 0 && adj.x < tiles[0].length) {
                    visible.add(`${adj.x},${adj.y}`);
                }
            }
        }
        return visible;
    }
    
    // Cast rays from all player positions
    for (const position of Object.values(playerPositions)) {
        if (!position) continue;
        
        const { x: px, y: py } = position;
        visible.add(`${px},${py}`);
        
        // Reduced ray count for performance
        const numRays = 72; // Down from 360
        for (let angle = 0; angle < numRays; angle += 5) {
            const radians = (angle * Math.PI) / 180;
            const dx = Math.cos(radians);
            const dy = Math.sin(radians);
            
            for (let dist = 0; dist <= teamSightRadius; dist++) {
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
    }
    
    return visible;
}

// ---------------- Cached Ore Finding ----------------
let oreCache = { tiles: null, positions: [], timestamp: 0 };

function findNearestOreWall(position, visibleTiles, tiles) {
    const now = Date.now();
    
    // Cache ore positions for 10 seconds
    if (oreCache.timestamp < now - 10000 || oreCache.tiles !== tiles) {
        oreCache.positions = [];
        oreCache.tiles = tiles;
        oreCache.timestamp = now;
        
        // Pre-calculate all ore positions
        for (let y = 0; y < tiles.length; y++) {
            for (let x = 0; x < tiles[y].length; x++) {
                const tile = tiles[y][x];
                if (tile && tile.type === TILE_TYPES.WALL_WITH_ORE) {
                    oreCache.positions.push({ x, y });
                }
            }
        }
    }
    
    let nearestOre = null;
    let minDistance = Infinity;
    
    for (const ore of oreCache.positions) {
        const tileKey = `${ore.x},${ore.y}`;
        if (visibleTiles.has(tileKey)) {
            const distance = Math.abs(ore.x - position.x) + Math.abs(ore.y - position.y);
            if (distance < minDistance) {
                minDistance = distance;
                nearestOre = ore;
            }
        }
    }
    
    return nearestOre;
}

// ---------------- Map Generation ----------------
function initializeMap(channelId) {
    const map = [];
    
    for (let y = 0; y < INITIAL_MAP_HEIGHT; y++) {
        const row = [];
        for (let x = 0; x < INITIAL_MAP_WIDTH; x++) {
            const mapSeed = createMapSeed(channelId, x, y);
            const hasOre = seededRandom(mapSeed) < ORE_SPAWN_CHANCE;
            
            row.push({ 
                type: hasOre ? TILE_TYPES.WALL_WITH_ORE : TILE_TYPES.WALL, 
                discovered: false 
            });
        }
        map.push(row);
    }
    
    const centerX = Math.floor(INITIAL_MAP_WIDTH / 2);
    const centerY = Math.floor(INITIAL_MAP_HEIGHT / 2);
    
    for (let y = centerY - 1; y <= centerY + 1; y++) {
        for (let x = centerX - 1; x <= centerX + 1; x++) {
            if (y >= 0 && y < INITIAL_MAP_HEIGHT && x >= 0 && x < INITIAL_MAP_WIDTH) {
                map[y][x] = { type: TILE_TYPES.FLOOR, discovered: true };
            }
        }
    }
    
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

function expandMap(mapData, direction, channelId) {
    const { tiles, width, height } = mapData;
    let newTiles, newWidth, newHeight;
    
    switch (direction) {
        case 'north':
            const newNorthRow = [];
            for (let x = 0; x < width; x++) {
                const mapSeed = createMapSeed(channelId, x, -1);
                const hasOre = seededRandom(mapSeed) < ORE_SPAWN_CHANCE;
                newNorthRow.push({ 
                    type: hasOre ? TILE_TYPES.WALL_WITH_ORE : TILE_TYPES.WALL, 
                    discovered: false 
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
                const mapSeed = createMapSeed(channelId, x, height);
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
                const mapSeed = createMapSeed(channelId, width, y);
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
                const mapSeed = createMapSeed(channelId, -1, y);
                const hasOre = seededRandom(mapSeed) < ORE_SPAWN_CHANCE;
                return [{ 
                    type: hasOre ? TILE_TYPES.WALL_WITH_ORE : TILE_TYPES.WALL, 
                    discovered: false 
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
    
    // Invalidate ore cache when map changes
    oreCache.timestamp = 0;
    
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
    
    let quantity = 1;
    if (miningPower > 0) {
        quantity = 1 + Math.floor(Math.random() * Math.min(miningPower, 3));
    }
    
    if (luckStat && luckStat > 0) {
        const bonusChance = Math.min(0.5, luckStat * 0.05);
        if (Math.random() < bonusChance) {
            quantity += Math.floor(1 + Math.random() * 2);
        }
    }
    
    return { item, quantity };
}

// ---------------- Player Movement ----------------
function getDirectionToTarget(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? { dx: 1, dy: 0, name: 'east' } : { dx: -1, dy: 0, name: 'west' };
    } else if (dy !== 0) {
        return dy > 0 ? { dx: 0, dy: 1, name: 'south' } : { dx: 0, dy: -1, name: 'north' };
    } else if (dx !== 0) {
        return dx > 0 ? { dx: 1, dy: 0, name: 'east' } : { dx: -1, dy: 0, name: 'west' };
    }
    
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
    
    const breakChance = Math.min(0.9, miningPower * 0.15);
    const seed = parseInt(playerId) + Date.now();
    return seededRandom(seed) < breakChance;
}

// ---------------- Pickaxe Durability System ----------------
function checkPickaxeBreak(pickaxe) {
    if (!pickaxe || !pickaxe.durability) return false;
    
    // Higher durability = lower break chance
    // Roll 1-100, break if roll > durability
    const roll = Math.floor(Math.random() * 100) + 1;
    return roll > pickaxe.durability;
}

async function breakPickaxe(playerId, playerTag, pickaxe) {
    // Remove one pickaxe from inventory
    const inv = await PlayerInventory.findOne({ playerId});
    if (inv) {
        const itemIndex = inv.items.findIndex(i => i.itemId === pickaxe.itemId);
        if (itemIndex !== -1) {
            if (inv.items[itemIndex].quantity > 1) {
                inv.items[itemIndex].quantity -= 1;
            } else {
                inv.items.splice(itemIndex, 1);
            }
            await inv.save();
        }
    }
}

// ---------------- Batch Database Operations ----------------
class DatabaseTransaction {
    constructor() {
        this.inventoryUpdates = new Map(); // playerId -> { itemId, quantity }
        this.mapUpdate = null;
        this.vcUpdates = {};
        this.pickaxeBreaks = []; // { playerId, playerTag, pickaxe }
    }
    
    addInventoryItem(playerId, playerTag, itemId, quantity) {
        const key = `${playerId}-${itemId}`;
        if (this.inventoryUpdates.has(key)) {
            this.inventoryUpdates.get(key).quantity += quantity;
        } else {
            this.inventoryUpdates.set(key, { playerId, playerTag, itemId, quantity });
        }
    }
    
    addPickaxeBreak(playerId, playerTag, pickaxe) {
        this.pickaxeBreaks.push({ playerId, playerTag, pickaxe });
    }
    
    setMapUpdate(channelId, mapData) {
        this.mapUpdate = { channelId, mapData };
    }
    
    setVCUpdate(channelId, updates) {
        this.vcUpdates[channelId] = updates;
    }
    
    async commit() {
        const promises = [];
        
        // Batch inventory updates
        if (this.inventoryUpdates.size > 0) {
            const inventoryPromises = Array.from(this.inventoryUpdates.values()).map(async (update) => {
                let inv = await PlayerInventory.findOne({ 
                    playerId: update.playerId, 
                    playerTag: update.playerTag 
                });
                
                if (!inv) {
                    inv = new PlayerInventory({ 
                        playerId: update.playerId, 
                        playerTag: update.playerTag, 
                        items: [{ itemId: update.itemId, quantity: update.quantity }] 
                    });
                } else {
                    const existing = inv.items.find(i => i.itemId === update.itemId);
                    if (existing) {
                        existing.quantity += update.quantity;
                    } else {
                        inv.items.push({ itemId: update.itemId, quantity: update.quantity });
                    }
                }
                
                return inv.save();
            });
            promises.push(...inventoryPromises);
        }
        
        // Handle pickaxe breaks
        if (this.pickaxeBreaks.length > 0) {
            const breakPromises = this.pickaxeBreaks.map(breakData => 
                breakPickaxe(breakData.playerId, breakData.playerTag, breakData.pickaxe)
            );
            promises.push(...breakPromises);
        }
        
        // Map update
        if (this.mapUpdate) {
            const mapPromise = gachaVC.updateOne(
                { channelId: this.mapUpdate.channelId },
                { $set: { 'gameData.map': this.mapUpdate.mapData } },
                { upsert: true }
            );
            promises.push(mapPromise);
        }
        
        // VC updates
        for (const [channelId, updates] of Object.entries(this.vcUpdates)) {
            const vcPromise = gachaVC.updateOne(
                { channelId },
                { $set: updates }
            );
            promises.push(vcPromise);
        }
        
        await Promise.all(promises);
    }
}

// ---------------- Game Data Helpers ----------------
function initializeGameData(dbEntry, channelId) {
    if (!dbEntry.gameData || dbEntry.gameData.gamemode !== 'mining') {
        dbEntry.gameData = {
            gamemode: 'mining',
            map: initializeMap(channelId),
            minecart: {
                items: {}, // itemId -> { quantity, contributors: { playerId -> amount } }
                contributors: {} // playerId -> totalItemsContributed (for participation tracking)
            },
            sessionStart: new Date(),
            breakCount: 0
        };
        
        dbEntry.gameData.map.playerPositions = {};
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.map) {
        dbEntry.gameData.map = initializeMap(channelId);
        dbEntry.gameData.map.playerPositions = {};
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.map.playerPositions) {
        dbEntry.gameData.map.playerPositions = {};
        dbEntry.markModified('gameData');
    }
    // Ensure minecart structure exists
    if (!dbEntry.gameData.minecart) {
        dbEntry.gameData.minecart = {
            items: {},
            contributors: {}
        };
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.minecart.items) {
        dbEntry.gameData.minecart.items = {};
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.minecart.contributors) {
        dbEntry.gameData.minecart.contributors = {};
        dbEntry.markModified('gameData');
    }
}

// Atomic minecart reset
async function resetMinecart(channelId) {
    await gachaVC.updateOne(
        { channelId: channelId },
        {
            $set: {
                'gameData.minecart.items': {},
                'gameData.minecart.contributors': {},
                'gameData.sessionStart': new Date()
            }
        }
    );
}

// Atomic minecart item addition
async function addItemToMinecart(dbEntry, playerId, itemId, amount) {
    const channelId = dbEntry.channelId;
    
    try {
        // Try the increment operation first
        await gachaVC.updateOne(
            { channelId: channelId },
            {
                $inc: {
                    [`gameData.minecart.items.${itemId}.quantity`]: amount,
                    [`gameData.minecart.items.${itemId}.contributors.${playerId}`]: amount,
                    [`gameData.minecart.contributors.${playerId}`]: amount
                }
            }
        );
    } catch (error) {
        // If it fails due to missing path, initialize the structure first
        if (error.code === 40 || error.message.includes('path') || error.message.includes('conflict')) {
            // Get current document to merge with new structure
            const currentDoc = await gachaVC.findOne({ channelId: channelId });
            
            // Initialize the minecart structure preserving existing data
            const existingItems = currentDoc?.gameData?.minecart?.items || {};
            const existingContributors = currentDoc?.gameData?.minecart?.contributors || {};
            
            // Set the new item structure
            existingItems[itemId] = existingItems[itemId] || { quantity: 0, contributors: {} };
            existingItems[itemId].quantity = (existingItems[itemId].quantity || 0) + amount;
            existingItems[itemId].contributors[playerId] = (existingItems[itemId].contributors[playerId] || 0) + amount;
            existingContributors[playerId] = (existingContributors[playerId] || 0) + amount;
            
            await gachaVC.updateOne(
                { channelId: channelId },
                {
                    $set: {
                        'gameData.minecart.items': existingItems,
                        'gameData.minecart.contributors': existingContributors
                    }
                },
                { upsert: true }
            );
        } else {
            throw error; // Re-throw if it's a different error
        }
    }
}

// ---------------- Optimized Event Log System ----------------
async function logEvent(channel, eventText, forceNew = false) {
    eventCounter++;
    const shouldGenerateImage = forceNew || (eventCounter % IMAGE_GENERATION_INTERVAL === 0);
    
    // create break timer and minecart summary.
    const result = await gachaVC.findOne({ channelId: channel.id });
    const now = new Date();
    const nextRefreshTime = result.nextShopRefresh;

    let diffMs = nextRefreshTime - now;
    if (diffMs < 0) diffMs = 0;

    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    const minecartSummary = getMinecartSummary(result);

    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const logEntry = eventText ? `[${timestamp}] ${eventText}` : null;

    try {
        const messages = await channel.messages.fetch({ limit: 1 });
        let eventLogMessage = null;

        for (const [, message] of messages) {
            if (message.embeds.length > 0 && 
                message.embeds[0].title === 'MINING MAP' && 
                message.author.bot) {
                eventLogMessage = message;
                break;
            }
        }

        let attachment = null;
        if (shouldGenerateImage) {
            const mapBuffer = await generateTileMapImage(channel);
            attachment = new AttachmentBuilder(mapBuffer, { name: 'mine_map.png' });
        }

        // Build embed only if there's text or an image to send
        if (logEntry || shouldGenerateImage) {
            const embed = new EmbedBuilder()
                .setTitle('MINING MAP')
                .setColor(0x8B4513)
                .setFooter({ text: `MINECART: ${minecartSummary.summary} ~ NEXT BREAK IN ${diffMinutes} MINUTES` })
                .setTimestamp();

            if (logEntry) {
                embed.setDescription('```\n' + logEntry + '\n```');
            }

            if (eventLogMessage && forceNew === false) {
                // Update existing embed
                const existingEmbed = eventLogMessage.embeds[0];
                let currentDescription = existingEmbed.description || '';
                currentDescription = currentDescription.replace(/^```\n?|```$/g, '');
                
                const lines = currentDescription.split('\n').filter(line => line.trim());
                if (logEntry) {
                    if (lines.length >= 15) lines.shift();
                    lines.push(logEntry);
                }

                const newDescription = lines.length > 0 ? '```\n' + lines.join('\n') + '\n```' : null;

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('MINING MAP')
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART: ${minecartSummary.summary} ~ NEXT BREAK IN ${diffMinutes} MINUTES` })
                    .setTimestamp();

                if (newDescription) updatedEmbed.setDescription(newDescription);
                // optionally keep existing image
                // updatedEmbed.setImage(existingEmbed.image?.url || null);

                await eventLogMessage.edit({ embeds: [updatedEmbed], files: attachment ? [attachment] : [] });
                return;
            }

            // Send new message
            const messageOptions = { embeds: [embed] };
            if (attachment) messageOptions.files = [attachment];

            await channel.send(messageOptions);
        }

    } catch (error) {
        console.error('Error updating mining map:', error);
        if (eventText) await channel.send(`\`${logEntry}\``);
    }
}


// Force image generation even when no events to log
// async function generateMapImage(channel) {
//     eventCounter++;
    
//     try {
//         const mapBuffer = await generateTileMapImage(channel);
//         const attachment = new AttachmentBuilder(mapBuffer, { name: 'mine_map.png' });
        
//         const embed = new EmbedBuilder()
//             .setTitle('MINING MAP')
//             .setDescription('```\nMap updated\n```')
//             .setColor(0x8B4513)
//             .setImage('attachment://mine_map.png')
//             .setTimestamp();

//         await channel.send({ embeds: [embed], files: [attachment] });
//     } catch (error) {
//         console.error('Error generating mining map:', error);
//     }
// }

// ---------------- Main Mining Event (Optimized) ----------------
module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();
    
    initializeGameData(dbEntry, channel.id);
    await dbEntry.save();

    if (!channel?.isVoiceBased()) return;
    const members = channel.members.filter(m => !m.user.bot);
    if (!members.size) return;

    // Cache all player stats at the beginning
    const playerStatsCache = new Map();
    const playerStatPromises = Array.from(members.values()).map(async (member) => {
        const result = await getPlayerStats(member.id);
        playerStatsCache.set(member.id, result);
    });
    await Promise.all(playerStatPromises);

    let mapData = dbEntry.gameData.map;
    let mapChanged = false;
    const transaction = new DatabaseTransaction();
    
    // Initialize player positions
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

    // Calculate team-wide sight radius (average of all players)
    let totalSight = 0;
    let playerCount = 0;
    for (const member of members.values()) {
        const playerData = playerStatsCache.get(member.id);
        totalSight += playerData.stats.sight || 0;
        playerCount++;
    }
    const teamSightRadius = Math.floor(totalSight / playerCount);

    // Calculate visibility once for the entire team
    const teamVisibleTiles = calculateTeamVisibility(mapData.playerPositions, teamSightRadius, mapData.tiles);
    
    // Mark visible tiles as discovered
    for (const tileKey of teamVisibleTiles) {
        const [x, y] = tileKey.split(',').map(Number);
        if (mapData.tiles[y] && mapData.tiles[y][x]) {
            if (!mapData.tiles[y][x].discovered) {
                mapData.tiles[y][x].discovered = true;
                mapChanged = true;
            }
        }
    }

    const eventLogs = [];
    const powerLevel = json.power || 1;

    // Process movement for each player
    for (const member of members.values()) {
        const playerData = playerStatsCache.get(member.id);
        const miningPower = playerData.stats.mining || 0;
        const luckStat = playerData.stats.luck || 0;
        const speedStat = Math.min(playerData.stats.speed || 1, MAX_SPEED_ACTIONS);
        const bestPickaxe = playerData.bestItems.mining || null;
        
        const numActions = speedStat > 0 ? Math.floor(Math.random() * speedStat) + 1 : 1;
        
        for (let actionNum = 0; actionNum < numActions; actionNum++) {
            const position = mapData.playerPositions[member.id];
            if (!position) break;
            
            // Check for adjacent ore
            const adjacentPositions = [
                { x: position.x, y: position.y - 1 },
                { x: position.x + 1, y: position.y },
                { x: position.x, y: position.y + 1 },
                { x: position.x - 1, y: position.y }
            ];
            
            let adjacentOre = null;
            for (const adj of adjacentPositions) {
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
            
            // Mining logic
            if (adjacentOre) {
                if (await canBreakWall(member.id, miningPower)) {
                    const { item, quantity } = await mineOreFromWall(member, miningPower, luckStat, powerLevel);
                    
                    //transaction.addInventoryItem(member.id, member.user.tag, item.itemId, quantity);
                    await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                    
                    const mineY = adjacentOre.y < 0 ? 0 : adjacentOre.y;
                    const mineX = adjacentOre.x < 0 ? 0 : adjacentOre.x;
                    
                    mapData.tiles[mineY][mineX] = { type: TILE_TYPES.FLOOR, discovered: true };
                    mapChanged = true;
                    
                    // Check for pickaxe break and log ore find
                    if (bestPickaxe && checkPickaxeBreak(bestPickaxe)) {
                        transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                        eventLogs.push(`${member.displayName} found ore but their ${bestPickaxe.name} shattered!`);
                        eventLogs.push(`💎 ${member.displayName} found ${item.name} x${quantity}`);
                    } else {
                        eventLogs.push(`💎 ${member.displayName} found ${item.name} x${quantity}`);
                    }
                } else {
                    // Failed to break ore
                    if (miningPower <= 0) {
                        eventLogs.push(`${member.displayName} tried to mine ore but has no pickaxe`);
                    } else {
                        eventLogs.push(`${member.displayName} struck the ore wall but couldn't break through`);
                        
                        // Check for pickaxe break on failed attempt
                        if (bestPickaxe && checkPickaxeBreak(bestPickaxe)) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered from the impact`);
                        }
                    }
                }
                continue;
            }
            
            // Use cached ore finding
            const nearestOre = findNearestOreWall(position, teamVisibleTiles, mapData.tiles);
            
            let direction;
            if (nearestOre) {
                direction = getDirectionToTarget(position, nearestOre);
            } else {
                const seed = createPlayerSeed(channel.id, member.id) + Math.floor(now / 30000) + actionNum;
                direction = getRandomDirection(seed);
            }
            
            if (direction.dx === 0 && direction.dy === 0) continue;
            
            const newX = position.x + direction.dx;
            const newY = position.y + direction.dy;
            
            // Map expansion logic
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
            }
            
            // Movement and wall breaking logic
            const targetTile = mapData.tiles[newY] && mapData.tiles[newY][newX];
            if (!targetTile) continue;
            
            if (targetTile.type === TILE_TYPES.WALL || targetTile.type === TILE_TYPES.WALL_WITH_ORE) {
                // Try to break wall
                if (await canBreakWall(member.id, miningPower)) {
                    // If it's an ore wall, mine it
                    if (targetTile.type === TILE_TYPES.WALL_WITH_ORE) {
                        const { item, quantity } = await mineOreFromWall(member, miningPower, luckStat, powerLevel);
                        //transaction.addInventoryItem(member.id, member.user.tag, item.itemId, quantity);
                        await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                        // Check for pickaxe break
                        if (bestPickaxe && checkPickaxeBreak(bestPickaxe)) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName} found ore but their ${bestPickaxe.name} shattered!`);
                            eventLogs.push(`💎 ${member.displayName} found ${item.name} x${quantity}`);
                        } else {
                            eventLogs.push(`💎 ${member.displayName} found ${item.name} x${quantity}`);
                        }
                    }
                    
                    // Convert wall to floor and move
                    mapData.tiles[newY][newX] = { type: TILE_TYPES.FLOOR, discovered: true };
                    position.x = newX;
                    position.y = newY;
                    mapChanged = true;
                } else {
                    // Failed to break wall
                    if (miningPower <= 0) {
                        eventLogs.push(`${member.displayName} tried to break a wall but has no pickaxe`);
                    } else {
                        eventLogs.push(`${member.displayName} struck the wall but it held firm`);
                        
                        // Check for pickaxe break on failed attempt
                        if (bestPickaxe && checkPickaxeBreak(bestPickaxe)) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered from the impact`);
                        }
                    }
                }
            } else {
                // Free movement on floor/entrance tiles (no logging)
                position.x = newX;
                position.y = newY;
                mapChanged = true;

                // 5% chance to find something on the floor.
                if (Math.random() * 100 > 98) {
                    const item = pickWeightedItem(powerLevel);
                    eventLogs.push(`${member.displayName} found 1 ${item.name} on the floor!`);
                    await addItemToMinecart(dbEntry, member.id, item.itemId, 1);
                }

            }
        }
    }

    // Batch all database operations
    if (mapChanged) {
        transaction.setMapUpdate(channel.id, mapData);
    }

    // Commit all database changes
    await transaction.commit();

    // Log events or generate image even if no events
    if (eventLogs.length > 0) {
        const combinedEvents = eventLogs.join(' | ');
        await logEvent(channel, combinedEvents);
    } else {
        // Generate image even when no events to log
        const combinedEvents = eventLogs.join(' | ');
        await logEvent(channel, combinedEvents);
    }

    // Handle shop breaks
    if (now > dbEntry.nextShopRefresh) {
        
        const nextTrigger = new Date(now + 5 * 60 * 1000);
        const nextShopRefresh = new Date(now + 30 * 60 * 1000);
        
        const vcTransaction = new DatabaseTransaction();
        vcTransaction.setVCUpdate(channel.id, {
            nextTrigger: nextTrigger,
            nextShopRefresh: nextShopRefresh
        });
        await vcTransaction.commit();

        const refreshedEntry = await gachaVC.findOne({ channelId: channel.id });
        await createMiningSummary(channel, refreshedEntry);
        await logEvent(channel, '🥪 Shop break! Mining resuming in 5mins!', true);
        await generateShop(channel, 5);

    }
};

// ---------------- Mining Session Summary & Minecart Sale ----------------
async function createMiningSummary(channel, dbEntry) {
    const gameData = dbEntry.gameData;
    if (!gameData || gameData.gamemode !== 'mining') return;

    const minecart = gameData.minecart;
    if (!minecart || !minecart.items) {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription('The minecart is empty. No items to sell! Shop is now available!')
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    // Calculate total value and create item breakdown
    let totalValue = 0;
    let totalItems = 0;
    const itemBreakdown = [];
    const contributorRewards = {};

    // Process each item type in the minecart
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        const poolItem = miningItemPool.find(item => item.itemId === itemId);
        if (!poolItem || itemData.quantity <= 0) continue;

        const itemTotalValue = poolItem.value * itemData.quantity;
        totalValue += itemTotalValue;
        totalItems += itemData.quantity;
        itemBreakdown.push(`${poolItem.name} x${itemData.quantity} = ${itemTotalValue} coins`);

        // Calculate rewards for contributors of this specific item
        const contributorCount = Object.keys(itemData.contributors || {}).length;
        if (contributorCount > 0) {
            const coinsPerContributor = Math.floor(itemTotalValue / contributorCount);
            
            for (const [playerId, contributed] of Object.entries(itemData.contributors)) {
                if (!contributorRewards[playerId]) {
                    contributorRewards[playerId] = { coins: 0, items: [] };
                }
                contributorRewards[playerId].coins += coinsPerContributor;
                contributorRewards[playerId].items.push(`${poolItem.name} x${contributed}`);
            }
        }
    }

    if (totalItems === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription('The minecart is empty. No items to sell! Shop is now available!')
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    // Reward each contributor using atomic operations
    const contributorLines = [];
    for (const [playerId, reward] of Object.entries(contributorRewards)) {
        try {
            const member = await channel.guild.members.fetch(playerId);
            
            // Fixed atomic currency update - handle the case where money field doesn't exist
            let userCurrency = await Currency.findOne({ userId: playerId });
            
            if (!userCurrency) {
                // Create new currency document if it doesn't exist
                userCurrency = await Currency.create({
                    userId: playerId,
                    money: reward.coins
                });
            } else {
                // Update existing document safely
                userCurrency.money = (userCurrency.money || 0) + reward.coins;
                await userCurrency.save();
            }
            
            contributorLines.push(`${member.displayName}: ${reward.items.join(', ')} → ${reward.coins} coins`);
        } catch (error) {
            console.error(`Error rewarding player ${playerId}:`, error);
            // Continue processing other players even if one fails
        }
    }
    const embed = new EmbedBuilder()
        .setTitle('🛒 Mining Session Complete')
        .setDescription(`The minecart has been sold to the shop!\n\n**Items Sold:**\n${itemBreakdown.join('\n')}\n\n**Total Value:** ${totalValue} coins`)
        .addFields({
            name: 'Contributors & Rewards',
            value: contributorLines.join('\n') || 'None',
            inline: false
        })
        .setColor(0xFFD700)
        .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Atomic minecart reset
    await resetMinecart(channel.id);
}

function getMinecartSummary(dbEntry) {
    const minecart = dbEntry.gameData?.minecart;
    if (!minecart || !minecart.items) return { totalValue: 0, itemCount: 0, summary: "Empty minecart" };
    
    let totalValue = 0;
    let totalItems = 0;
    const itemSummaries = [];
    
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        const poolItem = miningItemPool.find(item => item.itemId === itemId);
        if (poolItem && itemData.quantity > 0) {
            const itemValue = poolItem.value * itemData.quantity;
            totalValue += itemValue;
            totalItems += itemData.quantity;
            itemSummaries.push(`${poolItem.name} x${itemData.quantity}`);
        }
    }
    
    return {
        totalValue,
        itemCount: totalItems,
        summary: itemSummaries.length > 0 ? itemSummaries.join(', ') : "Empty minecart"
    };
}

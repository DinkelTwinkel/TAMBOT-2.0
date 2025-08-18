// mining_optimized_v2.js - Enhanced Version with Performance & Gameplay Improvements
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

// ---------------- Enhanced Constants ----------------
const INITIAL_MAP_WIDTH = 9;
const INITIAL_MAP_HEIGHT = 7;
const BASE_ORE_SPAWN_CHANCE = 0.3;
const RARE_ORE_SPAWN_CHANCE = 0.05;
const IMAGE_GENERATION_INTERVAL = 1;
const MAX_SPEED_ACTIONS = 4;
const MAX_MAP_SIZE = 50; // Prevent infinite expansion
const EXPLORATION_BONUS_CHANCE = 0.02;

// Enhanced tile types
const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor', 
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore',
    RARE_ORE: 'rare_ore', // High-value ore nodes
    TREASURE_CHEST: 'treasure', // Special find
    HAZARD: 'hazard', // Dangerous tiles
    REINFORCED_WALL: 'reinforced' // Harder to break walls
};

// Enhanced mining item pool with rarity tiers
const miningItemPool = [
    // Common tier
    { itemId: "1", name: "Coal Ore", baseWeight: 50, boostedPowerLevel: 1, value: 2, tier: 'common' },
    { itemId: "21", name: "Copper Ore", baseWeight: 35, boostedPowerLevel: 1, value: 8, tier: 'common' },
    
    // Uncommon tier
    { itemId: "22", name: "Iron Ore", baseWeight: 25, boostedPowerLevel: 2, value: 15, tier: 'uncommon' },
    { itemId: "2", name: "Topaz Gem", baseWeight: 20, boostedPowerLevel: 2, value: 25, tier: 'uncommon' },
    
    // Rare tier
    { itemId: "23", name: "Emerald Gem", baseWeight: 12, boostedPowerLevel: 3, value: 50, tier: 'rare' },
    { itemId: "24", name: "Ruby Gem", baseWeight: 8, boostedPowerLevel: 3, value: 75, tier: 'rare' },
    
    // Epic tier
    { itemId: "6", name: "Diamond Gem", baseWeight: 4, boostedPowerLevel: 4, value: 100, tier: 'epic' },
    { itemId: "25", name: "Obsidian", baseWeight: 3, boostedPowerLevel: 5, value: 150, tier: 'epic' },
    
    // Legendary tier
    { itemId: "26", name: "Mythril Ore", baseWeight: 1, boostedPowerLevel: 6, value: 200, tier: 'legendary' },
    { itemId: "27", name: "Adamantite", baseWeight: 0.5, boostedPowerLevel: 7, value: 300, tier: 'legendary' }
];

// Special treasure items
const treasureItems = [
    { itemId: "101", name: "Ancient Coin", value: 50, description: "A mysterious coin from ages past" },
    { itemId: "102", name: "Crystal Shard", value: 100, description: "Radiates with inner light" },
    { itemId: "103", name: "Rare Fossil", value: 150, description: "Evidence of prehistoric life" }
];

let eventCounter = 0;

// ---------------- Enhanced RNG System ----------------
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

// ---------------- Enhanced Visibility System ----------------
function calculateTeamVisibility(playerPositions, teamSightRadius, tiles) {
    const visible = new Set();
    
    if (teamSightRadius <= 0) {
        for (const position of Object.values(playerPositions)) {
            if (!position) continue;
            
            visible.add(`${position.x},${position.y}`);
            
            // Add adjacent tiles in all 8 directions
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const newX = position.x + dx;
                    const newY = position.y + dy;
                    if (newY >= 0 && newY < tiles.length && 
                        newX >= 0 && newX < tiles[0].length) {
                        visible.add(`${newX},${newY}`);
                    }
                }
            }
        }
        return visible;
    }
    
    // Enhanced visibility with light sources
    for (const position of Object.values(playerPositions)) {
        if (!position) continue;
        
        const { x: px, y: py } = position;
        visible.add(`${px},${py}`);
        
        const rayCount = Math.min(64, teamSightRadius * 8);
        for (let i = 0; i < rayCount; i++) {
            const angle = (i * 360) / rayCount;
            const radians = (angle * Math.PI) / 180;
            const dx = Math.cos(radians);
            const dy = Math.sin(radians);
            
            for (let dist = 1; dist <= teamSightRadius; dist++) {
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
    }
    
    return visible;
}

// ---------------- Enhanced Ore Finding with Caching ----------------
let oreCache = { tiles: null, positions: [], rarePositions: [], timestamp: 0 };

function findNearestTarget(position, visibleTiles, tiles, targetTypes = [TILE_TYPES.WALL_WITH_ORE]) {
    const now = Date.now();
    
    if (oreCache.timestamp < now - 15000 || oreCache.tiles !== tiles) {
        oreCache.positions = [];
        oreCache.rarePositions = [];
        oreCache.tiles = tiles;
        oreCache.timestamp = now;
        
        for (let y = 0; y < tiles.length; y++) {
            for (let x = 0; x < tiles[y].length; x++) {
                const tile = tiles[y][x];
                if (tile) {
                    if (tile.type === TILE_TYPES.WALL_WITH_ORE) {
                        oreCache.positions.push({ x, y, type: tile.type });
                    } else if (tile.type === TILE_TYPES.RARE_ORE || tile.type === TILE_TYPES.TREASURE_CHEST) {
                        oreCache.rarePositions.push({ x, y, type: tile.type });
                    }
                }
            }
        }
    }
    
    let nearestTarget = null;
    let minDistance = Infinity;
    
    const allTargets = [...oreCache.rarePositions, ...oreCache.positions];
    
    for (const target of allTargets) {
        if (targetTypes.includes(target.type)) {
            const tileKey = `${target.x},${target.y}`;
            if (visibleTiles.has(tileKey)) {
                const distance = Math.abs(target.x - position.x) + Math.abs(target.y - position.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestTarget = target;
                }
            }
        }
    }
    
    return nearestTarget;
}

// ---------------- Enhanced Map Generation ----------------
function generateTileType(channelId, x, y) {
    const mapSeed = createMapSeed(channelId, x, y);
    const random = seededRandom(mapSeed);
    
    if (random < 0.01) return TILE_TYPES.TREASURE_CHEST;
    if (random < 0.03) return TILE_TYPES.RARE_ORE;
    if (random < 0.05) return TILE_TYPES.HAZARD;
    if (random < 0.15) return TILE_TYPES.REINFORCED_WALL;
    if (random < BASE_ORE_SPAWN_CHANCE + 0.15) return TILE_TYPES.WALL_WITH_ORE;
    
    return TILE_TYPES.WALL;
}

function getTileHardness(tileType) {
    switch (tileType) {
        case TILE_TYPES.WALL: return 1;
        case TILE_TYPES.WALL_WITH_ORE: return 2;
        case TILE_TYPES.RARE_ORE: return 3;
        case TILE_TYPES.REINFORCED_WALL: return 4;
        case TILE_TYPES.TREASURE_CHEST: return 1;
        default: return 0;
    }
}

function initializeMap(channelId) {
    const map = [];
    
    for (let y = 0; y < INITIAL_MAP_HEIGHT; y++) {
        const row = [];
        for (let x = 0; x < INITIAL_MAP_WIDTH; x++) {
            const tileType = generateTileType(channelId, x, y);
            row.push({ 
                type: tileType, 
                discovered: false,
                hardness: getTileHardness(tileType)
            });
        }
        map.push(row);
    }
    
    // Create starting area
    const centerX = Math.floor(INITIAL_MAP_WIDTH / 2);
    const centerY = Math.floor(INITIAL_MAP_HEIGHT / 2);
    
    for (let y = centerY - 1; y <= centerY + 1; y++) {
        for (let x = centerX - 1; x <= centerX + 1; x++) {
            if (y >= 0 && y < INITIAL_MAP_HEIGHT && x >= 0 && x < INITIAL_MAP_WIDTH) {
                map[y][x] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
            }
        }
    }
    
    const entranceX = centerX;
    const entranceY = 0;
    map[entranceY][entranceX] = { type: TILE_TYPES.ENTRANCE, discovered: true, hardness: 0 };
    
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
    
    // Prevent infinite expansion
    if (width >= MAX_MAP_SIZE || height >= MAX_MAP_SIZE) {
        return mapData;
    }
    
    let newTiles, newWidth, newHeight;
    
    switch (direction) {
        case 'north':
            const newNorthRow = [];
            for (let x = 0; x < width; x++) {
                const tileType = generateTileType(channelId, x, -1);
                newNorthRow.push({ 
                    type: tileType, 
                    discovered: false,
                    hardness: getTileHardness(tileType)
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
                const tileType = generateTileType(channelId, x, height);
                newSouthRow.push({ 
                    type: tileType, 
                    discovered: false,
                    hardness: getTileHardness(tileType)
                });
            }
            newTiles.push(newSouthRow);
            newWidth = width;
            newHeight = height + 1;
            break;
            
        case 'east':
            newTiles = tiles.map((row, y) => {
                const tileType = generateTileType(channelId, width, y);
                return [...row, { 
                    type: tileType, 
                    discovered: false,
                    hardness: getTileHardness(tileType)
                }];
            });
            newWidth = width + 1;
            newHeight = height;
            break;
            
        case 'west':
            newTiles = tiles.map((row, y) => {
                const tileType = generateTileType(channelId, -1, y);
                return [{ 
                    type: tileType, 
                    discovered: false,
                    hardness: getTileHardness(tileType)
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
    
    oreCache.timestamp = 0;
    
    return {
        ...mapData,
        tiles: newTiles,
        width: newWidth,
        height: newHeight
    };
}

// ---------------- Enhanced Mining System ----------------
function pickWeightedItem(powerLevel, tileType = TILE_TYPES.WALL_WITH_ORE) {
    let itemPool = miningItemPool;
    
    if (tileType === TILE_TYPES.RARE_ORE) {
        itemPool = miningItemPool.filter(item => item.tier === 'epic' || item.tier === 'legendary');
    } else if (tileType === TILE_TYPES.TREASURE_CHEST) {
        if (Math.random() < 0.3) {
            const treasureItem = treasureItems[Math.floor(Math.random() * treasureItems.length)];
            return { ...treasureItem, itemId: treasureItem.itemId };
        }
        itemPool = miningItemPool.filter(item => item.tier === 'rare' || item.tier === 'epic');
    }
    
    const weightedItems = itemPool.map(item => {
        let weight = item.baseWeight;
        
        if (powerLevel === item.boostedPowerLevel) {
            weight *= 2;
        }
        
        switch (item.tier) {
            case 'legendary': weight *= 0.3; break;
            case 'epic': weight *= 0.6; break;
            case 'rare': weight *= 0.8; break;
        }
        
        return { ...item, weight };
    });
    
    const totalWeight = weightedItems.reduce((sum, i) => sum + i.weight, 0);
    let rand = Math.random() * totalWeight;
    return weightedItems.find(i => (rand -= i.weight) < 0) || weightedItems[0];
}

async function mineFromTile(member, miningPower, luckStat, powerLevel, tileType) {
    const item = pickWeightedItem(powerLevel, tileType);
    
    let quantity = 1;
    
    if (miningPower > 0) {
        const maxBonus = Math.min(miningPower, 4);
        quantity = 1 + Math.floor(Math.random() * maxBonus);
    }
    
    if (luckStat && luckStat > 0) {
        const bonusChance = Math.min(0.6, luckStat * 0.08);
        if (Math.random() < bonusChance) {
            quantity += Math.floor(1 + Math.random() * 3);
        }
    }
    
    if (tileType === TILE_TYPES.RARE_ORE) {
        quantity *= 2;
    } else if (tileType === TILE_TYPES.TREASURE_CHEST) {
        quantity = Math.max(quantity, 3);
    }
    
    return { item, quantity };
}

// ---------------- Enhanced Movement System ----------------
function getDirectionToTarget(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    
    if (Math.abs(dx) === Math.abs(dy) && Math.random() < 0.5) {
        return dy > 0 ? { dx: 0, dy: 1, name: 'south' } : { dx: 0, dy: -1, name: 'north' };
    }
    
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

async function canBreakTile(playerId, miningPower, tile) {
    if (!tile || !tile.hardness) return true;
    
    const hardness = tile.hardness;
    
    if (miningPower <= 0) {
        return Math.random() < 0.005;
    }
    
    const breakChance = Math.min(0.95, (miningPower / hardness) * 0.25);
    const seed = parseInt(playerId) + Date.now();
    return seededRandom(seed) < breakChance;
}

// ---------------- Enhanced Pickaxe System ----------------
function checkPickaxeBreak(pickaxe, tileHardness = 1) {
    if (!pickaxe || !pickaxe.durability) return false;
    
    const hardnessPenalty = tileHardness * 5;
    const adjustedDurability = Math.max(10, pickaxe.durability - hardnessPenalty);
    
    const roll = Math.floor(Math.random() * 100) + 1;
    return roll > adjustedDurability;
}

async function breakPickaxe(playerId, playerTag, pickaxe) {
    const inv = await PlayerInventory.findOne({ playerId });
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

// ---------------- Enhanced Database System ----------------
class DatabaseTransaction {
    constructor() {
        this.inventoryUpdates = new Map();
        this.mapUpdate = null;
        this.vcUpdates = {};
        this.pickaxeBreaks = [];
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
        
        if (this.pickaxeBreaks.length > 0) {
            const breakPromises = this.pickaxeBreaks.map(breakData => 
                breakPickaxe(breakData.playerId, breakData.playerTag, breakData.pickaxe)
            );
            promises.push(...breakPromises);
        }
        
        if (this.mapUpdate) {
            const mapPromise = gachaVC.updateOne(
                { channelId: this.mapUpdate.channelId },
                { $set: { 'gameData.map': this.mapUpdate.mapData } },
                { upsert: true }
            );
            promises.push(mapPromise);
        }
        
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
                items: {},
                contributors: {}
            },
            sessionStart: new Date(),
            breakCount: 0,
            stats: {
                totalOreFound: 0,
                wallsBroken: 0,
                treasuresFound: 0
            }
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
    
    if (!dbEntry.gameData.minecart) {
        dbEntry.gameData.minecart = { items: {}, contributors: {} };
        dbEntry.markModified('gameData');
    }
    
    if (!dbEntry.gameData.stats) {
        dbEntry.gameData.stats = {
            totalOreFound: 0,
            wallsBroken: 0,
            treasuresFound: 0
        };
        dbEntry.markModified('gameData');
    }
}

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

async function addItemToMinecart(dbEntry, playerId, itemId, amount) {
    const channelId = dbEntry.channelId;
    
    try {
        await gachaVC.updateOne(
            { channelId: channelId },
            {
                $inc: {
                    [`gameData.minecart.items.${itemId}.quantity`]: amount,
                    [`gameData.minecart.items.${itemId}.contributors.${playerId}`]: amount,
                    [`gameData.minecart.contributors.${playerId}`]: amount,
                    'gameData.stats.totalOreFound': amount
                }
            }
        );
    } catch (error) {
        const currentDoc = await gachaVC.findOne({ channelId: channelId });
        
        const existingItems = currentDoc?.gameData?.minecart?.items || {};
        const existingContributors = currentDoc?.gameData?.minecart?.contributors || {};
        const existingStats = currentDoc?.gameData?.stats || { totalOreFound: 0, wallsBroken: 0, treasuresFound: 0 };
        
        existingItems[itemId] = existingItems[itemId] || { quantity: 0, contributors: {} };
        existingItems[itemId].quantity = (existingItems[itemId].quantity || 0) + amount;
        existingItems[itemId].contributors[playerId] = (existingItems[itemId].contributors[playerId] || 0) + amount;
        existingContributors[playerId] = (existingContributors[playerId] || 0) + amount;
        existingStats.totalOreFound = (existingStats.totalOreFound || 0) + amount;
        
        await gachaVC.updateOne(
            { channelId: channelId },
            {
                $set: {
                    'gameData.minecart.items': existingItems,
                    'gameData.minecart.contributors': existingContributors,
                    'gameData.stats': existingStats
                }
            },
            { upsert: true }
        );
    }
}

// ---------------- Enhanced Event Log System ----------------
async function logEvent(channel, eventText, forceNew = false) {
    eventCounter++;
    const shouldGenerateImage = forceNew || (eventCounter % IMAGE_GENERATION_INTERVAL === 0);
    
    const result = await gachaVC.findOne({ channelId: channel.id });
    const now = new Date();
    const nextRefreshTime = result.nextShopRefresh;

    let diffMs = nextRefreshTime - now;
    if (diffMs < 0) diffMs = 0;

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const minecartSummary = getMinecartSummary(result);
    const sessionStats = result.gameData?.stats || { totalOreFound: 0, wallsBroken: 0, treasuresFound: 0 };

    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const logEntry = eventText ? `[${timestamp}] ${eventText}` : null;

    try {
        const messages = await channel.messages.fetch({ limit: 2 });
        let eventLogMessage = null;

        for (const [, message] of messages) {
            if (message.embeds.length > 0 && 
                message.embeds[0].title === '🗺️ MINING MAP' && 
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

        if (logEntry || shouldGenerateImage) {
            const embed = new EmbedBuilder()
                .setTitle('🗺️ MINING MAP')
                .setColor(0x8B4513)
                .setFooter({ 
                    text: `MINECART: ${minecartSummary.summary} | ORE: ${sessionStats.totalOreFound} | WALLS: ${sessionStats.wallsBroken} | NEXT BREAK: ${diffMinutes}m`
                })
                .setTimestamp();

            if (logEntry) {
                embed.setDescription('```\n' + logEntry + '\n```');
            }

            if (shouldGenerateImage) {
                //embed.setImage('attachment://mine_map.png');
            }

            if (eventLogMessage && forceNew === false) {
                const existingEmbed = eventLogMessage.embeds[0];
                let currentDescription = existingEmbed.description || '';
                currentDescription = currentDescription.replace(/^```\n?|```$/g, '');
                
                const lines = currentDescription.split('\n').filter(line => line.trim());
                if (logEntry) {
                    if (lines.length >= 12) lines.shift();
                    lines.push(logEntry);
                }

                const newDescription = lines.length > 0 ? '```\n' + lines.join('\n') + '\n```' : null;

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('🗺️ MINING MAP')
                    .setColor(0x8B4513)
                    .setFooter({ 
                        text: `MINECART: ${minecartSummary.summary} | ORE: ${sessionStats.totalOreFound} | WALLS: ${sessionStats.wallsBroken} | NEXT BREAK: ${diffMinutes}m`
                    })
                    .setTimestamp();

                if (newDescription) updatedEmbed.setDescription(newDescription);
                //if (shouldGenerateImage) updatedEmbed.setImage('attachment://mine_map.png');

                await eventLogMessage.edit({ embeds: [updatedEmbed], files: attachment ? [attachment] : [] });
                return;
            }

            const messageOptions = { embeds: [embed] };
            if (attachment) messageOptions.files = [attachment];

            await channel.send(messageOptions);
        }

    } catch (error) {
        console.error('Error updating mining map:', error);
        if (eventText) await channel.send(`\`${logEntry}\``);
    }
}

// ---------------- Enhanced Main Mining Event ----------------
module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();
    
    initializeGameData(dbEntry, channel.id);
    await dbEntry.save();

    if (!channel?.isVoiceBased()) return;
    const members = channel.members.filter(m => !m.user.bot);
    if (!members.size) return;

    // Cache all player stats
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

    // Calculate enhanced team sight radius
    let totalSight = 0;
    let playerCount = 0;
    for (const member of members.values()) {
        const playerData = playerStatsCache.get(member.id);
        totalSight += playerData.stats.sight || 0;
        playerCount++;
    }
    const teamSightRadius = Math.floor(totalSight / playerCount) + 1;

    // Calculate team visibility
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
    let wallsBroken = 0;
    let treasuresFound = 0;

    // Process actions for each player
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
            
            // Check for adjacent mineable tiles
            const adjacentPositions = [
                { x: position.x, y: position.y - 1 },
                { x: position.x + 1, y: position.y },
                { x: position.x, y: position.y + 1 },
                { x: position.x - 1, y: position.y }
            ];
            
            let adjacentTarget = null;
            for (const adj of adjacentPositions) {
                const tileY = Math.max(0, Math.min(adj.y, mapData.height - 1));
                const tileX = Math.max(0, Math.min(adj.x, mapData.width - 1));
                
                if (mapData.tiles[tileY] && mapData.tiles[tileY][tileX]) {
                    const tile = mapData.tiles[tileY][tileX];
                    if (tile && (tile.type === TILE_TYPES.WALL_WITH_ORE || 
                               tile.type === TILE_TYPES.RARE_ORE ||
                               tile.type === TILE_TYPES.TREASURE_CHEST)) {
                        adjacentTarget = { ...adj, tile };
                        break;
                    }
                }
            }
            
            // Enhanced mining logic
            if (adjacentTarget) {
                const tile = adjacentTarget.tile;
                if (await canBreakTile(member.id, miningPower, tile)) {
                    const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, tile.type);
                    
                    await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                    
                    const mineY = Math.max(0, Math.min(adjacentTarget.y, mapData.height - 1));
                    const mineX = Math.max(0, Math.min(adjacentTarget.x, mapData.width - 1));
                    
                    mapData.tiles[mineY][mineX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                    mapChanged = true;
                    wallsBroken++;
                    
                    // Special messaging for different tile types
                    let findMessage;
                    if (tile.type === TILE_TYPES.TREASURE_CHEST) {
                        findMessage = `🏆 ${member.displayName} discovered a treasure chest! Found ${item.name} x${quantity}!`;
                        treasuresFound++;
                    } else if (tile.type === TILE_TYPES.RARE_ORE) {
                        findMessage = `✨ ${member.displayName} struck rare ore! Found ${item.name} x${quantity}!`;
                    } else {
                        findMessage = `💎 ${member.displayName} found ${item.name} x${quantity}`;
                    }
                    
                    // Check for pickaxe break
                    if (bestPickaxe && checkPickaxeBreak(bestPickaxe, tile.hardness)) {
                        transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                        eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered!`);
                        eventLogs.push(findMessage);
                    } else {
                        eventLogs.push(findMessage);
                    }
                } else {
                    // Failed to break tile
                    if (miningPower <= 0) {
                        if (Math.random() < 0.001) {
                            const { item, quantity } = await mineFromTile(member, 1, luckStat, powerLevel, tile.type);
                            eventLogs.push(`🔥 ${member.displayName}'s determination broke through! Found ${item.name} x${quantity} with bare hands!`);
                            await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                            wallsBroken++;
                        } else {
                            eventLogs.push(`${member.displayName} tried to mine ${tile.type.replace('_', ' ')} but has no pickaxe`);
                        }
                    } else {
                        const tileTypeNames = {
                            [TILE_TYPES.WALL_WITH_ORE]: 'ore wall',
                            [TILE_TYPES.RARE_ORE]: 'rare ore vein',
                            [TILE_TYPES.TREASURE_CHEST]: 'treasure chest',
                            [TILE_TYPES.REINFORCED_WALL]: 'reinforced wall'
                        };
                        eventLogs.push(`${member.displayName} struck the ${tileTypeNames[tile.type] || 'wall'} but couldn't break through`);
                        
                        // Check for pickaxe break on failed attempt
                        if (bestPickaxe && checkPickaxeBreak(bestPickaxe, tile.hardness)) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered from the impact`);
                        }
                    }
                }
                continue;
            }
            
            // Enhanced pathfinding with target priorities
            const visibleTargets = [
                TILE_TYPES.TREASURE_CHEST,
                TILE_TYPES.RARE_ORE,
                TILE_TYPES.WALL_WITH_ORE
            ];
            
            const nearestTarget = findNearestTarget(position, teamVisibleTiles, mapData.tiles, visibleTargets);
            
            let direction;
            if (nearestTarget) {
                direction = getDirectionToTarget(position, nearestTarget);
            } else {
                const seed = createPlayerSeed(channel.id, member.id) + Math.floor(now / 30000) + actionNum;
                direction = getRandomDirection(seed);
            }
            
            if (direction.dx === 0 && direction.dy === 0) continue;
            
            const newX = position.x + direction.dx;
            const newY = position.y + direction.dy;
            
            // Enhanced map expansion with size limits
            let needsExpansion = false;
            let expansionDirection = '';
            
            if (newY < 0 && mapData.height < MAX_MAP_SIZE) {
                needsExpansion = true;
                expansionDirection = 'north';
            } else if (newX < 0 && mapData.width < MAX_MAP_SIZE) {
                needsExpansion = true;
                expansionDirection = 'west';
            } else if (newX >= mapData.width && mapData.width < MAX_MAP_SIZE) {
                needsExpansion = true;
                expansionDirection = 'east';
            } else if (newY >= mapData.height && mapData.height < MAX_MAP_SIZE) {
                needsExpansion = true;
                expansionDirection = 'south';
            }
            
            if (needsExpansion) {
                mapData = expandMap(mapData, expansionDirection, channel.id);
                mapChanged = true;
            }
            
            // Ensure we're within bounds after expansion
            const clampedX = Math.max(0, Math.min(newX, mapData.width - 1));
            const clampedY = Math.max(0, Math.min(newY, mapData.height - 1));
            
            const targetTile = mapData.tiles[clampedY] && mapData.tiles[clampedY][clampedX];
            if (!targetTile) continue;
            
            // Enhanced wall breaking
            if (targetTile.type === TILE_TYPES.WALL || 
                targetTile.type === TILE_TYPES.REINFORCED_WALL ||
                targetTile.type === TILE_TYPES.WALL_WITH_ORE ||
                targetTile.type === TILE_TYPES.RARE_ORE ||
                targetTile.type === TILE_TYPES.TREASURE_CHEST) {
                
                if (await canBreakTile(member.id, miningPower, targetTile)) {
                    // Special handling for different tile types
                    if (targetTile.type === TILE_TYPES.WALL_WITH_ORE ||
                        targetTile.type === TILE_TYPES.RARE_ORE ||
                        targetTile.type === TILE_TYPES.TREASURE_CHEST) {
                        
                        const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, targetTile.type);
                        await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                        
                        let findMessage;
                        if (targetTile.type === TILE_TYPES.TREASURE_CHEST) {
                            findMessage = `🏆 ${member.displayName} opened a treasure chest! Found ${item.name} x${quantity}!`;
                            treasuresFound++;
                        } else if (targetTile.type === TILE_TYPES.RARE_ORE) {
                            findMessage = `✨ ${member.displayName} mined rare ore! Found ${item.name} x${quantity}!`;
                        } else {
                            findMessage = `💎 ${member.displayName} found ${item.name} x${quantity}`;
                        }
                        
                        if (bestPickaxe && checkPickaxeBreak(bestPickaxe, targetTile.hardness)) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered!`);
                            eventLogs.push(findMessage);
                        } else {
                            eventLogs.push(findMessage);
                        }
                    }
                    
                    // Convert to floor and move player
                    mapData.tiles[clampedY][clampedX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                    position.x = clampedX;
                    position.y = clampedY;
                    mapChanged = true;
                    wallsBroken++;
                } else {
                    // Failed to break wall
                    if (miningPower <= 0) {
                        if (Math.random() < 0.001) {
                            eventLogs.push(`🔥 ${member.displayName} broke through with sheer willpower!`);
                            mapData.tiles[clampedY][clampedX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                            position.x = clampedX;
                            position.y = clampedY;
                            mapChanged = true;
                            wallsBroken++;
                        } else {
                            eventLogs.push(`${member.displayName} tried to break a ${targetTile.type.replace('_', ' ')} but has no pickaxe`);
                        }
                    } else {
                        const tileTypeNames = {
                            [TILE_TYPES.WALL]: 'wall',
                            [TILE_TYPES.REINFORCED_WALL]: 'reinforced wall',
                            [TILE_TYPES.WALL_WITH_ORE]: 'ore wall',
                            [TILE_TYPES.RARE_ORE]: 'rare ore vein'
                        };
                        eventLogs.push(`${member.displayName} struck the ${tileTypeNames[targetTile.type] || 'wall'} but it held firm`);
                        
                        if (bestPickaxe && checkPickaxeBreak(bestPickaxe, targetTile.hardness)) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered from the impact`);
                        }
                    }
                }
            } else if (targetTile.type === TILE_TYPES.HAZARD) {
                // Handle hazard tiles
                if (Math.random() < 0.7) {
                    eventLogs.push(`⚠️ ${member.displayName} avoided a dangerous hazard`);
                } else {
                    eventLogs.push(`💥 ${member.displayName} triggered a hazard and was knocked back!`);
                }
            } else {
                // Free movement on floor/entrance tiles
                position.x = clampedX;
                position.y = clampedY;
                mapChanged = true;
                
                // Enhanced exploration rewards
                if (Math.random() < EXPLORATION_BONUS_CHANCE) {
                    const bonusItem = pickWeightedItem(1, TILE_TYPES.WALL_WITH_ORE);
                    eventLogs.push(`🔍 ${member.displayName} found ${bonusItem.name} while exploring!`);
                    await addItemToMinecart(dbEntry, member.id, bonusItem.itemId, 1);
                }
            }
        }
    }

    // Update session statistics
    if (wallsBroken > 0 || treasuresFound > 0) {
        await gachaVC.updateOne(
            { channelId: channel.id },
            {
                $inc: {
                    'gameData.stats.wallsBroken': wallsBroken,
                    'gameData.stats.treasuresFound': treasuresFound
                }
            }
        );
    }

    // Handle shop breaks (teleport players to entrance)
    if (now > dbEntry.nextShopRefresh) {
        for (const member of members.values()) {
            mapData.playerPositions[member.id] = {
                x: mapData.entranceX,
                y: mapData.entranceY
            };
            mapChanged = true;
        }
    }

    // Commit all database changes
    if (mapChanged) {
        transaction.setMapUpdate(channel.id, mapData);
    }
    await transaction.commit();

    // Enhanced event logging
    if (eventLogs.length > 0) {
        const combinedEvents = eventLogs.join(' | ');
        await logEvent(channel, combinedEvents);
    } else {
        await logEvent(channel, '');
    }

    // Handle shop breaks with enhanced summary
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
        await logEvent(channel, '🛒 Shop break! Mining resuming in 5 minutes!', true);
        await generateShop(channel, 5);
    }
};

// ---------------- Enhanced Mining Summary System ----------------
async function createMiningSummary(channel, dbEntry) {
    const gameData = dbEntry.gameData;
    if (!gameData || gameData.gamemode !== 'mining') return;

    const minecart = gameData.minecart;
    const sessionStats = gameData.stats || { totalOreFound: 0, wallsBroken: 0, treasuresFound: 0 };
    
    if (!minecart || !minecart.items) {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription('The minecart is empty. No items to sell! Shop is now available!')
            .addFields({
                name: '📊 Session Statistics',
                value: `Walls Broken: ${sessionStats.wallsBroken}\nTreasures Found: ${sessionStats.treasuresFound}`,
                inline: true
            })
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    // Enhanced value calculation with bonuses
    let totalValue = 0;
    let totalItems = 0;
    const itemBreakdown = [];
    const contributorRewards = {};
    const tierCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };

    // Process each item type in the minecart
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        const poolItem = miningItemPool.find(item => item.itemId === itemId) || 
                        treasureItems.find(item => item.itemId === itemId);
        
        if (!poolItem || itemData.quantity <= 0) continue;

        const itemTotalValue = poolItem.value * itemData.quantity;
        totalValue += itemTotalValue;
        totalItems += itemData.quantity;
        
        // Track tier distribution
        if (poolItem.tier) {
            tierCounts[poolItem.tier] += itemData.quantity;
        }
        
        itemBreakdown.push(`${poolItem.name} x${itemData.quantity} = ${itemTotalValue} coins`);

        // Calculate fair contributor rewards
        const contributorCount = Object.keys(itemData.contributors || {}).length;
        if (contributorCount > 0) {
            for (const [playerId, contributed] of Object.entries(itemData.contributors)) {
                if (!contributorRewards[playerId]) {
                    contributorRewards[playerId] = { coins: 0, items: [], contribution: 0 };
                }
                
                const contributorShare = Math.floor((contributed / itemData.quantity) * itemTotalValue);
                contributorRewards[playerId].coins += contributorShare;
                contributorRewards[playerId].items.push(`${poolItem.name} x${contributed}`);
                contributorRewards[playerId].contribution += contributed;
            }
        }
    }

    if (totalItems === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Mining Session Complete')
            .setDescription('The minecart is empty. No items to sell! Shop is now available!')
            .addFields({
                name: '📊 Session Statistics',
                value: `Walls Broken: ${sessionStats.wallsBroken}\nTreasures Found: ${sessionStats.treasuresFound}`,
                inline: true
            })
            .setColor(0x8B4513)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        return;
    }

    // Apply team bonuses
    const teamBonus = Math.floor(totalValue * 0.1); // 10% team bonus
    const finalValue = totalValue + teamBonus;

    // Reward contributors with enhanced error handling
    const contributorLines = [];
    for (const [playerId, reward] of Object.entries(contributorRewards)) {
        try {
            const member = await channel.guild.members.fetch(playerId);
            
            let userCurrency = await Currency.findOne({ userId: playerId });
            
            if (!userCurrency) {
                userCurrency = await Currency.create({
                    userId: playerId,
                    usertag: member.user.tag,
                    money: reward.coins
                });
            } else {
                userCurrency.money = (userCurrency.money || 0) + reward.coins;
                await userCurrency.save();
            }
            
            contributorLines.push(`${member.displayName}: ${reward.contribution} items → ${reward.coins} coins`);
        } catch (error) {
            console.error(`Error rewarding player ${playerId}:`, error);
        }
    }

    // Create enhanced summary embed
    const tierSummary = Object.entries(tierCounts)
        .filter(([, count]) => count > 0)
        .map(([tier, count]) => `${tier}: ${count}`)
        .join(' | ');

    const embed = new EmbedBuilder()
        .setTitle('🛒 Mining Session Complete')
        .setDescription(`The minecart has been sold to the shop!\n\n**Total Value:** ${finalValue} coins (${totalValue} + ${teamBonus} team bonus)`)
        .addFields(
            {
                name: '📦 Items Sold',
                value: itemBreakdown.slice(0, 10).join('\n') + (itemBreakdown.length > 10 ? '\n...and more!' : ''),
                inline: false
            },
            {
                name: '👥 Contributors & Rewards',
                value: contributorLines.slice(0, 8).join('\n') || 'None',
                inline: false
            },
            {
                name: '📊 Session Statistics',
                value: `Ore Found: ${sessionStats.totalOreFound}\nWalls Broken: ${sessionStats.wallsBroken}\nTreasures Found: ${sessionStats.treasuresFound}`,
                inline: true
            },
            {
                name: '🏆 Item Tiers',
                value: tierSummary || 'No items found',
                inline: true
            }
        )
        .setColor(0xFFD700)
        .setTimestamp();

    await channel.send({ embeds: [embed] });
    await resetMinecart(channel.id);
}

// Enhanced minecart summary function
function getMinecartSummary(dbEntry) {
    const minecart = dbEntry.gameData?.minecart;
    if (!minecart || !minecart.items) return { totalValue: 0, itemCount: 0, summary: "Empty" };
    
    let totalValue = 0;
    let totalItems = 0;
    const itemSummaries = [];
    
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        const poolItem = miningItemPool.find(item => item.itemId === itemId) ||
                        treasureItems.find(item => item.itemId === itemId);
        
        if (poolItem && itemData.quantity > 0) {
            const itemValue = poolItem.value * itemData.quantity;
            totalValue += itemValue;
            totalItems += itemData.quantity;
            
            // Show only top 3 items in summary to keep it concise
            if (itemSummaries.length < 3) {
                itemSummaries.push(`${poolItem.name} x${itemData.quantity}`);
            }
        }
    }
    
    let summary;
    if (itemSummaries.length === 0) {
        summary = "Empty";
    } else {
        summary = itemSummaries.join(', ');
        if (Object.keys(minecart.items).length > 3) {
            summary += `, +${Object.keys(minecart.items).length - 3} more`;
        }
    }
    
    return {
        totalValue,
        itemCount: totalItems,
        summary
    };
}

// Export the main function and utility functions for testing
module.exports.pickWeightedItem = pickWeightedItem;
module.exports.calculateTeamVisibility = calculateTeamVisibility;
module.exports.getMinecartSummary = getMinecartSummary;
module.exports.TILE_TYPES = TILE_TYPES;
module.exports.miningItemPool = miningItemPool;
module.exports.treasureItems = treasureItems;
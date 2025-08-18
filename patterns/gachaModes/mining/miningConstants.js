// miningConstants.js - Constants and configuration for mining
const INITIAL_MAP_WIDTH = 9;
const INITIAL_MAP_HEIGHT = 7;
const BASE_ORE_SPAWN_CHANCE = 0.3;
const RARE_ORE_SPAWN_CHANCE = 0.05;
const IMAGE_GENERATION_INTERVAL = 1;
const MAX_SPEED_ACTIONS = 4;
const MAX_MAP_SIZE = 50;
const EXPLORATION_BONUS_CHANCE = 0.02;

// Enhanced tile types
const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor', 
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore',
    RARE_ORE: 'rare_ore',
    TREASURE_CHEST: 'treasure',
    HAZARD: 'hazard',
    REINFORCED_WALL: 'reinforced'
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

module.exports = {
    INITIAL_MAP_WIDTH,
    INITIAL_MAP_HEIGHT,
    BASE_ORE_SPAWN_CHANCE,
    RARE_ORE_SPAWN_CHANCE,
    IMAGE_GENERATION_INTERVAL,
    MAX_SPEED_ACTIONS,
    MAX_MAP_SIZE,
    EXPLORATION_BONUS_CHANCE,
    TILE_TYPES,
    miningItemPool,
    treasureItems
};

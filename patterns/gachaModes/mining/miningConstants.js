// miningConstants.js - Rebalanced for slower progression
const INITIAL_MAP_WIDTH = 3;
const INITIAL_MAP_HEIGHT = 3;
const BASE_ORE_SPAWN_CHANCE = 0.25; // Reduced from 0.3
const RARE_ORE_SPAWN_CHANCE = 0.02; // Reduced from 0.05
const IMAGE_GENERATION_INTERVAL = 1;
const MAX_SPEED_ACTIONS = 50; // Reduced from 4
const MAX_MAP_SIZE = 1000;
const EXPLORATION_BONUS_CHANCE = 0.03; // Reduced from 0.02

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

// Rebalanced mining item pool - significantly reduced values
const miningItemPool = [
    // Common tier - Very low value
    { itemId: "1", name: "Coal Ore", baseWeight: 60, boostedPowerLevel: 1, value: 1, tier: 'common' },
    { itemId: "21", name: "Copper Ore", baseWeight: 40, boostedPowerLevel: 1, value: 2, tier: 'common' },
    
    // Uncommon tier - Low value
    { itemId: "22", name: "Iron Ore", baseWeight: 30, boostedPowerLevel: 2, value: 4, tier: 'uncommon' },
    { itemId: "2", name: "Topaz Gem", baseWeight: 25, boostedPowerLevel: 2, value: 6, tier: 'uncommon' },
    
    // Rare tier - Moderate value
    { itemId: "23", name: "Emerald Gem", baseWeight: 15, boostedPowerLevel: 3, value: 12, tier: 'rare' },
    { itemId: "24", name: "Ruby Gem", baseWeight: 12, boostedPowerLevel: 3, value: 18, tier: 'rare' },
    
    // Epic tier - Higher value but still reasonable
    { itemId: "6", name: "Diamond Gem", baseWeight: 6, boostedPowerLevel: 4, value: 25, tier: 'epic' },
    { itemId: "25", name: "Obsidian", baseWeight: 4, boostedPowerLevel: 5, value: 35, tier: 'epic' },
    
    // Legendary tier - High value but not excessive
    { itemId: "26", name: "Mythril Ore", baseWeight: 2, boostedPowerLevel: 6, value: 50, tier: 'legendary' },
    { itemId: "27", name: "Adamantite", baseWeight: 1, boostedPowerLevel: 7, value: 75, tier: 'legendary' }
];

// Rebalanced treasure items - reduced values
const treasureItems = [
    { itemId: "101", name: "Ancient Coin", value: 15, description: "A mysterious coin from ages past" },
    { itemId: "102", name: "Crystal Shard", value: 25, description: "Radiates with inner light" },
    { itemId: "103", name: "Rare Fossil", value: 40, description: "Evidence of prehistoric life" }
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

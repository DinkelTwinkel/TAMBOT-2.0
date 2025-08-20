// Enhanced Mining Constants with Power Level System
const INITIAL_MAP_WIDTH = 3;
const INITIAL_MAP_HEIGHT = 3;
const BASE_ORE_SPAWN_CHANCE = 0.25;
const RARE_ORE_SPAWN_CHANCE = 0.02;
const IMAGE_GENERATION_INTERVAL = 1;
const MAX_SPEED_ACTIONS = 5;
const MAX_MAP_SIZE = 1000;
const EXPLORATION_BONUS_CHANCE = 0.03;

// Power Level Configurations
const POWER_LEVEL_CONFIG = {
    1: {
        name: "Novice Expedition",
        description: "Basic mining efficiency",
        oreSpawnMultiplier: 1.0,
        rareOreBonus: 0.0,
        treasureChance: 0.01,
        speedBonus: 1.0,
        valueMultiplier: 1.0
    },
    2: {
        name: "Apprentice Expedition", 
        description: "Improved ore detection",
        oreSpawnMultiplier: 1.2,
        rareOreBonus: 0.005,
        treasureChance: 0.015,
        speedBonus: 1.1,
        valueMultiplier: 1.2
    },
    3: {
        name: "Skilled Expedition",
        description: "Enhanced mining techniques",
        oreSpawnMultiplier: 1.4,
        rareOreBonus: 0.01,
        treasureChance: 0.02,
        speedBonus: 1.2,
        valueMultiplier: 1.5
    },
    4: {
        name: "Expert Expedition",
        description: "Advanced geological knowledge",
        oreSpawnMultiplier: 1.6,
        rareOreBonus: 0.02,
        treasureChance: 0.03,
        speedBonus: 1.3,
        valueMultiplier: 1.8
    },
    5: {
        name: "Master Expedition",
        description: "Volcanic mining specialization", 
        oreSpawnMultiplier: 1.8,
        rareOreBonus: 0.03,
        treasureChance: 0.04,
        speedBonus: 1.4,
        valueMultiplier: 2.2
    },
    6: {
        name: "Legendary Expedition",
        description: "Mythical ore sensitivity",
        oreSpawnMultiplier: 2.0,
        rareOreBonus: 0.05,
        treasureChance: 0.06,
        speedBonus: 1.6,
        valueMultiplier: 2.8
    },
    7: {
        name: "Abyssal Expedition",
        description: "Master of the deepest depths",
        oreSpawnMultiplier: 2.5,
        rareOreBonus: 0.08,
        treasureChance: 0.1,
        speedBonus: 2.0,
        valueMultiplier: 3.5
    }
};

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

// Enhanced mining item pool with power level assignments
const miningItemPool = [
    // Power Level 1 - Common tier
    { 
        itemId: "1", 
        name: "Coal Ore", 
        baseWeight: 60, 
        boostedPowerLevel: 1, 
        value: 1, 
        tier: 'common',
        powerRequirement: 1,
        description: "Basic fuel source found in shallow mines"
    },
    { 
        itemId: "21", 
        name: "Copper Ore", 
        baseWeight: 40, 
        boostedPowerLevel: 1, 
        value: 2, 
        tier: 'common',
        powerRequirement: 1,
        description: "Malleable metal essential for tools and wiring"
    },
    
    // Power Level 2 - Uncommon tier
    { 
        itemId: "22", 
        name: "Iron Ore", 
        baseWeight: 30, 
        boostedPowerLevel: 2, 
        value: 4, 
        tier: 'uncommon',
        powerRequirement: 2,
        description: "Strong metal forming the backbone of civilization"
    },
    { 
        itemId: "2", 
        name: "Topaz Gem", 
        baseWeight: 25, 
        boostedPowerLevel: 2, 
        value: 6, 
        tier: 'uncommon',
        powerRequirement: 2,
        description: "Golden crystalline gem prized for its clarity"
    },
    
    // Power Level 3 - Rare tier
    { 
        itemId: "23", 
        name: "Emerald Gem", 
        baseWeight: 15, 
        boostedPowerLevel: 3, 
        value: 12, 
        tier: 'rare',
        powerRequirement: 3,
        description: "Mystical green stone pulsing with natural energy"
    },
    { 
        itemId: "24", 
        name: "Ruby Gem", 
        baseWeight: 12, 
        boostedPowerLevel: 3, 
        value: 18, 
        tier: 'rare',
        powerRequirement: 3,
        description: "Fiery red crystal forged in volcanic depths"
    },
    
    // Power Level 4 - Epic tier
    { 
        itemId: "6", 
        name: "Diamond Gem", 
        baseWeight: 6, 
        boostedPowerLevel: 4, 
        value: 25, 
        tier: 'epic',
        powerRequirement: 4,
        description: "Perfect crystalline carbon, hardest natural substance"
    },
    
    // Power Level 5 - Epic tier (Advanced)
    { 
        itemId: "25", 
        name: "Obsidian", 
        baseWeight: 4, 
        boostedPowerLevel: 5, 
        value: 35, 
        tier: 'epic',
        powerRequirement: 5,
        description: "Volcanic glass sharper than any blade"
    },
    
    // Power Level 6 - Legendary tier
    { 
        itemId: "26", 
        name: "Mythril Ore", 
        baseWeight: 2, 
        boostedPowerLevel: 6, 
        value: 50, 
        tier: 'legendary',
        powerRequirement: 6,
        description: "Sacred metal blessed by ancient gods"
    },
    
    // Power Level 7 - Legendary tier (Ultimate)
    { 
        itemId: "27", 
        name: "Adamantite", 
        baseWeight: 1, 
        boostedPowerLevel: 7, 
        value: 75, 
        tier: 'legendary',
        powerRequirement: 7,
        description: "Unbreakable metal from the deepest abyss"
    }
];

// Power level specific treasure items
const treasureItems = [
    // Power Level 1-2 Treasures
    { 
        itemId: "101", 
        name: "Ancient Coin", 
        value: 15, 
        powerRequirement: 1,
        description: "A mysterious coin from ages past" 
    },
    
    // Power Level 3-4 Treasures
    { 
        itemId: "102", 
        name: "Crystal Shard", 
        value: 25, 
        powerRequirement: 3,
        description: "Radiates with inner light and magical energy" 
    },
    
    // Power Level 5-6 Treasures
    { 
        itemId: "103", 
        name: "Rare Fossil", 
        value: 40, 
        powerRequirement: 5,
        description: "Evidence of prehistoric life from another age" 
    },
    
    // Power Level 7 Treasures
    { 
        itemId: "104", 
        name: "Abyssal Relic", 
        value: 100, 
        powerRequirement: 7,
        description: "Ancient artifact from the planet's core" 
    }
];

// Power level modifiers for different gacha servers
const SERVER_POWER_MODIFIERS = {
    "coalMines": {
        powerLevel: 1,
        specialBonus: "Double coal ore spawn rate",
        itemBonuses: { "1": 2.0 } // Double coal ore value
    },
    "copperQuarry": {
        powerLevel: 1, 
        specialBonus: "Enhanced copper detection",
        itemBonuses: { "21": 1.5 }
    },
    "topazMine": {
        powerLevel: 2,
        specialBonus: "Topaz gem quality enhancement", 
        itemBonuses: { "2": 1.8 }
    },
    "ironStronghold": {
        powerLevel: 2,
        specialBonus: "Iron ore purity bonus",
        itemBonuses: { "22": 1.6 }
    },
    "diamondMines": {
        powerLevel: 3,
        specialBonus: "Diamond clarity enhancement",
        itemBonuses: { "6": 2.0 }
    },
    "emeraldCaverns": {
        powerLevel: 3,
        specialBonus: "Natural energy amplification",
        itemBonuses: { "23": 1.7 }
    },
    "rubyDepths": {
        powerLevel: 4,
        specialBonus: "Volcanic heat forge bonus",
        itemBonuses: { "24": 1.9 }
    },
    "crystalGrottos": {
        powerLevel: 4,
        specialBonus: "Crystal resonance multiplier",
        itemBonuses: { "102": 2.5 }
    },
    "obsidianForge": {
        powerLevel: 5,
        specialBonus: "Volcanic glass perfection",
        itemBonuses: { "25": 2.2 }
    },
    "mythrilSanctum": {
        powerLevel: 6,
        specialBonus: "Divine blessing enhancement",
        itemBonuses: { "26": 2.8 }
    },
    "adamantiteAbyss": {
        powerLevel: 7,
        specialBonus: "Abyssal depth mastery",
        itemBonuses: { "27": 3.5 }
    }
};

// Function to calculate mining efficiency based on power level
function calculateMiningEfficiency(serverPowerLevel, playerLevel = 1) {
    const config = POWER_LEVEL_CONFIG[serverPowerLevel];
    const levelBonus = Math.floor(playerLevel / 10) * 0.1; // 10% bonus per 10 levels
    
    return {
        oreSpawnChance: BASE_ORE_SPAWN_CHANCE * config.oreSpawnMultiplier * (1 + levelBonus),
        rareOreChance: RARE_ORE_SPAWN_CHANCE + config.rareOreBonus,
        treasureChance: config.treasureChance,
        speedMultiplier: config.speedBonus,
        valueMultiplier: config.valueMultiplier * (1 + levelBonus)
    };
}

// Function to get available items based on power level
function getAvailableItems(powerLevel) {
    return miningItemPool.filter(item => item.powerRequirement <= powerLevel);
}

// Function to get available treasures based on power level  
function getAvailableTreasures(powerLevel) {
    return treasureItems.filter(treasure => treasure.powerRequirement <= powerLevel);
}

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
    treasureItems,
    POWER_LEVEL_CONFIG,
    SERVER_POWER_MODIFIERS,
    calculateMiningEfficiency,
    getAvailableItems,
    getAvailableTreasures
};
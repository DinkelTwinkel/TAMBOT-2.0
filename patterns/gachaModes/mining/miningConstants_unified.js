// Enhanced Mining Constants with Unified Item Finding System
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
    TREASURE_CHEST: 'treasure_chest',
    REINFORCED_WALL: 'reinforced'
};

// Encounter Types (hazards and treasures)
const ENCOUNTER_TYPES = {
    PORTAL_TRAP: 'portal_trap',
    BOMB_TRAP: 'bomb_trap',
    GREEN_FOG: 'green_fog',
    WALL_TRAP: 'wall_trap',
    TREASURE: 'treasure',
    RARE_TREASURE: 'rare_treasure'
};

// Keep legacy HAZARD_TYPES for backward compatibility
const HAZARD_TYPES = {
    PORTAL_TRAP: 'portal_trap',
    BOMB_TRAP: 'bomb_trap',
    GREEN_FOG: 'green_fog',
    WALL_TRAP: 'wall_trap'
};

// Encounter Configurations (includes hazards and treasures)
const ENCOUNTER_CONFIG = {
    [ENCOUNTER_TYPES.PORTAL_TRAP]: {
        name: 'Portal Trap',
        symbol: '⊕',
        color: '#9932CC',
        image: 'portal_trap',
        description: 'Teleports to random location',
        powerRequirement: 1,
        weight: 30,
        isHazard: true
    },
    [ENCOUNTER_TYPES.BOMB_TRAP]: {
        name: 'Bomb Trap',
        symbol: '💣',
        color: '#FF4500',
        image: 'bomb_trap',
        description: 'Explodes surrounding walls, knocks out player for 5 minutes',
        powerRequirement: 2,
        weight: 25,
        blastRadius: 2,
        knockoutDuration: 5 * 60 * 1000,
        isHazard: true
    },
    [ENCOUNTER_TYPES.GREEN_FOG]: {
        name: 'Toxic Fog',
        symbol: '☁',
        color: '#00FF00',
        image: 'toxic_fog',
        description: 'Damages equipment durability',
        powerRequirement: 3,
        weight: 20,
        durabilityDamage: 1,
        isHazard: true
    },
    [ENCOUNTER_TYPES.WALL_TRAP]: {
        name: 'Wall Trap',
        symbol: '▦',
        color: '#8B4513',
        image: 'wall_trap',
        description: 'Converts floors to walls',
        powerRequirement: 4,
        weight: 15,
        isHazard: true
    },
    [ENCOUNTER_TYPES.TREASURE]: {
        name: 'Treasure Chest',
        symbol: '💰',
        color: '#FFD700',
        image: 'treasure_chest',
        description: 'Contains valuable items and resources',
        powerRequirement: 1,
        weight: 20,
        isHazard: false,
        minItems: 1,
        maxItems: 3
    },
    [ENCOUNTER_TYPES.RARE_TREASURE]: {
        name: 'Rare Treasure',
        symbol: '👑',
        color: '#B8860B',
        image: 'rare_treasure',
        description: 'Contains rare and epic items',
        powerRequirement: 3,
        weight: 5,
        isHazard: false,
        minItems: 2,
        maxItems: 5
    }
};

// Keep legacy HAZARD_CONFIG for backward compatibility
const HAZARD_CONFIG = {
    [HAZARD_TYPES.PORTAL_TRAP]: ENCOUNTER_CONFIG[ENCOUNTER_TYPES.PORTAL_TRAP],
    [HAZARD_TYPES.BOMB_TRAP]: ENCOUNTER_CONFIG[ENCOUNTER_TYPES.BOMB_TRAP],
    [HAZARD_TYPES.GREEN_FOG]: ENCOUNTER_CONFIG[ENCOUNTER_TYPES.GREEN_FOG],
    [HAZARD_TYPES.WALL_TRAP]: ENCOUNTER_CONFIG[ENCOUNTER_TYPES.WALL_TRAP]
};

// Power level encounter spawn configurations
const ENCOUNTER_SPAWN_CONFIG = {
    1: { 
        spawnChance: 0.02, 
        availableTypes: [ENCOUNTER_TYPES.PORTAL_TRAP, ENCOUNTER_TYPES.TREASURE] 
    },
    2: { 
        spawnChance: 0.025, 
        availableTypes: [ENCOUNTER_TYPES.PORTAL_TRAP, ENCOUNTER_TYPES.BOMB_TRAP, ENCOUNTER_TYPES.TREASURE] 
    },
    3: { 
        spawnChance: 0.03, 
        availableTypes: [ENCOUNTER_TYPES.PORTAL_TRAP, ENCOUNTER_TYPES.BOMB_TRAP, ENCOUNTER_TYPES.GREEN_FOG, ENCOUNTER_TYPES.TREASURE, ENCOUNTER_TYPES.RARE_TREASURE] 
    },
    4: { 
        spawnChance: 0.035, 
        availableTypes: [ENCOUNTER_TYPES.PORTAL_TRAP, ENCOUNTER_TYPES.BOMB_TRAP, ENCOUNTER_TYPES.GREEN_FOG, ENCOUNTER_TYPES.WALL_TRAP, ENCOUNTER_TYPES.TREASURE, ENCOUNTER_TYPES.RARE_TREASURE] 
    },
    5: { 
        spawnChance: 0.04, 
        availableTypes: Object.values(ENCOUNTER_TYPES) 
    },
    6: { 
        spawnChance: 0.045, 
        availableTypes: Object.values(ENCOUNTER_TYPES) 
    },
    7: { 
        spawnChance: 0.05, 
        availableTypes: Object.values(ENCOUNTER_TYPES) 
    }
};

// Keep legacy HAZARD_SPAWN_CONFIG for backward compatibility
const HAZARD_SPAWN_CONFIG = {
    1: { spawnChance: 0.01, availableTypes: [HAZARD_TYPES.PORTAL_TRAP] },
    2: { spawnChance: 0.015, availableTypes: [HAZARD_TYPES.PORTAL_TRAP, HAZARD_TYPES.BOMB_TRAP] },
    3: { spawnChance: 0.02, availableTypes: [HAZARD_TYPES.PORTAL_TRAP, HAZARD_TYPES.BOMB_TRAP, HAZARD_TYPES.GREEN_FOG] },
    4: { spawnChance: 0.025, availableTypes: [HAZARD_TYPES.PORTAL_TRAP, HAZARD_TYPES.BOMB_TRAP, HAZARD_TYPES.GREEN_FOG, HAZARD_TYPES.WALL_TRAP] },
    5: { spawnChance: 0.03, availableTypes: Object.values(HAZARD_TYPES) },
    6: { spawnChance: 0.035, availableTypes: Object.values(HAZARD_TYPES) },
    7: { spawnChance: 0.04, availableTypes: Object.values(HAZARD_TYPES) }
};

// ==========================================
// UNIFIED ITEM FINDING SYSTEM
// ==========================================

// Item categories for finding
const ITEM_CATEGORY = {
    ORE: 'ore',           // Mining loot (coal, copper, etc.)
    EQUIPMENT: 'equipment', // Tools, charms, gear
    CONSUMABLE: 'consumable', // Temporary boosts
    UNIQUE: 'unique'      // Unique legendary items
};

// Context multipliers for different activities
const CONTEXT_MULTIPLIERS = {
    mining_wall: {
        [ITEM_CATEGORY.ORE]: 3.0,        // 3x chance for ores when mining
        [ITEM_CATEGORY.EQUIPMENT]: 0.5,   // 0.5x chance for equipment
        [ITEM_CATEGORY.CONSUMABLE]: 0.3,  // 0.3x chance for consumables
        [ITEM_CATEGORY.UNIQUE]: 0.5       // 0.5x chance for uniques
    },
    treasure_chest: {
        [ITEM_CATEGORY.ORE]: 1.5,        // 1.5x chance for ores
        [ITEM_CATEGORY.EQUIPMENT]: 3.0,   // 3x chance for equipment
        [ITEM_CATEGORY.CONSUMABLE]: 2.0,  // 2x chance for consumables
        [ITEM_CATEGORY.UNIQUE]: 3.0       // 3x chance for uniques in treasures
    },
    rare_ore: {
        [ITEM_CATEGORY.ORE]: 5.0,        // 5x chance for ores from rare ore
        [ITEM_CATEGORY.EQUIPMENT]: 0.2,   // 0.2x chance for equipment
        [ITEM_CATEGORY.CONSUMABLE]: 0.1,  // 0.1x chance for consumables
        [ITEM_CATEGORY.UNIQUE]: 1.0       // Normal chance for uniques
    },
    exploration: {
        [ITEM_CATEGORY.ORE]: 0.5,        // 0.5x chance for ores
        [ITEM_CATEGORY.EQUIPMENT]: 1.0,   // 1x chance for equipment
        [ITEM_CATEGORY.CONSUMABLE]: 2.0,  // 2x chance for consumables
        [ITEM_CATEGORY.UNIQUE]: 0.8       // 0.8x chance for uniques
    },
    hazard: {
        [ITEM_CATEGORY.ORE]: 0.8,        // 0.8x chance for ores
        [ITEM_CATEGORY.EQUIPMENT]: 1.5,   // 1.5x chance for equipment
        [ITEM_CATEGORY.CONSUMABLE]: 1.5,  // 1.5x chance for consumables
        [ITEM_CATEGORY.UNIQUE]: 2.0       // 2x chance for uniques from hazards
    }
};

// Complete item pool from itemSheet.json
const UNIFIED_ITEM_POOL = {
    // Mining Ores and Gems
    ores: [
        { 
            itemId: "1", 
            name: "Coal Ore", 
            value: 2,
            baseWeight: 100,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 3,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "21", 
            name: "Copper Ore", 
            value: 8,
            baseWeight: 80,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 4,
            category: ITEM_CATEGORY.ORE
        },
        { 
        itemId: "22", 
        name: "Iron Ore", 
        value: 15,
        baseWeight: 60,
        tier: 'uncommon',
        minPowerLevel: 2,
        maxPowerLevel: 5,
        category: ITEM_CATEGORY.ORE
        },
    { 
        itemId: "103", 
        name: "Ancient Fossil", 
        value: 20,
        baseWeight: 40,
        tier: 'uncommon',
        minPowerLevel: 2,
        maxPowerLevel: 5,
        category: ITEM_CATEGORY.ORE
    },
        { 
            itemId: "2", 
            name: "Topaz", 
            value: 25,
            baseWeight: 40,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 6,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "23", 
            name: "Emerald", 
            value: 50,
            baseWeight: 25,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.ORE
        },
        { 
        itemId: "24", 
        name: "Ruby", 
        value: 75,
        baseWeight: 20,
        tier: 'rare',
        minPowerLevel: 3,
        maxPowerLevel: 7,
        category: ITEM_CATEGORY.ORE
        },
    { 
        itemId: "102", 
        name: "Crystal Ore", 
        value: 65,
        baseWeight: 22,
        tier: 'rare',
        minPowerLevel: 3,
        maxPowerLevel: 7,
        category: ITEM_CATEGORY.ORE
    },
        { 
            itemId: "6", 
            name: "Diamond", 
            value: 100,
            baseWeight: 10,
            tier: 'epic',
            minPowerLevel: 4,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "25", 
            name: "Obsidian", 
            value: 150,
            baseWeight: 6,
            tier: 'epic',
            minPowerLevel: 5,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "26", 
            name: "Mythril Ore", 
            value: 200,
            baseWeight: 3,
            tier: 'legendary',
            minPowerLevel: 6,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "27", 
            name: "Adamantite Ore", 
            value: 300,
            baseWeight: 1,
            tier: 'legendary',
            minPowerLevel: 7,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.ORE
        }
    ],
    
    // Equipment (Pickaxes, Gear, Charms)
    equipment: [
        // Pickaxes
        { 
            itemId: "3", 
            name: "Rusty Pick Axe", 
            value: 5,
            baseWeight: 50,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 2,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "13", 
            name: "Banana Axe", 
            value: 15,
            baseWeight: 30,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 3,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "7", 
            name: "Worn Iron Pickaxe", 
            value: 120,
            baseWeight: 25,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 4,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "8", 
            name: "Robust Pickaxe", 
            value: 300,
            baseWeight: 20,
            tier: 'uncommon',
            minPowerLevel: 3,
            maxPowerLevel: 5,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "17", 
            name: "Pixter", 
            value: 500,
            baseWeight: 15,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 6,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "18", 
            name: "Robust Pickaxe+", 
            value: 750,
            baseWeight: 12,
            tier: 'rare',
            minPowerLevel: 4,
            maxPowerLevel: 6,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "20", 
            name: "Nature's Pickaxe", 
            value: 2000,
            baseWeight: 8,
            tier: 'epic',
            minPowerLevel: 4,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "14", 
            name: "Haunted Pickaxe", 
            value: 1200,
            baseWeight: 10,
            tier: 'rare',
            minPowerLevel: 4,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "16", 
            name: "Pinkgem Axe", 
            value: 2000,
            baseWeight: 6,
            tier: 'epic',
            minPowerLevel: 5,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "15", 
            name: "Hypickeon", 
            value: 5000,
            baseWeight: 4,
            tier: 'epic',
            minPowerLevel: 5,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "19", 
            name: "Murderous Aura Pickaxe", 
            value: 8000,
            baseWeight: 3,
            tier: 'legendary',
            minPowerLevel: 6,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "9", 
            name: "Enchanted Pickaxe", 
            value: 12000,
            baseWeight: 2,
            tier: 'legendary',
            minPowerLevel: 6,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "12", 
            name: "DRICK", 
            value: 10000,
            baseWeight: 1,
            tier: 'legendary',
            minPowerLevel: 7,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        
        // Sight Equipment
        { 
            itemId: "28", 
            name: "Miner's Headlamp", 
            value: 45,
            baseWeight: 30,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 4,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'sight'
        },
        { 
            itemId: "29", 
            name: "Crystal Lens Goggles", 
            value: 120,
            baseWeight: 3,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 5,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'sight'
        },
        { 
            itemId: "30", 
            name: "Eagle Eye Visor", 
            value: 350,
            baseWeight: 3,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 6,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'sight'
        },
        { 
            itemId: "31", 
            name: "Oracle's Third Eye", 
            value: 800,
            baseWeight: 1,
            tier: 'epic',
            minPowerLevel: 4,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'sight'
        },
        
        // Luck Charms
        { 
            itemId: "32", 
            name: "Lucky Charm Necklace", 
            value: 35,
            baseWeight: 3,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 4,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        { 
            itemId: "33", 
            name: "Rabbit's Foot Keychain", 
            value: 85,
            baseWeight: 3,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 5,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        { 
            itemId: "34", 
            name: "Four-Leaf Clover Pin", 
            value: 200,
            baseWeight: 3,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 6,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        { 
            itemId: "35", 
            name: "Fortune's Blessing Ring", 
            value: 500,
            baseWeight: 3,
            tier: 'epic',
            minPowerLevel: 4,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        { 
            itemId: "36", 
            name: "Probability Manipulator", 
            value: 1200,
            baseWeight: 3,
            tier: 'legendary',
            minPowerLevel: 5,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        
        // Speed Equipment
        { 
            itemId: "37", 
            name: "Swift Mining Boots", 
            value: 40,
            baseWeight: 1,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 4,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'feet'
        },
        { 
            itemId: "38", 
            name: "Hermes' Sandals", 
            value: 150,
            baseWeight: 1,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 5,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'feet'
        },
        { 
            itemId: "39", 
            name: "Lightning Runner Gear", 
            value: 300,
            baseWeight: 1,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 6,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        { 
            itemId: "40", 
            name: "Time Dilation Device", 
            value: 750,
            baseWeight: 1,
            tier: 'epic',
            minPowerLevel: 4,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        { 
            itemId: "41", 
            name: "Quantum Tunneling Kit", 
            value: 1500,
            baseWeight: 1,
            tier: 'legendary',
            minPowerLevel: 5,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        
        // Multi-purpose Equipment
        { 
            itemId: "45", 
            name: "Miner's Multi-Tool", 
            value: 400,
            baseWeight: 1,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 6,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        { 
            itemId: "46", 
            name: "Prospector's Dream Scanner", 
            value: 900,
            baseWeight: 1,
            tier: 'epic',
            minPowerLevel: 4,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        },
        { 
            itemId: "47", 
            name: "Miner's Better Tool", 
            value: 100,
            baseWeight: 1,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 5,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'charm'
        }
    ],
    
    // Special Treasure Items (found in treasure chests)
    treasures: [
        { 
            itemId: "101", 
            name: "Ancient Coin", 
            value: 50,
            baseWeight: 15,
            tier: 'rare',
            minPowerLevel: 1,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.ORE  // Categorized as ore for selling
        },
        { 
            itemId: "104", 
            name: "Abyssal Relic", 
            value: 200,
            baseWeight: 5,
            tier: 'legendary',
            minPowerLevel: 5,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.ORE  // Categorized as ore for selling
        }
    ],
    
    // Consumables
    consumables: [
        { 
            itemId: "4", 
            name: "Mining Bun", 
            value: 8,
            baseWeight: 40,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 3,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "5", 
            name: "Water", 
            value: 6,
            baseWeight: 45,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 3,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "10", 
            name: "Bun Pack", 
            value: 40,
            baseWeight: 25,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 5,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "11", 
            name: "Mine Beer", 
            value: 100,
            baseWeight: 15,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "42", 
            name: "Energy Drink", 
            value: 15,
            baseWeight: 30,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 4,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "43", 
            name: "Luck Potion", 
            value: 25,
            baseWeight: 20,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 6,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "44", 
            name: "Vision Elixir", 
            value: 20,
            baseWeight: 22,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 5,
            category: ITEM_CATEGORY.CONSUMABLE
        }
    ]
};

// Unified function to find any item
function findItemUnified(context, powerLevel, luckStat = 0, isUniqueRoll = false) {
    // Step 1: Get all eligible items for this power level
    const eligibleItems = [];
    
    // Add ores
    for (const ore of UNIFIED_ITEM_POOL.ores) {
        if (ore.minPowerLevel <= powerLevel && ore.maxPowerLevel >= powerLevel) {
            eligibleItems.push({...ore});
        }
    }
    
    // Add treasures
    if (UNIFIED_ITEM_POOL.treasures) {
        for (const treasure of UNIFIED_ITEM_POOL.treasures) {
            if (treasure.minPowerLevel <= powerLevel && treasure.maxPowerLevel >= powerLevel) {
                eligibleItems.push({...treasure});
            }
        }
    }
    
    // Add equipment
    for (const equipment of UNIFIED_ITEM_POOL.equipment) {
        if (equipment.minPowerLevel <= powerLevel && equipment.maxPowerLevel >= powerLevel) {
            eligibleItems.push({...equipment});
        }
    }
    
    // Add consumables
    for (const consumable of UNIFIED_ITEM_POOL.consumables) {
        if (consumable.minPowerLevel <= powerLevel && consumable.maxPowerLevel >= powerLevel) {
            eligibleItems.push({...consumable});
        }
    }
    
    if (eligibleItems.length === 0) {
        // Fallback to coal if nothing is available
        return UNIFIED_ITEM_POOL.ores[0];
    }
    
    // Step 2: Apply context multipliers
    const contextMults = CONTEXT_MULTIPLIERS[context] || CONTEXT_MULTIPLIERS.exploration;
    
    for (const item of eligibleItems) {
        const categoryMult = contextMults[item.category] || 1.0;
        item.adjustedWeight = item.baseWeight * categoryMult;
        
        // Apply tier multipliers based on context
        if (context === 'treasure_chest' || context === 'rare_ore') {
            // Boost higher tier items in special contexts
            switch (item.tier) {
                case 'legendary':
                    item.adjustedWeight *= 2.0;
                    break;
                case 'epic':
                    item.adjustedWeight *= 1.5;
                    break;
                case 'rare':
                    item.adjustedWeight *= 1.2;
                    break;
            }
        }
        
        // Apply luck stat bonus (1% per luck point)
        const luckBonus = 1 + (luckStat * 0.01);
        item.adjustedWeight *= luckBonus;
        
        // Special handling for unique roll flag
        if (isUniqueRoll) {
            // When rolling for uniques, heavily favor higher tier equipment
            if (item.category === ITEM_CATEGORY.EQUIPMENT) {
                if (item.tier === 'legendary') item.adjustedWeight *= 10;
                else if (item.tier === 'epic') item.adjustedWeight *= 5;
                else if (item.tier === 'rare') item.adjustedWeight *= 2;
            }
        }
    }
    
    // Step 3: Weighted random selection
    const totalWeight = eligibleItems.reduce((sum, item) => sum + item.adjustedWeight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of eligibleItems) {
        random -= item.adjustedWeight;
        if (random <= 0) {
            return item;
        }
    }
    
    // Fallback (should never reach here)
    return eligibleItems[0];
}

// Calculate quantity based on context and stats
function calculateItemQuantity(item, context, miningPower = 0, luckStat = 0, powerLevel = 1) {
    let quantity = 1;
    
    // Base quantity from mining power
    if (miningPower > 0) {
        const maxBonus = Math.min(miningPower, 4);
        quantity = 1 + Math.floor(Math.random() * maxBonus);
    }
    
    // Luck bonus
    if (luckStat > 0) {
        const bonusChance = Math.min(0.6, luckStat * 0.08);
        if (Math.random() < bonusChance) {
            quantity += Math.floor(1 + Math.random() * 3);
        }
    }
    
    // Context multipliers
    switch (context) {
        case 'rare_ore':
            quantity *= 2;
            break;
        case 'treasure_chest':
            quantity = Math.max(quantity, 2);
            if (item.tier === 'legendary' || item.tier === 'epic') {
                quantity = Math.max(quantity, 3);
            }
            break;
        case 'rare_treasure':
            quantity = Math.max(quantity, 3);
            if (item.tier === 'legendary') {
                quantity = Math.max(quantity, 5);
            }
            break;
    }
    
    // Power level bonus for ores
    if (item.category === ITEM_CATEGORY.ORE) {
        const powerBonus = Math.floor(powerLevel / 2);
        quantity += Math.floor(Math.random() * powerBonus);
    }
    
    return quantity;
}

// Legacy functions for backward compatibility
function mineFromTile(member, miningPower, luckStat, powerLevel, tileType, availableItems, efficiency) {
    // Map tile types to contexts
    let context = 'mining_wall';
    if (tileType === TILE_TYPES.TREASURE_CHEST) {
        context = 'treasure_chest';
    } else if (tileType === TILE_TYPES.RARE_ORE) {
        context = 'rare_ore';
    }
    
    const item = findItemUnified(context, powerLevel, luckStat, false);
    const quantity = calculateItemQuantity(item, context, miningPower, luckStat, powerLevel);
    
    // Apply efficiency value multiplier
    const enhancedValue = Math.floor(item.value * efficiency.valueMultiplier);
    
    return { 
        item: { ...item, value: enhancedValue }, 
        quantity 
    };
}

function generateTreasure(powerLevel, efficiency) {
    // Special treasure generation using unified system
    const treasureChance = efficiency.treasureChance || 0.01;
    
    if (Math.random() < treasureChance) {
        const item = findItemUnified('treasure_chest', powerLevel, 0, true);
        const enhancedValue = Math.floor(item.value * efficiency.valueMultiplier);
        
        return {
            ...item,
            value: enhancedValue
        };
    }
    
    return null;
}

// Power level modifiers for different gacha servers
const SERVER_POWER_MODIFIERS = {
    "coalMines": {
        powerLevel: 1,
        specialBonus: "Double coal ore spawn rate",
        itemBonuses: { "1": 2.0 }
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
    const levelBonus = Math.floor(playerLevel / 10) * 0.1;
    
    return {
        oreSpawnChance: BASE_ORE_SPAWN_CHANCE * config.oreSpawnMultiplier * (1 + levelBonus),
        rareOreChance: RARE_ORE_SPAWN_CHANCE + config.rareOreBonus,
        treasureChance: config.treasureChance,
        speedMultiplier: config.speedBonus,
        valueMultiplier: config.valueMultiplier * (1 + levelBonus)
    };
}

// Legacy functions for backward compatibility
function getAvailableItems(powerLevel) {
    const items = [];
    
    // Add all eligible items from unified pool
    for (const ore of UNIFIED_ITEM_POOL.ores) {
        if (ore.minPowerLevel <= powerLevel && ore.maxPowerLevel >= powerLevel) {
            items.push({
                itemId: ore.itemId,
                name: ore.name,
                baseWeight: ore.baseWeight,
                value: ore.value,
                tier: ore.tier,
                powerRequirement: ore.minPowerLevel
            });
        }
    }
    
    return items;
}

function getAvailableTreasures(powerLevel) {
    // Return high-tier items as treasures
    const treasures = [];
    
    for (const item of [...UNIFIED_ITEM_POOL.ores, ...UNIFIED_ITEM_POOL.equipment]) {
        if (item.minPowerLevel <= powerLevel && 
            item.maxPowerLevel >= powerLevel &&
            (item.tier === 'epic' || item.tier === 'legendary')) {
            treasures.push({
                itemId: item.itemId,
                name: item.name,
                value: item.value,
                powerRequirement: item.minPowerLevel
            });
        }
    }
    
    return treasures;
}

// Function to get hazard type based on power level
function getHazardTypeForPowerLevel(powerLevel) {
    const config = HAZARD_SPAWN_CONFIG[powerLevel] || HAZARD_SPAWN_CONFIG[1];
    const availableTypes = config.availableTypes;
    
    if (!availableTypes || availableTypes.length === 0) return null;
    
    const eligibleHazards = availableTypes
        .map(type => ({ type, config: HAZARD_CONFIG[type] }))
        .filter(h => h.config.powerRequirement <= powerLevel);
    
    if (eligibleHazards.length === 0) return null;
    
    const totalWeight = eligibleHazards.reduce((sum, h) => sum + h.config.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const hazard of eligibleHazards) {
        random -= hazard.config.weight;
        if (random <= 0) {
            return hazard.type;
        }
    }
    
    return eligibleHazards[0].type;
}

// Function to get hazard spawn chance for power level
function getHazardSpawnChance(powerLevel) {
    const config = HAZARD_SPAWN_CONFIG[powerLevel] || HAZARD_SPAWN_CONFIG[1];
    return config.spawnChance;
}

// Function to get encounter type based on power level
function getEncounterTypeForPowerLevel(powerLevel) {
    const config = ENCOUNTER_SPAWN_CONFIG[powerLevel] || ENCOUNTER_SPAWN_CONFIG[1];
    const availableTypes = config.availableTypes;
    
    if (!availableTypes || availableTypes.length === 0) return null;
    
    const eligibleEncounters = availableTypes
        .map(type => ({ type, config: ENCOUNTER_CONFIG[type] }))
        .filter(e => e.config.powerRequirement <= powerLevel);
    
    if (eligibleEncounters.length === 0) return null;
    
    const totalWeight = eligibleEncounters.reduce((sum, e) => sum + e.config.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const encounter of eligibleEncounters) {
        random -= encounter.config.weight;
        if (random <= 0) {
            return encounter.type;
        }
    }
    
    return eligibleEncounters[0].type;
}

// Function to get encounter spawn chance for power level
function getEncounterSpawnChance(powerLevel) {
    const config = ENCOUNTER_SPAWN_CONFIG[powerLevel] || ENCOUNTER_SPAWN_CONFIG[1];
    return config.spawnChance;
}

// Legacy miningItemPool for backward compatibility - includes all ores and treasures
const miningItemPool = [
    ...UNIFIED_ITEM_POOL.ores.map(ore => ({
        itemId: ore.itemId,
        name: ore.name,
        baseWeight: ore.baseWeight,
        boostedPowerLevel: ore.minPowerLevel,
        value: ore.value,
        tier: ore.tier,
        powerRequirement: ore.minPowerLevel,
        description: `${ore.name} - Tier: ${ore.tier}`
    })),
    ...(UNIFIED_ITEM_POOL.treasures || []).map(treasure => ({
        itemId: treasure.itemId,
        name: treasure.name,
        baseWeight: treasure.baseWeight,
        boostedPowerLevel: treasure.minPowerLevel,
        value: treasure.value,
        tier: treasure.tier,
        powerRequirement: treasure.minPowerLevel,
        description: `${treasure.name} - Special treasure`
    }))
];

// Legacy treasureItems for backward compatibility - includes actual treasure items
const treasureItems = [
    ...(UNIFIED_ITEM_POOL.treasures || []).map(treasure => ({
        itemId: treasure.itemId,
        name: treasure.name,
        value: treasure.value,
        powerRequirement: treasure.minPowerLevel,
        description: `${treasure.name} - Special treasure`
    })),
    ...UNIFIED_ITEM_POOL.equipment
        .filter(item => item.tier === 'epic' || item.tier === 'legendary')
        .slice(0, 4)
        .map(item => ({
            itemId: item.itemId,
            name: item.name,
            value: item.value,
            powerRequirement: item.minPowerLevel,
            description: `${item.name} - Rare equipment`
        }))
];

module.exports = {
    // Core constants
    INITIAL_MAP_WIDTH,
    INITIAL_MAP_HEIGHT,
    BASE_ORE_SPAWN_CHANCE,
    RARE_ORE_SPAWN_CHANCE,
    IMAGE_GENERATION_INTERVAL,
    MAX_SPEED_ACTIONS,
    MAX_MAP_SIZE,
    EXPLORATION_BONUS_CHANCE,
    
    // Tile and encounter types
    TILE_TYPES,
    ENCOUNTER_TYPES,
    ENCOUNTER_CONFIG,
    ENCOUNTER_SPAWN_CONFIG,
    HAZARD_TYPES,
    HAZARD_CONFIG,
    HAZARD_SPAWN_CONFIG,
    
    // Power level system
    POWER_LEVEL_CONFIG,
    SERVER_POWER_MODIFIERS,
    calculateMiningEfficiency,
    
    // Unified item system
    UNIFIED_ITEM_POOL,
    ITEM_CATEGORY,
    CONTEXT_MULTIPLIERS,
    findItemUnified,
    calculateItemQuantity,
    
    // Legacy functions for backward compatibility
    mineFromTile,
    generateTreasure,
    getAvailableItems,
    getAvailableTreasures,
    miningItemPool,
    treasureItems,
    getEncounterTypeForPowerLevel,
    getEncounterSpawnChance,
    getHazardTypeForPowerLevel,
    getHazardSpawnChance
};

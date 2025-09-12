// Enhanced Mining Constants with Unified Item Finding System
const INITIAL_MAP_WIDTH = 3;
const INITIAL_MAP_HEIGHT = 3;
const BASE_ORE_SPAWN_CHANCE = 0.25;
const RARE_ORE_SPAWN_CHANCE = 0.02;
const IMAGE_GENERATION_INTERVAL = 1;
const MAX_SPEED_ACTIONS = 5;
const MAX_MAP_SIZE = 1000;
const EXPLORATION_BONUS_CHANCE = 0.03;

// Power Level Configurations - Updated with higher treasure rates
const POWER_LEVEL_CONFIG = {
    1: {
        name: "Novice Expedition",
        description: "Basic mining efficiency",
        oreSpawnMultiplier: 1.0,
        rareOreBonus: 0.0,
        treasureChance: 0.02,  // Increased from 0.01 to 2%
        speedBonus: 1.0,
        valueMultiplier: 1.0,
        reinforcedWallChance: 0.05  // 5% base chance
    },
    2: {
        name: "Apprentice Expedition", 
        description: "Improved ore detection",
        oreSpawnMultiplier: 1.2,
        rareOreBonus: 0.005,
        treasureChance: 0.035,  // Increased from 0.015 to 3.5%
        speedBonus: 1.1,
        valueMultiplier: 1.2,
        reinforcedWallChance: 0.07  // 7% chance
    },
    3: {
        name: "Skilled Expedition",
        description: "Enhanced mining techniques",
        oreSpawnMultiplier: 1.4,
        rareOreBonus: 0.01,
        treasureChance: 0.05,  // Increased from 0.02 to 5%
        speedBonus: 1.2,
        valueMultiplier: 1.5,
        reinforcedWallChance: 0.10  // 10% chance
    },
    4: {
        name: "Expert Expedition",
        description: "Advanced geological knowledge",
        oreSpawnMultiplier: 1.6,
        rareOreBonus: 0.02,
        treasureChance: 0.07,  // Increased from 0.03 to 7%
        speedBonus: 1.3,
        valueMultiplier: 1.8,
        reinforcedWallChance: 0.13  // 13% chance
    },
    5: {
        name: "Master Expedition",
        description: "Volcanic mining specialization", 
        oreSpawnMultiplier: 1.8,
        rareOreBonus: 0.03,
        treasureChance: 0.09,  // Increased from 0.04 to 9%
        speedBonus: 1.4,
        valueMultiplier: 2.2,
        reinforcedWallChance: 0.20  // 16% chance
    },
    6: {
        name: "Legendary Expedition",
        description: "Mythical ore sensitivity",
        oreSpawnMultiplier: 2.0,
        rareOreBonus: 0.05,
        treasureChance: 0.12,  // Increased from 0.06 to 12%
        speedBonus: 1.6,
        valueMultiplier: 2.8,
        reinforcedWallChance: 0.30  // 30% chance
    },
    7: {
        name: "Abyssal Expedition",
        description: "Master of the deepest depths",
        oreSpawnMultiplier: 2.5,
        rareOreBonus: 0.08,
        treasureChance: 0.15,  // Increased from 0.1 to 15%
        speedBonus: 2.0,
        valueMultiplier: 3.5,
        reinforcedWallChance: 0.50  // 50% chance - maximum difficulty!
    },
    // Deeper mine power levels (8-10) - EXTREME difficulty and rewards
    8: {
        name: "Deeper Delve Mastery",
        description: "Conquering the impossible depths",
        oreSpawnMultiplier: 3.0,
        rareOreBonus: 0.12,
        treasureChance: 0.17,  // Increased from 0.15 to 17%
        speedBonus: 2.5,
        valueMultiplier: 5.0,
        reinforcedWallChance: 0.60  // 60% chance - deeper mines are tough!
    },
    9: {
        name: "Core Breach Expedition",
        description: "Breaking through reality's boundaries",
        oreSpawnMultiplier: 3.5,
        rareOreBonus: 0.18,
        treasureChance: 0.18,  // Slightly reduced from 0.20 to 18% for balance
        speedBonus: 3.0,
        valueMultiplier: 7.0,
        reinforcedWallChance: 0.70  // 70% chance - nearly half walls are reinforced
    },
    10: {
        name: "Void Touched Mining",
        description: "Where physics breaks and fortune awaits",
        oreSpawnMultiplier: 4.0,
        rareOreBonus: 0.25,
        treasureChance: 0.20,  // Reduced from 0.30 to 20% for balance
        speedBonus: 4.0,
        valueMultiplier: 10.0,
        reinforcedWallChance: 0.80  // 80% chance - most walls are reinforced!
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
    FIRE_BLAST: 'fire_blast',
    LIGHTNING_STRIKE: 'lightning_strike',
    TREASURE: 'treasure',
    RARE_TREASURE: 'rare_treasure'
};

// Keep legacy HAZARD_TYPES for backward compatibility
const HAZARD_TYPES = {
    PORTAL_TRAP: 'portal_trap',
    BOMB_TRAP: 'bomb_trap',
    GREEN_FOG: 'green_fog',
    WALL_TRAP: 'wall_trap',
    FIRE_BLAST: 'fire_blast',
    LIGHTNING_STRIKE: 'lightning_strike'
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
    [ENCOUNTER_TYPES.FIRE_BLAST]: {
        name: 'Fire Blast',
        symbol: '🔥',
        color: '#FF6B35',
        image: 'fire_blast',
        description: 'Burns minecart contents',
        powerRequirement: 2,
        weight: 20,
        isHazard: true,
        burnPercentageBase: 10,  // Base 10% burn at power level 1
        burnPercentagePerLevel: 5  // +5% per power level
    },
    [ENCOUNTER_TYPES.LIGHTNING_STRIKE]: {
        name: 'Lightning Strike',
        symbol: '⚡',
        color: '#FFD700',
        image: 'lightning_strike',
        description: 'Stuns miners with electric shock',
        powerRequirement: 3,
        weight: 8,
        isHazard: true,
        stunDuration: 3, // Number of mining actions/turns
        stunChance: 0.8, // 80% chance to stun
        damageAmount: 15 // Health damage
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
    [HAZARD_TYPES.WALL_TRAP]: ENCOUNTER_CONFIG[ENCOUNTER_TYPES.WALL_TRAP],
    [HAZARD_TYPES.FIRE_BLAST]: ENCOUNTER_CONFIG[ENCOUNTER_TYPES.FIRE_BLAST],
    [HAZARD_TYPES.LIGHTNING_STRIKE]: ENCOUNTER_CONFIG[ENCOUNTER_TYPES.LIGHTNING_STRIKE]
};

// Power level encounter spawn configurations
const ENCOUNTER_SPAWN_CONFIG = {
    1: { 
        spawnChance: 0.02, 
        availableTypes: [ENCOUNTER_TYPES.PORTAL_TRAP, ENCOUNTER_TYPES.TREASURE] 
    },
    2: { 
        spawnChance: 0.025, 
        availableTypes: [ENCOUNTER_TYPES.PORTAL_TRAP, ENCOUNTER_TYPES.BOMB_TRAP, ENCOUNTER_TYPES.FIRE_BLAST, ENCOUNTER_TYPES.TREASURE] 
    },
    3: { 
        spawnChance: 0.03, 
        availableTypes: [ENCOUNTER_TYPES.PORTAL_TRAP, ENCOUNTER_TYPES.BOMB_TRAP, ENCOUNTER_TYPES.GREEN_FOG, ENCOUNTER_TYPES.FIRE_BLAST, ENCOUNTER_TYPES.LIGHTNING_STRIKE, ENCOUNTER_TYPES.TREASURE, ENCOUNTER_TYPES.RARE_TREASURE] 
    },
    4: { 
        spawnChance: 0.035, 
        availableTypes: [ENCOUNTER_TYPES.PORTAL_TRAP, ENCOUNTER_TYPES.BOMB_TRAP, ENCOUNTER_TYPES.GREEN_FOG, ENCOUNTER_TYPES.WALL_TRAP, ENCOUNTER_TYPES.FIRE_BLAST, ENCOUNTER_TYPES.LIGHTNING_STRIKE, ENCOUNTER_TYPES.TREASURE, ENCOUNTER_TYPES.RARE_TREASURE] 
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
    },
    // Deeper mine encounter configs - much more dangerous!
    8: { 
        spawnChance: 0.08,  // 8% chance
        availableTypes: Object.values(ENCOUNTER_TYPES) 
    },
    9: { 
        spawnChance: 0.12,  // 12% chance
        availableTypes: Object.values(ENCOUNTER_TYPES) 
    },
    10: { 
        spawnChance: 0.20,  // 20% chance - hazards everywhere!
        availableTypes: Object.values(ENCOUNTER_TYPES) 
    }
};

// Keep legacy HAZARD_SPAWN_CONFIG for backward compatibility
const HAZARD_SPAWN_CONFIG = {
    1: { spawnChance: 0.01, availableTypes: [HAZARD_TYPES.PORTAL_TRAP] },
    2: { spawnChance: 0.015, availableTypes: [HAZARD_TYPES.PORTAL_TRAP, HAZARD_TYPES.BOMB_TRAP, HAZARD_TYPES.FIRE_BLAST] },
    3: { spawnChance: 0.02, availableTypes: [HAZARD_TYPES.PORTAL_TRAP, HAZARD_TYPES.BOMB_TRAP, HAZARD_TYPES.GREEN_FOG, HAZARD_TYPES.FIRE_BLAST] },
    4: { spawnChance: 0.025, availableTypes: [HAZARD_TYPES.PORTAL_TRAP, HAZARD_TYPES.BOMB_TRAP, HAZARD_TYPES.GREEN_FOG, HAZARD_TYPES.WALL_TRAP, HAZARD_TYPES.FIRE_BLAST] },
    5: { spawnChance: 0.03, availableTypes: Object.values(HAZARD_TYPES) },
    6: { spawnChance: 0.035, availableTypes: Object.values(HAZARD_TYPES) },
    7: { spawnChance: 0.04, availableTypes: Object.values(HAZARD_TYPES) },
    8: { spawnChance: 0.06, availableTypes: Object.values(HAZARD_TYPES) },
    9: { spawnChance: 0.09, availableTypes: Object.values(HAZARD_TYPES) },
    10: { spawnChance: 0.15, availableTypes: Object.values(HAZARD_TYPES) }
};

// ==========================================
// UNIFIED ITEM FINDING SYSTEM
// ==========================================

// Item categories for finding
const ITEM_CATEGORY = {
    ORE: 'ore',           // Mining loot (coal, copper, etc.) - goes to minecart
    EQUIPMENT: 'equipment', // Tools, charms, gear - goes to player inventory
    CONSUMABLE: 'consumable', // Temporary boosts - goes to player inventory
    UNIQUE: 'unique'      // Unique legendary items - goes to player inventory
};

// Helper function to determine if item should go to player inventory
function shouldGoToInventory(item) {
    // All non-ore items go to player inventory
    return item.category !== ITEM_CATEGORY.ORE;
}

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

// Special meat item pool for ???'s gullet (id: 16)
const GULLET_ITEM_POOL = {
    // Meat items from the gullet walls
    meats: [
        { 
            itemId: "200", 
            name: "Gullet Flesh Scrap", 
            value: 3,
            baseWeight: 100,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE  // Now consumable, goes to player inventory
        },
        { 
            itemId: "201", 
            name: "Sinew Strand", 
            value: 10,
            baseWeight: 80,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE  // Now consumable, goes to player inventory
        },
        { 
            itemId: "202", 
            name: "Bile-Soaked Meat", 
            value: 18,
            baseWeight: 60,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "211", 
            name: "Cartilage Chunk", 
            value: 25,
            baseWeight: 50,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "203", 
            name: "Muscle Fiber Bundle", 
            value: 30,
            baseWeight: 40,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "210", 
            name: "Bone Marrow Extract", 
            value: 40,
            baseWeight: 35,
            tier: 'uncommon',
            minPowerLevel: 3,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "204", 
            name: "Marbled Organ Meat", 
            value: 55,
            baseWeight: 25,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "215", 
            name: "Adipose Deposit", 
            value: 60,
            baseWeight: 22,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "213", 
            name: "Lymph Node Cluster", 
            value: 70,
            baseWeight: 20,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "205", 
            name: "Digestive Tract Section", 
            value: 80,
            baseWeight: 18,
            tier: 'rare',
            minPowerLevel: 4,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "212", 
            name: "Blood Vessel Network", 
            value: 95,
            baseWeight: 15,
            tier: 'rare',
            minPowerLevel: 4,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "206", 
            name: "Prime Stomach Lining", 
            value: 110,
            baseWeight: 10,
            tier: 'epic',
            minPowerLevel: 4,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "216", 
            name: "Glandular Secretion", 
            value: 125,
            baseWeight: 8,
            tier: 'epic',
            minPowerLevel: 5,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "214", 
            name: "Neural Tissue Sample", 
            value: 145,
            baseWeight: 7,
            tier: 'epic',
            minPowerLevel: 5,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "207", 
            name: "Gastric Membrane", 
            value: 160,
            baseWeight: 6,
            tier: 'epic',
            minPowerLevel: 5,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "217", 
            name: "Peristaltic Muscle Ring", 
            value: 190,
            baseWeight: 4,
            tier: 'epic',
            minPowerLevel: 6,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "208", 
            name: "Esophageal Core", 
            value: 220,
            baseWeight: 3,
            tier: 'legendary',
            minPowerLevel: 6,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "218", 
            name: "Void-Touched Flesh", 
            value: 280,
            baseWeight: 2,
            tier: 'legendary',
            minPowerLevel: 7,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "209", 
            name: "Heart of the Gullet", 
            value: 350,
            baseWeight: 1,
            tier: 'legendary',
            minPowerLevel: 7,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        },
        { 
            itemId: "219", 
            name: "Essence of Hunger", 
            value: 500,
            baseWeight: 0.5,
            tier: 'legendary',
            minPowerLevel: 7,
            maxPowerLevel: 100,
            category: ITEM_CATEGORY.CONSUMABLE
        }
    ]
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
            maxPowerLevel: 5,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "21", 
            name: "Copper Ore", 
            value: 8,
            baseWeight: 80,
            tier: 'common',
            minPowerLevel: 1,
            maxPowerLevel: 7,
            category: ITEM_CATEGORY.ORE
        },
        { 
        itemId: "22", 
        name: "Iron Ore", 
        value: 15,
        baseWeight: 60,
        tier: 'uncommon',
        minPowerLevel: 2,
        maxPowerLevel: 8,
        category: ITEM_CATEGORY.ORE
        },
    { 
        itemId: "103", 
        name: "Ancient Fossil", 
        value: 20,
        baseWeight: 40,
        tier: 'uncommon',
        minPowerLevel: 2,
        maxPowerLevel: 9,
        category: ITEM_CATEGORY.ORE
    },
        { 
            itemId: "2", 
            name: "Topaz", 
            value: 25,
            baseWeight: 40,
            tier: 'uncommon',
            minPowerLevel: 2,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "23", 
            name: "Emerald", 
            value: 50,
            baseWeight: 25,
            tier: 'rare',
            minPowerLevel: 3,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.ORE
        },
        { 
        itemId: "24", 
        name: "Ruby", 
        value: 75,
        baseWeight: 20,
        tier: 'rare',
        minPowerLevel: 3,
        maxPowerLevel: 10,
        category: ITEM_CATEGORY.ORE
        },
    { 
        itemId: "102", 
        name: "Crystal Ore", 
        value: 65,
        baseWeight: 22,
        tier: 'rare',
        minPowerLevel: 3,
        maxPowerLevel: 10,
        category: ITEM_CATEGORY.ORE
    },
        { 
            itemId: "6", 
            name: "Diamond", 
            value: 100,
            baseWeight: 10,
            tier: 'epic',
            minPowerLevel: 4,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "25", 
            name: "Obsidian", 
            value: 150,
            baseWeight: 6,
            tier: 'epic',
            minPowerLevel: 5,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "26", 
            name: "Mythril Ore", 
            value: 200,
            baseWeight: 3,
            tier: 'legendary',
            minPowerLevel: 6,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "27", 
            name: "Adamantite Ore", 
            value: 300,  // Increased from 300 to 500 for better rewards
            baseWeight: 3,  // Increased from 1 to 3 for slightly better spawn chance
            tier: 'legendary',
            minPowerLevel: 7,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.ORE
        },
        { 
            itemId: "220", 
            name: "Shadow Ore", 
            value: 50,
            baseWeight: 2,
            tier: 'rare',
            minPowerLevel: 1,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.ORE,
            specialProperties: {
                shadowOnly: true,
                energyType: "dark",
                luminosity: -1
            }
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
            maxPowerLevel: 8,
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
            maxPowerLevel: 8,
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
            maxPowerLevel: 8,
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
            minPowerLevel: 7,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "16", 
            name: "Pinkgem Axe", 
            value: 2000,
            baseWeight: 6,
            tier: 'epic',
            minPowerLevel: 7,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "15", 
            name: "Hypickeon", 
            value: 5000,
            baseWeight: 4,
            tier: 'epic',
            minPowerLevel: 9,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "19", 
            name: "Murderous Aura Pickaxe", 
            value: 8000,
            baseWeight: 3,
            tier: 'legendary',
            minPowerLevel: 9,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "9", 
            name: "Enchanted Pickaxe", 
            value: 12000,
            baseWeight: 2,
            tier: 'legendary',
            minPowerLevel: 9,
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.EQUIPMENT,
            slot: 'mining'
        },
        { 
            itemId: "12", 
            name: "DRICK", 
            value: 10000,
            baseWeight: 1,
            tier: 'legendary',
            minPowerLevel: 9,
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.ORE  // Categorized as ore for selling
        },
        { 
            itemId: "104", 
            name: "Abyssal Relic", 
            value: 200,
            baseWeight: 5,
            tier: 'legendary',
            minPowerLevel: 5,
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
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
            maxPowerLevel: 10,
            category: ITEM_CATEGORY.CONSUMABLE
        }
    ]
};

// Mine-to-ore correspondence mapping - ENHANCED WITH GUARANTEES
const MINE_ORE_CORRESPONDENCE = {
    // Coal Mines and variants
    '1': { oreId: '1', boost: 2.5, guarantee: 0.40 },      // Coal Mines L0 -> 40% guaranteed
    '1001': { oreId: '1', boost: 3.0, guarantee: 0.45 },   // Coal Mines L-1 -> 45%
    '1002': { oreId: '1', boost: 3.5, guarantee: 0.50 },   // Coal Mines L-2 -> 50%
    '1003': { oreId: '1', boost: 4.0, guarantee: 0.55 },   // Coal Mines L-3 -> 55%
    '1004': { oreId: '1', boost: 4.5, guarantee: 0.60 },   // Coal Mines L-4 -> 60%
    '1005': { oreId: '1', boost: 5.0, guarantee: 0.65 },   // Coal Mines L-5 -> 65%
    '101': { oreId: '1', boost: 6.0, guarantee: 0.70 },    // The Coal Pits L0 -> 70%
    '1011': { oreId: '1', boost: 7.0, guarantee: 0.75 },   // The Coal Pits L-1 -> 75%
    '1012': { oreId: '1', boost: 8.0, guarantee: 0.80 },   // The Coal Pits L-2 -> 80%
    '1013': { oreId: '1', boost: 9.0, guarantee: 0.85 },   // The Coal Pits L-3 -> 85%
    '1014': { oreId: '1', boost: 10.0, guarantee: 0.90 },  // The Coal Pits L-4 -> 90%
    '1015': { oreId: '1', boost: 12.0, guarantee: 0.95 },  // The Coal Pits L-5 -> 95%
    '113': { oreId: '1', boost: 999, guarantee: 1.00 },    // The All Black -> 100% GUARANTEED
    
    // Topaz Mines
    '2': { oreId: '2', boost: 2.5, guarantee: 0.40 },      // Topaz Mine L0 -> 40% guaranteed
    '2001': { oreId: '2', boost: 3.0, guarantee: 0.45 },
    '2002': { oreId: '2', boost: 3.5, guarantee: 0.50 },
    '2003': { oreId: '2', boost: 4.0, guarantee: 0.55 },
    '2004': { oreId: '2', boost: 4.5, guarantee: 0.60 },
    '2005': { oreId: '2', boost: 5.0, guarantee: 0.65 },
    '102': { oreId: '2', boost: 6.0, guarantee: 0.70 },    // The Topaz Core L0 -> 70%
    '2011': { oreId: '2', boost: 7.0, guarantee: 0.75 },
    '2012': { oreId: '2', boost: 8.0, guarantee: 0.80 },
    '2013': { oreId: '2', boost: 9.0, guarantee: 0.85 },
    '2014': { oreId: '2', boost: 10.0, guarantee: 0.90 },
    '2015': { oreId: '2', boost: 12.0, guarantee: 0.95 },
    '114': { oreId: '2', boost: 999, guarantee: 1.00 },    // The Sun Under -> 100%
    
    // Diamond Mines
    '3': { oreId: '6', boost: 2.5, guarantee: 0.40 },      // Diamond Mines L0 -> 40% guaranteed
    '3001': { oreId: '6', boost: 3.0, guarantee: 0.45 },
    '3002': { oreId: '6', boost: 3.5, guarantee: 0.50 },
    '3003': { oreId: '6', boost: 4.0, guarantee: 0.55 },
    '3004': { oreId: '6', boost: 4.5, guarantee: 0.60 },
    '3005': { oreId: '6', boost: 5.0, guarantee: 0.65 },
    '103': { oreId: '6', boost: 6.0, guarantee: 0.70 },    // Diamond Throne L0 -> 70%
    '3011': { oreId: '6', boost: 7.0, guarantee: 0.75 },
    '3012': { oreId: '6', boost: 8.0, guarantee: 0.80 },
    '3013': { oreId: '6', boost: 9.0, guarantee: 0.85 },
    '3014': { oreId: '6', boost: 10.0, guarantee: 0.90 },
    '3015': { oreId: '6', boost: 12.0, guarantee: 0.95 },
    '115': { oreId: '6', boost: 999, guarantee: 1.00 },    // The Diamond Crown -> 100%
    
    // Emerald Caverns
    '4': { oreId: '23', boost: 2.5, guarantee: 0.40 },     // Emerald Caverns L0 -> 40% guaranteed
    '4001': { oreId: '23', boost: 3.0, guarantee: 0.45 },
    '4002': { oreId: '23', boost: 3.5, guarantee: 0.50 },
    '4003': { oreId: '23', boost: 4.0, guarantee: 0.55 },
    '4004': { oreId: '23', boost: 4.5, guarantee: 0.60 },
    '4005': { oreId: '23', boost: 5.0, guarantee: 0.65 },
    '104': { oreId: '23', boost: 6.0, guarantee: 0.70 },   // Emerald Sanctum L0 -> 70%
    '4011': { oreId: '23', boost: 7.0, guarantee: 0.75 },
    '4012': { oreId: '23', boost: 8.0, guarantee: 0.80 },
    '4013': { oreId: '23', boost: 9.0, guarantee: 0.85 },
    '4014': { oreId: '23', boost: 10.0, guarantee: 0.90 },
    '4015': { oreId: '23', boost: 12.0, guarantee: 0.95 },
    '116': { oreId: '23', boost: 999, guarantee: 1.00 },   // Emerald World Tree -> 100%
    
    // Ruby Depths
    '5': { oreId: '24', boost: 2.5, guarantee: 0.40 },     // Ruby Depths L0 -> 40% guaranteed
    '5001': { oreId: '24', boost: 3.0, guarantee: 0.45 },
    '5002': { oreId: '24', boost: 3.5, guarantee: 0.50 },
    '5003': { oreId: '24', boost: 4.0, guarantee: 0.55 },
    '5004': { oreId: '24', boost: 4.5, guarantee: 0.60 },
    '5005': { oreId: '24', boost: 5.0, guarantee: 0.65 },
    '105': { oreId: '24', boost: 6.0, guarantee: 0.70 },   // Ruby Tunnels L0 -> 70%
    '5011': { oreId: '24', boost: 7.0, guarantee: 0.75 },
    '5012': { oreId: '24', boost: 8.0, guarantee: 0.80 },
    '5013': { oreId: '24', boost: 9.0, guarantee: 0.85 },
    '5014': { oreId: '24', boost: 10.0, guarantee: 0.90 },
    '5015': { oreId: '24', boost: 12.0, guarantee: 0.95 },
    '117': { oreId: '24', boost: 999, guarantee: 1.00 },   // Volcanica -> 100%
    
    // Obsidian Forge
    '6': { oreId: '25', boost: 2.5, guarantee: 0.40 },     // Obsidian Forge L0 -> 40% guaranteed
    '6001': { oreId: '25', boost: 3.0, guarantee: 0.45 },
    '6002': { oreId: '25', boost: 3.5, guarantee: 0.50 },
    '6003': { oreId: '25', boost: 4.0, guarantee: 0.55 },
    '6004': { oreId: '25', boost: 4.5, guarantee: 0.60 },
    '6005': { oreId: '25', boost: 5.0, guarantee: 0.65 },
    '106': { oreId: '25', boost: 6.0, guarantee: 0.70 },   // Obsidian Corridors L0 -> 70%
    '6011': { oreId: '25', boost: 7.0, guarantee: 0.75 },
    '6012': { oreId: '25', boost: 8.0, guarantee: 0.80 },
    '6013': { oreId: '25', boost: 9.0, guarantee: 0.85 },
    '6014': { oreId: '25', boost: 10.0, guarantee: 0.90 },
    '6015': { oreId: '25', boost: 12.0, guarantee: 0.95 },
    '118': { oreId: '25', boost: 999, guarantee: 1.00 },   // The Black Heart -> 100%
    
    // Mythril Sanctum
    '7': { oreId: '26', boost: 2.5, guarantee: 0.40 },     // Mythril Sanctum L0 -> 40% guaranteed
    '7001': { oreId: '26', boost: 3.0, guarantee: 0.45 },
    '7002': { oreId: '26', boost: 3.5, guarantee: 0.50 },
    '7003': { oreId: '26', boost: 4.0, guarantee: 0.55 },
    '7004': { oreId: '26', boost: 4.5, guarantee: 0.60 },
    '7005': { oreId: '26', boost: 5.0, guarantee: 0.65 },
    '107': { oreId: '26', boost: 6.0, guarantee: 0.70 },   // Mythril's Rest L0 -> 70%
    '7011': { oreId: '26', boost: 7.0, guarantee: 0.75 },
    '7012': { oreId: '26', boost: 8.0, guarantee: 0.80 },
    '7013': { oreId: '26', boost: 9.0, guarantee: 0.85 },
    '7014': { oreId: '26', boost: 10.0, guarantee: 0.90 },
    '7015': { oreId: '26', boost: 12.0, guarantee: 0.95 },
    '119': { oreId: '26', boost: 999, guarantee: 1.00 },   // Blue Cosmos -> 100%
    
    // Adamantite Abyss - ENHANCED YIELDS FOR TIER 7
    '8': { oreId: '27', boost: 4.0, guarantee: 0.55 },     // Adamantite Abyss L0 -> 55% guaranteed (increased from 40%)
    '8001': { oreId: '27', boost: 4.5, guarantee: 0.60 },
    '8002': { oreId: '27', boost: 5.0, guarantee: 0.65 },
    '8003': { oreId: '27', boost: 5.5, guarantee: 0.70 },
    '8004': { oreId: '27', boost: 6.0, guarantee: 0.75 },
    '8005': { oreId: '27', boost: 6.5, guarantee: 0.80 },
    '18': { oreId: '27', boost: 999, guarantee: 1.00 },    // Abyssal Adamantite Depths -> 100%
    
    // Iron Town
    '10': { oreId: '22', boost: 2.5, guarantee: 0.40 },    // Iron Town L0 -> 40% guaranteed
    '10001': { oreId: '22', boost: 3.0, guarantee: 0.45 },
    '10002': { oreId: '22', boost: 3.5, guarantee: 0.50 },
    '10003': { oreId: '22', boost: 4.0, guarantee: 0.55 },
    '10004': { oreId: '22', boost: 4.5, guarantee: 0.60 },
    '10005': { oreId: '22', boost: 5.0, guarantee: 0.65 },
    '110': { oreId: '22', boost: 6.0, guarantee: 0.70 },   // Iron Fortress L0 -> 70%
    '10011': { oreId: '22', boost: 7.0, guarantee: 0.75 },
    '10012': { oreId: '22', boost: 8.0, guarantee: 0.80 },
    '10013': { oreId: '22', boost: 9.0, guarantee: 0.85 },
    '10014': { oreId: '22', boost: 10.0, guarantee: 0.90 },
    '10015': { oreId: '22', boost: 12.0, guarantee: 0.95 },
    '121': { oreId: '22', boost: 999, guarantee: 1.00 },   // Black Iron -> 100%
    
    // Crystal Grottos
    '11': { oreId: '102', boost: 2.5, guarantee: 0.40 },   // Crystal Grottos L0 -> 40% guaranteed
    '11001': { oreId: '102', boost: 3.0, guarantee: 0.45 },
    '11002': { oreId: '102', boost: 3.5, guarantee: 0.50 },
    '11003': { oreId: '102', boost: 4.0, guarantee: 0.55 },
    '11004': { oreId: '102', boost: 4.5, guarantee: 0.60 },
    '11005': { oreId: '102', boost: 5.0, guarantee: 0.65 },
    '111': { oreId: '102', boost: 6.0, guarantee: 0.70 },  // Crystal Paradise L0 -> 70%
    '11011': { oreId: '102', boost: 7.0, guarantee: 0.75 },
    '11012': { oreId: '102', boost: 8.0, guarantee: 0.80 },
    '11013': { oreId: '102', boost: 9.0, guarantee: 0.85 },
    '11014': { oreId: '102', boost: 10.0, guarantee: 0.90 },
    '11015': { oreId: '102', boost: 12.0, guarantee: 0.95 },
    '122': { oreId: '102', boost: 999, guarantee: 1.00 },  // Crystal Heaven -> 100%
    
    // Copper Quarry
    '9': { oreId: '21', boost: 2.5, guarantee: 0.40 },     // Copper Quarry L0 -> 40% guaranteed
    '9001': { oreId: '21', boost: 3.0, guarantee: 0.45 },
    '9002': { oreId: '21', boost: 3.5, guarantee: 0.50 },
    '9003': { oreId: '21', boost: 4.0, guarantee: 0.55 },
    '9004': { oreId: '21', boost: 4.5, guarantee: 0.60 },
    '9005': { oreId: '21', boost: 5.0, guarantee: 0.65 },
    '109': { oreId: '21', boost: 6.0, guarantee: 0.70 },   // Copper Throne L0 -> 70%
    '9011': { oreId: '21', boost: 7.0, guarantee: 0.75 },
    '9012': { oreId: '21', boost: 8.0, guarantee: 0.80 },
    '9013': { oreId: '21', boost: 9.0, guarantee: 0.85 },
    '9014': { oreId: '21', boost: 10.0, guarantee: 0.90 },
    '9015': { oreId: '21', boost: 12.0, guarantee: 0.95 },
    '120': { oreId: '21', boost: 999, guarantee: 1.00 },   // Pure Copper -> 100%
    
    // Fossil Excavation
    '12': { oreId: '103', boost: 2.5, guarantee: 0.40 },   // Fossil Excavation L0 -> 40% guaranteed
    '12001': { oreId: '103', boost: 3.0, guarantee: 0.45 },
    '12002': { oreId: '103', boost: 3.5, guarantee: 0.50 },
    '12003': { oreId: '103', boost: 4.0, guarantee: 0.55 },
    '12004': { oreId: '103', boost: 4.5, guarantee: 0.60 },
    '12005': { oreId: '103', boost: 5.0, guarantee: 0.65 },
    '112': { oreId: '103', boost: 6.0, guarantee: 0.70 },  // Ancient Fossil Vault L0 -> 70%
    '12011': { oreId: '103', boost: 7.0, guarantee: 0.75 },
    '12012': { oreId: '103', boost: 8.0, guarantee: 0.80 },
    '12013': { oreId: '103', boost: 9.0, guarantee: 0.85 },
    '12014': { oreId: '103', boost: 10.0, guarantee: 0.90 },
    '12015': { oreId: '103', boost: 12.0, guarantee: 0.95 },
    '123': { oreId: '103', boost: 999, guarantee: 1.00 },  // Prehistoric Paradise -> 100%
    
    // Note: ???'s Gullet (id: 16) and Rusty Relic Realm (id: 17) are special cases handled separately
};

// Unified function to find any item
function findItemUnified(context, powerLevel, luckStat = 0, isUniqueRoll = false, isDeeperMine = false, mineTypeId = null) {
    // Debug logging at the start of findItemUnified
    console.log(`[FINDITEMUNIFIED DEBUG] Called with mineTypeId: "${mineTypeId}" (type: ${typeof mineTypeId}), context: ${context}, powerLevel: ${powerLevel}`);
    
    // Check if we're in ???'s gullet (id: 16)
    const isGullet = mineTypeId === 16 || mineTypeId === '16';
    
    // Debug gullet detection
    if (mineTypeId === 16 || mineTypeId === '16') {
        console.log(`[GULLET DEBUG] findItemUnified called with mineTypeId: ${mineTypeId} (type: ${typeof mineTypeId}), isGullet: ${isGullet}`);
    }
    
    // Apply deeper mine bonus to effective power level
    let effectivePowerLevel = powerLevel;
    if (isDeeperMine) {
        // Deeper mines act as if they're 2 power levels higher for item finding
        effectivePowerLevel = Math.min(10, powerLevel + 2);
    }
    // Step 1: Get all eligible items for this power level
    const eligibleItems = [];
    
    // If in ???'s gullet, use ONLY meat items
    if (isGullet) {
        // Add meat items from gullet - NOTHING ELSE
        for (const meat of GULLET_ITEM_POOL.meats) {
            if (meat.minPowerLevel <= effectivePowerLevel && meat.maxPowerLevel >= effectivePowerLevel) {
                eligibleItems.push({...meat});
            }
        }
        // Skip all other item types for gullet - meat only!
    } else {
        // Add normal ores
        for (const ore of UNIFIED_ITEM_POOL.ores) {
            if (ore.minPowerLevel <= effectivePowerLevel && ore.maxPowerLevel >= effectivePowerLevel) {
                eligibleItems.push({...ore});
            }
        }
        
        // Add treasures (only for non-gullet mines)
        if (UNIFIED_ITEM_POOL.treasures) {
            for (const treasure of UNIFIED_ITEM_POOL.treasures) {
                if (treasure.minPowerLevel <= effectivePowerLevel && treasure.maxPowerLevel >= effectivePowerLevel) {
                    eligibleItems.push({...treasure});
                }
            }
        }
        
        // Add equipment (only for non-gullet mines)
        for (const equipment of UNIFIED_ITEM_POOL.equipment) {
            if (equipment.minPowerLevel <= effectivePowerLevel && equipment.maxPowerLevel >= effectivePowerLevel) {
                eligibleItems.push({...equipment});
            }
        }
        
        // Add consumables (only for non-gullet mines)
        for (const consumable of UNIFIED_ITEM_POOL.consumables) {
            if (consumable.minPowerLevel <= effectivePowerLevel && consumable.maxPowerLevel >= effectivePowerLevel) {
                eligibleItems.push({...consumable});
            }
        }
    }
    
    if (eligibleItems.length === 0) {
        // Fallback to basic item if nothing is available
        if (isGullet) {
            return GULLET_ITEM_POOL.meats[0]; // Gullet Flesh Scrap
        } else {
            return UNIFIED_ITEM_POOL.ores[0]; // Coal
        }
    }
    
    // Step 2: Apply context multipliers
    const contextMults = CONTEXT_MULTIPLIERS[context] || CONTEXT_MULTIPLIERS.exploration;
    
    // Get mine correspondence info
    const mineCorrespondence = MINE_ORE_CORRESPONDENCE[String(mineTypeId)];
    
    // Debug the condition check
    console.log(`[FINDITEMUNIFIED DEBUG] Checking mine bias condition:`);
    console.log(`[FINDITEMUNIFIED DEBUG] - mineTypeId: "${mineTypeId}" (truthy: ${!!mineTypeId})`);
    console.log(`[FINDITEMUNIFIED DEBUG] - mineTypeId !== 16: ${mineTypeId !== 16}`);
    console.log(`[FINDITEMUNIFIED DEBUG] - mineTypeId !== '16': ${mineTypeId !== '16'}`);
    console.log(`[FINDITEMUNIFIED DEBUG] - Overall condition: ${mineTypeId && mineTypeId !== 16 && mineTypeId !== '16'}`);
    
    // Debug mine-specific ore bias for ALL mines (except gullet)
    if (mineTypeId && mineTypeId !== 16 && mineTypeId !== '16') {
        console.log(`[MINE BIAS DEBUG] ===== MINE BIAS ANALYSIS =====`);
        console.log(`[MINE BIAS DEBUG] mineTypeId: ${mineTypeId} (type: ${typeof mineTypeId})`);
        console.log(`[MINE BIAS DEBUG] context: ${context}, powerLevel: ${powerLevel}`);
        console.log(`[MINE BIAS DEBUG] eligible items count: ${eligibleItems.length}`);
        
        // Show all available mine correspondences
        const allMineIds = Object.keys(MINE_ORE_CORRESPONDENCE);
        console.log(`[MINE BIAS DEBUG] All configured mine IDs:`, allMineIds.slice(0, 20));
        
        // Check correspondence
        console.log(`[MINE BIAS DEBUG] Looking for correspondence with key: "${String(mineTypeId)}"`);
        console.log(`[MINE BIAS DEBUG] correspondence found:`, !!mineCorrespondence);
        
        if (mineCorrespondence) {
            console.log(`[MINE BIAS DEBUG] ✅ BIAS ACTIVE`);
            console.log(`[MINE BIAS DEBUG] Target ore ID: ${mineCorrespondence.oreId}`);
            console.log(`[MINE BIAS DEBUG] Boost multiplier: ${mineCorrespondence.boost}x`);
            console.log(`[MINE BIAS DEBUG] Guarantee percentage: ${mineCorrespondence.guarantee * 100}%`);
            
            // Find the target ore in eligible items
            const targetOre = eligibleItems.find(item => item.itemId === mineCorrespondence.oreId);
            if (targetOre) {
                console.log(`[MINE BIAS DEBUG] ✅ Target ore found: ${targetOre.name} (base weight: ${targetOre.baseWeight})`);
            } else {
                console.log(`[MINE BIAS DEBUG] ❌ TARGET ORE NOT FOUND IN ELIGIBLE ITEMS!`);
                console.log(`[MINE BIAS DEBUG] Looking for ore ID: ${mineCorrespondence.oreId}`);
                console.log(`[MINE BIAS DEBUG] Available ore items:`, eligibleItems.filter(i => i.category === 'ore').map(i => `${i.name}(${i.itemId})`));
            }
        } else {
            console.log(`[MINE BIAS DEBUG] ❌ NO BIAS - GENERIC MINING`);
            console.log(`[MINE BIAS DEBUG] Mine ${mineTypeId} not found in correspondence table`);
            console.log(`[MINE BIAS DEBUG] This mine will give random ores without bias`);
        }
        
        // Show what ores are available in this power level
        const availableOres = eligibleItems.filter(item => item.category === 'ore');
        console.log(`[MINE BIAS DEBUG] Available ores for power level ${powerLevel}:`, 
                   availableOres.map(ore => `${ore.name}(${ore.itemId})`));
    }
    
    for (const item of eligibleItems) {
        const categoryMult = contextMults[item.category] || 1.0;
        item.adjustedWeight = item.baseWeight * categoryMult;
        
        // Apply mine-specific ore boost
        if (mineCorrespondence && item.itemId === mineCorrespondence.oreId) {
            console.log(`[MINE BIAS DEBUG] Found target ore ${item.name} (ID: ${item.itemId}), applying boost: ${mineCorrespondence.boost}x`);
            // For mining context, ensure the corresponding ore has at minimum the boost percentage chance
            if (context === 'mining_wall' || context === 'rare_ore') {
                // Check if this is a guaranteed mine (boost: 999 indicates 100% guarantee)
                if (mineCorrespondence.boost >= 999 || mineCorrespondence.guarantee >= 1.0) {
                    // For guaranteed mines, set an extremely high weight to ensure 100% selection
                    item.adjustedWeight = 999999999; // Effectively guarantees selection
                    console.log(`[MINE BIAS DEBUG] Guaranteed mine detected - setting ultra-high weight for ${item.name}`);
                } else {
                    // To ensure this ore has at least X% chance, we need to boost its weight significantly
                    // Calculate the weight of all other items
                    const otherItemsWeight = eligibleItems
                        .filter(i => i.itemId !== mineCorrespondence.oreId)
                        .reduce((sum, i) => sum + (i.baseWeight * (contextMults[i.category] || 1.0)), 0);
                    
                    // Use the guarantee value if available, otherwise use boost as percentage
                    const targetPercentage = mineCorrespondence.guarantee || (mineCorrespondence.boost / 100);
                    
                    // Ensure percentage is valid (0-0.99 range)
                    const validPercentage = Math.min(0.99, Math.max(0.01, targetPercentage));
                    
                    // To achieve the target percentage: weight / (weight + others) = percentage
                    // Solving for weight: weight = (percentage * others) / (1 - percentage)
                    const targetWeight = (validPercentage * otherItemsWeight) / (1 - validPercentage);
                    
                    // Set the weight to achieve at least the target percentage
                    item.adjustedWeight = Math.max(item.adjustedWeight, targetWeight);
                }
            } else {
                // For other contexts (treasure chests, etc.), apply a smaller boost
                item.adjustedWeight *= 1.5;
            }
        }
        
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
        
        // Deeper mine bonus - significantly boost rare items
        if (isDeeperMine) {
            switch (item.tier) {
                case 'legendary':
                    item.adjustedWeight *= 3.0;  // 3x more likely in deeper mines
                    break;
                case 'epic':
                    item.adjustedWeight *= 2.5;  // 2.5x more likely
                    break;
                case 'rare':
                    item.adjustedWeight *= 2.0;  // 2x more likely
                    break;
                case 'uncommon':
                    item.adjustedWeight *= 1.5;  // 1.5x more likely
                    break;
                case 'common':
                    item.adjustedWeight *= 0.5;  // Less common items in deeper mines
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
    
    // Debug final weights for mines with correspondence
    if (mineCorrespondence && mineTypeId && mineTypeId !== 16) {
        console.log(`[MINE BIAS DEBUG] ===== FINAL WEIGHTS =====`);
        console.log(`[MINE BIAS DEBUG] Total weight pool: ${totalWeight}`);
        
        // Show top 5 items by weight
        const sortedItems = [...eligibleItems].sort((a, b) => b.adjustedWeight - a.adjustedWeight);
        for (let i = 0; i < Math.min(5, sortedItems.length); i++) {
            const item = sortedItems[i];
            const percentage = ((item.adjustedWeight / totalWeight) * 100).toFixed(1);
            const isTarget = item.itemId === mineCorrespondence.oreId;
            console.log(`[MINE BIAS DEBUG] ${i + 1}. ${item.name} (${item.itemId}): ${percentage}% ${isTarget ? '🎯 TARGET' : ''}`);
        }
    }
    
    let random = Math.random() * totalWeight;
    
    for (const item of eligibleItems) {
        random -= item.adjustedWeight;
        if (random <= 0) {
            // Debug final item selection for mines with correspondence
            if (mineCorrespondence && mineTypeId && mineTypeId !== 16) {
                const isTargetOre = item.itemId === mineCorrespondence.oreId;
                console.log(`[MINE BIAS DEBUG] Selected: ${item.name} (ID: ${item.itemId}) - ${isTargetOre ? 'TARGET ORE ✅' : 'other item ❌'}`);
            }
            return item;
        }
    }
    
    // Fallback (should never reach here)
    return eligibleItems[0];
}

// Helper function to get item destination
function getItemDestination(item, mineTypeId = null) {
    // Check if we're in ???'s gullet
    const isGullet = mineTypeId === 16 || mineTypeId === '16';
    
    // Gullet items (now consumables) always go to player inventory
    if (isGullet) {
        return 'inventory';
    }
    
    // Non-ore items go to player inventory
    if (shouldGoToInventory(item)) {
        return 'inventory';
    }
    
    // Regular ores go to minecart
    return 'minecart';
}

// Calculate quantity based on context and stats
function calculateItemQuantity(item, context, miningPower = 0, luckStat = 0, powerLevel = 1, isDeeperMine = false) {
    let quantity = 1;
    
    // Base quantity from mining power - unlimited scaling!
    if (miningPower > 0) {
        const maxBonus = miningPower; // No caps - full mining power scaling!
        quantity = 1 + Math.floor(Math.random() * maxBonus);
    }
    
    // Luck bonus - unlimited scaling!
    if (luckStat > 0) {
        const bonusChance = luckStat * 0.08; // No cap!
        if (Math.random() < Math.min(bonusChance, 0.95)) { // Only prevent 100% guarantee
            quantity += Math.floor(1 + Math.random() * 5); // Increased bonus range
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
    
    // Deeper mine bonus - significantly more quantity
    if (isDeeperMine) {
        quantity = Math.ceil(quantity * 1.5);  // 50% more items in deeper mines
        
        // Extra bonus for rare items
        if (item.tier === 'legendary' || item.tier === 'epic') {
            quantity += Math.floor(Math.random() * 3) + 1;  // 1-3 extra for rare items
        }
    }
    
    return quantity;
}

// Function to calculate item find chance
function calculateItemFindChance(powerLevel, luckStat, activityType = 'mining') {
    const { ITEM_FINDING_CONFIG } = require('./fixes/miningConstants');
    
    const baseChance = ITEM_FINDING_CONFIG.baseItemFindChance;
    const activityMult = ITEM_FINDING_CONFIG.activityMultipliers[activityType] || 1.0;
    const powerMult = ITEM_FINDING_CONFIG.powerLevelMultipliers[powerLevel] || 1.0;
    const luckBonus = 1 + (luckStat * 0.01); // Each luck point adds 1% to chance
    
    return baseChance * activityMult * powerMult * luckBonus;
}

// Function to get available regular items for power level - NOW USES UNIFIED SYSTEM
function getAvailableRegularItems(powerLevel) {
    // Use the unified item pool instead of legacy system
    const eligibleItems = [];
    
    // Add equipment items from unified pool
    if (UNIFIED_ITEM_POOL.equipment) {
        for (const item of UNIFIED_ITEM_POOL.equipment) {
            if (item.minPowerLevel <= powerLevel && item.maxPowerLevel >= powerLevel) {
                eligibleItems.push({
                    itemId: item.itemId,
                    name: item.name,
                    weight: item.baseWeight,
                    minPower: item.minPowerLevel,
                    maxPower: item.maxPowerLevel,
                    value: item.value,
                    tier: item.tier
                });
            }
        }
    }
    
    // Add consumable items from unified pool
    if (UNIFIED_ITEM_POOL.consumables) {
        for (const item of UNIFIED_ITEM_POOL.consumables) {
            if (item.minPowerLevel <= powerLevel && item.maxPowerLevel >= powerLevel) {
                eligibleItems.push({
                    itemId: item.itemId,
                    name: item.name,
                    weight: item.baseWeight,
                    minPower: item.minPowerLevel,
                    maxPower: item.maxPowerLevel,
                    value: item.value,
                    tier: item.tier
                });
            }
        }
    }
    
    return eligibleItems;
}

// Legacy functions for backward compatibility
function mineFromTile(member, miningPower, luckStat, powerLevel, tileType, availableItems, efficiency, isDeeperMine = false, mineTypeId = null) {
    // Map tile types to contexts
    let context = 'mining_wall';
    if (tileType === TILE_TYPES.TREASURE_CHEST) {
        context = 'treasure_chest';
    } else if (tileType === TILE_TYPES.RARE_ORE) {
        context = 'rare_ore';
    }
    
    const item = findItemUnified(context, powerLevel, luckStat, false, isDeeperMine, mineTypeId);
    const quantity = calculateItemQuantity(item, context, miningPower, luckStat, powerLevel, isDeeperMine);
    
    // Apply efficiency value multiplier
    const enhancedValue = Math.floor(item.value * efficiency.valueMultiplier);
    
    return { 
        item: { ...item, value: enhancedValue }, 
        quantity,
        destination: getItemDestination(item, mineTypeId) 
    };
}

function generateTreasure(powerLevel, efficiency, isDeeperMine = false, mineTypeId = null, teamLuckBonus = 0) {
    // Special treasure generation using unified system
    let treasureChance = efficiency.treasureChance || 0.01;
    
    // Apply team luck bonus: +0.1% per point of total team luck, max +20%
    const luckBonus = Math.min(0.20, teamLuckBonus * 0.001); // 0.1% per luck point
    treasureChance = treasureChance + luckBonus;
    
    // Deeper mines have much higher treasure chance
    if (isDeeperMine) {
        treasureChance = Math.min(0.5, treasureChance * 2.0);  // Double treasure chance, max 50%
    }
    
    if (Math.random() < treasureChance) {
        const item = findItemUnified('treasure_chest', powerLevel, 0, true, isDeeperMine, mineTypeId);
        const enhancedValue = Math.floor(item.value * efficiency.valueMultiplier * (isDeeperMine ? 1.5 : 1.0));
        
        return {
            ...item,
            value: enhancedValue,
            destination: getItemDestination(item, mineTypeId)
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
        specialBonus: "Abyssal depth mastery - Maximum ore extraction",
        itemBonuses: { 
            "27": 2.5,  // Increased from 3.5 to 5.0 for better Adamantite yields
            "26": 2.0,  // Also spawn some Mythril as secondary ore
            "25": 1.5   // Occasional Obsidian
        }
    },
    // Special ???'s gullet configuration
    "gulletsGullet": {
        powerLevel: 5,
        specialBonus: "Flesh harvesting efficiency",
        itemBonuses: { 
            "200": 1.5,  // Flesh Scrap
            "201": 1.5,  // Sinew Strand
            "209": 3.0,  // Heart of the Gullet
            "219": 5.0   // Essence of Hunger
        },
        isGullet: true
    },
    // Deeper mine special modifiers
    "theBlackDepths": {
        powerLevel: 3,  // Base power +2 for deeper
        specialBonus: "Midnight crystal compression",
        itemBonuses: { "1": 4.0, "6": 2.0 },  // Super coal and diamonds
        isDeeperMine: true
    },
    "goldenTopazCore": {
        powerLevel: 4,
        specialBonus: "Imperial topaz perfection",
        itemBonuses: { "2": 3.5, "102": 2.5 },
        isDeeperMine: true
    },
    "diamondThrone": {
        powerLevel: 5,
        specialBonus: "Crown jewel quality",
        itemBonuses: { "6": 4.0 },  // Massive diamond bonus
        isDeeperMine: true
    },
    "emeraldSanctum": {
        powerLevel: 5,
        specialBonus: "Mother crystal blessing",
        itemBonuses: { "23": 3.5 },
        isDeeperMine: true
    },
    "rubyInferno": {
        powerLevel: 6,
        specialBonus: "Eternal flame forging",
        itemBonuses: { "24": 4.0 },
        isDeeperMine: true
    },
    "obsidianAbyss": {
        powerLevel: 7,
        specialBonus: "Void-touched obsidian",
        itemBonuses: { "25": 4.5 },
        isDeeperMine: true
    },
    "mythrilHeaven": {
        powerLevel: 8,
        specialBonus: "Divine mythril blessing",
        itemBonuses: { "26": 5.0 },
        isDeeperMine: true
    },
    "copperThrone": {
        powerLevel: 3,
        specialBonus: "Royal copper enhancement",
        itemBonuses: { "21": 3.0, "22": 2.0 },  // Copper and iron bonus
        isDeeperMine: true
    },
    "ironFortress": {
        powerLevel: 4,
        specialBonus: "Fortress-grade iron quality",
        itemBonuses: { "22": 3.5 },  // Enhanced iron
        isDeeperMine: true
    },
    "crystalParadise": {
        powerLevel: 6,
        specialBonus: "Crystal convergence perfection",
        itemBonuses: { "102": 4.0, "6": 2.5 },  // Crystal ore and diamonds
        isDeeperMine: true
    },
    "ancientFossilVault": {
        powerLevel: 4,
        specialBonus: "Prehistoric treasure preservation",
        itemBonuses: { "103": 3.5, "101": 2.0 },  // Fossils and ancient coins
        isDeeperMine: true
    },
    "abyssalAdamantiteDepths": {
        powerLevel: 10,
        specialBonus: "Void-touched adamantite mastery",
        itemBonuses: { "27": 6.0, "104": 3.0 },  // Void adamantite and abyssal relics
        isDeeperMine: true
    }
};

// Function to calculate mining efficiency based on power level
function calculateMiningEfficiency(serverPowerLevel, playerLevel = 1, isDeeperMine = false) {
    // Apply deeper mine bonus if applicable
    let effectivePowerLevel = serverPowerLevel;
    if (isDeeperMine) {
        // Deeper mines get +2 to effective power level for calculations
        effectivePowerLevel = Math.min(10, serverPowerLevel + 2);
    }
    
    const config = POWER_LEVEL_CONFIG[Math.round(effectivePowerLevel)] || POWER_LEVEL_CONFIG[7];
    const levelBonus = Math.floor(playerLevel / 10) * 0.1;
    
    // Apply deeper mine multipliers
    const deeperMultiplier = isDeeperMine ? 1.5 : 1.0;
    
    return {
        oreSpawnChance: BASE_ORE_SPAWN_CHANCE * config.oreSpawnMultiplier * (1 + levelBonus) * deeperMultiplier,
        rareOreChance: (RARE_ORE_SPAWN_CHANCE + config.rareOreBonus) * deeperMultiplier,
        treasureChance: config.treasureChance * deeperMultiplier,
        speedMultiplier: config.speedBonus,
        valueMultiplier: config.valueMultiplier * (1 + levelBonus) * (isDeeperMine ? 1.8 : 1.0),
        reinforcedWallChance: config.reinforcedWallChance || 0.05
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
function getHazardSpawnChance(powerLevel, isDeeperMine = false) {
    // Apply deeper mine bonus if applicable
    let effectivePowerLevel = powerLevel;
    if (isDeeperMine) {
        // Deeper mines get +2 to effective power level for hazards
        effectivePowerLevel = Math.min(10, powerLevel + 2);
    }
    
    const config = HAZARD_SPAWN_CONFIG[effectivePowerLevel] || HAZARD_SPAWN_CONFIG[1];
    let chance = config.spawnChance;
    
    // Additional danger for deeper mines
    if (isDeeperMine) {
        chance = Math.min(0.25, chance * 1.5);  // 50% more hazards, max 25%
    }
    
    return chance;
}

// Function to get reinforced wall chance for power level
function getReinforcedWallChance(powerLevel, isDeeperMine = false) {
    // Apply deeper mine bonus if applicable
    let effectivePowerLevel = powerLevel;
    if (isDeeperMine) {
        // Deeper mines get +2 to effective power level
        effectivePowerLevel = Math.min(10, powerLevel + 2);
    }
    
    const config = POWER_LEVEL_CONFIG[effectivePowerLevel] || POWER_LEVEL_CONFIG[1];
    let chance = config.reinforcedWallChance || 0.05;  // Default 5% if not specified
    
    // Additional multiplier for deeper mines
    if (isDeeperMine) {
        chance = Math.min(0.75, chance * 1.5);  // 50% more reinforced walls, max 75%
    }
    
    return chance;
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
function getEncounterSpawnChance(powerLevel, isDeeperMine = false) {
    // Apply deeper mine bonus if applicable
    let effectivePowerLevel = powerLevel;
    if (isDeeperMine) {
        // Deeper mines get +2 to effective power level for encounters
        effectivePowerLevel = Math.min(10, powerLevel + 2);
    }
    
    const config = ENCOUNTER_SPAWN_CONFIG[effectivePowerLevel] || ENCOUNTER_SPAWN_CONFIG[1];
    let chance = config.spawnChance;
    
    // More encounters in deeper mines (both hazards and treasures)
    if (isDeeperMine) {
        chance = Math.min(0.30, chance * 1.5);  // 50% more encounters, max 30%
    }
    
    return chance;
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

// Helper function to check if a mine is a deeper mine
function isDeeperMine(mineId) {
    // IDs 101-112 are level 2 deeper mines, 113-123 are level 3, 18 is special
    const deeperMineIds = ['101', '102', '103', '104', '105', '106', '107', '109', '110', '111', '112', '113', '114', '115', '116', '117', '118', '119', '120', '121', '122', '123', '18'];
    return deeperMineIds.includes(String(mineId));
}

// Helper function to get deeper mine level
function getDeeperMineLevel(mineId) {
    const level2Ids = ['101', '102', '103', '104', '105', '106', '107', '109', '110', '111', '112'];
    const level3Ids = ['113', '114', '115', '116', '117', '118', '119', '120', '121', '122', '123'];
    const specialIds = ['18'];
    
    if (level2Ids.includes(String(mineId))) return 2;
    if (level3Ids.includes(String(mineId))) return 3;
    if (specialIds.includes(String(mineId))) return 3; // Special mines count as level 3
    return 1; // Base level
}

// Get special modifiers for deeper mines
function getDeeperMineModifiers(mineId) {
    const level = getDeeperMineLevel(mineId);
    
    // Base modifiers for level 2
    let modifiers = {
        hazardMultiplier: 1.5,        // 50% more hazards
        reinforcedWallMultiplier: 1.5, // 50% more reinforced walls
        oreQuantityMultiplier: 1.5,    // 50% more ore quantity
        rareItemMultiplier: 2.0,       // 2x chance for rare items
        valueMultiplier: 1.8,           // 80% more value
        treasureMultiplier: 2.0,        // 2x treasure chance
        powerLevelBonus: 2              // Acts as 2 levels higher
    };
    
    // Level 3 deeper mines get even more bonuses
    if (level === 3) {
        modifiers = {
            hazardMultiplier: 2.5,          // 150% more hazards
            reinforcedWallMultiplier: 2.0,  // 100% more reinforced walls
            oreQuantityMultiplier: 2.5,     // 150% more ore quantity
            rareItemMultiplier: 4.0,        // 4x chance for rare items
            valueMultiplier: 3.5,            // 250% more value
            treasureMultiplier: 3.0,         // 3x treasure chance
            powerLevelBonus: 4               // Acts as 4 levels higher
        };
    }
    
    // Special cases for extreme deeper mines (Mythril, Adamantite, special)
    const extremeMines = ['18', '107', '115', '116', '117', '118', '119', '122'];
    if (extremeMines.includes(String(mineId))) {
        // These are the ultimate mines - maximum difficulty and rewards
        modifiers.hazardMultiplier = 3.0;
        modifiers.oreQuantityMultiplier = 3.0;
        modifiers.rareItemMultiplier = 5.0;
        modifiers.valueMultiplier = 5.0;
        modifiers.powerLevelBonus = 5;
        modifiers.treasureMultiplier = 4.0;
    }
    
    return modifiers;
}

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
    GULLET_ITEM_POOL,  // Export the gullet item pool
    MINE_ORE_CORRESPONDENCE,  // Export mine-ore correspondence mapping
    ITEM_CATEGORY,
    CONTEXT_MULTIPLIERS,
    findItemUnified,
    calculateItemQuantity,
    shouldGoToInventory,  // Export helper function
    getItemDestination,   // Export helper function
    calculateItemFindChance,  // Export item find chance calculation
    getAvailableRegularItems, // Export regular items function
    
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
    getHazardSpawnChance,
    getReinforcedWallChance,
    
    // Deeper mine helpers
    isDeeperMine,
    getDeeperMineLevel,
    getDeeperMineModifiers
};

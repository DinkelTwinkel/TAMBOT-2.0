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
        oreSpawnMultiplier: 1.5,
        rareOreBonus: 0.025,
        treasureChance: 0.03,
        speedBonus: 1.2,
        valueMultiplier: 1.5
    },
    4: {
        name: "Expert Expedition",
        description: "Advanced geological knowledge",
        oreSpawnMultiplier: 1.7,
        rareOreBonus: 0.035,
        treasureChance: 0.04,
        speedBonus: 1.3,
        valueMultiplier: 2.0
    },
    5: {
        name: "Master Expedition",
        description: "Volcanic mining specialization", 
        oreSpawnMultiplier: 2.0,
        rareOreBonus: 0.05,
        treasureChance: 0.06,
        speedBonus: 1.5,
        valueMultiplier: 2.5
    },
    6: {
        name: "Legendary Expedition",
        description: "Mythical ore sensitivity",
        oreSpawnMultiplier: 2.3,
        rareOreBonus: 0.07,
        treasureChance: 0.08,
        speedBonus: 1.7,
        valueMultiplier: 3.0
    },
    7: {
        name: "Abyssal Expedition",
        description: "Master of the deepest depths",
        oreSpawnMultiplier: 2.8,
        rareOreBonus: 0.5,
        treasureChance: 0.12,
        speedBonus: 2.0,
        valueMultiplier: 4.0
    }
};

// Enhanced tile types (treasure removed - now part of encounters)
const TILE_TYPES = {
    WALL: 'wall',
    FLOOR: 'floor', 
    ENTRANCE: 'entrance',
    WALL_WITH_ORE: 'wall_ore',
    RARE_ORE: 'rare_ore',
    REINFORCED_WALL: 'reinforced'
};

// Encounter Types (hazards and treasures)
const ENCOUNTER_TYPES = {
    PORTAL_TRAP: 'portal_trap',
    BOMB_TRAP: 'bomb_trap',
    GREEN_FOG: 'green_fog',
    WALL_TRAP: 'wall_trap',
    FIRE_BLAST: 'fire_blast',  // Added for Ruby mines
    TREASURE: 'treasure',
    RARE_TREASURE: 'rare_treasure'
};

// Keep legacy HAZARD_TYPES for backward compatibility
const HAZARD_TYPES = {
    PORTAL_TRAP: 'portal_trap',
    BOMB_TRAP: 'bomb_trap',
    GREEN_FOG: 'green_fog',
    WALL_TRAP: 'wall_trap',
    FIRE_BLAST: 'fire_blast'  // Added for Ruby mines
};

// Encounter Configurations (includes hazards and treasures)
const ENCOUNTER_CONFIG = {
    [ENCOUNTER_TYPES.PORTAL_TRAP]: {
        name: 'Portal Trap',
        symbol: '⊕',
        color: '#9932CC',  // Purple
        image: 'portal_trap',  // Image filename without extension
        description: 'Teleports to random location',
        powerRequirement: 1,
        weight: 30,
        isHazard: true
    },
    [ENCOUNTER_TYPES.BOMB_TRAP]: {
        name: 'Bomb Trap',
        symbol: '💣',
        color: '#FF4500',  // Orange Red
        image: 'bomb_trap',  // Image filename without extension
        description: 'Explodes surrounding walls, knocks out player for 5 minutes',
        powerRequirement: 2,
        weight: 25,
        blastRadius: 2,
        knockoutDuration: 5 * 60 * 1000,  // 5 minutes in milliseconds
        isHazard: true
    },
    [ENCOUNTER_TYPES.GREEN_FOG]: {
        name: 'Toxic Fog',
        symbol: '☁',
        color: '#00FF00',  // Green
        image: 'toxic_fog',  // Image filename without extension
        description: 'Damages equipment durability',
        powerRequirement: 3,
        weight: 20,
        durabilityDamage: 1,
        isHazard: true
    },
    [ENCOUNTER_TYPES.WALL_TRAP]: {
        name: 'Wall Trap',
        symbol: '▦',
        color: '#8B4513',  // Saddle Brown
        image: 'wall_trap',  // Image filename without extension
        description: 'Converts floors to walls',
        powerRequirement: 4,
        weight: 15,
        isHazard: true
    },
    [ENCOUNTER_TYPES.FIRE_BLAST]: {
        name: 'Fire Blast',
        symbol: '🔥',
        color: '#FF4500',  // Orange Red
        image: 'fire_blast',  // Image filename without extension
        description: 'Erupts in flames, damaging equipment and knocking out players',
        powerRequirement: 4,
        weight: 20,
        damageRadius: 2,
        knockoutDuration: 3 * 60 * 1000,  // 3 minutes
        durabilityDamage: 2,  // Damages equipment durability
        isHazard: true
    },
    [ENCOUNTER_TYPES.TREASURE]: {
        name: 'Treasure Chest',
        symbol: '💰',
        color: '#FFD700',  // Gold
        image: 'treasure_chest',  // Image filename without extension
        description: 'Contains valuable items and resources',
        powerRequirement: 1,
        weight: 2,
        isHazard: false,
        minItems: 1,
        maxItems: 3
    },
    [ENCOUNTER_TYPES.RARE_TREASURE]: {
        name: 'Rare Treasure',
        symbol: '👑',
        color: '#B8860B',  // Dark golden rod
        image: 'rare_treasure',  // Image filename without extension
        description: 'Contains rare and epic items',
        powerRequirement: 3,
        weight: 1,
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
    [HAZARD_TYPES.FIRE_BLAST]: ENCOUNTER_CONFIG[ENCOUNTER_TYPES.FIRE_BLAST]
};

// Power level encounter spawn configurations (includes hazards and treasures)
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
        availableTypes: [ENCOUNTER_TYPES.PORTAL_TRAP, ENCOUNTER_TYPES.BOMB_TRAP, ENCOUNTER_TYPES.GREEN_FOG, ENCOUNTER_TYPES.WALL_TRAP, ENCOUNTER_TYPES.FIRE_BLAST, ENCOUNTER_TYPES.TREASURE, ENCOUNTER_TYPES.RARE_TREASURE] 
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
    4: { spawnChance: 0.025, availableTypes: [HAZARD_TYPES.PORTAL_TRAP, HAZARD_TYPES.BOMB_TRAP, HAZARD_TYPES.GREEN_FOG, HAZARD_TYPES.WALL_TRAP, HAZARD_TYPES.FIRE_BLAST] },
    5: { spawnChance: 0.03, availableTypes: Object.values(HAZARD_TYPES) },
    6: { spawnChance: 0.035, availableTypes: Object.values(HAZARD_TYPES) },
    7: { spawnChance: 0.04, availableTypes: Object.values(HAZARD_TYPES) }
};

// Item Finding Pool Configuration - Separate from ore mining
const ITEM_FINDING_CONFIG = {
    // Base chance to find an item while mining (before power/luck modifiers)
    baseItemFindChance: 0.00005, // 0.005% base chance - very low to allow scaling to 0.01-0.1%
    
    // Chance multipliers based on activity
    activityMultipliers: {
        mining: 1.0,        // Normal mining
        treasure: 3.0,      // Opening treasure chests
        exploration: 0.5,   // Just walking around
        hazard: 2.0        // Triggering hazards sometimes gives items
    },
    
    // Power level multipliers for item finding
    powerLevelMultipliers: {
        1: 1.0,
        2: 1.2,
        3: 1.5,
        4: 1.8,
        5: 2.2,
        6: 2.7,
        7: 3.5
    },
    
    // Unique item spawn weight (vs regular items)
    uniqueItemWeight: 1.0, // 100% of found items will be unique (if available)
    
    // Regular items that can be found (separate from ores)
    regularItemPool: [
        { itemId: "4", name: "Mining Bun", weight: 30, minPower: 1, maxPower: 3 },
        { itemId: "3", name: "Rusty Pickaxe", weight: 25, minPower: 1, maxPower: 3 },
        { itemId: "28", name: "Miner's Headlamp", weight: 8, minPower: 2, maxPower: 7 },
        { itemId: "29", name: "Crystal Lens Goggles", weight: 5, minPower: 4, maxPower: 7 },
        { itemId: "37", name: "Hermes Boots", weight: 7, minPower: 3, maxPower: 7 },
        { itemId: "7", name: "Worn Pickaxe", weight: 10, minPower: 2, maxPower: 6 },
        { itemId: "32", name: "Lucky Charm", weight: 3, minPower: 4, maxPower: 7 },
    ]
};

// Function to calculate item find chance - Updated to match new unique drop rates
function calculateItemFindChance(powerLevel, luckStat, activityType = 'mining') {
    // For unique item finding, use consistent rates with main mining system
    if (activityType === 'mining') {
        // Base 0.01% with luck scaling to 0.1% (same as main mining system)
        const baseChance = 0.0001; // 0.01%
        const luckBonus = Math.min(0.0009, luckStat * 0.000009); // Cap at +0.09% from luck
        return baseChance + luckBonus;
    }
    
    // For other activities, use the original system
    const baseChance = ITEM_FINDING_CONFIG.baseItemFindChance;
    const activityMult = ITEM_FINDING_CONFIG.activityMultipliers[activityType] || 1.0;
    const powerMult = ITEM_FINDING_CONFIG.powerLevelMultipliers[powerLevel] || 1.0;
    const luckBonus = 1 + (luckStat * 0.01);
    
    return baseChance * activityMult * powerMult * luckBonus;
}

// Function to get available regular items for power level
function getAvailableRegularItems(powerLevel) {
    return ITEM_FINDING_CONFIG.regularItemPool.filter(
        item => item.minPower <= powerLevel && item.maxPower >= powerLevel
    );
}

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
    { 
        itemId: "103", 
        name: "Ancient Fossil", 
        baseWeight: 20, 
        boostedPowerLevel: 2, 
        value: 8, 
        tier: 'uncommon',
        powerRequirement: 2,
        description: "Prehistoric remains preserved in stone"
    },
    
    // Power Level 3 - Rare tier
    { 
        itemId: "23", 
        name: "Emerald Gem", 
        baseWeight: 20, 
        boostedPowerLevel: 3, 
        value: 12, 
        tier: 'rare',
        powerRequirement: 3,
        description: "Mystical green stone pulsing with natural energy"
    },
    
    // Power Level 3 - Rare tier (Diamonds)
    { 
        itemId: "6", 
        name: "Diamond Gem", 
        baseWeight: 20, 
        boostedPowerLevel: 3, 
        value: 25, 
        tier: 'rare',
        powerRequirement: 3,
        description: "Perfect crystalline carbon, hardest natural substance"
    },
    
    // Power Level 4 - Epic tier
    { 
        itemId: "24", 
        name: "Ruby Gem", 
        baseWeight: 15, 
        boostedPowerLevel: 4, 
        value: 30, 
        tier: 'epic',
        powerRequirement: 4,
        description: "Fiery red crystal forged in volcanic depths"
    },
    { 
        itemId: "102", 
        name: "Crystal Ore", 
        baseWeight: 15, 
        boostedPowerLevel: 4, 
        value: 28, 
        tier: 'epic',
        powerRequirement: 4,
        description: "Iridescent crystal pulsing with magical energy"
    },
    
    // Power Level 5 - Epic tier (Advanced)
    { 
        itemId: "25", 
        name: "Obsidian", 
        baseWeight: 12, 
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
        baseWeight: 10, 
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
        baseWeight: 8, 
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
        specialBonus: "Massive coal deposits discovered",
        itemBonuses: { 
            "1": 5.0,  // 5x coal spawn rate
            "21": 0.3  // Less copper in coal mines
        }
    },
    "copperQuarry": {
        powerLevel: 1, 
        specialBonus: "Rich copper veins throughout",
        itemBonuses: { 
            "21": 5.0,  // 5x copper spawn rate
            "1": 0.3    // Less coal in copper quarry
        }
    },
    "topazMine": {
        powerLevel: 2,
        specialBonus: "Topaz crystals everywhere", 
        itemBonuses: { 
            "2": 4.5,   // 4.5x topaz spawn rate
            "22": 0.4   // Less iron in topaz mine
        }
    },
    "ironStronghold": {
        powerLevel: 2,
        specialBonus: "Industrial iron production",
        itemBonuses: { 
            "22": 4.5,  // 4.5x iron spawn rate
            "2": 0.4    // Less topaz in iron stronghold
        }
    },
    "diamondMines": {
        powerLevel: 3,
        specialBonus: "Diamond-rich formations",
        itemBonuses: { 
            "6": 4.0,   // 4x diamond spawn rate
            "23": 0.5,  // Less emerald
            "24": 0.5   // Less ruby
        }
    },
    "emeraldCaverns": {
        powerLevel: 3,
        specialBonus: "Emerald energy saturated caves",
        itemBonuses: { 
            "23": 4.0,  // 4x emerald spawn rate
            "6": 0.5,   // Less diamond
            "24": 0.5   // Less ruby
        }
    },
    "rubyDepths": {
        powerLevel: 4,
        specialBonus: "Volcanic ruby formations",
        itemBonuses: { 
            "24": 4.0,  // 4x ruby spawn rate
            "102": 0.5  // Less crystal
        }
    },
    "crystalGrottos": {
        powerLevel: 4,
        specialBonus: "Magical crystal convergence",
        itemBonuses: { 
            "102": 4.0, // 4x crystal spawn rate
            "24": 0.5   // Less ruby
        }
    },
    "obsidianForge": {
        powerLevel: 5,
        specialBonus: "Volcanic obsidian flows",
        itemBonuses: { 
            "25": 5.0   // 5x obsidian spawn rate
        }
    },
    "mythrilSanctum": {
        powerLevel: 6,
        specialBonus: "Divine mythril blessings",
        itemBonuses: { 
            "26": 5.0   // 5x mythril spawn rate
        }
    },
    "adamantiteAbyss": {
        powerLevel: 7,
        specialBonus: "Abyssal adamantite core",
        itemBonuses: { 
            "27": 6.0   // 6x adamantite spawn rate
        }
    },
    "fossilExcavation": {
        powerLevel: 2,
        specialBonus: "Archaeological treasure trove",
        itemBonuses: { 
            "103": 4.5,  // 4.5x fossil spawn rate
            "22": 0.4,   // Less iron
            "2": 0.4     // Less topaz
        }
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

// Function to get hazard type based on power level
function getHazardTypeForPowerLevel(powerLevel) {
    const config = HAZARD_SPAWN_CONFIG[powerLevel] || HAZARD_SPAWN_CONFIG[1];
    const availableTypes = config.availableTypes;
    
    if (!availableTypes || availableTypes.length === 0) return null;
    
    // Weighted random selection
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

// Function to get encounter type based on power level (replaces getHazardTypeForPowerLevel)
function getEncounterTypeForPowerLevel(powerLevel) {
    const config = ENCOUNTER_SPAWN_CONFIG[powerLevel] || ENCOUNTER_SPAWN_CONFIG[1];
    const availableTypes = config.availableTypes;
    
    if (!availableTypes || availableTypes.length === 0) return null;
    
    // Weighted random selection
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

module.exports = {
    ITEM_FINDING_CONFIG,
    calculateItemFindChance,
    getAvailableRegularItems,
    INITIAL_MAP_WIDTH,
    INITIAL_MAP_HEIGHT,
    BASE_ORE_SPAWN_CHANCE,
    RARE_ORE_SPAWN_CHANCE,
    IMAGE_GENERATION_INTERVAL,
    MAX_SPEED_ACTIONS,
    MAX_MAP_SIZE,
    EXPLORATION_BONUS_CHANCE,
    TILE_TYPES,
    ENCOUNTER_TYPES,
    ENCOUNTER_CONFIG,
    ENCOUNTER_SPAWN_CONFIG,
    // Legacy exports for backward compatibility
    HAZARD_TYPES,
    HAZARD_CONFIG,
    HAZARD_SPAWN_CONFIG,
    miningItemPool,
    treasureItems,
    POWER_LEVEL_CONFIG,
    SERVER_POWER_MODIFIERS,
    calculateMiningEfficiency,
    getAvailableItems,
    getAvailableTreasures,
    getEncounterTypeForPowerLevel,
    getEncounterSpawnChance,
    // Legacy function names for backward compatibility
    getHazardTypeForPowerLevel: getEncounterTypeForPowerLevel,
    getHazardSpawnChance: getEncounterSpawnChance
};
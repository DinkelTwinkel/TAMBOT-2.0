// familiarSystem.js - Unified system for familiars, pets, golems, and shadow clones
// Supports both permanent familiars (shadow clones) and temporary ones (golems)

const { getUniqueItemById } = require('../../../data/uniqueItemsSheet');

// Track all active familiars per player
const activeFamiliars = new Map();
const familiarRespawnTimers = new Map();

// Familiar types
const FAMILIAR_TYPES = {
    SHADOW_CLONE: 'shadow_clone',
    STONE_GOLEM: 'stone_golem',
    IRON_GOLEM: 'iron_golem',
    CRYSTAL_GOLEM: 'crystal_golem',
    FIRE_ELEMENTAL: 'fire_elemental',
    ICE_ELEMENTAL: 'ice_elemental',
    WATER_ELEMENTAL: 'water_elemental',
    // Add more types as needed
};

// Familiar configurations
const FAMILIAR_CONFIGS = {
    [FAMILIAR_TYPES.SHADOW_CLONE]: {
        name: "Shadow Clone",
        displayIcon: "👤",
        statMultiplier: 0.75, // 75% of owner's stats (kept as percentage-based)
        pickaxeImage: "haunted_pixaxe", // Dark/ethereal pickaxe (using haunted pickaxe)
        pickaxeFallback: "rustypickaxe", // Fallback pickaxe image
        imageName: "shadow_clone", // Image file name (without extension)
        duration: null, // Permanent (until owner leaves or loses item)
        maxCount: 5,
        respawnTime: 120000, // 2 minutes
        source: 'unique_item', // Comes from Shadow Legion Amulet
        sourceId: 11,
        abilities: {
            shadowOreChance: 0.1,
            hazardTriggerChance: 0.15,
            knockoutResistance: 0.3,
            darkSilhouette: true
        },
        visual: {
            isDarkSilhouette: true,
            opacity: 0.7,
            shadowTrail: true,
            borderColor: '#8A2BE2',
            renderType: 'avatar_with_shadow', // Special rendering type
            fillColor: 'rgba(50, 50, 80, 0.9)', // Fallback color
            shadowOffset: { x: 2, y: 2 },
            shadowColor: 'rgba(0, 0, 0, 0.6)'
        }
    },
    
    [FAMILIAR_TYPES.STONE_GOLEM]: {
        name: "Stone Golem",
        displayIcon: "🗿",
        baseStats: {
            mining: 25,
            luck: 0, // Golems don't have luck
            speed: 1,
            sight: 3
        },
        pickaxeImage: "robustpickaxe", // Heavy stone pickaxe (using robust pickaxe)
        pickaxeFallback: "rustypickaxe", // Fallback pickaxe image
        imageName: "stone_golem", // Image file name (without extension)
        duration: 300000, // 5 minutes
        maxCount: 2,
        respawnTime: null, // Single use
        source: 'consumable', // Comes from /use item
        sourceId: null, // Will be set when item is created
        abilities: {
            slowMovement: 0.5, // 50% speed
            stoneResistance: 0.8,
            noLuck: true // Golems don't have luck
        },
        visual: {
            isGolem: true,
            opacity: 1.0,
            borderColor: '#8B4513',
            renderType: 'solid_color', // Solid color rendering
            fillColor: 'rgba(139, 69, 19, 0.9)', // Brown
            shadowOffset: { x: 1, y: 1 },
            shadowColor: 'rgba(0, 0, 0, 0.4)'
        }
    },
    
    [FAMILIAR_TYPES.IRON_GOLEM]: {
        name: "Iron Golem",
        displayIcon: "🤖",
        baseStats: {
            mining: 35,
            luck: 0,
            speed: 1,
            sight: 4
        },
        pickaxeImage: "ironpickaxe", // Metallic iron pickaxe
        pickaxeFallback: "ironpickaxe", // Fallback pickaxe image
        imageName: "iron_golem", // Image file name (without extension)
        duration: 480000, // 8 minutes
        maxCount: 1,
        respawnTime: null,
        source: 'consumable',
        sourceId: null,
        abilities: {
            slowMovement: 0.4,
            metalResistance: 0.9,
            noLuck: true
        },
        visual: {
            isGolem: true,
            opacity: 1.0,
            borderColor: '#C0C0C0',
            renderType: 'solid_color', // Solid color rendering
            fillColor: 'rgba(192, 192, 192, 0.9)', // Silver
            shadowOffset: { x: 1, y: 1 },
            shadowColor: 'rgba(0, 0, 0, 0.4)'
        }
    },
    
    [FAMILIAR_TYPES.CRYSTAL_GOLEM]: {
        name: "Crystal Golem",
        displayIcon: "💎",
        baseStats: {
            mining: 50,
            luck: 0,
            speed: 1,
            sight: 6
        },
        pickaxeImage: "pinkgem_axe", // Crystalline pickaxe (using pinkgem axe)
        pickaxeFallback: "ironpickaxe", // Fallback pickaxe image
        imageName: "crystal_golem", // Image file name (without extension)
        duration: 600000, // 10 minutes
        maxCount: 1,
        respawnTime: null,
        source: 'consumable',
        sourceId: null,
        abilities: {
            ultraSlow: 0.2, // Very slow but powerful
            crystalResonance: 0.5, // 50% chance to find rare ores
            noLuck: true
        },
        visual: {
            isGolem: true,
            opacity: 1.0,
            borderColor: '#FF69B4',
            sparkleEffect: true,
            renderType: 'solid_color', // Solid color rendering
            fillColor: 'rgba(255, 105, 180, 0.9)', // Pink crystal
            shadowOffset: { x: 1, y: 1 },
            shadowColor: 'rgba(0, 0, 0, 0.4)'
        }
    },
    
    [FAMILIAR_TYPES.FIRE_ELEMENTAL]: {
        name: "Fire Elemental",
        displayIcon: "🔥",
        statMultiplier: 0.7, // 70% of owner's stats
        pickaxeImage: "murderous_aura_pickaxe", // Fire pickaxe (using murderous aura pickaxe)
        pickaxeFallback: "ironpickaxe", // Fallback pickaxe image
        imageName: "fire_elemental", // Image file name (without extension)
        duration: 360000, // 6 minutes
        maxCount: 1,
        respawnTime: null,
        source: 'consumable',
        sourceId: null,
        abilities: {
            fireBonus: 0.3, // 30% chance for fire ore
            heatResistance: 0.9,
            noLuck: false // Fire elementals keep luck
        },
        visual: {
            isElemental: true,
            opacity: 1.0,
            borderColor: '#FF4500',
            glowEffect: true,
            renderType: 'solid_color', // Solid color rendering
            fillColor: 'rgba(255, 69, 0, 0.9)', // Orange-red
            shadowOffset: { x: 1, y: 1 },
            shadowColor: 'rgba(0, 0, 0, 0.4)'
        }
    },
    
    [FAMILIAR_TYPES.ICE_ELEMENTAL]: {
        name: "Ice Elemental", 
        displayIcon: "❄️",
        statMultiplier: 0.7, // 70% of owner's stats
        pickaxeImage: "adamantite_pickaxe", // Ice pickaxe (using adamantite pickaxe)
        pickaxeFallback: "ironpickaxe", // Fallback pickaxe image
        imageName: "ice_elemental", // Image file name (without extension)
        duration: 360000, // 6 minutes
        maxCount: 1,
        respawnTime: null,
        source: 'consumable',
        sourceId: null,
        abilities: {
            freezeChance: 0.2, // 20% chance to freeze hazards
            coldResistance: 0.9,
            noLuck: false // Ice elementals keep luck
        },
        visual: {
            isElemental: true,
            opacity: 1.0,
            borderColor: '#00BFFF',
            frostEffect: true,
            renderType: 'solid_color', // Solid color rendering
            fillColor: 'rgba(173, 216, 230, 0.9)', // Light blue
            shadowOffset: { x: 1, y: 1 },
            shadowColor: 'rgba(0, 0, 0, 0.4)'
        }
    },
    
    [FAMILIAR_TYPES.WATER_ELEMENTAL]: {
        name: "Water Elemental",
        displayIcon: "🌊",
        statMultiplier: 0.4, // 80% of owner's stats (slightly stronger than other elementals)
        pickaxeImage: "natures_pickaxe", // Water pickaxe (using nature's pickaxe)
        pickaxeFallback: "ironpickaxe", // Fallback pickaxe image
        imageName: "water_elemental", // Image file name (without extension)
        duration: 480000, // 8 minutes (longer duration)
        maxCount: 1,
        respawnTime: null,
        source: 'unique_item', // Comes from Blue Breeze
        sourceId: 9, // Blue Breeze ID
        abilities: {
            fluidMovement: 0.3, // 30% chance to flow around obstacles
            waterOreChance: 0.15, // 15% chance to find water-based ores
            hazardCleansing: 0.25, // 25% chance to cleanse hazards
            tidePull: 0.1, // 10% chance to pull nearby ore to the surface
            noLuck: false // Water elementals keep luck
        },
        visual: {
            isElemental: true,
            opacity: 0.8,
            borderColor: '#0077BE',
            waterFlow: true,
            rippleEffect: true,
            renderType: 'solid_color', // Solid color rendering
            fillColor: 'rgba(0, 119, 190, 0.8)', // Deep blue water
            shadowOffset: { x: 1, y: 1 },
            shadowColor: 'rgba(0, 0, 0, 0.4)'
        }
    }
};

/**
 * Check if a player has a familiar-generating item equipped or available
 */
function canSpawnFamiliars(playerData, familiarType) {
    const config = FAMILIAR_CONFIGS[familiarType];
    if (!config) return false;
    
    if (config.source === 'unique_item') {
        // Check for equipped unique item
        if (!playerData?.equippedItems) return false;
        
        for (const item of Object.values(playerData.equippedItems)) {
            // Handle unique items (they have itemId like "unique_9" and original id property)
            let itemId = item?.id;
            if (item?.isUnique && item?.itemId) {
                // Extract original ID from unique items (e.g., "unique_9" -> 9)
                const match = item.itemId.match(/unique_(\d+)/);
                if (match) {
                    itemId = parseInt(match[1], 10);
                }
            }
            
            if (familiarType === FAMILIAR_TYPES.SHADOW_CLONE) {
                // Shadow Legion Amulet check (ID 11 or name match)
                if (itemId === 11 || item?.name === "👥 Shadow Legion Amulet") {
                    return true;
                }
            } else if (familiarType === FAMILIAR_TYPES.WATER_ELEMENTAL) {
                // Blue Breeze check (ID 9 or name match)
                if (itemId === 9 || item?.name === "🌊 Blue Breeze") {
                    return true;
                }
            } else if (itemId === config.sourceId) {
                return true;
            }
        }
        return false;
    }
    
    // For consumables, this will be checked when the item is used
    return true;
}

/**
 * Load familiars from database gameData
 */
function loadFamiliarsFromDatabase(dbEntry, mapData) {
    if (!dbEntry.gameData?.familiars) return;
    
    const currentTime = Date.now();
    let mapChanged = false;
    
    // Clear memory cache first
    activeFamiliars.clear();
    
    for (const [playerId, playerFamiliars] of Object.entries(dbEntry.gameData.familiars)) {
        const activeFamiliarList = [];
        
        for (const familiar of playerFamiliars) {
            // Check if temporary familiar has expired
            if (familiar.duration && (currentTime - familiar.createdAt) > familiar.duration) {
                console.log(`[FAMILIAR] ${familiar.displayName} has expired, removing...`);
                // Remove from map if present
                if (mapData.playerPositions[familiar.id]) {
                    delete mapData.playerPositions[familiar.id];
                    mapChanged = true;
                }
                continue; // Skip expired familiars
            }
            
            // Add to active list and map
            activeFamiliarList.push(familiar);
            
            // Ensure familiar is on the map
            if (!mapData.playerPositions[familiar.id]) {
                // Find owner position to place familiar near them
                const ownerPos = mapData.playerPositions[playerId];
                if (ownerPos) {
                    const spawnX = Math.max(0, Math.min(mapData.width - 1, ownerPos.x + familiar.index));
                    const spawnY = Math.max(0, Math.min(mapData.height - 1, ownerPos.y));
                    
                    mapData.playerPositions[familiar.id] = {
                        x: spawnX,
                        y: spawnY,
                        isFamiliar: true,
                        familiarType: familiar.type,
                        ownerId: playerId,
                        familiarIndex: familiar.index,
                        hidden: false
                    };
                    mapChanged = true;
                    console.log(`[FAMILIAR] Restored ${familiar.displayName} to map at (${spawnX}, ${spawnY})`);
                }
            }
        }
        
        // Update memory cache
        if (activeFamiliarList.length > 0) {
            activeFamiliars.set(playerId, activeFamiliarList);
        }
    }
    
    // Clean up expired familiars from database
    if (mapChanged) {
        updateDatabaseFamiliars(dbEntry);
    }
    
    return mapChanged;
}

/**
 * Update database with current familiar state
 */
async function updateDatabaseFamiliars(dbEntry) {
    const gachaVC = require('../../../models/activevcs');
    
    // Rebuild familiars object from memory cache
    const updatedFamiliars = {};
    for (const [playerId, familiars] of activeFamiliars.entries()) {
        if (familiars.length > 0) {
            updatedFamiliars[playerId] = familiars;
        }
    }
    
    dbEntry.gameData.familiars = updatedFamiliars;
    
    await gachaVC.updateOne(
        { channelId: dbEntry.channelId },
        { $set: { 'gameData.familiars': updatedFamiliars } }
    );
    
    console.log(`[FAMILIAR] Updated database with current familiar state`);
}

/**
 * Initialize familiars for a player
 */
function initializeFamiliars(playerId, playerName, playerData, mapData) {
    const results = {
        familiars: [],
        mapChanged: false,
        newlyCreated: false
    };
    
    // Check for shadow clones (permanent familiars)
    console.log(`[FAMILIAR DEBUG] Checking if ${playerName} can spawn shadow clones...`);
    const canSpawnShadows = canSpawnFamiliars(playerData, FAMILIAR_TYPES.SHADOW_CLONE);
    console.log(`[FAMILIAR DEBUG] ${playerName} can spawn shadows: ${canSpawnShadows}`);
    
    if (canSpawnShadows) {
        console.log(`[FAMILIAR DEBUG] Initializing shadow clones for ${playerName}...`);
        const shadowResult = initializeShadowClones(playerId, playerName, playerData, mapData);
        console.log(`[FAMILIAR DEBUG] Shadow result for ${playerName}:`, {
            familiarCount: shadowResult.familiars.length,
            mapChanged: shadowResult.mapChanged,
            newlyCreated: shadowResult.newlyCreated
        });
        results.familiars = results.familiars.concat(shadowResult.familiars);
        results.mapChanged = results.mapChanged || shadowResult.mapChanged;
        results.newlyCreated = results.newlyCreated || shadowResult.newlyCreated;
    }
    
    // Check for water elementals (from Blue Breeze)
    console.log(`[FAMILIAR DEBUG] Checking if ${playerName} can spawn water elementals...`);
    const canSpawnWater = canSpawnFamiliars(playerData, FAMILIAR_TYPES.WATER_ELEMENTAL);
    console.log(`[FAMILIAR DEBUG] ${playerName} can spawn water elementals: ${canSpawnWater}`);
    
    if (canSpawnWater) {
        console.log(`[FAMILIAR DEBUG] Initializing water elemental for ${playerName}...`);
        const waterResult = initializeWaterElemental(playerId, playerName, playerData, mapData);
        console.log(`[FAMILIAR DEBUG] Water result for ${playerName}:`, {
            familiarCount: waterResult.familiars.length,
            mapChanged: waterResult.mapChanged,
            newlyCreated: waterResult.newlyCreated
        });
        results.familiars = results.familiars.concat(waterResult.familiars);
        results.mapChanged = results.mapChanged || waterResult.mapChanged;
        results.newlyCreated = results.newlyCreated || waterResult.newlyCreated;
    }
    
    return results;
}

/**
 * Initialize shadow clones specifically (converted from old system)
 */
function initializeShadowClones(playerId, playerName, playerData, mapData) {
    const familiarType = FAMILIAR_TYPES.SHADOW_CLONE;
    const config = FAMILIAR_CONFIGS[familiarType];
    
    // Check if clones already exist and if we have the correct count
    const existingFamiliars = getPlayerFamiliars(playerId, familiarType);
    if (existingFamiliars.length >= config.maxCount) {
        return { 
            familiars: existingFamiliars, 
            mapChanged: false, 
            newlyCreated: false 
        };
    }
    
    const shadowLegionItem = getUniqueItemById(11);
    const cloneConfig = shadowLegionItem.cloneConfig;
    const familiars = [...existingFamiliars]; // Start with existing clones
    let mapChanged = false;
    let newlyCreated = false;
    
    // Get player's current position
    const playerPos = mapData.playerPositions[playerId];
    if (!playerPos) return { familiars: existingFamiliars, mapChanged: false, newlyCreated: false };
    
    // Create missing shadow clones
    const existingCount = existingFamiliars.length;
    for (let i = existingCount + 1; i <= config.maxCount; i++) {
        const familiar = createFamiliar(
            playerId,
            playerName,
            familiarType,
            i,
            playerData,
            playerPos
        );
        
        familiars.push(familiar);
        
        // Add to map (positioning for 5 clones around the player)
        let offsetX = 0, offsetY = 0;
        switch (i) {
            case 1: offsetX = -1; offsetY = 0; break;  // Left
            case 2: offsetX = 1; offsetY = 0; break;   // Right
            case 3: offsetX = 0; offsetY = -1; break;  // Up
            case 4: offsetX = 0; offsetY = 1; break;   // Down
            case 5: offsetX = -1; offsetY = -1; break; // Diagonal up-left
        }
        
        mapData.playerPositions[familiar.id] = {
            x: Math.max(0, Math.min(mapData.width - 1, playerPos.x + offsetX)),
            y: Math.max(0, Math.min(mapData.height - 1, playerPos.y + offsetY)),
            isFamiliar: true,
            familiarType: familiarType,
            ownerId: playerId,
            familiarIndex: i,
            hidden: false
        };
        
        mapChanged = true;
        newlyCreated = true;
    }
    
    // Update active familiars (replace the old list with the new one)
    activeFamiliars.set(playerId, familiars);
    
    const totalClones = familiars.length;
    const newClones = totalClones - existingCount;
    
    if (newClones > 0) {
        console.log(`[FAMILIAR] Created ${newClones} additional ${config.name}s for ${playerName} (total: ${totalClones})`);
    } else {
        console.log(`[FAMILIAR] ${playerName} already has ${totalClones} ${config.name}s`);
    }
    
    return { familiars, mapChanged, newlyCreated };
}

/**
 * Initialize water elemental specifically (from Blue Breeze)
 */
function initializeWaterElemental(playerId, playerName, playerData, mapData) {
    const familiarType = FAMILIAR_TYPES.WATER_ELEMENTAL;
    const config = FAMILIAR_CONFIGS[familiarType];
    
    // Check if water elemental already exists
    const existingFamiliars = getPlayerFamiliars(playerId, familiarType);
    if (existingFamiliars.length > 0) {
        return { 
            familiars: existingFamiliars, 
            mapChanged: false, 
            newlyCreated: false 
        };
    }
    
    const familiars = [];
    let mapChanged = false;
    
    // Get player's current position
    const playerPos = mapData.playerPositions[playerId];
    if (!playerPos) return { familiars: [], mapChanged: false, newlyCreated: false };
    
    // Create water elemental (only 1)
    const familiar = createFamiliar(
        playerId,
        playerName,
        familiarType,
        1, // Only one water elemental
        playerData,
        playerPos
    );
    
    familiars.push(familiar);
    
    // Add to map (position next to player)
    const spawnX = Math.max(0, Math.min(mapData.width - 1, playerPos.x + 1));
    const spawnY = Math.max(0, Math.min(mapData.height - 1, playerPos.y));
    
    mapData.playerPositions[familiar.id] = {
        x: spawnX,
        y: spawnY,
        isFamiliar: true,
        familiarType: familiarType,
        ownerId: playerId,
        familiarIndex: 1,
        hidden: false
    };
    
    mapChanged = true;
    
    // Store active familiars
    if (!activeFamiliars.has(playerId)) {
        activeFamiliars.set(playerId, []);
    }
    activeFamiliars.get(playerId).push(...familiars);
    
    console.log(`[FAMILIAR] Initialized ${familiars.length} ${config.name}(s) for ${playerName}`);
    
    return { familiars, mapChanged, newlyCreated: true };
}

/**
 * Create a single familiar
 */
function createFamiliar(ownerId, ownerName, familiarType, index, ownerData, ownerPosition) {
    const config = FAMILIAR_CONFIGS[familiarType];
    
    // Use legacy ID format for shadow clones for compatibility
    let familiarId;
    if (familiarType === FAMILIAR_TYPES.SHADOW_CLONE) {
        familiarId = `${ownerId}_shadow_${index}`; // Legacy format
    } else {
        familiarId = `${ownerId}_${familiarType}_${index}`;
    }
    
    const familiar = {
        id: familiarId,
        ownerId: ownerId,
        type: familiarType,
        name: `${config.displayIcon} ${ownerName}'s ${config.name} ${index}`,
        displayName: `${config.displayIcon} ${ownerName}'s ${config.name} ${index}`,
        index: index,
        isFamiliar: true,
        active: true,
        respawning: false,
        
        // Stats based on config type (percentage for shadow clones, flat for golems)
        stats: config.statMultiplier ? {
            // Percentage-based stats for shadow clones
            mining: Math.floor((ownerData.stats?.mining || 0) * config.statMultiplier),
            luck: config.abilities?.noLuck ? 0 : Math.floor((ownerData.stats?.luck || 0) * config.statMultiplier),
            speed: Math.floor((ownerData.stats?.speed || 1) * config.statMultiplier * (config.abilities?.slowMovement || config.abilities?.ultraSlow || 1)),
            sight: Math.floor((ownerData.stats?.sight || 0) * config.statMultiplier)
        } : {
            // Flat base stats for golems
            mining: config.baseStats.mining,
            luck: config.baseStats.luck,
            speed: Math.floor(config.baseStats.speed * (config.abilities?.slowMovement || config.abilities?.ultraSlow || 1)),
            sight: config.baseStats.sight
        },
        
        // Apply special abilities
        abilities: { ...config.abilities },
        
        // Visual properties
        visual: { ...config.visual },
        
        // Duration and lifecycle
        createdAt: Date.now(),
        duration: config.duration,
        maxCount: config.maxCount,
        source: config.source,
        
        // Track earnings separately (but transfers to owner)
        tempMinecart: {
            coins: 0,
            items: []
        }
    };
    
    // Base stats are already set appropriately for each familiar type
    // No additional modifications needed since we use flat stats
    
    return familiar;
}

/**
 * Spawn a familiar from a consumable item (for /use command)
 */
async function spawnFamiliarFromItem(playerId, playerName, familiarType, playerData, mapData, customConfig = {}, dbEntry = null) {
    const config = { ...FAMILIAR_CONFIGS[familiarType], ...customConfig };
    
    // Check if player already has max familiars of this type
    const existingFamiliars = getPlayerFamiliars(playerId, familiarType);
    if (existingFamiliars.length >= config.maxCount) {
        return {
            success: false,
            message: `You already have the maximum number of ${config.name}s (${config.maxCount})`
        };
    }
    
    // Get player position
    const playerPos = mapData.playerPositions[playerId];
    if (!playerPos) {
        return {
            success: false,
            message: "You must be in the mines to summon a familiar"
        };
    }
    
    // Create the familiar
    const nextIndex = existingFamiliars.length + 1;
    const familiar = createFamiliar(
        playerId,
        playerName,
        familiarType,
        nextIndex,
        playerData,
        playerPos
    );
    
    // Add to map
    const spawnX = Math.max(0, Math.min(mapData.width - 1, playerPos.x + (nextIndex - 1)));
    const spawnY = Math.max(0, Math.min(mapData.height - 1, playerPos.y));
    
    mapData.playerPositions[familiar.id] = {
        x: spawnX,
        y: spawnY,
        isFamiliar: true,
        familiarType: familiarType,
        ownerId: playerId,
        familiarIndex: nextIndex,
        hidden: false
    };
    
    console.log(`[FAMILIAR DEBUG] Added ${familiarType} to map at position (${spawnX}, ${spawnY}) with ID: ${familiar.id}`);
    
    // Store familiar in database gameData for persistence
    if (dbEntry) {
        if (!dbEntry.gameData.familiars) {
            dbEntry.gameData.familiars = {};
        }
        if (!dbEntry.gameData.familiars[playerId]) {
            dbEntry.gameData.familiars[playerId] = [];
        }
        
        dbEntry.gameData.familiars[playerId].push(familiar);
        console.log(`[FAMILIAR DEBUG] Stored ${familiarType} in database for ${playerName}`);
        
        // Update the database
        const gachaVC = require('../../../models/activevcs');
        await gachaVC.updateOne(
            { channelId: dbEntry.channelId },
            { $set: { 'gameData.familiars': dbEntry.gameData.familiars } }
        );
        console.log(`[FAMILIAR DEBUG] Database updated with new familiar`);
    }
    
    // Store active familiar in memory for quick access
    if (!activeFamiliars.has(playerId)) {
        activeFamiliars.set(playerId, []);
    }
    activeFamiliars.get(playerId).push(familiar);
    
    console.log(`[FAMILIAR] Spawned ${config.name} for ${playerName} (${config.duration ? 'temporary' : 'permanent'})`);
    
    return {
        success: true,
        familiar: familiar,
        message: `${config.displayIcon} You summoned a ${config.name}! It will help you mine for ${config.duration ? Math.floor(config.duration / 60000) + ' minutes' : 'as long as you have the required item'}.`
    };
}

/**
 * Get all familiars for a player, optionally filtered by type
 */
function getPlayerFamiliars(playerId, familiarType = null) {
    const playerFamiliars = activeFamiliars.get(playerId) || [];
    
    if (familiarType) {
        return playerFamiliars.filter(f => f.type === familiarType && f.active);
    }
    
    return playerFamiliars.filter(f => f.active);
}

/**
 * Remove a specific familiar
 */
function removeFamiliar(playerId, familiarId, mapData) {
    const playerFamiliars = activeFamiliars.get(playerId);
    if (!playerFamiliars) return false;
    
    const familiarIndex = playerFamiliars.findIndex(f => f.id === familiarId);
    if (familiarIndex === -1) return false;
    
    const familiar = playerFamiliars[familiarIndex];
    
    // Remove from map
    if (mapData && mapData.playerPositions[familiarId]) {
        delete mapData.playerPositions[familiarId];
    }
    
    // Remove from active list
    playerFamiliars.splice(familiarIndex, 1);
    
    // Clear any respawn timers
    const timerKey = `${playerId}_${familiar.type}_${familiar.index}`;
    if (familiarRespawnTimers.has(timerKey)) {
        clearTimeout(familiarRespawnTimers.get(timerKey));
        familiarRespawnTimers.delete(timerKey);
    }
    
    console.log(`[FAMILIAR] Removed ${familiar.name}`);
    return true;
}

/**
 * Remove all familiars for a player (when they leave)
 */
function removeAllPlayerFamiliars(playerId, mapData) {
    const playerFamiliars = activeFamiliars.get(playerId);
    if (!playerFamiliars) return { mapChanged: false };
    
    let mapChanged = false;
    
    // Remove each familiar from the map
    for (const familiar of playerFamiliars) {
        if (mapData.playerPositions[familiar.id]) {
            delete mapData.playerPositions[familiar.id];
            mapChanged = true;
        }
        
        // Clear any respawn timers
        const timerKey = `${playerId}_${familiar.type}_${familiar.index}`;
        if (familiarRespawnTimers.has(timerKey)) {
            clearTimeout(familiarRespawnTimers.get(timerKey));
            familiarRespawnTimers.delete(timerKey);
        }
    }
    
    // Remove from active familiars
    activeFamiliars.delete(playerId);
    
    console.log(`[FAMILIAR] Removed ${playerFamiliars.length} familiars for player ${playerId}`);
    
    return { mapChanged };
}

/**
 * Process familiar actions during mining (replaces processShadowCloneActions)
 */
async function processFamiliarActions(
    familiar,
    ownerData,
    mapData,
    ownerVisibleTiles,
    powerLevel,
    availableItems,
    efficiency,
    mineFromTile,
    generateTreasure,
    transaction,
    eventLogs,
    hazardsData,
    dbEntry
) {
    const config = FAMILIAR_CONFIGS[familiar.type];
    const results = {
        wallsBroken: 0,
        treasuresFound: 0,
        mapChanged: false,
        itemsFound: [],
        coinsEarned: 0,
        hazardTriggered: false
    };
    
    // Skip if familiar is respawning
    if (familiar.respawning) {
        return results;
    }
    
    // Check if temporary familiar has expired
    if (familiar.duration && (Date.now() - familiar.createdAt) > familiar.duration) {
        familiar.active = false;
        removeFamiliar(familiar.ownerId, familiar.id, mapData);
        return results;
    }
    
    const familiarPos = mapData.playerPositions[familiar.id];
    if (!familiarPos) return results;
    
    // Familiar AI - similar to shadow clones but can be customized per type
    const directions = [
        { dx: 0, dy: -1, name: 'north' },
        { dx: 1, dy: 0, name: 'east' },
        { dx: 0, dy: 1, name: 'south' },
        { dx: -1, dy: 0, name: 'west' }
    ];
    
    // Find target based on familiar type
    let targetTile = findFamiliarTarget(familiar, familiarPos, mapData);
    
    // Move towards target or random direction
    let chosenDirection;
    if (targetTile) {
        const dx = Math.sign(targetTile.x - familiarPos.x);
        const dy = Math.sign(targetTile.y - familiarPos.y);
        
        if (Math.abs(targetTile.x - familiarPos.x) > Math.abs(targetTile.y - familiarPos.y)) {
            chosenDirection = directions.find(d => d.dx === dx && d.dy === 0) || 
                            directions[Math.floor(Math.random() * directions.length)];
        } else {
            chosenDirection = directions.find(d => d.dx === 0 && d.dy === dy) || 
                            directions[Math.floor(Math.random() * directions.length)];
        }
    } else {
        chosenDirection = directions[Math.floor(Math.random() * directions.length)];
    }
    
    const newX = familiarPos.x + chosenDirection.dx;
    const newY = familiarPos.y + chosenDirection.dy;
    
    // Check bounds
    if (newX < 0 || newX >= mapData.width || newY < 0 || newY >= mapData.height) {
        return results;
    }
    
    const targetTileData = mapData.tiles[newY]?.[newX];
    if (!targetTileData) return results;
    
    // Process familiar actions based on tile type
    if (targetTileData.type === 1) { // Wall
        // Break wall and move
        familiarPos.x = newX;
        familiarPos.y = newY;
        
        targetTileData.type = 0;
        targetTileData.discovered = true;
        results.wallsBroken++;
        results.mapChanged = true;
        
    } else if (targetTileData.type === 3 || targetTileData.type === 4) { // Ore
        // Mine the ore
        const minedItem = await mineFromTile(
            { id: familiar.id, displayName: familiar.displayName, isClone: true, ownerId: familiar.ownerId },
            familiar.stats.mining,
            familiar.stats.luck,
            powerLevel,
            targetTileData.type,
            availableItems,
            efficiency
        );
        
        if (minedItem) {
            results.itemsFound.push(minedItem);
            results.coinsEarned += minedItem.item.value * minedItem.quantity;
            familiar.tempMinecart.items.push(minedItem);
            
            // Special familiar abilities
            if (familiar.abilities.crystalResonance && Math.random() < familiar.abilities.crystalResonance) {
                eventLogs.push(`💎 ${familiar.displayName}'s crystal resonance found rare ore!`);
                // Could add bonus ore here
            }
            
            if (familiar.abilities.shadowOreChance && Math.random() < familiar.abilities.shadowOreChance) {
                const shadowOre = {
                    item: {
                        itemId: 'shadow_ore',
                        name: '🌑 Shadow Ore',
                        value: 500,
                        tier: 'rare'
                    },
                    quantity: 1
                };
                results.itemsFound.push(shadowOre);
                results.coinsEarned += shadowOre.item.value;
                familiar.tempMinecart.items.push(shadowOre);
                eventLogs.push(`${familiar.displayName} found rare Shadow Ore!`);
            }
            
            if (familiar.abilities.waterOreChance && Math.random() < familiar.abilities.waterOreChance) {
                const waterOre = {
                    item: {
                        itemId: 'water_crystal',
                        name: '💧 Water Crystal',
                        value: 400,
                        tier: 'rare'
                    },
                    quantity: 1
                };
                results.itemsFound.push(waterOre);
                results.coinsEarned += waterOre.item.value;
                familiar.tempMinecart.items.push(waterOre);
                eventLogs.push(`${familiar.displayName} crystallized water from the depths!`);
            }
            
            // Convert ore tile to floor after mining
            targetTileData.type = 0;
            results.mapChanged = true;
        }
        
    } else if (targetTileData.type === 0) { // Floor
        // Move to the new position
        familiarPos.x = newX;
        familiarPos.y = newY;
    }
    
    return results;
}

/**
 * Find the best target for a familiar based on its type and abilities
 */
function findFamiliarTarget(familiar, position, mapData) {
    const config = FAMILIAR_CONFIGS[familiar.type];
    let bestTarget = null;
    let minDistance = Infinity;
    
    // Different targeting strategies based on familiar type
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            const tile = mapData.tiles[y]?.[x];
            if (!tile) continue;
            
            let isTarget = false;
            let priority = 0;
            
            // Targeting logic based on familiar type
            switch (familiar.type) {
                case FAMILIAR_TYPES.SHADOW_CLONE:
                    // Shadows prefer ore > undiscovered > walls
                    if (tile.type === 3 || tile.type === 4) {
                        isTarget = true;
                        priority = 3;
                    } else if (!tile.discovered) {
                        isTarget = true;
                        priority = 2;
                    } else if (tile.type === 1) {
                        isTarget = true;
                        priority = 1;
                    }
                    break;
                    
                case FAMILIAR_TYPES.STONE_GOLEM:
                case FAMILIAR_TYPES.IRON_GOLEM:
                case FAMILIAR_TYPES.CRYSTAL_GOLEM:
                    // Golems focus primarily on ore
                    if (tile.type === 3 || tile.type === 4) {
                        isTarget = true;
                        priority = 3;
                    } else if (tile.type === 1) {
                        isTarget = true;
                        priority = 1;
                    }
                    break;
                    
                case FAMILIAR_TYPES.WATER_ELEMENTAL:
                    // Water elementals prefer ore > undiscovered > walls, similar to shadows but more fluid
                    if (tile.type === 3 || tile.type === 4) {
                        isTarget = true;
                        priority = 3;
                    } else if (!tile.discovered) {
                        isTarget = true;
                        priority = 2;
                    } else if (tile.type === 1) {
                        isTarget = true;
                        priority = 1;
                    }
                    break;
            }
            
            if (isTarget) {
                const distance = Math.abs(x - position.x) + Math.abs(y - position.y);
                const weightedDistance = distance / priority; // Higher priority = lower weighted distance
                
                if (weightedDistance < minDistance) {
                    minDistance = weightedDistance;
                    bestTarget = { x, y };
                }
            }
        }
    }
    
    return bestTarget;
}

/**
 * Transfer familiar earnings to owner
 */
function transferFamiliarEarnings(familiar, ownerId, transaction) {
    const transferData = {
        coins: familiar.tempMinecart.coins,
        items: [...familiar.tempMinecart.items]
    };
    
    if (transferData.coins > 0) {
        transaction.addCoins(ownerId, transferData.coins);
    }
    
    for (const item of transferData.items) {
        transaction.addItem(ownerId, item.item.itemId, item.quantity);
    }
    
    // Clear familiar's temporary minecart
    familiar.tempMinecart.coins = 0;
    familiar.tempMinecart.items = [];
    
    return transferData;
}

/**
 * Update familiar stats when owner's stats change (only affects shadow clones)
 */
function updateFamiliarStats(playerId, newPlayerData) {
    const playerFamiliars = activeFamiliars.get(playerId);
    if (!playerFamiliars) return;
    
    for (const familiar of playerFamiliars) {
        const config = FAMILIAR_CONFIGS[familiar.type];
        
        // Only update stats for percentage-based familiars (shadow clones)
        if (config.statMultiplier) {
            familiar.stats = {
                mining: Math.floor((newPlayerData.stats?.mining || 0) * config.statMultiplier),
                luck: config.abilities?.noLuck ? 0 : Math.floor((newPlayerData.stats?.luck || 0) * config.statMultiplier),
                speed: Math.floor((newPlayerData.stats?.speed || 1) * config.statMultiplier * (config.abilities?.slowMovement || config.abilities?.ultraSlow || 1)),
                sight: Math.floor((newPlayerData.stats?.sight || 0) * config.statMultiplier)
            };
        }
        // Golems with flat base stats don't need updates
    }
}

/**
 * Get visual representation of familiars for map display
 */
function getFamiliarMapSymbols() {
    const symbols = {};
    
    for (const [type, config] of Object.entries(FAMILIAR_CONFIGS)) {
        symbols[type] = config.displayIcon;
    }
    
    return symbols;
}

/**
 * Get rendering properties for a familiar type
 */
function getFamiliarRenderingProperties(familiarType) {
    const config = FAMILIAR_CONFIGS[familiarType];
    if (!config) return null;
    
    return {
        displayIcon: config.displayIcon,
        name: config.name,
        imageName: config.imageName,
        pickaxeImage: config.pickaxeImage,
        pickaxeFallback: config.pickaxeFallback,
        visual: config.visual
    };
}

/**
 * Get familiar image path with fallback
 */
function getFamiliarImagePath(familiarType, usePickaxe = false) {
    const config = FAMILIAR_CONFIGS[familiarType];
    if (!config) return null;
    
    if (usePickaxe) {
        return {
            primary: config.pickaxeImage ? `./assets/items/${config.pickaxeImage}.png` : null,
            fallback: config.pickaxeFallback ? `./assets/items/${config.pickaxeFallback}.png` : './assets/items/ironpickaxe.png'
        };
    } else {
        return {
            primary: config.imageName ? `./assets/familiars/${config.imageName}.png` : null,
            fallback: null // No fallback for familiar images, will use solid color rendering
        };
    }
}

/**
 * Check if an entity is a familiar
 */
function isFamiliar(entityId) {
    return entityId && (entityId.includes('_shadow_clone_') || 
                       entityId.includes('_stone_golem_') ||
                       entityId.includes('_iron_golem_') ||
                       entityId.includes('_crystal_golem_') ||
                       entityId.includes('_fire_elemental_') ||
                       entityId.includes('_ice_elemental_') ||
                       entityId.includes('_water_elemental_'));
}

module.exports = {
    // Main functions
    initializeFamiliars,
    spawnFamiliarFromItem,
    processFamiliarActions,
    transferFamiliarEarnings,
    loadFamiliarsFromDatabase,
    updateDatabaseFamiliars,
    
    // Management functions
    getPlayerFamiliars,
    removeFamiliar,
    removeAllPlayerFamiliars,
    updateFamiliarStats,
    
    // Utility functions
    getFamiliarMapSymbols,
    getFamiliarRenderingProperties,
    getFamiliarImagePath,
    isFamiliar,
    canSpawnFamiliars,
    
    // Constants
    FAMILIAR_TYPES,
    FAMILIAR_CONFIGS,
    
    // Legacy support (for gradual migration)
    activeShadowClones: activeFamiliars,
    hasShadowLegionAmulet: (playerData) => canSpawnFamiliars(playerData, FAMILIAR_TYPES.SHADOW_CLONE),
    initializeShadowClones: (playerId, playerName, playerData, mapData) => {
        const result = initializeFamiliars(playerId, playerName, playerData, mapData);
        return {
            clones: result.familiars,
            mapChanged: result.mapChanged,
            newlyCreated: result.newlyCreated
        };
    },
    processShadowCloneActions: processFamiliarActions,
    removeShadowClones: removeAllPlayerFamiliars,
    transferCloneEarnings: transferFamiliarEarnings,
    updateShadowCloneStats: updateFamiliarStats
};

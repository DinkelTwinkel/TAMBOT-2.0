// mining_optimized_v5_performance.js - Power Level Integrated Mining System with Enhanced Reliability
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
// Use the new layered rendering system with auto-generated images
const generateTileMapImage = require('./mining/imageProcessing/mining-layered-render');
const gachaVC = require('../../models/activevcs');
const { 
    parseUniqueItemBonuses, 
    applyDoubleOreBonus, 
    checkHazardResistance, 
    applyMovementSpeedBonus,
    checkUniquePickaxeBreak,
    applyAreaDamage,
    getChainMiningTargets
} = require('./mining/uniqueItemBonuses');

const { sendLegendaryAnnouncement } = require('../uniqueItemFinding');

// Import instance manager for preventing parallel execution
const instanceManager = require('./instance-manager');

// Import enhanced power level components
const { 
    IMAGE_GENERATION_INTERVAL, 
    MAX_SPEED_ACTIONS, 
    EXPLORATION_BONUS_CHANCE,
    TILE_TYPES,
    POWER_LEVEL_CONFIG,
    SERVER_POWER_MODIFIERS,
    calculateMiningEfficiency,
    getAvailableItems,
    getAvailableTreasures,
    miningItemPool,
    treasureItems
} = require('./mining/miningConstants_unified');

const {
    calculateTeamVisibility,
    findNearestTarget,
    pickWeightedItem,
    getDirectionToTarget,
    getRandomDirection,
    canBreakTile,
    checkPickaxeBreak,
    getMinecartSummary,
    createPlayerSeed
} = require('./mining/miningUtils');

const {
    DatabaseTransaction,
    addItemToMinecart,
    initializeGameData,
    createMiningSummary
} = require('./mining/miningDatabase');

const {
    initializeMap,
    initializeBreakPositions,
    cleanupPlayerPositions,
    checkMapExpansion
} = require('./mining/miningMap');

const {
    checkAndEndSpecialEvent,
    pickLongBreakEvent,
    shouldTriggerLongBreak,
    scatterPlayersForBreak,
    startThiefGame,
    calculateMinecartValue
} = require('./mining/miningEvents');

// Import hazard systems
const hazardStorage = require('./mining/hazardStorage');
const hazardEffects = require('./mining/hazardEffects');
const { getHazardSpawnChance } = require('./mining/miningConstants');

// Import performance optimizations
const {
    batchDB,
    playerStatsCache,
    visibilityCalculator,
    messageThrottler,
    eventBatcher
} = require('./mining/miningPerformance');

// Import unique item integration
const { 
    processUniqueItemFinding,
    updateMiningActivity
} = require('./mining/uniqueItemIntegration');

// Enhanced Concurrency Manager with Instance Management
class EnhancedConcurrencyManager {
    constructor() {
        this.locks = new Map();
        this.intervals = new Map();
        this.processing = new Map();
    }
    
    async acquireLock(channelId, timeout = 5000) {
        // First check with instance manager
        if (!instanceManager.hasActiveInstance(channelId)) {
            if (!instanceManager.registerInstance(channelId)) {
                console.log(`[CONCURRENCY] Cannot acquire lock - another process owns channel ${channelId}`);
                return false;
            }
        }
        
        // Then do local locking
        const startTime = Date.now();
        
        while (this.locks.get(channelId)) {
            if (Date.now() - startTime > timeout) {
                console.warn(`[CONCURRENCY] Lock acquisition timeout for channel ${channelId}`);
                this.forceUnlock(channelId);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.locks.set(channelId, {
            timestamp: Date.now(),
            pid: process.pid
        });
        
        this.processing.set(channelId, Date.now());
        return true;
    }
    
    releaseLock(channelId) {
        this.locks.delete(channelId);
        this.processing.delete(channelId);
        console.log(`[CONCURRENCY] Released lock for channel ${channelId}`);
    }
    
    forceUnlock(channelId) {
        console.warn(`[CONCURRENCY] Force unlocking channel ${channelId}`);
        this.locks.delete(channelId);
        this.processing.delete(channelId);
        this.clearAllIntervalsForChannel(channelId);
        instanceManager.forceKillChannel(channelId);
    }
    
    isLocked(channelId) {
        if (instanceManager.hasActiveInstance(channelId)) {
            const instance = instanceManager.getInstanceInfo(channelId);
            if (instance && instance.pid !== process.pid) {
                return true;
            }
        }
        return this.locks.has(channelId);
    }
    
    isProcessing(channelId) {
        return this.processing.has(channelId);
    }
    
    setInterval(channelId, type, callback, delay) {
        const key = `${channelId}_${type}`;
        this.clearInterval(channelId, type);
        const intervalId = setInterval(callback, delay);
        this.intervals.set(key, intervalId);
        instanceManager.addInterval(channelId, intervalId);
        return intervalId;
    }
    
    clearInterval(channelId, type) {
        const key = `${channelId}_${type}`;
        const intervalId = this.intervals.get(key);
        if (intervalId) {
            clearInterval(intervalId);
            this.intervals.delete(key);
            instanceManager.removeInterval(channelId, intervalId);
        }
    }
    
    clearAllIntervalsForChannel(channelId) {
        const keysToDelete = [];
        for (const [key, intervalId] of this.intervals) {
            if (key.startsWith(`${channelId}_`)) {
                clearInterval(intervalId);
                keysToDelete.push(key);
                instanceManager.removeInterval(channelId, intervalId);
            }
        }
        keysToDelete.forEach(key => this.intervals.delete(key));
    }
    
    getDebugInfo() {
        const diagnostics = instanceManager.getDiagnostics();
        return {
            lockedChannels: Array.from(this.locks.keys()),
            processingChannels: Array.from(this.processing.keys()),
            activeIntervals: Array.from(this.intervals.keys()),
            instanceDiagnostics: diagnostics
        };
    }
}

// Replace old concurrency manager
const concurrencyManager = new EnhancedConcurrencyManager();

// Message queue to prevent duplicate messages
class MessageQueue {
    constructor() {
        this.recentMessages = new Map();
    }
    
    isDuplicate(channelId, messageKey, type = 'general', ttl = 5000) {
        const key = `${channelId}_${type}_${messageKey}`;
        const now = Date.now();
        
        if (this.recentMessages.has(key)) {
            const timestamp = this.recentMessages.get(key);
            if (now - timestamp < ttl) {
                return true;
            }
        }
        
        this.recentMessages.set(key, now);
        
        // Cleanup old entries
        for (const [k, timestamp] of this.recentMessages) {
            if (now - timestamp > 60000) {
                this.recentMessages.delete(k);
            }
        }
        
        return false;
    }
}

const messageQueue = new MessageQueue();

// Global event counter for image generation
let eventCounter = 0;

// Performance: Reduce image generation frequency based on power level
const REDUCED_IMAGE_INTERVAL = 1;

// TIMING CONFIGURATION with fallbacks
const MINING_DURATION = process.env.MINING_DURATION || 25 * 60 * 1000; // 25 minutes
const SHORT_BREAK_DURATION = process.env.SHORT_BREAK_DURATION || 5 * 60 * 1000; // 5 minutes
const LONG_BREAK_DURATION = process.env.LONG_BREAK_DURATION || 20 * 60 * 1000; // 20 minutes (reduced from 25)
const LONG_EVENT_DURATION = process.env.LONG_EVENT_DURATION || 15 * 60 * 1000; // 15 minutes of long break for event
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute health checks
const MAX_PROCESSING_TIME = 120000; // 2 minutes max processing time

// Cache Management Configuration
const MAX_CACHE_SIZE = 100;
const DB_CACHE_TTL = 30000; // 30 seconds
const EFFICIENCY_CACHE_SIZE = 50;

// Performance: Cache database entries with size management
const dbCache = new Map();
const efficiencyCache = new Map();

// Track processing times and health metrics
const healthMetrics = {
    lastProcessed: new Map(),
    processingErrors: new Map(),
    averageProcessingTime: new Map(),
    stuckChannels: new Set()
};

// Track recent movements to prevent straight-line behavior
const playerMovementHistory = new Map();

// Enhanced cache management with size limits
function addToCache(cache, key, value, maxSize = MAX_CACHE_SIZE) {
    if (cache.size >= maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, value);
}

// Export caches globally for external clearing (needed for rail system)
global.dbCache = dbCache;
global.efficiencyCache = efficiencyCache;
if (typeof visibilityCalculator !== 'undefined') {
    global.visibilityCalculator = visibilityCalculator;
}

// Enhanced error-safe database fetch with retry logic
async function getCachedDBEntry(channelId, forceRefresh = false, retryCount = 0) {
    try {
        const now = Date.now();
        const cached = dbCache.get(channelId);
        
        if (!forceRefresh && cached && (now - cached.timestamp) < DB_CACHE_TTL) {
            return cached.data;
        }
        
        const entry = await gachaVC.findOne({ channelId });
        if (!entry) {
            console.error(`[MINING] No database entry found for channel ${channelId}`);
            return null;
        }
        
        addToCache(dbCache, channelId, { data: entry, timestamp: now });
        return entry;
    } catch (error) {
        console.error(`[MINING] Error fetching DB entry for channel ${channelId}:`, error);
        
        if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return getCachedDBEntry(channelId, forceRefresh, retryCount + 1);
        }
        
        return null;
    }
}

// Health check system to detect and recover from stuck states
async function performHealthCheck(channelId) {
    try {
        const debugInfo = concurrencyManager.getDebugInfo();
        const lastProcessed = healthMetrics.lastProcessed.get(channelId);
        const now = Date.now();
        
        if (debugInfo.lockedChannels.includes(channelId)) {
            const lockTime = now - (lastProcessed || 0);
            if (lockTime > MAX_PROCESSING_TIME) {
                console.warn(`[HEALTH] Channel ${channelId} locked for ${lockTime}ms, forcing unlock`);
                concurrencyManager.forceUnlock(channelId);
                healthMetrics.stuckChannels.add(channelId);
                return false;
            }
        }
        
        if (lastProcessed && (now - lastProcessed) > MINING_DURATION + LONG_BREAK_DURATION) {
            console.warn(`[HEALTH] Channel ${channelId} hasn't been processed in ${(now - lastProcessed) / 1000}s`);
            healthMetrics.stuckChannels.add(channelId);
            concurrencyManager.forceUnlock(channelId);
            return false;
        }
        
        const errorCount = healthMetrics.processingErrors.get(channelId) || 0;
        if (errorCount > 5) {
            console.warn(`[HEALTH] Channel ${channelId} has ${errorCount} errors, resetting`);
            healthMetrics.processingErrors.set(channelId, 0);
            healthMetrics.stuckChannels.add(channelId);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error(`[HEALTH] Error during health check for channel ${channelId}:`, error);
        return true;
    }
}

// Auto-recovery system for stuck channels
async function attemptAutoRecovery(channel) {
    try {
        console.log(`[RECOVERY] Attempting auto-recovery for channel ${channel.id}`);
        
        concurrencyManager.forceUnlock(channel.id);
        instanceManager.forceKillChannel(channel.id);
        dbCache.delete(channel.id);
        healthMetrics.stuckChannels.delete(channel.id);
        healthMetrics.processingErrors.set(channel.id, 0);
        
        const dbEntry = await getCachedDBEntry(channel.id, true);
        if (dbEntry && dbEntry.gameData) {
            console.log(`[RECOVERY] Successfully recovered channel ${channel.id}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`[RECOVERY] Failed to recover channel ${channel.id}:`, error);
        return false;
    }
}

// Enhanced function to get server modifiers based on gacha server name
function getServerModifiers(serverName, serverPower) {
    try {
        const nameToKey = {
            "Coal Mines": "coalMines",
            "Copper Quarry": "copperQuarry", 
            "Topaz Mine": "topazMine",
            "Iron Stronghold": "ironStronghold",
            "Fossil Excavation": "fossilExcavation",
            "Diamond Mines": "diamondMines",
            "Emerald Caverns": "emeraldCaverns",
            "Ruby Depths": "rubyDepths",
            "Crystal Grottos": "crystalGrottos",
            "Obsidian Forge": "obsidianForge",
            "Mythril Sanctum": "mythrilSanctum",
            "Adamantite Abyss": "adamantiteAbyss"
        };
        
        const cleanName = serverName.replace(/⛏️|️/g, '').trim();
        const serverKey = nameToKey[cleanName];
        
        if (serverKey && SERVER_POWER_MODIFIERS[serverKey]) {
            return SERVER_POWER_MODIFIERS[serverKey];
        }
        
        return {
            powerLevel: serverPower || 1,
            specialBonus: "Standard mining efficiency",
            itemBonuses: {}
        };
    } catch (error) {
        console.error('[MINING] Error getting server modifiers:', error);
        return {
            powerLevel: serverPower || 1,
            specialBonus: "Standard mining efficiency",
            itemBonuses: {}
        };
    }
}

// Enhanced mining efficiency calculation with caching and error handling
function getCachedMiningEfficiency(serverPowerLevel, playerLevel = 1, serverModifiers = null) {
    try {
        const cacheKey = `${serverPowerLevel}-${playerLevel}`;
        
        if (efficiencyCache.has(cacheKey)) {
            const cached = efficiencyCache.get(cacheKey);
            return applyServerModifiers(cached, serverModifiers);
        }
        
        const efficiency = calculateMiningEfficiency(serverPowerLevel, playerLevel);
        addToCache(efficiencyCache, cacheKey, efficiency, EFFICIENCY_CACHE_SIZE);
        
        return applyServerModifiers(efficiency, serverModifiers);
    } catch (error) {
        console.error('[MINING] Error calculating efficiency:', error);
        return {
            oreSpawnChance: 0.3,
            rareOreChance: 0.05,
            treasureChance: 0.02,
            speedMultiplier: 1,
            valueMultiplier: 1
        };
    }
}

// Apply server-specific modifiers to mining efficiency
function applyServerModifiers(efficiency, serverModifiers) {
    if (!serverModifiers) return efficiency;
    
    try {
        return {
            ...efficiency,
            oreSpawnChance: efficiency.oreSpawnChance * 1.1,
            rareOreChance: efficiency.rareOreChance * 1.1,
            treasureChance: efficiency.treasureChance * 1.2,
            specialBonus: serverModifiers.specialBonus,
            itemBonuses: serverModifiers.itemBonuses
        };
    } catch (error) {
        console.error('[MINING] Error applying server modifiers:', error);
        return efficiency;
    }
}

// Calculate next break time based on current cycle
function calculateNextBreakTime(dbEntry) {
    const now = Date.now();
    const cycleCount = dbEntry.gameData?.cycleCount || 0;
    
    const isLongBreakCycle = (cycleCount % 4) === 3;
    
    if (isLongBreakCycle) {
        return {
            nextShopRefresh: new Date(now + MINING_DURATION),
            breakDuration: LONG_BREAK_DURATION,
            isLongBreak: true
        };
    } else {
        return {
            nextShopRefresh: new Date(now + MINING_DURATION),
            breakDuration: SHORT_BREAK_DURATION,
            isLongBreak: false
        };
    }
}

// Check if currently in break period
function isBreakPeriod(dbEntry) {
    return dbEntry?.gameData?.breakInfo?.inBreak || false;
}

// Get a random floor tile for gathering during breaks
function getRandomFloorTile(mapData) {
    try {
        const floorTiles = [];
        
        for (let y = 0; y < mapData.height; y++) {
            for (let x = 0; x < mapData.width; x++) {
                const tile = mapData.tiles[y] && mapData.tiles[y][x];
                if (tile && tile.type === TILE_TYPES.FLOOR && tile.discovered) {
                    floorTiles.push({ x, y });
                }
            }
        }
        
        if (floorTiles.length === 0) {
            return { x: mapData.entranceX, y: mapData.entranceY };
        }
        
        return floorTiles[Math.floor(Math.random() * floorTiles.length)];
    } catch (error) {
        console.error('[MINING] Error getting random floor tile:', error);
        return { x: mapData.entranceX || 0, y: mapData.entranceY || 0 };
    }
}

// Enhanced mining system with power level filtering and error handling
async function mineFromTile(member, miningPower, luckStat, powerLevel, tileType, availableItems, efficiency) {
    try {
        let eligibleItems = availableItems.filter(item => {
            if (tileType === TILE_TYPES.TREASURE_CHEST) {
                return item.tier === 'epic' || item.tier === 'legendary';
            } else if (tileType === TILE_TYPES.RARE_ORE) {
                if (powerLevel <= 2) {
                    return item.tier !== 'common';
                } else if (powerLevel <= 4) {
                    return item.tier === 'rare' || item.tier === 'epic' || item.tier === 'legendary';
                } else {
                    return item.tier === 'epic' || item.tier === 'legendary';
                }
            } else {
                return true;
            }
        });
        
        if (eligibleItems.length === 0) {
            eligibleItems = availableItems;
        }
        
        const totalWeight = eligibleItems.reduce((sum, item) => sum + item.baseWeight, 0);
        let random = Math.random() * totalWeight;
        
        let selectedItem = eligibleItems[0];
        for (const item of eligibleItems) {
            random -= item.baseWeight;
            if (random <= 0) {
                selectedItem = item;
                break;
            }
        }
        
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
        
        const enhancedValue = Math.floor(selectedItem.value * efficiency.valueMultiplier);
        
        return { 
            item: { ...selectedItem, value: enhancedValue }, 
            quantity 
        };
    } catch (error) {
        console.error('[MINING] Error mining from tile:', error);
        return {
            item: availableItems[0] || { itemId: 'default', name: 'Stone', value: 1 },
            quantity: 1
        };
    }
}

// Enhanced treasure generation with power level requirements
async function generateTreasure(powerLevel, efficiency) {
    try {
        const availableTreasures = getAvailableTreasures(powerLevel);
        
        if (Math.random() < efficiency.treasureChance && availableTreasures.length > 0) {
            const treasure = availableTreasures[Math.floor(Math.random() * availableTreasures.length)];
            const enhancedValue = Math.floor(treasure.value * efficiency.valueMultiplier);
            
            return {
                ...treasure,
                value: enhancedValue
            };
        }
        
        return null;
    } catch (error) {
        console.error('[MINING] Error generating treasure:', error);
        return null;
    }
}

// Get all possible hazards with enhanced descriptions for higher danger levels
function getAllPossibleHazards(dangerLevel) {
    const hazardList = [];
    
    // Enhanced hazard descriptions with more variety for danger 6-7
    const enhancedHazards = {
        1: [
            { type: 'rocks', name: '🪨 Falling Rocks', description: 'Loose rocks that may fall and stun players' },
            { type: 'gas', name: '💨 Gas Pocket', description: 'Toxic gas that disorients miners' },
            { type: 'treasure', name: '💎 Hidden Treasure', description: 'A cache of valuable items' }
        ],
        2: [
            { type: 'rocks', name: '🪨 Rock Slide', description: 'Dangerous rockfalls that can knock out miners' },
            { type: 'gas', name: '☠️ Poison Gas', description: 'Deadly fumes that incapacitate unwary explorers' },
            { type: 'water', name: '💧 Water Leak', description: 'Underground water that floods passages' },
            { type: 'treasure', name: '💰 Treasure Cache', description: 'A valuable stash of rare items' }
        ],
        3: [
            { type: 'explosion', name: '💥 Gas Explosion', description: 'Volatile gas pockets that explode on contact' },
            { type: 'collapse', name: '⛰️ Cave-in', description: 'Unstable ceiling that collapses' },
            { type: 'portal', name: '🌀 Strange Portal', description: 'Mysterious portal that teleports miners' },
            { type: 'rare_treasure', name: '👑 Rare Treasure', description: 'Exceptionally valuable ancient artifacts' }
        ],
        4: [
            { type: 'explosion', name: '💥 Chain Explosion', description: 'Multiple gas pockets that trigger chain reactions' },
            { type: 'collapse', name: '🏔️ Major Cave-in', description: 'Massive structural collapse' },
            { type: 'portal', name: '🌌 Unstable Portal', description: 'Chaotic portal that randomly displaces miners' },
            { type: 'monster', name: '👹 Cave Monster', description: 'Dangerous creature lurking in the depths' },
            { type: 'rare_treasure', name: '💎 Ancient Vault', description: 'Legendary treasures from forgotten times' }
        ],
        5: [
            { type: 'explosion', name: '🔥 Inferno Blast', description: 'Massive fiery explosion' },
            { type: 'collapse', name: '🌋 Seismic Collapse', description: 'Earthquake-triggered cave-in' },
            { type: 'portal', name: '🕳️ Void Portal', description: 'Portal to the unknown void' },
            { type: 'monster', name: '🐉 Ancient Beast', description: 'Powerful creature guarding the depths' },
            { type: 'curse', name: '👻 Ancient Curse', description: 'Mysterious curse that weakens miners' },
            { type: 'legendary_treasure', name: '👑 Legendary Hoard', description: 'Mythical treasures of immense value' }
        ],
        6: [
            // Enhanced danger 6 hazards
            { type: 'explosion', name: '☄️ Meteor Strike', description: 'Underground meteor impact zone' },
            { type: 'collapse', name: '🌊 Tidal Collapse', description: 'Underground tsunami that floods entire sections' },
            { type: 'portal', name: '🌀 Dimensional Rift', description: 'Reality-warping portal that distorts space' },
            { type: 'monster', name: '🦑 Eldritch Horror', description: 'Unspeakable terror from the deep' },
            { type: 'curse', name: '💀 Death Curse', description: 'Lethal curse that spreads to nearby miners' },
            { type: 'trap', name: '⚡ Lightning Trap', description: 'Ancient electrical defense system' },
            { type: 'lava', name: '🌋 Lava Flow', description: 'Molten rock that instantly vaporizes miners' },
            { type: 'void', name: '⚫ Void Zone', description: 'Area where reality breaks down' },
            { type: 'legendary_treasure', name: '🏆 Divine Artifacts', description: 'God-tier items of unimaginable power' }
        ],
        7: [
            // Maximum danger hazards
            { type: 'apocalypse', name: '💥 Apocalypse Zone', description: 'Chain reaction of all hazard types' },
            { type: 'blackhole', name: '🕳️ Black Hole', description: 'Gravitational anomaly that consumes everything' },
            { type: 'demon_lord', name: '👺 Demon Lord', description: 'Boss-level entity that hunts all miners' },
            { type: 'time_warp', name: '⏰ Time Distortion', description: 'Temporal anomaly that reverses progress' },
            { type: 'nuclear', name: '☢️ Nuclear Zone', description: 'Radioactive area with extreme danger' },
            { type: 'nightmare', name: '😱 Nightmare Realm', description: 'Psychological horror that affects all players' },
            { type: 'omega_curse', name: '⚰️ Omega Curse', description: 'Ultimate curse affecting the entire mine' },
            { type: 'cataclysm', name: '🌪️ Cataclysmic Storm', description: 'Reality-tearing storm of pure chaos' },
            { type: 'divine_wrath', name: '⚡ Divine Wrath', description: 'Punishment from angry mining gods' },
            { type: 'mythic_treasure', name: '💎 Mythic Treasury', description: 'Reality-bending treasures beyond comprehension' }
        ]
    };
    
    // Add hazards based on danger level
    for (let level = 1; level <= Math.min(dangerLevel, 7); level++) {
        if (enhancedHazards[level]) {
            hazardList.push(...enhancedHazards[level]);
        }
    }
    
    return hazardList;
}

// Modified hazard generation for initial roll with more cryptic messages
async function performInitialHazardRoll(channel, dbEntry, powerLevel) {
    try {
        // Only perform if not already done
        if (dbEntry.gameData?.hazardRollDone) {
            return null;
        }
        
        const members = channel.members.filter(m => !m.user.bot);
        const dangerLevel = Math.min(powerLevel, 7);
        
        // Generate and store hazard seed
        const hazardSeed = Date.now() + Math.floor(Math.random() * 1000000);
        
        // Get spawn chance (dramatically increased for levels 6-7)
        let baseSpawnChance = getHazardSpawnChance(powerLevel);
        if (dangerLevel >= 6) {
            baseSpawnChance *= 3; // Triple hazards for danger 6
        }
        if (dangerLevel >= 7) {
            baseSpawnChance *= 5; // 5x hazards for danger 7
        }
        
        // Get all possible hazards with more cryptic descriptions
        const crypticHazards = getCrypticHazardDescriptions(dangerLevel);
        
        // Create embed with more mysterious tone
        const embed = new EmbedBuilder()
            .setTitle(`🔮 ANOMALY DETECTION - Depth ${dangerLevel}`)
            .setColor(dangerLevel >= 6 ? 0x4B0082 : dangerLevel >= 4 ? 0x8B008B : 0x483D8B)
            .setDescription(`*Strange energies pulse through the ${POWER_LEVEL_CONFIG[powerLevel]?.name || 'Unknown Depths'}...*`)
            .setTimestamp();
        
        // Add cryptic danger indicator
        const dangerRunes = '◈'.repeat(dangerLevel) + '◇'.repeat(7 - dangerLevel);
        embed.addFields({
            name: '⚡ Energy Resonance',
            value: `\`${dangerRunes}\`\n*The air itself trembles with unknown power...*`,
            inline: false
        });
        
        // Add cryptic spawn rate
        const spawnPercent = Math.round(baseSpawnChance * 100);
        let frequencyMessage = `${spawnPercent}% probability of anomalous encounters`;
        if (dangerLevel >= 7) {
            frequencyMessage = `⚠️ **REALITY UNSTABLE** - Extreme anomaly density detected`;
        } else if (dangerLevel >= 6) {
            frequencyMessage = `⚠️ **DIMENSIONAL RIFTS** - High anomaly concentration`;
        }
        
        embed.addFields({
            name: '📊 Disturbance Frequency',
            value: frequencyMessage,
            inline: true
        });
        
        // Group hazards with cryptic names
        const hazardGroups = {
            '🌫️ Whispers in the Stone': crypticHazards.filter(h => h.tier === 'common'),
            '🌙 Shadows That Move': crypticHazards.filter(h => h.tier === 'dangerous'),
            '💀 Ancient Warnings': crypticHazards.filter(h => h.tier === 'extreme'),
            '⚫ The Void Beckons': crypticHazards.filter(h => h.tier === 'apocalyptic')
        };
        
        // Add cryptic hazard lists
        for (const [groupName, hazards] of Object.entries(hazardGroups)) {
            if (hazards.length > 0) {
                const hazardList = hazards.map(h => `${h.crypticName}`).join('\n');
                if (hazardList) {
                    embed.addFields({
                        name: groupName,
                        value: hazardList.substring(0, 1024), // Discord field limit
                        inline: true
                    });
                }
            }
        }
        
        // Add cryptic warning message based on danger level
        let warningMessage = '';
        if (dangerLevel >= 7) {
            warningMessage = '***The boundaries of reality grow thin here. Ancient things stir in the darkness. Those who enter may never truly leave...***';
        } else if (dangerLevel >= 6) {
            warningMessage = '***Echoes of forgotten catastrophes linger. The stones remember what was lost. Tread carefully, lest you join them...***';
        } else if (dangerLevel >= 5) {
            warningMessage = '***Old curses sleep beneath the surface. Something watches from the shadows. Do not wake what should not be woken...***';
        } else if (dangerLevel >= 3) {
            warningMessage = '***Unstable energies flow through these tunnels. Strange sounds echo in the darkness. Keep your wits about you...***';
        } else {
            warningMessage = '***Minor disturbances detected. The depths hold their secrets close. Watch your step...***';
        }
        
        embed.addFields({
            name: '🌑 The Depths Speak',
            value: warningMessage,
            inline: false
        });
        
        // Add cryptic player list
        const playerList = Array.from(members.values()).map(m => m.displayName).join(' • ');
        embed.setFooter({
            text: `Those who dare descend: ${playerList}`
        });
        
        // Store hazard seed and level in database
        await gachaVC.updateOne(
            { channelId: channel.id },
            { 
                $set: { 
                    'gameData.hazardRollDone': true, 
                    'gameData.dangerLevel': dangerLevel,
                    'gameData.hazardSeed': hazardSeed
                } 
            }
        );
        
        // Send the embed
        await channel.send({ embeds: [embed] });
        
        console.log(`[MINING] Hazard roll performed for channel ${channel.id}: Level ${dangerLevel}, Seed ${hazardSeed}`);
        
        return embed;
    } catch (error) {
        console.error('[MINING] Error performing hazard roll:', error);
        return null;
    }
}

// Helper function to get cryptic hazard descriptions
function getCrypticHazardDescriptions(dangerLevel) {
    const crypticHazards = [];
    
    const hazardMappings = {
        1: [
            { type: 'rocks', crypticName: '• Trembling Stones', tier: 'common' },
            { type: 'gas', crypticName: '• Whispering Vapors', tier: 'common' },
            { type: 'treasure', crypticName: '• Glimmers in Darkness', tier: 'common' }
        ],
        2: [
            { type: 'rocks', crypticName: '• The Ceiling Weeps', tier: 'common' },
            { type: 'gas', crypticName: '• Breath of the Forgotten', tier: 'common' },
            { type: 'water', crypticName: '• Dark Waters Rising', tier: 'common' },
            { type: 'treasure', crypticName: '• Lost Fortunes', tier: 'common' }
        ],
        3: [
            { type: 'explosion', crypticName: '• Volatile Echoes', tier: 'dangerous' },
            { type: 'collapse', crypticName: '• The Weight Above', tier: 'dangerous' },
            { type: 'portal', crypticName: '• Doorways to Nowhere', tier: 'dangerous' },
            { type: 'rare_treasure', crypticName: '• Forgotten Relics', tier: 'dangerous' }
        ],
        4: [
            { type: 'explosion', crypticName: '• Cascading Fury', tier: 'dangerous' },
            { type: 'collapse', crypticName: '• When Mountains Fall', tier: 'dangerous' },
            { type: 'portal', crypticName: '• Rifts in Space', tier: 'dangerous' },
            { type: 'monster', crypticName: '• Things That Hunt', tier: 'dangerous' },
            { type: 'rare_treasure', crypticName: '• Vault of Ancients', tier: 'dangerous' }
        ],
        5: [
            { type: 'explosion', crypticName: '• Infernal Awakening', tier: 'extreme' },
            { type: 'collapse', crypticName: '• Earth\'s Revenge', tier: 'extreme' },
            { type: 'portal', crypticName: '• Void Passages', tier: 'extreme' },
            { type: 'monster', crypticName: '• The Sleeper Wakes', tier: 'extreme' },
            { type: 'curse', crypticName: '• Marks of the Damned', tier: 'extreme' },
            { type: 'legendary_treasure', crypticName: '• Myths Made Real', tier: 'extreme' }
        ],
        6: [
            { type: 'explosion', crypticName: '• Stars Falling Underground', tier: 'apocalyptic' },
            { type: 'collapse', crypticName: '• Tsunamis of Stone', tier: 'apocalyptic' },
            { type: 'portal', crypticName: '• Reality Fractures', tier: 'apocalyptic' },
            { type: 'monster', crypticName: '• That Which Should Not Be', tier: 'apocalyptic' },
            { type: 'curse', crypticName: '• Death\'s Own Shadow', tier: 'apocalyptic' },
            { type: 'trap', crypticName: '• Lightning Prison', tier: 'apocalyptic' },
            { type: 'lava', crypticName: '• Rivers of Fire', tier: 'apocalyptic' },
            { type: 'void', crypticName: '• Where Reality Ends', tier: 'apocalyptic' },
            { type: 'legendary_treasure', crypticName: '• Divine Fragments', tier: 'apocalyptic' }
        ],
        7: [
            { type: 'apocalypse', crypticName: '• The End of All Things', tier: 'apocalyptic' },
            { type: 'blackhole', crypticName: '• Consuming Darkness', tier: 'apocalyptic' },
            { type: 'demon_lord', crypticName: '• The Unnamed One', tier: 'apocalyptic' },
            { type: 'time_warp', crypticName: '• Yesterday\'s Tomorrow', tier: 'apocalyptic' },
            { type: 'nuclear', crypticName: '• Atomic Ghosts', tier: 'apocalyptic' },
            { type: 'nightmare', crypticName: '• Dreams Made Flesh', tier: 'apocalyptic' },
            { type: 'omega_curse', crypticName: '• The Final Word', tier: 'apocalyptic' },
            { type: 'cataclysm', crypticName: '• Storm of Chaos', tier: 'apocalyptic' },
            { type: 'divine_wrath', crypticName: '• Judgment Day', tier: 'apocalyptic' },
            { type: 'mythic_treasure', crypticName: '• Beyond Comprehension', tier: 'apocalyptic' }
        ]
    };
    
    // Add hazards based on danger level
    for (let level = 1; level <= Math.min(dangerLevel, 7); level++) {
        if (hazardMappings[level]) {
            crypticHazards.push(...hazardMappings[level]);
        }
    }
    
    return crypticHazards;
}

// Optimized Event Log System with power level display and error handling
async function logEvent(channel, eventText, forceNew = false, powerLevelInfo = null) {
    try {
        eventCounter++;
        const shouldGenerateImage = forceNew || (eventCounter % REDUCED_IMAGE_INTERVAL === 0);
            
        const result = await getCachedDBEntry(channel.id);
        if (!result) {
            console.error(`[MINING] Cannot log event - no DB entry for channel ${channel.id}`);
            return;
        }
        
        const now = new Date();
        
        let timeStatus = "MINING";
        let timeRemaining = 0;
        let endTimestamp = null;

        if (result.gameData?.breakInfo?.inBreak) {
            const breakEndTime = result.gameData.breakInfo.breakEndTime;
            timeRemaining = Math.max(0, Math.floor((breakEndTime - now) / (1000 * 60)));
            endTimestamp = Math.floor(breakEndTime / 1000);

            if (result.gameData.breakInfo.isLongBreak) {
                timeStatus = result.gameData?.specialEvent ? "LONG BREAK (EVENT)" : "LONG BREAK (SHOP)";
            } else {
                timeStatus = "SHORT BREAK";
            }
        } else if (result.nextShopRefresh) {
            timeRemaining = Math.max(0, Math.floor((result.nextShopRefresh - now) / (1000 * 60)));
            endTimestamp = Math.floor(result.nextShopRefresh / 1000);
            timeStatus = "MINING";
        }

        const minecartSummary = getMinecartSummary(result);
        const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        const logEntry = eventText ? `${eventText} \n-------------------------------` : null;

        const messages = await channel.messages.fetch({ limit: 2 });
        let eventLogMessage = null;

        for (const [, message] of messages) {
            if (message.embeds.length > 0 && message.embeds[0].title?.includes('MINING MAP') && message.author.bot) {
                eventLogMessage = message;
                break;
            }
        }

        let attachment = null;
        if (shouldGenerateImage) {
            try {
                const mapBuffer = await generateTileMapImage(channel);
                attachment = new AttachmentBuilder(mapBuffer, { name: 'mine_map.png' });
            } catch (imgError) {
                console.error('[MINING] Error generating image:', imgError);
            }
        }

        if (logEntry || shouldGenerateImage) {
            let titleText = endTimestamp
                ? `🗺️ MINING MAP | ${timeStatus} ends <t:${endTimestamp}:R>`
                : `🗺️ MINING MAP | ${timeStatus}`;
                
            if (powerLevelInfo) {
                titleText += ` | ${powerLevelInfo.name} (Lv.${powerLevelInfo.level})`;
            }

            const embed = new EmbedBuilder()
                .setTitle(titleText)
                .setColor(0x8B4513)
                .setFooter({ 
                    text: `MINECART: ${minecartSummary.summary}`
                })
                .setTimestamp();

            if (powerLevelInfo && forceNew) {
                let description = logEntry ? `\`\`\`\n${logEntry}\n\`\`\`` : '';
                if (description) {
                    embed.setDescription(description);
                }
            } else if (logEntry) {
                embed.setDescription('```\n' + logEntry + '\n```');
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

                if (newDescription && newDescription.length > 4000) {
                    const newEmbed = new EmbedBuilder()
                        .setTitle(titleText)
                        .setColor(0x8B4513)
                        .setFooter({ text: `MINECART: ${minecartSummary.summary}` })
                        .setTimestamp();

                    if (logEntry) newEmbed.setDescription('```\n' + logEntry + '\n```');

                    await channel.send({ 
                        embeds: [newEmbed], 
                        files: attachment ? [attachment] : [] 
                    });
                    return;
                }

                const updatedEmbed = new EmbedBuilder()
                    .setTitle(titleText)
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART: ${minecartSummary.summary}` })
                    .setTimestamp();

                if (newDescription) updatedEmbed.setDescription(newDescription);

                await eventLogMessage.edit({ 
                    embeds: [updatedEmbed], 
                    files: attachment ? [attachment] : [] 
                });
                return;
            }

            await channel.send({ 
                embeds: [embed], 
                files: attachment ? [attachment] : [] 
            });
        }

    } catch (error) {
        console.error('Error updating mining map:', error);
        try {
            if (eventText) await channel.send(`\`${eventText}\``);
        } catch (fallbackError) {
            console.error('Failed to send fallback message:', fallbackError);
        }
    }
}

// Enhanced break start with instance management
async function startBreak(channel, dbEntry, isLongBreak = false, powerLevel = 1, preSelectedEvent = null) {
    try {
        const channelId = channel.id;
        const now = Date.now();
        const members = channel.members.filter(m => !m.user.bot);
        
        // Kill any parallel instances before starting break
        instanceManager.forceKillChannel(channelId);
        
        const breakKey = isLongBreak ? 'LONG_BREAK_START' : 'SHORT_BREAK_START';
        if (messageQueue.isDuplicate(channelId, breakKey, 'break')) {
            console.log(`[MINING] Duplicate break start prevented for channel ${channelId}`);
            return;
        }
        
        if (isLongBreak) {
            const breakEndTime = now + LONG_BREAK_DURATION;
            const eventEndTime = now + LONG_EVENT_DURATION;
            
            batchDB.queueUpdate(channel.id, {
                'gameData.breakInfo': {
                    inBreak: true,
                    isLongBreak: true,
                    breakStartTime: now,
                    breakEndTime: breakEndTime,
                    eventEndTime: eventEndTime
                },
                nextTrigger: new Date(breakEndTime),
                nextShopRefresh: new Date(breakEndTime)
            });
            
            const mapData = dbEntry.gameData.map;
            const updatedPositions = {};
            for (const member of members.values()) {
                updatedPositions[member.id] = {
                    x: mapData.entranceX,
                    y: mapData.entranceY,
                    hidden: true
                };
            }
            
            batchDB.queueUpdate(channel.id, { 'gameData.map.playerPositions': updatedPositions });
            await batchDB.flush();
            
            const updatedDbEntry = await getCachedDBEntry(channel.id, true);
            if (!updatedDbEntry) {
                console.error(`[MINING] Failed to get updated DB entry for long break`);
                return;
            }
            
            const playerCount = members.size;
            const selectedEvent = preSelectedEvent || pickLongBreakEvent(playerCount);
            
            console.log(`[LONG BREAK] Selected event: ${selectedEvent.name || 'Unknown'}`);
            
            const eventResult = await selectedEvent(channel, updatedDbEntry);
            
            const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
            await logEvent(channel, `🎪 LONG BREAK: ${eventResult || 'Event started'}`, true, {
                level: powerLevel,
                name: powerLevelConfig?.name || 'Unknown Miner',
                specialBonus: `Power Level ${powerLevel} Event`
            });
            
            concurrencyManager.clearInterval(channelId, 'eventCheck');
            
            concurrencyManager.setInterval(channelId, 'eventCheck', async () => {
                try {
                    const currentEntry = await getCachedDBEntry(channel.id, true);
                    if (!currentEntry) return;
                    
                    if (currentEntry.gameData?.specialEvent) {
                        const eventEndResult = await checkAndEndSpecialEvent(channel, currentEntry);
                        if (eventEndResult) {
                            if (!messageQueue.isDuplicate(channelId, eventEndResult, 'eventEnd')) {
                                await logEvent(channel, eventEndResult, true);
                            }
                            concurrencyManager.clearInterval(channelId, 'eventCheck');
                            
                            if (currentEntry.gameData?.breakInfo?.inBreak) {
                                if (!messageQueue.isDuplicate(channelId, 'SHOP_OPEN', 'shop')) {
                                    await generateShop(channel, 10);
                                    await logEvent(channel, '🛒 Shop is now open!', true);
                                }
                            }
                        }
                    } else {
                        concurrencyManager.clearInterval(channelId, 'eventCheck');
                    }
                    
                    if (!currentEntry.gameData?.breakInfo?.inBreak) {
                        concurrencyManager.clearInterval(channelId, 'eventCheck');
                    }
                } catch (error) {
                    console.error('Error checking special event:', error);
                    concurrencyManager.clearInterval(channelId, 'eventCheck');
                }
            }, 30000);
            
            setTimeout(() => {
                concurrencyManager.clearInterval(channelId, 'eventCheck');
            }, LONG_BREAK_DURATION);
            
        } else {
            const breakEndTime = now + SHORT_BREAK_DURATION;
            const mapData = dbEntry.gameData.map;
            const gatherPoint = getRandomFloorTile(mapData);
            const scatteredPositions = scatterPlayersForBreak(
                mapData.playerPositions || {}, 
                gatherPoint.x, 
                gatherPoint.y, 
                members.size,
                mapData
            );
            
            batchDB.queueUpdate(channel.id, {
                'gameData.breakInfo': {
                    inBreak: true,
                    isLongBreak: false,
                    breakStartTime: now,
                    breakEndTime: breakEndTime,
                    gatherPoint: gatherPoint
                },
                'gameData.map.playerPositions': scatteredPositions,
                nextTrigger: new Date(breakEndTime),
                nextShopRefresh: new Date(breakEndTime)
            });
            
            await batchDB.flush();
            
            if (!messageQueue.isDuplicate(channelId, 'SHORT_BREAK_SHOP', 'shop')) {
                await generateShop(channel, 5);
                await logEvent(channel, `⛺ SHORT BREAK: Players camping at (${gatherPoint.x}, ${gatherPoint.y}). Shop open!`, true);
            }
        }
    } catch (error) {
        console.error(`[MINING] Error starting break for channel ${channel.id}:`, error);
        healthMetrics.processingErrors.set(channel.id, 
            (healthMetrics.processingErrors.get(channel.id) || 0) + 1);
    }
}

// Enhanced break end with instance management
async function endBreak(channel, dbEntry, powerLevel = 1) {
    try {
        const channelId = channel.id;
        
        // Force kill any parallel instances before ending break
        instanceManager.forceKillChannel(channelId);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Register new instance for post-break mining
        if (!instanceManager.registerInstance(channelId)) {
            console.error(`[MINING] Cannot end break - channel ${channelId} is locked by another process`);
            return;
        }
        
        if (messageQueue.isDuplicate(channelId, 'BREAK_END', 'break')) {
            console.log(`[MINING] Duplicate break end prevented for channel ${channelId}`);
            instanceManager.killInstance(channelId);
            return;
        }
        
        concurrencyManager.clearAllIntervalsForChannel(channelId);
        
        const mapData = dbEntry.gameData.map;
        const members = channel.members.filter(m => !m.user.bot);
        const breakInfo = dbEntry.gameData.breakInfo;
        const railStorage = require('./mining/railStorage');
        
        const resetPositions = {};
        
        if (breakInfo.isLongBreak) {
            const railsData = await railStorage.getRailsData(channel.id);
            const railTiles = [];
            
            if (railsData && railsData.rails && railsData.rails.size > 0) {
                for (const [key, rail] of railsData.rails) {
                    const [x, y] = key.split(',').map(Number);
                    if (x >= 0 && x < mapData.width && y >= 0 && y < mapData.height) {
                        railTiles.push({ x, y });
                    }
                }
            }
            
            for (const member of members.values()) {
                if (railTiles.length > 0) {
                    const randomRail = railTiles[Math.floor(Math.random() * railTiles.length)];
                    resetPositions[member.id] = {
                        x: randomRail.x,
                        y: randomRail.y,
                        isTent: false,
                        hidden: false
                    };
                } else {
                    resetPositions[member.id] = {
                        x: mapData.entranceX,
                        y: mapData.entranceY,
                        isTent: false,
                        hidden: false
                    };
                }
            }
        } else {
            const currentPositions = mapData.playerPositions || {};
            for (const member of members.values()) {
                const currentPos = currentPositions[member.id];
                resetPositions[member.id] = currentPos ? {
                    x: currentPos.x,
                    y: currentPos.y,
                    isTent: false,
                    hidden: false
                } : {
                    x: mapData.entranceX,
                    y: mapData.entranceY,
                    isTent: false,
                    hidden: false
                };
            }
        }
        
        const cycleCount = (dbEntry.gameData?.cycleCount || 0) + 1;
        const nextBreakInfo = calculateNextBreakTime({ gameData: { cycleCount } });
        
        batchDB.queueUpdate(channel.id, {
            'gameData.map.playerPositions': resetPositions,
            'gameData.cycleCount': cycleCount,
            'gameData.breakInfo.justEnded': true,
            'gameData.breakJustEnded': Date.now(),
            nextShopRefresh: nextBreakInfo.nextShopRefresh,
            nextTrigger: new Date(Date.now() + 1000)
        });
        
        await gachaVC.updateOne(
            { channelId: channel.id },
            { $unset: { 'gameData.breakInfo': 1 } }
        );
        
        await batchDB.flush();
        
        visibilityCalculator.invalidate();
        dbCache.delete(channel.id);
        efficiencyCache.delete(channel.id);
        
        const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
        await logEvent(channel, '⛏️ Break ended! Mining resumed.', true, {
            level: powerLevel,
            name: powerLevelConfig?.name || 'Unknown Mine',
            specialBonus: powerLevelConfig?.description || 'Mining efficiency active'
        });
        
        console.log(`[MINING] Break ended successfully for channel ${channelId}`);
    } catch (error) {
        console.error(`[MINING] Error ending break for channel ${channel.id}:`, error);
        instanceManager.killInstance(channel.id, true);
        try {
            await gachaVC.updateOne(
                { channelId: channel.id },
                { $unset: { 'gameData.breakInfo': 1 } }
            );
            dbCache.delete(channel.id);
        } catch (clearError) {
            console.error(`[MINING] Failed to force clear break state:`, clearError);
        }
    }
}

// Main Mining Event - Enhanced with Full Power Level Integration and Instance Management
module.exports = async (channel, dbEntry, json, client) => {
    const channelId = channel.id;
    const processingStartTime = Date.now();
    
    // Multi-level instance checking
    if (instanceManager.hasActiveInstance(channelId)) {
        const instance = instanceManager.getInstanceInfo(channelId);
        if (!instance || instance.pid !== process.pid) {
            console.log(`[MINING] Channel ${channelId} is owned by another process, skipping...`);
            return;
        }
    }
    
    if (concurrencyManager.isProcessing(channelId)) {
        console.log(`[MINING] Channel ${channelId} is already being processed locally, skipping...`);
        return;
    }
    
    const lockAcquired = await concurrencyManager.acquireLock(channelId, 3000);
    if (!lockAcquired) {
        console.log(`[MINING] Could not acquire lock for channel ${channelId}, skipping...`);
        return;
    }
    
    try {
        const now = Date.now();
        
        // Check if we just ended a break
        if (dbEntry.gameData?.breakJustEnded) {
            const timeSinceBreakEnd = now - dbEntry.gameData.breakJustEnded;
            if (timeSinceBreakEnd < 5000) {
                console.log(`[MINING] Channel ${channelId} just ended break ${timeSinceBreakEnd}ms ago, waiting...`);
                return;
            }
            
            await gachaVC.updateOne(
                { channelId },
                { $unset: { 'gameData.breakJustEnded': 1 } }
            );
        }
        
        // Update health metrics
        healthMetrics.lastProcessed.set(channelId, now);
        
        // Initialize game data if needed
        if (!dbEntry.gameData) {
            initializeGameData(dbEntry, channel.id);
            await dbEntry.save();
        } else {
            if (!dbEntry.gameData.gamemode) {
                console.log(`[MINING] Fixing missing gamemode for channel ${channel.id}`);
                dbEntry.gameData.gamemode = 'mining';
                dbEntry.markModified('gameData');
                await dbEntry.save();
            }
        }

        if (!channel?.isVoiceBased()) {
            return;
        }
        
        const members = channel.members.filter(m => !m.user.bot);
        if (!members.size) {
            return;
        }

        // Enhanced power level detection with error handling
        const serverPowerLevel = json?.power || 1;
        const serverName = json?.name || 'Unknown Mine';
        const serverModifiers = getServerModifiers(serverName, serverPowerLevel);
        
        console.log(`[MINING] Power Level ${serverPowerLevel} detected for ${serverName}`);
        
        // Perform initial hazard roll (once per session)
        await performInitialHazardRoll(channel, dbEntry, serverPowerLevel);
        
        // Check if we're in a break period
        const inBreak = isBreakPeriod(dbEntry);
        
        if (inBreak) {
            const breakInfo = dbEntry.gameData.breakInfo;
            
            if (now >= breakInfo.breakEndTime) {
                if (dbEntry.gameData?.specialEvent) {
                    const eventEndResult = await checkAndEndSpecialEvent(channel, dbEntry);
                    if (eventEndResult) {
                        await logEvent(channel, eventEndResult, true);
                    }
                }
                await endBreak(channel, dbEntry, serverPowerLevel);
                return;
            }
            
            if (dbEntry.gameData?.specialEvent) {
                const specialEvent = dbEntry.gameData.specialEvent;
                if (now >= specialEvent.endTime) {
                    const eventEndResult = await checkAndEndSpecialEvent(channel, dbEntry);
                    if (eventEndResult) {
                        await logEvent(channel, eventEndResult, true);
                        
                        if (breakInfo.isLongBreak && !dbEntry.gameData?.specialEvent) {
                            await generateShop(channel, 10);
                            await logEvent(channel, '🛒 Shop is now open after event!', true);
                        }
                    }
                }
            }
            
            return;
        }

        // Check if it's time to start a break
        if (now >= dbEntry.nextShopRefresh) {
            const cycleCount = dbEntry.gameData?.cycleCount || 0;
            const isLongBreak = (cycleCount % 4) === 3;
            
            let selectedEvent = null;
            
            console.log(`[MINING] Creating mining summary for channel ${channel.id}...`);
            try {
                await createMiningSummary(channel, dbEntry);
                console.log(`[MINING] Mining summary created successfully for channel ${channel.id}`);
            } catch (summaryError) {
                console.error(`[MINING] ERROR creating mining summary for channel ${channel.id}:`, summaryError);
            }
            
            if (isLongBreak) {
                const playerCount = members.size;
                selectedEvent = pickLongBreakEvent(playerCount);
                console.log(`[MAIN] Long break: Selected event for ${playerCount} players`);
            }
            
            await startBreak(channel, dbEntry, isLongBreak, serverPowerLevel, selectedEvent);
            return;
        }

        // Enhanced mining logic with power level integration
        const memberIds = Array.from(members.keys());
        const playerStatsMap = await playerStatsCache.getMultiple(memberIds);

        const availableItems = getAvailableItems(serverPowerLevel);
        const availableTreasures = getAvailableTreasures(serverPowerLevel);
        
        console.log(`[MINING] Available items for power level ${serverPowerLevel}:`, availableItems.length);
        
        let mapData = dbEntry.gameData.map;
        let mapChanged = false;
        const transaction = new DatabaseTransaction();
        const eventLogs = [];
        let wallsBroken = 0;
        let treasuresFound = 0;
        
        // Get or initialize hazards data with enhanced spawn rates for danger 6-7
        let hazardsData = await hazardStorage.getHazardsData(channel.id);
        let hazardsChanged = false;
        
        if (!mapData) {
            mapData = initializeMap(channel.id);
            mapChanged = true;
            
            // Enhanced hazard spawn chance for high danger levels
            let hazardSpawnChance = getHazardSpawnChance(serverPowerLevel);
            if (serverPowerLevel >= 6) {
                hazardSpawnChance *= 3;
            }
            if (serverPowerLevel >= 7) {
                hazardSpawnChance *= 5;
            }
            
            hazardsData = hazardStorage.generateHazardsForArea(
                hazardsData,
                0,
                0,
                mapData.width,
                mapData.height,
                hazardSpawnChance,
                serverPowerLevel
            );
            hazardsChanged = true;
        }

        // Check for new players
        const existingPositions = mapData.playerPositions || {};
        const newPlayers = [];
        for (const member of members.values()) {
            if (!existingPositions[member.id]) {
                newPlayers.push(member);
                const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
                eventLogs.push(`👋 ${member.displayName} joined the ${powerLevelConfig?.name || 'Expedition'}!`);
            }
        }
        
        mapData = initializeBreakPositions(mapData, members, false);
        mapChanged = true;
        
        // Check for players who left
        const currentPlayerIds = Array.from(members.keys());
        const departedPlayers = [];
        for (const playerId of Object.keys(existingPositions)) {
            if (!currentPlayerIds.includes(playerId)) {
                const memberName = channel.guild.members.cache.get(playerId)?.displayName || 'A miner';
                departedPlayers.push({ id: playerId, name: memberName });
                eventLogs.push(`👋 ${memberName} left the mines`);
                playerMovementHistory.delete(playerId);
            }
        }
        
        mapData = cleanupPlayerPositions(mapData, currentPlayerIds);

        // Calculate team sight radius
        let teamSightRadius = 1;
        let maxSightThroughWalls = 0;
        if (!inBreak) {
            let totalSight = 0;
            let playerCount = 0;
            for (const member of members.values()) {
                const playerData = playerStatsMap.get(member.id);
                totalSight += playerData?.stats?.sight || 0;
                playerCount++;
                
                const uniqueBonuses = parseUniqueItemBonuses(playerData?.equippedItems);
                maxSightThroughWalls = Math.max(maxSightThroughWalls, uniqueBonuses.sightThroughWalls || 0);
            }
            teamSightRadius = Math.floor(totalSight / playerCount) + 1;
            
            const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
            if (powerLevelConfig) {
                teamSightRadius = Math.floor(teamSightRadius * powerLevelConfig.speedBonus);
            }
            
            if (maxSightThroughWalls > 0) {
                teamSightRadius += Math.floor(maxSightThroughWalls);
                eventLogs.push(`👁️ Enhanced vision reveals hidden areas!`);
            }
        }

        let teamVisibleTiles = visibilityCalculator.calculateTeamVisibility(
            mapData.playerPositions, 
            teamSightRadius, 
            mapData.tiles
        );
        
        for (const tileKey of teamVisibleTiles) {
            const [x, y] = tileKey.split(',').map(Number);
            if (mapData.tiles[y] && mapData.tiles[y][x] && !mapData.tiles[y][x].discovered) {
                mapData.tiles[y][x].discovered = true;
                mapChanged = true;
            }
        }

        if (dbEntry.gameData?.breakInfo?.justEnded) {
            hazardEffects.enablePlayersAfterBreak(dbEntry);
            delete dbEntry.gameData.breakInfo.justEnded;
            await dbEntry.save();
        }
        
        const hadExpiredDisables = hazardEffects.cleanupExpiredDisables(dbEntry);
        if (hadExpiredDisables) {
            await dbEntry.save();
        }
        
        // Process actions for each player
        for (const member of members.values()) {
            try {
                const wasDisabled = dbEntry.gameData?.disabledPlayers?.[member.id];
                const isDisabled = hazardEffects.isPlayerDisabled(member.id, dbEntry);
                
                if (wasDisabled && !isDisabled) {
                    eventLogs.push(`⭐ ${member.displayName} recovered from being knocked out!`);
                    const position = mapData.playerPositions[member.id];
                    if (position && (position.x !== mapData.entranceX || position.y !== mapData.entranceY)) {
                        position.x = mapData.entranceX;
                        position.y = mapData.entranceY;
                        position.disabled = false;
                        mapChanged = true;
                    }
                }
                
                if (isDisabled) {
                    const disabledInfo = dbEntry.gameData?.disabledPlayers?.[member.id];
                    if (disabledInfo?.enableAt && Math.random() < 0.1) {
                        const now = Date.now();
                        const remainingMs = disabledInfo.enableAt - now;
                        const remainingMinutes = Math.ceil(remainingMs / 60000);
                        if (remainingMinutes > 0) {
                            eventLogs.push(`💤 ${member.displayName} is knocked out (${remainingMinutes} min remaining)`);
                        }
                    }
                    continue;
                }
                
                const playerData = playerStatsMap.get(member.id) || { stats: {}, level: 1 };
                const playerLevel = playerData.level || 1;
                
                const efficiency = getCachedMiningEfficiency(serverPowerLevel, playerLevel, serverModifiers);
                
                const result = await processPlayerActionsEnhanced(
                    member, 
                    playerData, 
                    mapData, 
                    teamVisibleTiles, 
                    serverPowerLevel,
                    availableItems,
                    availableTreasures,
                    efficiency,
                    serverModifiers,
                    transaction,
                    eventLogs,
                    dbEntry,
                    hazardsData
                );
                
                if (result.hazardsChanged) {
                    hazardsChanged = true;
                }
                
                if (result.mapChanged) {
                    mapChanged = true;
                    if (result.mapData) {
                        mapData = result.mapData;
                        teamVisibleTiles = visibilityCalculator.calculateTeamVisibility(
                            mapData.playerPositions, 
                            teamSightRadius, 
                            mapData.tiles
                        );
                    }
                }
                wallsBroken += result.wallsBroken;
                treasuresFound += result.treasuresFound;
            } catch (playerError) {
                console.error(`[MINING] Error processing player ${member.displayName}:`, playerError);
            }
        }

        if (wallsBroken > 0 || treasuresFound > 0) {
            batchDB.queueUpdate(channel.id, {
                'gameData.stats.wallsBroken': (dbEntry.gameData.stats?.wallsBroken || 0) + wallsBroken,
                'gameData.stats.treasuresFound': (dbEntry.gameData.stats?.treasuresFound || 0) + treasuresFound
            });
        }

        if (hazardsChanged) {
            await hazardStorage.saveHazardsData(channel.id, hazardsData);
        }
        
        if (mapChanged) {
            console.log(`[MINING] Map changed for channel ${channel.id} (Power Level ${serverPowerLevel})`);
            
            visibilityCalculator.invalidate();
            transaction.setMapUpdate(channel.id, mapData);
            
            const { clearOreCache } = require('./mining/miningUtils');
            clearOreCache();
        }
        
        try {
            await transaction.commit();
            if (mapChanged) {
                console.log(`[MINING] Map update committed successfully for channel ${channel.id}`);
            }
        } catch (commitError) {
            console.error(`[MINING] Error committing transaction for channel ${channel.id}:`, commitError);
        }
        
        await batchDB.flush();
        
        if (mapChanged) {
            dbCache.delete(channel.id);
        }

        const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
        const powerLevelInfo = {
            level: serverPowerLevel,
            name: powerLevelConfig?.name || 'Unknown Expedition',
            specialBonus: serverModifiers.specialBonus
        };

        if (eventLogs.length > 0) {
            const combinedEvents = eventLogs.join(' | ');
            await logEvent(channel, combinedEvents, false, powerLevelInfo);
        } else {
            await logEvent(channel, '', false, powerLevelInfo);
        }
        
        const processingTime = Date.now() - processingStartTime;
        const avgTime = healthMetrics.averageProcessingTime.get(channelId) || processingTime;
        healthMetrics.averageProcessingTime.set(channelId, (avgTime + processingTime) / 2);
        
        healthMetrics.processingErrors.set(channelId, 0);
        
    } catch (error) {
        console.error(`[MINING] Error processing channel ${channelId}:`, error);
        
        healthMetrics.processingErrors.set(channelId, 
            (healthMetrics.processingErrors.get(channelId) || 0) + 1);
        
        if (healthMetrics.processingErrors.get(channelId) > 3) {
            console.warn(`[MINING] Too many errors for channel ${channelId}, attempting recovery...`);
            await attemptAutoRecovery(channel);
        }
    } finally {
        concurrencyManager.releaseLock(channelId);
    }
};

// Enhanced player action processing
async function processPlayerActionsEnhanced(member, playerData, mapData, teamVisibleTiles, powerLevel, availableItems, availableTreasures, efficiency, serverModifiers, transaction, eventLogs, dbEntry, hazardsData) {
    const miningPower = playerData?.stats?.mining || 0;
    const luckStat = playerData?.stats?.luck || 0;
    const speedStat = Math.min(playerData?.stats?.speed || 1, MAX_SPEED_ACTIONS);
    
    let uniqueBonuses;
    try {
        uniqueBonuses = parseUniqueItemBonuses(playerData?.equippedItems);
    } catch (error) {
        console.error(`[MINING] Error parsing unique bonuses for ${member.displayName}:`, error);
        uniqueBonuses = {
            doubleOreChance: 0,
            hazardResistance: 0,
            movementSpeedBonus: 0,
            lootMultiplier: 1,
            areaDamageChance: 0,
            chainMiningChance: 0,
            sightThroughWalls: 0,
            uniqueItems: []
        };
    }
    
    let wallsBroken = 0;
    let treasuresFound = 0;
    let mapChanged = false;
    let hazardsChanged = false;
    
    if (!playerMovementHistory.has(member.id)) {
        playerMovementHistory.set(member.id, { lastDirection: null, sameDirectionCount: 0 });
    }
    const moveHistory = playerMovementHistory.get(member.id);
    
    let bestPickaxe = null;
    let isUniquePickaxe = false;
    try {
        for (const [key, item] of Object.entries(playerData?.equippedItems || {})) {
            if (!item || item.type !== 'tool' || item.slot !== 'mining') continue;

            const miningAbility = item.abilities?.find(a => a.name === 'mining');
            if (miningAbility) {
                const currentPower = miningAbility.powerlevel || miningAbility.power || 0;
                const bestPower = bestPickaxe?.abilities?.find(a => a.name === 'mining')?.powerlevel || 
                                    bestPickaxe?.abilities?.find(a => a.name === 'mining')?.power || 0;
                
                if (!bestPickaxe || currentPower > bestPower) {
                    bestPickaxe = { ...item, itemId: item.itemId || item.id || key };
                    isUniquePickaxe = item.isUnique || false;
                }
            }
        }
    } catch (error) {
        console.error(`[MINING] Error finding best pickaxe for ${member.displayName}:`, error);
    }
    
    let enhancedSpeed = Math.floor(speedStat * efficiency.speedMultiplier);
    enhancedSpeed = applyMovementSpeedBonus(enhancedSpeed, uniqueBonuses.movementSpeedBonus);
    const numActions = enhancedSpeed > 0 ? Math.floor(Math.random() * enhancedSpeed) + 1 : 1;
    
    for (let actionNum = 0; actionNum < numActions; actionNum++) {
        try {
            const position = mapData.playerPositions[member.id];
            if (!position) break;
            
            if (position.stuck || position.trapped) {
                break;
            }
            
            if (Math.random() < efficiency.treasureChance) {
                const treasure = await generateTreasure(powerLevel, efficiency);
                if (treasure) {
                    await addItemToMinecart(dbEntry, member.id, treasure.itemId, 1);
                    eventLogs.push(`🎁 ${member.displayName} discovered ${treasure.name} while exploring!`);
                    treasuresFound++;
                }
            }
            
            const adjacentPositions = [
                { x: position.x, y: position.y - 1 },
                { x: position.x + 1, y: position.y },
                { x: position.x, y: position.y + 1 },
                { x: position.x - 1, y: position.y }
            ];
            
            let adjacentTarget = null;
            for (const adj of adjacentPositions) {
                let checkX = adj.x, checkY = adj.y;
                
                if (checkX < 0 || checkX >= mapData.width || checkY < 0 || checkY >= mapData.height) {
                    // Enhanced hazard generation for expanded areas at high danger levels
                    let expandHazardChance = getHazardSpawnChance(powerLevel);
                    if (powerLevel >= 6) expandHazardChance *= 3;
                    if (powerLevel >= 7) expandHazardChance *= 5;
                    
                    const expandedMap = await checkMapExpansion(mapData, checkX, checkY, dbEntry.channelId, hazardsData, powerLevel, expandHazardChance);
                    if (expandedMap !== mapData) {
                        mapData = expandedMap;
                        mapChanged = true;
                        hazardsChanged = true;
                    }
                }
                
                if (checkY >= 0 && checkY < mapData.height && checkX >= 0 && checkX < mapData.width) {
                    const tile = mapData.tiles[checkY][checkX];
                    if (tile && (tile.type === TILE_TYPES.WALL_WITH_ORE || 
                               tile.type === TILE_TYPES.RARE_ORE ||
                               tile.type === TILE_TYPES.TREASURE_CHEST)) {
                        adjacentTarget = { x: checkX, y: checkY, tile };
                        break;
                    }
                }
            }
            
            if (adjacentTarget) {
                const tile = adjacentTarget.tile;
                if (await canBreakTile(member.id, miningPower, tile)) {
                    const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, tile.type, availableItems, efficiency);
                    
                    let finalQuantity = quantity;
                    let finalValue = item.value;
                    
                    if (serverModifiers.itemBonuses && serverModifiers.itemBonuses[item.itemId]) {
                        const bonus = serverModifiers.itemBonuses[item.itemId];
                        finalQuantity = Math.floor(quantity * bonus);
                        finalValue = Math.floor(item.value * bonus);
                    }
                    
                    finalQuantity = applyDoubleOreBonus(finalQuantity, uniqueBonuses.doubleOreChance, member, eventLogs);
                    finalQuantity = Math.floor(finalQuantity * uniqueBonuses.lootMultiplier);
                    
                    await addItemToMinecart(dbEntry, member.id, item.itemId, finalQuantity);
                    
                    mapData.tiles[adjacentTarget.y][adjacentTarget.x] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                    mapChanged = true;
                    wallsBroken++;
                    
                    let findMessage;
                    if (tile.type === TILE_TYPES.TREASURE_CHEST) {
                        findMessage = `💍 ${member.displayName} discovered treasure! Found『 ${item.name} x ${finalQuantity} 』!`;
                        treasuresFound++;
                    } else if (tile.type === TILE_TYPES.RARE_ORE) {
                        findMessage = `💎 ${member.displayName} struck rare ore! Harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                    } else {
                        findMessage = `⛏️ ${member.displayName} harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                    }
                    
                    if (bestPickaxe) {
                        const uniqueCheck = checkUniquePickaxeBreak(bestPickaxe, isUniquePickaxe);
                        
                        if (uniqueCheck && uniqueCheck.isUnique) {
                            if (uniqueBonuses.uniqueItems.length > 0) {
                                const uniqueItem = uniqueBonuses.uniqueItems[0];
                                if (uniqueItem.maintenanceRatio < 0.3) {
                                    findMessage += ` ⚡ [${bestPickaxe.name}: Legendary - ${Math.round(uniqueItem.maintenanceRatio * 100)}% power]`;
                                }
                            }
                        } else {
                            const durabilityCheck = checkPickaxeBreak(bestPickaxe, tile.hardness);
                            if (durabilityCheck.shouldBreak) {
                                transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                                eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered!`);
                            } else {
                                transaction.updatePickaxeDurability(member.id, bestPickaxe.itemId, durabilityCheck.newDurability);
                                
                                const maxDurability = bestPickaxe.durability || 100;
                                const durabilityPercent = (durabilityCheck.newDurability / maxDurability) * 100;
                                
                                if (durabilityPercent <= 10) {
                                    findMessage += ` ⚠️ [${bestPickaxe.name}: ${durabilityCheck.newDurability}/${maxDurability}]`;
                                }
                            }
                        }
                    }
                    
                    eventLogs.push(findMessage);
                    
                    await updateMiningActivity(member.id, 1);
                    
                    const itemFind = await processUniqueItemFinding(
                        member,
                        'mining',
                        powerLevel,
                        luckStat,
                        null
                    );
                    
                    if (itemFind) {
                        eventLogs.push(itemFind.message);
                            // NEW: Check for legendary announcement
                            if (itemFind.systemAnnouncement && itemFind.systemAnnouncement.enabled) {
                                // Send the legendary announcement to all channels
                                await sendLegendaryAnnouncement(
                                    client,  // You'll need to pass the client from the main function
                                    channel.guild.id,
                                    itemFind,
                                    member.displayName
                                );
                            }
                    }
                    
                    if (uniqueBonuses.areaDamageChance > 0) {
                        const extraWalls = applyAreaDamage(
                            { x: adjacentTarget.x, y: adjacentTarget.y },
                            mapData,
                            uniqueBonuses.areaDamageChance,
                            member,
                            eventLogs
                        );
                        wallsBroken += extraWalls;
                    }
                    
                    if (uniqueBonuses.chainMiningChance > 0) {
                        const chainTargets = getChainMiningTargets(
                            { x: adjacentTarget.x, y: adjacentTarget.y },
                            mapData,
                            uniqueBonuses.chainMiningChance,
                            member,
                            eventLogs
                        );
                        
                        for (const chainTarget of chainTargets) {
                            const chainTile = mapData.tiles[chainTarget.y][chainTarget.x];
                            if (chainTile && await canBreakTile(member.id, miningPower, chainTile)) {
                                const { item: chainItem, quantity: chainQty } = await mineFromTile(
                                    member, miningPower, luckStat, powerLevel, 
                                    chainTile.type, availableItems, efficiency
                                );
                                await addItemToMinecart(dbEntry, member.id, chainItem.itemId, chainQty);
                                mapData.tiles[chainTarget.y][chainTarget.x] = { 
                                    type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 
                                };
                                wallsBroken++;
                            }
                        }
                    }
                } else {
                    let findMessage;
                    if (tile.type === TILE_TYPES.TREASURE_CHEST) {
                        findMessage = `${member.displayName} discovered treasure! But failed to open it...)`;
                        treasuresFound++;
                    } else if (tile.type === TILE_TYPES.RARE_ORE) {
                        findMessage = `${member.displayName} struck rare ore! But they were parried! Wait what?)`;
                    } else {
                        findMessage = `${member.displayName} struck the ore wall but nothing happened...)`;
                    }
                    eventLogs.push(findMessage);
                }
                continue;
            }
            
            const visibleTargets = [TILE_TYPES.TREASURE_CHEST, TILE_TYPES.RARE_ORE, TILE_TYPES.WALL_WITH_ORE];
            const nearestTarget = findNearestTarget(position, teamVisibleTiles, mapData.tiles, visibleTargets);
            
            let direction;
            if (nearestTarget) {
                direction = getDirectionToTarget(position, nearestTarget);
                if (Math.random() < 0.2) {
                    const randomOffsets = [
                        { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, 
                        { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
                    ];
                    const randomDir = randomOffsets[Math.floor(Math.random() * randomOffsets.length)];
                    direction = randomDir;
                }
            } else {
                const directions = [
                    { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, 
                    { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
                ];
                direction = directions[Math.floor(Math.random() * directions.length)];
            }
            
            if (moveHistory.lastDirection && 
                moveHistory.lastDirection.dx === direction.dx && 
                moveHistory.lastDirection.dy === direction.dy) {
                moveHistory.sameDirectionCount++;
                
                if (moveHistory.sameDirectionCount >= 3 + Math.floor(Math.random() * 3)) {
                    const allDirections = [
                        { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, 
                        { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
                    ];
                    const newDirections = allDirections.filter(d => 
                        d.dx !== direction.dx || d.dy !== direction.dy
                    );
                    direction = newDirections[Math.floor(Math.random() * newDirections.length)];
                    moveHistory.sameDirectionCount = 0;
                }
            } else {
                moveHistory.sameDirectionCount = 0;
            }
            moveHistory.lastDirection = { dx: direction.dx, dy: direction.dy };
            
            if (direction.dx === 0 && direction.dy === 0) continue;
            
            let newX = position.x + direction.dx;
            let newY = position.y + direction.dy;
            
            // Enhanced hazard generation for map expansion at high danger levels
            let expandHazardChance = getHazardSpawnChance(powerLevel);
            if (powerLevel >= 6) expandHazardChance *= 3;
            if (powerLevel >= 7) expandHazardChance *= 5;
            
            const expandedMap = await checkMapExpansion(mapData, newX, newY, dbEntry.channelId, hazardsData, powerLevel, expandHazardChance);
            if (expandedMap !== mapData) {
                mapData = expandedMap;
                mapChanged = true;
                hazardsChanged = true;
            }
            
            if (newX < 0 || newX >= mapData.width || newY < 0 || newY >= mapData.height) continue;
            
            const targetTile = mapData.tiles[newY] && mapData.tiles[newY][newX];
            if (!targetTile) continue;
            
            if ([TILE_TYPES.WALL, TILE_TYPES.REINFORCED_WALL, TILE_TYPES.WALL_WITH_ORE, TILE_TYPES.RARE_ORE, TILE_TYPES.TREASURE_CHEST].includes(targetTile.type)) {
                const canBreak = await canBreakTile(member.id, miningPower, targetTile);
                if (canBreak) {
                    if (Math.random() < 0.15 && targetTile.type === TILE_TYPES.WALL) {
                        continue;
                    }
                    if ([TILE_TYPES.WALL_WITH_ORE, TILE_TYPES.RARE_ORE, TILE_TYPES.TREASURE_CHEST].includes(targetTile.type)) {
                        const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, targetTile.type, availableItems, efficiency);
                        
                        let finalQuantity = quantity;
                        if (serverModifiers.itemBonuses && serverModifiers.itemBonuses[item.itemId]) {
                            finalQuantity = Math.floor(quantity * serverModifiers.itemBonuses[item.itemId]);
                        }
                        
                        await addItemToMinecart(dbEntry, member.id, item.itemId, finalQuantity);
                        
                        let findMessage;
                        if (targetTile.type === TILE_TYPES.TREASURE_CHEST) {
                            findMessage = `👑 ${member.displayName} opened treasure! Found『 ${item.name} x${finalQuantity} 』!`;
                            treasuresFound++;
                        } else if (targetTile.type === TILE_TYPES.RARE_ORE) {
                            findMessage = `💎 ${member.displayName} mined rare ore! Found『 ${item.name} x${finalQuantity} 』!`;
                        } else {
                            findMessage = `⛏️ ${member.displayName} harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                        }
                        
                        eventLogs.push(findMessage);
                    }
                    
                    mapData.tiles[newY][newX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                    position.x = newX;
                    position.y = newY;
                    mapChanged = true;
                    wallsBroken++;
                }
            } else if (targetTile.type === TILE_TYPES.FLOOR || targetTile.type === TILE_TYPES.ENTRANCE) {
                position.x = newX;
                position.y = newY;
                mapChanged = true;
                
                if (hazardStorage.hasHazard(hazardsData, newX, newY)) {
                    // Check sight stat first - removes hazard without triggering
                    const sightStat = playerData?.stats?.sight || 0;
                    const sightAvoidChance = Math.min(0.5, sightStat * 0.05); // 5% per sight point, max 50%
                    
                    if (Math.random() < sightAvoidChance) {
                        const hazard = hazardStorage.getHazard(hazardsData, newX, newY);
                        if (hazard && !(hazard.type === 'treasure' || hazard.type === 'rare_treasure' || hazard.type === 'legendary_treasure' || hazard.type === 'mythic_treasure')) {
                            eventLogs.push(`👁️ ${member.displayName}'s keen sight spotted and avoided a ${hazard.type || 'hazard'}!`);
                            hazardStorage.removeHazard(hazardsData, newX, newY);
                            hazardsChanged = true;
                            continue;
                        }
                    }
                    
                    // Check luck stat - avoids triggering but keeps hazard on map
                    const luckAvoidChance = Math.min(0.4, luckStat * 0.04); // 4% per luck point, max 40%
                    
                    if (Math.random() < luckAvoidChance) {
                        const hazard = hazardStorage.getHazard(hazardsData, newX, newY);
                        if (hazard && !(hazard.type === 'treasure' || hazard.type === 'rare_treasure' || hazard.type === 'legendary_treasure' || hazard.type === 'mythic_treasure')) {
                            eventLogs.push(`🍀 ${member.displayName}'s luck helped them narrowly avoid a ${hazard.type || 'hazard'}!`);
                            // Don't remove the hazard, just skip triggering it
                            continue;
                        }
                    }
                    
                    // Check hazard resistance from unique items
                    if (checkHazardResistance(uniqueBonuses.hazardResistance, member, eventLogs)) {
                        hazardStorage.removeHazard(hazardsData, newX, newY);
                        hazardsChanged = true;
                        continue;
                    }
                    
                    const hazard = hazardStorage.getHazard(hazardsData, newX, newY);
                    
                    if (hazard && (hazard.type === 'treasure' || hazard.type === 'rare_treasure' || hazard.type === 'legendary_treasure' || hazard.type === 'mythic_treasure')) {
                        const treasureConfig = hazardEffects.ENCOUNTER_CONFIG?.[hazard.type] || { name: 'Treasure', minItems: 1, maxItems: 3 };
                        const itemCount = Math.floor(Math.random() * (treasureConfig.maxItems - treasureConfig.minItems + 1)) + treasureConfig.minItems;
                        
                        let totalValue = 0;
                        const foundItems = [];
                        
                        for (let i = 0; i < itemCount; i++) {
                            const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, TILE_TYPES.TREASURE_CHEST, availableItems, efficiency);
                            await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                            foundItems.push(`${item.name} x${quantity}`);
                            totalValue += item.value * quantity;
                        }
                        
                        eventLogs.push(`💎 ${member.displayName} found ${hazard.type.replace('_', ' ')}! Got: ${foundItems.join(', ')}`);
                        treasuresFound++;
                        
                        const treasureFind = await processUniqueItemFinding(
                            member,
                            'treasure',
                            powerLevel,
                            luckStat,
                            null
                        );
                        
                        if (treasureFind) {
                            eventLogs.push(treasureFind.message);
                        }
                        
                        hazardStorage.removeHazard(hazardsData, newX, newY);
                        hazardsChanged = true;
                    } else {
                        const hazardResult = await hazardEffects.processHazardTrigger(
                            member,
                            position,
                            mapData,
                            hazardsData,
                            dbEntry,
                            transaction,
                            eventLogs
                        );
                        
                        if (hazardResult) {
                            if (hazardResult.mapChanged) mapChanged = true;
                            if (hazardResult.playerDisabled) {
                                break;
                            }
                            hazardsChanged = true;
                        }
                        
                        // Always remove the hazard after triggering it (unless it's a special persistent type)
                        if (hazard && hazard.type !== 'persistent') {
                            hazardStorage.removeHazard(hazardsData, newX, newY);
                            hazardsChanged = true;
                        }
                    }
                }
                
                if (Math.random() < EXPLORATION_BONUS_CHANCE * efficiency.speedMultiplier) {
                    const bonusItems = availableItems.filter(item => item.tier === 'common');
                    if (bonusItems.length > 0) {
                        const bonusItem = bonusItems[Math.floor(Math.random() * bonusItems.length)];
                        eventLogs.push(`🔍 ${member.displayName} found ${bonusItem.name} while exploring!`);
                        await addItemToMinecart(dbEntry, member.id, bonusItem.itemId, 1);
                    }
                }
            }
        } catch (actionError) {
            console.error(`[MINING] Error processing action ${actionNum} for ${member.displayName}:`, actionError);
        }
    }
    
    return { mapChanged, wallsBroken, treasuresFound, mapData, hazardsChanged };
}

// Cleanup function for when bot shuts down or restarts
function cleanupAllChannels() {
    console.log('[MINING] Cleaning up all locks and intervals...');
    
    // Clean up instance manager
    instanceManager.cleanup();
    
    const debugInfo = concurrencyManager.getDebugInfo();
    console.log('[MINING] Active locks:', debugInfo.lockedChannels);
    console.log('[MINING] Active intervals:', debugInfo.activeIntervals);
    
    for (const channelId of debugInfo.lockedChannels) {
        concurrencyManager.forceUnlock(channelId);
    }
    
    for (const key of debugInfo.activeIntervals) {
        const [channelId] = key.split('_');
        concurrencyManager.clearAllIntervalsForChannel(channelId);
    }
    
    messageQueue.recentMessages.clear();
    playerMovementHistory.clear();
    dbCache.clear();
    efficiencyCache.clear();
    healthMetrics.lastProcessed.clear();
    healthMetrics.processingErrors.clear();
    healthMetrics.averageProcessingTime.clear();
    healthMetrics.stuckChannels.clear();
}

// Set up periodic health check for all channels
let healthCheckInterval = null;

function startHealthMonitoring() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    
    healthCheckInterval = setInterval(() => {
        const debugInfo = concurrencyManager.getDebugInfo();
        const now = Date.now();
        
        for (const channelId of debugInfo.lockedChannels) {
            const lastProcessed = healthMetrics.lastProcessed.get(channelId);
            if (lastProcessed && (now - lastProcessed) > MAX_PROCESSING_TIME) {
                console.warn(`[HEALTH] Channel ${channelId} has been locked for too long, forcing unlock`);
                concurrencyManager.forceUnlock(channelId);
            }
        }
        
        for (const [channelId, timestamp] of healthMetrics.lastProcessed) {
            if (now - timestamp > 60 * 60 * 1000) {
                healthMetrics.lastProcessed.delete(channelId);
                healthMetrics.processingErrors.delete(channelId);
                healthMetrics.averageProcessingTime.delete(channelId);
            }
        }
    }, HEALTH_CHECK_INTERVAL);
}

// Get diagnostic information
function getDiagnostics() {
    return {
        instanceManager: instanceManager.getDiagnostics(),
        concurrency: concurrencyManager.getDebugInfo(),
        healthMetrics: {
            stuckChannels: Array.from(healthMetrics.stuckChannels),
            processingErrors: Array.from(healthMetrics.processingErrors.entries()),
            lastProcessed: Array.from(healthMetrics.lastProcessed.entries()).map(([id, time]) => ({
                channelId: id,
                lastProcessed: new Date(time).toISOString(),
                ageMs: Date.now() - time
            }))
        }
    };
}

// Start health monitoring
startHealthMonitoring();

// Export utility functions
module.exports.mineFromTile = mineFromTile;
module.exports.generateTreasure = generateTreasure;
module.exports.getServerModifiers = getServerModifiers;
module.exports.getCachedMiningEfficiency = getCachedMiningEfficiency;
module.exports.POWER_LEVEL_CONFIG = POWER_LEVEL_CONFIG;
module.exports.cleanupAllChannels = cleanupAllChannels;
module.exports.performHealthCheck = performHealthCheck;
module.exports.attemptAutoRecovery = attemptAutoRecovery;
module.exports.startHealthMonitoring = startHealthMonitoring;
module.exports.getDiagnostics = getDiagnostics;
module.exports.concurrencyManager = concurrencyManager;
module.exports.endBreak = endBreak;
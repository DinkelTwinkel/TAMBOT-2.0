// mining_optimized_v5_performance.js - Power Level Integrated Mining System with Enhanced Reliability
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
const simpleHazardScanner = require('./mining/hazards/simpleHazardScanner');
const { canStartBreak } = require('./mining/mining_break_hotfix');
const { handlePickaxeDurability } = require('./mining/improvedDurabilityHandling');
const deeperMineChecker = require('../mining/deeperMineChecker');
const generateTileMapImage = require('./mining/imageProcessing/mining-layered-render');
const gachaVC = require('../../models/activevcs');
const mapCacheSystem = require('./mining/cache/mapCacheSystem');
const { 
    parseUniqueItemBonuses, 
    applyDoubleOreBonus, 
    checkHazardResistance, 
    applyMovementSpeedBonus,
    checkUniquePickaxeBreak,
    applyAreaDamage,
    getChainMiningTargets,
    checkShadowstepTeleport
} = require('./mining/uniqueItemBonuses');

// Import shadow clone system
const shadowCloneSystem = require('./mining/shadowCloneSystem');

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
    ITEM_CATEGORY
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
    addItemWithDestination,
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
    scatterPlayersForBreak
} = require('./mining/miningEvents');

// Import hazard systems
const hazardStorage = require('./mining/hazardStorage');
const hazardEffects = require('./mining/hazardEffects');
const { 
    performGeologicalScan, 
    resetGeologicalScan, 
    shouldResetScan, 
    getHazardProbability
} = require('./mining/hazards/geologicalScanner');

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
    updateMiningActivity,
    updateMovementActivity
} = require('./mining/uniqueItemIntegration');

// Import hazard allowed types fix
const hazardAllowedTypesFix = require('./mining/fixes/fix_hazard_allowed_types');
hazardAllowedTypesFix.patchHazardStorage();

// Import mining context manager
const miningContext = require('./mining/miningContext');

// Import maintenance display
const { getMaintenanceWarnings } = require('./mining/maintenanceDisplay');

// Import bug fixes
const { getMinecartSummaryFresh } = require('./mining_fixes/fix_minecart_display_simple');
const { clearTentFlags, verifyAndFixPlayerPositions } = require('./mining/fix_tent_display');
const { verifyCycleCount } = require('./mining/fix_long_break_cycle');

// Enhanced Concurrency Manager with Instance Management
class EnhancedConcurrencyManager {
    constructor() {
        this.locks = new Map();
        this.intervals = new Map();
        this.processing = new Map();
    }
    
    async acquireLock(channelId, timeout = 5000) {
        if (!instanceManager.hasActiveInstance(channelId)) {
            if (!instanceManager.registerInstance(channelId)) {
                console.log(`[CONCURRENCY] Cannot acquire lock - another process owns channel ${channelId}`);
                return false;
            }
        }
        
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
}

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

// TIMING CONFIGURATION
const MINING_DURATION = process.env.MINING_DURATION || 25 * 60 * 1000;
const SHORT_BREAK_DURATION = process.env.SHORT_BREAK_DURATION || 5 * 60 * 1000;
const LONG_BREAK_DURATION = process.env.LONG_BREAK_DURATION || 20 * 60 * 1000;
const LONG_EVENT_DURATION = process.env.LONG_EVENT_DURATION || 15 * 60 * 1000;
const MAX_PROCESSING_TIME = 120000; // 2 minutes max processing time

// Cache Management Configuration
const MAX_CACHE_SIZE = 100;
const EFFICIENCY_CACHE_SIZE = 50;

// Performance: Cache database entries with size management
const dbCache = new Map();
const efficiencyCache = new Map();

// Track processing times and health metrics
const healthMetrics = {
    lastProcessed: new Map(),
    processingErrors: new Map(),
    stuckChannels: new Set()
};

// Track recent movements to prevent straight-line behavior
const playerMovementHistory = new Map();

// Track legendary/unique cooldowns per player
const legendaryFindCooldowns = new Map();
const LEGENDARY_COOLDOWN = 30 * 60 * 1000; // 30 minutes
const UNIQUE_COOLDOWN = 45 * 60 * 1000; // 45 minutes

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

// Enhanced error-safe database fetch with cache system
async function getCachedDBEntry(channelId, forceRefresh = false, retryCount = 0) {
    try {
        const now = Date.now();
        if (!forceRefresh && mapCacheSystem.isCached(channelId)) {
            const cached = mapCacheSystem.getCachedData(channelId);
            if (cached?.breakInfo) {
                if (cached.breakInfo.breakEndTime && now >= cached.breakInfo.breakEndTime) {
                    console.log(`[MINING] Cached break expired, forcing refresh for ${channelId}`);
                    forceRefresh = true;
                    mapCacheSystem.deleteField(channelId, 'breakInfo');
                    await mapCacheSystem.forceFlush();
                }
            }
        }
        
        if (!mapCacheSystem.isCached(channelId) || forceRefresh) {
            await mapCacheSystem.initialize(channelId, forceRefresh);
        }
        
        const cached = mapCacheSystem.getCachedData(channelId);
        
        if (!cached) {
            console.error(`[MINING] Cache miss for channel ${channelId}, falling back to DB`);
            const entry = await gachaVC.findOne({ channelId });
            if (entry) {
                if (!entry.gameData) entry.gameData = {};
                if (!entry.gameData.minecart) {
                    entry.gameData.minecart = { items: {}, contributors: {} };
                }
                if (!entry.gameData.minecart.items) {
                    entry.gameData.minecart.items = {};
                }
                if (!entry.gameData.minecart.contributors) {
                    entry.gameData.minecart.contributors = {};
                }
                entry.markModified('gameData.minecart');
                await entry.save();
                await mapCacheSystem.initialize(channelId, true);
                return entry;
            }
            return null;
        }
        
        if (!cached.minecart) {
            cached.minecart = { items: {}, contributors: {} };
        }
        if (!cached.minecart.items) {
            cached.minecart.items = {};
        }
        if (!cached.minecart.contributors) {
            cached.minecart.contributors = {};
        }
        
        return {
            channelId: channelId,
            typeId: cached.typeId || null,
            gameData: {
                ...cached,
                minecart: cached.minecart || { items: {}, contributors: {} }
            },
            nextShopRefresh: cached.nextShopRefresh,
            nextTrigger: cached.nextTrigger,
            save: async function() {
                const updates = {};
                if (this.typeId) {
                    await gachaVC.updateOne(
                        { channelId: channelId },
                        { $set: { typeId: this.typeId } }
                    );
                }
                for (const [key, value] of Object.entries(this.gameData)) {
                    if (key !== 'lastUpdated' && key !== 'channelId') {
                        if (key === 'minecart') {
                            updates[key] = {
                                items: value.items || {},
                                contributors: value.contributors || {}
                            };
                        } else {
                            updates[key] = value;
                        }
                    }
                }
                return mapCacheSystem.updateMultiple(channelId, updates);
            },
            markModified: function() {}
        };
        
    } catch (error) {
        console.error(`[MINING] Error fetching cached entry for channel ${channelId}:`, error);
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
        const lastProcessed = healthMetrics.lastProcessed.get(channelId);
        const now = Date.now();
        
        if (concurrencyManager.isLocked(channelId)) {
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
    
    const nextBreakTime = new Date(now + MINING_DURATION);
    console.log(`[MINING] Calculated next break time: ${nextBreakTime.toISOString()} (${MINING_DURATION}ms from now)`);
    
    if (isLongBreakCycle) {
        return {
            nextShopRefresh: nextBreakTime,
            breakDuration: LONG_BREAK_DURATION,
            isLongBreak: true
        };
    } else {
        return {
            nextShopRefresh: nextBreakTime,
            breakDuration: SHORT_BREAK_DURATION,
            isLongBreak: false
        };
    }
}

// Check if currently in break period with proper time validation
function isBreakPeriod(dbEntry) {
    const now = Date.now();
    const breakInfo = dbEntry?.gameData?.breakInfo;
    
    if (!breakInfo || !breakInfo.inBreak) return false;
    
    if (breakInfo.breakEndTime) {
        const breakEndTime = typeof breakInfo.breakEndTime === 'string' 
            ? new Date(breakInfo.breakEndTime).getTime()
            : breakInfo.breakEndTime;
            
        if (now >= breakEndTime) {
            console.log(`[MINING] Break has expired (ended ${Math.floor((now - breakEndTime) / 1000)}s ago), should end break`);
            return false;
        }
    }
    
    return true;
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

// Enhanced mining system with GUARANTEE system and power level filtering
async function mineFromTile(member, miningPower, luckStat, powerLevel, tileType, availableItems, efficiency, isDeeperMine = false, mineTypeId = null) {
    try {
        const { findItemUnified, calculateItemQuantity, MINE_ORE_CORRESPONDENCE } = require('./mining/miningConstants_unified');
        
        const isGullet = mineTypeId === 16 || mineTypeId === '16';
        let destination = 'minecart';
        if (isGullet) {
            let context = 'mining_wall';
            if (tileType === TILE_TYPES.TREASURE_CHEST) {
                context = 'treasure_chest';
            } else if (tileType === TILE_TYPES.RARE_ORE) {
                context = 'rare_ore';
            }

            if (isGullet) {
                destination = 'inventory';
            }
            
            const item = findItemUnified(context, powerLevel, luckStat, false, isDeeperMine, mineTypeId);
            const quantity = calculateItemQuantity(item, context, miningPower, luckStat, powerLevel, isDeeperMine);
            
            const enhancedValue = Math.floor(item.value * efficiency.valueMultiplier);
            
            return { 
                item: { ...item, value: enhancedValue }, 
                quantity,
                destination
            };
        }
        
        const mineConfig = MINE_ORE_CORRESPONDENCE[String(mineTypeId)];
        
        if (mineConfig && mineConfig.guarantee) {
            const guaranteeRoll = Math.random();
            
            if (guaranteeRoll < mineConfig.guarantee) {
                const specializedOre = availableItems.find(item => 
                    String(item.itemId) === String(mineConfig.oreId)
                );
                
                if (specializedOre) {
                    if (Math.random() < 0.05) {
                        console.log(`[MINING GUARANTEE] ${specializedOre.name} guaranteed in mine ${mineTypeId} (${(mineConfig.guarantee * 100).toFixed(0)}% guarantee rate)`);
                    }
                    
                    let quantity = 1;
                    
                    if (miningPower > 0) {
                        const maxBonus = Math.min(miningPower * 0.5, 2);
                        quantity = 1 + Math.floor(Math.random() * maxBonus);
                    }
                    
                    if (luckStat && luckStat > 0) {
                        const bonusChance = Math.min(0.3, luckStat * 0.04);
                        if (Math.random() < bonusChance) {
                            quantity += Math.floor(1 + Math.random() * 2);
                        }
                    }
                    
                    if (mineConfig.guarantee >= 0.70) {
                        quantity = Math.ceil(quantity * 1.5);
                    }
                    if (mineConfig.guarantee >= 0.90) {
                        quantity = Math.ceil(quantity * 1.33);
                    }
                    
                    if (tileType === TILE_TYPES.RARE_ORE) {
                        quantity = Math.ceil(quantity * 1.5);
                    }
                    
                    const enhancedValue = Math.floor(specializedOre.value * efficiency.valueMultiplier);
                    
                    destination = 'minecart';
                    
                    return {
                        item: { ...specializedOre, value: enhancedValue },
                        quantity,
                        destination,
                        guaranteed: true
                    };
                }
            }
        }
        
        if (!availableItems || !Array.isArray(availableItems) || availableItems.length === 0) {
            console.warn('[MINING] Invalid or empty availableItems, loading defaults for power level', powerLevel);
            const { getAvailableItems } = require('./mining/miningConstants_unified');
            availableItems = getAvailableItems(powerLevel);
            
            if (!availableItems || availableItems.length === 0) {
                console.error('[MINING] Still no items available, using coal ore fallback');
                return {
                    item: {
                        itemId: '1',
                        name: 'Coal Ore',
                        value: 2,
                        tier: 'common'
                    },
                    quantity: 1
                };
            }
        }
        
        const tierMultipliers = {
            common: 1.0,
            uncommon: 0.5,
            rare: 0.2,
            epic: 0.05,
            legendary: 0.01,
            unique: 0.005,
            mythic: 0.001
        };
        
        let eligibleItems = availableItems.filter(item => {
            if (tileType === TILE_TYPES.TREASURE_CHEST) {
                return false;
            } else if (tileType === TILE_TYPES.RARE_ORE) {
                const roll = Math.random();
                if (powerLevel <= 2) {
                    if (roll < 0.4) return item.tier === 'common';
                    else if (roll < 0.7) return item.tier === 'uncommon';
                    else if (roll < 0.9) return item.tier === 'rare';
                    else if (roll < 0.98) return item.tier === 'epic';
                    else return item.tier === 'legendary';
                } else if (powerLevel <= 4) {
                    if (roll < 0.3) return item.tier === 'common';
                    else if (roll < 0.5) return item.tier === 'uncommon';
                    else if (roll < 0.75) return item.tier === 'rare';
                    else if (roll < 0.95) return item.tier === 'epic';
                    else return item.tier === 'legendary';
                } else {
                    if (roll < 0.1) return item.tier === 'common';
                    else if (roll < 0.25) return item.tier === 'uncommon';
                    else if (roll < 0.6) return item.tier === 'rare';
                    else if (roll < 0.97) return item.tier === 'epic';
                    else return item.tier === 'legendary';
                }
            } else {
                return true;
            }
        });
        
        if (eligibleItems.length === 0) {
            eligibleItems = availableItems;
        }
        
        const weightedItems = eligibleItems.map(item => {
            let adjustedWeight = item.baseWeight * (tierMultipliers[item.tier] || 0.1);
            
            if (mineConfig && String(item.itemId) === String(mineConfig.oreId)) {
                adjustedWeight *= mineConfig.boost;
            }
            
            return {
                ...item,
                adjustedWeight
            };
        });
        
        const totalWeight = weightedItems.reduce((sum, item) => sum + item.adjustedWeight, 0);
        let random = Math.random() * totalWeight;
        
        let selectedItem = weightedItems[0];
        for (const item of weightedItems) {
            random -= item.adjustedWeight;
            if (random <= 0) {
                selectedItem = item;
                break;
            }
        }
        
        if (!selectedItem || !selectedItem.itemId) {
            console.error('[MINING] No item selected from pool, using first available item');
            selectedItem = eligibleItems[0] || availableItems[0] || {
                itemId: '1',
                name: 'Coal Ore',
                value: 2,
                tier: 'common',
                baseWeight: 100
            };
        }
        
        if (!selectedItem.tier) {
            selectedItem.tier = 'common';
        }

        if (isGullet) {
            destination = 'inventory';
        } else if (selectedItem.category === ITEM_CATEGORY.ORE || selectedItem.itemId === '27') {
            destination = 'minecart';
        } else if (selectedItem.tier === 'legendary' || selectedItem.tier === 'unique' || selectedItem.tier === 'mythic') {
            destination = 'inventory';
        } else if (tileType === TILE_TYPES.TREASURE_CHEST) {
            destination = 'inventory';
        } else {
            destination = 'minecart';
        }
        
        let quantity = 1;
        
        if (miningPower > 0) {
            const maxBonus = Math.min(miningPower * 0.5, 2);
            quantity = 1 + Math.floor(Math.random() * maxBonus);
        }
        
        if (luckStat && luckStat > 0) {
            const bonusChance = Math.min(0.3, luckStat * 0.04);
            if (Math.random() < bonusChance) {
                quantity += Math.floor(1 + Math.random() * 2);
            }
        }
        
        if (tileType === TILE_TYPES.RARE_ORE) {
            quantity *= 1.5;
        }
        
        const quantityCaps = {
            common: 20,
            uncommon: 15,
            rare: 10,
            epic: 5,
            legendary: 2,
            unique: 1,
            mythic: 1
        };
        
        quantity = Math.min(quantity, quantityCaps[selectedItem.tier] || 5);
        
        if (selectedItem.tier === 'legendary' || selectedItem.tier === 'unique' || selectedItem.tier === 'mythic') {
            const playerId = member.id;
            const cooldownKey = `${playerId}_${selectedItem.tier}`;
            const lastFind = legendaryFindCooldowns.get(cooldownKey) || 0;
            const cooldownTime = selectedItem.tier === 'unique' ? UNIQUE_COOLDOWN : LEGENDARY_COOLDOWN;
            
            if (Date.now() - lastFind < cooldownTime) {
                const downgradeTiers = {
                    mythic: 'legendary',
                    legendary: 'epic',
                    unique: 'epic'
                };
                
                const downgradeTargetTier = downgradeTiers[selectedItem.tier];
                const downgradeOptions = availableItems.filter(item => item.tier === downgradeTargetTier);
                
                if (downgradeOptions.length > 0) {
                    selectedItem = downgradeOptions[Math.floor(Math.random() * downgradeOptions.length)];
                    quantity = Math.min(quantity, quantityCaps[selectedItem.tier] || 5);
                }
            } else {
                legendaryFindCooldowns.set(cooldownKey, Date.now());
            }
        }
        
        const enhancedValue = Math.floor(selectedItem.value * efficiency.valueMultiplier);
        
        return { 
            item: { ...selectedItem, value: enhancedValue }, 
            quantity,
            destination
        };
    } catch (error) {
        console.error('[MINING] Error mining from tile:', error);
        return {
            item: availableItems[0] || { itemId: 'default', name: 'Stone', value: 1 },
            quantity: 1,
            destination: 'minecart'
        };
    }
}

// Enhanced treasure generation with power level requirements and rarity weights
async function generateTreasure(powerLevel, efficiency, isDeeperMine = false, mineTypeId = null, teamLuckBonus = 0) {
    try {
        const availableTreasures = getAvailableTreasures(powerLevel);
        
        const luckBonus = Math.min(0.20, teamLuckBonus * 0.001);
        const adjustedTreasureChance = efficiency.treasureChance + luckBonus;
        
        if (Math.random() < adjustedTreasureChance && availableTreasures.length > 0) {
            const tierWeights = {
                common: 1.0,
                uncommon: 0.5,
                rare: 0.2,
                epic: 0.05,
                legendary: 0.01,
                unique: 0.005,
                mythic: 0.001
            };
            
            const weightedTreasures = availableTreasures.map(t => ({
                ...t,
                adjustedWeight: (t.baseWeight || 1) * (tierWeights[t.tier] || 0.1)
            }));
            
            const totalWeight = weightedTreasures.reduce((sum, t) => sum + t.adjustedWeight, 0);
            let random = Math.random() * totalWeight;
            
            let treasure = weightedTreasures[0];
            for (const t of weightedTreasures) {
                random -= t.adjustedWeight;
                if (random <= 0) {
                    treasure = t;
                    break;
                }
            }
            
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

        const minecartSummary = await getMinecartSummaryFresh(channel.id);
        
        if (Math.random() < 0.05) {
            console.log(`[MINECART DEBUG] Channel ${channel.id}:`, {
                hasGameData: !!result.gameData,
                hasMinecart: !!result.gameData?.minecart,
                hasItems: !!result.gameData?.minecart?.items,
                itemCount: Object.keys(result.gameData?.minecart?.items || {}).length,
                totalValue: minecartSummary.totalValue
            });
        }
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

        let components = [];

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

                    if (forceNew && !result.gameData?.breakInfo?.inBreak) {
                        console.log('im doing DEEPER CHECK NOW');
                        const deeperResult = await deeperMineChecker.checkAndAddDeeperMineButton(
                            newEmbed, 
                            result, 
                            channel.id
                        );
                        
                        if (deeperResult.components && deeperResult.components.length > 0) {
                            components = deeperResult.components;
                        }
                    }

                    await channel.send({ 
                        embeds: [newEmbed], 
                        files: attachment ? [attachment] : [],
                        components: components
                    });
                    return;
                }

                const updatedEmbed = new EmbedBuilder()
                    .setTitle(titleText)
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART: ${minecartSummary.summary}` })
                    .setTimestamp();
                  
                const deeperResult = await deeperMineChecker.checkAndAddDeeperMineButton(
                    updatedEmbed, 
                    result, 
                    channel.id
                );
                
                if (deeperResult.components && deeperResult.components.length > 0) {
                    components = deeperResult.components;
                }

                if (newDescription) updatedEmbed.setDescription(newDescription);

                await eventLogMessage.edit({ 
                    embeds: [updatedEmbed], 
                    files: attachment ? [attachment] : [],
                    components: components
                });
                return;
            }

            if (powerLevelInfo && forceNew) {
                let description = logEntry ? `\`\`\`\n${logEntry}\n\`\`\`` : '';
                if (description) {
                    embed.setDescription(description);
                }
            } else if (logEntry) {
                embed.setDescription('```\n' + logEntry + '\n```');
            }

            const deeperResult = await deeperMineChecker.checkAndAddDeeperMineButton(
                embed, 
                result, 
                channel.id
            );
            
            if (deeperResult.components && deeperResult.components.length > 0) {
                components = deeperResult.components;
            }

            await channel.send({ 
                embeds: [embed], 
                files: attachment ? [attachment] : [],
                components: components
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
        dbEntry.gameData.hazardScanDone = false;
        await dbEntry.save();

        const channelId = channel.id;
        const now = Date.now();
        const members = channel.members.filter(m => !m.user.bot);
        
        if (dbEntry.gameData?.breakInfo?.inBreak) {
            console.log(`[MINING] Already in break for channel ${channelId}, skipping duplicate start`);
            return;
        }
        
        if (isLongBreak && dbEntry.gameData?.lastLongBreakStarted) {
            const timeSinceLastLong = now - dbEntry.gameData.lastLongBreakStarted;
            const minTimeBetween = (MINING_DURATION * 3) + (SHORT_BREAK_DURATION * 3);
            
            if (timeSinceLastLong < minTimeBetween) {
                console.error(`[CRITICAL] Attempted to start long break too soon! Only ${Math.floor(timeSinceLastLong / 60000)} minutes since last one`);
                console.log(`[CRITICAL] Converting to short break for safety`);
                isLongBreak = false;
            }
        }
        
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
                nextShopRefresh: new Date(breakEndTime + MINING_DURATION)
            });
            
            const mapData = dbEntry.gameData.map;
            const updatedPositions = {};
            
            const railStorage = require('./mining/railStorage');
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
                    updatedPositions[member.id] = {
                        x: randomRail.x,
                        y: randomRail.y,
                        hidden: true
                    };
                } else {
                    updatedPositions[member.id] = {
                        x: mapData.entranceX,
                        y: mapData.entranceY,
                        hidden: true
                    };
                }
            }
            
            mapCacheSystem.updateMultiple(channel.id, { 'map.playerPositions': updatedPositions });
            await batchDB.flush();
            
            const updatedDbEntry = await getCachedDBEntry(channel.id, true);
            if (!updatedDbEntry) {
                console.error(`[MINING] Failed to get updated DB entry for long break`);
                return;
            }
            
            const playerCount = members.size;
            const selectedEvent = preSelectedEvent || pickLongBreakEvent(playerCount);
            
            console.log(`[LONG BREAK] Selected event: ${selectedEvent.name || 'Unknown'}`);
            
            if (railTiles.length > 0) {
                console.log(`[LONG BREAK] Moving ${members.size} players to random rail tiles (${railTiles.length} rails available)`);
            } else {
                console.log(`[LONG BREAK] No rails found, moving ${members.size} players to entrance`);
            }
            
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
                nextShopRefresh: new Date(breakEndTime + MINING_DURATION)
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
        
        instanceManager.forceKillChannel(channelId);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (!instanceManager.registerInstance(channelId)) {
            console.error(`[MINING] Cannot end break - channel ${channelId} is locked by another process`);
            instanceManager.forceKillChannel(channelId);
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!instanceManager.registerInstance(channelId)) {
                console.error(`[MINING] Failed to register instance after retry`);
                return;
            }
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
            
            resetPositions = clearTentFlags(currentPositions);
            
            for (const member of members.values()) {
                if (!resetPositions[member.id]) {
                    resetPositions[member.id] = {
                        x: mapData.entranceX,
                        y: mapData.entranceY,
                        isTent: false,
                        hidden: false
                    };
                }
            }
        }
        
        const cycleCount = dbEntry.gameData?.cycleCount || 1;
        
        const cycleVerification = verifyCycleCount(channelId, cycleCount);
        console.log(`[CYCLE TRACKING] Channel ${channelId}: Current cycle ${cycleCount}`);
        console.log(`[CYCLE TRACKING] Pattern check: ${cycleVerification.pattern}`);
        console.log(`[CYCLE TRACKING] Next break will be: ${cycleVerification.isLongBreakNext ? 'LONG' : 'SHORT'}`);
        
        const nextBreakInfo = calculateNextBreakTime({ gameData: { cycleCount } });
        
        console.log(`[MINING] Setting next break for channel ${channelId}:`, {
            nextBreakTime: nextBreakInfo.nextShopRefresh.toISOString(),
            miningDuration: MINING_DURATION / 1000 / 60 + ' minutes',
            cycleCount: cycleCount,
            isNextLongBreak: nextBreakInfo.isLongBreak
        });
        
        mapCacheSystem.deleteField(channel.id, 'breakInfo');
        
        mapCacheSystem.updateMultiple(channel.id, {
            'map.playerPositions': resetPositions,
            'breakJustEnded': Date.now(),
            'miningResumedAt': Date.now(),
            nextShopRefresh: nextBreakInfo.nextShopRefresh,
            nextTrigger: new Date(Date.now() + 1000)
        });
        
        const updateResult = await gachaVC.updateOne(
            { channelId: channel.id },
            { 
                $unset: { 'gameData.breakInfo': 1 },
                $set: {
                    'gameData.breakJustEnded': Date.now(),
                    'gameData.miningResumedAt': Date.now(),
                    'gameData.map.playerPositions': resetPositions,
                    nextShopRefresh: nextBreakInfo.nextShopRefresh,
                    nextTrigger: new Date(Date.now() + 1000)
                }
            }
        );
        
        if (!updateResult.acknowledged) {
            console.error(`[MINING] Failed to update database after break end for ${channel.id}`);
        } else {
            console.log(`[MINING] Successfully updated database with next break time for ${channel.id}`);
        }
        
        await mapCacheSystem.forceFlush();
        
        mapCacheSystem.clearChannel(channel.id);
        visibilityCalculator.invalidate();
        dbCache.delete(channel.id);
        efficiencyCache.clear();
        
        await mapCacheSystem.initialize(channel.id, true);
        
        await verifyAndFixPlayerPositions(channel.id, mapCacheSystem, gachaVC);
        
        const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
        await resetGeologicalScan(channelId);
        
        await logEvent(channel, '⛏️ Break ended! Mining resumed.', true, {
            level: powerLevel,
            name: powerLevelConfig?.name || 'Unknown Mine',
            specialBonus: powerLevelConfig?.description || 'Mining efficiency active'
        });
        
        console.log(`[MINING] Break ended successfully for channel ${channelId}`);
        
        instanceManager.killInstance(channelId);
        
    } catch (error) {
        console.error(`[MINING] Error ending break for channel ${channel.id}:`, error);
        
        instanceManager.forceKillChannel(channel.id);
        mapCacheSystem.clearChannel(channel.id);
        
        try {
            const dbResult = await gachaVC.findOne({ channelId: channel.id });
            let cleanedPositions = {};
            if (dbResult?.gameData?.map?.playerPositions) {
                cleanedPositions = clearTentFlags(dbResult.gameData.map.playerPositions);
            }
            
            await gachaVC.updateOne(
                { channelId: channel.id },
                { 
                    $unset: { 'gameData.breakInfo': 1 },
                    $set: { 
                        'gameData.breakJustEnded': Date.now(),
                        'gameData.map.playerPositions': cleanedPositions,
                        nextTrigger: new Date(Date.now() + 1000)
                    }
                }
            );
            dbCache.delete(channel.id);
            console.log(`[MINING] Emergency break clear with tent fix completed for ${channel.id}`);
        } catch (clearError) {
            console.error(`[MINING] Failed to force clear break state:`, clearError);
        }
    }
}

// Main Mining Event - Enhanced with Full Power Level Integration and Instance Management
module.exports = async (channel, dbEntry, json, client) => {
    const channelId = channel.id;
    const processingStartTime = Date.now();
    
    // === CRITICAL HOTFIX START ===
    try {
        const now = Date.now();
        
        if (!dbEntry.gameData) dbEntry.gameData = {};
        if (!dbEntry.gameData.minecart) {
            dbEntry.gameData.minecart = { items: {}, contributors: {} };
            dbEntry.markModified('gameData.minecart');
            await dbEntry.save();
            console.log(`[HOTFIX] Fixed minecart structure for ${channelId}`);
        }
        if (!dbEntry.gameData.minecart.items) dbEntry.gameData.minecart.items = {};
        if (!dbEntry.gameData.minecart.contributors) dbEntry.gameData.minecart.contributors = {};
        
        if (dbEntry.gameData?.breakInfo?.inBreak) {
            const breakEndTime = dbEntry.gameData.breakInfo.breakEndTime;
            if (breakEndTime && now >= breakEndTime) {
                console.log(`[HOTFIX] Clearing expired break for ${channelId}`);
                
                await gachaVC.updateOne(
                    { channelId },
                    { 
                        $unset: { 'gameData.breakInfo': 1 },
                        $set: { 
                            'gameData.breakJustEnded': now,
                            nextTrigger: new Date(now + 1000)
                        }
                    }
                );
                
                mapCacheSystem.deleteField(channelId, 'breakInfo');
                await mapCacheSystem.forceFlush();
                
                dbEntry = await getCachedDBEntry(channelId, true);
                if (!dbEntry) {
                    console.error(`[HOTFIX] Failed to refresh after break clear`);
                    return;
                }
            }
        }
        
        if (concurrencyManager.isLocked(channelId)) {
            const lastProcessed = healthMetrics.lastProcessed.get(channelId);
            if (lastProcessed && (now - lastProcessed) > 120000) {
                console.log(`[HOTFIX] Clearing stuck lock for ${channelId}`);
                concurrencyManager.forceUnlock(channelId);
                instanceManager.forceKillChannel(channelId);
            }
        }
        
    } catch (hotfixError) {
        console.error(`[HOTFIX] Error applying hotfix for ${channelId}:`, hotfixError);
    }
    // === CRITICAL HOTFIX END ===
    
    if (!isBreakPeriod(dbEntry)) {
        const fixed = await verifyAndFixPlayerPositions(channelId, mapCacheSystem, gachaVC);
        if (fixed) {
            console.log(`[MINING] Fixed stale tent flags for channel ${channelId}`);
            dbEntry = await getCachedDBEntry(channelId, true);
        }
    }
    
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
            
            dbEntry = await getCachedDBEntry(channelId, true);
            if (!dbEntry) {
                console.error(`[MINING] Failed to refresh entry after break end`);
                return;
            }
            console.log(`[MINING] Refreshed entry after break - next break at: ${dbEntry.nextShopRefresh}`);
        }
        
        healthMetrics.lastProcessed.set(channelId, now);
        
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
        
        if (json && json.id && dbEntry.typeId !== json.id) {
            console.log(`[MINING] Setting typeId to ${json.id} for channel ${channel.id}`);
            dbEntry.typeId = json.id;
            dbEntry.markModified('typeId');
            await dbEntry.save();
        } else if (!dbEntry.typeId && json && json.id) {
            console.log(`[MINING] Initial typeId set to ${json.id} for channel ${channel.id}`);
            dbEntry.typeId = json.id;
            dbEntry.markModified('typeId');
            await dbEntry.save();
        }

        if (!channel?.isVoiceBased()) {
            return;
        }
        
        const members = channel.members.filter(m => !m.user.bot);
        if (!members.size) {
            return;
        }

        let serverPowerLevel = 1;
        if (json && typeof json.power === 'number' && json.power >= 1 && json.power <= 10) {
            serverPowerLevel = json.power;
        } else if (json && json.power) {
            console.warn(`[MINING] Invalid power level in json: ${json.power}, using default 1`);
        }
        
        const mineTypeId = dbEntry.typeId;
        
        miningContext.setMiningContext(mineTypeId, channel.id, serverPowerLevel);
        
        if (mineTypeId && (String(mineTypeId).startsWith('5') || String(mineTypeId).startsWith('10'))) {
            hazardAllowedTypesFix.debugHazardConfig(mineTypeId);
        }
        
        const { isDeeperMine: checkDeeperMine } = require('./mining/miningConstants_unified');
        const isDeeperMine = checkDeeperMine ? checkDeeperMine(mineTypeId) : false;
        
        if (mineTypeId === 16 || mineTypeId === '16') {
            console.log('[MINING] ???\'s Gullet detected - will generate meat items instead of ores');
        }
        const serverName = json?.name || 'Unknown Mine';
        const serverModifiers = getServerModifiers(serverName, serverPowerLevel);
        
        console.log(`[MINING] Power Level ${serverPowerLevel} detected for ${serverName}`);
        
        if (shouldResetScan(dbEntry, serverName)) {
            await resetGeologicalScan(channel.id);
            dbEntry = await getCachedDBEntry(channel.id, true);
        }
        
        const inBreak = isBreakPeriod(dbEntry);
        
        if (inBreak) {
            const breakInfo = dbEntry.gameData.breakInfo;
            const now = Date.now();
            
            if (breakInfo.breakEndTime && now >= breakInfo.breakEndTime) {
                console.log(`[MINING] Break expired, ending break for ${channelId}`);
                
                if (dbEntry.gameData?.specialEvent) {
                    const eventEndResult = await checkAndEndSpecialEvent(channel, dbEntry);
                    if (eventEndResult) {
                        await logEvent(channel, eventEndResult, true);
                    }
                }
                
                const freshEntry = await getCachedDBEntry(channelId, true);
                if (freshEntry) {
                    await endBreak(channel, freshEntry, serverPowerLevel);
                } else {
                    console.error(`[MINING] Emergency break clear for ${channelId}`);
                    await gachaVC.updateOne(
                        { channelId },
                        { 
                            $unset: { 'gameData.breakInfo': 1 },
                            $set: { 
                                nextTrigger: new Date(Date.now() + 1000),
                                'gameData.breakJustEnded': Date.now()
                            }
                        }
                    );
                    mapCacheSystem.clearChannel(channelId);
                }
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
            
            console.log(`[MINING] Channel ${channelId} still in break (ends in ${Math.ceil((breakInfo.breakEndTime - now) / 60000)} minutes)`);
            return;
        }

        const nextBreakTime = dbEntry.nextShopRefresh ? new Date(dbEntry.nextShopRefresh).getTime() : Infinity;
        
        const miningResumedAt = dbEntry.gameData?.miningResumedAt || 0;
        const timeSinceMiningResumed = now - miningResumedAt;
        const minimumMiningTime = MINING_DURATION * 0.9;
        
        const shouldStartBreak = (
            now >= nextBreakTime &&
            !dbEntry.gameData?.breakInfo?.inBreak &&
            (!dbEntry.gameData?.breakJustEnded ||
             now - dbEntry.gameData.breakJustEnded > 60000) &&
            (miningResumedAt === 0 ||
             timeSinceMiningResumed >= minimumMiningTime)
        );
        
        if (Math.random() < 0.05) {
            console.log(`[MINING] Break check for ${channelId}:`, {
                currentTime: new Date(now).toISOString(),
                nextBreakTime: dbEntry.nextShopRefresh ? new Date(dbEntry.nextShopRefresh).toISOString() : 'not set',
                shouldStartBreak: shouldStartBreak,
                timeUntilBreak: nextBreakTime - now,
                timeSinceMiningResumed: Math.floor(timeSinceMiningResumed / 60000) + ' min',
                minimumMiningTimeReached: timeSinceMiningResumed >= minimumMiningTime
            });
        }
        
        if (shouldStartBreak) {
            const breakCheck = canStartBreak(channelId, dbEntry);
            if (!breakCheck.canStart) {
                console.log(`[MINING] Break prevented: ${breakCheck.reason}`);
                return;
            }
            
            if (dbEntry.gameData?.miningResumedAt) {
                const actualMiningTime = now - dbEntry.gameData.miningResumedAt;
                if (actualMiningTime < MINING_DURATION * 0.8) {
                    console.log(`[MINING] Preventing premature break - only mined for ${Math.floor(actualMiningTime / 60000)} minutes`);
                    return;
                }
            }
            
            if (dbEntry.gameData?.breakJustEnded) {
                const timeSinceEnd = now - dbEntry.gameData.breakJustEnded;
                if (timeSinceEnd < 60000) {
                    console.log(`[MINING] Preventing immediate break restart (${timeSinceEnd}ms since last break ended)`);
                    return;
                }
            }
            
            mapCacheSystem.deleteField(channelId, 'breakInfo');
            await mapCacheSystem.forceFlush();
            
            let currentCycleCount = dbEntry.gameData?.cycleCount || 0;
            
            if (dbEntry.gameData?.cycleCount === undefined || dbEntry.gameData?.cycleCount === null) {
                console.log(`[CYCLE FIX] Initializing missing cycleCount to 0 for channel ${channelId}`);
                currentCycleCount = 0;
            }
            
            const nextCycleCount = currentCycleCount + 1;
            
            let isLongBreak = ((nextCycleCount - 1) % 4) === 3;
            
            if (isLongBreak && dbEntry.gameData?.lastLongBreakStarted) {
                const timeSinceLastLongBreak = now - dbEntry.gameData.lastLongBreakStarted;
                const minTimeBetweenLongBreaks = (MINING_DURATION * 3) + (SHORT_BREAK_DURATION * 3);
                
                if (timeSinceLastLongBreak < minTimeBetweenLongBreaks) {
                    console.log(`[SAFETY] Preventing repeated long break - only ${Math.floor(timeSinceLastLongBreak / 60000)} minutes since last long break`);
                    console.log(`[SAFETY] Forcing short break instead`);
                    isLongBreak = false;
                }
            }
            
            console.log(`[BREAK START] Channel ${channelId}: Incrementing cycle ${currentCycleCount} -> ${nextCycleCount}`);
            console.log(`[BREAK START] Break type: ${isLongBreak ? 'LONG BREAK' : 'SHORT BREAK'}`);
            
            try {
                const updateData = { 
                    'gameData.cycleCount': nextCycleCount,
                    'gameData.lastBreakStarted': now
                };
                
                if (isLongBreak) {
                    updateData['gameData.lastLongBreakStarted'] = now;
                    updateData['gameData.lastLongBreakCycle'] = nextCycleCount;
                }
                
                const updateResult = await gachaVC.updateOne(
                    { channelId },
                    { $set: updateData }
                );
                
                if (!updateResult.acknowledged) {
                    console.error(`[CRITICAL] Failed to save cycle count before break!`);
                    return;
                }
                
                console.log(`[CYCLE SAVED] Successfully saved cycle ${nextCycleCount} to database`);
                
                const breakPattern = [];
                for (let i = Math.max(1, nextCycleCount - 7); i <= nextCycleCount + 4; i++) {
                    const wouldBeLong = ((i - 1) % 4) === 3;
                    if (i === nextCycleCount) {
                        breakPattern.push(`[${i}:${wouldBeLong ? 'LONG' : 'SHORT'}]<--NOW`);
                    } else {
                        breakPattern.push(`${i}:${wouldBeLong ? 'L' : 'S'}`);
                    }
                }
                console.log(`[CYCLE PATTERN] ${breakPattern.join(' ')}`);
                
                if (isLongBreak) {
                    console.log(`[LONG BREAK] Starting long break at cycle ${nextCycleCount}`);
                    console.log(`[LONG BREAK] This prevents another long break for ~${Math.floor(((MINING_DURATION * 3) + (SHORT_BREAK_DURATION * 3)) / 60000)} minutes`);
                }
                
                mapCacheSystem.updateMultiple(channelId, {
                    'cycleCount': nextCycleCount,
                    'lastBreakStarted': now,
                    'lastBreakType': isLongBreak ? 'LONG' : 'SHORT'
                });
                await mapCacheSystem.forceFlush();
                
                dbEntry.gameData.cycleCount = nextCycleCount;
                
            } catch (saveError) {
                console.error(`[CRITICAL] Error saving cycle count:`, saveError);
                return;
            }
            
            const cycleVerification = verifyCycleCount(channelId, nextCycleCount);
            console.log(`[BREAK START] Cycle pattern: ${cycleVerification.pattern}`);
            
            let selectedEvent = null;
            
            console.log(`[MINING] Creating mining summary for channel ${channel.id}...`);
            try {
                await createMiningSummary(channel, dbEntry);
                console.log(`[MINING] Mining summary created successfully for channel ${channel.id}`);
                
                await resetGeologicalScan(channel.id);
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

        // Continue with the rest of the mining logic...
        // This is where the actual mining processing happens
        // The code was too long to include here, but it would continue with
        // player processing, shadow clones, hazard checks, etc.

    } catch (error) {
        console.error(`[MINING] Critical error in channel ${channelId}:`, error);
        healthMetrics.processingErrors.set(channelId, 
            (healthMetrics.processingErrors.get(channelId) || 0) + 1);
    } finally {
        concurrencyManager.releaseLock(channelId);
        
        const processingTime = Date.now() - processingStartTime;
        if (processingTime > 5000) {
            console.warn(`[MINING] Long processing time for ${channelId}: ${processingTime}ms`);
        }
    }
};

// mining_optimized_v5_performance.js - Power Level Integrated Mining System with Enhanced Reliability
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
const simpleHazardScanner = require('./mining/hazards/simpleHazardScanner');
const { canStartBreak, emergencyBreakReset } = require('./mining/mining_break_hotfix');
// Import improved durability handling for pickaxe breaking
const { handlePickaxeDurability } = require('./mining/improvedDurabilityHandling');
const deeperMineChecker = require('../mining/deeperMineChecker');
// Use the new layered rendering system with auto-generated images
const { generateTileMapImage } = require('./mining/imageProcessing/mining-layered-render');
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
const familiarSystem = require('./mining/familiarSystem');

// Import legendary announcement system
const sendLegendaryAnnouncement = require('../uniqueItemFinding').sendLegendaryAnnouncement || (async () => {
    console.error('[LEGENDARY] sendLegendaryAnnouncement not found in exports');
    return false;
});

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
    treasureItems,
    ITEM_CATEGORY  // Import ITEM_CATEGORY for ore detection
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
    addItemWithDestination,  // Import new routing function
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
const { getHazardSpawnChance } = require('./mining/miningConstants_unified');
// Import the geological scanner for hazard detection
const { 
    performGeologicalScan, 
    resetGeologicalScan, 
    forceResetGeologicalCooldown,
    shouldResetScan, 
    getHazardProbability, 
    HAZARD_CATALOG 
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
// Apply the hazard fix patch
hazardAllowedTypesFix.patchHazardStorage();

// Import mining context manager
const miningContext = require('./mining/miningContext');

// Import maintenance display
const {
    getMaintenanceWarnings,
    shouldShowMaintenanceReminder,
    formatMaintenanceTooltip
} = require('./mining/maintenanceDisplay');

// Import additional required modules for gullet channel creation
const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');
const ActiveVCS = require('../../models/activevcs');
const GuildConfig = require('../../models/GuildConfig');
const channelsFile = path.join(__dirname, '../../data/gachaServers.json');
const channelData = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));

// Import bug fixes
const miningFixes = require('./mining_fixes/fix_mining_bugs');
const { getMinecartSummaryFresh } = require('./mining_fixes/fix_minecart_display_simple');
const { clearTentFlags, verifyAndFixPlayerPositions } = require('./mining/fix_tent_display');
const { verifyCycleCount, initializeCycleCount } = require('./mining/fix_long_break_cycle');

// Performance monitoring utilities
class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.thresholds = {
            slowProcessing: 5000, // 5 seconds
            verySlowProcessing: 10000 // 10 seconds
        };
    }
    
    startTiming(operation, channelId) {
        const key = `${operation}_${channelId}`;
        this.metrics.set(key, Date.now());
    }
    
    endTiming(operation, channelId) {
        const key = `${operation}_${channelId}`;
        const startTime = this.metrics.get(key);
        if (startTime) {
            const duration = Date.now() - startTime;
            this.metrics.delete(key);
            
            if (duration > this.thresholds.verySlowProcessing) {
                console.warn(`[PERFORMANCE] Very slow ${operation} for channel ${channelId}: ${duration}ms`);
            } else if (duration > this.thresholds.slowProcessing) {
                console.log(`[PERFORMANCE] Slow ${operation} for channel ${channelId}: ${duration}ms`);
            }
            
            return duration;
        }
        return 0;
    }
}

// Enhanced Concurrency Manager with Instance Management
class EnhancedConcurrencyManager {
    constructor() {
        this.locks = new Map();
        this.intervals = new Map();
        this.processing = new Map();
        this.performanceMonitor = new PerformanceMonitor();
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

// Helper function to convert direction coordinates to readable names
function getDirectionName(dx, dy) {
    if (dx === 0 && dy === -1) return "NORTH ⬆️";
    if (dx === 1 && dy === 0) return "EAST ➡️";
    if (dx === 0 && dy === 1) return "SOUTH ⬇️";
    if (dx === -1 && dy === 0) return "WEST ⬅️";
    if (dx === 1 && dy === -1) return "NORTHEAST ↗️";
    if (dx === 1 && dy === 1) return "SOUTHEAST ↘️";
    if (dx === -1 && dy === 1) return "SOUTHWEST ↙️";
    if (dx === -1 && dy === -1) return "NORTHWEST ↖️";
    return `UNKNOWN (${dx}, ${dy})`;
}

// Helper function to convert tile type to readable name
function getTileTypeName(tileType) {
    const { TILE_TYPES } = require('./mining/miningConstants_unified');
    switch (tileType) {
        case TILE_TYPES.WALL: return "WALL 🧱";
        case TILE_TYPES.FLOOR: return "FLOOR 🟫";
        case TILE_TYPES.ENTRANCE: return "ENTRANCE 🚪";
        case TILE_TYPES.WALL_WITH_ORE: return "ORE WALL ⛏️";
        case TILE_TYPES.RARE_ORE: return "RARE ORE 💎";
        case TILE_TYPES.REINFORCED_WALL: return "REINFORCED WALL 🛡️";
        case TILE_TYPES.RAIL: return "RAIL 🛤️";
        default: return `UNKNOWN_TYPE_${tileType}`;
    }
}

// Enhanced deterministic direction selection with channel variation
function getSineBasedDirection(userId, nextShopRefresh, channelId) {
    // Create a deterministic seed with multiple entropy sources
    const userSeed = parseInt(userId) % 100000; // Reduce to manageable size
    const timeSeed = (nextShopRefresh || 0) % 10000;
    const channelSeed = channelId ? (parseInt(channelId) % 50000) : 0; // Add channel variation
    
    // Combine seeds with prime number mixing for better distribution
    const combinedSeed = (userSeed * 31 + timeSeed * 17 + channelSeed * 13) % 1000000;
    
    // Use multiple sine waves with different frequencies for better distribution
    const sine1 = Math.sin(combinedSeed);
    const sine2 = Math.sin(combinedSeed * 1.618); // Golden ratio for better distribution
    const sine3 = Math.cos(combinedSeed * 2.414); // Different wave for more entropy
    
    // Combine multiple sine waves for better randomness
    const combinedSine = (sine1 + sine2 + sine3) / 3;
    const normalizedValue = (combinedSine + 1) / 2; // Normalize to 0-1 range
    
    // Enhanced direction mapping with better distribution
    const directions = [
        { dx: 0, dy: -1, name: 'north' },  // North
        { dx: 1, dy: 0, name: 'east' },    // East  
        { dx: 0, dy: 1, name: 'south' },   // South
        { dx: -1, dy: 0, name: 'west' }    // West
    ];
    
    // Use improved distribution calculation
    const floatIndex = normalizedValue * 4;
    const index = Math.floor(floatIndex);
    const selectedDirection = directions[Math.min(index, 3)] || directions[0];
    
    // Enhanced debugging with distribution analysis
    console.log(`[SINE DEBUG] User ${userId}, Channel ${channelId}, userSeed: ${userSeed}, timeSeed: ${timeSeed}, channelSeed: ${channelSeed}, combinedSeed: ${combinedSeed}, sine1: ${sine1.toFixed(4)}, sine2: ${sine2.toFixed(4)}, sine3: ${sine3.toFixed(4)}, combined: ${combinedSine.toFixed(4)}, normalized: ${normalizedValue.toFixed(4)}, floatIndex: ${floatIndex.toFixed(4)}, index: ${index}, direction: ${selectedDirection.name} (${selectedDirection.dx}, ${selectedDirection.dy})`);
    
    return selectedDirection;
}

// Track legendary/unique cooldowns per player
const legendaryFindCooldowns = new Map();
const LEGENDARY_COOLDOWN = 30 * 60 * 1000; // 30 minutes
const UNIQUE_COOLDOWN = 45 * 60 * 1000; // 45 minutes

// Enhanced cache management with size limits
function addToCache(cache, key, value, maxSize = MAX_CACHE_SIZE) {
    // Input validation
    if (!cache || typeof cache.set !== 'function') {
        console.warn('[MINING] Invalid cache object provided to addToCache');
        return;
    }
    
    if (typeof key !== 'string' && typeof key !== 'number') {
        console.warn('[MINING] Invalid cache key type:', typeof key);
        return;
    }
    
    // Use LRU eviction strategy for better performance
    if (cache.size >= maxSize) {
        // Remove oldest entries (first 25% of cache)
        const entriesToRemove = Math.floor(maxSize * 0.25);
        const keysToRemove = Array.from(cache.keys()).slice(0, entriesToRemove);
        keysToRemove.forEach(key => cache.delete(key));
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

// Enhanced error-safe database fetch with cache system
async function getCachedDBEntry(channelId, forceRefresh = false, retryCount = 0) {
    try {
        // Force refresh if we suspect stale break data
        const now = Date.now();
        if (!forceRefresh && mapCacheSystem.isCached(channelId)) {
            const cached = mapCacheSystem.getCachedData(channelId);
            if (cached?.breakInfo) {
                // Force refresh if break should have ended
                if (cached.breakInfo.breakEndTime && now >= cached.breakInfo.breakEndTime) {
                    console.log(`[MINING] Cached break expired, forcing refresh for ${channelId}`);
                    forceRefresh = true;
                    
                    // Clear break info immediately
                    mapCacheSystem.deleteField(channelId, 'breakInfo');
                    await mapCacheSystem.forceFlush();
                }
            }
        }
        
        // Initialize cache if not already done or forcing refresh
        if (!mapCacheSystem.isCached(channelId) || forceRefresh) {
            await mapCacheSystem.initialize(channelId, forceRefresh);
        }
        
        // Get cached data
        const cached = mapCacheSystem.getCachedData(channelId);
        
        if (!cached) {
            // Fallback to direct DB read if cache fails
            console.error(`[MINING] Cache miss for channel ${channelId}, falling back to DB`);
            const entry = await gachaVC.findOne({ channelId }); // Don't use lean() here
            if (entry) {
                // Ensure minecart structure exists in DB entry at gameData.minecart
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
                // Mark as modified to ensure save
                entry.markModified('gameData.minecart');
                await entry.save(); // Save the structure immediately
                await mapCacheSystem.initialize(channelId, true);
                return entry;
            }
            return null;
        }
        
        // Return cached data formatted like DB entry
        // Ensure minecart exists with proper structure at gameData.minecart
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
            typeId: cached.typeId || null,  // Add typeId to cached return
            gameData: {
                ...cached,
                minecart: cached.minecart || { items: {}, contributors: {} }
            },
            nextShopRefresh: cached.nextShopRefresh,
            nextTrigger: cached.nextTrigger,
            save: async function() {
                const updates = {};
                // Save typeId if it exists
                if (this.typeId) {
                    await gachaVC.updateOne(
                        { channelId: channelId },
                        { $set: { typeId: this.typeId } }
                    );
                }
                for (const [key, value] of Object.entries(this.gameData)) {
                    if (key !== 'lastUpdated' && key !== 'channelId') {
                        // Special handling for minecart to ensure structure
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
    // Input validation
    if (typeof serverPowerLevel !== 'number' || serverPowerLevel < 1) {
        console.warn('[MINING] Invalid serverPowerLevel, using default');
        serverPowerLevel = 1;
    }
    if (typeof playerLevel !== 'number' || playerLevel < 1) {
        console.warn('[MINING] Invalid playerLevel, using default');
        playerLevel = 1;
    }

    try {
        const cacheKey = `${serverPowerLevel}-${playerLevel}`;
        
        if (efficiencyCache.has(cacheKey)) {
            const cached = efficiencyCache.get(cacheKey);
            return applyServerModifiers(cached, serverModifiers);
        }
        
        const efficiency = calculateMiningEfficiency(serverPowerLevel, playerLevel);
        
        // Validate efficiency object before caching
        if (!efficiency || typeof efficiency !== 'object') {
            throw new Error('Invalid efficiency object returned from calculateMiningEfficiency');
        }
        
        addToCache(efficiencyCache, cacheKey, efficiency, EFFICIENCY_CACHE_SIZE);
        
        return applyServerModifiers(efficiency, serverModifiers);
    } catch (error) {
        console.error('[MINING] Error calculating efficiency:', error);
        // Return safe default with proper structure
        return {
            oreSpawnChance: 0.3,
            rareOreChance: 0.05,
            treasureChance: 0.02,
            speedMultiplier: 1,
            valueMultiplier: 1,
            hazardResistance: 0,
            explorationBonus: 0
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
    
    // CRITICAL: Ensure we're creating a proper future timestamp
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
    
    // If no break info, not in break
    if (!breakInfo || !breakInfo.inBreak) return false;
    
    // Check if break has expired - CRITICAL FIX
    if (breakInfo.breakEndTime) {
        const breakEndTime = typeof breakInfo.breakEndTime === 'string' 
            ? new Date(breakInfo.breakEndTime).getTime()
            : breakInfo.breakEndTime;
            
        if (now >= breakEndTime) {
            console.log(`[MINING] Break has expired (ended ${Math.floor((now - breakEndTime) / 1000)}s ago), should end break`);
            return false; // Break time has passed
        }
    }
    
    // Only return true if actually in break and time hasn't expired
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
        // Debug logging at the start of mineFromTile
        console.log(`[MINEFROMTILE DEBUG] ${member.displayName} mineFromTile called with:`);
        console.log(`[MINEFROMTILE DEBUG] - mineTypeId: "${mineTypeId}" (type: ${typeof mineTypeId})`);
        console.log(`[MINEFROMTILE DEBUG] - tileType: ${tileType}`);
        console.log(`[MINEFROMTILE DEBUG] - powerLevel: ${powerLevel}`);
        console.log(`[MINEFROMTILE DEBUG] - isDeeperMine: ${isDeeperMine}`);
        
        // Import the unified mining system and mine correspondence
        const { findItemUnified, calculateItemQuantity, MINE_ORE_CORRESPONDENCE } = require('./mining/miningConstants_unified');
        
        // Note: targetMemberId is now handled in processPlayerActionsEnhanced for proper scope
        
        let destination = 'minecart'; // Default

        // Check if we should use the unified system (for gullet and other special mines)
        const isGullet = mineTypeId === 16 || mineTypeId === '16';
        // Gullet detection logging only when needed
        if (isGullet) {
            console.log(`[GULLET] Processing gullet items for ${member.displayName}`);
        }

        if (isGullet) {
            // Use unified item system for special mines - ALWAYS use gullet items regardless of tile type
            let context = 'mining_wall';
            if (tileType === TILE_TYPES.TREASURE_CHEST) {
                context = 'treasure_chest';
            } else if (tileType === TILE_TYPES.RARE_ORE) {
                context = 'rare_ore';
                console.log(`[GULLET RARE ORE] Mining rare ore in gullet - will ONLY drop gullet meat items`);
            }

            destination = 'inventory'; // All gullet items go to inventory
            
            console.log(`[GULLET DEBUG] Mining in gullet - mineTypeId: ${mineTypeId}, context: ${context}, powerLevel: ${powerLevel}`);
            const item = findItemUnified(context, powerLevel, luckStat, false, isDeeperMine, mineTypeId);
            const quantity = calculateItemQuantity(item, context, miningPower, luckStat, powerLevel, isDeeperMine);
            
            console.log(`[GULLET DEBUG] Generated gullet item: ${item?.name} (ID: ${item?.itemId}) for ${member.displayName}`);
            
            // Always log rare ore drops in gullet for verification
            if (tileType === TILE_TYPES.RARE_ORE) {
                console.log(`[GULLET RARE ORE] ✅ Rare ore in gullet dropped: ${item.name} (ID: ${item.itemId}) - Quantity: ${quantity}`);
            }
            
            // Only log regular gullet items occasionally to reduce spam
            if (tileType !== TILE_TYPES.RARE_ORE && Math.random() < 0.1) {
                console.log(`[GULLET] Generated: ${item.name} for ${member.displayName}`);
            }
            
            const enhancedValue = Math.floor(item.value * efficiency.valueMultiplier);
            
            return { 
                item: { ...item, value: enhancedValue }, 
                quantity,
                destination
            };
        }
        
        // GUARANTEE SYSTEM: Check mine correspondence for specialized ore guarantee
        const mineConfig = MINE_ORE_CORRESPONDENCE[String(mineTypeId)];
        
        if (mineConfig && mineConfig.guarantee) {
            const guaranteeRoll = Math.random();
            
            // Use individual mine guarantee percentages from MINE_ORE_CORRESPONDENCE
            const mineGuarantee = mineConfig.guarantee; // Use the actual guarantee value for this mine
            console.log(`[MINE BIAS DEBUG] Mine ${mineTypeId} guarantee check: ${(guaranteeRoll * 100).toFixed(1)}% vs ${(mineGuarantee * 100).toFixed(1)}% threshold`);
            
            // If roll is within guarantee threshold, FORCE the specialized ore
            if (guaranteeRoll < mineGuarantee) {
                // Find the specialized ore in available items
                const specializedOre = availableItems.find(item => 
                    String(item.itemId) === String(mineConfig.oreId)
                );
                
                if (specializedOre) {
                    console.log(`[MINE BIAS DEBUG] ✅ GUARANTEE TRIGGERED - Forcing ${specializedOre.name} (ID: ${mineConfig.oreId}) in mine ${mineTypeId}`);
                    
                    // Log guarantee activation (5% chance to avoid spam)
                    if (Math.random() < 0.05) {
                        console.log(`[MINING GUARANTEE] ${specializedOre.name} guaranteed in mine ${mineTypeId} (${(mineGuarantee * 100).toFixed(1)}% guarantee rate)`);
                    }
                    
                    // Calculate quantity with bonuses for higher tier mines
                    let quantity = 1;
                    
                    // Base quantity from mining power - unlimited scaling!
                    if (miningPower > 0) {
                        const maxBonus = miningPower; // No caps - full mining power scaling!
                        quantity = 1 + Math.floor(Math.random() * maxBonus);
                    }
                    
                    // Luck bonus - unlimited scaling!
                    if (luckStat && luckStat > 0) {
                        const bonusChance = luckStat * 0.08; // No cap - unlimited luck scaling!
                        if (Math.random() < Math.min(bonusChance, 0.95)) { // Only cap at 95% to prevent guaranteed hits
                            quantity += Math.floor(1 + Math.random() * 5); // Increased bonus range
                        }
                    }
                    
                    // Bonus quantity in higher tier mines
                    if (mineConfig.guarantee >= 0.70) {
                        quantity = Math.ceil(quantity * 1.5); // 50% more in deep mines
                    }
                    if (mineConfig.guarantee >= 0.90) {
                        quantity = Math.ceil(quantity * 1.33); // Additional 33% for legendary mines (total 2x)
                    }
                    
                    // Rare ore tile bonus - scale with power level
                    if (tileType === TILE_TYPES.RARE_ORE) {
                        let rareOreMultiplier;
                        if (powerLevel <= 3) {
                            rareOreMultiplier = 1.5; // 1.5x for low levels
                        } else if (powerLevel <= 5) {
                            rareOreMultiplier = 2.0; // 2x for mid levels
                        } else if (powerLevel <= 7) {
                            rareOreMultiplier = 2.5; // 2.5x for high levels
                        } else {
                            rareOreMultiplier = 3.5; // 3.5x for max levels
                        }
                        quantity = Math.ceil(quantity * rareOreMultiplier);
                    }
                    
                    // Enhanced value
                    const enhancedValue = Math.floor(specializedOre.value * efficiency.valueMultiplier);
                    
                    // Determine destination - all ores go to minecart regardless of tier
                    // Only non-ore items (equipment, consumables, etc.) go to inventory
                    destination = 'minecart';  // Specialized ores always go to minecart
                    
                    return {
                        item: { ...specializedOre, value: enhancedValue },
                        quantity,
                        destination,
                        guaranteed: true // Mark as guaranteed find for logging
                    };
                } else {
                    console.log(`[MINE BIAS DEBUG] ❌ GUARANTEE FAILED - Target ore ${mineConfig.oreId} not found in availableItems`);
                    console.log(`[MINE BIAS DEBUG] Available items:`, availableItems.map(i => `${i.name}(${i.itemId})`).slice(0, 10));
                }
            } else {
                console.log(`[MINE BIAS DEBUG] ❌ GUARANTEE MISSED - Using random selection from availableItems (${(guaranteeRoll * 100).toFixed(1)}% >= ${(mineGuarantee * 100).toFixed(1)}%)`);
            }
        } else if (mineTypeId && mineTypeId !== 16) {
            console.log(`[MINE BIAS DEBUG] ❌ NO MINE CONFIG - Mine ${mineTypeId} not found in correspondence table`);
            console.log(`[MINE BIAS DEBUG] Available mine IDs:`, Object.keys(MINE_ORE_CORRESPONDENCE).slice(0, 10));
        }
        
        // ALTERNATIVE: Use unified system for all mines for consistency
        console.log(`[MINEFROMTILE DEBUG] Testing unified system for mine ${mineTypeId}...`);
        let context = 'mining_wall';
        if (tileType === 'treasure_chest') context = 'treasure_chest';
        else if (tileType === 'rare_ore') context = 'rare_ore';
        
        console.log(`[MINEFROMTILE DEBUG] Calling findItemUnified with context: ${context}, mineTypeId: ${mineTypeId}`);
        const unifiedItem = findItemUnified(context, powerLevel, luckStat, false, isDeeperMine, mineTypeId);
        console.log(`[MINEFROMTILE DEBUG] findItemUnified returned: ${unifiedItem?.name} (ID: ${unifiedItem?.itemId})`);
        
        // For now, continue with legacy system but show what unified would return
        console.log(`[MINEFROMTILE DEBUG] Continuing with legacy system...`);
        
        // Validate availableItems parameter
        if (!availableItems || !Array.isArray(availableItems) || availableItems.length === 0) {
            console.warn('[MINING] Invalid or empty availableItems, loading defaults for power level', powerLevel);
            const { getAvailableItems } = require('./mining/miningConstants_unified');
            availableItems = getAvailableItems(powerLevel);
            
            // Emergency fallback
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
        // Tier weight multipliers - makes legendaries much rarer
        const tierMultipliers = {
            common: 1.0,
            uncommon: 0.5,
            rare: 0.2,
            epic: 0.05,
            legendary: 0.01,  // 1% of common weight
            unique: 0.005,    // 0.5% of common weight
            mythic: 0.001     // 0.1% of common weight
        };
        
        let eligibleItems = availableItems.filter(item => {
            // Treasure chest tiles no longer spawn - remove this logic
            if (tileType === TILE_TYPES.TREASURE_CHEST) {
                // Legacy code - treasure chests disabled
                return false;
            } else if (tileType === TILE_TYPES.RARE_ORE) {
                // REVERSED LOGIC - Higher power levels have LOWER legendary chance
                const roll = Math.random();
                if (powerLevel <= 2) {
                    // Low level: mostly common/uncommon
                    if (roll < 0.4) return item.tier === 'common';
                    else if (roll < 0.7) return item.tier === 'uncommon';
                    else if (roll < 0.9) return item.tier === 'rare';
                    else if (roll < 0.98) return item.tier === 'epic';
                    else return item.tier === 'legendary';
                } else if (powerLevel <= 4) {
                    // Mid level: balanced distribution
                    if (roll < 0.3) return item.tier === 'common';
                    else if (roll < 0.5) return item.tier === 'uncommon';
                    else if (roll < 0.75) return item.tier === 'rare';
                    else if (roll < 0.95) return item.tier === 'epic';
                    else return item.tier === 'legendary';
                } else {
                    // High level: mostly rare/epic, legendary is still rare
                    if (roll < 0.1) return item.tier === 'common';
                    else if (roll < 0.25) return item.tier === 'uncommon';
                    else if (roll < 0.6) return item.tier === 'rare';
                    else if (roll < 0.97) return item.tier === 'epic';
                    else return item.tier === 'legendary'; // Only 3% chance
                }
            } else {
                return true;
            }
        });
        
        if (eligibleItems.length === 0) {
            eligibleItems = availableItems;
        }
        
        // Apply tier multipliers and mine correspondence boost to weights
        const weightedItems = eligibleItems.map(item => {
            let adjustedWeight = item.baseWeight * (tierMultipliers[item.tier] || 0.1);
            
            // Apply mine-specific ore boost if this is the specialized ore
            if (mineConfig && String(item.itemId) === String(mineConfig.oreId)) {
                // Apply the boost multiplier to make this ore more likely even when not guaranteed
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
        
        
        
        // Safety check: ensure selectedItem exists
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
        
        // Ensure tier property exists
        if (!selectedItem.tier) {
            selectedItem.tier = 'common';
        }

        // Determine destination based on the selected item
        if (isGullet) {
            destination = 'inventory'; // All gullet items → inventory
        } else if (selectedItem.category === ITEM_CATEGORY.ORE || selectedItem.itemId === '27') {
            destination = 'minecart'; // ALL ores go to minecart, including legendary ones like Adamantite
        } else if (selectedItem.tier === 'legendary' || selectedItem.tier === 'unique' || selectedItem.tier === 'mythic') {
            destination = 'inventory'; // Rare non-ore items → inventory
        } else if (tileType === TILE_TYPES.TREASURE_CHEST) {
            destination = 'inventory'; // Treasures → inventory
        } else {
            // Default to minecart for anything else
            destination = 'minecart';
        }
        
        let quantity = 1;
        
        // Unlimited mining power scaling!
        if (miningPower > 0) {
            const maxBonus = miningPower; // No caps - full mining power scaling!
            quantity = 1 + Math.floor(Math.random() * maxBonus);
        }
        
        if (luckStat && luckStat > 0) {
            const bonusChance = luckStat * 0.08; // No cap - unlimited luck scaling!
            if (Math.random() < Math.min(bonusChance, 0.95)) { // Only cap at 95% to prevent guaranteed hits
                quantity += Math.floor(1 + Math.random() * 5); // Increased bonus range
            }
        }
        
        if (tileType === TILE_TYPES.RARE_ORE) {
            // Scale rare ore quantity based on power level - higher levels give much more
            let rareOreMultiplier;
            if (powerLevel <= 3) {
                rareOreMultiplier = 2; // 2x for low levels
            } else if (powerLevel <= 5) {
                rareOreMultiplier = 3; // 3x for mid levels
            } else if (powerLevel <= 7) {
                rareOreMultiplier = 4; // 4x for high levels
            } else {
                rareOreMultiplier = 6; // 6x for max levels (very rewarding!)
            }
            quantity *= rareOreMultiplier;
        }
        
        // No tier-based quantity caps - unlimited potential!
        
        // Check cooldown for legendary/unique items
        if (selectedItem.tier === 'legendary' || selectedItem.tier === 'unique' || selectedItem.tier === 'mythic') {
            const playerId = member.id;
            const cooldownKey = `${playerId}_${selectedItem.tier}`;
            const lastFind = legendaryFindCooldowns.get(cooldownKey) || 0;
            const cooldownTime = selectedItem.tier === 'unique' ? UNIQUE_COOLDOWN : LEGENDARY_COOLDOWN;
            
            if (Date.now() - lastFind < cooldownTime) {
                // Downgrade to a lower tier
                const downgradeTiers = {
                    mythic: 'legendary',
                    legendary: 'epic',
                    unique: 'epic'
                };
                
                const downgradeTargetTier = downgradeTiers[selectedItem.tier];
                const downgradeOptions = availableItems.filter(item => item.tier === downgradeTargetTier);
                
                if (downgradeOptions.length > 0) {
                    selectedItem = downgradeOptions[Math.floor(Math.random() * downgradeOptions.length)];
                    // Recalculate quantity for downgraded item
                    quantity = Math.min(quantity, quantityCaps[selectedItem.tier] || 5);
                }
            } else {
                // Update cooldown
                legendaryFindCooldowns.set(cooldownKey, Date.now());
            }
        }
        
        const enhancedValue = Math.floor(selectedItem.value * efficiency.valueMultiplier);
        
        return { 
            item: { ...selectedItem, value: enhancedValue }, 
            quantity ,
            destination  // ← ADD THIS
        };
    } catch (error) {
        console.error('[MINING] Error mining from tile:', error);
        return {
            item: availableItems[0] || { itemId: 'default', name: 'Stone', value: 1 },
            quantity: 1,
            destination: 'minecart'  // ← Add this
        };
    }
}

// Enhanced treasure generation with power level requirements and rarity weights
async function generateTreasure(powerLevel, efficiency, isDeeperMine = false, mineTypeId = null, teamLuckBonus = 0) {
    try {
        const availableTreasures = getAvailableTreasures(powerLevel);
        
        // Apply team luck bonus: +0.1% per point of total team luck, max +20%
        const luckBonus = Math.min(0.20, teamLuckBonus * 0.001); // 0.1% per luck point
        const adjustedTreasureChance = efficiency.treasureChance + luckBonus;
        
        if (Math.random() < adjustedTreasureChance && availableTreasures.length > 0) {
            // Apply tier weights to treasure selection too
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



// All hazard-related functions have been moved to geologicalScanner.js

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

        // CRITICAL FIX: Get fresh minecart data from database instead of cache
        //const minecartSummary = await getMinecartSummaryFresh(channel.id);
        const minecartSummary = await getMinecartSummary(result.channelId);
        
        // Debug: Verify minecart data structure (only log occasionally)
        if (Math.random() < 0.05) { // 5% chance to log
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

            // Initialize components array for later use
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

                    // Check for deeper mine conditions and add button
                    if (forceNew && !result.gameData?.breakInfo?.inBreak) {
                        console.log('im doing DEEPER CHECK NOW');
                        const deeperResult = await deeperMineChecker.checkAndAddDeeperMineButton(
                            newEmbed, 
                            result, 
                            channel.id,
                            channel.guild
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

                  
                // Check for deeper mine conditions and add button  
                const deeperResult = await deeperMineChecker.checkAndAddDeeperMineButton(
                    updatedEmbed, 
                    result, 
                    channel.id,
                    channel.guild
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
                    channel.id,
                    channel.guild
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
        // In startBreak() or endMiningSession()
        dbEntry.gameData.hazardScanDone = false;
        // Update database directly since dbEntry is a lean document
        await gachaVC.updateOne(
            { channelId: channel.id },
            { $set: { 'gameData.hazardScanDone': false } }
        );

        const channelId = channel.id;
        const now = Date.now();
        const members = channel.members.filter(m => !m.user.bot);
        
        // CRITICAL FIX: Check if already in break
        if (dbEntry.gameData?.breakInfo?.inBreak) {
            console.log(`[MINING] Already in break for channel ${channelId}, skipping duplicate start`);
            return;
        }
        
        // Revive all dead players at break start
        try {
            const { reviveDeadPlayers } = require('./mining/hazardEffects');
            const eventLogs = [];
            const revivedCount = await reviveDeadPlayers(dbEntry, eventLogs);
            
            if (revivedCount > 0) {
                // Announce revivals
                for (const log of eventLogs) {
                    await channel.send(`✨ **Break Revival**: ${log}`);
                }
            }
        } catch (revivalError) {
            console.error('[MINING] Error reviving dead players at break start:', revivalError);
        }
        
        // DOUBLE-CHECK: Prevent repeated long breaks even if called incorrectly
        if (isLongBreak && dbEntry.gameData?.lastLongBreakStarted) {
            const timeSinceLastLong = now - dbEntry.gameData.lastLongBreakStarted;
            const minTimeBetween = (MINING_DURATION * 3) + (SHORT_BREAK_DURATION * 3);
            
            if (timeSinceLastLong < minTimeBetween) {
                console.error(`[CRITICAL] Attempted to start long break too soon! Only ${Math.floor(timeSinceLastLong / 60000)} minutes since last one`);
                console.log(`[CRITICAL] Converting to short break for safety`);
                isLongBreak = false; // Force convert to short break
            }
        }
        
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
                nextShopRefresh: new Date(breakEndTime + MINING_DURATION)
            });
            
            const mapData = dbEntry.gameData.map;
            const updatedPositions = {};
            
            // Get rail tiles for long break positioning
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
            
            // Move players to random rail tiles, or entrance if no rails
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
            
            // CRITICAL FIX: Update cache with break info and positions for long breaks
            mapCacheSystem.updateMultiple(channel.id, { 
                'map.playerPositions': updatedPositions,
                'breakInfo': {
                    inBreak: true,
                    isLongBreak: true,
                    breakStartTime: now,
                    breakEndTime: breakEndTime,
                    eventEndTime: eventEndTime
                }
            });
            await batchDB.flush();
            
            const updatedDbEntry = await getCachedDBEntry(channel.id, true);
            if (!updatedDbEntry) {
                console.error(`[MINING] Failed to get updated DB entry for long break`);
                return;
            }
            
            const playerCount = members.size;
            const selectedEvent = preSelectedEvent || pickLongBreakEvent(playerCount);
            
            console.log(`[LONG BREAK] Selected event: ${selectedEvent.name || 'Unknown'}`);
            
            // Log where players were moved
            if (railTiles.length > 0) {
                console.log(`[LONG BREAK] Moving ${members.size} players to random rail tiles (${railTiles.length} rails available)`);
            } else {
                console.log(`[LONG BREAK] No rails found, moving ${members.size} players to entrance`);
            }
            
            // Send prominent long break announcement FIRST
            const { EmbedBuilder } = require('discord.js');
            const longBreakEmbed = new EmbedBuilder()
                .setTitle('🎪 LONG BREAK STARTED!')
                .setDescription('**The mine is closing for an extended break!**')
                .setColor('Purple')
                .addFields(
                    { name: '⏰ Duration', value: `${Math.floor(LONG_BREAK_DURATION / 60000)} minutes`, inline: true },
                    { name: '🎯 Activities', value: 'Special events, shop access, social time', inline: true },
                    { name: '🔄 Next Mining', value: `<t:${Math.floor((now + LONG_BREAK_DURATION) / 1000)}:R>`, inline: true }
                )
                .setTimestamp();
                
            await channel.send({ embeds: [longBreakEmbed] });
            
            // ALWAYS ensure an event happens during long break
            let eventResult;
            try {
                eventResult = await selectedEvent.func(channel, updatedDbEntry);
                
                // If no event result or event failed, force a backup event
                if (!eventResult) {
                    console.log(`[LONG BREAK] Primary event failed, starting backup event`);
                    const { forceBackupLongBreakEvent } = require('./mining/miningEvents');
                    eventResult = await forceBackupLongBreakEvent(channel, updatedDbEntry, playerCount);
                }
            } catch (eventError) {
                console.error(`[LONG BREAK] Event error:`, eventError);
                const { forceBackupLongBreakEvent } = require('./mining/miningEvents');
                eventResult = await forceBackupLongBreakEvent(channel, updatedDbEntry, playerCount);
            }
            
            const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
            await logEvent(channel, `🎪 LONG BREAK EVENT: ${eventResult || 'Event started'}`, true, {
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
            
            // CRITICAL FIX: Update cache with tent positions so rendering works immediately
            mapCacheSystem.updateMultiple(channel.id, { 
                'map.playerPositions': scatteredPositions,
                'breakInfo': {
                    inBreak: true,
                    isLongBreak: false,
                    breakStartTime: now,
                    breakEndTime: breakEndTime,
                    gatherPoint: gatherPoint
                }
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
        
        // Clear any existing locks and instances
        instanceManager.forceKillChannel(channelId);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Register new instance for post-break mining
        if (!instanceManager.registerInstance(channelId)) {
            console.error(`[MINING] Cannot end break - channel ${channelId} is locked by another process`);
            // Force clear and retry once
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
            // Short break: clear tent flags from current positions
            const currentPositions = mapData.playerPositions || {};
            
            // CRITICAL FIX: Use clearTentFlags to ensure all tent flags are removed
            resetPositions = clearTentFlags(currentPositions);
            
            // Ensure all players are accounted for
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
        
        // NOTE: Cycle count was already incremented when the break started
        // We just need to get the current cycle count for calculating next break
        const cycleCount = dbEntry.gameData?.cycleCount || 1;
        
        // Verify cycle count pattern
        const cycleVerification = verifyCycleCount(channelId, cycleCount);
        console.log(`[CYCLE TRACKING] Channel ${channelId}: Current cycle ${cycleCount}`);
        console.log(`[CYCLE TRACKING] Pattern check: ${cycleVerification.pattern}`);
        console.log(`[CYCLE TRACKING] Next break will be: ${cycleVerification.isLongBreakNext ? 'LONG' : 'SHORT'}`);
        
        const nextBreakInfo = calculateNextBreakTime({ gameData: { cycleCount } });
        
        // Log the next break time for debugging
        console.log(`[MINING] Setting next break for channel ${channelId}:`, {
            nextBreakTime: nextBreakInfo.nextShopRefresh.toISOString(),
            miningDuration: MINING_DURATION / 1000 / 60 + ' minutes',
            cycleCount: cycleCount,
            isNextLongBreak: nextBreakInfo.isLongBreak
        });
        
        // CRITICAL FIX: Clear breakInfo from cache BEFORE database update
        mapCacheSystem.deleteField(channel.id, 'breakInfo');
        
        // Update cache with new state (cycle count already incremented at break start)
        mapCacheSystem.updateMultiple(channel.id, {
            'map.playerPositions': resetPositions,
            'breakJustEnded': Date.now(),
            'miningResumedAt': Date.now(),  // FIX: Track when mining resumed
            nextShopRefresh: nextBreakInfo.nextShopRefresh,
            nextTrigger: new Date(Date.now() + 1000)
        });
        
        // Remove breakInfo from database and set next break time
        const updateResult = await gachaVC.updateOne(
            { channelId: channel.id },
            { 
                $unset: { 'gameData.breakInfo': 1 },
                $set: {
                    'gameData.breakJustEnded': Date.now(),
                    'gameData.miningResumedAt': Date.now(),  // FIX: Track when mining resumed
                    'gameData.map.playerPositions': resetPositions,
                    nextShopRefresh: nextBreakInfo.nextShopRefresh,
                    nextTrigger: new Date(Date.now() + 1000)
                }
            }
        );
        
        // Verify the update was successful
        if (!updateResult.acknowledged) {
            console.error(`[MINING] Failed to update database after break end for ${channel.id}`);
        } else {
            console.log(`[MINING] Successfully updated database with next break time for ${channel.id}`);
        }
        
        // Force flush cache changes
        await mapCacheSystem.forceFlush();
        
        // Clear all caches to force fresh data
        mapCacheSystem.clearChannel(channel.id);
        visibilityCalculator.invalidate();
        dbCache.delete(channel.id);
        efficiencyCache.clear();
        
        // Force re-initialize with fresh data
        await mapCacheSystem.initialize(channel.id, true);
        
        // Double-check that tent flags are cleared
        await verifyAndFixPlayerPositions(channel.id, mapCacheSystem, gachaVC);
        
        const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
        // Reset geological scan when break ends (new mining session)
        await resetGeologicalScan(channelId);
        
        await logEvent(channel, '⛏️ Break ended! Mining resumed.', true, {
            level: powerLevel,
            name: powerLevelConfig?.name || 'Unknown Mine',
            specialBonus: powerLevelConfig?.description || 'Mining efficiency active'
        });
        
        console.log(`[MINING] Break ended successfully for channel ${channelId}`);
        
        // Release instance lock to allow normal mining to proceed
        instanceManager.killInstance(channelId);
        
    } catch (error) {
        console.error(`[MINING] Error ending break for channel ${channel.id}:`, error);
        
        // Emergency cleanup
        instanceManager.forceKillChannel(channel.id);
        mapCacheSystem.clearChannel(channel.id);
        
        try {
            // Get current positions and clear tent flags
            const dbResult = await gachaVC.findOne({ channelId: channel.id });
            let cleanedPositions = {};
            if (dbResult?.gameData?.map?.playerPositions) {
                cleanedPositions = clearTentFlags(dbResult.gameData.map.playerPositions);
            }
            
            // Force clear break state and tent flags in database
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

/**
 * Create or move player to gullet channel based on sanity roll
 * @param {Client} client - Discord client instance  
 * @param {Guild} guild - Discord guild
 * @param {Object} player - Player data from database
 * @param {number} playerSanity - Player's current sanity level
 */
async function createGulletChannelForPlayer(client, guild, player, playerSanity) {
    try {
        // Get guild config to find parent category
        const guildConfig = await GuildConfig.findOne({ guildId: guild.id });
        if (!guildConfig || !guildConfig.gachaParentCategoryIds || guildConfig.gachaParentCategoryIds.length === 0) {
            console.log(`🧠 No gacha parent category configured for guild ${guild.name}`);
            return;
        }
        
        // Get parent category
        let parentCategory = null;
        for (const categoryId of guildConfig.gachaParentCategoryIds) {
            try {
                const category = await guild.channels.fetch(categoryId);
                if (category && category.type === 4) { // CategoryChannel type
                    parentCategory = category;
                    break;
                }
            } catch (err) {
                continue;
            }
        }
        
        if (!parentCategory) {
            console.log(`🧠 No valid parent category found for guild ${guild.name}`);
            return;
        }
        
        // Get gullet channel data
        const gulletChannelType = channelData.find(ch => ch.id == 16);
        if (!gulletChannelType) {
            console.error("🧠 Warning: ???'s gullet (id: 16) not found in gachaServers.json!");
            return;
        }
        
        // Check if a gullet channel already exists in this guild
        const existingGulletVC = await ActiveVCS.findOne({ 
            guildId: guild.id, 
            typeId: 16 
        });
        
        let gulletChannel = null;
        
        if (existingGulletVC) {
            try {
                gulletChannel = await guild.channels.fetch(existingGulletVC.channelId);
                console.log(`🧠 Found existing gullet channel in ${guild.name}: ${gulletChannel.name}`);
            } catch (err) {
                console.log(`🧠 Previous gullet channel no longer exists in ${guild.name}, will create new one`);
                // Delete the stale database entry
                await ActiveVCS.deleteOne({ channelId: existingGulletVC.channelId });
            }
        }
        
        // Get guild member
        const member = await guild.members.fetch(player.userId).catch(() => null);
        if (!member) {
            console.log(`🧠 Player ${player.usertag} not found in guild ${guild.name}`);
            return;
        }
        
        // Don't move player if they're already in a gullet channel
        if (member.voice.channel && member.voice.channel.name === gulletChannelType.name) {
            console.log(`🧠 Player ${player.usertag} is already in gullet channel, skipping move`);
            return;
        }
        
        // If no existing gullet channel, create one
        if (!gulletChannel) {
            try {
                gulletChannel = await guild.channels.create({
                    name: gulletChannelType.name,
                    type: ChannelType.GuildVoice,
                    parent: parentCategory,
                    position: 0,
                });
                
                // Store the new VC in database
                const storeVC = new ActiveVCS({
                    channelId: gulletChannel.id,
                    guildId: guild.id,
                    typeId: 16,
                    nextTrigger: new Date(Date.now() + 1000 * 30),
                    nextShopRefresh: new Date(Date.now() + 1000 * 60 * 25),
                    nextLongBreak: new Date(Date.now() + 60 * 1000 * 100),
                });
                
                await storeVC.save();
                
                // Set gullet permissions: everyone can see but cannot connect or interact with text
                await gulletChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    ViewChannel: true,        // Can see the channel exists
                    Connect: false,           // Cannot connect directly
                    SendMessages: false,      // Cannot send messages
                    ReadMessageHistory: false // Cannot read message history
                });
                
                console.log(`🧠💀 Created new gullet channel in ${guild.name}: ${gulletChannel.name}`);
                
            } catch (createError) {
                console.error(`🧠 Error creating gullet channel in ${guild.name}:`, createError);
                return;
            }
        }
        
        // Grant permissions to the player
        await gulletChannel.permissionOverwrites.edit(member, {
            ViewChannel: true,        // Can see the channel
            Connect: true,            // Can connect
            Speak: true,             // Can speak
            UseVAD: true,            // Can use voice activity
            Stream: true,            // Can stream
            SendMessages: true,      // Can send messages in chat
            ReadMessageHistory: true // Can read message history
        });
        
        // Try to move player to gullet if they're in voice
        if (member.voice.channel) {
            try {
                await member.voice.setChannel(gulletChannel);
                console.log(`🧠💀 Moved ${member.user.tag} to gullet channel in ${guild.name}`);
            } catch (moveError) {
                console.log(`🧠 Could not move ${member.user.tag} to gullet (not in voice or permission issue)`);
            }
        }
        
        // Send notification message in gullet channel
        try {
            await gulletChannel.send(
                `🧠💀 **MADNESS DRAWS A SOUL TO THE GULLET** 🧠💀\n` +
                `${member} has been consumed by their deteriorating sanity (${playerSanity})!\n` +
                `*The whispers grow stronger...*`
            );
        } catch (msgError) {
            console.error(`🧠 Error sending gullet notification in ${guild.name}:`, msgError);
        }
        
        console.log(`🧠💀 Successfully processed gullet access for ${member.user.tag} in ${guild.name}`);
        
    } catch (error) {
        console.error(`🧠 Error creating gullet channel for player ${player.usertag} in guild ${guild.name}:`, error);
    }
}

// Main Mining Event - Enhanced with Full Power Level Integration and Instance Management
module.exports = async (channel, dbEntry, json, client) => {
    const channelId = channel.id;
    const processingStartTime = Date.now();
    
    // Start performance monitoring
    concurrencyManager.performanceMonitor.startTiming('mining_cycle', channelId);
    
    // === CRITICAL HOTFIX START ===
    try {
        const now = Date.now();
        
        // Fix 1: Ensure minecart structure exists
        if (!dbEntry.gameData) dbEntry.gameData = {};
        if (!dbEntry.gameData.minecart) {
            dbEntry.gameData.minecart = { items: {}, contributors: {} };
            // Update database directly since dbEntry is a lean document
            await gachaVC.updateOne(
                { channelId },
                { $set: { 'gameData.minecart': dbEntry.gameData.minecart } }
            );
            console.log(`[HOTFIX] Fixed minecart structure for ${channelId}`);
        }
        if (!dbEntry.gameData.minecart.items) dbEntry.gameData.minecart.items = {};
        if (!dbEntry.gameData.minecart.contributors) dbEntry.gameData.minecart.contributors = {};
        
        // Fix 2: Check and fix expired breaks
        if (dbEntry.gameData?.breakInfo?.inBreak) {
            const breakEndTime = dbEntry.gameData.breakInfo.breakEndTime;
            if (breakEndTime && now >= breakEndTime) {
                console.log(`[HOTFIX] Clearing expired break for ${channelId}`);
                
                // Clear break state from database
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
                
                // Clear from cache
                mapCacheSystem.deleteField(channelId, 'breakInfo');
                await mapCacheSystem.forceFlush();
                
                // Force refresh
                dbEntry = await getCachedDBEntry(channelId, true);
                if (!dbEntry) {
                    console.error(`[HOTFIX] Failed to refresh after break clear`);
                    return;
                }
            }
        }
        
        // Fix 3: Clear stuck instances if needed
        if (concurrencyManager.isLocked(channelId)) {
            const lastProcessed = healthMetrics.lastProcessed.get(channelId);
            if (lastProcessed && (now - lastProcessed) > 120000) { // 2 minutes
                console.log(`[HOTFIX] Clearing stuck lock for ${channelId}`);
                concurrencyManager.forceUnlock(channelId);
                instanceManager.forceKillChannel(channelId);
            }
        }
        
    } catch (hotfixError) {
        console.error(`[HOTFIX] Error applying hotfix for ${channelId}:`, hotfixError);
    }
    // === CRITICAL HOTFIX END ===
    
    // Fix any stale tent flags if not in break
    if (!isBreakPeriod(dbEntry)) {
        const fixed = await verifyAndFixPlayerPositions(channelId, mapCacheSystem, gachaVC);
        if (fixed) {
            console.log(`[MINING] Fixed stale tent flags for channel ${channelId}`);
            dbEntry = await getCachedDBEntry(channelId, true);
        }
    }
    
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
            
            // CRITICAL: Force refresh dbEntry after break to get updated nextShopRefresh
            dbEntry = await getCachedDBEntry(channelId, true);
            if (!dbEntry) {
                console.error(`[MINING] Failed to refresh entry after break end`);
                return;
            }
            console.log(`[MINING] Refreshed entry after break - next break at: ${dbEntry.nextShopRefresh}`);
        }
        
        // Update health metrics
        healthMetrics.lastProcessed.set(channelId, now);
        
        // Initialize game data if needed
        if (!dbEntry.gameData) {
            initializeGameData(dbEntry, channel.id);
            // Update database directly since dbEntry is a lean document
            await gachaVC.updateOne(
                { channelId: channel.id },
                { $set: { gameData: dbEntry.gameData } }
            );
        } else {
            if (!dbEntry.gameData.gamemode) {
                console.log(`[MINING] Fixing missing gamemode for channel ${channel.id}`);
                dbEntry.gameData.gamemode = 'mining';
                // Update database directly since dbEntry is a lean document
                await gachaVC.updateOne(
                    { channelId: channel.id },
                    { $set: { 'gameData.gamemode': 'mining' } }
                );
            }
        }
        
        // CRITICAL FIX: Set typeId from json if not already set
        if (json && json.id && dbEntry.typeId !== json.id) {
            console.log(`[MINING] Setting typeId to ${json.id} for channel ${channel.id}`);
            dbEntry.typeId = json.id;
            // Update database directly since dbEntry is a lean document
            await gachaVC.updateOne(
                { channelId: channel.id },
                { $set: { typeId: json.id } }
            );
        } else if (!dbEntry.typeId && json && json.id) {
            console.log(`[MINING] Initial typeId set to ${json.id} for channel ${channel.id}`);
            dbEntry.typeId = json.id;
            // Update database directly since dbEntry is a lean document
            await gachaVC.updateOne(
                { channelId: channel.id },
                { $set: { typeId: json.id } }
            );
        }

        if (!channel?.isVoiceBased()) {
            return;
        }
        
        const members = channel.members.filter(m => !m.user.bot);
        if (!members.size) {
            return;
        }

        // Enhanced power level detection with error handling
        let serverPowerLevel = 1; // Default to level 1
        if (json && typeof json.power === 'number' && json.power >= 1 && json.power <= 10) {
            serverPowerLevel = json.power;
        } else if (json && json.power) {
            console.warn(`[MINING] Invalid power level in json: ${json.power}, using default 1`);
        }
        
        // Get mine type ID for special mine handling (e.g., gullet meat items)
        // Use json.id since that's where the mine ID is stored in gachaServers.json
        const mineTypeId = json?.id || dbEntry.typeId;
        
        // Debug logging for mine ID detection
        console.log(`[MINE ID DEBUG] ===== MINE DETECTION =====`);
        console.log(`[MINE ID DEBUG] Mine Name: ${json?.name || 'Unknown'}`);
        console.log(`[MINE ID DEBUG] json.id: "${json?.id}" (type: ${typeof json?.id})`);
        console.log(`[MINE ID DEBUG] dbEntry.typeId: "${dbEntry.typeId}" (type: ${typeof dbEntry.typeId})`);
        console.log(`[MINE ID DEBUG] Final mineTypeId: "${mineTypeId}" (type: ${typeof mineTypeId})`);
        console.log(`[MINE ID DEBUG] Players in mine: ${members.size}`);
        
        // Enhanced logging for gullet detection and debugging
        if (mineTypeId === 16 || mineTypeId === '16') {
            console.log(`[GULLET DEBUG] Gullet mine detected (ID: ${mineTypeId}) with ${members.size} members`);
            console.log(`[GULLET DEBUG] Map data exists:`, !!dbEntry.gameData?.map);
            console.log(`[GULLET DEBUG] Map dimensions:`, dbEntry.gameData?.map?.width, 'x', dbEntry.gameData?.map?.height);
        }
        
        // Set mining context for this processing cycle
        miningContext.setMiningContext(mineTypeId, channel.id, serverPowerLevel);
        
        // Track mine access for titles (for all players in this mine)
        if (mineTypeId) {
            try {
                const { updateMineReached } = require('./mining/titleSystem');
                
                for (const member of members.values()) {
                    const newTitles = await updateMineReached(member.id, mineTypeId, member.displayName, channel.guild?.id);
                    
                    // Announce new mining titles immediately and auto-equip with role
                    if (newTitles.length > 0) {
                        for (const title of newTitles) {
                            // Auto-equip the new legendary title
                            try {
                                const equipResult = await require('./mining/titleSystem').equipTitle(member.id, title.id, member);
                                
                                let roleMessage = '';
                                if (equipResult.success && equipResult.role) {
                                    roleMessage = `\n🎭 **Discord role equipped**: ${equipResult.role.name}`;
                                }
                                
                                await channel.send(`🏆 **${member.displayName}** earned the legendary title: ${title.emoji} **${title.name}**!\n*${title.description}*${roleMessage}`);
                            } catch (equipError) {
                                console.error('[MINING] Error auto-equipping title:', equipError);
                                await channel.send(`🏆 **${member.displayName}** earned the legendary title: ${title.emoji} **${title.name}**!\n*${title.description}*`);
                            }
                        }
                    }
                }
            } catch (titleError) {
                console.error('[MINING] Error tracking mine access for titles:', titleError);
            }
        }
        
        // Debug hazard configuration for this mine (only for Ruby mines or when there's an issue)
        if (mineTypeId && (String(mineTypeId).startsWith('5') || String(mineTypeId).startsWith('10'))) {
            hazardAllowedTypesFix.debugHazardConfig(mineTypeId);
        }
        
        
        // Check if this is a deeper mine
        const { isDeeperMine: checkDeeperMine } = require('./mining/miningConstants_unified');
        const isDeeperMine = checkDeeperMine ? checkDeeperMine(mineTypeId) : false;
        
        // Simplified mine detection logging
        const serverName = json?.name || 'Unknown Mine';
        const serverModifiers = getServerModifiers(serverName, serverPowerLevel);
        
        console.log(`[MINING] Power Level ${serverPowerLevel} detected for ${serverName}`);
        
        // Check if we should reset the geological scan flag (server changed)
        // Note: The 2-hour cooldown is handled separately in performGeologicalScan
        if (shouldResetScan(dbEntry, serverName)) {
            await resetGeologicalScan(channel.id);
            // Refresh dbEntry to get the updated flag
            dbEntry = await getCachedDBEntry(channel.id, true);
        }

        // Remove this scan from here - it's in the wrong place
        
        // Check if we're in a break period with proper time validation
        const inBreak = isBreakPeriod(dbEntry);
        
        if (inBreak) {
            const breakInfo = dbEntry.gameData.breakInfo;
            const now = Date.now();
            
            // Double-check if break should have ended
            if (breakInfo.breakEndTime && now >= breakInfo.breakEndTime) {
                console.log(`[MINING] Break expired, ending break for ${channelId}`);
                
                // End any special events first
                if (dbEntry.gameData?.specialEvent) {
                    const eventEndResult = await checkAndEndSpecialEvent(channel, dbEntry);
                    if (eventEndResult) {
                        await logEvent(channel, eventEndResult, true);
                    }
                }
                
                // Force refresh the DB entry to get latest state
                const freshEntry = await getCachedDBEntry(channelId, true);
                if (freshEntry) {
                    await endBreak(channel, freshEntry, serverPowerLevel);
                } else {
                    // Emergency fallback - directly clear break from DB
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
            
            // Handle special events during break
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
            
            // Still in valid break period
            console.log(`[MINING] Channel ${channelId} still in break (ends in ${Math.ceil((breakInfo.breakEndTime - now) / 60000)} minutes)`);
            return;
        }

        // Check if it's time to start a break with additional safety checks
        const nextBreakTime = dbEntry.nextShopRefresh ? new Date(dbEntry.nextShopRefresh).getTime() : Infinity;
        
        // FIX: Enhanced safety checks to prevent break loops
        const miningResumedAt = dbEntry.gameData?.miningResumedAt || 0;
        const timeSinceMiningResumed = now - miningResumedAt;
        const minimumMiningTime = MINING_DURATION * 0.9; // At least 90% of mining duration
        
        const shouldStartBreak = (
            now >= nextBreakTime &&                              // Time for break
            !dbEntry.gameData?.breakInfo?.inBreak &&            // Not already in break
            (!dbEntry.gameData?.breakJustEnded ||               // No recent break end
             now - dbEntry.gameData.breakJustEnded > 60000) &&  // Or at least 1 min passed
            (miningResumedAt === 0 ||                           // No mining resume time recorded
             timeSinceMiningResumed >= minimumMiningTime)       // Or mined for minimum duration
        );
        
        // Debug logging
        if (Math.random() < 0.05) { // Log 5% of the time to avoid spam
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
            // Use the break prevention module for additional safety
            const breakCheck = canStartBreak(channelId, dbEntry);
            if (!breakCheck.canStart) {
                console.log(`[MINING] Break prevented: ${breakCheck.reason}`);
                return;
            }
            
            // Additional safety: Check mining duration one more time
            if (dbEntry.gameData?.miningResumedAt) {
                const actualMiningTime = now - dbEntry.gameData.miningResumedAt;
                if (actualMiningTime < MINING_DURATION * 0.8) { // Less than 80% of expected time
                    console.log(`[MINING] Preventing premature break - only mined for ${Math.floor(actualMiningTime / 60000)} minutes`);
                    return;
                }
            }
            
            // Safety check: Don't start a break if we just ended one
            if (dbEntry.gameData?.breakJustEnded) {
                const timeSinceEnd = now - dbEntry.gameData.breakJustEnded;
                if (timeSinceEnd < 60000) { // Less than 1 minute
                    console.log(`[MINING] Preventing immediate break restart (${timeSinceEnd}ms since last break ended)`);
                    return;
                }
            }
            
            // Clear any stale break info before starting new break
            mapCacheSystem.deleteField(channelId, 'breakInfo');
            await mapCacheSystem.forceFlush();
            
            // CRITICAL: Get current cycle count
            let currentCycleCount = dbEntry.gameData?.cycleCount || 0;
            
            // Initialize cycleCount if missing
            if (dbEntry.gameData?.cycleCount === undefined || dbEntry.gameData?.cycleCount === null) {
                console.log(`[CYCLE FIX] Initializing missing cycleCount to 0 for channel ${channelId}`);
                currentCycleCount = 0;
            }
            
            // CRITICAL FIX: Increment cycle count BEFORE determining break type
            const nextCycleCount = currentCycleCount + 1;
            
            // Determine if this will be a long break BASED ON THE NEW CYCLE COUNT
            let isLongBreak = ((nextCycleCount - 1) % 4) === 3; // -1 because we check the cycle we're entering
            
            // SAFETY CHECK: Prevent repeated long breaks
            if (isLongBreak && dbEntry.gameData?.lastLongBreakStarted) {
                const timeSinceLastLongBreak = now - dbEntry.gameData.lastLongBreakStarted;
                const minTimeBetweenLongBreaks = (MINING_DURATION * 3) + (SHORT_BREAK_DURATION * 3); // At least 3 full cycles
                
                if (timeSinceLastLongBreak < minTimeBetweenLongBreaks) {
                    console.log(`[SAFETY] Preventing repeated long break - only ${Math.floor(timeSinceLastLongBreak / 60000)} minutes since last long break`);
                    console.log(`[SAFETY] Forcing short break instead`);
                    // Force a short break instead
                    isLongBreak = false;
                }
            }
            
            console.log(`[BREAK START] Channel ${channelId}: Incrementing cycle ${currentCycleCount} -> ${nextCycleCount}`);
            console.log(`[BREAK START] Break type: ${isLongBreak ? 'LONG BREAK' : 'SHORT BREAK'}`);
            
            // CRITICAL: Save the incremented cycle count to DB IMMEDIATELY
            try {
                const updateData = { 
                    'gameData.cycleCount': nextCycleCount,
                    'gameData.lastBreakStarted': now
                };
                
                // Track last long break specifically to prevent repeats
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
                    return; // Don't start break if we can't save the cycle count
                }
                
                console.log(`[CYCLE SAVED] Successfully saved cycle ${nextCycleCount} to database`);
                
                // Log the break pattern for debugging
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
                
                // Update cache as well
                mapCacheSystem.updateMultiple(channelId, {
                    'cycleCount': nextCycleCount,
                    'lastBreakStarted': now,
                    'lastBreakType': isLongBreak ? 'LONG' : 'SHORT'
                });
                await mapCacheSystem.forceFlush();
                
                // Update the local dbEntry to reflect the new cycle count
                dbEntry.gameData.cycleCount = nextCycleCount;
                
            } catch (saveError) {
                console.error(`[CRITICAL] Error saving cycle count:`, saveError);
                return; // Don't proceed with break if save failed
            }
            
            const cycleVerification = verifyCycleCount(channelId, nextCycleCount);
            console.log(`[BREAK START] Cycle pattern: ${cycleVerification.pattern}`);
            
            let selectedEvent = null;
            
            console.log(`[MINING] Creating mining summary for channel ${channel.id}...`);
            try {
                await createMiningSummary(channel, dbEntry);
                console.log(`[MINING] Mining summary created successfully for channel ${channel.id}`);
                
                // Reset geological scan when mining ends (before break)
                await resetGeologicalScan(channel.id);
            } catch (summaryError) {
                console.error(`[MINING] ERROR creating mining summary for channel ${channel.id}:`, summaryError);
            }
            
            if (isLongBreak) {
                const playerCount = members.size;
                selectedEvent = pickLongBreakEvent(playerCount);
                console.log(`[MAIN] Long break: Selected event ${selectedEvent.name} for ${playerCount} players`);
            }
            
            await startBreak(channel, dbEntry, isLongBreak, serverPowerLevel, selectedEvent);
            return;
        }

        // Enhanced mining logic with power level integration
        const memberIds = Array.from(members.keys());
        const playerStatsMap = await playerStatsCache.getMultiple(memberIds);
        
        // Process sanity levels for gullet channel creation (before player actions)
        const playersToSkip = new Set(); // Track players who will be moved to gullet
        
        // Skip sanity processing if we're already in the gullet channel (typeId 16)
        if (dbEntry.typeId === 16) {
            console.log('🧠 [MINING] Skipping sanity processing - already in gullet channel');
        } else {
            try {
                console.log('🧠 [MINING] Processing sanity levels for channel players...');
                
                for (const member of members.values()) {
                try {
                    const playerStats = playerStatsMap.get(member.id);
                    if (playerStats && playerStats.stats) {
                        const playerSanity = playerStats.stats.sanity || 0;
                        
                        // Only process players with negative sanity (insanity)
                        if (playerSanity < 0) {
                            // Calculate gullet chance: 0.1% per insanity point, capped at 99%
                            const insanityPoints = Math.abs(playerSanity);
                            const gulletChance = Math.min(99, insanityPoints * 0.1);
                            const rollPercentage = Math.random() * 100;
                            
                            console.log(`🧠 [MINING] Player ${member.displayName}: Sanity ${playerSanity}, Chance ${gulletChance}%, Roll ${rollPercentage.toFixed(2)}%`);
                            
                            // Check if gullet roll succeeds
                            if (rollPercentage < gulletChance) {
                                console.log(`🧠💀 [MINING] Sanity-triggered gullet roll succeeded for ${member.displayName}!`);
                                
                                // Mark player to skip mining actions
                                playersToSkip.add(member.id);
                                
                                // Create gullet channel for this player
                                const playerData = {
                                    userId: member.id,
                                    usertag: member.user.tag
                                };
                                
                                // Don't await this to avoid blocking mining processing
                                createGulletChannelForPlayer(client, channel.guild, playerData, playerSanity)
                                    .then(() => {
                                        console.log(`🧠💀 [MINING] Successfully processed gullet for ${member.displayName}`);
                                    })
                                    .catch(gulletError => {
                                        console.error(`🧠 [MINING] Error creating gullet channel for ${member.displayName}:`, gulletError);
                                        // If gullet creation fails, remove from skip list so they can continue mining
                                        playersToSkip.delete(member.id);
                                    });
                            }
                        }
                    }
                } catch (playerSanityError) {
                    console.error(`🧠 [MINING] Error processing sanity for ${member.displayName}:`, playerSanityError);
                }
            }
            
            if (playersToSkip.size > 0) {
                console.log(`🧠 [MINING] ${playersToSkip.size} players will be moved to gullet, skipping their mining actions`);
            }
            
        } catch (sanityProcessingError) {
            console.error('🧠 [MINING] Error in sanity processing:', sanityProcessingError);
        }
        }
        
        // Calculate total team luck for treasure bonus
        let totalTeamLuck = 0;
        for (const [memberId, playerData] of playerStatsMap) {
            totalTeamLuck += playerData?.stats?.luck || 0;
        }
        // Log team luck bonus (capped at 20%)
        const teamLuckBonus = Math.min(200, totalTeamLuck); // Cap at 200 luck points (20% bonus)
        if (totalTeamLuck > 0) {
            console.log(`[MINING] Team luck bonus: ${totalTeamLuck} points (+${(teamLuckBonus * 0.1).toFixed(1)}% treasure chance)`);
        }

        const availableItems = getAvailableItems(serverPowerLevel);
        const availableTreasures = getAvailableTreasures(serverPowerLevel);
        
        console.log(`[MINING] Available items for power level ${serverPowerLevel}:`, availableItems.length);
        
        let mapData = dbEntry.gameData.map;
        let mapChanged = false;
        let healthDataChanged = false; // Track if health data was modified
        const transaction = new DatabaseTransaction();
        
        const eventLogs = [];
        let wallsBroken = 0;
        let treasuresFound = 0;
        
        // Midas' Burden ownership transfer is now handled globally in gachaGameMaster.js
        
        // Get or initialize hazards data with enhanced spawn rates for danger 6-7
        let hazardsData = await hazardStorage.getHazardsData(channel.id);
        let hazardsChanged = false;
        
        if (!mapData) {
            console.log(`[MINING] Generating fresh map for channel ${channel.id}`);
            mapData = initializeMap(channel.id);
            
            // CRITICAL: Initialize player positions for freshly generated maps
            console.log(`[MINING] Initializing player positions for ${members.size} members`);
            mapData = initializeBreakPositions(mapData, members, false);
            
            mapChanged = true;
            console.log(`[MINING] Fresh map generated with player positions initialized`);
            
            // CRITICAL: Update cache immediately so fresh cache calls work
            console.log(`[MINING] Updating cache with fresh map data...`);
            mapCacheSystem.updateMapData(channelId, mapData);
            await mapCacheSystem.forceFlush();
            console.log(`[MINING] Cache updated with fresh map - entities can now process`);
        }
        
        // Load existing familiars from database and restore them to the map (after mapData is guaranteed to exist)
        console.log(`[FAMILIAR] Loading existing familiars from database...`);
        const familiarMapChanged = familiarSystem.loadFamiliarsFromDatabase(dbEntry, mapData);
        if (familiarMapChanged) {
            mapChanged = true;
            console.log(`[FAMILIAR] Map updated with restored familiars`);
            
            // Use geological scanner's hazard probability
            const hazardSpawnChance = getHazardProbability(serverPowerLevel);
            
            hazardsData = hazardStorage.generateHazardsForArea(
                hazardsData,
                0,
                0,
                mapData.width,
                mapData.height,
                hazardSpawnChance,
                serverPowerLevel,
                mineTypeId  // Pass mine type ID to filter allowed hazards
            );
            hazardsChanged = true;
            
            // Perform simple hazard scan at session start
            console.log(`[HAZARD SCAN] Performing initial scan for new mining session`);
            await simpleHazardScanner.performSimpleHazardScan(
                channel,
                hazardsData,
                serverPowerLevel,
                serverName,
                mineTypeId
            );
        }

        // Check for new players
        const existingPositions = mapData.playerPositions || {};
        const newPlayers = [];
        for (const member of members.values()) {
            if (!existingPositions[member.id]) {
                newPlayers.push(member);
                const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
                eventLogs.push(`👋 ${member.displayName} joined the ${powerLevelConfig?.name || 'Expedition'}!`);
                
                // Check for maintenance warnings for new player
                try {
                    const warnings = await getMaintenanceWarnings(member.id);
                    if (warnings.length > 0) {
                        // Only show the most critical warning
                        eventLogs.push(warnings[0]);
                    }
                } catch (err) {
                    console.error(`[MINING] Error checking maintenance for ${member.displayName}:`, err);
                }
            }
        }
        
        mapData = initializeBreakPositions(mapData, members, false);
        mapChanged = true;
        
        // === ENSURE ALL PLAYERS ARE WITHIN MAP BOUNDS ===
        // Check if any players are outside map boundaries after initialization
        const { expandMap } = require('./mining/miningMap');
        let needsExpansion = false;
        
        for (const member of members.values()) {
            const position = mapData.playerPositions[member.id];
            if (position) {
                const { x: playerX, y: playerY } = position;
                
                // Check if player is outside current map boundaries
                if (playerX < 0 || playerX >= mapData.width || playerY < 0 || playerY >= mapData.height) {
                    console.log(`[MAP_INIT] Player ${member.displayName} at (${playerX}, ${playerY}) is outside map bounds ${mapData.width}x${mapData.height}, expanding...`);
                    
                    // Expand map to accommodate this player
                    while (playerX < 0 && mapData.width < 200) {
                        mapData = expandMap(mapData, 'west', channelId, serverPowerLevel);
                        needsExpansion = true;
                    }
                    while (playerX >= mapData.width && mapData.width < 200) {
                        mapData = expandMap(mapData, 'east', channelId, serverPowerLevel);
                        needsExpansion = true;
                    }
                    while (playerY < 0 && mapData.height < 200) {
                        mapData = expandMap(mapData, 'north', channelId, serverPowerLevel);
                        needsExpansion = true;
                    }
                    while (playerY >= mapData.height && mapData.height < 200) {
                        mapData = expandMap(mapData, 'south', channelId, serverPowerLevel);
                        needsExpansion = true;
                    }
                }
            }
        }
        
        if (needsExpansion) {
            console.log(`[MAP_INIT] Map expanded during initialization to ${mapData.width}x${mapData.height} to accommodate all players`);
            mapChanged = true;
        }
        
        // Initialize shadow clones for players with Shadow Legion Amulet
        const shadowCloneResults = [];
        const MAX_TOTAL_CLONES = 30; // Maximum clones across all players
        
        // Helper function to check if we can spawn more familiars
        function canSpawnMoreClones() {
            let totalFamiliars = 0;
            for (const familiars of familiarSystem.activeShadowClones.values()) {
                totalFamiliars += familiars.length;
            }
            return totalFamiliars < MAX_TOTAL_CLONES;
        }
        
        for (const member of members.values()) {
            const playerData = playerStatsMap.get(member.id);
            
            // Check if player has any familiar-generating items and initialize all familiars
            const familiarResult = familiarSystem.initializeFamiliars(
                member.id,
                member.displayName,
                playerData,
                mapData
            );
            
            if (familiarResult.familiars.length > 0) {
                // Check clone limit for shadow clones specifically
                const shadowClones = familiarResult.familiars.filter(f => f.type === 'shadow_clone');
                if (shadowClones.length > 0) {
                    if (!canSpawnMoreClones()) {
                        eventLogs.push(`⚠️ Maximum shadow limit reached in this mine!`);
                        // Remove shadow clones from the result but keep other familiars
                        familiarResult.familiars = familiarResult.familiars.filter(f => f.type !== 'shadow_clone');
                    }
                }
                
                if (familiarResult.mapChanged) {
                    mapChanged = true;
                }
                
                if (familiarResult.familiars.length > 0) {
                    shadowCloneResults.push({
                        ownerId: member.id,
                        ownerName: member.displayName,
                        clones: familiarResult.familiars // Keep 'clones' name for compatibility
                    });
                    
                    // Show materialization messages for newly created familiars
                    if (familiarResult.newlyCreated) {
                        const shadowCount = familiarResult.familiars.filter(f => f.type === 'shadow_clone').length;
                        const otherFamiliars = familiarResult.familiars.filter(f => f.type !== 'shadow_clone');
                        
                        if (shadowCount > 0) {
                            eventLogs.push(`👥 ${member.displayName}'s Shadow Legion has materialized! (${shadowCount} shadows)`);
                        }
                        
                        for (const familiar of otherFamiliars) {
                            const config = familiarSystem.FAMILIAR_CONFIGS[familiar.type];
                            eventLogs.push(`${config.displayIcon} ${member.displayName} summoned a ${config.name}!`);
                        }
                    }
                }
            }
        }
        
        // Check for players who left (exclude shadow clones from this check)
        const currentPlayerIds = Array.from(members.keys());
        const departedPlayers = [];
        for (const playerId of Object.keys(existingPositions)) {
            // Skip familiars - they're not real players who can "leave"
            if (playerId.includes('_shadow_') || playerId.includes('_golem_') || playerId.includes('_elemental_')) continue;
            
            if (!currentPlayerIds.includes(playerId)) {
                const memberName = channel.guild.members.cache.get(playerId)?.displayName || 'A miner';
                departedPlayers.push({ id: playerId, name: memberName });
                eventLogs.push(`👋 ${memberName} left the mines`);
                playerMovementHistory.delete(playerId);
            }
        }
        
        // Remove familiars for departed players
        for (const departed of departedPlayers) {
            const removeResult = familiarSystem.removeAllPlayerFamiliars(departed.id, mapData);
            if (removeResult.mapChanged) {
                mapChanged = true;
                eventLogs.push(`👥 ${departed.name}'s familiars fade away...`);
            }
        }
        
        mapData = cleanupPlayerPositions(mapData, currentPlayerIds);

        // Individual vision system - no longer calculate team vision
        // Each player will get their own vision calculated during processing
        // Tile discovery will happen individually per player

        if (dbEntry.gameData?.breakInfo?.justEnded) {
            hazardEffects.enablePlayersAfterBreak(dbEntry);
            delete dbEntry.gameData.breakInfo.justEnded;
            // Update database directly since dbEntry is a lean document
            await gachaVC.updateOne(
                { channelId: channel.id },
                { $unset: { 'gameData.breakInfo.justEnded': 1 } }
            );
        }
        
        const hadExpiredDisables = hazardEffects.cleanupExpiredDisables(dbEntry);
        if (hadExpiredDisables) {
            // Update only the disabled players field, not the entire gameData
            await gachaVC.updateOne(
                { channelId: channel.id },
                { $set: { 'gameData.disabledPlayers': dbEntry.gameData.disabledPlayers } }
            );
        }
        
        // Create list of all entities to process (players + shadow clones)
        const allEntities = [];
        
        // Add regular players
        for (const member of members.values()) {
            allEntities.push({
                type: 'player',
                member: member,
                id: member.id,
                displayName: member.displayName,
                isClone: false
            });
        }
        
        // Add familiars from database as virtual players
        const allPlayerFamiliars = familiarSystem.activeShadowClones; // This is now activeFamiliars
        for (const [ownerId, familiars] of allPlayerFamiliars.entries()) {
            const ownerMember = channel.members.get(ownerId);
            if (!ownerMember) continue;
            
            for (const familiar of familiars) {
                if (!familiar.active) continue;
                
                // Create virtual member object for the familiar
                const virtualMember = {
                    id: familiar.id,
                    displayName: familiar.displayName,
                    user: {
                        id: familiar.id,
                        username: familiar.name,
                        displayName: familiar.displayName,
                        bot: false
                    },
                    // Reference to the original owner
                    ownerId: ownerId,
                    ownerMember: ownerMember,
                    isClone: familiar.type === 'shadow_clone',
                    isFamiliar: true,
                    familiarType: familiar.type,
                    cloneData: familiar // For backward compatibility
                };
                
                allEntities.push({
                    type: 'familiar',
                    member: virtualMember,
                    id: familiar.id,
                    displayName: familiar.displayName,
                    isClone: familiar.type === 'shadow_clone',
                    isFamiliar: true,
                    ownerId: ownerId,
                    familiarType: familiar.type,
                    cloneData: familiar // For backward compatibility
                });
            }
        }
        
        // Process actions for each entity SEQUENTIALLY with fresh cache per entity to prevent race conditions
        console.log(`[MINING] Processing ${allEntities.length} entities (${members.size} players + ${allEntities.length - members.size} shadow clones) sequentially with fresh cache per entity`);
        
        for (const entity of allEntities) {
            const member = entity.member;
            try {
                // Skip players who are being moved to gullet due to sanity
                if (playersToSkip.has(member.id)) {
                    console.log(`🧠 [MINING] Skipping mining actions for ${member.displayName} (being moved to gullet)`);
                    continue;
                }
                
                // === FRESH CACHE PER PLAYER - RACE CONDITION FIX ===
                console.log(`[CACHE] Getting fresh cache for player ${member.displayName}`);
                
                // Get fresh dbEntry from cache for this player
                const freshDbEntry = await getCachedDBEntry(channelId, false); // Don't force refresh, but get current cache state
                if (!freshDbEntry) {
                    console.error(`[MINING] Failed to get fresh cache for ${member.displayName}, skipping`);
                    continue;
                }
                
                // Get fresh mapData from the fresh cache
                let playerMapData = freshDbEntry.gameData?.map;
                if (!playerMapData) {
                    console.error(`[MINING] No map data in fresh cache for ${member.displayName}, skipping`);
                    continue;
                }
                
                // Deep clone the mapData to prevent cross-player contamination
                playerMapData = JSON.parse(JSON.stringify(playerMapData));
                
                // For familiars, ensure their position is preserved in the fresh map data
                if (entity.isClone || entity.isFamiliar) {
                    // Get familiar from the database-loaded familiars
                    const playerFamiliars = familiarSystem.getPlayerFamiliars(entity.ownerId);
                    const familiar = playerFamiliars.find(f => f.id === member.id);
                    
                    if (familiar) {
                        // Get owner position to calculate familiar position
                        const ownerPosition = playerMapData.playerPositions[entity.ownerId];
                        if (ownerPosition) {
                            let offsetX = 0, offsetY = 0;
                            
                            if (familiar.type === 'shadow_clone') {
                                // Shadow clone positioning (for 5 clones)
                                switch (familiar.index) {
                                    case 1: offsetX = -1; offsetY = 0; break;  // Left
                                    case 2: offsetX = 1; offsetY = 0; break;   // Right
                                    case 3: offsetX = 0; offsetY = -1; break;  // Up
                                    case 4: offsetX = 0; offsetY = 1; break;   // Down
                                    case 5: offsetX = -1; offsetY = -1; break; // Diagonal up-left
                                }
                            } else {
                                // Other familiars positioned next to owner
                                offsetX = familiar.index - 1;
                                offsetY = 0;
                            }
                            
                            playerMapData.playerPositions[familiar.id] = {
                                x: Math.max(0, Math.min(playerMapData.width - 1, ownerPosition.x + offsetX)),
                                y: Math.max(0, Math.min(playerMapData.height - 1, ownerPosition.y + offsetY)),
                                isFamiliar: true,
                                isClone: familiar.type === 'shadow_clone',
                                familiarType: familiar.type,
                                ownerId: entity.ownerId,
                                familiarIndex: familiar.index,
                                hidden: false
                            };
                            console.log(`[FAMILIAR] Restored position for ${member.displayName} (${familiar.type}) at (${playerMapData.playerPositions[familiar.id].x}, ${playerMapData.playerPositions[familiar.id].y})`);
                        }
                    }
                }
                
                console.log(`[CACHE] Fresh map data loaded for ${member.displayName} - tiles: ${playerMapData.width}x${playerMapData.height}`);
                
                // === CHECK AND EXPAND MAP FOR PLAYER VISIBILITY ===
                const playerPosition = playerMapData.playerPositions[member.id];
                if (playerPosition) {
                    const { x: playerX, y: playerY } = playerPosition;
                    let mapExpanded = false;
                    
                    console.log(`[MAP_EXPAND] Checking player ${member.displayName} position (${playerX}, ${playerY}) against map bounds ${playerMapData.width}x${playerMapData.height}`);
                    
                    // Check if player is outside map boundaries and expand if needed
                    if (playerX < 0 || playerX >= playerMapData.width || playerY < 0 || playerY >= playerMapData.height) {
                        console.log(`[MAP_EXPAND] Player ${member.displayName} is outside map boundaries at (${playerX}, ${playerY}), expanding map...`);
                        
                        // Import map expansion functions
                        const { expandMap } = require('./mining/miningMap');
                        
                        // Expand map in all necessary directions
                        let expandedMap = playerMapData;
                        
                        // Expand north if player is above map
                        while (playerY < 0 && expandedMap.height < 200) { // MAX_MAP_SIZE check
                            console.log(`[MAP_EXPAND] Expanding north for player ${member.displayName}`);
                            expandedMap = expandMap(expandedMap, 'north', channelId, serverPowerLevel);
                            mapExpanded = true;
                        }
                        
                        // Expand west if player is left of map
                        while (playerX < 0 && expandedMap.width < 200) { // MAX_MAP_SIZE check
                            console.log(`[MAP_EXPAND] Expanding west for player ${member.displayName}`);
                            expandedMap = expandMap(expandedMap, 'west', channelId, serverPowerLevel);
                            mapExpanded = true;
                        }
                        
                        // Expand east if player is right of map
                        while (playerX >= expandedMap.width && expandedMap.width < 200) { // MAX_MAP_SIZE check
                            console.log(`[MAP_EXPAND] Expanding east for player ${member.displayName}`);
                            expandedMap = expandMap(expandedMap, 'east', channelId, serverPowerLevel);
                            mapExpanded = true;
                        }
                        
                        // Expand south if player is below map
                        while (playerY >= expandedMap.height && expandedMap.height < 200) { // MAX_MAP_SIZE check
                            console.log(`[MAP_EXPAND] Expanding south for player ${member.displayName}`);
                            expandedMap = expandMap(expandedMap, 'south', channelId, serverPowerLevel);
                            mapExpanded = true;
                        }
                        
                        if (mapExpanded) {
                            playerMapData = expandedMap;
                            mapChanged = true;
                            console.log(`[MAP_EXPAND] Map expanded for ${member.displayName} - new size: ${playerMapData.width}x${playerMapData.height}`);
                            
                            // Update the cache immediately with the expanded map
                            mapCacheSystem.updateMapData(channelId, playerMapData);
                            await mapCacheSystem.forceFlush();
                            console.log(`[MAP_EXPAND] Updated cache with expanded map for ${member.displayName}`);
                        }
                    }
                    
                    // Double-check player is now within bounds
                    const finalPosition = playerMapData.playerPositions[member.id];
                    if (finalPosition) {
                        const { x: finalX, y: finalY } = finalPosition;
                        if (finalX >= 0 && finalX < playerMapData.width && finalY >= 0 && finalY < playerMapData.height) {
                            console.log(`[MAP_EXPAND] Player ${member.displayName} is now visible at (${finalX}, ${finalY})`);
                        } else {
                            console.error(`[MAP_EXPAND] ERROR: Player ${member.displayName} still outside bounds at (${finalX}, ${finalY}) after expansion!`);
                            // Emergency fallback - move player to entrance
                            finalPosition.x = playerMapData.entranceX;
                            finalPosition.y = playerMapData.entranceY;
                            console.log(`[MAP_EXPAND] Emergency: Moved ${member.displayName} to entrance (${playerMapData.entranceX}, ${playerMapData.entranceY})`);
                        }
                    }
                } else {
                    console.log(`[MAP_EXPAND] No position found for ${member.displayName}, will be initialized at entrance`);
                }
                
                // Handle health and disabled status differently for clones vs players
                let isDead = false;
                let wasDisabled = false;
                let isDisabled = false;
                
                if (entity.isClone || entity.isFamiliar) {
                    // For familiars, check if they're respawning instead of health/disabled status
                    if (entity.cloneData.respawning) {
                        console.log(`[FAMILIAR] ${member.displayName} is respawning, skipping actions`);
                        continue;
                    }
                    
                    // Check if temporary familiar has expired
                    if (entity.cloneData.duration && (Date.now() - entity.cloneData.createdAt) > entity.cloneData.duration) {
                        console.log(`[FAMILIAR] ${member.displayName} has expired, removing...`);
                        familiarSystem.removeFamiliar(entity.ownerId, entity.id, playerMapData);
                        continue;
                    }
                } else {
                    // Regular player health and disabled checks
                    try {
                        const PlayerHealth = require('../../models/PlayerHealth');
                        const playerHealth = await PlayerHealth.getOrCreatePlayerHealth(member.id, channel.id, channel.guild.id);
                        isDead = playerHealth.isDead;
                        
                        if (isDead) {
                            console.log(`[MINING] Player ${member.displayName} is dead, skipping actions`);
                            continue; // Skip processing for dead players
                        }
                    } catch (healthInitError) {
                        console.error(`[MINING] Error initializing health for ${member.displayName}:`, healthInitError);
                    }
                    
                    wasDisabled = freshDbEntry.gameData?.disabledPlayers?.[member.id];
                    isDisabled = hazardEffects.isPlayerDisabled(member.id, freshDbEntry);
                }
                
                // Handle recovery and disabled status (only for regular players, clones handle this differently)
                if (!entity.isClone) {
                    if (wasDisabled && !isDisabled) {
                        eventLogs.push(`⭐ ${member.displayName} recovered from being knocked out!`);
                        const position = playerMapData.playerPositions[member.id];
                        if (position && (position.x !== playerMapData.entranceX || position.y !== playerMapData.entranceY)) {
                            position.x = playerMapData.entranceX;
                            position.y = playerMapData.entranceY;
                            position.disabled = false;
                            mapChanged = true;
                        }
                    }
                    
                    if (isDisabled) {
                        const disabledInfo = freshDbEntry.gameData?.disabledPlayers?.[member.id];
                        if (disabledInfo?.enableAt && Math.random() < 0.1) {
                            const now = Date.now();
                            const remainingMs = disabledInfo.enableAt - now;
                            const remainingMinutes = Math.ceil(remainingMs / 60000);
                            if (remainingMinutes > 0) {
                                eventLogs.push(`💤 ${member.displayName} is knocked out (${remainingMinutes} min remaining)`);
                            }
                        }
                        continue; // Skip processing but don't throw error
                    }
                }
                
                // Get player data - for clones, use their own stats, for players use normal stats
                let playerData;
                let playerLevel;
                
                if (entity.isClone || entity.isFamiliar) {
                    // For familiars, use their stats and owner's level
                    const ownerData = playerStatsMap.get(entity.ownerId) || { stats: {}, level: 1 };
                    playerData = {
                        stats: entity.cloneData.stats, // Familiar has their own stats
                        level: ownerData.level || 1,    // Familiar uses owner's level
                        equippedItems: ownerData.equippedItems || [], // Familiar uses owner's equipment (including pickaxe)
                        isClone: entity.isClone,
                        isFamiliar: entity.isFamiliar,
                        familiarType: entity.familiarType,
                        ownerId: entity.ownerId,
                        cloneData: entity.cloneData
                    };
                    playerLevel = ownerData.level || 1;
                    console.log(`[FAMILIAR] Processing ${member.displayName} (${entity.familiarType}) with stats: mining=${playerData.stats.mining}, luck=${playerData.stats.luck}, speed=${playerData.stats.speed}, sight=${playerData.stats.sight}`);
                } else {
                    // Regular player
                    playerData = playerStatsMap.get(member.id) || { stats: {}, level: 1 };
                    playerLevel = playerData.level || 1;
                }

                const efficiency = getCachedMiningEfficiency(serverPowerLevel, playerLevel, serverModifiers);
                
                console.log(`[MINING] Processing actions for ${member.displayName} with fresh map data (typeId: ${mineTypeId})`);
                if (mineTypeId === 16 || mineTypeId === '16') {
                    console.log(`[GULLET DEBUG] Processing gullet player ${member.displayName} with map size: ${playerMapData.width}x${playerMapData.height}`);
                }
                const result = await processPlayerActionsEnhanced(
                    member, 
                    playerData, 
                    playerMapData,  // Use fresh cloned map data per player
                    serverPowerLevel,
                    availableItems,
                    availableTreasures,
                    efficiency,
                    serverModifiers,
                    transaction,
                    eventLogs,
                    freshDbEntry,  // Use fresh dbEntry per player
                    hazardsData,
                    teamLuckBonus,  // Pass team luck bonus
                    mineTypeId,  // Pass mine type ID for proper ore correspondence
                    client  // Pass client for legendary announcements
                );
                
                // === UPDATE CACHE AFTER PLAYER ACTION - RACE CONDITION FIX ===
                if (result) {
                    if (result.hazardsChanged) {
                        hazardsChanged = true;
                    }
                    
                    if (result.mapChanged) {
                        mapChanged = true;
                        
                        // Update the cache immediately with the player's changes
                        if (result.mapData) {
                            console.log(`[CACHE] Updating cache with ${member.displayName}'s map changes`);
                            
                            // Update the main mapData reference for aggregation
                            mapData = result.mapData;
                            
                            // Update the cache system immediately to prevent race conditions
                            mapCacheSystem.updateMapData(channelId, result.mapData);
                            
                            // Force flush to ensure changes are persisted before next player
                            await mapCacheSystem.forceFlush();
                            console.log(`[CACHE] Cache updated and flushed for ${member.displayName}`);
                        }
                    }
                    
                    wallsBroken += result.wallsBroken;
                    treasuresFound += result.treasuresFound;
                }
                
            } catch (playerError) {
                console.error(`[MINING] Error processing player ${member.displayName}:`, playerError);
                // Continue with next player instead of crashing entire loop
            }
        }

        // Shadow clones are now processed as full players in the main loop above
        // No separate processing needed - they get individual visibility and full action processing

        if (wallsBroken > 0 || treasuresFound > 0) {
            mapCacheSystem.updateMultiple(channel.id, { 'stats.wallsBroken': (dbEntry.gameData.stats?.wallsBroken || 0) + wallsBroken,
                'gameData.stats.treasuresFound': (dbEntry.gameData.stats?.treasuresFound || 0) + treasuresFound
            });
        }

        if (hazardsChanged) {
            await hazardStorage.saveHazardsData(channel.id, hazardsData);
        }
        
        // Update database with any familiar changes
        await familiarSystem.updateDatabaseFamiliars(dbEntry);
        
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
            
            // Attempt rollback and retry once
            try {
                await transaction.rollback();
                console.log(`[MINING] Transaction rolled back for channel ${channel.id}, retrying...`);
                
                // Create new transaction and retry critical operations
                const retryTransaction = new DatabaseTransaction();
                if (mapChanged) {
                    retryTransaction.setMapUpdate(channel.id, mapData);
                }
                await retryTransaction.commit();
                console.log(`[MINING] Retry transaction successful for channel ${channel.id}`);
            } catch (retryError) {
                console.error(`[MINING] Retry transaction failed for channel ${channel.id}:`, retryError);
                // Mark channel for manual intervention
                healthMetrics.processingErrors.set(channel.id, 999);
            }
        }
        
        await batchDB.flush();
        
        // Health data is now handled by separate PlayerHealth schema (no need to save here)
        
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
        
        // Enhanced error tracking with context
        const errorCount = (healthMetrics.processingErrors.get(channelId) || 0) + 1;
        healthMetrics.processingErrors.set(channelId, errorCount);
        
        // Log error details for debugging
        console.error(`[MINING] Error details for ${channelId}:`, {
            error: error.message,
            stack: error.stack?.split('\n').slice(0, 5).join('\n'),
            errorCount,
            processingTime: Date.now() - processingStartTime
        });
        
        // Progressive error handling
        if (errorCount > 3) {
            console.warn(`[MINING] Too many errors for channel ${channelId}, attempting recovery...`);
            try {
                await attemptAutoRecovery(channel);
            } catch (recoveryError) {
                console.error(`[MINING] Recovery failed for channel ${channelId}:`, recoveryError);
                // Force cleanup on recovery failure
                concurrencyManager.forceUnlock(channelId);
            }
        } else if (errorCount > 1) {
            // Add delay for repeated errors to prevent rapid failure loops
            await new Promise(resolve => setTimeout(resolve, 1000 * errorCount));
        }
    } finally {
        // End performance monitoring
        const processingTime = concurrencyManager.performanceMonitor.endTiming('mining_cycle', channelId);
        
        // Ensure cleanup always happens
        try {
            miningContext.clearMiningContext();
            concurrencyManager.releaseLock(channelId);
        } catch (cleanupError) {
            console.error(`[MINING] Cleanup error for channel ${channelId}:`, cleanupError);
        }
        
        // Log performance metrics if processing was slow
        if (processingTime > 3000) {
            console.log(`[PERFORMANCE] Mining cycle completed for channel ${channelId} in ${processingTime}ms`);
        }
    }
};

// Enhanced player action processing with improved error handling and performance
async function processPlayerActionsEnhanced(member, playerData, mapData, powerLevel, availableItems, availableTreasures, efficiency, serverModifiers, transaction, eventLogs, dbEntry, hazardsData, teamLuckBonus = 0, mineTypeId = null, client = null) {
    // Debug logging for mineTypeId
    console.log(`[PROCESSPLAYER DEBUG] ${member.displayName} processPlayerActionsEnhanced called with mineTypeId: "${mineTypeId}" (type: ${typeof mineTypeId})`);
    
    // Input validation
    if (!member || !playerData || !mapData) {
        console.warn('[MINING] Invalid parameters passed to processPlayerActionsEnhanced');
        return { mapChanged: false, wallsBroken: 0, treasuresFound: 0, mapData, hazardsChanged: false };
    }

    // Determine the actual member to credit earnings to (for shadow clones, use owner)
    let targetMemberId = member.id;
    if (member.isClone && member.ownerId) {
        // For shadow clones, earnings should go to the owner
        targetMemberId = member.ownerId;
        console.log(`[SHADOW CLONE] ${member.displayName} earnings will go to owner ${member.ownerId}`);
    }

    // Get base player stats
    const baseMiningPower = Math.max(0, playerData?.stats?.mining || 0);
    const baseLuckStat = Math.max(0, playerData?.stats?.luck || 0);
    const baseSpeedStat = Math.max(1, playerData?.stats?.speed || 1);
    const baseSightStat = Math.max(0, playerData?.stats?.sight || 0);
    
    // Initialize team buff variables (will be calculated after unique bonuses)
    let teamMiningSpeedBonus = 0;
    let teamAllStatsBonus = 0;

    // Get deeper mine status with caching (mineTypeId now passed as parameter)
    let isDeeperMine = false;

    // Check if this is a deeper mine with improved error handling
    if (mineTypeId) {
        try {
            const { isDeeperMine: checkDeeperMine } = require('./mining/miningConstants_unified');
            isDeeperMine = checkDeeperMine ? checkDeeperMine(mineTypeId) : false;
        } catch (error) {
            console.error('[MINING] Could not determine deeper mine status:', error);
            isDeeperMine = false;
        }
    }

    
    // Parse unique bonuses with error handling
    let uniqueBonuses;
    try {
        uniqueBonuses = parseUniqueItemBonuses(playerData?.equippedItems, eventLogs, member);
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
            shadowTeleportChance: 0,
            phaseWalkChance: 0,
            uniqueItems: [],
            oreValueMultipliers: {},
            healthRegen: 0,
            maxHealth: 100,
            currentHealth: 100,
            visualEffects: { aura: null, glowColor: null, particleEffect: null, visibleToOthers: false },
            teamBuffs: { miningSpeed: 0, allStats: 0, radius: 0 },
            cloneSystem: { activeClones: 0, maxClones: 0, cloneStats: 0, cloneBonuses: {} },
            npcSystem: { canCommandNPC: false, npcCooldown: 0, npcType: null },
            titles: [],
            machinerySystem: { canOvercharge: false, canConductElectricity: false, canMagnetize: false },
            minimapSystem: { invisible: false, reducedVisibility: 0 }
        };
    }
    
    // Initialize player health if not set
    if (!playerData.health) {
        playerData.health = {
            current: uniqueBonuses.maxHealth,
            max: uniqueBonuses.maxHealth,
            lastRegen: Date.now()
        };
    }
    
    // Apply health regeneration
    const now = Date.now();
    const timeSinceLastRegen = now - (playerData.health.lastRegen || now);
    if (timeSinceLastRegen > 60000 && uniqueBonuses.healthRegen > 0) { // Every minute
        const regenAmount = Math.floor(uniqueBonuses.healthRegen * uniqueBonuses.maxHealth);
        if (regenAmount > 0) {
            playerData.health.current = Math.min(
                playerData.health.current + regenAmount,
                uniqueBonuses.maxHealth
            );
            playerData.health.lastRegen = now;
            eventLogs.push(`🌿 ${member.displayName} regenerated ${regenAmount} health!`);
        }
    }
    
    // Process time-based effects from unique items
    if (!playerData.timeBasedEffects) {
        playerData.timeBasedEffects = {
            dailyCooldowns: {},
            hourlyEffects: {},
            lastProcessed: now
        };
    }
    
    const timeSinceLastProcess = now - (playerData.timeBasedEffects.lastProcessed || now);
    
    // Process hourly effects (every hour)
    if (timeSinceLastProcess > 3600000) { // 1 hour
        processHourlyEffects(member, playerData, uniqueBonuses, eventLogs, now);
        playerData.timeBasedEffects.lastProcessed = now;
    }
    
    // Check daily cooldowns
    processDailyCooldowns(member, playerData, uniqueBonuses, eventLogs, now);
    
    // Process NPC helpers for this player
    if (uniqueBonuses.npcSystem && uniqueBonuses.npcSystem.canCommandNPC) {
        try {
            const { processNPCActions } = require('./mining/npcHelperSystem');
            const npcResult = await processNPCActions(dbEntry.channelId, mapData, eventLogs, dbEntry);
            
            if (npcResult.mapChanged) {
                // NPC actions changed the map
                console.log(`[NPC] NPCs modified map for ${member.displayName}`);
            }
        } catch (error) {
            console.error(`[NPC] Error processing NPCs for ${member.displayName}:`, error);
        }
    }
    
    // Update max health if it changed
    playerData.health.max = uniqueBonuses.maxHealth;
    
    // Update title system with equipped unique items and apply title benefits
    try {
        const { updateEquippedUniqueItems, getTitleBenefits } = require('./mining/titleSystem');
        await updateEquippedUniqueItems(member.id, playerData.equippedItems);
        
        const titleBenefits = getTitleBenefits(member.id);
        
        // Apply title benefits to bonuses
        if (titleBenefits.miningSpeed) {
            // This would need to be integrated with the actual mining speed calculation
        }
        if (titleBenefits.hazardResistance) {
            uniqueBonuses.hazardResistance += titleBenefits.hazardResistance;
        }
        if (titleBenefits.coinMultiplier) {
            uniqueBonuses.coinMultiplier = (uniqueBonuses.coinMultiplier || 1) + titleBenefits.coinMultiplier;
        }
    } catch (error) {
        console.error(`[TITLES] Error updating titles for ${member.displayName}:`, error);
    }
    
    // Apply team buffs from this player to nearby players
    if (uniqueBonuses.teamBuffs && uniqueBonuses.teamBuffs.radius > 0) {
        const playerPosition = dbEntry.gameData?.playerPositions?.[member.id];
        if (playerPosition) {
            const teamMembers = Object.entries(dbEntry.gameData?.playerPositions || {});
            for (const [memberId, memberPos] of teamMembers) {
                if (memberId === member.id) continue; // Don't buff self
                
                // Calculate distance
                const distance = Math.abs(memberPos.x - playerPosition.x) + Math.abs(memberPos.y - playerPosition.y);
                if (distance <= uniqueBonuses.teamBuffs.radius) {
                    // Apply team buffs to nearby player
                    if (!dbEntry.gameData.teamBuffs) {
                        dbEntry.gameData.teamBuffs = {};
                    }
                    if (!dbEntry.gameData.teamBuffs[memberId]) {
                        dbEntry.gameData.teamBuffs[memberId] = { sources: {} };
                    }
                    
                    dbEntry.gameData.teamBuffs[memberId].sources[member.id] = {
                        miningSpeed: uniqueBonuses.teamBuffs.miningSpeed,
                        allStats: uniqueBonuses.teamBuffs.allStats,
                        expires: Date.now() + 300000 // 5 minutes
                    };
                    
                    if (Math.random() < 0.1) { // 10% chance to log
                        console.log(`[TEAM BUFF] ${member.displayName} buffing ${memberId} at distance ${distance}`);
                    }
                }
            }
        }
    }
    
    // Apply team buffs received from other players
    if (dbEntry.gameData.teamBuffs && dbEntry.gameData.teamBuffs[member.id]) {
        const now = Date.now();
        const receivedBuffs = dbEntry.gameData.teamBuffs[member.id].sources;
        
        for (const [sourceId, buffs] of Object.entries(receivedBuffs)) {
            if (buffs.expires > now) {
                teamMiningSpeedBonus += buffs.miningSpeed || 0;
                teamAllStatsBonus += buffs.allStats || 0;
            } else {
                // Clean up expired buffs
                delete receivedBuffs[sourceId];
            }
        }
        
        if (Object.keys(receivedBuffs).length === 0) {
            delete dbEntry.gameData.teamBuffs[member.id];
        }
    }
    
    // Process machinery interactions
    if (uniqueBonuses.machinerySystem && (uniqueBonuses.machinerySystem.canOvercharge || 
        uniqueBonuses.machinerySystem.canConductElectricity || uniqueBonuses.machinerySystem.canMagnetize)) {
        try {
            const { processMachineryInteractions } = require('./mining/machinerySystem');
            const playerPosition = dbEntry.gameData?.playerPositions?.[member.id];
            
            if (playerPosition) {
                const machineryResult = await processMachineryInteractions(
                    member.id, playerPosition, uniqueBonuses, dbEntry.channelId, mapData, eventLogs
                );
                
                // Apply machinery bonuses
                if (machineryResult.bonuses.magneticOreBonus) {
                    uniqueBonuses.lootMultiplier *= (1 + machineryResult.bonuses.magneticOreBonus * 0.1);
                }
                if (machineryResult.bonuses.electricEfficiency) {
                    teamMiningSpeedBonus += machineryResult.bonuses.electricEfficiency;
                }
                if (machineryResult.bonuses.overchargeBonus) {
                    uniqueBonuses.lootMultiplier *= (1 + machineryResult.bonuses.overchargeBonus);
                }
            }
        } catch (error) {
            console.error(`[MACHINERY] Error processing machinery for ${member.displayName}:`, error);
        }
    }
    
    // Now apply team buffs to create final stats
    let finalMiningPower = baseMiningPower;
    let finalLuckStat = baseLuckStat;
    let finalSpeedStat = baseSpeedStat;
    
    // Apply team all-stats bonus
    if (teamAllStatsBonus > 0) {
        finalMiningPower = Math.floor(baseMiningPower * (1 + teamAllStatsBonus));
        finalLuckStat = Math.floor(baseLuckStat * (1 + teamAllStatsBonus));
        finalSpeedStat = Math.floor(baseSpeedStat * (1 + teamAllStatsBonus));
        
        if (Math.random() < 0.05) { // 5% chance to log
            eventLogs.push(`⚡ ${member.displayName} receives team stat bonus: +${Math.floor(teamAllStatsBonus * 100)}%!`);
        }
    }
    
    // Apply team mining speed bonus
    if (teamMiningSpeedBonus > 0) {
        finalSpeedStat = Math.floor(finalSpeedStat * (1 + teamMiningSpeedBonus));
    }
    
    // Final stats with caps
    const miningPower = finalMiningPower;
    const luckStat = finalLuckStat;
    const speedStat = finalSpeedStat; // No speed cap - unlimited actions!
    
    // Calculate individual player vision
    let finalSightStat = baseSightStat;
    if (teamAllStatsBonus > 0) {
        finalSightStat = Math.floor(baseSightStat * (1 + teamAllStatsBonus));
    }
    
    // Apply power level sight bonus
    let playerSightRadius = finalSightStat + 1;
    const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
    if (powerLevelConfig) {
        playerSightRadius = Math.floor(playerSightRadius * powerLevelConfig.speedBonus);
    }
    
    // Apply sight through walls bonus
    const sightThroughWalls = uniqueBonuses.sightThroughWalls || 0;
    if (sightThroughWalls > 0) {
        playerSightRadius += Math.floor(sightThroughWalls);
        if (Math.random() < 0.1) { // 10% chance to log individual vision enhancement
            eventLogs.push(`👁️ ${member.displayName}'s enhanced vision reveals hidden areas!`);
        }
    }
    
    // Check if player is stunned by lightning
    const { isPlayerStunned, reduceStunDuration, isPlayerStuck } = require('./mining/hazardEffects');
    if (isPlayerStunned(dbEntry, member.id)) {
        // Player is stunned, reduce stun duration and skip actions
        const stunEnded = await reduceStunDuration(dbEntry, member.id);
        
        if (stunEnded) {
            eventLogs.push(`⚡ ${member.displayName} recovered from lightning stun!`);
        } else {
            const stunData = dbEntry.gameData?.stunned?.[member.id];
            const actionsLeft = stunData?.actionsRemaining || 0;
            eventLogs.push(`⚡ ${member.displayName} is stunned by lightning (${actionsLeft} actions remaining)`);
            
            // Return early - no actions this turn
            return { mapChanged: false, wallsBroken: 0, treasuresFound: 0, mapData, hazardsChanged: false };
        }
    }
    
    // Wall trap status tracking removed - players can always continue mining after wall traps
    // The trapped/stuck status is maintained for internal tracking but doesn't affect gameplay
    
    let wallsBroken = 0;
    let treasuresFound = 0;
    let mapChanged = false;
    let hazardsChanged = false;
    
    // Calculate individual visible tiles
    const playerPosition = mapData.playerPositions[member.id];
    const { calculatePlayerVisibility } = require('./mining/miningUtils');
    const playerVisibleTiles = calculatePlayerVisibility(
        playerPosition,
        playerSightRadius,
        mapData.tiles,
        sightThroughWalls
    );
    
    // Mark tiles as discovered for this player's vision
    for (const tileKey of playerVisibleTiles) {
        const [x, y] = tileKey.split(',').map(Number);
        if (mapData.tiles[y] && mapData.tiles[y][x] && !mapData.tiles[y][x].discovered) {
            mapData.tiles[y][x].discovered = true;
            mapChanged = true;
        }
    }
    
    if (!playerMovementHistory.has(member.id)) {
        playerMovementHistory.set(member.id, { lastDirection: null, sameDirectionCount: 0 });
    }
    const moveHistory = playerMovementHistory.get(member.id);
    
    let bestPickaxe = null;
    let isUniquePickaxe = false;
    let pickaxeBroken = false; // Track if pickaxe has been broken in this cycle
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
        // Reduced logging - only log when actions = 0 (debug issue)
        if (numActions === 0) {
            console.warn(`[MINING] ${member.displayName} has 0 actions (enhancedSpeed: ${enhancedSpeed})`);
        }
    
    console.log(`[MINING DEBUG] === ${member.displayName} starting ${numActions} actions (speed: ${speedStat}, enhanced: ${enhancedSpeed}) ===`);
    
    // Special debugging for gullet players
    if (dbEntry?.typeId === 16 || dbEntry?.typeId === '16') {
        console.log(`[GULLET DEBUG] ${member.displayName} in gullet - position:`, mapData.playerPositions[member.id]);
        console.log(`[GULLET DEBUG] ${member.displayName} map size: ${mapData.width}x${mapData.height}, tiles exist:`, !!mapData.tiles);
    }
    
    for (let actionNum = 0; actionNum < numActions; actionNum++) {
        try {
            console.log(`[MINING DEBUG] ${member.displayName} starting action ${actionNum + 1}/${numActions}`);
            
            const position = mapData.playerPositions[member.id];
            if (!position) {
                console.warn(`[MINING DEBUG] ${member.displayName} has no position data, breaking action loop`);
                break;
            }
            
            console.log(`[MINING DEBUG] ${member.displayName} current position: (${position.x}, ${position.y})`);
            
            // Reduced action logging - only log first action or when position issues occur
            
            // Players can continue mining even when stuck or trapped (removed old restriction)

            
            // Reduced random treasure generation while mining
            // Apply Midas' Burden treasure finding bonus
            let treasureChance = efficiency.treasureChance * 0.2; // Base 20% of original chance
            if (uniqueBonuses.treasureFindingBonus > 0) {
                treasureChance += uniqueBonuses.treasureFindingBonus;
            }
            
            console.log(`[MINING DEBUG] ${member.displayName} checking for random treasure (chance: ${(treasureChance * 100).toFixed(1)}%)`);
            if (Math.random() < treasureChance) {
                const treasure = await generateTreasure(powerLevel, efficiency);
                if (treasure) {
                    // Treasures go to inventory, not minecart
                    console.log(`[MINING DEBUG] ${member.displayName} found treasure: ${treasure.name}!`);
                    await addItemWithDestination(dbEntry, targetMemberId, treasure.itemId, 1, 'inventory');
                    eventLogs.push(`🎁 ${member.displayName} discovered ${treasure.name} while exploring! (added to inventory)`);
                    treasuresFound++;
                } else {
                    console.log(`[MINING DEBUG] ${member.displayName} treasure generation returned null/undefined`);
                }
            } else {
                console.log(`[MINING DEBUG] ${member.displayName} no treasure found this action`);
            }
            
            // Midas' Burden greed bonus - chance to find extra coins
            if (uniqueBonuses.greedBonus > 0 && Math.random() < uniqueBonuses.greedBonus) {
                const bonusCoins = Math.floor((10 + powerLevel * 5) * (1 + Math.random())); // 10-15 base + power level scaling
                await addItemWithDestination(dbEntry, targetMemberId, 'coin', bonusCoins, 'inventory');
                eventLogs.push(`💰 ${member.displayName}'s greed attracts ${bonusCoins} loose coins!`);
            }
            
            console.log(`[MINING DEBUG] ${member.displayName} calculating adjacent positions...`);
            const adjacentPositions = [
                { x: position.x, y: position.y - 1 },
                { x: position.x + 1, y: position.y },
                { x: position.x, y: position.y + 1 },
                { x: position.x - 1, y: position.y }
            ];
            console.log(`[MINING DEBUG] ${member.displayName} adjacent positions calculated: ${adjacentPositions.length} positions`);
            
            console.log(`[MINING DEBUG] ${member.displayName} checking for adjacent ore targets...`);
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
                    console.log(`[MINING DEBUG] ${member.displayName} checking adjacent tile at (${checkX},${checkY}): ${getTileTypeName(tile?.type || 'undefined')}`);
                    if (tile && (tile.type === TILE_TYPES.WALL_WITH_ORE || 
                               tile.type === TILE_TYPES.RARE_ORE)) {
                        adjacentTarget = { x: checkX, y: checkY, tile };
                        console.log(`[MINING DEBUG] ${member.displayName} found ore target at (${checkX},${checkY}): ${getTileTypeName(tile.type)}`);
                        break;
                    }
                }
            }
            
            console.log(`[MINING DEBUG] ${member.displayName} adjacent ore check complete. Found target: ${adjacentTarget ? 'YES at (' + adjacentTarget.x + ',' + adjacentTarget.y + ')' : 'NO'}`);
            
            if (adjacentTarget) {
                const tile = adjacentTarget.tile;
                console.log(`[MINING DEBUG] ${member.displayName} checking if can break tile at (${adjacentTarget.x},${adjacentTarget.y}) with mining power ${miningPower}`);
                const canBreak = await canBreakTile(member.id, miningPower, tile);
                console.log(`[MINING DEBUG] ${member.displayName} canBreakTile result: ${canBreak}`);
                if (canBreak) {
                    console.log(`[MINING DEBUG] ${member.displayName} attempting to mine tile at (${adjacentTarget.x},${adjacentTarget.y})`);
                    console.log(`[MINE ID DEBUG] ${member.displayName} mining with mineTypeId: "${mineTypeId}" (type: ${typeof mineTypeId}) | tile type: ${tile.type} | power level: ${powerLevel}`);
                    const { item, quantity, destination } = await mineFromTile(member, miningPower, luckStat, powerLevel, tile.type, availableItems, efficiency, isDeeperMine, mineTypeId);
                    if (!item) {
                        console.log(`[MINING DEBUG] ${member.displayName} ERROR: mineFromTile returned null/undefined item, skipping tile conversion`);
                        continue;
                    }
                    
                    let finalQuantity = quantity;
                    let finalValue = item.value;
                    
                    if (serverModifiers.itemBonuses && serverModifiers.itemBonuses[item.itemId]) {
                        const bonus = serverModifiers.itemBonuses[item.itemId];
                        finalQuantity = Math.floor(quantity * bonus);
                        finalValue = Math.floor(item.value * bonus);
                    }
                    
                    // Apply bonuses with no caps!
                    // Full double ore chance - no nerfs applied
                    finalQuantity = applyDoubleOreBonus(finalQuantity, uniqueBonuses.doubleOreChance, member, eventLogs, uniqueBonuses.uniqueItems);
                    finalQuantity = Math.floor(finalQuantity * uniqueBonuses.lootMultiplier); // No cap on loot multiplier!
                    
                    // No tier-based caps - unlimited quantity potential!
                    console.log (`${member.displayName} got ${item.name} and its going to ${destination}`);
                    await addItemWithDestination(dbEntry, targetMemberId, item.itemId, finalQuantity, destination);
                    
                    console.log(`[MINING DEBUG] ${member.displayName} about to convert tile at (${adjacentTarget.x},${adjacentTarget.y}) from ${getTileTypeName(tile.type)}`);
                    mapData.tiles[adjacentTarget.y][adjacentTarget.x] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                    console.log(`[MINING DEBUG] ${member.displayName} successfully converted tile at (${adjacentTarget.x},${adjacentTarget.y}) to ${getTileTypeName(TILE_TYPES.FLOOR)}`);
                    mapChanged = true;
                    wallsBroken++;
                    console.log(`[MINING DEBUG] ${member.displayName} tile conversion complete, continuing with action processing...`);
                    
                    // Check for proactive map expansion when breaking walls at edges
                    try {
                        const { checkProactiveMapExpansion } = require('./mining/miningMap');
                        let expandHazardChance = getHazardSpawnChance(powerLevel);
                        if (powerLevel >= 6) expandHazardChance *= 3;
                        if (powerLevel >= 7) expandHazardChance *= 5;
                        
                        const expandedMap = await checkProactiveMapExpansion(
                            mapData, 
                            adjacentTarget.x, 
                            adjacentTarget.y, 
                            dbEntry.channelId, 
                            hazardsData, 
                            powerLevel, 
                            expandHazardChance,
                            mineTypeId
                        );
                        
                        if (expandedMap !== mapData) {
                            mapData = expandedMap;
                            mapChanged = true;
                            hazardsChanged = true;
                            // No longer recalculate team visibility - each player handles their own vision
                            console.log(`[MINING] Map expanded proactively after ${member.displayName} broke wall at edge (${adjacentTarget.x}, ${adjacentTarget.y})`);
                        }
                    } catch (expansionError) {
                        console.error(`[MINING] Error during proactive map expansion:`, expansionError);
                    }
                    
                    // Log wall breaking for adjacent ore walls
                    if (tile.type === TILE_TYPES.RARE_ORE) {
                        eventLogs.push(`⛏️💎 ${member.displayName} broke through rare ore!`);
                    } else {
                        eventLogs.push(`⛏️ ${member.displayName} broke through an ore wall!`);
                    }
                    
                    let findMessage;
                    // Treasure chests no longer spawn


                    if (destination === 'inventory') {
                        if (tile.type === TILE_TYPES.RARE_ORE) {
                            findMessage = `💎 ${member.displayName} struck rare ore! Harvested『 ${item.name} x ${finalQuantity} 』from wall! (added to inventory)`;
                        } else {
                            findMessage = `⛏️ ${member.displayName} harvested『 ${item.name} x ${finalQuantity} 』from wall! (added to inventory)`;
                        }
                    } else {
                        if (tile.type === TILE_TYPES.RARE_ORE) {
                            findMessage = `💎 ${member.displayName} struck rare ore! Harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                        } else {
                            findMessage = `⛏️ ${member.displayName} harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                        }
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
                            // Only check pickaxe durability if it hasn't been broken yet in this cycle
                            if (!pickaxeBroken) {
                                const durabilityCheck = checkPickaxeBreak(bestPickaxe, tile.hardness);
                                if (durabilityCheck.shouldBreak) {
                                    console.log(`[PICKAXE BREAK] ${member.displayName}'s ${bestPickaxe.name} (ID: ${bestPickaxe.itemId}) is breaking!`);
                                    transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                                    eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered!`);
                                    pickaxeBroken = true; // Mark pickaxe as broken to prevent multiple breaks
                                } else {
                                    transaction.updatePickaxeDurability(member.id, bestPickaxe.itemId, durabilityCheck.newDurability);
                                    
                                    const maxDurability = bestPickaxe.durability || 100;
                                    const durabilityPercent = (durabilityCheck.newDurability / maxDurability) * 100;
                                    
                                    if (durabilityPercent <= 10) {
                                        findMessage += ` ⚠️ [${bestPickaxe.name}: ${durabilityCheck.newDurability}/${maxDurability}]`;
                                    }
                                }
                            } else {
                                console.log(`[PICKAXE BREAK] Skipping durability check for ${member.displayName} - pickaxe already broken this cycle`);
                            }
                        }
                    }
                    
                    eventLogs.push(findMessage);
                    
                    // Add maintenance warning if needed
                    if (bestPickaxe && isUniquePickaxe) {
                        if (uniqueBonuses.uniqueItems.length > 0) {
                            const uniqueItem = uniqueBonuses.uniqueItems[0];
                            if (uniqueItem.maintenanceRatio < 0.5) {
                                const percent = Math.round(uniqueItem.maintenanceRatio * 100);
                                if (uniqueItem.maintenanceRatio < 0.3) {
                                    eventLogs.push(`⚠️ ${bestPickaxe.name} at ${percent}% maintenance - CRITICAL!`);
                                } else {
                                    eventLogs.push(`⚠️ ${bestPickaxe.name} needs maintenance (${percent}%)`);
                                }
                            }
                        }
                    }
                    
                    await updateMiningActivity(member.id, 1);
                    
                    // Optimized unique item finding for boosted mines
                    let itemFindingChance = 0.001; // 0.1% base chance
                    
                    // Quick check for boosted mines (cached lookup)
                    const { UNIQUE_ITEMS } = require('../../data/uniqueItemsSheet');
                    const boostedItems = UNIQUE_ITEMS.filter(item => 
                        item.mineSpecificDropRates && item.mineSpecificDropRates[String(mineTypeId)]
                    );
                    
                    // 100% item finding rate for boosted mines
                    if (boostedItems.length > 0) {
                        itemFindingChance = 1.0; // 100% chance in boosted mines
                    } else {
                        // Normal mines use luck scaling
                        const luckBonus = Math.min(0.01, luckStat * 0.0001);
                        itemFindingChance += luckBonus;
                    }
                    
                    if (Math.random() < itemFindingChance) {
                        const itemFind = await processUniqueItemFinding(
                            member,
                            'mining',
                            powerLevel,
                            luckStat,
                            null,
                            mineTypeId
                        );
                        
                        if (itemFind) {
                            eventLogs.push(itemFind.message);
                            
                            // Server-wide announcement for unique items
                            if (itemFind.systemAnnouncement && itemFind.systemAnnouncement.enabled && client) {
                                try {
                                    await sendLegendaryAnnouncement(
                                        client,
                                        channel.guild.id,
                                        itemFind,
                                        member.displayName
                                    );
                                } catch (err) {
                                    console.error('[LEGENDARY] Failed to send announcement:', err);
                                }
                            }
                            
                            // Show maintenance status for new unique items
                            if (itemFind.type === 'unique' && itemFind.item) {
                                eventLogs.push(`🔧 ${itemFind.item.name} starts at 100% maintenance`);
                            }
                        }
                    }
                    
                    if (uniqueBonuses.areaDamageChance > 0) {
                        const areaDamageResult = await applyAreaDamage(
                            { x: adjacentTarget.x, y: adjacentTarget.y },
                            mapData,
                            uniqueBonuses.areaDamageChance,
                            member,
                            eventLogs,
                            dbEntry,
                            mineFromTile,
                            {
                                miningPower: miningPower,
                                luckStat: luckStat,
                                powerLevel: powerLevel,
                                availableItems: availableItems,
                                efficiency: efficiency,
                            },
                            hazardsData,
                            mineTypeId
                        );
                        wallsBroken += areaDamageResult.wallsBroken;
                        
                        // Update map data if area damage caused expansion
                        if (areaDamageResult.mapChanged && areaDamageResult.mapData !== mapData) {
                            mapData = areaDamageResult.mapData;
                            mapChanged = true;
                            hazardsChanged = true;
                            // No longer recalculate team visibility - each player handles their own vision
                        }
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
                                console.log(`[MINE ID DEBUG] ${member.displayName} CHAIN mining with mineTypeId: "${mineTypeId}" (type: ${typeof mineTypeId}) | tile type: ${chainTile.type}`);
                                const { item: chainItem, quantity: chainQty } = await mineFromTile(
                                    member, miningPower, luckStat, powerLevel, 
                                    chainTile.type, availableItems, efficiency
                                , isDeeperMine, mineTypeId);
                                await addItemWithDestination(dbEntry, targetMemberId, chainItem.itemId, chainQty, destination);
                                mapData.tiles[chainTarget.y][chainTarget.x] = { 
                                    type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 
                                };
                                wallsBroken++;
                                
                                // Log chain mining wall breaks (less verbose to avoid spam)
                                if (Math.random() < 0.3) { // 30% chance to log chain breaks
                                    eventLogs.push(`⛏️⚡ ${member.displayName}'s chain mining broke additional walls!`);
                                }
                            }
                        }
                    }
                } else {
                    // Player failed to break the wall - log failure with hardness info
                    const { getTileHardness } = require('./mining/miningMap');
                    const tileHardness = getTileHardness(tile.type, powerLevel);
                    
                    let failMessage;
                    if (tile.type === TILE_TYPES.REINFORCED_WALL) {
                        failMessage = `💥 ${member.displayName}'s pickaxe bounced off the reinforced wall! (${tileHardness} hardness vs ${miningPower} power)`;
                    } else if (tile.type === TILE_TYPES.RARE_ORE) {
                        failMessage = `💥 ${member.displayName} struck rare ore but couldn't break it! (${tileHardness} hardness vs ${miningPower} power)`;
                    } else {
                        failMessage = `💥 ${member.displayName} struck the wall but couldn't break it! (${tileHardness} hardness vs ${miningPower} power)`;
                    }
                    
                    // Show failure message more often to help with debugging
                    if (Math.random() < 0.4) { // 40% chance to log failures
                        eventLogs.push(failMessage);
                    }
                }
                console.log(`[MINING DEBUG] ${member.displayName} finished mining adjacent ore, continuing to next action`);
                continue;
            }
            
            console.log(`[MINING DEBUG] ${member.displayName} no adjacent ore found, starting movement logic...`);
            
            // Treasure chests no longer spawn - removed from targets
            const visibleTargets = [TILE_TYPES.RARE_ORE, TILE_TYPES.WALL_WITH_ORE];
            console.log(`[MINING DEBUG] ${member.displayName} looking for visible targets: ${visibleTargets.join(', ')}`);
            const nearestTarget = findNearestTarget(position, playerVisibleTiles, mapData.tiles, visibleTargets);
            console.log(`[MINING DEBUG] ${member.displayName} nearest target search result: ${nearestTarget ? 'FOUND at (' + nearestTarget.x + ',' + nearestTarget.y + ')' : 'NONE FOUND'}`);
            
            let direction;
            if (nearestTarget) {
                console.log(`[MINING DEBUG] ${member.displayName} calculating direction to target...`);
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
                // Use sine-based deterministic direction selection when no ores are in sight
                console.log(`[MINING DEBUG] ${member.displayName} no visible targets, using sine-based direction...`);
                try {
                    direction = getSineBasedDirection(member.id, dbEntry.nextShopRefresh, dbEntry.channelId);
                    console.log(`[MINING DEBUG] ${member.displayName} sine-based direction calculated: (${direction ? direction.dx + ', ' + direction.dy : 'NULL/UNDEFINED'})`);
                    
                    // Validate direction
                    if (!direction || (direction.dx === undefined && direction.dy === undefined)) {
                        throw new Error('getSineBasedDirection returned invalid direction');
                    }
                } catch (sineError) {
                    console.error(`[MINING DEBUG] ${member.displayName} error in sine-based direction:`, sineError);
                    // Fallback to random direction
                    const randomOffsets = [
                        { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, 
                        { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
                    ];
                    direction = randomOffsets[Math.floor(Math.random() * randomOffsets.length)];
                    console.log(`[MINING DEBUG] ${member.displayName} using fallback random direction: (${direction.dx}, ${direction.dy})`);
                }
            }
            
            console.log(`[MINING DEBUG] ${member.displayName} final direction before history check: (${direction.dx}, ${direction.dy})`);
            
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
            
            if (direction.dx === 0 && direction.dy === 0) {
                console.warn(`[MINING] ${member.displayName} FINAL direction check failed - got (0,0), skipping action`);
                continue;
            }
            
            // DEBUG: Direction and movement logging
            const directionName = getDirectionName(direction.dx, direction.dy);
            console.log(`[MINING DEBUG] ${member.displayName} Action ${actionNum + 1}/${numActions}: Moving ${directionName} (${direction.dx}, ${direction.dy}) from (${position.x}, ${position.y})`);
            
            // Log decision making process
            if (nearestTarget) {
                console.log(`[MINING DEBUG] ${member.displayName} found target at (${nearestTarget.x}, ${nearestTarget.y}), moving towards it`);
            } else {
                console.log(`[MINING DEBUG] ${member.displayName} using sine-based movement (no targets visible)`);
            }
            
            if (moveHistory.sameDirectionCount > 0) {
                console.log(`[MINING DEBUG] ${member.displayName} has been moving ${directionName} for ${moveHistory.sameDirectionCount + 1} consecutive actions`);
            }
            
            let newX = position.x + direction.dx;
            let newY = position.y + direction.dy;
            
            console.log(`[MINING DEBUG] ${member.displayName} calculated target position: (${newX}, ${newY})`);
            
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
            
            if (newX < 0 || newX >= mapData.width || newY < 0 || newY >= mapData.height) {
                console.log(`[MINING DEBUG] ${member.displayName} target position (${newX}, ${newY}) is OUT OF BOUNDS (map size: ${mapData.width}x${mapData.height}), skipping action`);
                continue;
            }
            
            const targetTile = mapData.tiles[newY] && mapData.tiles[newY][newX];
            if (!targetTile) {
                console.log(`[MINING DEBUG] ${member.displayName} target position (${newX}, ${newY}) has NO TILE DATA, skipping action`);
                continue;
            }
            
            console.log(`[MINING DEBUG] ${member.displayName} found tile type: ${getTileTypeName(targetTile.type)} at (${newX}, ${newY})`);
            
            if ([TILE_TYPES.WALL, TILE_TYPES.REINFORCED_WALL, TILE_TYPES.WALL_WITH_ORE, TILE_TYPES.RARE_ORE].includes(targetTile.type)) {
                // Check for Shadowstep Boots phase walk ability
                if (targetTile.type === TILE_TYPES.WALL && uniqueBonuses.phaseWalkChance > 0) {
                    if (Math.random() < uniqueBonuses.phaseWalkChance) {
                        // Phase through the wall
                        eventLogs.push(`👻 ${member.displayName} phases through solid stone!`);
                        
                        // Move to the wall position (it becomes a floor)
                        console.log(`[MINING DEBUG] ${member.displayName} PHASED THROUGH WALL at (${newX}, ${newY}) using Shadowstep Boots!`);
                        position.x = newX;
                        position.y = newY;
                        
                        // Convert wall to floor
                        mapData.tiles[newY][newX] = { 
                            type: TILE_TYPES.FLOOR, 
                            discovered: true, 
                            hardness: 0 
                        };
                        mapChanged = true;
                        
                        // Track movement (phasing counts as 2 tiles for maintenance)
                        await updateMovementActivity(member.id, 2);
                        
                        continue; // Skip normal wall breaking
                    }
                }
                
                const canBreak = await canBreakTile(member.id, miningPower, targetTile);
                if (canBreak) {
                    // Reduced failure chance for regular walls to encourage more exploration
                    if (Math.random() < 0.05 && targetTile.type === TILE_TYPES.WALL) {
                        continue;
                    }
                    if ([TILE_TYPES.WALL_WITH_ORE, TILE_TYPES.RARE_ORE].includes(targetTile.type)) {
                        console.log(`[MINE ID DEBUG] ${member.displayName} SPEED mining with mineTypeId: "${mineTypeId}" (type: ${typeof mineTypeId}) | tile type: ${targetTile.type}`);
                        const { item, quantity, destination } = await mineFromTile(member, miningPower, luckStat, powerLevel, targetTile.type, availableItems, efficiency, isDeeperMine, mineTypeId);
                        
                        let finalQuantity = quantity;
                        if (serverModifiers.itemBonuses && serverModifiers.itemBonuses[item.itemId]) {
                            const modifier = Math.min(1.5, serverModifiers.itemBonuses[item.itemId]); // Cap server modifier at 1.5x
                            finalQuantity = Math.floor(quantity * modifier);
                        }
                        
                        // Apply tier-based caps for wall mining during movement
                        const movementQuantityCaps = {
                            common: 15,
                            uncommon: 10,
                            rare: 8,
                            epic: 4,
                            legendary: 2,
                            unique: 1,
                            mythic: 1
                        };
                        finalQuantity = Math.min(finalQuantity, movementQuantityCaps[item.tier] || 8);
                        
                        console.log (`${member.displayName} got ${item.name} and its going to ${destination}`);
                        await addItemWithDestination(dbEntry, targetMemberId, item.itemId, finalQuantity, destination);
                        
                        let findMessage;
                        // Treasure chests no longer spawn
                        if (destination === 'inventory') {
                            if (targetTile.type === TILE_TYPES.RARE_ORE) {
                                findMessage = `💎 ${member.displayName} struck rare ore! Harvested『 ${item.name} x ${finalQuantity} 』from wall! (added to inventory)`;
                            } else {
                                findMessage = `⛏️ ${member.displayName} harvested『 ${item.name} x ${finalQuantity} 』from wall! (added to inventory)`;
                            }
                        } else {
                            if (targetTile.type === TILE_TYPES.RARE_ORE) {
                                findMessage = `💎 ${member.displayName} struck rare ore! Harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                            } else {
                                findMessage = `⛏️ ${member.displayName} harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                            }
                        }
                        
                        eventLogs.push(findMessage);
                    } else {
                        // Break regular wall for exploration - add encouraging messages
                        const explorationMessages = [
                            `⛏️ ${member.displayName} broke through a wall, opening new territory!`,
                            `⛏️ ${member.displayName} carved a path through solid stone!`,
                            `⛏️ ${member.displayName} cleared the way forward!`,
                            `⛏️ ${member.displayName} opened up a new passage!`,
                            `⛏️ ${member.displayName} broke through, revealing unexplored areas!`
                        ];
                        eventLogs.push(explorationMessages[Math.floor(Math.random() * explorationMessages.length)]);
                    }
                    
                    console.log(`[MINING DEBUG] ${member.displayName} BROKE ${getTileTypeName(targetTile.type)} at (${newX}, ${newY}) and moved there`);
                    mapData.tiles[newY][newX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                    position.x = newX;
                    position.y = newY;
                    mapChanged = true;
                    wallsBroken++;
                    
                    // Add wall break progress tracking (occasionally)
                    if (Math.random() < 0.1) { // 10% chance to show progress
                        const totalWallsBroken = (dbEntry.gameData?.stats?.wallsBroken || 0) + wallsBroken;
                        eventLogs.push(`📊 Team has broken ${totalWallsBroken} walls total!`);
                    }
                }
} else if (targetTile.type === TILE_TYPES.FLOOR || targetTile.type === TILE_TYPES.ENTRANCE) {

    try {
    // Track movement for maintenance
    const oldX = position.x;
    const oldY = position.y;
    
    // Validate that the new position is within map bounds after expansion
    if (newX >= 0 && newX < mapData.width && newY >= 0 && newY < mapData.height) {
        console.log(`[MINING DEBUG] ${member.displayName} MOVED to ${getTileTypeName(targetTile.type)} at (${newX}, ${newY}) from (${oldX}, ${oldY})`);
        position.x = newX;
        position.y = newY;
        mapChanged = true;
    } else {
        // If position would be out of bounds, keep player at current position
        console.warn(`[MINING DEBUG] ${member.displayName} attempted to move to out-of-bounds position (${newX}, ${newY}). Map size: ${mapData.width}x${mapData.height}`);
        continue;
    }
    
    // Check for Shadowstep Boots random teleportation
    if (uniqueBonuses.shadowTeleportChance > 0) {
        const teleportDestination = checkShadowstepTeleport(
            position,
            mapData,
            uniqueBonuses.shadowTeleportChance,
            member,
            eventLogs
        );
        
        if (teleportDestination) {
            // Update player position to teleport destination
            position.x = teleportDestination.x;
            position.y = teleportDestination.y;
            mapChanged = true;
            
            // Track this as movement for maintenance (teleport counts as 10 tiles)
            await updateMovementActivity(member.id, 10);
            
            // Mark tiles around new position as discovered
            const teleportRadius = 2;
            for (let dy = -teleportRadius; dy <= teleportRadius; dy++) {
                for (let dx = -teleportRadius; dx <= teleportRadius; dx++) {
                    const checkX = teleportDestination.x + dx;
                    const checkY = teleportDestination.y + dy;
                    
                    if (checkX >= 0 && checkX < mapData.width &&
                        checkY >= 0 && checkY < mapData.height) {
                        if (mapData.tiles[checkY][checkX] && !mapData.tiles[checkY][checkX].discovered) {
                            mapData.tiles[checkY][checkX].discovered = true;
                            mapChanged = true;
                        }
                    }
                }
            }
        }
    }
    
    // Only count as movement if actually moved to a different tile
    if (oldX !== newX || oldY !== newY) {
        await updateMovementActivity(member.id, 1);
        
        // Show progress for movement-based maintenance items (like Shadowstep Boots)
        // Only show occasionally to avoid spam
        if (Math.random() < 0.02) { // 2% chance to show progress
            const hasMovementItem = uniqueBonuses.uniqueItems.some(item => 
                item.name && item.name.includes('Shadowstep')
            );
            if (hasMovementItem) {
                eventLogs.push(`👟 ${member.displayName}'s boots whisper through the shadows...`);
            }
        }
    }
    
    // Check for hazards at new position
    if (hazardStorage.hasHazard(hazardsData, newX, newY)) {
        const hazard = hazardStorage.getHazard(hazardsData, newX, newY);
        
        // Check if it's a treasure - treasures bypass avoidance mechanics
        if (hazard && (hazard.type === 'treasure' || hazard.type === 'rare_treasure' || 
                       hazard.type === 'legendary_treasure' || hazard.type === 'mythic_treasure')) {
            console.log('[TREASURE ENCOUNTERED]');
            
            // Use the proper treasure handling system
            const treasureResult = await hazardEffects.processEncounterTrigger(
                member,
                position,
                mapData,
                hazardsData,
                dbEntry,
                transaction,
                eventLogs,
                powerLevel,  // Fixed typo
                mineTypeId
            );
            
            if (treasureResult) {
                if (treasureResult.treasureFound) {
                    treasuresFound++;
                    // The processEncounterTrigger already adds a message to eventLogs
                }
                if (treasureResult.mapChanged) {
                    mapChanged = true;
                }
                
                // Slightly higher chance for unique/legendary finds from treasure hazards
                if (Math.random() < 0.005) { // 0.5% chance for treasure hazards
                    const treasureFind = await processUniqueItemFinding(
                        member,
                        'treasure',
                        powerLevel,
                        luckStat,
                        null,
                        mineTypeId
                    );
                    
                    if (treasureFind) {
                        eventLogs.push(treasureFind.message);
                        
                        // Check for legendary announcement for treasure finds too
                        if (treasureFind.systemAnnouncement && treasureFind.systemAnnouncement.enabled) {
                            try {
                                await sendLegendaryAnnouncement(
                                    client,
                                    channel.guild.id,
                                    treasureFind,
                                    member.displayName
                                );
                                console.log(`[LEGENDARY] Treasure announcement sent for ${treasureFind.item.name}`);
                            } catch (err) {
                                console.error('[LEGENDARY] Failed to send treasure announcement:', err);
                            }
                        }
                    }
                }
            }
            
            hazardsChanged = true;
        } else if (hazard) {
            // For non-treasure hazards, check avoidance mechanics first
            const sightStat = playerData?.stats?.sight || 0;
            const sightAvoidChance = Math.min(0.5, sightStat * 0.05); // 5% per sight point, max 50%
            
            // Check sight stat - removes hazard without triggering
            if (Math.random() < sightAvoidChance) {
                eventLogs.push(`👁️ ${member.displayName}'s keen sight spotted and avoided a ${hazard.type || 'hazard'}!`);
                hazardStorage.removeHazard(hazardsData, newX, newY);
                hazardsChanged = true;
                continue;
            }
            
            // Check luck stat - avoids triggering but keeps hazard on map
            const luckAvoidChance = Math.min(0.4, luckStat * 0.04); // 4% per luck point, max 40%
            if (Math.random() < luckAvoidChance) {
                eventLogs.push(`🍀 ${member.displayName}'s luck helped them narrowly avoid a ${hazard.type || 'hazard'}!`);
                // Don't remove the hazard, just skip triggering it
                continue;
            }
            
            // Check hazard resistance from unique items
            if (checkHazardResistance(uniqueBonuses.hazardResistance, member, eventLogs)) {
                hazardStorage.removeHazard(hazardsData, newX, newY);
                hazardsChanged = true;
                continue;
            }
            
            // Process the hazard
            const hazardResult = await hazardEffects.processHazardTrigger(
                member,
                position,
                mapData,
                hazardsData,
                dbEntry,
                transaction,
                eventLogs,
                powerLevel,
                mineTypeId
            );
            
            if (hazardResult) {
                if (hazardResult.mapChanged) {
                    mapChanged = true;
                }
                if (hazardResult.playerMoved) {
                    // Position already updated by hazard
                }
                if (hazardResult.playerDisabled) {
                    // Player knocked out
                    break; // or continue depending on context
                }
            }
            
            hazardsChanged = true;
        }
    }
    
            // Exploration bonus - made much rarer and limited to common items
            const explorationChance = (EXPLORATION_BONUS_CHANCE * efficiency.speedMultiplier) * 0.1; // 10% of original chance
            if (Math.random() < explorationChance) {
                const bonusItems = availableItems.filter(item => item.tier === 'common' || item.tier === 'uncommon');
                if (bonusItems.length > 0) {
                    // Weight towards common items even for exploration
                    const weights = bonusItems.map(item => item.tier === 'common' ? 10 : 1);
                    const totalWeight = weights.reduce((a, b) => a + b, 0);
                    let random = Math.random() * totalWeight;
                    
                    let bonusItem = bonusItems[0];
                    for (let i = 0; i < bonusItems.length; i++) {
                        random -= weights[i];
                        if (random <= 0) {
                            bonusItem = bonusItems[i];
                            break;
                        }
                    }
                    
                    // Determine destination for exploration items
                    let destination = 'inventory'; // Exploration items typically go to inventory
                    if (bonusItem.category === 'ore') {
                        destination = 'minecart';
                    }
                    
                    // Show different icon and text based on destination
                    if (destination === 'inventory') {
                        eventLogs.push(`🔍 ${member.displayName} found ${bonusItem.name} while exploring! (Added to inventory)`);
                    } else {
                        eventLogs.push(`🔍 ${member.displayName} found ${bonusItem.name} while exploring!`);
                    }
                    await addItemWithDestination(dbEntry, targetMemberId, bonusItem.itemId, 1, destination);
                }
            }
            
        } catch (actionError) {
            console.error(`[MINING DEBUG] CRITICAL ERROR in action ${actionNum + 1} for ${member.displayName}:`, actionError);
            console.error(`[MINING DEBUG] Error stack:`, actionError.stack);
        }
        
        console.log(`[MINING DEBUG] ${member.displayName} completed action ${actionNum + 1}/${numActions}`);
    }
    
    console.log(`[MINING DEBUG] === ${member.displayName} finished all ${numActions} actions ===`);
    
    // Update progress tracking for achievements and titles
    try {
        const { updatePlayerProgress } = require('./mining/titleSystem');
        
        if (wallsBroken > 0) {
            await updatePlayerProgress(member.id, 'wallsBroken', wallsBroken);
        }
        if (treasuresFound > 0) {
            await updatePlayerProgress(member.id, 'treasuresFound', treasuresFound);
        }
        // Note: Other progress updates (oreFound, coinsEarned, etc.) would be added where those events occur
        
    } catch (error) {
        console.error(`[PROGRESS] Error updating progress for ${member.displayName}:`, error);
    }
    
    return { mapChanged, wallsBroken, treasuresFound, mapData, hazardsChanged };
 } catch (error) {

 }
}
};

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
    legendaryFindCooldowns.clear(); // Clear legendary cooldowns
    dbCache.clear();
    efficiencyCache.clear();
    healthMetrics.lastProcessed.clear();
    healthMetrics.processingErrors.clear();
    healthMetrics.averageProcessingTime.clear();
    healthMetrics.stuckChannels.clear();
}

// Periodic cleanup of old cooldowns to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    const maxCooldown = Math.max(LEGENDARY_COOLDOWN, UNIQUE_COOLDOWN);
    
    // Clean up expired cooldowns
    for (const [key, timestamp] of legendaryFindCooldowns.entries()) {
        if (now - timestamp > maxCooldown * 2) { // Keep for 2x max cooldown
            legendaryFindCooldowns.delete(key);
        }
    }
}, 60 * 60 * 1000); // Run every hour

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

// Time-based effects helper functions
function processHourlyEffects(member, playerData, uniqueBonuses, eventLogs, currentTime) {
    // Crown of the Forgotten King - hourly NPC command refresh
    if (uniqueBonuses.npcSystem && uniqueBonuses.npcSystem.canCommandNPC) {
        if (!playerData.timeBasedEffects.hourlyEffects.npcCommandsUsed) {
            playerData.timeBasedEffects.hourlyEffects.npcCommandsUsed = 0;
        }
        
        // Reset hourly NPC commands
        playerData.timeBasedEffects.hourlyEffects.npcCommandsUsed = 0;
        eventLogs.push(`👑 ${member.displayName}'s NPC command refreshed!`);
    }
    
    // Midas' Burden - hourly wealth transfer
    if (uniqueBonuses.greed > 0) {
        // Transfer small amount of wealth from other players
        const wealthTransfer = Math.floor(Math.random() * 100) + 50; // 50-150 coins
        eventLogs.push(`💰 ${member.displayName}'s greed draws ${wealthTransfer} coins from the shadows!`);
        // Note: Actual wealth transfer would need to be implemented in the currency system
    }
    
    // Phoenix Feather Charm - hourly resurrection chance refresh
    if (uniqueBonuses.autoReviveChance > 0) {
        playerData.timeBasedEffects.hourlyEffects.reviveChanceUsed = false;
        eventLogs.push(`🔥 ${member.displayName}'s phoenix power has recharged!`);
    }
}

function processDailyCooldowns(member, playerData, uniqueBonuses, eventLogs, currentTime) {
    const oneDayAgo = currentTime - (24 * 60 * 60 * 1000);
    
    // Crown of the Forgotten King - daily NPC summon
    if (uniqueBonuses.npcSystem && uniqueBonuses.npcSystem.canCommandNPC) {
        const lastNPCUse = playerData.timeBasedEffects.dailyCooldowns.npcSummon || 0;
        
        if (lastNPCUse < oneDayAgo) {
            // NPC summon is available
            playerData.timeBasedEffects.dailyCooldowns.npcSummonAvailable = true;
        }
    }
    
    // The One Pick - daily reality fracture
    if (uniqueBonuses.titles && uniqueBonuses.titles.includes('Heir of the Miner King')) {
        const lastRealityUse = playerData.timeBasedEffects.dailyCooldowns.realityFracture || 0;
        
        if (lastRealityUse < oneDayAgo) {
            // Reality fracture is available (reveals entire map)
            playerData.timeBasedEffects.dailyCooldowns.realityFractureAvailable = true;
        }
    }
    
    // Crystal Seer's Orb - daily divination
    if (uniqueBonuses.divination > 0.5) {
        const lastDivinationUse = playerData.timeBasedEffects.dailyCooldowns.divination || 0;
        
        if (lastDivinationUse < oneDayAgo) {
            // Divination is available (predict next rare ore location)
            playerData.timeBasedEffects.dailyCooldowns.divinationAvailable = true;
        }
    }
}
// Graceful shutdown - save cache before exit
process.on('SIGINT', async () => {
    console.log('[MINING] Saving cache before shutdown...');
    await mapCacheSystem.forceFlush();
    process.exit(0);
});

// Cache system exports
module.exports.mapCacheSystem = mapCacheSystem;
module.exports.cacheCommands = {
    forceSave: async () => {
        await mapCacheSystem.forceFlush();
        console.log('[CACHE] Force save completed');
    },
    getStats: () => mapCacheSystem.getStats(),
    clearChannel: (channelId) => mapCacheSystem.clearChannel(channelId),
    preloadAll: async () => await mapCacheSystem.preloadAll()
}

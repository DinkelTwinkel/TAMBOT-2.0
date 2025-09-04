const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const emptyvccheck = require('./emptyVoiceCheck');
const GuildConfig = require('../models/GuildConfig');
const UniqueItem = require('../models/uniqueItems');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');
const { checkConditionalOwnership } = require('./conditionalUniqueItems');
const DigDeeperListener = require('../patterns/digDeeperListener');
const Sacrifice = require('../models/SacrificeSchema'); // Import Sacrifice model

// Load gacha server data
const gachaServersPath = path.join(__dirname, '../data/gachaServers.json');
const gachaServers = JSON.parse(fs.readFileSync(gachaServersPath, 'utf8'));

// Script cache for ultra-fast loading
const scriptCache = new Map();

// Enhanced lock manager with timeouts, metadata, and performance monitoring
class VCLockManager {
    constructor() {
        this.locks = new Map();
        this.defaultTimeout = 10000; // 10 seconds default timeout for maximum speed
        this.cleanupTimers = new Map(); // Track cleanup timers to prevent memory leaks
        this.stats = {
            totalLocks: 0,
            activeLocks: 0,
            expiredLocks: 0,
            failedAcquisitions: 0
        };
        this.performanceMetrics = new Map(); // Track lock performance
    }

    /**
     * Attempt to acquire a lock for a VC
     * @param {string} vcId - The voice channel ID
     * @param {string} scriptName - Name of the script requesting the lock
     * @param {number} timeout - Lock timeout in ms (optional)
     * @returns {boolean} - Whether the lock was acquired
     */
    acquire(vcId, scriptName, timeout = this.defaultTimeout) {
        // Input validation
        if (!vcId || typeof vcId !== 'string') {
            console.error('[LOCK MANAGER] Invalid vcId provided to acquire');
            this.stats.failedAcquisitions++;
            return false;
        }
        
        if (!scriptName || typeof scriptName !== 'string') {
            console.error('[LOCK MANAGER] Invalid scriptName provided to acquire');
            this.stats.failedAcquisitions++;
            return false;
        }
        
        if (typeof timeout !== 'number' || timeout <= 0) {
            console.warn('[LOCK MANAGER] Invalid timeout provided, using default');
            timeout = this.defaultTimeout;
        }
        
        const now = Date.now();
        const startTime = now;
        
        try {
            // Check if there's an existing lock
            if (this.locks.has(vcId)) {
                const lock = this.locks.get(vcId);
                
                // Check if the lock has expired
                if (now > lock.expiresAt) {
                    console.warn(`[LOCK MANAGER] Lock for VC ${vcId} expired, forcefully releasing`);
                    this.release(vcId);
                } else {
                    // Lock is still valid
                    this.stats.failedAcquisitions++;
                    return false;
                }
            }
            
            // Clear any existing cleanup timer for this VC
            if (this.cleanupTimers.has(vcId)) {
                clearTimeout(this.cleanupTimers.get(vcId));
                this.cleanupTimers.delete(vcId);
            }
            
            // Acquire the lock with unique ID to prevent race conditions
            const lockId = `${vcId}-${now}-${Math.random()}`;
            this.locks.set(vcId, {
                lockId,
                scriptName,
                acquiredAt: now,
                expiresAt: now + timeout,
                timeout
            });
            
            // Set automatic cleanup timer with proper reference
            const timerId = setTimeout(() => {
                const currentLock = this.locks.get(vcId);
                if (currentLock && currentLock.lockId === lockId) {
                    console.warn(`[LOCK MANAGER] Auto-releasing expired lock for VC ${vcId}`);
                    this.release(vcId);
                }
            }, timeout);
            
            this.cleanupTimers.set(vcId, timerId);
            
            // Update statistics
            this.stats.totalLocks++;
            this.stats.activeLocks = this.locks.size;
            
            // Track performance
            const acquisitionTime = Date.now() - startTime;
            this.performanceMetrics.set(vcId, {
                lastAcquisitionTime: acquisitionTime,
                scriptName,
                acquiredAt: now
            });
            
            return true;
        } catch (error) {
            console.error(`[LOCK MANAGER] Error acquiring lock for VC ${vcId}:`, error);
            this.stats.failedAcquisitions++;
            return false;
        }
    }

    /**
     * Release a lock for a VC
     * @param {string} vcId - The voice channel ID
     */
    release(vcId) {
        if (!vcId) {
            console.error('[LOCK MANAGER] Invalid vcId provided to release');
            return;
        }
        
        try {
            // Clear cleanup timer if exists (prevents memory leak)
            if (this.cleanupTimers.has(vcId)) {
                clearTimeout(this.cleanupTimers.get(vcId));
                this.cleanupTimers.delete(vcId);
            }
            
            // Update performance metrics before releasing
            const lock = this.locks.get(vcId);
            if (lock) {
                const holdTime = Date.now() - lock.acquiredAt;
                const metrics = this.performanceMetrics.get(vcId);
                if (metrics) {
                    metrics.holdTime = holdTime;
                    metrics.releasedAt = Date.now();
                }
            }
            
            this.locks.delete(vcId);
            this.stats.activeLocks = this.locks.size;
        } catch (error) {
            console.error(`[LOCK MANAGER] Error releasing lock for VC ${vcId}:`, error);
        }
    }

    /**
     * Check if a VC is locked
     * @param {string} vcId - The voice channel ID
     * @returns {boolean}
     */
    isLocked(vcId) {
        if (!this.locks.has(vcId)) return false;
        
        const lock = this.locks.get(vcId);
        const now = Date.now();
        
        // Check if lock has expired
        if (now > lock.expiresAt) {
            this.release(vcId);
            return false;
        }
        
        return true;
    }

    /**
     * Get lock information
     * @param {string} vcId - The voice channel ID
     * @returns {Object|null} Lock information or null
     */
    getLockInfo(vcId) {
        const lock = this.locks.get(vcId);
        if (!lock) return null;
        
        // Verify lock is still valid
        const now = Date.now();
        if (now > lock.expiresAt) {
            this.release(vcId);
            return null;
        }
        
        return { ...lock, remainingTime: lock.expiresAt - now };
    }

    /**
     * Clean up all expired locks
     */
    cleanupExpired() {
        try {
            const now = Date.now();
            const expiredLocks = [];
            
            for (const [vcId, lock] of this.locks.entries()) {
                if (now > lock.expiresAt) {
                    expiredLocks.push(vcId);
                }
            }
            
            // Release expired locks
            for (const vcId of expiredLocks) {
                console.log(`Cleaning up expired lock for VC ${vcId}`);
                this.release(vcId);
            }
            
            return expiredLocks.length;
        } catch (error) {
            console.error('Error during lock cleanup:', error);
            return 0;
        }
    }

    /**
     * Get all active locks
     * @returns {Array} Array of lock information
     */
    getActiveLocks() {
        const now = Date.now();
        return Array.from(this.locks.entries())
            .filter(([_, lock]) => now <= lock.expiresAt)
            .map(([vcId, lock]) => ({
                vcId,
                ...lock,
                remainingTime: lock.expiresAt - now
            }));
    }
    
    /**
     * Force release all locks (for emergency cleanup)
     */
    releaseAll() {
        console.warn('[LOCK MANAGER] Force releasing all locks');
        
        try {
            // Clear all cleanup timers
            for (const timerId of this.cleanupTimers.values()) {
                clearTimeout(timerId);
            }
            this.cleanupTimers.clear();
            
            // Clear all locks
            this.locks.clear();
            this.stats.activeLocks = 0;
        } catch (error) {
            console.error('[LOCK MANAGER] Error during force release:', error);
        }
    }
    
    /**
     * Get performance statistics
     * @returns {Object} Performance statistics
     */
    getStats() {
        return {
            ...this.stats,
            performanceMetrics: Array.from(this.performanceMetrics.entries()).map(([vcId, metrics]) => ({
                vcId,
                ...metrics
            }))
        };
    }
    
    /**
     * Get health status of the lock manager
     * @returns {Object} Health status
     */
    getHealthStatus() {
        const now = Date.now();
        const activeLocks = Array.from(this.locks.entries()).map(([vcId, lock]) => ({
            vcId,
            scriptName: lock.scriptName,
            remainingTime: lock.expiresAt - now,
            isExpired: now > lock.expiresAt
        }));
        
        return {
            isHealthy: this.cleanupTimers.size === this.locks.size,
            activeLocks: activeLocks.length,
            expiredLocks: activeLocks.filter(lock => lock.isExpired).length,
            memoryLeaks: this.cleanupTimers.size !== this.locks.size,
            stats: this.stats
        };
    }
}

// Create lock manager instance
const lockManager = new VCLockManager();

// Import unique items initialization
const { initializeUniqueItems } = require('./uniqueItemFinding');

module.exports = async (guild) => {
    // --- INITIALIZE UNIQUE ITEMS SYSTEM ---
    // This only needs to run once on bot startup
    if (!global.uniqueItemsInitialized) {
        try {
            await initializeUniqueItems();
            console.log('[UNIQUE ITEMS] System initialized successfully');

            // Add this:
            const digDeeperListener = new DigDeeperListener(guild.client);
            console.log('[DIG_DEEPER] Listener initialized');
            
            // Check for any items that need immediate maintenance (crash recovery)
            const now = new Date();
            const overdue = await UniqueItem.find({
                nextMaintenanceCheck: { $lte: now },
                ownerId: { $ne: null }
            });
            
            // Filter by items that actually require maintenance according to sheet
            const itemsNeedingMaintenance = overdue.filter(item => {
                const itemData = getUniqueItemById(item.itemId);
                return itemData && itemData.requiresMaintenance;
            });
            
            if (itemsNeedingMaintenance.length > 0) {
                console.log(`[UNIQUE ITEMS] Found ${itemsNeedingMaintenance.length} items with overdue maintenance (crash recovery)`);
                // They'll be processed in the next interval check
            }
            
            global.uniqueItemsInitialized = true;
        } catch (error) {
            console.error('[UNIQUE ITEMS] Failed to initialize:', error);
        }
    }

    // --- INITIAL CLEANUP ---
    const channels = await guild.channels.fetch();
    const activeVCs = await ActiveVCS.find().lean();
    const activeVCIds = new Set(activeVCs.map(vc => vc.channelId));

    channels.forEach(channel => {
        if (activeVCIds.has(channel.id)) {
            console.log(`Found active VC in DB: ${channel.name} (${channel.id})`);
            emptyvccheck(channel);
        }
    });

    // --- ULTRA-FAST LOCK CLEANUP ---
    setInterval(() => {
        lockManager.cleanupExpired();
    }, 1000); // Clean up every 1 second for maximum speed

    // --- ULTRA-OPTIMIZED UNIQUE ITEMS MAINTENANCE CHECK ---
    // Check every 30 seconds for items needing maintenance reduction
    setInterval(async () => {
        const startTime = Date.now();
        
        try {
            const now = new Date();
            
            // Ultra-fast query with projection to only get needed fields
            const itemsDue = await UniqueItem.find({
                nextMaintenanceCheck: { $lte: now },
                ownerId: { $ne: null } // Only owned items
            }, {
                itemId: 1,
                ownerId: 1,
                maintenanceLevel: 1,
                ownerTag: 1,
                nextMaintenanceCheck: 1
            }).lean(); // Use lean() for better performance
            
            if (itemsDue.length === 0) return;
            
            // Filter by items that actually require maintenance according to sheet
            const itemsRequiringMaintenance = [];
            for (const item of itemsDue) {
                const itemData = getUniqueItemById(item.itemId);
                if (itemData && itemData.requiresMaintenance) {
                    itemsRequiringMaintenance.push({ item, itemData });
                }
            }
            
            if (itemsRequiringMaintenance.length > 0) {
                console.log(`[UNIQUE ITEMS] Processing maintenance for ${itemsRequiringMaintenance.length} items`);
                
                // Process items in batches to avoid overwhelming the database
                const batchSize = 5;
                for (let i = 0; i < itemsRequiringMaintenance.length; i += batchSize) {
                    const batch = itemsRequiringMaintenance.slice(i, i + batchSize);
                    const batchPromises = batch.map(({ item, itemData }) => 
                        processItemMaintenance(item, itemData)
                    );
                    
                    await Promise.allSettled(batchPromises);
                }
            }
        } catch (error) {
            console.error('[UNIQUE ITEMS] Error in maintenance check:', error);
        } finally {
            const processingTime = Date.now() - startTime;
            if (processingTime > 500) {
                console.warn(`[UNIQUE ITEMS] Slow maintenance processing: ${processingTime}ms`);
            }
        }
    }, 5 * 1000); // Check every 5 seconds for maximum speed
    
    // --- CONDITIONAL UNIQUE ITEMS CHECK ---
    // Check every 5 minutes for conditional ownership changes
    setInterval(async () => {
        try {
            await checkConditionalOwnership();
        } catch (error) {
            console.error('[CONDITIONAL UNIQUE] Error checking ownership:', error);
        }
    }, 30 * 1000); // Check every 30 seconds for maximum speed
    
    // --- ULTRA-OPTIMIZED INTERVAL CHECK ---
    let lastGuildConfigUpdate = 0;
    let lastGulletCheck = 0;
    let lastVCsFetch = 0;
    let cachedVCs = [];
    const GUILD_CONFIG_CACHE_TTL = 30 * 1000; // 30 seconds for maximum speed
    const GULLET_CHECK_TTL = 5 * 1000; // 5 seconds for maximum speed
    const VCS_CACHE_TTL = 500; // 500ms - VCs change frequently but not every cycle
    
    setInterval(async () => {
        const now = Date.now();
        const startTime = now;

        try {
            // Ultra-optimized database operations with smart caching
            const dbPromises = [];
            
            // Only check sacrifice data if enough time has passed
            if (now - lastGulletCheck > GULLET_CHECK_TTL) {
                dbPromises.push(
                    Sacrifice.findOne({ guildId: guild.id, isSacrificing: true }).lean()
                );
            } else {
                dbPromises.push(Promise.resolve(null));
            }
            
            // Only check guild config if enough time has passed
            if (now - lastGuildConfigUpdate > GUILD_CONFIG_CACHE_TTL) {
                dbPromises.push(
                    GuildConfig.findOne({ guildId: guild.id }).lean()
                );
            } else {
                dbPromises.push(Promise.resolve(null));
            }
            
            // Smart VCs caching - only fetch if cache is stale
            let activeVCs;
            if (now - lastVCsFetch > VCS_CACHE_TTL) {
                activeVCs = await ActiveVCS.find().lean();
                cachedVCs = activeVCs;
                lastVCsFetch = now;
            } else {
                activeVCs = cachedVCs;
            }
            
            // Execute remaining database queries in parallel
            const [sacrificeData, guildDb] = await Promise.all(dbPromises);

            // Handle gullet cleanup (only if we fetched sacrifice data)
            if (sacrificeData !== null) {
                lastGulletCheck = now;
                await handleGulletCleanup(guild, sacrificeData);
            }

            // Handle guild config update (only if we fetched guild data)
            if (guildDb !== null) {
                lastGuildConfigUpdate = now;
                await handleGuildConfigUpdate(guildDb, now);
            }

            // Process active VCs with improved error handling
            await processActiveVCs(guild, activeVCs, now, gachaServers);

        } catch (error) {
            console.error('[GAME MASTER] Error in main interval:', error);
            performanceMonitor.recordError('main_interval_error');
        } finally {
            // Record performance metrics
            const processingTime = Date.now() - startTime;
            performanceMonitor.recordIntervalProcessing(processingTime);
            
            if (processingTime > 200) {
                console.warn(`[GAME MASTER] Slow processing: ${processingTime}ms`);
            }
        }
    }, 500); // Check every 500ms for maximum speed
};

// Helper functions for optimized interval processing
async function processItemMaintenance(item, itemData) {
    try {
        // Special handling for Midas' Burden (wealthiest maintenance)
        let shouldDecay = true;
        if (itemData.maintenanceType === 'wealthiest' && item.itemId === 10) {
            // Check if player is still the richest
            const { checkRichestPlayer } = require('./conditionalUniqueItems');
            const isRichest = await checkRichestPlayer(item.ownerId, null);
            
            if (isRichest) {
                // Still richest, don't decay maintenance
                shouldDecay = false;
                console.log(`[UNIQUE ITEMS] ${itemData.name}: Owner still wealthiest, maintenance preserved at ${item.maintenanceLevel}`);
            } else {
                console.log(`[UNIQUE ITEMS] ${itemData.name}: Owner no longer wealthiest, maintenance will decay`);
            }
        }
        
        // Reduce maintenance by decay rate if applicable
        const oldLevel = item.maintenanceLevel;
        if (shouldDecay) {
            const decayRate = itemData.maintenanceDecayRate || 1;
            await item.reduceMaintenance(decayRate);
        }
        
        // Set next maintenance check for 24 hours later
        item.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await item.save();
        
        console.log(`[UNIQUE ITEMS] ${itemData.name}: Maintenance ${oldLevel} -> ${item.maintenanceLevel} (Owner: ${item.ownerTag || 'None'})`);
        
        // Log if item was lost
        if (item.maintenanceLevel <= 0 && !item.ownerId) {
            console.log(`[UNIQUE ITEMS] ⚠️ ${itemData.name} was lost due to maintenance failure!`);
        }
    } catch (itemError) {
        console.error(`[UNIQUE ITEMS] Error processing item ${item.itemId}:`, itemError);
    }
}

async function handleGulletCleanup(guild, sacrificeData) {
    try {
        // If not sacrificing (or no sacrifice data), delete any gullet channels
        if (!sacrificeData || !sacrificeData.isSacrificing) {
            const existingGullets = await ActiveVCS.find({ 
                guildId: guild.id, 
                typeId: 16 
            });
            
            if (existingGullets.length > 0) {
                console.log(`🧹 Not sacrificing, cleaning up ${existingGullets.length} gullet channel(s)...`);
                
                // Process gullet cleanup in parallel for better performance
                const cleanupPromises = existingGullets.map(async (gulletEntry) => {
                    try {
                        // Try to fetch and delete the actual Discord channel
                        const gulletChannel = await guild.channels.fetch(gulletEntry.channelId).catch(() => null);
                        if (gulletChannel) {
                            //await gulletChannel.delete('Sacrifice ended - cleaning up gullet channels');
                            //console.log(`🗑️ Deleted gullet channel: ${gulletChannel.name}`);
                        }
                        
                        // // Remove from database
                        // await ActiveVCS.deleteOne({ channelId: gulletEntry.channelId });
                        // console.log(`📝 Removed gullet channel from database: ${gulletEntry.channelId}`);
                    } catch (err) {
                        console.error(`Error cleaning up gullet channel ${gulletEntry.channelId}:`, err);
                    }
                });
                
                await Promise.allSettled(cleanupPromises);
            }
        }
    } catch (error) {
        console.error('[GAME MASTER] Error in gullet cleanup:', error);
    }
}

async function handleGuildConfigUpdate(guildDb, now) {
    try {
        if (guildDb && now > guildDb.updatedAt.getTime()) {
            const msToAdd = 1000 * 60 * 60; // add 60 minutes

            await GuildConfig.updateOne(
                { guildId: guildDb.guildId },
                { $set: { updatedAt: new Date(guildDb.updatedAt.getTime() + msToAdd) } }
            );
        }
    } catch (error) {
        console.error('[GAME MASTER] Error updating guild config:', error);
    }
}

async function processActiveVCs(guild, activeVCs, now, gachaServers) {
    // Ultra-fast filtering with early exit
    const readyVCs = [];
    for (const vc of activeVCs) {
        if (!vc.nextTrigger || now >= new Date(vc.nextTrigger).getTime()) {
            readyVCs.push(vc);
        }
    }

    if (readyVCs.length === 0) return;

    // Increased concurrency for better performance
    const concurrencyLimit = 5; // Process max 5 VCs simultaneously
    const chunks = [];
    for (let i = 0; i < readyVCs.length; i += concurrencyLimit) {
        chunks.push(readyVCs.slice(i, i + concurrencyLimit));
    }

    // Process all chunks in parallel for maximum speed
    const chunkPromises = chunks.map(chunk => 
        Promise.allSettled(chunk.map(vc => processSingleVC(guild, vc, now, gachaServers)))
    );
    
    await Promise.all(chunkPromises);
}

async function processSingleVC(guild, vc, now, gachaServers) {
    try {
        // Fast lock check with early exit
        if (lockManager.isLocked(vc.channelId)) {
            return; // Skip without logging for performance
        }

        // Fast server data lookup with caching
        const serverData = gachaServers.find(s => s.id == vc.typeId);
        if (!serverData) {
            return; // Skip without logging for performance
        }

        const scriptTimeout = serverData.timeout || 10000; // 10 seconds for maximum speed
        
        // Try to acquire lock with appropriate timeout
        if (!lockManager.acquire(vc.channelId, serverData.name, scriptTimeout)) {
            return; // Skip without logging for performance
        }

        try {
            // Ultra-fast script loading with caching
            const scriptPath = path.join(__dirname, './gachaModes', serverData.script);
            let gameScript = scriptCache.get(scriptPath);
            
            if (!gameScript) {
                gameScript = require(scriptPath);
                scriptCache.set(scriptPath, gameScript);
            }

            // Ultra-fast channel fetch with timeout
            const gachaVC = await Promise.race([
                guild.channels.fetch(vc.channelId),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Channel fetch timeout')), 200)) // 200ms for maximum speed
            ]).catch(() => null);
            
            if (!gachaVC) {
                return; // Skip without logging for performance
            }

            // Batch database update for better performance
            const updatePromise = ActiveVCS.updateOne(
                { channelId: vc.channelId },
                { $set: { nextTrigger: new Date(now + 100) } } // 100ms for maximum speed
            );

            // Run script with timeout protection
            let timeoutId;
            try {
                const scriptPromise = gameScript(gachaVC, vc, serverData);
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error('Script timeout'));
                    }, scriptTimeout);
                });

                // Run script and database update in parallel
                await Promise.all([
                    Promise.race([scriptPromise, timeoutPromise]),
                    updatePromise
                ]);
                
                // Clear timeout if script completed successfully
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            } finally {
                // Ensure timeout is cleared even on error
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            }
        } catch (err) {
            // Only log actual errors, not timeouts or expected failures
            if (err.message !== 'Script timeout' && err.message !== 'Channel fetch timeout') {
                console.error(`Error running script for VC ${vc.channelId}:`, err);
            }
        } finally {
            lockManager.release(vc.channelId); // Always release lock
        }
    } catch (error) {
        // Only log unexpected errors
        console.error(`[GAME MASTER] Unexpected error processing VC ${vc.channelId}:`, error);
    }
}

// Performance monitoring and health check system
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            intervalProcessingTimes: [],
            databaseQueryTimes: [],
            scriptExecutionTimes: [],
            errorCounts: new Map(),
            lastHealthCheck: Date.now()
        };
        this.maxMetricsHistory = 100;
    }
    
    recordIntervalProcessing(time) {
        this.metrics.intervalProcessingTimes.push(time);
        if (this.metrics.intervalProcessingTimes.length > this.maxMetricsHistory) {
            this.metrics.intervalProcessingTimes.shift();
        }
    }
    
    recordDatabaseQuery(time) {
        this.metrics.databaseQueryTimes.push(time);
        if (this.metrics.databaseQueryTimes.length > this.maxMetricsHistory) {
            this.metrics.databaseQueryTimes.shift();
        }
    }
    
    recordScriptExecution(time) {
        this.metrics.scriptExecutionTimes.push(time);
        if (this.metrics.scriptExecutionTimes.length > this.maxMetricsHistory) {
            this.metrics.scriptExecutionTimes.shift();
        }
    }
    
    recordError(errorType) {
        const count = this.metrics.errorCounts.get(errorType) || 0;
        this.metrics.errorCounts.set(errorType, count + 1);
    }
    
    getHealthStatus() {
        const now = Date.now();
        const avgIntervalTime = this.getAverageTime(this.metrics.intervalProcessingTimes);
        const avgDbTime = this.getAverageTime(this.metrics.databaseQueryTimes);
        const avgScriptTime = this.getAverageTime(this.metrics.scriptExecutionTimes);
        
        return {
            isHealthy: avgIntervalTime < 5000 && avgDbTime < 1000 && avgScriptTime < 30000,
            metrics: {
                averageIntervalProcessingTime: avgIntervalTime,
                averageDatabaseQueryTime: avgDbTime,
                averageScriptExecutionTime: avgScriptTime,
                totalErrors: Array.from(this.metrics.errorCounts.values()).reduce((a, b) => a + b, 0),
                errorBreakdown: Object.fromEntries(this.metrics.errorCounts),
                lastHealthCheck: this.metrics.lastHealthCheck
            },
            lockManagerHealth: lockManager.getHealthStatus()
        };
    }
    
    getAverageTime(times) {
        if (times.length === 0) return 0;
        return times.reduce((a, b) => a + b, 0) / times.length;
    }
}

const performanceMonitor = new PerformanceMonitor();

// Health check interval
setInterval(() => {
    const healthStatus = performanceMonitor.getHealthStatus();
    if (!healthStatus.isHealthy) {
        console.warn('[HEALTH CHECK] System health issues detected:', healthStatus.metrics);
    }
    performanceMonitor.metrics.lastHealthCheck = Date.now();
}, 5 * 60 * 1000); // Check every 5 minutes

// Export for debugging/monitoring
module.exports.lockManager = lockManager;
module.exports.performanceMonitor = performanceMonitor;
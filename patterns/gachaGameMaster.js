const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const emptyvccheck = require('./emptyVoiceCheck');
const GuildConfig = require('../models/GuildConfig');
const UniqueItem = require('../models/uniqueItems');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');
const { checkConditionalOwnership } = require('./conditionalUniqueItems');
const DigDeeperListener = require('../patterns/digDeeperListener');
const InnUpgradeListener = require('../patterns/innUpgradeListener');
const Sacrifice = require('../models/SacrificeSchema'); // Import Sacrifice model

// Load gacha server data
const gachaServersPath = path.join(__dirname, '../data/gachaServers.json');
const gachaServers = JSON.parse(fs.readFileSync(gachaServersPath, 'utf8'));

// Enhanced lock manager with timeouts, metadata, and performance monitoring
class VCLockManager {
    constructor() {
        this.locks = new Map();
        this.defaultTimeout = 30000; // 30 seconds default timeout
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
            
            // Initialize Inn Upgrade Listener
            const innUpgradeListener = new InnUpgradeListener(guild.client);
            console.log('[INN_UPGRADE] Listener initialized');
            
            
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

    // --- PERIODIC LOCK CLEANUP ---
    setInterval(() => {
        lockManager.cleanupExpired();
    }, 15000); // Clean up every 15 seconds

    // --- OPTIMIZED UNIQUE ITEMS MAINTENANCE CHECK ---
    // Check every minute for items needing maintenance reduction
    setInterval(async () => {
        const startTime = Date.now();
        
        try {
            const now = new Date();
            
            // Find all unique items where maintenance check is due
            const itemsDue = await UniqueItem.find({
                nextMaintenanceCheck: { $lte: now },
                ownerId: { $ne: null } // Only owned items
            }); // Removed .lean() so we get full Mongoose documents with methods
            
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
            if (processingTime > 2000) {
                console.warn(`[UNIQUE ITEMS] Slow maintenance processing: ${processingTime}ms`);
            }
        }
    }, 60 * 1000); // Check every minute (will only process items that are due)
    
    // --- CONDITIONAL UNIQUE ITEMS CHECK ---
    // Check every 5 minutes for conditional ownership changes
    setInterval(async () => {
        try {
            await checkConditionalOwnership();
        } catch (error) {
            console.error('[CONDITIONAL UNIQUE] Error checking ownership:', error);
        }
    }, 5 * 60 * 1000); // Check every 5 minutes
    
    // --- CURRENCY DECIMAL CLEANUP ---
    // Check every 30 minutes for decimal currency balances and fix them
    setInterval(async () => {
        try {
            await cleanupDecimalCurrencies();
        } catch (error) {
            console.error('[CURRENCY CLEANUP] Error fixing decimal balances:', error);
        }
    }, 30 * 60 * 1000); // Check every 30 minutes
    
    // --- OPTIMIZED INTERVAL CHECK ---
    let lastGuildConfigUpdate = 0;
    let lastGulletCheck = 0;
    const GUILD_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const GULLET_CHECK_TTL = 30 * 1000; // 30 seconds
    
    setInterval(async () => {
        const now = Date.now();
        const startTime = now;

        try {
            // Batch database operations for better performance
            const [sacrificeData, guildDb, activeVCs] = await Promise.all([
                // Only check sacrifice data if enough time has passed
                (now - lastGulletCheck > GULLET_CHECK_TTL) ? 
                    Sacrifice.findOne({ guildId: guild.id, isSacrificing: true }) : 
                    Promise.resolve(null),
                
                // Only check guild config if enough time has passed
                (now - lastGuildConfigUpdate > GUILD_CONFIG_CACHE_TTL) ? 
                    GuildConfig.findOne({ guildId: guild.id }) : 
                    Promise.resolve(null),
                
                // Always fetch active VCs as they change frequently
                ActiveVCS.find().lean() // Use lean() for better performance
            ]);

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
            
            if (processingTime > 1000) {
                console.warn(`[GAME MASTER] Slow processing: ${processingTime}ms`);
            }
        }
    }, 7 * 1000); // Check every 7 seconds
};

// Helper functions for optimized interval processing
async function processItemMaintenance(item, itemData) {
    try {
        // Special handling for Midas' Burden (wealthiest maintenance)
        let isRichest = false;
        if (itemData.maintenanceType === 'wealthiest' && item.itemId === 10) {
            // Check if player is still the richest globally
            const Money = require('../models/currency');
            const richestPlayer = await Money.findOne().sort({ money: -1 }).limit(1);
            isRichest = richestPlayer && richestPlayer.userId === item.ownerId;
            
            if (isRichest) {
                console.log(`[UNIQUE ITEMS] ${itemData.name}: Owner still wealthiest, maintenance will decay normally`);
            } else {
                console.log(`[UNIQUE ITEMS] ${itemData.name}: Owner no longer wealthiest, maintenance will decay normally`);
            }
            
            // Special case: If maintenance is 0 but player is still richest, restore some maintenance (no wealth effect)
            if (item.maintenanceLevel <= 0 && isRichest) {
                console.log(`[UNIQUE ITEMS] ${itemData.name}: Maintenance at 0 but owner still wealthiest - restoring above curse threshold`);
                item.maintenanceLevel = 2; // Give maintenance above curse threshold (≤1) to keep it functional
            }
        }
        
        // Reduce maintenance by decay rate (always decay unless already handled above)
        const oldLevel = item.maintenanceLevel;
        if (!(itemData.maintenanceType === 'wealthiest' && item.itemId === 10 && item.maintenanceLevel <= 0 && isRichest)) {
            const decayRate = itemData.maintenanceDecayRate || 1;
            
            // Check if item has the reduceMaintenance method
            if (typeof item.reduceMaintenance === 'function') {
                await item.reduceMaintenance(decayRate, isRichest);
            } else {
                // Fallback: manually reduce maintenance
                item.maintenanceLevel = Math.max(0, item.maintenanceLevel - decayRate);
                
                // If maintenance hits 0, handle ownership loss
                if (item.maintenanceLevel <= 0 && item.ownerId) {
                    // Special handling for Midas' Burden - don't lose it if still richest
                    if (itemData.maintenanceType === 'wealthiest' && item.itemId === 10 && isRichest) {
                        console.log(`[UNIQUE ITEMS] ${itemData.name}: Maintenance at 0 but owner still wealthiest - keeping item above curse threshold`);
                        item.maintenanceLevel = 2; // Give maintenance above curse threshold (≤1) to keep it functional
                    } else {
                        console.log(`[UNIQUE ITEMS] ${itemData.name} lost due to maintenance failure`);
                        
                        // Add to previous owners if the field exists
                        if (item.previousOwners) {
                            item.previousOwners.push({
                                userId: item.ownerId,
                                userTag: item.ownerTag,
                                acquiredDate: item.createdAt,
                                lostDate: new Date(),
                                lostReason: 'maintenance_failure'
                            });
                        }
                        
                        // Update statistics if they exist
                        if (item.statistics) {
                            item.statistics.timesLostToMaintenance++;
                        }
                        
                        // Remove current owner
                        item.ownerId = null;
                        item.ownerTag = null;
                        item.maintenanceLevel = 10; // Reset for next owner
                    }
                }
            }
        }
        
        // Set next maintenance check for 24 hours later
        item.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        // Save with error handling
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

/**
 * Clean up any decimal currency balances by rounding them to integers
 */
async function cleanupDecimalCurrencies() {
    try {
        const Money = require('../models/currency');
        
        // Find all currency records with decimal values
        const decimalBalances = await Money.find({
            money: { $type: "double", $not: { $mod: [1, 0] } } // Find non-integer values
        });
        
        if (decimalBalances.length === 0) {
            return; // No decimal balances found
        }
        
        console.log(`[CURRENCY CLEANUP] Found ${decimalBalances.length} accounts with decimal balances`);
        
        let fixedCount = 0;
        for (const account of decimalBalances) {
            const oldAmount = account.money;
            const newAmount = Math.floor(oldAmount); // Round down to nearest integer
            
            if (oldAmount !== newAmount) {
                account.money = newAmount;
                await account.save();
                fixedCount++;
                
                console.log(`[CURRENCY CLEANUP] Fixed ${account.usertag || account.userId}: ${oldAmount} → ${newAmount} coins`);
            }
        }
        
        if (fixedCount > 0) {
            console.log(`[CURRENCY CLEANUP] ✅ Fixed ${fixedCount} decimal currency balances`);
        }
        
    } catch (error) {
        console.error('[CURRENCY CLEANUP] Error during decimal cleanup:', error);
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
    // Filter VCs that are ready to process
    const readyVCs = activeVCs.filter(vc => {
        const nextTrigger = vc.nextTrigger ? new Date(vc.nextTrigger).getTime() : 0;
        return !vc.nextTrigger || now >= nextTrigger;
    });

    if (readyVCs.length === 0) return;

    // Process VCs in parallel with concurrency limit
    const concurrencyLimit = 3; // Process max 3 VCs simultaneously
    const chunks = [];
    for (let i = 0; i < readyVCs.length; i += concurrencyLimit) {
        chunks.push(readyVCs.slice(i, i + concurrencyLimit));
    }

    for (const chunk of chunks) {
        const processingPromises = chunk.map(vc => processSingleVC(guild, vc, now, gachaServers));
        await Promise.allSettled(processingPromises);
    }
}

async function processSingleVC(guild, vc, now, gachaServers) {
    try {
        // Check if VC is locked
        if (lockManager.isLocked(vc.channelId)) {
            const lockInfo = lockManager.getLockInfo(vc.channelId);
            const remainingTime = lockInfo.expiresAt - Date.now();
            console.log(`Skipping VC ${vc.channelId}, locked by ${lockInfo.scriptName} (expires in ${Math.round(remainingTime / 1000)}s)`);
            return;
        }

        // Find corresponding gacha server data
        const serverData = gachaServers.find(s => s.id == vc.typeId);
        if (!serverData) {
            console.warn(`[GAME MASTER] No server data found for typeId ${vc.typeId}`);
            return;
        }

        const scriptTimeout = serverData.timeout || 30000;
        
        // Try to acquire lock with appropriate timeout
        if (!lockManager.acquire(vc.channelId, serverData.name, scriptTimeout)) {
            console.log(`Failed to acquire lock for VC ${vc.channelId}`);
            return;
        }

        try {
            const scriptPath = path.join(__dirname, './gachaModes', serverData.script);
            const gameScript = require(scriptPath);

            const gachaVC = await guild.channels.fetch(vc.channelId).catch(() => null);
            if (!gachaVC) {
                console.warn(`[GAME MASTER] Could not fetch channel ${vc.channelId}`);
                return;
            }

            console.log(`Running ${serverData.name} script for VC ${vc.channelId}`);

            // Update next trigger time using database update (since vc is a lean document)
            await ActiveVCS.updateOne(
                { channelId: vc.channelId },
                { $set: { nextTrigger: new Date(now + 500) } }
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

                await Promise.race([scriptPromise, timeoutPromise]);
                
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

            console.log(`Completed ${serverData.name} for VC ${vc.channelId}`);
        } catch (err) {
            if (err.message === 'Script timeout') {
                console.error(`Script timeout for VC ${vc.channelId} after ${scriptTimeout}ms`);
            } else {
                console.error(`Error running script for VC ${vc.channelId}:`, err);
            }
        } finally {
            lockManager.release(vc.channelId); // Always release lock
        }
    } catch (error) {
        console.error(`[GAME MASTER] Error processing VC ${vc.channelId}:`, error);
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
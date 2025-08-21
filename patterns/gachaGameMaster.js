const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const emptyvccheck = require('./emptyVoiceCheck');
const GuildConfig = require('../models/GuildConfig');
const UniqueItem = require('../models/uniqueItems');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');

// Load gacha server data
const gachaServersPath = path.join(__dirname, '../data/gachaServers.json');
const gachaServers = JSON.parse(fs.readFileSync(gachaServersPath, 'utf8'));

// Enhanced lock manager with timeouts and metadata (FIXED)
class VCLockManager {
    constructor() {
        this.locks = new Map();
        this.defaultTimeout = 30000; // 30 seconds default timeout
        this.cleanupTimers = new Map(); // Track cleanup timers to prevent memory leaks
    }

    /**
     * Attempt to acquire a lock for a VC
     * @param {string} vcId - The voice channel ID
     * @param {string} scriptName - Name of the script requesting the lock
     * @param {number} timeout - Lock timeout in ms (optional)
     * @returns {boolean} - Whether the lock was acquired
     */
    acquire(vcId, scriptName, timeout = this.defaultTimeout) {
        const now = Date.now();
        
        // Check if there's an existing lock
        if (this.locks.has(vcId)) {
            const lock = this.locks.get(vcId);
            
            // Check if the lock has expired
            if (now > lock.expiresAt) {
                console.warn(`Lock for VC ${vcId} expired, forcefully releasing`);
                this.release(vcId);
            } else {
                // Lock is still valid
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
                console.warn(`Auto-releasing expired lock for VC ${vcId}`);
                this.release(vcId);
            }
        }, timeout);
        
        this.cleanupTimers.set(vcId, timerId);
        
        return true;
    }

    /**
     * Release a lock for a VC
     * @param {string} vcId - The voice channel ID
     */
    release(vcId) {
        // Clear cleanup timer if exists (prevents memory leak)
        if (this.cleanupTimers.has(vcId)) {
            clearTimeout(this.cleanupTimers.get(vcId));
            this.cleanupTimers.delete(vcId);
        }
        
        this.locks.delete(vcId);
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
        console.warn('Force releasing all locks');
        
        // Clear all cleanup timers
        for (const timerId of this.cleanupTimers.values()) {
            clearTimeout(timerId);
        }
        this.cleanupTimers.clear();
        
        // Clear all locks
        this.locks.clear();
    }
}

// Create lock manager instance
const lockManager = new VCLockManager();

module.exports = async (guild) => {

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

    // --- UNIQUE ITEMS MAINTENANCE CHECK ---
    // Check every minute for items needing maintenance reduction
    setInterval(async () => {
        try {
            const now = new Date();
            
            // Find all unique items where maintenance check is due
            const itemsDue = await UniqueItem.find({
                requiresMaintenance: true,
                nextMaintenanceCheck: { $lte: now },
                ownerId: { $ne: null } // Only owned items
            });
            
            if (itemsDue.length > 0) {
                console.log(`[UNIQUE ITEMS] Processing maintenance for ${itemsDue.length} items`);
            }
            
            for (const item of itemsDue) {
                try {
                    const itemData = getUniqueItemById(item.itemId);
                    if (!itemData) continue;
                    
                    // Reduce maintenance by decay rate
                    const decayRate = itemData.maintenanceDecayRate || 1;
                    const oldLevel = item.maintenanceLevel;
                    
                    await item.reduceMaintenance(decayRate);
                    
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
        } catch (error) {
            console.error('[UNIQUE ITEMS] Error in maintenance check:', error);
        }
    }, 60 * 1000); // Check every minute (will only process items that are due)
    
    // --- INTERVAL CHECK ---
    setInterval(async () => {
        const now = Date.now();

        // global Shop price shift KEY change update.
        const guildDb = await GuildConfig.findOne({guildId: guild.id});
        if (now > guildDb.updatedAt) {
            const msToAdd = 1000 * 60 * 60; // add 60 minutes

            await GuildConfig.updateOne(
                { guildId: guild.id },
                { $set: { updatedAt: new Date(guildDb.updatedAt.getTime() + msToAdd) } }
            );
        }

        // begin vc check cycle
        const activeVCs = await ActiveVCS.find(); // Fetch live DB entries

        for (const vc of activeVCs) {
            const nextTrigger = vc.nextTrigger ? new Date(vc.nextTrigger).getTime() : 0;

            // Skip if not time yet
            if (vc.nextTrigger && now < nextTrigger) continue;

            // Check if VC is locked
            if (lockManager.isLocked(vc.channelId)) {
                const lockInfo = lockManager.getLockInfo(vc.channelId);
                const remainingTime = lockInfo.expiresAt - Date.now();
                console.log(`Skipping VC ${vc.channelId}, locked by ${lockInfo.scriptName} (expires in ${Math.round(remainingTime / 1000)}s)`);
                continue;
            }

            // Find corresponding gacha server data
            const serverData = gachaServers.find(s => s.id == vc.typeId); // Use == for type coercion
            if (!serverData) continue;

            // Define scriptTimeout outside try block so it's accessible in catch
            const scriptTimeout = serverData.timeout || 30000; // Default 30s (consistent with lock manager)
            
            try {
                // Try to acquire lock with appropriate timeout
                if (!lockManager.acquire(vc.channelId, serverData.name, scriptTimeout)) {
                    console.log(`Failed to acquire lock for VC ${vc.channelId}`);
                    continue;
                }

                const scriptPath = path.join(__dirname, './gachaModes', serverData.script);
                const gameScript = require(scriptPath);

                const gachaVC = await guild.channels.fetch(vc.channelId).catch(() => null);
                if (!gachaVC) {
                    lockManager.release(vc.channelId);
                    continue;
                }

                console.log(`Running ${serverData.name} script for VC ${vc.channelId}`);

                const now = Date.now();
                vc.nextTrigger = new Date(now + 15 * 1000);
                await vc.save();

                // Run script with timeout protection (FIXED: prevents memory leak)
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
        }
    }, 7 * 1000); // Check every 7 seconds
};

// Export lock manager for debugging/monitoring
module.exports.lockManager = lockManager;
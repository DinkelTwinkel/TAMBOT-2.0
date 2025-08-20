const fs = require('fs');
const path = require('path');
const ActiveVCS = require('../models/activevcs');
const emptyvccheck = require('./emptyVoiceCheck');
const GuildConfig = require('../models/GuildConfig');

// Load gacha server data
const gachaServersPath = path.join(__dirname, '../data/gachaServers.json');
const gachaServers = JSON.parse(fs.readFileSync(gachaServersPath, 'utf8'));

// Enhanced lock manager with timeouts and metadata
class VCLockManager {
    constructor() {
        this.locks = new Map(); // Map instead of Set for metadata
        this.defaultTimeout = 60000; // 60 seconds default timeout
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
        
        // Acquire the lock
        this.locks.set(vcId, {
            scriptName,
            acquiredAt: now,
            expiresAt: now + timeout,
            timeout
        });
        
        // Set automatic cleanup timer
        setTimeout(() => {
            if (this.locks.has(vcId) && this.locks.get(vcId).acquiredAt === now) {
                console.warn(`Auto-releasing expired lock for VC ${vcId}`);
                this.release(vcId);
            }
        }, timeout);
        
        return true;
    }

    /**
     * Release a lock for a VC
     * @param {string} vcId - The voice channel ID
     */
    release(vcId) {
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
        return this.locks.get(vcId) || null;
    }

    /**
     * Clean up all expired locks
     */
    cleanupExpired() {
        const now = Date.now();
        for (const [vcId, lock] of this.locks.entries()) {
            if (now > lock.expiresAt) {
                console.log(`Cleaning up expired lock for VC ${vcId}`);
                this.release(vcId);
            }
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
    }, 30000); // Clean up every 30 seconds

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
            const serverData = gachaServers.find(s => s.id === vc.typeId);
            if (!serverData) continue;

            // Define scriptTimeout outside try block so it's accessible in catch
            const scriptTimeout = serverData.timeout || 30000; // Default 30s or use config
            
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

                // Run script with timeout protection
                const scriptPromise = gameScript(gachaVC, vc, serverData);
                const timeoutPromise = new Promise((_, reject) => {
                    const timeoutId = setTimeout(() => {
                        reject(new Error('Script timeout'));
                    }, scriptTimeout);
                });

                await Promise.race([scriptPromise, timeoutPromise]);

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
    }, 10 * 1000); // Check every 5 seconds
};

// Export lock manager for debugging/monitoring
module.exports.lockManager = lockManager;
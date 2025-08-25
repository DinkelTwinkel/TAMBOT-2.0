// fixStuckBreaks.js - Emergency repair tool for stuck mining breaks
// Place this in patterns/gachaModes/mining/ folder and run when needed

const gachaVC = require('../../../models/activevcs');
const mapCacheSystem = require('./cache/mapCacheSystem');
const instanceManager = require('../instance-manager');

class MiningBreakRepair {
    constructor() {
        this.repairedChannels = [];
        this.failedChannels = [];
    }
    
    // Check if a channel is stuck in break
    async isChannelStuck(channelId) {
        try {
            const dbEntry = await gachaVC.findOne({ channelId });
            if (!dbEntry || !dbEntry.gameData) return false;
            
            const now = Date.now();
            const breakInfo = dbEntry.gameData.breakInfo;
            
            // Check various stuck conditions
            if (breakInfo) {
                // Break time has expired but still marked as in break
                if (breakInfo.breakEndTime && now >= breakInfo.breakEndTime + 60000) {
                    console.log(`[REPAIR] Channel ${channelId} stuck - break expired ${Math.floor((now - breakInfo.breakEndTime) / 60000)} minutes ago`);
                    return true;
                }
                
                // Break has been going for more than 30 minutes (max should be 20)
                if (breakInfo.breakStartTime && (now - breakInfo.breakStartTime) > 30 * 60 * 1000) {
                    console.log(`[REPAIR] Channel ${channelId} stuck - break running for ${Math.floor((now - breakInfo.breakStartTime) / 60000)} minutes`);
                    return true;
                }
                
                // Break end time is in the past but inBreak is still true
                if (breakInfo.inBreak && breakInfo.breakEndTime && breakInfo.breakEndTime < now) {
                    console.log(`[REPAIR] Channel ${channelId} stuck - inBreak flag still true after end time`);
                    return true;
                }
            }
            
            // Check for other stuck conditions
            if (dbEntry.nextShopRefresh && dbEntry.nextShopRefresh < new Date(now - 60 * 60 * 1000)) {
                console.log(`[REPAIR] Channel ${channelId} stuck - nextShopRefresh is ${Math.floor((now - dbEntry.nextShopRefresh) / 60000)} minutes in the past`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`[REPAIR] Error checking channel ${channelId}:`, error);
            return false;
        }
    }
    
    // Repair a stuck channel
    async repairChannel(channelId) {
        try {
            console.log(`[REPAIR] Starting repair for channel ${channelId}...`);
            
            // 1. Force kill any running instances
            instanceManager.forceKillChannel(channelId);
            
            // 2. Clear the cache
            mapCacheSystem.clearChannel(channelId);
            
            // 3. Get current DB state
            const dbEntry = await gachaVC.findOne({ channelId });
            if (!dbEntry || !dbEntry.gameData) {
                console.error(`[REPAIR] No data found for channel ${channelId}`);
                this.failedChannels.push(channelId);
                return false;
            }
            
            const now = Date.now();
            const updates = {
                $unset: {},
                $set: {}
            };
            
            // 4. Clear break info if it exists
            if (dbEntry.gameData.breakInfo) {
                updates.$unset['gameData.breakInfo'] = 1;
                console.log(`[REPAIR] Clearing break info for ${channelId}`);
            }
            
            // 5. Clear special events
            if (dbEntry.gameData.specialEvent) {
                updates.$unset['gameData.specialEvent'] = 1;
                console.log(`[REPAIR] Clearing special event for ${channelId}`);
            }
            
            // 6. Reset disabled players
            if (dbEntry.gameData.disabledPlayers && Object.keys(dbEntry.gameData.disabledPlayers).length > 0) {
                updates.$unset['gameData.disabledPlayers'] = 1;
                console.log(`[REPAIR] Clearing disabled players for ${channelId}`);
            }
            
            // 7. Fix player positions if needed
            if (dbEntry.gameData.map && dbEntry.gameData.map.playerPositions) {
                const fixedPositions = {};
                for (const [playerId, position] of Object.entries(dbEntry.gameData.map.playerPositions)) {
                    fixedPositions[playerId] = {
                        x: position.x || dbEntry.gameData.map.entranceX || 0,
                        y: position.y || dbEntry.gameData.map.entranceY || 0,
                        isTent: false,
                        hidden: false,
                        stuck: false,
                        trapped: false,
                        disabled: false
                    };
                }
                updates.$set['gameData.map.playerPositions'] = fixedPositions;
            }
            
            // 8. Set proper next trigger times
            updates.$set.nextTrigger = new Date(now + 1000);
            updates.$set.nextShopRefresh = new Date(now + 25 * 60 * 1000); // 25 minutes from now
            
            // 9. Mark that we just recovered
            updates.$set['gameData.breakJustEnded'] = now;
            updates.$set['gameData.lastRepair'] = now;
            
            // 10. Ensure gamemode is set
            if (!dbEntry.gameData.gamemode) {
                updates.$set['gameData.gamemode'] = 'mining';
            }
            
            // Apply all updates
            await gachaVC.updateOne({ channelId }, updates);
            
            console.log(`[REPAIR] Successfully repaired channel ${channelId}`);
            this.repairedChannels.push(channelId);
            
            // 11. Force cache refresh
            await mapCacheSystem.initialize(channelId, true);
            
            return true;
            
        } catch (error) {
            console.error(`[REPAIR] Failed to repair channel ${channelId}:`, error);
            this.failedChannels.push(channelId);
            return false;
        }
    }
    
    // Scan and repair all stuck channels
    async repairAllStuck() {
        try {
            console.log('[REPAIR] Scanning for stuck mining channels...');
            
            // Find all active mining channels
            const miningChannels = await gachaVC.find({
                'gameData.gamemode': 'mining'
            }).select('channelId gameData nextShopRefresh nextTrigger');
            
            console.log(`[REPAIR] Found ${miningChannels.length} mining channels to check`);
            
            const stuckChannels = [];
            
            // Check each channel
            for (const entry of miningChannels) {
                if (await this.isChannelStuck(entry.channelId)) {
                    stuckChannels.push(entry.channelId);
                }
            }
            
            if (stuckChannels.length === 0) {
                console.log('[REPAIR] No stuck channels found!');
                return {
                    success: true,
                    message: 'No stuck channels found',
                    repaired: [],
                    failed: []
                };
            }
            
            console.log(`[REPAIR] Found ${stuckChannels.length} stuck channels: ${stuckChannels.join(', ')}`);
            
            // Repair each stuck channel
            for (const channelId of stuckChannels) {
                await this.repairChannel(channelId);
                // Small delay between repairs
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            console.log(`[REPAIR] Repair complete!`);
            console.log(`[REPAIR] Successfully repaired: ${this.repairedChannels.length} channels`);
            if (this.failedChannels.length > 0) {
                console.log(`[REPAIR] Failed to repair: ${this.failedChannels.join(', ')}`);
            }
            
            return {
                success: true,
                message: `Repaired ${this.repairedChannels.length} channels`,
                repaired: this.repairedChannels,
                failed: this.failedChannels
            };
            
        } catch (error) {
            console.error('[REPAIR] Fatal error during repair:', error);
            return {
                success: false,
                message: `Fatal error: ${error.message}`,
                repaired: this.repairedChannels,
                failed: this.failedChannels
            };
        }
    }
    
    // Get status of a specific channel
    async getChannelStatus(channelId) {
        try {
            const dbEntry = await gachaVC.findOne({ channelId });
            if (!dbEntry || !dbEntry.gameData) {
                return { exists: false };
            }
            
            const now = Date.now();
            const status = {
                exists: true,
                channelId: channelId,
                gamemode: dbEntry.gameData.gamemode,
                hasBreakInfo: !!dbEntry.gameData.breakInfo,
                hasSpecialEvent: !!dbEntry.gameData.specialEvent,
                nextShopRefresh: dbEntry.nextShopRefresh,
                nextTrigger: dbEntry.nextTrigger,
                isStuck: await this.isChannelStuck(channelId)
            };
            
            if (dbEntry.gameData.breakInfo) {
                const breakInfo = dbEntry.gameData.breakInfo;
                status.breakDetails = {
                    inBreak: breakInfo.inBreak,
                    isLongBreak: breakInfo.isLongBreak,
                    startTime: breakInfo.breakStartTime,
                    endTime: breakInfo.breakEndTime,
                    minutesRemaining: breakInfo.breakEndTime ? Math.ceil((breakInfo.breakEndTime - now) / 60000) : 0,
                    minutesOverdue: breakInfo.breakEndTime ? Math.max(0, Math.floor((now - breakInfo.breakEndTime) / 60000)) : 0
                };
            }
            
            if (dbEntry.gameData.disabledPlayers) {
                status.disabledPlayerCount = Object.keys(dbEntry.gameData.disabledPlayers).length;
            }
            
            return status;
            
        } catch (error) {
            console.error(`[REPAIR] Error getting status for ${channelId}:`, error);
            return { exists: false, error: error.message };
        }
    }
}

// Export functions for use in other scripts
module.exports = {
    MiningBreakRepair,
    
    // Quick repair function
    quickRepair: async (channelId) => {
        const repair = new MiningBreakRepair();
        return await repair.repairChannel(channelId);
    },
    
    // Repair all stuck channels
    repairAll: async () => {
        const repair = new MiningBreakRepair();
        return await repair.repairAllStuck();
    },
    
    // Get channel status
    getStatus: async (channelId) => {
        const repair = new MiningBreakRepair();
        return await repair.getChannelStatus(channelId);
    },
    
    // Force clear break for a channel (emergency use)
    forceClearBreak: async (channelId) => {
        try {
            console.log(`[REPAIR] Force clearing break for ${channelId}...`);
            
            // Kill instances
            instanceManager.forceKillChannel(channelId);
            
            // Clear cache
            mapCacheSystem.clearChannel(channelId);
            
            // Clear from DB
            await gachaVC.updateOne(
                { channelId },
                {
                    $unset: {
                        'gameData.breakInfo': 1,
                        'gameData.specialEvent': 1,
                        'gameData.disabledPlayers': 1
                    },
                    $set: {
                        nextTrigger: new Date(Date.now() + 1000),
                        'gameData.breakJustEnded': Date.now()
                    }
                }
            );
            
            console.log(`[REPAIR] Force clear complete for ${channelId}`);
            return true;
        } catch (error) {
            console.error(`[REPAIR] Force clear failed for ${channelId}:`, error);
            return false;
        }
    }
};

// If running directly (not imported)
if (require.main === module) {
    console.log('[REPAIR] Running mining break repair tool...');
    
    const repair = new MiningBreakRepair();
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
        const channelId = args[0];
        console.log(`[REPAIR] Repairing specific channel: ${channelId}`);
        
        repair.repairChannel(channelId).then(success => {
            if (success) {
                console.log('[REPAIR] Channel repaired successfully!');
            } else {
                console.log('[REPAIR] Failed to repair channel');
            }
            process.exit(success ? 0 : 1);
        });
    } else {
        // Repair all stuck channels
        repair.repairAllStuck().then(result => {
            console.log('[REPAIR] Result:', result);
            process.exit(result.success ? 0 : 1);
        });
    }
}

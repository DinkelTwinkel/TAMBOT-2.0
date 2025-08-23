// Inn Recovery Command - Manual recovery tool for stuck inns
// Usage: Call this when an inn is stuck and not distributing rewards or taking breaks

const ActiveVCs = require('../../../models/activevcs');

/**
 * Force recover a stuck inn
 * @param {Object} channel - Discord channel object
 * @returns {Promise<boolean>} - Success status
 */
async function forceRecoverInn(channel) {
    const channelId = channel.id;
    console.log(`[InnRecovery] Starting forced recovery for channel ${channelId}`);
    
    try {
        // Get current state
        const current = await ActiveVCs.findOne({ channelId });
        if (!current) {
            console.log('[InnRecovery] Channel not found in database');
            return false;
        }
        
        if (!current.gameData || current.gameData.gamemode !== 'innkeeper') {
            console.log('[InnRecovery] Not an inn channel');
            return false;
        }
        
        const now = Date.now();
        
        // Log current state
        console.log('[InnRecovery] Current state:', {
            workState: current.gameData.workState,
            profitsDistributed: current.gameData.profitsDistributed,
            stateVersion: current.gameData.stateVersion,
            sales: current.gameData.sales?.length || 0,
            events: current.gameData.events?.length || 0,
            lastActivity: current.gameData.lastActivity,
            workStartTime: current.gameData.workStartTime,
            breakEndTime: current.gameData.breakEndTime
        });
        
        // Force reset to working state
        const reset = await ActiveVCs.findOneAndUpdate(
            { channelId },
            {
                $set: {
                    'gameData.workState': 'working',
                    'gameData.workStartTime': new Date(),
                    'gameData.workPeriodId': `work-${channelId}-${now}`,
                    'gameData.breakEndTime': null,
                    'gameData.profitsDistributed': false,
                    'gameData.lastActivity': new Date(),
                    'gameData.stateVersion': (current.gameData.stateVersion || 0) + 1,
                    'gameData.sales': [],
                    'gameData.events': [],
                    nextTrigger: new Date(now + 5000)
                },
                $unset: {
                    'gameData.lockExpiry': 1,
                    'gameData.lockId': 1,
                    'gameData.lockAcquiredAt': 1,
                    'gameData.distributionInProgress': 1,
                    'gameData.lastDistributionId': 1,
                    'gameData.retryCount': 1
                }
            },
            { new: true }
        );
        
        if (!reset) {
            console.log('[InnRecovery] Failed to reset inn state');
            return false;
        }
        
        console.log('[InnRecovery] Successfully reset inn to working state');
        
        // Send recovery message to channel
        try {
            await channel.send({
                content: '🔧 **Inn System Recovery**\n' +
                        'The inn has been manually recovered and is now operational.\n' +
                        '• State: Working\n' +
                        '• Next break: In ~25 minutes\n' +
                        '• All locks cleared\n' +
                        '• Ready for business!'
            });
        } catch (e) {
            console.error('[InnRecovery] Could not send recovery message:', e);
        }
        
        return true;
        
    } catch (error) {
        console.error('[InnRecovery] Error during recovery:', error);
        return false;
    }
}

/**
 * Force distribute profits for an inn
 * @param {Object} channel - Discord channel object
 * @returns {Promise<boolean>} - Success status
 */
async function forceDistributeProfits(channel) {
    const channelId = channel.id;
    console.log(`[InnRecovery] Forcing profit distribution for channel ${channelId}`);
    
    try {
        // Import the main controller
        const { InnKeeperController } = require('../innKeeper_v2_fixed');
        const controller = new InnKeeperController();
        
        // Get current data
        const current = await ActiveVCs.findOne({ channelId });
        if (!current || !current.gameData) {
            console.log('[InnRecovery] Channel not found or not initialized');
            return false;
        }
        
        // Force distribution
        await controller.distributeProfitsAtomic(channel, channelId);
        
        // Clear sales and events
        await ActiveVCs.findOneAndUpdate(
            { channelId },
            {
                $set: {
                    'gameData.sales': [],
                    'gameData.events': [],
                    'gameData.lastProfitDistribution': new Date()
                }
            }
        );
        
        console.log('[InnRecovery] Profits distributed successfully');
        return true;
        
    } catch (error) {
        console.error('[InnRecovery] Error distributing profits:', error);
        return false;
    }
}

/**
 * Get detailed inn status for debugging
 * @param {string} channelId - Channel ID
 * @returns {Promise<Object>} - Detailed status
 */
async function getDetailedInnStatus(channelId) {
    try {
        const dbEntry = await ActiveVCs.findOne({ channelId });
        if (!dbEntry || !dbEntry.gameData) {
            return { error: 'Inn not found or not initialized' };
        }
        
        const now = Date.now();
        const gameData = dbEntry.gameData;
        
        // Calculate times
        const workStartTime = gameData.workStartTime ? new Date(gameData.workStartTime).getTime() : 0;
        const timeSinceWorkStart = now - workStartTime;
        const workMinutesElapsed = Math.round(timeSinceWorkStart / 60000);
        
        const breakEndTime = gameData.breakEndTime ? new Date(gameData.breakEndTime).getTime() : 0;
        const breakTimeRemaining = breakEndTime > now ? Math.round((breakEndTime - now) / 60000) : 0;
        
        const nextTriggerTime = dbEntry.nextTrigger ? new Date(dbEntry.nextTrigger).getTime() : 0;
        const timeSinceScheduled = now - nextTriggerTime;
        const isOverdue = timeSinceScheduled > 0;
        
        return {
            channelId,
            currentState: gameData.workState,
            stateVersion: gameData.stateVersion || 0,
            workPeriodId: gameData.workPeriodId,
            
            timing: {
                workMinutesElapsed,
                workMinutesUntilBreak: Math.max(0, 25 - workMinutesElapsed),
                breakTimeRemaining,
                isOverdue,
                minutesOverdue: isOverdue ? Math.round(timeSinceScheduled / 60000) : 0,
                nextTriggerIn: !isOverdue ? Math.round((nextTriggerTime - now) / 1000) : 0
            },
            
            data: {
                sales: gameData.sales?.length || 0,
                events: gameData.events?.length || 0,
                profitsDistributed: gameData.profitsDistributed,
                lastActivity: gameData.lastActivity,
                lastProfitDistribution: gameData.lastProfitDistribution
            },
            
            locks: {
                hasLock: !!gameData.lockExpiry,
                lockExpired: gameData.lockExpiry ? new Date(gameData.lockExpiry).getTime() < now : true,
                distributionInProgress: gameData.distributionInProgress,
                retryCount: gameData.retryCount || 0
            },
            
            health: {
                isStuck: isOverdue && timeSinceScheduled > 600000, // 10+ minutes overdue
                needsRecovery: (gameData.workState === 'transitioning_to_break' && timeSinceScheduled > 60000) ||
                              (isOverdue && timeSinceScheduled > 600000) ||
                              (gameData.lockExpiry && new Date(gameData.lockExpiry).getTime() < now - 300000)
            }
        };
    } catch (error) {
        console.error('[InnRecovery] Error getting status:', error);
        return { error: error.message };
    }
}

module.exports = {
    forceRecoverInn,
    forceDistributeProfits,
    getDetailedInnStatus
};

// InnKeeper v2.2 - Fixed version with proper state management
// Main controller with atomic operations, distributed locks, and race condition prevention

const { EmbedBuilder } = require('discord.js');
const Money = require('../../models/currency');
const ActiveVCs = require('../../models/activevcs');
const InnKeeperSales = require('./innKeeping/innKeeperSales');
const InnConfig = require('./innKeeping/innConfig');
const InnAIManager = require('./innKeeping/innAIManager');
const InnDisplayManager = require('./innKeeping/innDisplayManager');
const InnEventManager = require('./innKeeping/innEventManager');
const InnPurchaseHandler = require('./innKeeping/innPurchaseHandler_v2');
const getPlayerStats = require('../calculatePlayerStat');
const gachaServers = require('../../data/gachaServers.json');
const shops = require('../../data/shops.json');

class InnKeeperController {
    constructor() {
        this.config = InnConfig;
        this.aiManager = new InnAIManager();
        this.displayManager = new InnDisplayManager();
        this.eventManager = new InnEventManager();
        this.purchaseHandler = new InnPurchaseHandler();
        this.messageThrottle = new Map();
        this.processingLocks = new Map();
        this.retryAttempts = new Map();
    }

    /**
     * Acquire processing lock with atomic operation
     */
    async acquireLock(channelId, timeout = 30000) {
        const now = Date.now();
        const lockExpiry = new Date(now + timeout);
        
        try {
            // Atomic lock acquisition with expiry
            const result = await ActiveVCs.findOneAndUpdate(
                {
                    channelId: channelId,
                    $or: [
                        { 'gameData.lockExpiry': { $exists: false } },
                        { 'gameData.lockExpiry': { $lt: new Date() } },
                        { 'gameData.lockExpiry': null }
                    ]
                },
                {
                    $set: {
                        'gameData.lockExpiry': lockExpiry,
                        'gameData.lockAcquiredAt': new Date(),
                        'gameData.lockId': `${channelId}-${now}-${Math.random()}`
                    }
                },
                {
                    new: true,
                    runValidators: false
                }
            );
            
            if (result) {
                // Store lock ID for verification
                this.processingLocks.set(channelId, result.gameData.lockId);
                console.log(`[InnKeeperV2] Lock acquired for channel ${channelId}`);
                return true;
            }
            
            console.log(`[InnKeeperV2] Failed to acquire lock for channel ${channelId} - already locked`);
            return false;
            
        } catch (error) {
            console.error(`[InnKeeperV2] Error acquiring lock for ${channelId}:`, error);
            return false;
        }
    }

    /**
     * Release processing lock
     */
    async releaseLock(channelId) {
        const lockId = this.processingLocks.get(channelId);
        if (!lockId) return;
        
        try {
            await ActiveVCs.findOneAndUpdate(
                {
                    channelId: channelId,
                    'gameData.lockId': lockId
                },
                {
                    $unset: {
                        'gameData.lockExpiry': 1,
                        'gameData.lockAcquiredAt': 1,
                        'gameData.lockId': 1
                    }
                }
            );
            
            this.processingLocks.delete(channelId);
            console.log(`[InnKeeperV2] Lock released for channel ${channelId}`);
            
        } catch (error) {
            console.error(`[InnKeeperV2] Error releasing lock for ${channelId}:`, error);
        }
    }

    /**
     * Recovery method to restart stuck inns with atomic operations - FIXED
     */
    async recoverStuckInn(channel, dbEntry, now) {
        console.log('[InnKeeperV2] Attempting to recover stuck inn...');
        
        try {
            const newWorkPeriodId = `work-${dbEntry.channelId}-${now}`;
            
            // Use atomic update for recovery
            const recovered = await ActiveVCs.findOneAndUpdate(
                {
                    channelId: dbEntry.channelId,
                    'gameData.gamemode': 'innkeeper'
                },
                {
                    $set: {
                        'gameData.workState': 'working',
                        'gameData.workStartTime': new Date(),
                        'gameData.workPeriodId': newWorkPeriodId,
                        'gameData.breakEndTime': null,
                        'gameData.profitsDistributed': false,
                        'gameData.lastActivity': new Date(),
                        'gameData.stateVersion': (dbEntry.gameData.stateVersion || 0) + 1,
                        'gameData.nextShopRefresh': dbEntry.gameData?.nextShopRefresh || new Date(now + 25 * 60 * 1000),
                        nextTrigger: new Date(now + 5000)
                    },
                    $unset: {
                        'gameData.lockExpiry': 1,
                        'gameData.lockId': 1,
                        'gameData.distributionInProgress': 1,
                        'gameData.lastDistributionId': 1
                    }
                },
                {
                    new: true
                }
            );
            
            if (recovered) {
                // Send recovery message
                const embed = new EmbedBuilder()
                    .setTitle('🔄 Inn System Recovered')
                    .setColor(this.config.DISPLAY.COLORS.SUCCESS_GREEN)
                    .setDescription('The inn is back online and ready for business!')
                    .addFields(
                        { name: 'Status', value: 'Working', inline: true },
                        { name: 'Next Break', value: 'In ~25 minutes', inline: true }
                    )
                    .setTimestamp();
                    
                try {
                    await channel.send({ embeds: [embed] });
                } catch (e) {
                    console.error('[InnKeeperV2] Could not send recovery message:', e);
                }
                
                console.log('[InnKeeperV2] Inn recovery completed successfully');
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('[InnKeeperV2] Error during inn recovery:', error);
            return false;
        }
    }

    /**
     * Main entry point with concurrency protection
     */
    async runCycle(channel, dbEntry, json) {
        const now = Date.now();
        const channelId = dbEntry.channelId;
        
        console.log(`[InnKeeperV2] Starting cycle for channel ${channelId}`);
        
        // Try to acquire lock
        const lockAcquired = await this.acquireLock(channelId);
        if (!lockAcquired) {
            console.log(`[InnKeeperV2] Skipping cycle - another instance is processing ${channelId}`);
            return;
        }
        
        try {
            // Refresh data after acquiring lock
            dbEntry = await ActiveVCs.findOne({ channelId: channelId });
            if (!dbEntry) {
                console.error(`[InnKeeperV2] Channel ${channelId} no longer exists`);
                return;
            }
            
            // Initialize game data if needed
            if (!this.isInitialized(dbEntry)) {
                await this.initializeGameDataAtomic(channelId);
                // Refresh after initialization
                dbEntry = await ActiveVCs.findOne({ channelId: channelId });
            }
            
            // Check if inn might be stuck
            const nextTriggerTime = new Date(dbEntry.nextTrigger).getTime();
            const timeSinceScheduled = now - nextTriggerTime;
            const overdueThreshold = 10 * 60 * 1000; // 10 minutes
            
            if (timeSinceScheduled > overdueThreshold) {
                console.log(`[InnKeeperV2] Detected stuck inn - ${Math.round(timeSinceScheduled / 60000)} minutes overdue`);
                const recovered = await this.recoverStuckInn(channel, dbEntry, now);
                if (recovered) {
                    return; // Recovery method handles scheduling
                }
            }

            // Check and refresh shop if needed
            await this.checkAndRefreshShop(channelId, dbEntry, now);

            // Check work/break state with atomic operations
            const workState = await this.checkWorkStateAtomic(channel, channelId, now);
            if (workState.shouldReturn) {
                console.log(`[InnKeeperV2] Returning early from cycle - workState.shouldReturn is true`);
                return;
            }

            // Generate activity if needed
            if (this.shouldGenerateActivity(dbEntry, now)) {
                await this.generateActivityAtomic(channel, channelId, now);
            }

            // Update display if not throttled
            if (this.shouldUpdateDisplay(channelId, now)) {
                // Refresh data before display
                dbEntry = await ActiveVCs.findOne({ channelId: channelId });
                await this.displayManager.update(channel, dbEntry);
                this.updateMessageThrottle(channelId, now);
            }

            // Schedule next cycle atomically
            await this.scheduleNextCycleAtomic(channelId, now);
            
        } catch (error) {
            console.error(`[InnKeeperV2] Error in cycle for ${channelId}:`, error);
            // Schedule retry with exponential backoff
            await this.scheduleRetry(channelId, now);
        } finally {
            // Always release lock
            await this.releaseLock(channelId);
        }
    }

    /**
     * Schedule retry with exponential backoff
     */
    async scheduleRetry(channelId, now) {
        const attempts = (this.retryAttempts.get(channelId) || 0) + 1;
        this.retryAttempts.set(channelId, attempts);
        
        const backoffTime = Math.min(30000 * Math.pow(2, attempts - 1), 300000); // Max 5 minutes
        
        await ActiveVCs.findOneAndUpdate(
            { channelId: channelId },
            { 
                $set: { 
                    nextTrigger: new Date(now + backoffTime),
                    'gameData.retryCount': attempts
                }
            }
        );
        
        console.log(`[InnKeeperV2] Scheduled retry #${attempts} for ${channelId} in ${backoffTime}ms`);
    }

    /**
     * Check if game data is properly initialized
     */
    isInitialized(dbEntry) {
        return dbEntry.gameData && 
               dbEntry.gameData.gamemode === 'innkeeper' &&
               dbEntry.gameData.sales !== undefined &&
               dbEntry.gameData.events !== undefined;
    }

    /**
     * Initialize game data with atomic operation - FIXED
     */
    async initializeGameDataAtomic(channelId) {
        console.log('[InnKeeperV2] Initializing new game data atomically');
        
        const now = Date.now();
        const initialData = {
            gamemode: 'innkeeper',
            sales: [],
            events: [],
            lastProfitDistribution: new Date(),
            lastActivity: new Date(),
            lastShopGeneration: new Date(now - 5 * 60 * 1000),
            nextShopRefresh: new Date(now + 25 * 60 * 1000), // Shop refresh in 25 minutes
            currentRotationalItems: [], // Track current rotational items
            workState: 'working',
            workStartTime: new Date(),
            workPeriodId: `work-${channelId}-${Date.now()}`, // Add unique work period ID
            breakEndTime: null,
            profitsDistributed: false, // Track if profits distributed for current period
            stateVersion: 1,
            eventSequence: 0
        };
        
        await ActiveVCs.findOneAndUpdate(
            { channelId: channelId },
            { 
                $set: { gameData: initialData }
            },
            { upsert: false }
        );
    }

    /**
     * Check and handle work/break states with atomic operations
     */
    async checkWorkStateAtomic(channel, channelId, now) {
        // Get current state atomically
        const current = await ActiveVCs.findOne(
            { channelId: channelId },
            { 'gameData.workState': 1, 'gameData.breakEndTime': 1, 'gameData.workStartTime': 1, 'gameData.stateVersion': 1 }
        );
        
        if (!current || !current.gameData) {
            return { shouldReturn: false };
        }
        
        const gameData = current.gameData;
        const stateVersion = gameData.stateVersion || 0;
        
        // Handle break state
        if (gameData.workState === 'break') {
            if (this.isBreakOver(gameData, now)) {
                const ended = await this.endBreakAtomic(channel, channelId, stateVersion, now);
                return { shouldReturn: !ended };
            } else {
                await this.continueBreakAtomic(channelId, gameData.breakEndTime, now);
                return { shouldReturn: true };
            }
        }
        
        // Handle transitioning state
        if (gameData.workState === 'transitioning_to_break') {
            console.log('[InnKeeperV2] Inn is transitioning to break, skipping cycle');
            return { shouldReturn: true };
        }
        
        // Check if work period is complete
        if (this.isWorkPeriodComplete(gameData, now)) {
            console.log('[InnKeeperV2] Work period complete, starting break...');
            const started = await this.startBreakAtomic(channel, channelId, stateVersion, now);
            return { shouldReturn: started };
        }
        
        // Log work progress
        const workStartTime = new Date(gameData.workStartTime).getTime();
        const timeSinceWorkStart = now - workStartTime;
        const workMinutesElapsed = Math.round(timeSinceWorkStart / 60000);
        const workMinutesRemaining = Math.max(0, 25 - workMinutesElapsed);
        console.log(`[InnKeeperV2] Working: ${workMinutesElapsed} minutes elapsed, ${workMinutesRemaining} minutes until break`);
        
        return { shouldReturn: false };
    }

    /**
     * Check if break period is over
     */
    isBreakOver(gameData, now) {
        return gameData.breakEndTime && now >= new Date(gameData.breakEndTime).getTime();
    }

    /**
     * End break with atomic state transition - FIXED
     */
    async endBreakAtomic(channel, channelId, currentVersion, now) {
        console.log('[InnKeeperV2] Attempting to end break atomically');
        
        try {
            const newWorkPeriodId = `work-${channelId}-${now}`;
            
            // Atomic state transition - relaxed version check
            const updated = await ActiveVCs.findOneAndUpdate(
                { 
                    channelId: channelId,
                    'gameData.workState': 'break'
                    // Removed strict version check to prevent stuck states
                },
                { 
                    $set: { 
                        'gameData.workState': 'working',
                        'gameData.workStartTime': new Date(),
                        'gameData.workPeriodId': newWorkPeriodId, // New work period
                        'gameData.breakEndTime': null,
                        'gameData.profitsDistributed': false, // Reset for new period
                        'gameData.stateVersion': currentVersion + 1,
                        'gameData.sales': [],
                        'gameData.events': [],
                        'gameData.nextShopRefresh': new Date(now + 25 * 60 * 1000), // Reset shop refresh timer
                        nextTrigger: new Date(now + 10000)
                    }
                },
                { new: true }
            );
            
            if (!updated) {
                console.log('[InnKeeperV2] Failed to end break - state already changed');
                return false;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('🔔 The Inn Reopens!')
                .setColor(this.config.DISPLAY.COLORS.SUCCESS_GREEN)
                .setDescription('Break time is over! The inn is now open for business again.')
                .setTimestamp();
                
            try {
                await channel.send({ embeds: [embed] });
                console.log('[InnKeeperV2] Reopen message sent successfully');
            } catch (messageError) {
                console.error('[InnKeeperV2] Failed to send reopen message:', messageError);
            }
            
            // Clear retry counter on successful state change
            this.retryAttempts.delete(channelId);
            
            console.log('[InnKeeperV2] Inn successfully reopened with new work period:', newWorkPeriodId);
            return true;
            
        } catch (error) {
            console.error('[InnKeeperV2] Error ending break:', error);
            return false;
        }
    }

    /**
     * Continue break period atomically - FIXED
     */
    async continueBreakAtomic(channelId, breakEndTime, now) {
        const breakTimeLeft = Math.ceil(
            (new Date(breakEndTime).getTime() - now) / 60000
        );
        
        console.log(`[InnKeeperV2] On break for ${breakTimeLeft} more minutes`);
        
        // Check more frequently as we approach break end
        let nextCheck;
        const timeToBreakEnd = new Date(breakEndTime).getTime() - now;
        
        if (timeToBreakEnd <= 10000) {
            nextCheck = 2000; // Check every 2 seconds when close
        } else if (timeToBreakEnd <= 30000) {
            nextCheck = 5000; // Check every 5 seconds
        } else {
            nextCheck = 20000; // Check every 20 seconds otherwise
        }
        
        await ActiveVCs.findOneAndUpdate(
            { channelId: channelId },
            { 
                $set: { 
                    nextTrigger: new Date(now + nextCheck)
                }
            }
        );
    }

    /**
     * Check if work period is complete
     */
    isWorkPeriodComplete(gameData, now) {
        const workStartTime = new Date(gameData.workStartTime).getTime();
        const timeSinceWorkStart = now - workStartTime;
        const shouldBreak = timeSinceWorkStart >= this.config.TIMING.WORK_DURATION && 
               gameData.workState === 'working';
        
        if (shouldBreak) {
            console.log(`[InnKeeperV2] Work period complete: ${Math.round(timeSinceWorkStart / 60000)} minutes worked`);
        }
        
        return shouldBreak;
    }

    /**
     * Start break period with atomic state transition - FIXED
     */
    async startBreakAtomic(channel, channelId, currentVersion, now) {
        console.log('[InnKeeperV2] Attempting to start break atomically');
        
        try {
            // First, atomically mark that we're transitioning to break and distribute profits
            const transitioned = await ActiveVCs.findOneAndUpdate(
                { 
                    channelId: channelId,
                    'gameData.workState': 'working',
                    // Remove strict version check that might be blocking transitions
                    // 'gameData.stateVersion': currentVersion,
                    'gameData.profitsDistributed': { $ne: true } // Only if not already distributed
                },
                { 
                    $set: { 
                        'gameData.workState': 'transitioning_to_break',
                        'gameData.stateVersion': currentVersion + 1,
                        'gameData.profitsDistributed': true // Mark as distributed
                    }
                },
                { new: true }
            );
            
            if (!transitioned) {
                console.log('[InnKeeperV2] Failed to start break - state already changed or profits already distributed');
                // Try without version check as fallback
                const fallback = await ActiveVCs.findOneAndUpdate(
                    { 
                        channelId: channelId,
                        'gameData.workState': 'working'
                    },
                    { 
                        $set: { 
                            'gameData.workState': 'transitioning_to_break',
                            'gameData.profitsDistributed': true
                        }
                    },
                    { new: true }
                );
                if (!fallback) return false;
            }
            
            // Always try to distribute profits, even if no sales/events (base salary)
            console.log('[InnKeeperV2] Distributing profits before break...');
            await this.distributeProfitsAtomic(channel, channelId);
            
            // Finally, complete transition to break
            const breakTime = now + this.config.TIMING.BREAK_DURATION;
            const completed = await ActiveVCs.findOneAndUpdate(
                { 
                    channelId: channelId,
                    'gameData.workState': 'transitioning_to_break'
                },
                { 
                    $set: { 
                        'gameData.workState': 'break',
                        'gameData.breakEndTime': new Date(breakTime),
                        'gameData.stateVersion': currentVersion + 2,
                        'gameData.sales': [],
                        'gameData.events': [],
                        'gameData.workPeriodId': null, // Clear work period ID
                        nextTrigger: new Date(now + 30000) // Check in 30 seconds
                    }
                },
                { new: true }
            );
            
            if (!completed) {
                console.error('[InnKeeperV2] Failed to complete transition to break');
                // Try to rollback
                await ActiveVCs.findOneAndUpdate(
                    { channelId: channelId },
                    { 
                        $set: { 
                            'gameData.workState': 'working',
                            'gameData.profitsDistributed': false
                        }
                    }
                );
                return false;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('☕ Break Time!')
                .setColor(this.config.DISPLAY.COLORS.BREAK_ORANGE)
                .setDescription('The inn is closing for a 5-minute break. Workers deserve some rest!')
                .addFields(
                    { name: 'Break Duration', value: '5 minutes', inline: true },
                    { name: 'Reopening At', value: `<t:${Math.floor(breakTime / 1000)}:R>`, inline: true }
                )
                .setTimestamp();
                
            try {
                await channel.send({ embeds: [embed] });
                console.log('[InnKeeperV2] Break message sent successfully');
            } catch (messageError) {
                console.error('[InnKeeperV2] Failed to send break message:', messageError);
            }
            
            // Clear retry counter on successful state change
            this.retryAttempts.delete(channelId);
            
            console.log(`[InnKeeperV2] Break scheduled to end at ${new Date(breakTime).toISOString()}`);
            return true;
            
        } catch (error) {
            console.error('[InnKeeperV2] Error starting break:', error);
            // Try to rollback on error
            await ActiveVCs.findOneAndUpdate(
                { channelId: channelId },
                { 
                    $set: { 
                        'gameData.workState': 'working',
                        'gameData.profitsDistributed': false
                    }
                }
            );
            return false;
        }
    }

    /**
     * Check if we should generate activity
     */
    shouldGenerateActivity(dbEntry, now) {
        const lastActivity = new Date(dbEntry.gameData.lastActivity || 0).getTime();
        const timeSinceLastActivity = now - lastActivity;
        const forceEvent = timeSinceLastActivity >= this.config.TIMING.ACTIVITY_GUARANTEE;
        
        if (forceEvent) {
            console.log(`[InnKeeperV2] Forcing event - ${timeSinceLastActivity}ms since last activity`);
            return true;
        }
        
        // Random chance for activity
        return Math.random() < 0.3; // 30% chance per cycle
    }

    /**
     * Generate activity with atomic operations
     */
    async generateActivityAtomic(channel, channelId, now) {
        try {
            // Get current data
            const current = await ActiveVCs.findOne({ channelId: channelId });
            if (!current || current.gameData.workState !== 'working') {
                console.log('[InnKeeperV2] Skipping activity generation - not working');
                return;
            }
            
            const event = await this.eventManager.generateEvent(channel, current);
            
            if (event) {
                // Generate unique event ID for idempotency
                const eventId = `${channelId}-${now}-${Math.random()}`;
                event.eventId = eventId;
                
                // Update with atomic operation based on event type
                if (event.type === 'npcSale') {
                    // Add sale atomically with duplicate check
                    const updated = await ActiveVCs.findOneAndUpdate(
                        {
                            channelId: channelId,
                            'gameData.sales.eventId': { $ne: eventId }
                        },
                        {
                            $push: { 'gameData.sales': event.saleData },
                            $set: { 'gameData.lastActivity': new Date() },
                            $inc: { 'gameData.eventSequence': 1 }
                        }
                    );
                    
                    if (updated) {
                        console.log(`[InnKeeperV2] NPC sale recorded: ${event.saleData.buyerName} bought item for ${event.saleData.price}c`);
                    }
                } else if (event.type === 'friendship') {
                    // Handle friendship event - add both the event AND the purchases
                    const updateData = {
                        $push: { 'gameData.events': event },
                        $set: { 'gameData.lastActivity': new Date() },
                        $inc: { 'gameData.eventSequence': 1 }
                    };
                    
                    // Add the purchases from the friendship event to sales
                    if (event.purchases && event.purchases.length > 0) {
                        updateData.$push['gameData.sales'] = { $each: event.purchases };
                    }
                    
                    const updated = await ActiveVCs.findOneAndUpdate(
                        {
                            channelId: channelId,
                            'gameData.events.eventId': { $ne: eventId }
                        },
                        updateData
                    );
                    
                    if (updated) {
                        const totalRevenue = event.purchases ? 
                            event.purchases.reduce((sum, p) => sum + p.price + p.tip, 0) : 0;
                        console.log(`[InnKeeperV2] Friendship event: ${event.npc1} & ${event.npc2} bonded and spent ${totalRevenue}c`);
                    }
                } else {
                    // Add other events atomically with duplicate check
                    const updated = await ActiveVCs.findOneAndUpdate(
                        {
                            channelId: channelId,
                            'gameData.events.eventId': { $ne: eventId }
                        },
                        {
                            $push: { 'gameData.events': event },
                            $set: { 'gameData.lastActivity': new Date() },
                            $inc: { 'gameData.eventSequence': 1 }
                        }
                    );
                    
                    if (updated) {
                        console.log(`[InnKeeperV2] Event recorded: ${event.type}`);
                    }
                }
            }
        } catch (error) {
            console.error('[InnKeeperV2] Error generating activity:', error);
        }
    }

    /**
     * Check if we should update display
     */
    shouldUpdateDisplay(channelId, now) {
        const lastMessage = this.messageThrottle.get(channelId) || 0;
        return (now - lastMessage) >= this.config.TIMING.MESSAGE_COOLDOWN;
    }

    /**
     * Update message throttle
     */
    updateMessageThrottle(channelId, now) {
        this.messageThrottle.set(channelId, now);
    }

    /**
     * Calculate effectiveness bonus for a player
     */
    async calculateEffectivenessBonus(memberId, baseSalary) {
        try {
            const playerData = await getPlayerStats(memberId);
            const stats = playerData.stats || {};
            
            const speedStat = stats.speed || 0;
            const sightStat = stats.sight || 0;
            const luckStat = stats.luck || 0;
            const miningStat = stats.mining || 0;
            
            // Calculate bonuses based on config
            const speedBonus = Math.min(
                speedStat * this.config.STATS.EFFECTIVENESS.SPEED.BONUS_PER_POINT, 
                this.config.STATS.EFFECTIVENESS.SPEED.MAX_BONUS
            );
            
            const sightBonus = Math.min(
                sightStat * this.config.STATS.EFFECTIVENESS.SIGHT.BONUS_PER_POINT,
                this.config.STATS.EFFECTIVENESS.SIGHT.MAX_BONUS
            );
            
            const luckBonus = Math.min(
                luckStat * this.config.STATS.EFFECTIVENESS.LUCK.BONUS_PER_POINT,
                this.config.STATS.EFFECTIVENESS.LUCK.MAX_BONUS
            );
            
            const strengthBonus = Math.min(
                miningStat * this.config.STATS.EFFECTIVENESS.MINING.BONUS_PER_POINT,
                this.config.STATS.EFFECTIVENESS.MINING.MAX_BONUS
            );
            
            const effectivenessMultiplier = 1 + speedBonus + sightBonus + luckBonus + strengthBonus;
            const effectivenessBonus = Math.floor(baseSalary * (effectivenessMultiplier - 1));
            
            // Determine performance tier
            const totalStats = speedStat + sightStat;
            let performanceTier = 'average';
            
            for (const [tier, range] of Object.entries(this.config.STATS.PERFORMANCE_TIERS)) {
                if (totalStats >= range.MIN && totalStats < range.MAX) {
                    performanceTier = tier.toLowerCase();
                    break;
                }
            }
            
            return {
                bonus: effectivenessBonus,
                speedStat, sightStat, luckStat, miningStat,
                speedBonus: Math.floor(speedBonus * 100),
                sightBonus: Math.floor(sightBonus * 100),
                luckBonus: Math.floor(luckBonus * 100),
                strengthBonus: Math.floor(strengthBonus * 100),
                multiplier: effectivenessMultiplier,
                performanceTier
            };
        } catch (error) {
            console.error('[InnKeeperV2] Error calculating effectiveness:', error);
            return {
                bonus: 0,
                speedStat: 0, sightStat: 0, luckStat: 0, miningStat: 0,
                speedBonus: 0, sightBonus: 0, luckBonus: 0, strengthBonus: 0,
                multiplier: 1,
                performanceTier: 'average'
            };
        }
    }

    /**
     * Calculate base salary based on power level
     */
    calculateBaseSalary(power) {
        return 100 * Math.pow(2, power - 1);
    }

    /**
     * Distribute profits with atomic operations and idempotency
     */
    async distributeProfitsAtomic(channel, channelId) {
        try {
            const voiceChannel = channel.guild.channels.cache.get(channel.id);
            if (!voiceChannel || !voiceChannel.isVoiceBased()) {
                console.log('[InnKeeperV2] No voice channel for profit distribution');
                return;
            }

            const membersInVC = Array.from(voiceChannel.members.values())
                .filter(member => !member.user.bot);

            if (membersInVC.length === 0) {
                console.log('[InnKeeperV2] No members in voice channel');
                return;
            }

            // Generate distribution ID for idempotency
            const distributionId = `dist-${channelId}-${Date.now()}-${Math.random()}`;
            
            // Get and lock data for distribution - always distribute (for base salary)
            const lockedData = await ActiveVCs.findOneAndUpdate(
                {
                    channelId: channelId,
                    'gameData.lastDistributionId': { $ne: distributionId }
                },
                {
                    $set: {
                        'gameData.lastDistributionId': distributionId,
                        'gameData.distributionInProgress': true
                    }
                },
                {
                    new: false // Return original data
                }
            );
            
            if (!lockedData) {
                console.log('[InnKeeperV2] Already distributed or channel not found');
                return;
            }
            
            console.log(`[InnKeeperV2] Starting profit distribution with ${lockedData.gameData.sales?.length || 0} sales and ${lockedData.gameData.events?.length || 0} events`);

            // Get server data
            const serverData = gachaServers.find(s => s.id === String(lockedData.typeId));
            const serverPower = serverData?.power || 1;
            const baseSalary = this.calculateBaseSalary(serverPower);
            const shopInfo = shops.find(s => s.id === serverData?.shop);
            
            // Get innkeeper's profit margin (default to 10% if not specified)
            const innkeeperMargin = serverData?.profitMargins || 0.1;

            // Calculate totals from sales and events
            const sales = lockedData.gameData.sales || [];
            const events = lockedData.gameData.events || [];
            
            const totalSales = sales.reduce((sum, sale) => sum + (sale.price || 0), 0);
            const totalProfit = sales.reduce((sum, sale) => sum + (sale.profit || 0), 0);
            const totalTips = sales.reduce((sum, sale) => sum + (sale.tip || 0), 0);
            
            // Calculate event costs
            const eventCosts = events.reduce((sum, event) => sum + (event.cost || 0), 0);
            
            // Calculate synergy bonus
            let synergyBonus = 0;
            if (membersInVC.length > 1 && this.config.ECONOMY.SYNERGY.ENABLED) {
                const synergyMultiplier = 1 + (Math.log(membersInVC.length) * this.config.ECONOMY.SYNERGY.MULTIPLIER);
                synergyBonus = Math.floor((totalProfit + totalTips) * (synergyMultiplier - 1));
            }
            
            // Calculate gross total before innkeeper's cut
            const grossTotal = totalProfit + totalTips + synergyBonus - eventCosts;
            
            // Calculate innkeeper's cut (only from positive earnings)
            const innkeeperCut = grossTotal > 0 ? Math.floor(grossTotal * innkeeperMargin) : 0;
            
            // Net total for distribution to players
            const grandTotal = grossTotal - innkeeperCut;
            
            // Initialize earnings for each member
            const earnings = {};
            for (const member of membersInVC) {
                const effectivenessData = await this.calculateEffectivenessBonus(member.id, baseSalary);
                earnings[member.id] = {
                    member: member,
                    base: 0,
                    tips: 0,
                    salary: baseSalary,
                    effectivenessBonus: effectivenessData.bonus,
                    ...effectivenessData,
                    total: baseSalary + effectivenessData.bonus
                };
            }

            // Distribute profits from sales
            for (const sale of sales) {
                const eligibleMembers = sale.isNPC ? 
                    Object.keys(earnings) : 
                    Object.keys(earnings).filter(id => id !== sale.buyer);
                
                if (eligibleMembers.length > 0) {
                    const profitPerMember = Math.floor((sale.profit || 0) / eligibleMembers.length);
                    const tipPerMember = Math.floor((sale.tip || 0) / eligibleMembers.length);
                    
                    eligibleMembers.forEach(memberId => {
                        earnings[memberId].base += profitPerMember;
                        earnings[memberId].tips += tipPerMember;
                        earnings[memberId].total += profitPerMember + tipPerMember;
                    });
                }
            }
            
            // Add synergy bonus
            if (synergyBonus > 0) {
                const bonusPerMember = Math.floor(synergyBonus / membersInVC.length);
                Object.values(earnings).forEach(earning => {
                    earning.total += bonusPerMember;
                });
            }
            
            // Deduct event costs
            if (eventCosts > 0) {
                const costPerMember = Math.floor(eventCosts / membersInVC.length);
                Object.values(earnings).forEach(earning => {
                    earning.total = Math.max(0, earning.total - costPerMember);
                });
            }

            // Select Employee of the Day if multiple workers
            let employeeOfTheDay = null;
            if (membersInVC.length > 1 && this.config.EMPLOYEE_OF_DAY.ENABLED) {
                employeeOfTheDay = membersInVC[Math.floor(Math.random() * membersInVC.length)];
                earnings[employeeOfTheDay.id].total *= this.config.EMPLOYEE_OF_DAY.BONUS_MULTIPLIER;
                earnings[employeeOfTheDay.id].isEmployeeOfDay = true;
            }

            // Award the earnings with atomic operations
            const updatePromises = [];
            for (const [memberId, earningData] of Object.entries(earnings)) {
                updatePromises.push(
                    Money.findOneAndUpdate(
                        { userId: memberId },
                        { 
                            $inc: { money: earningData.total },
                            $set: { usertag: earningData.member.user.tag }
                        },
                        { upsert: true, new: true }
                    )
                );
            }
            
            await Promise.all(updatePromises);

            // Show profit report
            await this.displayManager.showProfitReport(channel, {
                earnings: Object.values(earnings),
                employeeOfTheDay,
                sales,
                events,
                totalSales,
                totalProfit,
                totalTips,
                eventCosts,
                synergyBonus,
                grossTotal,
                innkeeperCut,
                innkeeperMargin,
                grandTotal,
                shopInfo,
                serverPower,
                serverData
            });

            // Clear data after distribution with atomic operation
            await ActiveVCs.findOneAndUpdate(
                {
                    channelId: channelId,
                    'gameData.lastDistributionId': distributionId
                },
                {
                    $set: {
                        'gameData.sales': [],
                        'gameData.events': [],
                        'gameData.lastProfitDistribution': new Date(),
                        'gameData.distributionInProgress': false
                    }
                }
            );
            
            console.log(`[InnKeeperV2] Distributed ${grandTotal} coins among ${membersInVC.length} workers (after ${innkeeperCut}c innkeeper cut from ${grossTotal}c gross)`);
            
        } catch (error) {
            console.error('[InnKeeperV2] Error distributing profits:', error);
            
            // Clear distribution lock on error
            await ActiveVCs.findOneAndUpdate(
                { channelId: channelId },
                {
                    $set: {
                        'gameData.distributionInProgress': false
                    }
                }
            );
        }
    }

    /**
     * Check and refresh shop inventory if needed
     */
    async checkAndRefreshShop(channelId, dbEntry, now) {
        try {
            // Check if nextShopRefresh exists and if it's time to refresh
            const nextShopRefresh = dbEntry.gameData?.nextShopRefresh;
            
            if (!nextShopRefresh || new Date(nextShopRefresh).getTime() <= now) {
                console.log('[InnKeeperV2] Shop refresh needed - generating new inventory');
                
                // Get server and shop data
                const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
                if (!serverData) {
                    console.error('[InnKeeperV2] No server data found for shop refresh');
                    return;
                }
                
                const shopData = shops.find(s => s.id === serverData.shop);
                if (!shopData) {
                    console.error('[InnKeeperV2] No shop data found for shop refresh');
                    return;
                }
                
                // Generate new rotational items from the item pool
                const rotationalItems = [];
                const itemPoolCopy = [...shopData.itemPool];
                const rotationalAmount = shopData.rotationalAmount || 3;
                
                // Randomly select items from the pool
                for (let i = 0; i < rotationalAmount && itemPoolCopy.length > 0; i++) {
                    const randomIndex = Math.floor(Math.random() * itemPoolCopy.length);
                    const selectedItem = itemPoolCopy.splice(randomIndex, 1)[0];
                    rotationalItems.push(selectedItem);
                }
                
                // Update database with new shop inventory and next refresh time
                const nextRefreshTime = new Date(now + 25 * 60 * 1000); // 25 minutes from now
                
                const updated = await ActiveVCs.findOneAndUpdate(
                    { channelId: channelId },
                    {
                        $set: {
                            'gameData.nextShopRefresh': nextRefreshTime,
                            'gameData.currentRotationalItems': rotationalItems,
                            'gameData.lastShopGeneration': new Date()
                        }
                    },
                    { new: true }
                );
                
                if (updated) {
                    console.log(`[InnKeeperV2] Shop refreshed with ${rotationalItems.length} new items. Next refresh at ${nextRefreshTime.toISOString()}`);
                    console.log(`[InnKeeperV2] New rotational items: ${rotationalItems.join(', ')}`);
                } else {
                    console.error('[InnKeeperV2] Failed to update shop inventory');
                }
            } else {
                // Log time until next refresh
                const timeUntilRefresh = new Date(nextShopRefresh).getTime() - now;
                const minutesUntilRefresh = Math.ceil(timeUntilRefresh / 60000);
                console.log(`[InnKeeperV2] Shop refresh in ${minutesUntilRefresh} minutes`);
            }
        } catch (error) {
            console.error('[InnKeeperV2] Error checking/refreshing shop:', error);
        }
    }

    /**
     * Schedule next cycle with atomic operation - FIXED
     */
    async scheduleNextCycleAtomic(channelId, now) {
        // Get current state
        const current = await ActiveVCs.findOne(
            { channelId: channelId },
            { 'gameData': 1 }
        );
        
        if (!current || !current.gameData) return;
        
        let nextTriggerDelay;
        
        // If we're in working state, check work duration
        if (current.gameData.workState === 'working') {
            const workStartTime = new Date(current.gameData.workStartTime).getTime();
            const timeSinceWorkStart = now - workStartTime;
            const timeUntilBreak = this.config.TIMING.WORK_DURATION - timeSinceWorkStart;
            
            console.log(`[InnKeeperV2] Time until break: ${Math.round(timeUntilBreak / 60000)} minutes`);
            
            if (timeUntilBreak <= 60000) {
                // Less than 1 minute until break, check frequently
                nextTriggerDelay = 5000; // Check every 5 seconds
                console.log('[InnKeeperV2] Less than 1 minute until break, checking frequently');
            } else if (timeUntilBreak <= 120000) {
                // Less than 2 minutes until break
                nextTriggerDelay = 10000; // Check every 10 seconds
            } else if (timeUntilBreak <= 300000) {
                // Less than 5 minutes until break
                nextTriggerDelay = 20000; // Check every 20 seconds
            } else {
                // Normal activity cycle
                const timeSinceLastActivity = now - new Date(current.gameData.lastActivity || 0).getTime();
                
                if (timeSinceLastActivity >= this.config.TIMING.ACTIVITY_GUARANTEE - 10000) {
                    nextTriggerDelay = 5000; // Check soon if close to guarantee
                } else {
                    const min = this.config.TIMING.DEFAULT_CYCLE_DELAY.MIN;
                    const max = this.config.TIMING.DEFAULT_CYCLE_DELAY.MAX;
                    nextTriggerDelay = min + Math.random() * (max - min);
                }
            }
        } else if (current.gameData.workState === 'break') {
            // During break, check based on break end time
            const breakEndTime = new Date(current.gameData.breakEndTime).getTime();
            const timeUntilWorkResumes = breakEndTime - now;
            
            if (timeUntilWorkResumes <= 10000) {
                nextTriggerDelay = 2000;
            } else if (timeUntilWorkResumes <= 30000) {
                nextTriggerDelay = 5000;
            } else {
                nextTriggerDelay = 20000;
            }
        } else {
            // Default for transitioning or other states
            nextTriggerDelay = 5000;
        }
        
        await ActiveVCs.findOneAndUpdate(
            { channelId: channelId },
            { 
                $set: { 
                    nextTrigger: new Date(now + nextTriggerDelay)
                }
            }
        );
        
        console.log(`[InnKeeperV2] Next trigger in ${Math.round(nextTriggerDelay/1000)}s (state: ${current.gameData.workState})`);
    }
}

// Export as a function that matches the expected interface
module.exports = async (channel, dbEntry, json) => {
    const controller = new InnKeeperController();
    await controller.runCycle(channel, dbEntry, json);
};

// Also export the class for testing
module.exports.InnKeeperController = InnKeeperController;

// Export recovery function for manual intervention
module.exports.recoverInn = async (channel, dbEntry) => {
    console.log('[InnKeeperV2] Manual recovery initiated');
    const controller = new InnKeeperController();
    const now = Date.now();
    
    // Force clear any locks
    await ActiveVCs.findOneAndUpdate(
        { channelId: dbEntry.channelId },
        {
            $unset: {
                'gameData.lockExpiry': 1,
                'gameData.lockId': 1,
                'gameData.distributionInProgress': 1
            }
        }
    );
    
    return await controller.recoverStuckInn(channel, dbEntry, now);
};

// Export status check function
module.exports.getInnStatus = async (dbEntry) => {
    if (!dbEntry || !dbEntry.gameData) {
        return { status: 'uninitialized', message: 'Inn not initialized' };
    }
    
    const now = Date.now();
    const gameData = dbEntry.gameData;
    const nextTriggerTime = new Date(dbEntry.nextTrigger).getTime();
    const timeSinceScheduled = now - nextTriggerTime;
    
    // Check for locks
    if (gameData.lockExpiry && new Date(gameData.lockExpiry).getTime() > now) {
        return {
            status: 'locked',
            message: `Inn is currently being processed (lock expires in ${Math.round((new Date(gameData.lockExpiry).getTime() - now) / 1000)}s)`,
            lockId: gameData.lockId,
            lockExpiry: gameData.lockExpiry
        };
    }
    
    if (timeSinceScheduled > 10 * 60 * 1000) { // 10 minutes overdue
        return {
            status: 'stuck',
            message: `Inn stuck for ${Math.round(timeSinceScheduled / 60000)} minutes`,
            workState: gameData.workState,
            nextTrigger: new Date(dbEntry.nextTrigger).toISOString(),
            stateVersion: gameData.stateVersion
        };
    }
    
    if (gameData.workState === 'break') {
        const breakTimeLeft = gameData.breakEndTime ? 
            Math.max(0, Math.ceil((new Date(gameData.breakEndTime).getTime() - now) / 60000)) : 0;
        return {
            status: 'on_break',
            message: `On break for ${breakTimeLeft} more minutes`,
            breakEndTime: gameData.breakEndTime,
            stateVersion: gameData.stateVersion
        };
    }
    
    const workStartTime = new Date(gameData.workStartTime).getTime();
    const workTimeElapsed = Math.floor((now - workStartTime) / 60000);
    const workTimeRemaining = Math.max(0, 25 - workTimeElapsed);
    
    return {
        status: 'working',
        message: `Working - ${workTimeRemaining} minutes until break`,
        workTimeElapsed,
        nextTrigger: new Date(dbEntry.nextTrigger).toISOString(),
        stateVersion: gameData.stateVersion,
        eventSequence: gameData.eventSequence || 0,
        retryCount: gameData.retryCount || 0
    };
};

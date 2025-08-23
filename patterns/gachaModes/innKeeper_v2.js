// InnKeeper v2.0 - Centralized and refactored inn management system
// Main controller that orchestrates all inn operations

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
    }

    /**
     * Recovery method to restart stuck inns
     */
    async recoverStuckInn(channel, dbEntry, now) {
        console.log('[InnKeeperV2] Attempting to recover stuck inn...');
        
        try {
            const gameData = dbEntry.gameData;
            
            // Check if we're in an undefined state or if nextTrigger is way overdue
            const overdueTime = 5 * 60 * 1000; // 5 minutes overdue
            const nextTriggerTime = new Date(dbEntry.nextTrigger).getTime();
            const isOverdue = now - nextTriggerTime > overdueTime;
            
            if (isOverdue) {
                console.log(`[InnKeeperV2] Inn is ${Math.round((now - nextTriggerTime) / 60000)} minutes overdue`);
            }
            
            // Reset to a known good state
            if (gameData.workState === 'break') {
                // If we're supposed to be on break, check if break should have ended
                if (gameData.breakEndTime && now >= new Date(gameData.breakEndTime).getTime()) {
                    console.log('[InnKeeperV2] Recovery: Ending overdue break');
                    await this.endBreak(channel, dbEntry, now);
                } else {
                    // Continue the break properly
                    console.log('[InnKeeperV2] Recovery: Continuing valid break');
                    await this.continueBreak(dbEntry, now);
                }
            } else {
                // Reset to working state
                console.log('[InnKeeperV2] Recovery: Resetting to working state');
                gameData.workState = 'working';
                gameData.workStartTime = new Date();
                gameData.breakEndTime = null;
                
                // Clear any stuck data
                if (!gameData.sales) gameData.sales = [];
                if (!gameData.events) gameData.events = [];
                
                // Schedule immediate activity
                dbEntry.nextTrigger = new Date(now + 5000); // 5 seconds
                dbEntry.markModified('gameData');
                await dbEntry.save();
                
                // Send recovery message
                const embed = new EmbedBuilder()
                    .setTitle('🔄 Inn System Recovered')
                    .setColor(this.config.DISPLAY.COLORS.SUCCESS_GREEN)
                    .setDescription('The inn is back online and ready for business!')
                    .setTimestamp();
                    
                try {
                    await channel.send({ embeds: [embed] });
                } catch (e) {
                    console.error('[InnKeeperV2] Could not send recovery message:', e);
                }
            }
            
            console.log('[InnKeeperV2] Inn recovery completed successfully');
            return true;
            
        } catch (error) {
            console.error('[InnKeeperV2] Error during inn recovery:', error);
            // Last resort: minimal reset
            try {
                dbEntry.nextTrigger = new Date(now + 30000); // 30 seconds
                await dbEntry.save();
            } catch (saveError) {
                console.error('[InnKeeperV2] Critical: Could not save recovery state:', saveError);
            }
            return false;
        }
    }

    /**
     * Main entry point - called by the game mode system
     */
    async runCycle(channel, dbEntry, json) {
        const now = Date.now();
        
        console.log(`[InnKeeperV2] Starting cycle for channel ${dbEntry.channelId}`);
        
        try {
            // Initialize game data if needed
            if (!this.isInitialized(dbEntry)) {
                await this.initializeGameData(dbEntry);
            }
            
            // Check if inn might be stuck (nextTrigger is very overdue)
            const nextTriggerTime = new Date(dbEntry.nextTrigger).getTime();
            const timeSinceScheduled = now - nextTriggerTime;
            const overdueThreshold = 10 * 60 * 1000; // 10 minutes
            
            if (timeSinceScheduled > overdueThreshold) {
                console.log(`[InnKeeperV2] Detected stuck inn - ${Math.round(timeSinceScheduled / 60000)} minutes overdue`);
                const recovered = await this.recoverStuckInn(channel, dbEntry, now);
                if (recovered) {
                    return; // Recovery method handles scheduling
                }
                // If recovery failed, continue with normal cycle
            }

            // Check work/break state
            const workState = await this.checkWorkState(channel, dbEntry, now);
            if (workState.shouldReturn) return;

            // Generate activity if needed
            if (this.shouldGenerateActivity(dbEntry, now)) {
                await this.generateActivity(channel, dbEntry, now);
            }

            // Update display if not throttled
            if (this.shouldUpdateDisplay(channel.id, now)) {
                await this.displayManager.update(channel, dbEntry);
                this.updateMessageThrottle(channel.id, now);
            }

            // Schedule next cycle
            await this.scheduleNextCycle(dbEntry, now);
            
        } catch (error) {
            console.error(`[InnKeeperV2] Error in cycle for ${dbEntry.channelId}:`, error);
            // Schedule next cycle even on error
            dbEntry.nextTrigger = new Date(now + 30000); // 30 seconds
            await dbEntry.save();
        }
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
     * Initialize game data structure
     */
    async initializeGameData(dbEntry) {
        console.log('[InnKeeperV2] Initializing new game data');
        
        dbEntry.gameData = {
            gamemode: 'innkeeper',
            sales: [],
            events: [],
            lastProfitDistribution: new Date(),
            lastActivity: new Date(),
            lastShopGeneration: new Date(Date.now() - 5 * 60 * 1000),
            workState: 'working',
            workStartTime: new Date(),
            breakEndTime: null
        };
        
        dbEntry.markModified('gameData');
        await dbEntry.save();
    }

    /**
     * Check and handle work/break states
     */
    async checkWorkState(channel, dbEntry, now) {
        const gameData = dbEntry.gameData;
        
        // Handle break state
        if (gameData.workState === 'break') {
            if (this.isBreakOver(gameData, now)) {
                await this.endBreak(channel, dbEntry, now);
                return { shouldReturn: false };
            } else {
                await this.continueBreak(dbEntry, now);
                return { shouldReturn: true };
            }
        }
        
        // Check if work period is complete
        if (this.isWorkPeriodComplete(gameData, now)) {
            await this.startBreak(channel, dbEntry, now);
            return { shouldReturn: true };
        }
        
        return { shouldReturn: false };
    }

    /**
     * Check if break period is over
     */
    isBreakOver(gameData, now) {
        return gameData.breakEndTime && now >= new Date(gameData.breakEndTime).getTime();
    }

    /**
     * End break and resume work
     */
    async endBreak(channel, dbEntry, now) {
        console.log('[InnKeeperV2] Break ending, resuming work');
        
        try {
            dbEntry.gameData.workState = 'working';
            dbEntry.gameData.workStartTime = new Date();
            dbEntry.gameData.breakEndTime = null;
            dbEntry.gameData.sales = [];
            dbEntry.gameData.events = [];
            
            const embed = new EmbedBuilder()
                .setTitle('🔔 The Inn Reopens!')
                .setColor(this.config.DISPLAY.COLORS.SUCCESS_GREEN)
                .setDescription('Break time is over! The inn is now open for business again.')
                .setTimestamp();
                
            // Try to send reopen message
            try {
                await channel.send({ embeds: [embed] });
                console.log('[InnKeeperV2] Reopen message sent successfully');
            } catch (messageError) {
                console.error('[InnKeeperV2] Failed to send reopen message:', messageError);
                // Continue with resuming work even if message fails
            }
            
            dbEntry.nextTrigger = new Date(now + 10000);
            dbEntry.markModified('gameData');
            await dbEntry.save();
            
            console.log('[InnKeeperV2] Inn successfully reopened and scheduled next cycle');
            
        } catch (error) {
            console.error('[InnKeeperV2] Error ending break:', error);
            // Fallback: try to continue anyway
            dbEntry.nextTrigger = new Date(now + 30000); // Retry in 30 seconds
            dbEntry.markModified('gameData');
            await dbEntry.save();
        }
    }

    /**
     * Continue break period
     */
    async continueBreak(dbEntry, now) {
        const breakTimeLeft = Math.ceil(
            (new Date(dbEntry.gameData.breakEndTime).getTime() - now) / 60000
        );
        
        console.log(`[InnKeeperV2] On break for ${breakTimeLeft} more minutes`);
        
        const nextCheck = Math.min(
            30000, 
            new Date(dbEntry.gameData.breakEndTime).getTime() - now
        );
        
        dbEntry.nextTrigger = new Date(now + nextCheck);
        dbEntry.markModified('gameData');
        await dbEntry.save();
    }

    /**
     * Check if work period is complete
     */
    isWorkPeriodComplete(gameData, now) {
        const workStartTime = new Date(gameData.workStartTime).getTime();
        const timeSinceWorkStart = now - workStartTime;
        return timeSinceWorkStart >= this.config.TIMING.WORK_DURATION && 
               gameData.workState === 'working';
    }

    /**
     * Start break period
     */
    async startBreak(channel, dbEntry, now) {
        console.log('[InnKeeperV2] Work day complete, starting break');
        
        try {
            // Distribute profits before break
            if (dbEntry.gameData.sales.length > 0 || dbEntry.gameData.events.length > 0) {
                await this.distributeProfits(channel, dbEntry);
            }
            
            // Set break state
            dbEntry.gameData.workState = 'break';
            dbEntry.gameData.breakEndTime = new Date(now + this.config.TIMING.BREAK_DURATION);
            dbEntry.gameData.sales = [];
            dbEntry.gameData.events = [];
            
            const embed = new EmbedBuilder()
                .setTitle('☕ Break Time!')
                .setColor(this.config.DISPLAY.COLORS.BREAK_ORANGE)
                .setDescription('The inn is closing for a 5-minute break. Workers deserve some rest!')
                .addFields(
                    { name: 'Break Duration', value: '5 minutes', inline: true },
                    { name: 'Reopening At', value: `<t:${Math.floor((now + this.config.TIMING.BREAK_DURATION) / 1000)}:R>`, inline: true }
                )
                .setTimestamp();
                
            // Try to send break message
            try {
                await channel.send({ embeds: [embed] });
                console.log('[InnKeeperV2] Break message sent successfully');
            } catch (messageError) {
                console.error('[InnKeeperV2] Failed to send break message:', messageError);
                // Continue with break even if message fails
            }
            
            dbEntry.nextTrigger = new Date(now + this.config.TIMING.BREAK_DURATION);
            dbEntry.markModified('gameData');
            await dbEntry.save();
            
            console.log(`[InnKeeperV2] Break scheduled to end at ${new Date(now + this.config.TIMING.BREAK_DURATION).toISOString()}`);
            
        } catch (error) {
            console.error('[InnKeeperV2] Error starting break:', error);
            // Fallback: set a short retry instead of breaking completely
            dbEntry.nextTrigger = new Date(now + 60000); // Retry in 1 minute
            dbEntry.markModified('gameData');
            await dbEntry.save();
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
     * Generate activity (delegate to EventManager)
     */
    async generateActivity(channel, dbEntry, now) {
        try {
            const event = await this.eventManager.generateEvent(channel, dbEntry);
            
            if (event) {
                // Update last activity
                dbEntry.gameData.lastActivity = new Date();
                
                // Handle different event types
                if (event.type === 'npcSale') {
                    // Record NPC sale
                    if (!dbEntry.gameData.sales) dbEntry.gameData.sales = [];
                    dbEntry.gameData.sales.push(event.saleData);
                    console.log(`[InnKeeperV2] NPC sale: ${event.saleData.buyerName} bought item for ${event.saleData.price}c`);
                } else {
                    // Record other events
                    if (!dbEntry.gameData.events) dbEntry.gameData.events = [];
                    dbEntry.gameData.events.push(event);
                    console.log(`[InnKeeperV2] Event: ${event.type}`);
                }
                
                dbEntry.markModified('gameData');
                await dbEntry.save();
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
     * Distribute profits to workers
     */
    async distributeProfits(channel, dbEntry) {
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

            // Get server data
            const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
            const serverPower = serverData?.power || 1;
            const baseSalary = this.calculateBaseSalary(serverPower);
            const shopInfo = shops.find(s => s.id === serverData?.shop);

            // Calculate totals from sales and events
            const sales = dbEntry.gameData.sales || [];
            const events = dbEntry.gameData.events || [];
            
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
            
            const grandTotal = totalProfit + totalTips + synergyBonus - eventCosts;
            
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

            // Award the earnings
            for (const [memberId, earningData] of Object.entries(earnings)) {
                await Money.findOneAndUpdate(
                    { userId: memberId },
                    { 
                        $inc: { money: earningData.total },
                        $set: { usertag: earningData.member.user.tag }
                    },
                    { upsert: true, new: true }
                );
            }

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
                grandTotal,
                shopInfo,
                serverPower
            });

            // Clear data after distribution
            dbEntry.gameData.sales = [];
            dbEntry.gameData.events = [];
            dbEntry.gameData.lastProfitDistribution = new Date();
            dbEntry.markModified('gameData');
            await dbEntry.save();
            
            console.log(`[InnKeeperV2] Distributed ${grandTotal} coins among ${membersInVC.length} workers`);
            
        } catch (error) {
            console.error('[InnKeeperV2] Error distributing profits:', error);
        }
    }

    /**
     * Schedule next cycle
     */
    async scheduleNextCycle(dbEntry, now) {
        const timeSinceLastActivity = now - new Date(dbEntry.gameData.lastActivity || 0).getTime();
        
        let nextTriggerDelay;
        if (timeSinceLastActivity >= this.config.TIMING.ACTIVITY_GUARANTEE - 5000) {
            nextTriggerDelay = 5000; // Check soon if close to guarantee
        } else {
            const min = this.config.TIMING.DEFAULT_CYCLE_DELAY.MIN;
            const max = this.config.TIMING.DEFAULT_CYCLE_DELAY.MAX;
            nextTriggerDelay = min + Math.random() * (max - min);
        }
        
        dbEntry.nextTrigger = new Date(now + nextTriggerDelay);
        dbEntry.markModified('gameData');
        await dbEntry.save();
        
        console.log(`[InnKeeperV2] Next trigger in ${Math.round(nextTriggerDelay/1000)}s`);
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
    
    if (timeSinceScheduled > 10 * 60 * 1000) { // 10 minutes overdue
        return {
            status: 'stuck',
            message: `Inn stuck for ${Math.round(timeSinceScheduled / 60000)} minutes`,
            workState: gameData.workState,
            nextTrigger: new Date(dbEntry.nextTrigger).toISOString()
        };
    }
    
    if (gameData.workState === 'break') {
        const breakTimeLeft = gameData.breakEndTime ? 
            Math.max(0, Math.ceil((new Date(gameData.breakEndTime).getTime() - now) / 60000)) : 0;
        return {
            status: 'on_break',
            message: `On break for ${breakTimeLeft} more minutes`,
            breakEndTime: gameData.breakEndTime
        };
    }
    
    const workStartTime = new Date(gameData.workStartTime).getTime();
    const workTimeElapsed = Math.floor((now - workStartTime) / 60000);
    const workTimeRemaining = Math.max(0, 25 - workTimeElapsed);
    
    return {
        status: 'working',
        message: `Working - ${workTimeRemaining} minutes until break`,
        workTimeElapsed,
        nextTrigger: new Date(dbEntry.nextTrigger).toISOString()
    };
};

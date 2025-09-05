// InnKeeper v3.0 - Enhanced Idle Game Experience
// Features: Progression System, Dynamic Events, Social Interactions, Advanced Automation

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

class InnKeeperV3Controller {
    constructor() {
        this.config = InnConfig;
        this.aiManager = new InnAIManager();
        this.displayManager = new InnDisplayManager();
        this.eventManager = new InnEventManager();
        this.purchaseHandler = new InnPurchaseHandler();
        this.messageThrottle = new Map();
        this.processingLocks = new Map();
        this.retryAttempts = new Map();
        
        // V3 Enhanced Features
        this.innLevels = new Map(); // Track inn levels per channel
        this.playerReputation = new Map(); // Track player reputation
        this.seasonalEvents = new Map(); // Track seasonal events
        this.achievementTracker = new Map(); // Track achievements
        this.automationLevels = new Map(); // Track automation upgrades
    }

    /**
     * Enhanced configuration for V3 features
     */
    getV3Config() {
        return {
            // Progression System
            PROGRESSION: {
                MAX_LEVEL: 50,
                XP_PER_LEVEL: 1000,
                XP_MULTIPLIER: 1.2,
                LEVEL_BONUSES: {
                    PROFIT_BOOST: 0.05, // 5% per level
                    EVENT_FREQUENCY: 0.02, // 2% per level
                    AUTOMATION_EFFICIENCY: 0.03 // 3% per level
                }
            },
            
            // Reputation System
            REPUTATION: {
                MAX_REPUTATION: 1000,
                REPUTATION_GAIN: {
                    SALE: 1,
                    TIP: 2,
                    EVENT_PARTICIPATION: 5,
                    DAILY_BONUS: 10
                },
                REPUTATION_BONUSES: {
                    PROFIT_MULTIPLIER: 0.001, // 0.1% per reputation point
                    RARE_EVENT_CHANCE: 0.0005 // 0.05% per reputation point
                }
            },
            
            // Seasonal Events
            SEASONAL: {
                EVENT_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days
                BONUS_MULTIPLIER: 2.0,
                SPECIAL_ITEMS: true,
                THEMED_EVENTS: true
            },
            
            // Automation System
            AUTOMATION: {
                MAX_LEVEL: 10,
                UPGRADE_COST: 5000, // Base cost
                COST_MULTIPLIER: 1.5,
                EFFICIENCY_BOOST: 0.1 // 10% per level
            },
            
            // Enhanced Events
            ENHANCED_EVENTS: {
                RARE_EVENT_CHANCE: 0.05, // 5% base chance
                LEGENDARY_EVENT_CHANCE: 0.01, // 1% base chance
                EVENT_COOLDOWN: 30000, // 30 seconds between events
                MAX_CONCURRENT_EVENTS: 3
            }
        };
    }

    /**
     * Main processing loop with V3 enhancements
     */
    async processInn(channel, dbEntry, now) {
        const channelId = channel.id;
        
        try {
            // Acquire lock with enhanced timeout
            const lockAcquired = await this.acquireLock(channelId, 45000);
            if (!lockAcquired) {
                console.log(`[InnKeeperV3] Could not acquire lock for ${channelId}, skipping cycle`);
                return;
            }

            try {
                // Initialize V3 features if needed
                await this.initializeV3Features(channelId, dbEntry, now);
                
                // Check and refresh shop with level bonuses
                await this.checkAndRefreshShopV3(channelId, dbEntry, now);
                
                // Enhanced work/break state management
                const workState = await this.checkWorkStateV3(channel, channelId, now);
                if (workState.shouldReturn) {
                    return;
                }
                
                // Generate enhanced activities
                if (this.shouldGenerateActivityV3(dbEntry, now)) {
                    await this.generateActivityV3(channel, channelId, now);
                }
                
                // Update enhanced display
                if (this.shouldUpdateDisplay(channelId, now)) {
                    await this.updateDisplayV3(channel, dbEntry, now);
                }
                
                // Process seasonal events
                await this.processSeasonalEvents(channel, dbEntry, now);
                
                // Update player reputations
                await this.updatePlayerReputations(channelId, dbEntry, now);
                
                // Check and award achievements
                await this.checkAchievements(channel, dbEntry, now);
                
                // Process automation upgrades
                await this.processAutomation(channelId, dbEntry, now);
                
            } finally {
                await this.releaseLock(channelId);
            }
            
        } catch (error) {
            console.error(`[InnKeeperV3] Error processing inn ${channelId}:`, error);
            await this.handleError(channelId, error);
        }
    }

    /**
     * Initialize V3 features for a channel
     */
    async initializeV3Features(channelId, dbEntry, now) {
        if (!dbEntry.gameData.v3Features) {
            const v3Features = {
                innLevel: 1,
                totalXP: 0,
                playerReputations: {},
                seasonalEvent: null,
                achievements: [],
                automationLevel: 0,
                lastReputationUpdate: now,
                lastAchievementCheck: now,
                totalSales: 0,
                totalProfit: 0,
                consecutiveDays: 0,
                lastDailyBonus: now
            };
            
            await ActiveVCs.findOneAndUpdate(
                { channelId: channelId },
                { $set: { 'gameData.v3Features': v3Features } }
            );
            
            console.log(`[InnKeeperV3] Initialized V3 features for channel ${channelId}`);
        }
    }

    /**
     * Enhanced shop refresh with level bonuses
     */
    async checkAndRefreshShopV3(channelId, dbEntry, now) {
        const v3Features = dbEntry.gameData.v3Features;
        const innLevel = v3Features?.innLevel || 1;
        
        // Calculate level-based bonuses
        const profitBoost = 1 + (innLevel - 1) * this.getV3Config().PROGRESSION.LEVEL_BONUSES.PROFIT_BOOST;
        const eventFrequency = 1 + (innLevel - 1) * this.getV3Config().PROGRESSION.LEVEL_BONUSES.EVENT_FREQUENCY;
        
        // Apply bonuses to shop generation
        if (this.shouldRefreshShop(dbEntry, now)) {
            await this.generateShopV3(channel, dbEntry, now, profitBoost, eventFrequency);
        }
    }

    /**
     * Enhanced work state management with automation
     */
    async checkWorkStateV3(channel, channelId, now) {
        const dbEntry = await ActiveVCs.findOne({ channelId: channelId });
        if (!dbEntry || !dbEntry.gameData) {
            return { shouldReturn: true };
        }
        
        const v3Features = dbEntry.gameData.v3Features;
        const automationLevel = v3Features?.automationLevel || 0;
        
        // Apply automation efficiency
        const automationEfficiency = 1 + (automationLevel * this.getV3Config().AUTOMATION.EFFICIENCY_BOOST);
        const effectiveWorkDuration = this.config.TIMING.WORK_DURATION / automationEfficiency;
        
        // Check if work period is complete with automation
        if (this.isWorkPeriodCompleteV3(dbEntry, now, effectiveWorkDuration)) {
            await this.startBreakV3(channel, channelId, now);
            return { shouldReturn: true };
        }
        
        return { shouldReturn: false };
    }

    /**
     * Enhanced activity generation with reputation and level bonuses
     */
    async generateActivityV3(channel, channelId, now) {
        const dbEntry = await ActiveVCs.findOne({ channelId: channelId });
        const v3Features = dbEntry.gameData.v3Features;
        
        // Calculate enhanced event chances
        const baseEventChance = this.config.EVENTS.BASE_EVENT_CHANCE || 0.1;
        const levelBonus = (v3Features.innLevel - 1) * this.getV3Config().PROGRESSION.LEVEL_BONUSES.EVENT_FREQUENCY;
        const reputationBonus = this.calculateReputationBonus(v3Features.playerReputations);
        const seasonalBonus = this.getSeasonalEventBonus(v3Features.seasonalEvent);
        
        const totalEventChance = baseEventChance + levelBonus + reputationBonus + seasonalBonus;
        
        // Generate events based on enhanced chances
        if (Math.random() < totalEventChance) {
            await this.generateEnhancedEvent(channel, dbEntry, now);
        }
        
        // Generate regular sales with level bonuses
        await this.generateSalesV3(channel, dbEntry, now);
    }

    /**
     * Generate enhanced events with rarity system
     */
    async generateEnhancedEvent(channel, dbEntry, now) {
        const v3Features = dbEntry.gameData.v3Features;
        const reputationBonus = this.calculateReputationBonus(v3Features.playerReputations);
        
        // Determine event rarity
        const rareChance = this.getV3Config().ENHANCED_EVENTS.RARE_EVENT_CHANCE + (reputationBonus * 0.01);
        const legendaryChance = this.getV3Config().ENHANCED_EVENTS.LEGENDARY_EVENT_CHANCE + (reputationBonus * 0.005);
        
        let eventType = 'common';
        if (Math.random() < legendaryChance) {
            eventType = 'legendary';
        } else if (Math.random() < rareChance) {
            eventType = 'rare';
        }
        
        // Generate event based on type
        switch (eventType) {
            case 'legendary':
                await this.generateLegendaryEvent(channel, dbEntry, now);
                break;
            case 'rare':
                await this.generateRareEvent(channel, dbEntry, now);
                break;
            default:
                await this.generateCommonEvent(channel, dbEntry, now);
        }
    }

    /**
     * Generate legendary events with massive rewards
     */
    async generateLegendaryEvent(channel, dbEntry, now) {
        const events = [
            {
                name: "🏆 Celebrity Visit",
                description: "A famous adventurer has arrived and is spending lavishly!",
                profitMultiplier: 5.0,
                xpBonus: 100,
                reputationBonus: 20
            },
            {
                name: "💎 Treasure Hunter's Stop",
                description: "A treasure hunter is selling rare artifacts at premium prices!",
                profitMultiplier: 3.0,
                xpBonus: 75,
                reputationBonus: 15
            },
            {
                name: "🎭 Royal Delegation",
                description: "Royalty has arrived with their entourage for a grand feast!",
                profitMultiplier: 4.0,
                xpBonus: 90,
                reputationBonus: 18
            }
        ];
        
        const event = events[Math.floor(Math.random() * events.length)];
        await this.executeEvent(channel, dbEntry, now, event);
    }

    /**
     * Generate rare events with good rewards
     */
    async generateRareEvent(channel, dbEntry, now) {
        const events = [
            {
                name: "🎪 Traveling Merchant",
                description: "A traveling merchant has set up shop with exotic goods!",
                profitMultiplier: 2.0,
                xpBonus: 50,
                reputationBonus: 10
            },
            {
                name: "🍺 Festival Celebration",
                description: "The town is celebrating a festival - everyone's in a spending mood!",
                profitMultiplier: 1.8,
                xpBonus: 40,
                reputationBonus: 8
            },
            {
                name: "⚔️ Adventurer's Guild Meeting",
                description: "The local adventurer's guild is holding a meeting here!",
                profitMultiplier: 1.6,
                xpBonus: 35,
                reputationBonus: 7
            }
        ];
        
        const event = events[Math.floor(Math.random() * events.length)];
        await this.executeEvent(channel, dbEntry, now, event);
    }

    /**
     * Generate common events with standard rewards
     */
    async generateCommonEvent(channel, dbEntry, now) {
        const events = [
            {
                name: "👥 Local Gathering",
                description: "A group of locals has gathered for drinks and conversation.",
                profitMultiplier: 1.2,
                xpBonus: 20,
                reputationBonus: 3
            },
            {
                name: "🌅 Morning Rush",
                description: "Early morning travelers are stopping by for breakfast.",
                profitMultiplier: 1.1,
                xpBonus: 15,
                reputationBonus: 2
            },
            {
                name: "🌙 Evening Wind-down",
                description: "Evening patrons are relaxing after a long day.",
                profitMultiplier: 1.15,
                xpBonus: 18,
                reputationBonus: 2
            }
        ];
        
        const event = events[Math.floor(Math.random() * events.length)];
        await this.executeEvent(channel, dbEntry, now, event);
    }

    /**
     * Execute an event and apply bonuses
     */
    async executeEvent(channel, dbEntry, now, event) {
        const v3Features = dbEntry.gameData.v3Features;
        
        // Apply event bonuses to next sales
        await ActiveVCs.findOneAndUpdate(
            { channelId: channel.id },
            { 
                $set: { 
                    'gameData.eventBonus': {
                        multiplier: event.profitMultiplier,
                        xpBonus: event.xpBonus,
                        reputationBonus: event.reputationBonus,
                        expiresAt: new Date(now + 5 * 60 * 1000) // 5 minutes
                    }
                }
            }
        );
        
        // Send event notification
        const embed = new EmbedBuilder()
            .setTitle(event.name)
            .setDescription(event.description)
            .setColor(this.getEventColor(event.name))
            .addFields(
                { name: "💰 Profit Bonus", value: `+${Math.round((event.profitMultiplier - 1) * 100)}%`, inline: true },
                { name: "⭐ XP Bonus", value: `+${event.xpBonus}`, inline: true },
                { name: "🏆 Reputation", value: `+${event.reputationBonus}`, inline: true }
            )
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        
        console.log(`[InnKeeperV3] Generated ${event.name} event for channel ${channel.id}`);
    }

    /**
     * Enhanced sales generation with level and reputation bonuses
     */
    async generateSalesV3(channel, dbEntry, now) {
        const v3Features = dbEntry.gameData.v3Features;
        const eventBonus = dbEntry.gameData.eventBonus;
        
        // Calculate total profit multiplier
        let totalMultiplier = 1.0;
        
        // Level bonus
        const levelBonus = 1 + (v3Features.innLevel - 1) * this.getV3Config().PROGRESSION.LEVEL_BONUSES.PROFIT_BOOST;
        totalMultiplier *= levelBonus;
        
        // Event bonus
        if (eventBonus && eventBonus.expiresAt > now) {
            totalMultiplier *= eventBonus.multiplier;
        }
        
        // Reputation bonus
        const reputationBonus = this.calculateReputationBonus(v3Features.playerReputations);
        totalMultiplier *= (1 + reputationBonus);
        
        // Seasonal bonus
        const seasonalBonus = this.getSeasonalEventBonus(v3Features.seasonalEvent);
        totalMultiplier *= seasonalBonus;
        
        // Generate sales with enhanced multiplier
        await this.generateSalesWithMultiplier(channel, dbEntry, now, totalMultiplier);
    }

    /**
     * Process seasonal events
     */
    async processSeasonalEvents(channel, dbEntry, now) {
        const v3Features = dbEntry.gameData.v3Features;
        
        // Check if seasonal event should start
        if (!v3Features.seasonalEvent || v3Features.seasonalEvent.expiresAt < now) {
            if (Math.random() < 0.1) { // 10% chance to start seasonal event
                await this.startSeasonalEvent(channel, dbEntry, now);
            }
        }
    }

    /**
     * Start a seasonal event
     */
    async startSeasonalEvent(channel, dbEntry, now) {
        const seasonalEvents = [
            {
                name: "🎃 Harvest Festival",
                description: "The annual harvest festival brings extra customers and special items!",
                duration: 7 * 24 * 60 * 60 * 1000, // 7 days
                profitMultiplier: 1.5,
                specialItems: ["pumpkin_pie", "apple_cider", "harvest_bread"]
            },
            {
                name: "❄️ Winter Solstice",
                description: "The winter solstice celebration brings warmth and cheer to all!",
                duration: 7 * 24 * 60 * 60 * 1000,
                profitMultiplier: 1.4,
                specialItems: ["hot_chocolate", "gingerbread", "winter_stew"]
            },
            {
                name: "🌸 Spring Awakening",
                description: "Spring has arrived with fresh ingredients and renewed spirits!",
                duration: 7 * 24 * 60 * 60 * 1000,
                profitMultiplier: 1.3,
                specialItems: ["spring_salad", "flower_tea", "fresh_herbs"]
            }
        ];
        
        const event = seasonalEvents[Math.floor(Math.random() * seasonalEvents.length)];
        const seasonalEvent = {
            ...event,
            startTime: now,
            expiresAt: now + event.duration
        };
        
        await ActiveVCs.findOneAndUpdate(
            { channelId: channel.id },
            { $set: { 'gameData.v3Features.seasonalEvent': seasonalEvent } }
        );
        
        const embed = new EmbedBuilder()
            .setTitle(`🌟 ${event.name} Started!`)
            .setDescription(event.description)
            .setColor(0xFFD700)
            .addFields(
                { name: "⏰ Duration", value: "7 days", inline: true },
                { name: "💰 Profit Bonus", value: `+${Math.round((event.profitMultiplier - 1) * 100)}%`, inline: true },
                { name: "🎁 Special Items", value: event.specialItems.join(", "), inline: false }
            )
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
    }

    /**
     * Update player reputations based on activity
     */
    async updatePlayerReputations(channelId, dbEntry, now) {
        const v3Features = dbEntry.gameData.v3Features;
        const lastUpdate = v3Features.lastReputationUpdate || now;
        
        // Update reputations every 5 minutes
        if (now - lastUpdate > 5 * 60 * 1000) {
            const members = channel.members;
            const playerReputations = v3Features.playerReputations || {};
            
            for (const [userId, member] of members) {
                if (!member.user.bot) {
                    const currentRep = playerReputations[userId] || 0;
                    const activityBonus = this.calculateActivityBonus(member, now);
                    const newRep = Math.min(currentRep + activityBonus, this.getV3Config().REPUTATION.MAX_REPUTATION);
                    
                    playerReputations[userId] = newRep;
                }
            }
            
            await ActiveVCs.findOneAndUpdate(
                { channelId: channelId },
                { 
                    $set: { 
                        'gameData.v3Features.playerReputations': playerReputations,
                        'gameData.v3Features.lastReputationUpdate': now
                    }
                }
            );
        }
    }

    /**
     * Check and award achievements
     */
    async checkAchievements(channel, dbEntry, now) {
        const v3Features = dbEntry.gameData.v3Features;
        const lastCheck = v3Features.lastAchievementCheck || now;
        
        // Check achievements every 10 minutes
        if (now - lastCheck > 10 * 60 * 1000) {
            const achievements = this.getAvailableAchievements(v3Features);
            
            for (const achievement of achievements) {
                if (!v3Features.achievements.includes(achievement.id)) {
                    await this.awardAchievement(channel, dbEntry, achievement);
                }
            }
            
            await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                { $set: { 'gameData.v3Features.lastAchievementCheck': now } }
            );
        }
    }

    /**
     * Get available achievements based on current progress
     */
    getAvailableAchievements(v3Features) {
        const achievements = [];
        
        // Sales achievements
        if (v3Features.totalSales >= 100 && !v3Features.achievements.includes('sales_100')) {
            achievements.push({
                id: 'sales_100',
                name: '🏪 First Hundred',
                description: 'Made 100 sales',
                reward: { xp: 200, reputation: 50 }
            });
        }
        
        // Level achievements
        if (v3Features.innLevel >= 10 && !v3Features.achievements.includes('level_10')) {
            achievements.push({
                id: 'level_10',
                name: '📈 Rising Star',
                description: 'Reached inn level 10',
                reward: { xp: 500, reputation: 100 }
            });
        }
        
        // Profit achievements
        if (v3Features.totalProfit >= 10000 && !v3Features.achievements.includes('profit_10k')) {
            achievements.push({
                id: 'profit_10k',
                name: '💰 Profit Master',
                description: 'Earned 10,000 coins in profit',
                reward: { xp: 300, reputation: 75 }
            });
        }
        
        return achievements;
    }

    /**
     * Award an achievement
     */
    async awardAchievement(channel, dbEntry, achievement) {
        const v3Features = dbEntry.gameData.v3Features;
        
        // Add achievement to list
        v3Features.achievements.push(achievement.id);
        
        // Award XP and reputation
        v3Features.totalXP += achievement.reward.xp;
        
        // Check for level up
        const newLevel = this.calculateLevel(v3Features.totalXP);
        if (newLevel > v3Features.innLevel) {
            v3Features.innLevel = newLevel;
            await this.handleLevelUp(channel, dbEntry, newLevel);
        }
        
        // Update database
        await ActiveVCs.findOneAndUpdate(
            { channelId: channel.id },
            { $set: { 'gameData.v3Features': v3Features } }
        );
        
        // Send achievement notification
        const embed = new EmbedBuilder()
            .setTitle('🏆 Achievement Unlocked!')
            .setDescription(`**${achievement.name}**\n${achievement.description}`)
            .setColor(0xFFD700)
            .addFields(
                { name: "⭐ XP Reward", value: `+${achievement.reward.xp}`, inline: true },
                { name: "🏆 Reputation", value: `+${achievement.reward.reputation}`, inline: true }
            )
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
    }

    /**
     * Handle level up
     */
    async handleLevelUp(channel, dbEntry, newLevel) {
        const embed = new EmbedBuilder()
            .setTitle('🎉 Level Up!')
            .setDescription(`The inn has reached level ${newLevel}!`)
            .setColor(0x00FF00)
            .addFields(
                { name: "💰 Profit Bonus", value: `+${Math.round((newLevel - 1) * this.getV3Config().PROGRESSION.LEVEL_BONUSES.PROFIT_BOOST * 100)}%`, inline: true },
                { name: "🎪 Event Frequency", value: `+${Math.round((newLevel - 1) * this.getV3Config().PROGRESSION.LEVEL_BONUSES.EVENT_FREQUENCY * 100)}%`, inline: true },
                { name: "⚙️ Automation", value: `+${Math.round((newLevel - 1) * this.getV3Config().PROGRESSION.LEVEL_BONUSES.AUTOMATION_EFFICIENCY * 100)}%`, inline: true }
            )
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
    }

    /**
     * Process automation upgrades
     */
    async processAutomation(channelId, dbEntry, now) {
        // This would handle automation upgrades based on player purchases
        // Implementation would depend on the specific automation features desired
    }

    // Helper methods
    calculateLevel(totalXP) {
        const config = this.getV3Config().PROGRESSION;
        let level = 1;
        let xpNeeded = config.XP_PER_LEVEL;
        
        while (totalXP >= xpNeeded && level < config.MAX_LEVEL) {
            totalXP -= xpNeeded;
            level++;
            xpNeeded = Math.floor(xpNeeded * config.XP_MULTIPLIER);
        }
        
        return level;
    }

    calculateReputationBonus(playerReputations) {
        const totalRep = Object.values(playerReputations).reduce((sum, rep) => sum + rep, 0);
        return totalRep * this.getV3Config().REPUTATION.REPUTATION_BONUSES.PROFIT_MULTIPLIER;
    }

    getSeasonalEventBonus(seasonalEvent) {
        if (!seasonalEvent || seasonalEvent.expiresAt < Date.now()) {
            return 1.0;
        }
        return seasonalEvent.profitMultiplier;
    }

    calculateActivityBonus(member, now) {
        // Calculate bonus based on member activity
        // This could include voice time, message activity, etc.
        return 1; // Base bonus
    }

    getEventColor(eventName) {
        if (eventName.includes('Celebrity') || eventName.includes('Royal')) return 0xFFD700;
        if (eventName.includes('Treasure') || eventName.includes('Merchant')) return 0x00FF00;
        return 0x0099FF;
    }

    // Inherit existing methods from v2 with enhancements
    async acquireLock(channelId, timeout = 45000) {
        // Enhanced lock acquisition with longer timeout for V3 features
        return await super.acquireLock(channelId, timeout);
    }

    async releaseLock(channelId) {
        return await super.releaseLock(channelId);
    }

    async handleError(channelId, error) {
        return await super.handleError(channelId, error);
    }

    // Placeholder methods that would need implementation
    async generateShopV3(channel, dbEntry, now, profitBoost, eventFrequency) {
        // Enhanced shop generation with level bonuses
    }

    async generateSalesWithMultiplier(channel, dbEntry, now, multiplier) {
        // Generate sales with enhanced multiplier
    }

    async updateDisplayV3(channel, dbEntry, now) {
        // Enhanced display with V3 features
    }

    isWorkPeriodCompleteV3(dbEntry, now, effectiveWorkDuration) {
        // Work period check with automation
        return super.isWorkPeriodComplete(dbEntry, now);
    }

    async startBreakV3(channel, channelId, now) {
        // Enhanced break start with V3 features
        return await super.startBreak(channel, channelId, now);
    }

    shouldRefreshShop(dbEntry, now) {
        return super.shouldRefreshShop(dbEntry, now);
    }

    shouldGenerateActivityV3(dbEntry, now) {
        return super.shouldGenerateActivity(dbEntry, now);
    }

    shouldUpdateDisplay(channelId, now) {
        return super.shouldUpdateDisplay(channelId, now);
    }
}

module.exports = InnKeeperV3Controller;

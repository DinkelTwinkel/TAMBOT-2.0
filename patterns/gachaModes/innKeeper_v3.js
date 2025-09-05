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
        this.messageCache = new Map(); // Cache for message editing like V2
        
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
                // Initialize V3 features if needed (with error handling)
                try {
                    await this.initializeV3Features(channelId, dbEntry, now);
                } catch (initError) {
                    console.error(`[InnKeeperV3] Error initializing V3 features:`, initError);
                    // Continue with basic functionality even if V3 features fail
                }
                
                // Check and refresh shop with level bonuses
                await this.checkAndRefreshShopV3(channel, channelId, dbEntry, now);
                
                // Enhanced work/break state management
                const workState = await this.checkWorkStateV3(channel, channelId, now);
                if (workState.shouldReturn) {
                    return;
                }
                
                // CORE INN LOGIC - Generate sales and manage work cycles
                try {
                    // Check if we should generate sales (main inn functionality)
                    const shouldGenerate = this.shouldGenerateActivity(dbEntry, now);
                    if (shouldGenerate) {
                        // Generate sales with V3 bonuses
                        await this.generateSalesV3(channel, dbEntry, now);
                    }
                    
                    // Check if work period is complete
                    if (this.isWorkPeriodCompleteV3(dbEntry, now)) {
                        await this.startBreakV3(channel, channelId, now);
                        return; // Break started, exit this cycle
                    }
                    
                } catch (coreError) {
                    console.error(`[InnKeeperV3] Error in core inn logic:`, coreError);
                    // Continue with V3 features even if core logic fails
                }
                
                // Generate enhanced activities (V3 specific events)
                if (this.shouldGenerateActivityV3(dbEntry, now)) {
                    await this.generateActivityV3(channel, channelId, now);
                }
                
                // Update enhanced display using existing V2 system + V3 enhancements
                if (this.shouldUpdateDisplay(channelId, now)) {
                    // Get fresh entry for display
                    const freshEntry = await ActiveVCs.findOne({ channelId }).lean();
                    if (freshEntry) {
                        // Use the existing display manager like V2 for core activity logs
                        await this.displayManager.update(channel, freshEntry);
                        
                        // Add V3 enhancement info as a separate message if needed
                        await this.addV3StatusInfo(channel, freshEntry, now);
                    }
                }
                
                // Process seasonal events
                await this.processSeasonalEvents(channel, dbEntry, now);
                
                // Update player reputations
                await this.updatePlayerReputations(channel, channelId, dbEntry, now);
                
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
        // Get fresh data from database to ensure we have the latest state
        const freshEntry = await ActiveVCs.findOne({ channelId }).lean();
        if (!freshEntry) {
            console.error(`[InnKeeperV3] No database entry found for channel ${channelId}`);
            return;
        }
        
        // Initialize gameData if it doesn't exist
        if (!freshEntry.gameData) {
            freshEntry.gameData = {};
        }
        
        if (!freshEntry.gameData.v3Features) {
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
            
            // Also initialize basic inn game state if not present
            const initData = {
                'gameData.v3Features': v3Features
            };
            
            // Initialize core inn game state if missing
            if (!freshEntry.gameData.gamemode) {
                initData['gameData.gamemode'] = 'innkeeper';
            }
            if (!freshEntry.gameData.workState) {
                initData['gameData.workState'] = 'working';
                initData['gameData.workStartTime'] = new Date(now);
            }
            if (!freshEntry.gameData.sales) {
                initData['gameData.sales'] = [];
            }
            if (!freshEntry.gameData.events) {
                initData['gameData.events'] = [];
            }
            if (!freshEntry.gameData.lastActivity) {
                initData['gameData.lastActivity'] = new Date(now);
            }
            
            await ActiveVCs.findOneAndUpdate(
                { channelId: channelId },
                { $set: initData }
            );
            
            console.log(`[InnKeeperV3] Initialized V3 features and core inn state for channel ${channelId}`);
        }
    }

    /**
     * Enhanced shop refresh with level bonuses
     */
    async checkAndRefreshShopV3(channel, channelId, dbEntry, now) {
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
        
        // Use edit-first approach for events too
        await this.postOrUpdateV3Display(channel, { embeds: [embed] });
        
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
        // Get fresh data and ensure v3Features exists
        const freshEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
        if (!freshEntry || !freshEntry.gameData || !freshEntry.gameData.v3Features) {
            return; // Skip if V3 features not initialized
        }
        
        const v3Features = freshEntry.gameData.v3Features;
        
        // Check if seasonal event should start
        if (!v3Features.seasonalEvent || v3Features.seasonalEvent.expiresAt < now) {
            if (Math.random() < 0.1) { // 10% chance to start seasonal event
                await this.startSeasonalEvent(channel, freshEntry, now);
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
        
        await this.postOrUpdateV3Display(channel, { embeds: [embed] });
    }

    /**
     * Update player reputations based on activity
     */
    async updatePlayerReputations(channel, channelId, dbEntry, now) {
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
        
        await this.postOrUpdateV3Display(channel, { embeds: [embed] });
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
        
        await this.postOrUpdateV3Display(channel, { embeds: [embed] });
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

    // Lock management for V3
    async acquireLock(channelId, timeout = 45000) {
        if (this.processingLocks.has(channelId)) {
            return false; // Already locked
        }
        
        this.processingLocks.set(channelId, Date.now());
        
        // Set timeout to auto-release lock
        setTimeout(() => {
            this.releaseLock(channelId);
        }, timeout);
        
        return true;
    }

    async releaseLock(channelId) {
        return this.processingLocks.delete(channelId);
    }

    async handleError(channelId, error) {
        console.error(`[InnKeeperV3] Error in channel ${channelId}:`, error);
        this.releaseLock(channelId);
        
        // Track retry attempts
        const retries = this.retryAttempts.get(channelId) || 0;
        this.retryAttempts.set(channelId, retries + 1);
        
        return false;
    }

    // Core inn functionality with V3 enhancements
    async generateSalesV3(channel, dbEntry, now) {
        try {
            // Get fresh database entry
            const freshEntry = await ActiveVCs.findOne({ channelId: channel.id });
            if (!freshEntry || freshEntry.gameData?.workState !== 'working') {
                console.log('[InnKeeperV3] Skipping sales generation - not working');
                return;
            }
            
            // Get V3 features for bonuses
            const v3Features = freshEntry.gameData?.v3Features || {};
            const innLevel = v3Features.innLevel || 1;
            const profitBoost = 1 + (innLevel - 1) * 0.03; // 3% per level
            
            // Use the core event manager to generate actual sales (like V2)
            const event = await this.eventManager.generateEvent(channel, freshEntry);
            
            if (event && event.type === 'npcSale') {
                // Generate unique event ID for idempotency
                const eventId = `${channel.id}-${now}-${Math.random()}`;
                event.eventId = eventId;
                
                // Apply V3 profit bonus to the sale
                const originalProfit = event.saleData.profit || 0;
                const enhancedProfit = Math.floor(originalProfit * profitBoost);
                event.saleData.profit = enhancedProfit;
                
                // Calculate XP from the sale
                const xpGained = Math.floor(enhancedProfit * 0.1); // 10% of profit as XP
                
                // Record sale atomically with V3 enhancements
                const updated = await ActiveVCs.findOneAndUpdate(
                    {
                        channelId: channel.id,
                        'gameData.sales.eventId': { $ne: eventId }
                    },
                    {
                        $push: { 'gameData.sales': event.saleData },
                        $set: { 'gameData.lastActivity': new Date() },
                        $inc: { 
                            'gameData.eventSequence': 1,
                            'gameData.v3Features.totalXP': xpGained,
                            'gameData.v3Features.totalSales': 1,
                            'gameData.v3Features.totalProfit': enhancedProfit
                        }
                    }
                );
                
                if (updated) {
                    console.log(`[InnKeeperV3] NPC sale recorded with V3 bonuses: ${event.saleData.buyerName} bought ${event.saleData.itemName} for ${event.saleData.price}c (${enhancedProfit} profit, ${xpGained} XP)`);
                    
                    // Check for level up
                    const newTotalXP = (v3Features.totalXP || 0) + xpGained;
                    const newLevel = Math.floor(newTotalXP / 1000) + 1; // 1000 XP per level
                    if (newLevel > innLevel) {
                        await this.handleLevelUp(channel, updated, newLevel);
                    }
                }
            } else if (event) {
                // Handle other event types (friendship, etc.)
                console.log(`[InnKeeperV3] Generated non-sale event: ${event.type}`);
            } else {
                console.log(`[InnKeeperV3] No event generated this cycle`);
            }
            
        } catch (error) {
            console.error(`[InnKeeperV3] Error generating sales:`, error);
        }
    }

    async generateShopV3(channel, dbEntry, now, profitBoost, eventFrequency) {
        // Enhanced shop generation with level bonuses
        try {
            // Use existing shop generation with bonuses
            const shopResult = await this.eventManager.generateNPCSaleAtomic(channel, dbEntry);
            return shopResult;
        } catch (error) {
            console.error(`[InnKeeperV3] Error generating shop:`, error);
            return null;
        }
    }

    async generateSalesWithMultiplier(channel, dbEntry, now, multiplier) {
        // Generate sales with enhanced multiplier
        return await this.generateSalesV3(channel, dbEntry, now);
    }

    async updateDisplayV3(channel, dbEntry, now) {
        // Enhanced display with V3 features using edit-first approach like V2
        try {
            // Check if we should update display (throttling)
            const lastUpdate = this.messageThrottle.get(channel.id) || 0;
            if (now - lastUpdate < 30000) return; // 30 second throttle
            
            // Get fresh V3 data
            const freshEntry = await ActiveVCs.findOne({ channelId: channel.id }).lean();
            const v3Features = freshEntry?.gameData?.v3Features || {};
            const innLevel = v3Features.innLevel || 1;
            const totalXP = v3Features.totalXP || 0;
            const totalProfit = v3Features.totalProfit || 0;
            
            // Create enhanced display embed
            const embed = new EmbedBuilder()
                .setTitle(`🏨 Inn Activity (Level ${innLevel})`)
                .setDescription(`**XP**: ${totalXP} | **Total Profit**: ${totalProfit} coins`)
                .setColor('Gold')
                .setTimestamp();
                
            // Add V3 status fields
            if (v3Features.seasonalEvent) {
                const event = v3Features.seasonalEvent;
                const timeLeft = Math.max(0, event.expiresAt - now);
                const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
                
                embed.addFields({
                    name: '🎉 Active Event',
                    value: `${event.name}\n${event.description}\n**${daysLeft} days left**`,
                    inline: false
                });
            }
            
            // Use the same edit-first approach as V2
            await this.postOrUpdateV3Display(channel, { embeds: [embed] });
            this.messageThrottle.set(channel.id, now);
            
        } catch (error) {
            console.error(`[InnKeeperV3] Error updating display:`, error);
        }
    }
    
    /**
     * Post or update V3 display (edit existing if found, like V2)
     */
    async postOrUpdateV3Display(channel, messageData) {
        try {
            // Check cache first
            const cachedMessageId = this.messageCache?.get(channel.id);
            
            if (cachedMessageId) {
                try {
                    const existingMessage = await channel.messages.fetch(cachedMessageId);
                    await existingMessage.edit(messageData);
                    return existingMessage;
                } catch (err) {
                    if (this.messageCache) {
                        this.messageCache.delete(channel.id);
                    }
                }
            }
            
            // Search for existing V3 inn message in last 5 messages
            const messages = await channel.messages.fetch({ limit: 5 });
            for (const message of messages.values()) {
                if (message.author.bot && 
                    message.embeds.length > 0 && 
                    (message.embeds[0].title?.includes('Inn Activity') ||
                     message.embeds[0].title?.includes('Inn (Level'))) {
                    await message.edit(messageData);
                    if (!this.messageCache) {
                        this.messageCache = new Map();
                    }
                    this.messageCache.set(channel.id, message.id);
                    console.log(`[InnKeeperV3] Updated existing inn display message`);
                    return message;
                }
            }
            
            // Create new message only if none found
            const newMessage = await channel.send(messageData);
            if (!this.messageCache) {
                this.messageCache = new Map();
            }
            this.messageCache.set(channel.id, newMessage.id);
            console.log(`[InnKeeperV3] Created new inn display message`);
            
            return newMessage;
            
        } catch (error) {
            console.error('[InnKeeperV3] Error posting/updating V3 display:', error);
            return null;
        }
    }
    
    /**
     * Add V3 status information as a separate, less frequent update
     */
    async addV3StatusInfo(channel, dbEntry, now) {
        try {
            // Only update V3 status every 2 minutes to avoid spam
            const lastV3Update = this.messageThrottle.get(`${channel.id}_v3`) || 0;
            if (now - lastV3Update < 120000) return; // 2 minutes
            
            const v3Features = dbEntry.gameData?.v3Features;
            if (!v3Features) return;
            
            const innLevel = v3Features.innLevel || 1;
            const totalXP = v3Features.totalXP || 0;
            const xpToNext = 1000 - (totalXP % 1000);
            
            // Create V3 status embed
            const embed = new EmbedBuilder()
                .setTitle(`🏨 Inn Status (Level ${innLevel})`)
                .setDescription(`**XP**: ${totalXP} (${xpToNext} to next level)`)
                .setColor('Purple')
                .setTimestamp();
                
            // Add seasonal event info
            if (v3Features.seasonalEvent) {
                const event = v3Features.seasonalEvent;
                const timeLeft = Math.max(0, event.expiresAt - now);
                const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
                
                embed.addFields({
                    name: '🎉 Seasonal Event',
                    value: `${event.name} (${daysLeft} days left)`,
                    inline: true
                });
            }
            
            // Add level bonuses
            const profitBonus = Math.round((innLevel - 1) * 3);
            if (profitBonus > 0) {
                embed.addFields({
                    name: '📈 Level Bonuses',
                    value: `+${profitBonus}% profit boost`,
                    inline: true
                });
            }
            
            // Use edit-first approach for V3 status
            await this.postOrUpdateV3Status(channel, { embeds: [embed] });
            this.messageThrottle.set(`${channel.id}_v3`, now);
            
        } catch (error) {
            console.error(`[InnKeeperV3] Error adding V3 status:`, error);
        }
    }
    
    /**
     * Post or update V3 status (separate from main activity log)
     */
    async postOrUpdateV3Status(channel, messageData) {
        try {
            // Search for existing V3 status message in last 3 messages
            const messages = await channel.messages.fetch({ limit: 3 });
            for (const message of messages.values()) {
                if (message.author.bot && 
                    message.embeds.length > 0 && 
                    message.embeds[0].title?.includes('Inn Status (Level')) {
                    await message.edit(messageData);
                    console.log(`[InnKeeperV3] Updated existing V3 status message`);
                    return message;
                }
            }
            
            // Only create new V3 status message if there's significant info to show
            const embed = messageData.embeds[0];
            if (embed.fields && embed.fields.length > 0) {
                const newMessage = await channel.send(messageData);
                console.log(`[InnKeeperV3] Created new V3 status message`);
                return newMessage;
            }
            
        } catch (error) {
            console.error('[InnKeeperV3] Error posting/updating V3 status:', error);
            return null;
        }
    }
    
    async checkWorkStateV3(channel, channelId, now) {
        // Enhanced work/break state checking like V2
        try {
            // Get fresh data from database
            const freshEntry = await ActiveVCs.findOne({ channelId });
            if (!freshEntry) return { shouldReturn: false, state: 'work' };
            
            const gameData = freshEntry.gameData || {};
            
            // Check if inn is in break period
            if (gameData.workState === 'break') {
                const breakEndTime = new Date(gameData.breakEndTime || now).getTime();
                
                if (now < breakEndTime) {
                    // Still in break
                    console.log(`[InnKeeperV3] Still in break, ${Math.round((breakEndTime - now) / 60000)} minutes remaining`);
                    return { shouldReturn: true, state: 'break' };
                } else {
                    // Break is over, transition back to working
                    console.log('[InnKeeperV3] Break period ended, transitioning back to work');
                    
                    const newWorkStartTime = now;
                    const nextBreakTime = now + (this.config.TIMING?.WORK_DURATION || 25 * 60 * 1000);
                    
                    await ActiveVCs.updateOne(
                        { channelId },
                        { 
                            $set: { 
                                'gameData.workState': 'working',
                                'gameData.workStartTime': new Date(newWorkStartTime),
                                'gameData.lastActivity': new Date(now),
                                nextTrigger: new Date(nextBreakTime)
                            },
                            $unset: { 
                                'gameData.breakStartTime': 1,
                                'gameData.breakEndTime': 1
                            }
                        }
                    );
                    
                    // Send work restart message
                    const embed = new EmbedBuilder()
                        .setTitle('🏨 Inn Reopened!')
                        .setColor('Green')
                        .setDescription('The inn is back open for business! Customers will start arriving soon.')
                        .addFields({
                            name: '⏰ Next Break',
                            value: `<t:${Math.floor(nextBreakTime / 1000)}:R>`,
                            inline: true
                        })
                        .setTimestamp();
                        
                    await channel.send({ embeds: [embed] });
                    
                    return { shouldReturn: false, state: 'work' };
                }
            }
            
            // Not in break, check if we should be working
            if (!gameData.workState || gameData.workState === 'working') {
                return { shouldReturn: false, state: 'work' };
            }
            
            return { shouldReturn: false, state: 'work' };
            
        } catch (error) {
            console.error(`[InnKeeperV3] Error checking work state:`, error);
            return { shouldReturn: false, state: 'work' };
        }
    }
    
    async generateActivityV3(channel, channelId, now) {
        // Generate V3 enhanced activities
        try {
            // Get fresh data for event generation
            const freshEntry = await ActiveVCs.findOne({ channelId }).lean();
            if (!freshEntry) return;
            
            // Generate special V3 events
            if (Math.random() < 0.1) { // 10% chance for special events
                await this.generateEnhancedEvent(channel, freshEntry, now);
            }
        } catch (error) {
            console.error(`[InnKeeperV3] Error generating V3 activities:`, error);
        }
    }

    isWorkPeriodCompleteV3(dbEntry, now, effectiveWorkDuration) {
        // Work period check like V2 - check actual work state and timing
        const gameData = dbEntry.gameData || {};
        
        // Check if already in break
        if (gameData.workState === 'break') {
            return false; // Already in break
        }
        
        // Check if work state is set to working
        if (gameData.workState !== 'working') {
            return false; // Not in working state
        }
        
        // Get work start time (when inn started working)
        const workStartTime = new Date(gameData.workStartTime || gameData.lastActivity || now - 1000).getTime();
        const workDuration = effectiveWorkDuration || this.config.TIMING?.WORK_DURATION || (25 * 60 * 1000);
        const timeSinceWorkStart = now - workStartTime;
        
        console.log(`[InnKeeperV3] Work check: ${Math.round(timeSinceWorkStart / 60000)}/${Math.round(workDuration / 60000)} minutes`);
        
        return timeSinceWorkStart >= workDuration;
    }

    async startBreakV3(channel, channelId, now) {
        // Enhanced break start with V3 features and profit distribution
        console.log('[InnKeeperV3] Starting break and distributing profits...');
        
        try {
            const ActiveVCs = require('../../models/activevcs');
            
            // Get current data for profit distribution
            const current = await ActiveVCs.findOne({ channelId });
            if (!current) {
                console.error('[InnKeeperV3] No database entry found for break start');
                return false;
            }
            
            // Distribute profits before break if there are sales
            const gameData = current.gameData || {};
            const sales = gameData.sales || [];
            const events = gameData.events || [];
            
            if (sales.length > 0 || events.length > 0) {
                console.log(`[InnKeeperV3] Distributing profits from ${sales.length} sales and ${events.length} events`);
                await this.distributeProfitsV3(channel, current, now);
            } else {
                console.log('[InnKeeperV3] No sales to distribute, starting break anyway');
            }
            
            // Start break with atomic state transition
            const breakEndTime = now + (this.config.TIMING?.BREAK_DURATION || 5 * 60 * 1000);
            
            const updated = await ActiveVCs.findOneAndUpdate(
                { 
                    channelId,
                    'gameData.workState': 'working'
                },
                { 
                    $set: { 
                        'gameData.workState': 'break',
                        'gameData.breakStartTime': now,
                        'gameData.breakEndTime': new Date(breakEndTime),
                        'gameData.sales': [], // Clear sales after distribution
                        'gameData.events': [], // Clear events
                        'gameData.lastActivity': new Date(now),
                        nextTrigger: new Date(breakEndTime)
                    }
                },
                { new: true }
            );
            
            if (!updated) {
                console.log('[InnKeeperV3] Failed to start break - state already changed');
                return false;
            }
            
            // Send break message
            const embed = new EmbedBuilder()
                .setTitle('☕ Break Time!')
                .setColor(0xF39C12)
                .setDescription('The inn is closing for a 5-minute break. Workers deserve some rest!')
                .addFields(
                    { name: 'Break Duration', value: '5 minutes', inline: true },
                    { name: 'Reopening At', value: `<t:${Math.floor(breakEndTime / 1000)}:R>`, inline: true }
                )
                .setTimestamp();
                
            await channel.send({ embeds: [embed] });
            
            console.log(`[InnKeeperV3] Break started, will end at ${new Date(breakEndTime).toISOString()}`);
            return true;
            
        } catch (error) {
            console.error('[InnKeeperV3] Error starting break:', error);
            return false;
        }
    }
    
    /**
     * Distribute profits with V3 enhancements
     */
    async distributeProfitsV3(channel, dbEntry, now) {
        try {
            const Money = require('../../models/currency');
            const gameData = dbEntry.gameData || {};
            const sales = gameData.sales || [];
            const events = gameData.events || [];
            
            if (sales.length === 0 && events.length === 0) {
                console.log('[InnKeeperV3] No sales or events to distribute');
                return;
            }
            
            // Get members in voice channel (excluding bots)
            const membersInVC = Array.from(channel.members.values()).filter(m => !m.user.bot);
            
            if (membersInVC.length === 0) {
                console.log('[InnKeeperV3] No members in VC for profit distribution');
                return;
            }
            
            // Calculate totals
            const totalSales = sales.reduce((sum, sale) => sum + (sale.price || 0), 0);
            const totalProfit = sales.reduce((sum, sale) => sum + (sale.profit || 0), 0);
            const totalTips = sales.reduce((sum, sale) => sum + (sale.tip || 0), 0);
            const eventCosts = events.reduce((sum, event) => sum + (event.cost || 0), 0);
            
            // Apply V3 level bonus to profits
            const v3Features = gameData.v3Features || {};
            const innLevel = v3Features.innLevel || 1;
            const levelBonus = 1 + (innLevel - 1) * 0.03; // 3% per level
            const enhancedProfit = Math.floor(totalProfit * levelBonus);
            
            // Calculate synergy bonus for multiple workers
            let synergyBonus = 0;
            if (membersInVC.length > 1) {
                const synergyMultiplier = 1 + (Math.log(membersInVC.length) * 0.1);
                synergyBonus = Math.floor((enhancedProfit + totalTips) * (synergyMultiplier - 1));
            }
            
            // Calculate gross total
            const grossTotal = enhancedProfit + totalTips + synergyBonus - eventCosts;
            
            // Innkeeper's cut (10%)
            const innkeeperCut = grossTotal > 0 ? Math.floor(grossTotal * 0.1) : 0;
            
            // Net total for distribution
            const netTotal = grossTotal - innkeeperCut;
            
            if (netTotal <= 0) {
                console.log('[InnKeeperV3] No profit to distribute after costs');
                return;
            }
            
            // Initialize earnings for each member
            const earnings = {};
            for (const member of membersInVC) {
                earnings[member.id] = {
                    member: member,
                    coins: 0,
                    sales: 0,
                    tips: 0,
                    bonuses: 0
                };
            }
            
            // Distribute profits from each sale
            for (const sale of sales) {
                const saleProfit = Math.floor((sale.profit || 0) * levelBonus);
                const eligibleMembers = membersInVC.filter(m => m.id !== sale.buyer);
                
                if (eligibleMembers.length > 0) {
                    const profitPerMember = Math.floor(saleProfit / eligibleMembers.length);
                    
                    for (const member of eligibleMembers) {
                        earnings[member.id].coins += profitPerMember;
                        earnings[member.id].sales += profitPerMember;
                    }
                }
                
                // Distribute tips to all members (including buyer)
                if (sale.tip > 0) {
                    const tipPerMember = Math.floor(sale.tip / membersInVC.length);
                    for (const member of membersInVC) {
                        earnings[member.id].coins += tipPerMember;
                        earnings[member.id].tips += tipPerMember;
                    }
                }
            }
            
            // Distribute synergy bonus equally
            if (synergyBonus > 0) {
                const bonusPerMember = Math.floor(synergyBonus / membersInVC.length);
                for (const member of membersInVC) {
                    earnings[member.id].coins += bonusPerMember;
                    earnings[member.id].bonuses += bonusPerMember;
                }
            }
            
            // Award coins to each member
            const totalAwarded = [];
            for (const [memberId, earning] of Object.entries(earnings)) {
                if (earning.coins > 0) {
                    try {
                        await Money.findOneAndUpdate(
                            { userId: memberId },
                            { $inc: { money: earning.coins } },
                            { upsert: true, new: true }
                        );
                        
                        totalAwarded.push({
                            member: earning.member,
                            coins: earning.coins,
                            breakdown: earning
                        });
                        
                        console.log(`[InnKeeperV3] Awarded ${earning.coins} coins to ${earning.member.displayName}`);
                    } catch (payoutError) {
                        console.error(`[InnKeeperV3] Error awarding coins to ${memberId}:`, payoutError);
                    }
                }
            }
            
            // Send profit distribution summary
            if (totalAwarded.length > 0) {
                const embed = new EmbedBuilder()
                    .setTitle('💰 Inn Profits Distributed!')
                    .setDescription(`**Work Period Complete** - Level ${innLevel} Inn\n**Total Profit**: ${netTotal} coins${levelBonus > 1 ? ` (+${Math.round((levelBonus - 1) * 100)}% level bonus)` : ''}`)
                    .setColor('Gold')
                    .setTimestamp();
                
                // Show individual earnings
                const earningsText = totalAwarded
                    .map(award => `${award.member.displayName}: **${award.coins}** coins`)
                    .join('\n');
                
                embed.addFields({
                    name: '👥 Worker Earnings',
                    value: earningsText,
                    inline: false
                });
                
                if (synergyBonus > 0) {
                    embed.addFields({
                        name: '🤝 Teamwork Bonus',
                        value: `+${synergyBonus} coins (${membersInVC.length} workers)`,
                        inline: true
                    });
                }
                
                if (innkeeperCut > 0) {
                    embed.addFields({
                        name: '🏨 Inn Maintenance',
                        value: `${innkeeperCut} coins`,
                        inline: true
                    });
                }
                
                await channel.send({ embeds: [embed] });
            }
            
            return true;
            
        } catch (error) {
            console.error('[InnKeeperV3] Error starting break and distributing profits:', error);
            return false;
        }
    }

    shouldRefreshShop(dbEntry, now) {
        const lastRefresh = dbEntry.gameData?.lastShopRefresh || 0;
        return (now - lastRefresh) >= (this.config.SHOP_REFRESH_INTERVAL || 3600000);
    }

    shouldGenerateActivity(dbEntry, now) {
        const lastActivity = dbEntry.gameData?.lastActivity || 0;
        const activityInterval = this.config.TIMING?.ACTIVITY_GUARANTEE || 15000; // 15 seconds
        return (now - lastActivity) >= activityInterval;
    }

    shouldGenerateActivityV3(dbEntry, now) {
        const lastActivity = dbEntry.gameData?.lastActivity || 0;
        return (now - lastActivity) >= (this.config.ACTIVITY_INTERVAL || 60000);
    }

    shouldUpdateDisplay(channelId, now) {
        const lastUpdate = this.messageThrottle.get(channelId) || 0;
        return (now - lastUpdate) >= (this.config.DISPLAY_UPDATE_INTERVAL || 30000);
    }
}

// Create a singleton instance for the game master to use
const innKeeperV3Instance = new InnKeeperV3Controller();

// Export as a function that calls the main method on the instance
module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();
    return await innKeeperV3Instance.processInn(channel, dbEntry, now);
};

// Also export the class for direct use if needed
module.exports.InnKeeperV3Controller = InnKeeperV3Controller;
module.exports.instance = innKeeperV3Instance;

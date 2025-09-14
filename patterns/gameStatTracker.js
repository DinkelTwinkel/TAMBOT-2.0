// gameStatTracker.js - Extended stat tracking for game modes
const { UserStats } = require('../models/statsSchema');

class GameStatTracker {
    constructor() {
        this.statCache = new Map(); // Cache for performance
        this.batchUpdates = new Map(); // Batch updates for efficiency
    }

    // =============== MINING STATS TRACKING ===============

    /**
     * Track tile movement in mining
     */
    async trackTileMovement(userId, guildId, direction = null) {
        try {
            // First, ensure the user document exists with proper structure
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $setOnInsert: {
                        userId,
                        guildId,
                        firstSeen: new Date(),
                        gameData: {
                            mining: {
                                tilesMoved: 0,
                                itemsFound: {},
                                tilesBroken: {},
                                hazardsEvaded: 0,
                                hazardsTriggered: 0,
                                hazardsSeen: 0,
                                highestPowerLevel: 0,
                                timeInMiningChannel: 0,
                                movementByDirection: {}
                            }
                        }
                    }
                },
                { upsert: true }
            );

            // Then update the stats
            const updateData = {
                $inc: { 'gameData.mining.tilesMoved': 1 },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            // Track direction if provided
            if (direction) {
                updateData.$inc[`gameData.mining.movementByDirection.${direction}`] = 1;
            }

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked tile movement for user ${userId}`);
        } catch (error) {
            console.error('Error tracking tile movement:', error);
        }
    }

    /**
     * Track items found through mining or treasures
     */
    async trackItemFound(userId, guildId, itemId, quantity, source = 'mining') {
        try {
            // First, ensure the user document exists with proper structure
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $setOnInsert: {
                        userId,
                        guildId,
                        firstSeen: new Date(),
                        gameData: {
                            mining: {
                                tilesMoved: 0,
                                itemsFound: {},
                                itemsFoundBySource: { mining: {}, treasure: {} },
                                tilesBroken: {},
                                hazardsEvaded: 0,
                                hazardsTriggered: 0,
                                hazardsSeen: 0,
                                highestPowerLevel: 0,
                                timeInMiningChannel: 0,
                                movementByDirection: {}
                            }
                        }
                    }
                },
                { upsert: true }
            );

            // Then update the stats
            const updateData = {
                $inc: { 
                    [`gameData.mining.itemsFound.${itemId}`]: quantity,
                    [`gameData.mining.itemsFoundBySource.${source}.${itemId}`]: quantity
                },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked item found: ${quantity}x item ${itemId} (type: ${typeof itemId}) from ${source} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking item found:', error);
        }
    }

    /**
     * Track tile breaking by tile type
     */
    async trackTileBroken(userId, guildId, tileType) {
        try {
            // First, ensure the user document exists with proper structure
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $setOnInsert: {
                        userId,
                        guildId,
                        firstSeen: new Date(),
                        gameData: {
                            mining: {
                                tilesMoved: 0,
                                itemsFound: {},
                                tilesBroken: {},
                                hazardsEvaded: 0,
                                hazardsTriggered: 0,
                                hazardsSeen: 0,
                                highestPowerLevel: 0,
                                timeInMiningChannel: 0,
                                movementByDirection: {}
                            }
                        }
                    }
                },
                { upsert: true }
            );

            // Then update the stats
            const updateData = {
                $inc: { [`gameData.mining.tilesBroken.${tileType}`]: 1 },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked tile broken: ${tileType} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking tile broken:', error);
        }
    }

    /**
     * Track hazard interactions
     */
    async trackHazardInteraction(userId, guildId, hazardType, interactionType) {
        try {
            // interactionType: 'evaded', 'triggered', 'seen'
            
            // First, ensure the user document exists with proper structure
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $setOnInsert: {
                        userId,
                        guildId,
                        firstSeen: new Date(),
                        gameData: {
                            mining: {
                                tilesMoved: 0,
                                itemsFound: {},
                                tilesBroken: {},
                                hazardsEvaded: 0,
                                hazardsTriggered: 0,
                                hazardsSeen: 0,
                                hazardsByType: {},
                                highestPowerLevel: 0,
                                timeInMiningChannel: 0,
                                movementByDirection: {}
                            }
                        }
                    }
                },
                { upsert: true }
            );

            // Then update the stats
            const updateData = {
                $inc: { 
                    [`gameData.mining.hazards${interactionType.charAt(0).toUpperCase() + interactionType.slice(1)}`]: 1,
                    [`gameData.mining.hazardsByType.${hazardType}.${interactionType}`]: 1
                },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked hazard ${interactionType}: ${hazardType} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking hazard interaction:', error);
        }
    }

    /**
     * Track highest power level reached
     */
    async trackPowerLevel(userId, guildId, powerLevel) {
        try {
            // First, ensure the user document exists with proper structure
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $setOnInsert: {
                        userId,
                        guildId,
                        firstSeen: new Date(),
                        gameData: {
                            mining: {
                                tilesMoved: 0,
                                itemsFound: {},
                                tilesBroken: {},
                                hazardsEvaded: 0,
                                hazardsTriggered: 0,
                                hazardsSeen: 0,
                                highestPowerLevel: 0,
                                timeInMiningChannel: 0,
                                movementByDirection: {}
                            }
                        }
                    }
                },
                { upsert: true }
            );

            // Check current highest power level
            const userStats = await UserStats.findOne({ userId, guildId });
            const currentHighest = userStats?.gameData?.mining?.highestPowerLevel || 0;
            
            if (powerLevel > currentHighest) {
                await UserStats.findOneAndUpdate(
                    { userId, guildId },
                    {
                        $set: { 
                            'gameData.mining.highestPowerLevel': powerLevel,
                            lastSeen: new Date(),
                            lastUpdated: new Date()
                        }
                    },
                    { new: true }
                );

                console.log(`📊 Updated highest power level: ${powerLevel} for user ${userId}`);
            }
        } catch (error) {
            console.error('Error tracking power level:', error);
        }
    }

    /**
     * Track time spent in mining channel
     */
    async trackMiningTime(userId, guildId, timeInSeconds) {
        try {
            // First, ensure the user document exists with proper structure
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $setOnInsert: {
                        userId,
                        guildId,
                        firstSeen: new Date(),
                        gameData: {
                            mining: {
                                tilesMoved: 0,
                                itemsFound: {},
                                tilesBroken: {},
                                hazardsEvaded: 0,
                                hazardsTriggered: 0,
                                hazardsSeen: 0,
                                highestPowerLevel: 0,
                                timeInMiningChannel: 0,
                                movementByDirection: {}
                            }
                        }
                    }
                },
                { upsert: true }
            );

            // Then update the stats
            const updateData = {
                $inc: { 'gameData.mining.timeInMiningChannel': timeInSeconds },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked mining time: ${timeInSeconds}s for user ${userId}`);
        } catch (error) {
            console.error('Error tracking mining time:', error);
        }
    }

    // =============== INN KEEPER STATS TRACKING ===============

    /**
     * Track overnight stays in inn
     */
    async trackOvernightStays(userId, guildId, count = 1) {
        try {
            await this.initializeUserGameData(userId, guildId, 'innkeeper');
            
            const updateData = {
                $inc: { 'gameData.innkeeper.overnightStays': count },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked overnight stays: ${count} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking overnight stays:', error);
        }
    }

    /**
     * Track customers who left happy
     */
    async trackHappyCustomers(userId, guildId, count = 1) {
        try {
            await this.initializeUserGameData(userId, guildId, 'innkeeper');
            
            const updateData = {
                $inc: { 'gameData.innkeeper.happyCustomers': count },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked happy customers: ${count} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking happy customers:', error);
        }
    }

    /**
     * Track customers who left sad
     */
    async trackSadCustomers(userId, guildId, count = 1) {
        try {
            await this.initializeUserGameData(userId, guildId, 'innkeeper');
            
            const updateData = {
                $inc: { 'gameData.innkeeper.sadCustomers': count },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked sad customers: ${count} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking sad customers:', error);
        }
    }

    /**
     * Track reputation gain
     */
    async trackReputationGain(userId, guildId, amount) {
        try {
            await this.initializeUserGameData(userId, guildId, 'innkeeper');
            
            const updateData = {
                $inc: { 'gameData.innkeeper.reputationGained': amount },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked reputation gain: ${amount} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking reputation gain:', error);
        }
    }

    /**
     * Track reputation loss
     */
    async trackReputationLoss(userId, guildId, amount) {
        try {
            await this.initializeUserGameData(userId, guildId, 'innkeeper');
            
            const updateData = {
                $inc: { 'gameData.innkeeper.reputationLost': amount },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked reputation loss: ${amount} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking reputation loss:', error);
        }
    }

    /**
     * Track money earned from inn
     */
    async trackInnMoneyEarned(userId, guildId, amount) {
        try {
            await this.initializeUserGameData(userId, guildId, 'innkeeper');
            
            const updateData = {
                $inc: { 'gameData.innkeeper.moneyEarned': amount },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked inn money earned: ${amount} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking inn money earned:', error);
        }
    }

    /**
     * Track orders placed in inn
     */
    async trackOrdersPlaced(userId, guildId, count = 1) {
        try {
            await this.initializeUserGameData(userId, guildId, 'innkeeper');
            
            const updateData = {
                $inc: { 'gameData.innkeeper.ordersPlaced': count },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked orders placed: ${count} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking orders placed:', error);
        }
    }

    /**
     * Track highest inn level reached
     */
    async trackInnLevel(userId, guildId, level) {
        try {
            await this.initializeUserGameData(userId, guildId, 'innkeeper');
            
            // Check current highest level
            const userStats = await UserStats.findOne({ userId, guildId });
            const currentHighest = userStats?.gameData?.innkeeper?.highestLevel || 0;
            
            if (level > currentHighest) {
                await UserStats.findOneAndUpdate(
                    { userId, guildId },
                    {
                        $set: { 
                            'gameData.innkeeper.highestLevel': level,
                            lastSeen: new Date(),
                            lastUpdated: new Date()
                        }
                    },
                    { new: true }
                );

                console.log(`📊 Updated highest inn level: ${level} for user ${userId}`);
            }
        } catch (error) {
            console.error('Error tracking inn level:', error);
        }
    }

    // =============== SELL MARKET STATS TRACKING ===============

    /**
     * Track items sold in marketplace
     */
    async trackItemsSold(userId, guildId, itemId, quantity, totalPrice) {
        try {
            await this.initializeUserGameData(userId, guildId, 'sellmarket');
            
            const updateData = {
                $inc: { 
                    'gameData.sellmarket.totalItemsSold': quantity,
                    'gameData.sellmarket.totalEarnings': totalPrice,
                    [`gameData.sellmarket.itemsSold.${itemId}`]: quantity
                },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked items sold: ${quantity}x item ${itemId} for ${totalPrice} coins by user ${userId}`);
        } catch (error) {
            console.error('Error tracking items sold:', error);
        }
    }

    /**
     * Track items bought in marketplace
     */
    async trackItemsBought(userId, guildId, itemId, quantity, totalPrice) {
        try {
            await this.initializeUserGameData(userId, guildId, 'sellmarket');
            
            const updateData = {
                $inc: { 
                    'gameData.sellmarket.totalItemsBought': quantity,
                    'gameData.sellmarket.totalSpent': totalPrice,
                    [`gameData.sellmarket.itemsBought.${itemId}`]: quantity
                },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked items bought: ${quantity}x item ${itemId} for ${totalPrice} coins by user ${userId}`);
        } catch (error) {
            console.error('Error tracking items bought:', error);
        }
    }

    // =============== NPC SALES STATS TRACKING ===============

    /**
     * Track NPC purchases (from seller's perspective)
     */
    async trackNPCPurchases(userId, guildId, itemId, quantity, totalPrice) {
        try {
            await this.initializeUserGameData(userId, guildId, 'npcsales');
            
            const updateData = {
                $inc: { 
                    'gameData.npcsales.totalNPCPurchases': quantity,
                    'gameData.npcsales.totalNPCEarnings': totalPrice,
                    [`gameData.npcsales.npcItemsSold.${itemId}`]: quantity
                },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Tracked NPC purchases: ${quantity}x item ${itemId} for ${totalPrice} coins by user ${userId}`);
        } catch (error) {
            console.error('Error tracking NPC purchases:', error);
        }
    }

    // =============== ITEMS SOLD TRACKING ===============

    /**
     * Track items sold to players (through marketplace/shops)
     */
    async trackItemsSoldToPlayers(userId, guildId, count = 1) {
        try {
            await this.initializeUserGameData(userId, guildId, 'sellmarket');
            
            const updateData = {
                $inc: { 'gameData.sellmarket.itemsSoldToPlayers': count },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { upsert: true, new: true }
            );

            console.log(`[GameStatTracker] Tracked ${count} items sold to players for user ${userId}`);
        } catch (error) {
            console.error(`[GameStatTracker] Error tracking items sold to players for user ${userId}:`, error);
        }
    }

    /**
     * Track items sold to NPCs
     */
    async trackItemsSoldToNPCs(userId, guildId, count = 1) {
        try {
            await this.initializeUserGameData(userId, guildId, 'npcsales');
            
            const updateData = {
                $inc: { 'gameData.npcsales.itemsSoldToNPCs': count },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { upsert: true, new: true }
            );

            console.log(`[GameStatTracker] Tracked ${count} items sold to NPCs for user ${userId}`);
        } catch (error) {
            console.error(`[GameStatTracker] Error tracking items sold to NPCs for user ${userId}:`, error);
        }
    }

    /**
     * Get total items sold (both to players and NPCs)
     */
    async getTotalItemsSold(userId, guildId) {
        try {
            const stats = await this.getUserGameStats(userId, guildId);
            const sellmarketStats = stats.sellmarket || {};
            const npcsalesStats = stats.npcsales || {};
            
            const itemsSoldToPlayers = sellmarketStats.itemsSoldToPlayers || 0;
            const itemsSoldToNPCs = npcsalesStats.itemsSoldToNPCs || 0;
            
            return {
                totalItemsSold: itemsSoldToPlayers + itemsSoldToNPCs,
                itemsSoldToPlayers,
                itemsSoldToNPCs
            };
        } catch (error) {
            console.error(`[GameStatTracker] Error getting total items sold for user ${userId}:`, error);
            return {
                totalItemsSold: 0,
                itemsSoldToPlayers: 0,
                itemsSoldToNPCs: 0
            };
        }
    }

    // =============== BATCH OPERATIONS FOR PERFORMANCE ===============

    /**
     * Batch update multiple stats at once for better performance
     */
    async batchUpdateStats(userId, guildId, statsUpdates) {
        try {
            // First, ensure the user document exists with proper structure
            await UserStats.findOneAndUpdate(
                { userId, guildId },
                {
                    $setOnInsert: {
                        userId,
                        guildId,
                        firstSeen: new Date(),
                        gameData: {
                            mining: {
                                tilesMoved: 0,
                                itemsFound: {},
                                itemsFoundBySource: { mining: {}, treasure: {} },
                                tilesBroken: {},
                                hazardsEvaded: 0,
                                hazardsTriggered: 0,
                                hazardsSeen: 0,
                                hazardsByType: {},
                                movementByDirection: {},
                                highestPowerLevel: 0,
                                timeInMiningChannel: 0
                            },
                            innkeeper: {
                                overnightStays: 0,
                                happyCustomers: 0,
                                sadCustomers: 0,
                                reputationGained: 0,
                                reputationLost: 0,
                                moneyEarned: 0,
                                ordersPlaced: 0,
                                highestLevel: 0
                            },
                            sellmarket: {
                                totalItemsSold: 0,
                                totalItemsBought: 0,
                                totalEarnings: 0,
                                totalSpent: 0,
                                itemsSold: {},
                                itemsBought: {},
                                itemsSoldToPlayers: 0
                            },
                            npcsales: {
                                totalNPCPurchases: 0,
                                totalNPCEarnings: 0,
                                npcItemsSold: {},
                                itemsSoldToNPCs: 0
                            }
                        }
                    }
                },
                { upsert: true }
            );

            // Then update the stats
            const updateData = {
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                }
            };

            // Add increment operations
            for (const [path, value] of Object.entries(statsUpdates)) {
                updateData.$inc = updateData.$inc || {};
                updateData.$inc[path] = value;
            }

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { new: true }
            );

            console.log(`📊 Batch updated stats for user ${userId}:`, Object.keys(statsUpdates));
        } catch (error) {
            console.error('Error in batch update stats:', error);
        }
    }

    // =============== STATS RETRIEVAL ===============

    /**
     * Get user's game stats
     */
    async getUserGameStats(userId, guildId, gameMode = 'mining') {
        try {
            const userStats = await UserStats.findOne({ userId, guildId });
            if (!userStats || !userStats.gameData || !userStats.gameData[gameMode]) {
                return this.getDefaultGameStats(gameMode);
            }

            return userStats.gameData[gameMode];
        } catch (error) {
            console.error('Error getting user game stats:', error);
            return this.getDefaultGameStats(gameMode);
        }
    }

    /**
     * Get all users' game stats for a guild
     */
    async getAllUsersGameStats(guildId, gameMode = 'mining') {
        try {
            const users = await UserStats.find({ guildId }).select('userId username gameData');
            return users.map(user => ({
                userId: user.userId,
                username: user.username,
                gameStats: user.gameData?.[gameMode] || this.getDefaultGameStats(gameMode)
            }));
        } catch (error) {
            console.error('Error getting all users game stats:', error);
            return [];
        }
    }

    /**
     * Get default game stats structure
     */
    getDefaultGameStats(gameMode = 'mining') {
        const defaultStats = {
            mining: {
                tilesMoved: 0,
                itemsFound: {},
                itemsFoundBySource: { mining: {}, treasure: {} },
                tilesBroken: {},
                hazardsEvaded: 0,
                hazardsTriggered: 0,
                hazardsSeen: 0,
                hazardsByType: {},
                movementByDirection: {},
                highestPowerLevel: 0,
                timeInMiningChannel: 0
            },
            innkeeper: {
                overnightStays: 0,
                happyCustomers: 0,
                sadCustomers: 0,
                reputationGained: 0,
                reputationLost: 0,
                moneyEarned: 0,
                ordersPlaced: 0,
                highestLevel: 0
            },
            sellmarket: {
                totalItemsSold: 0,
                totalItemsBought: 0,
                totalEarnings: 0,
                totalSpent: 0,
                itemsSold: {},
                itemsBought: {},
                itemsSoldToPlayers: 0
            },
            npcsales: {
                totalNPCPurchases: 0,
                totalNPCEarnings: 0,
                npcItemsSold: {},
                itemsSoldToNPCs: 0
            }
        };

        return defaultStats[gameMode] || {};
    }

    // =============== UTILITY FUNCTIONS ===============

    /**
     * Format time duration for display
     */
    formatDuration(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(' ');
    }

    /**
     * Initialize game data for a user if it doesn't exist
     */
    async initializeUserGameData(userId, guildId, gameMode = 'mining') {
        try {
            const userStats = await UserStats.findOne({ userId, guildId });
            if (!userStats || !userStats.gameData || !userStats.gameData[gameMode]) {
                const defaultStats = this.getDefaultGameStats(gameMode);
                
                await UserStats.findOneAndUpdate(
                    { userId, guildId },
                    {
                        $set: { 
                            [`gameData.${gameMode}`]: defaultStats,
                            lastSeen: new Date(),
                            lastUpdated: new Date()
                        },
                        $setOnInsert: {
                            userId,
                            guildId,
                            firstSeen: new Date()
                        }
                    },
                    { upsert: true, new: true }
                );

                console.log(`📊 Initialized ${gameMode} game data for user ${userId}`);
            }
        } catch (error) {
            console.error('Error initializing user game data:', error);
        }
    }
}

module.exports = GameStatTracker;

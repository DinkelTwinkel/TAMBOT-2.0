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
            const updateData = {
                $inc: { 'gameData.mining.tilesMoved': 1 },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                },
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
                            timeInMiningChannel: 0
                        }
                    }
                }
            };

            // Track direction if provided
            if (direction) {
                updateData.$inc[`gameData.mining.movementByDirection.${direction}`] = 1;
            }

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { upsert: true, new: true }
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
            const updateData = {
                $inc: { 
                    [`gameData.mining.itemsFound.${itemId}`]: quantity,
                    [`gameData.mining.itemsFoundBySource.${source}.${itemId}`]: quantity
                },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                },
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
                            timeInMiningChannel: 0
                        }
                    }
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { upsert: true, new: true }
            );

            console.log(`📊 Tracked item found: ${quantity}x item ${itemId} from ${source} for user ${userId}`);
        } catch (error) {
            console.error('Error tracking item found:', error);
        }
    }

    /**
     * Track tile breaking by tile type
     */
    async trackTileBroken(userId, guildId, tileType) {
        try {
            const updateData = {
                $inc: { [`gameData.mining.tilesBroken.${tileType}`]: 1 },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                },
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
                            timeInMiningChannel: 0
                        }
                    }
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { upsert: true, new: true }
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
            const updateData = {
                $inc: { 
                    [`gameData.mining.hazards${interactionType.charAt(0).toUpperCase() + interactionType.slice(1)}`]: 1,
                    [`gameData.mining.hazardsByType.${hazardType}.${interactionType}`]: 1
                },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                },
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
                            timeInMiningChannel: 0
                        }
                    }
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { upsert: true, new: true }
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
                        },
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
                                    timeInMiningChannel: 0
                                }
                            }
                        }
                    },
                    { upsert: true, new: true }
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
            const updateData = {
                $inc: { 'gameData.mining.timeInMiningChannel': timeInSeconds },
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                },
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
                            timeInMiningChannel: 0
                        }
                    }
                }
            };

            await UserStats.findOneAndUpdate(
                { userId, guildId },
                updateData,
                { upsert: true, new: true }
            );

            console.log(`📊 Tracked mining time: ${timeInSeconds}s for user ${userId}`);
        } catch (error) {
            console.error('Error tracking mining time:', error);
        }
    }

    // =============== BATCH OPERATIONS FOR PERFORMANCE ===============

    /**
     * Batch update multiple stats at once for better performance
     */
    async batchUpdateStats(userId, guildId, statsUpdates) {
        try {
            const updateData = {
                $set: { 
                    lastSeen: new Date(),
                    lastUpdated: new Date()
                },
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
                        }
                    }
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
                { upsert: true, new: true }
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

// Mining Stats Integration - Hooks stat tracking into the mining system
const PlayerStats = require('../../../models/playerStats');

class MiningStatsIntegration {
    constructor() {
        this.activeMiningChannels = new Map(); // Track which channels have active mining
    }

    /**
     * Initialize mining session tracking
     */
    async initializeMiningSession(channel, member) {
        const channelId = channel.id;
        const playerId = member.id;
        const playerName = member.displayName || member.user.username;
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;

        // Track that this channel has active mining
        if (!this.activeMiningChannels.has(channelId)) {
            this.activeMiningChannels.set(channelId, new Set());
        }
        this.activeMiningChannels.get(channelId).add(playerId);

        // Start mining session tracking in PlayerStats
        await PlayerStats.findOneAndUpdate(
            { playerId, guildId },
            {
                $set: {
                    playerName,
                    guildName,
                    lastUpdated: new Date()
                },
                $inc: { 'gameData.mining.totalTimeInMines': 0 }, // Initialize if needed
                $setOnInsert: { 
                    playerId,
                    guildId,
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );
    }

    /**
     * Clean up mining session when player leaves
     */
    async cleanupMiningSession(channel, member) {
        const channelId = channel.id;
        const playerId = member.id;
        const playerName = member.displayName || member.user.username;
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;

        // Remove from active channels
        if (this.activeMiningChannels.has(channelId)) {
            this.activeMiningChannels.get(channelId).delete(playerId);
            if (this.activeMiningChannels.get(channelId).size === 0) {
                this.activeMiningChannels.delete(channelId);
            }
        }

        // End mining session tracking (could add session duration tracking here if needed)
        console.log(`📊 Mining session ended for ${playerName} in channel ${channelId}`);
    }

    /**
     * Track player movement/tile travel
     */
    async trackPlayerMovement(member, channel, fromPosition, toPosition) {
        const playerId = member.id;
        const playerName = member.displayName || member.user.username;
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;

        // Calculate distance moved
        let distance = 1;
        if (fromPosition && toPosition) {
            distance = Math.abs(toPosition.x - fromPosition.x) + Math.abs(toPosition.y - fromPosition.y);
        }

        await PlayerStats.findOneAndUpdate(
            { playerId, guildId },
            {
                $inc: { 
                    'gameData.mining.tilesTravelled': distance,
                    'gameData.totalDistanceMoved': distance
                },
                $set: { lastUpdated: new Date() }
            },
            { upsert: true }
        );
    }

    /**
     * Track wall broken
     */
    async trackWallBroken(member, channel, tileType, tileHardness = 1) {
        const playerId = member.id;
        const playerName = member.displayName || member.user.username;
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;

        const { TILE_TYPES } = require('./miningConstants_unified');
        const isReinforced = tileType === TILE_TYPES.REINFORCED_WALL;

        await PlayerStats.findOneAndUpdate(
            { playerId, guildId },
            {
                $inc: { 
                    'gameData.mining.wallsBroken': 1,
                    ...(isReinforced && { 'gameData.mining.reinforcedWallsBroken': 1 })
                },
                $set: { lastUpdated: new Date() }
            },
            { upsert: true }
        );
    }

    /**
     * Track ore found during mining
     */
    async trackOreFound(member, channel, item, quantity = 1, tileType = null) {
        const playerId = member.id;
        const playerName = member.displayName || member.user.username;
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;

        const { TILE_TYPES, ITEM_CATEGORY } = require('./miningConstants_unified');
        
        // Determine if this is a rare ore
        const isRare = tileType === TILE_TYPES.RARE_ORE || 
                      item.tier === 'epic' || 
                      item.tier === 'legendary' ||
                      item.category === ITEM_CATEGORY.RARE_ORE;

        const value = (item.value || 0) * quantity;

        await PlayerStats.findOneAndUpdate(
            { playerId, guildId },
            {
                $inc: { 
                    'gameData.mining.oresFound': quantity,
                    ...(isRare && { 'gameData.mining.rareOresFound': quantity }),
                    'gameData.mining.totalMiningValue': value
                },
                $set: { lastUpdated: new Date() }
            },
            { upsert: true }
        );
    }

    /**
     * Track treasure found
     */
    async trackTreasureFound(member, channel, item, quantity = 1) {
        const playerId = member.id;
        const playerName = member.displayName || member.user.username;
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;

        const value = (item.value || 0) * quantity;

        await PlayerStats.findOneAndUpdate(
            { playerId, guildId },
            {
                $inc: { 
                    'gameData.mining.treasuresFound': quantity,
                    'gameData.mining.totalMiningValue': value
                },
                $set: { lastUpdated: new Date() }
            },
            { upsert: true }
        );
    }

    /**
     * Track mine server discovery
     */
    async trackMineDiscovery(member, channel, mineTypeId, mineName) {
        const playerId = member.id;
        const playerName = member.displayName || member.user.username;
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;

        const result = await PlayerStats.findOneAndUpdate(
            { playerId, guildId },
            {
                $inc: { 'gameData.mining.minesDiscovered': 1 },
                $addToSet: { 'gameData.mining.mineDiscoveries': { mineTypeId, mineName, discoveredAt: new Date() } },
                $set: { lastUpdated: new Date() }
            },
            { upsert: true, new: true }
        );

        return true; // For now, assume all discoveries are new
    }

    /**
     * Track hazard activation
     */
    async trackHazardActivated(member, channel, hazardType, survived = true, damage = 0) {
        const playerId = member.id;
        const playerName = member.displayName || member.user.username;
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;

        // Track hazard in PlayerStats (could expand this with more details if needed)
        await PlayerStats.findOneAndUpdate(
            { playerId, guildId },
            {
                $set: { lastUpdated: new Date() }
                // Could add hazard-specific tracking here
            },
            { upsert: true }
        );
    }

    /**
     * Track pickaxe durability loss and breaking
     */
    async trackPickaxeUsage(member, channel, pickaxe, durabilityLoss, broken = false) {
        const playerId = member.id;
        const playerName = member.displayName || member.user.username;
        const guildId = channel.guild.id;
        const guildName = channel.guild.name;

        if (broken) {
            await PlayerStats.findOneAndUpdate(
                { playerId, guildId },
                {
                    $inc: { 'gameData.mining.pickaxesBroken': 1 },
                    $set: { lastUpdated: new Date() }
                },
                { upsert: true }
            );
        }
    }

    /**
     * Hook into the main mining processing function
     * This should be called from processPlayerActionsEnhanced
     */
    async processPlayerActions(member, playerData, mapData, dbEntry, eventLogs, results) {
        const channel = member.guild.channels.cache.get(dbEntry.channelId);
        if (!channel) return;

        // Initialize mining session if not already tracked
        if (!this.activeMiningChannels.has(channel.id) || 
            !this.activeMiningChannels.get(channel.id).has(member.id)) {
            await this.initializeMiningSession(channel, member);
        }

        // Process any movement that occurred
        if (results.movement && results.movement.moved) {
            await this.trackPlayerMovement(
                member, 
                channel, 
                results.movement.from, 
                results.movement.to
            );
        }

        // Process any walls broken
        if (results.wallsBroken && results.wallsBroken.length > 0) {
            for (const wall of results.wallsBroken) {
                await this.trackWallBroken(member, channel, wall.tileType, wall.hardness);
            }
        }

        // Process any items found
        if (results.itemsFound && results.itemsFound.length > 0) {
            for (const itemResult of results.itemsFound) {
                if (itemResult.isTreasure) {
                    await this.trackTreasureFound(member, channel, itemResult.item, itemResult.quantity);
                } else {
                    await this.trackOreFound(member, channel, itemResult.item, itemResult.quantity, itemResult.tileType);
                }
            }
        }

        // Process any hazards activated
        if (results.hazardsActivated && results.hazardsActivated.length > 0) {
            for (const hazard of results.hazardsActivated) {
                await this.trackHazardActivated(
                    member, 
                    channel, 
                    hazard.type, 
                    hazard.survived, 
                    hazard.damage
                );
            }
        }

        // Process pickaxe usage
        if (results.pickaxeUsage) {
            await this.trackPickaxeUsage(
                member, 
                channel, 
                results.pickaxeUsage.pickaxe, 
                results.pickaxeUsage.durabilityLoss, 
                results.pickaxeUsage.broken
            );
        }
    }

    /**
     * Batch process mining stats for all active players in a channel
     */
    async batchProcessMiningStats(channel, playerResults) {
        for (const [memberId, results] of Object.entries(playerResults)) {
            const member = channel.guild.members.cache.get(memberId);
            if (member && results) {
                await this.processPlayerActions(member, null, null, { channelId: channel.id }, null, results);
            }
        }
    }

    /**
     * Handle mine discovery events
     */
    async handleMineDiscovery(channel, members, mineTypeId, mineName) {
        const discoveryPromises = [];
        
        for (const member of members) {
            if (!member.user.bot) {
                discoveryPromises.push(
                    this.trackMineDiscovery(member, channel, mineTypeId, mineName)
                );
            }
        }
        
        const results = await Promise.all(discoveryPromises);
        
        // Return info about who made new discoveries
        const newDiscoveries = [];
        for (let i = 0; i < members.length; i++) {
            if (results[i] && !members[i].user.bot) {
                newDiscoveries.push(members[i]);
            }
        }
        
        return newDiscoveries;
    }

    /**
     * Clean up all mining sessions for a channel (when channel closes)
     */
    async cleanupChannelSessions(channel) {
        const channelId = channel.id;
        
        if (this.activeMiningChannels.has(channelId)) {
            const activePlayerIds = Array.from(this.activeMiningChannels.get(channelId));
            
            for (const playerId of activePlayerIds) {
                const member = channel.guild.members.cache.get(playerId);
                if (member) {
                    await this.cleanupMiningSession(channel, member);
                }
            }
            
            this.activeMiningChannels.delete(channelId);
        }
    }

    /**
     * Get mining stats for a player
     */
    async getPlayerMiningStats(playerId, guildId) {
        const stats = await this.statTracker.getComprehensiveStats(playerId, guildId);
        return stats ? stats.mining : null;
    }

    /**
     * Force flush any cached mining stats
     */
    async flushStats() {
        await this.statTracker.forceFlushCache();
    }
}

// Export singleton instance
const miningStatsIntegration = new MiningStatsIntegration();
module.exports = miningStatsIntegration;

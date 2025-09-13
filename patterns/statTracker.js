const mongoose = require('mongoose');
const PlayerStats = require('../models/playerStats');

class StatTracker {
    constructor() {
        this.playerCache = new Map();
        this.eventQueue = [];
        this.processingInterval = null;
        this.startProcessing();
    }

    // Get player stats with caching
    async getPlayerStats(playerId, playerName, guildId, guildName) {
        const cacheKey = `${playerId}-${guildId}`;
        
        if (this.playerCache.has(cacheKey)) {
            return this.playerCache.get(cacheKey);
        }

        let playerStats = await PlayerStats.findOne({ playerId, guildId });
        
        if (!playerStats) {
            playerStats = new PlayerStats({
                playerId,
                playerName,
                guildId,
                guildName
            });
            await playerStats.save();
        }

        this.playerCache.set(cacheKey, playerStats);
        return playerStats;
    }

    // Queue events for batch processing
    queueEvent(event) {
        this.eventQueue.push(event);
    }

    // Start processing events
    startProcessing() {
        if (this.processingInterval) return;
        
        this.processingInterval = setInterval(() => {
            this.processEventQueue();
        }, 5000); // Process every 5 seconds
    }

    // Process queued events
    async processEventQueue() {
        if (this.eventQueue.length === 0) return;

        const events = [...this.eventQueue];
        this.eventQueue = [];

        for (const event of events) {
            try {
                await this.processQueuedEvent(event);
            } catch (error) {
                console.error('Error processing stat event:', error);
            }
        }
    }

    // Process individual queued event
    async processQueuedEvent(event) {
        const { type, playerId, playerName, guildId, guildName, data } = event;
        
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        
        switch (type) {
            case 'tile_travelled':
                await this._trackTileTravelled(playerStats, data);
                break;
            case 'wall_broken':
                await this._trackWallBroken(playerStats, data);
                break;
            case 'tile_failed_to_break':
                await this._trackTileFailedToBreak(playerStats, data);
                break;
            case 'map_expanded':
                await this._trackMapExpanded(playerStats, data);
                break;
            case 'power_level_reached':
                await this._trackPowerLevelReached(playerStats, data);
                break;
            case 'gacha_vc_type_reached':
                await this._trackGachaVCTypeReached(playerStats, data);
                break;
            case 'ore_found':
                await this._trackOreFound(playerStats, data);
                break;
            case 'treasure_found':
                await this._trackTreasureFound(playerStats, data);
                break;
            case 'mine_discovered':
                await this._trackMineDiscovered(playerStats, data);
                break;
            case 'hazard_activated':
                await this._trackHazardActivated(playerStats, data);
                break;
            case 'pickaxe_broken':
                await this._trackPickaxeBroken(playerStats, data);
                break;
            case 'familiar_summoned':
                await this._trackFamiliarSummoned(playerStats, data);
                break;
            case 'familiar_activity':
                await this._trackFamiliarActivity(playerStats, data);
                break;
            case 'item_usage':
                await this._trackItemUsage(playerStats, data);
                break;
            case 'gullet_consumption':
                await this._trackGulletConsumption(playerStats, data);
                break;
            case 'mining_session_start':
                await this._trackMiningSessionStart(playerStats, data);
                break;
            case 'mining_session_end':
                await this._trackMiningSessionEnd(playerStats, data);
                break;
            case 'mining_break':
                await this._trackMiningBreak(playerStats, data);
                break;
            case 'innkeeping_earnings':
                await this._trackInnkeepingEarnings(playerStats, data);
                break;
            case 'customer_interaction':
                await this._trackCustomerInteraction(playerStats, data);
                break;
            case 'inn_expansion':
                await this._trackInnExpansion(playerStats, data);
                break;
            case 'employee_hired':
                await this._trackEmployeeHired(playerStats, data);
                break;
            case 'work_shift_completed':
                await this._trackWorkShiftCompleted(playerStats, data);
                break;
            case 'innkeeping_session':
                await this._trackInnkeepingSession(playerStats, data);
                break;
            case 'innkeeping_break':
                await this._trackInnkeepingBreak(playerStats, data);
                break;
            case 'item_sold':
                await this._trackItemSold(playerStats, data);
                break;
            case 'npc_shop_spending':
                await this._trackNpcShopSpending(playerStats, data);
                break;
            case 'shop_visit':
                await this._trackShopVisit(playerStats, data);
                break;
            case 'customer_purchase':
                await this._trackCustomerPurchase(playerStats, data);
                break;
            case 'message_sent':
                await this._trackMessageSent(playerStats, data);
                break;
            case 'command_used':
                await this._trackCommandUsed(playerStats, data);
                break;
            case 'voice_time':
                await this._trackVoiceTime(playerStats, data);
                break;
        }

        await playerStats.save();
    }

    // Internal mining stat tracking methods (for use with playerStats documents)
    async _trackTileTravelled(playerStats, data) {
        const { tiles, mapSize } = data;
        playerStats.updateStat('mining.tilesTravelled', tiles);
        playerStats.updateStat('mining.totalTilesTravelled', tiles);
        playerStats.updateStat('mining.highestMapSize', mapSize, 'max');
    }

    async _trackWallBroken(playerStats, data) {
        const { wallType, value } = data;
        playerStats.updateStat('mining.wallsBroken', 1);
        playerStats.updateStat('mining.totalValueFound', value);
        
        if (wallType === 'reinforced') {
            playerStats.updateStat('mining.reinforcedWallsBroken', 1);
        }
    }

    async _trackTileFailedToBreak(playerStats, data) {
        const { attempts } = data;
        playerStats.updateStat('mining.tilesFailedToBreak', attempts);
    }

    async _trackMapExpanded(playerStats, data) {
        const { newSize } = data;
        playerStats.updateStat('mining.mapsExpanded', 1);
        playerStats.updateStat('mining.highestMapSize', newSize, 'max');
    }

    async _trackPowerLevelReached(playerStats, data) {
        const { powerLevel } = data;
        playerStats.updateStat('mining.highestPowerLevel', powerLevel, 'max');
    }

    async _trackGachaVCTypeReached(playerStats, data) {
        const { vcType } = data;
        playerStats.updateStat(`mining.gachaVCTypesReached.${vcType}`, 1);
    }

    async _trackOreFound(playerStats, data) {
        const { oreType, value, rarity } = data;
        playerStats.addOreFound(oreType, oreType, 1, value);
    }

    async _trackTreasureFound(playerStats, data) {
        const { treasureType, value } = data;
        playerStats.updateStat('mining.treasuresFound', 1);
        playerStats.updateStat('mining.totalValueFound', value);
        playerStats.addToArray('mining.treasuresFoundList', { type: treasureType, value, timestamp: new Date() });
    }

    async _trackMineDiscovered(playerStats, data) {
        const { mineType } = data;
        playerStats.updateStat('mining.minesDiscovered', 1);
        playerStats.addToArray('mining.minesDiscoveredList', { type: mineType, timestamp: new Date() });
    }

    async _trackHazardActivated(playerStats, data) {
        const { hazardType } = data;
        playerStats.updateStat('mining.hazardsActivated', 1);
        playerStats.addToArray('mining.hazardsActivatedList', { type: hazardType, timestamp: new Date() });
    }

    async _trackPickaxeBroken(playerStats, data) {
        const { pickaxeType } = data;
        playerStats.updateStat('mining.pickaxesBroken', 1);
        playerStats.addToArray('mining.pickaxesBrokenList', { type: pickaxeType, timestamp: new Date() });
    }

    async _trackFamiliarSummoned(playerStats, data) {
        const { familiarType } = data;
        playerStats.updateStat('mining.familiarsSummoned', 1);
        playerStats.addToArray('mining.familiarsSummonedList', { type: familiarType, timestamp: new Date() });
    }

    async _trackFamiliarActivity(playerStats, data) {
        const { oreType, value } = data;
        playerStats.updateStat('mining.familiarOresMined', 1);
        playerStats.updateStat('mining.familiarValueEarned', value);
        playerStats.addToArray('mining.familiarActivityList', { oreType, value, timestamp: new Date() });
    }

    async _trackItemUsage(playerStats, data) {
        const { itemType, duration } = data;
        playerStats.updateStat(`mining.itemUsage.${itemType}`, duration);
    }

    async _trackGulletConsumption(playerStats, data) {
        const { itemType, amount } = data;
        playerStats.updateStat(`mining.gulletConsumption.${itemType}`, amount);
    }

    async _trackMiningSessionStart(playerStats, data) {
        const { timestamp } = data;
        playerStats.updateStat('mining.currentSessionStart', timestamp, 'set');
        playerStats.updateStat('mining.sessionsStarted', 1);
    }

    async _trackMiningSessionEnd(playerStats, data) {
        const { duration, value } = data;
        playerStats.updateStat('mining.totalMiningTime', duration);
        playerStats.updateStat('mining.sessionsCompleted', 1);
        playerStats.updateStat('mining.totalValueFound', value);
        playerStats.updateStat('mining.currentSessionStart', null, 'set');
    }

    async _trackMiningBreak(playerStats, data) {
        const { breakType, duration } = data;
        if (breakType === 'short') {
            playerStats.updateStat('mining.shortBreaksReached', 1);
        } else if (breakType === 'long') {
            playerStats.updateStat('mining.longBreaksReached', 1);
        }
        playerStats.updateStat('mining.totalBreakTime', duration);
    }

    // Internal innkeeping stat tracking methods
    async _trackInnkeepingEarnings(playerStats, data) {
        const { amount, source } = data;
        playerStats.updateStat('innkeeping.totalEarnings', amount);
        playerStats.addToArray('innkeeping.earningsList', { amount, source, timestamp: new Date() });
    }

    async _trackCustomerInteraction(playerStats, data) {
        const { customerType, satisfaction, stayedOvernight } = data;
        playerStats.updateStat('innkeeping.customersServed', 1);
        
        if (satisfaction === 'happy') {
            playerStats.updateStat('innkeeping.customersLeftHappy', 1);
        } else if (satisfaction === 'sad') {
            playerStats.updateStat('innkeeping.customersLeftSad', 1);
        }
        
        if (stayedOvernight) {
            playerStats.updateStat('innkeeping.customersStayedOvernight', 1);
        }
        
        playerStats.addToArray('innkeeping.customerInteractions', {
            type: customerType,
            satisfaction,
            stayedOvernight,
            timestamp: new Date()
        });
    }

    async _trackInnExpansion(playerStats, data) {
        const { expansionType, cost } = data;
        playerStats.updateStat('innkeeping.innExpansions', 1);
        playerStats.updateStat('innkeeping.totalExpansionCost', cost);
        playerStats.addToArray('innkeeping.expansionsList', { type: expansionType, cost, timestamp: new Date() });
    }

    async _trackEmployeeHired(playerStats, data) {
        const { employeeType, salary } = data;
        playerStats.updateStat('innkeeping.employeesHired', 1);
        playerStats.updateStat('innkeeping.totalEmployeeCost', salary);
        playerStats.addToArray('innkeeping.employeesList', { type: employeeType, salary, timestamp: new Date() });
    }

    async _trackWorkShiftCompleted(playerStats, data) {
        const { shiftType, earnings } = data;
        playerStats.updateStat('innkeeping.workShiftsCompleted', 1);
        playerStats.updateStat('innkeeping.totalEarnings', earnings);
        playerStats.addToArray('innkeeping.workShiftsList', { type: shiftType, earnings, timestamp: new Date() });
    }

    async _trackInnkeepingSession(playerStats, data) {
        const { duration } = data;
        playerStats.updateStat('innkeeping.totalInnkeepingTime', duration);
        playerStats.updateStat('innkeeping.sessionsCompleted', 1);
    }

    async _trackInnkeepingBreak(playerStats, data) {
        const { breakType, duration } = data;
        if (breakType === 'short') {
            playerStats.updateStat('innkeeping.shortBreaksReached', 1);
        } else if (breakType === 'long') {
            playerStats.updateStat('innkeeping.longBreaksReached', 1);
        }
        playerStats.updateStat('innkeeping.totalBreakTime', duration);
    }

    // Internal market stat tracking methods
    async _trackItemSold(playerStats, data) {
        const { itemType, amount, price, buyer } = data;
        playerStats.updateStat('market.itemsSold', amount);
        playerStats.updateStat('market.totalRevenue', price);
        playerStats.addToArray('market.salesList', { itemType, amount, price, buyer, timestamp: new Date() });
    }

    async _trackNpcShopSpending(playerStats, data) {
        const { itemType, amount, cost } = data;
        playerStats.updateStat('market.npcShopSpending', cost);
        playerStats.addToArray('market.npcPurchasesList', { itemType, amount, cost, timestamp: new Date() });
    }

    async _trackShopVisit(playerStats, data) {
        const { shopType, duration } = data;
        playerStats.updateStat('market.shopVisits', 1);
        playerStats.addToArray('market.shopVisitsList', { type: shopType, duration, timestamp: new Date() });
    }

    async _trackCustomerPurchase(playerStats, data) {
        const { itemType, amount, price, seller } = data;
        playerStats.updateStat('market.customerPurchases', 1);
        playerStats.updateStat('market.totalSpent', price);
        playerStats.addToArray('market.purchasesList', { itemType, amount, price, seller, timestamp: new Date() });
    }

    // Internal Discord stat tracking methods
    async _trackMessageSent(playerStats, data) {
        const { channelType, messageLength } = data;
        playerStats.updateStat('discord.messagesSent', 1);
        playerStats.updateStat('discord.totalMessageLength', messageLength);
        playerStats.addToArray('discord.messagesList', { channelType, length: messageLength, timestamp: new Date() });
    }

    async _trackCommandUsed(playerStats, data) {
        const { commandName, success } = data;
        playerStats.updateStat('discord.commandsUsed', 1);
        if (success) {
            playerStats.updateStat('discord.successfulCommands', 1);
        }
        playerStats.addToArray('discord.commandsList', { name: commandName, success, timestamp: new Date() });
    }

    async _trackVoiceTime(playerStats, data) {
        const { duration, channelType } = data;
        playerStats.updateStat('discord.totalVoiceTime', duration);
        playerStats.addToArray('discord.voiceSessionsList', { channelType, duration, timestamp: new Date() });
    }

    // Wrapper methods for direct calls from game code
    async trackTileTravelled(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackTileTravelled(playerStats, data);
        await playerStats.save();
    }

    async trackWallBroken(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackWallBroken(playerStats, data);
        await playerStats.save();
    }

    async trackTileFailedToBreak(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackTileFailedToBreak(playerStats, data);
        await playerStats.save();
    }

    async trackMapExpanded(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackMapExpanded(playerStats, data);
        await playerStats.save();
    }

    async trackPowerLevelReached(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackPowerLevelReached(playerStats, data);
        await playerStats.save();
    }

    async trackGachaVCTypeReached(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackGachaVCTypeReached(playerStats, data);
        await playerStats.save();
    }

    async trackOreFound(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackOreFound(playerStats, data);
        await playerStats.save();
    }

    async trackTreasureFound(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackTreasureFound(playerStats, data);
        await playerStats.save();
    }

    async trackMineDiscovered(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackMineDiscovered(playerStats, data);
        await playerStats.save();
    }

    async trackHazardActivated(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackHazardActivated(playerStats, data);
        await playerStats.save();
    }

    async trackPickaxeBroken(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackPickaxeBroken(playerStats, data);
        await playerStats.save();
    }

    async trackFamiliarSummoned(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackFamiliarSummoned(playerStats, data);
        await playerStats.save();
    }

    async trackFamiliarActivity(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackFamiliarActivity(playerStats, data);
        await playerStats.save();
    }

    async trackItemUsage(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackItemUsage(playerStats, data);
        await playerStats.save();
    }

    async trackGulletConsumption(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackGulletConsumption(playerStats, data);
        await playerStats.save();
    }

    async trackMiningSessionStart(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackMiningSessionStart(playerStats, data);
        await playerStats.save();
    }

    async trackMiningSessionEnd(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackMiningSessionEnd(playerStats, data);
        await playerStats.save();
    }

    async trackMiningBreak(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackMiningBreak(playerStats, data);
        await playerStats.save();
    }

    // Innkeeping wrapper methods
    async trackInnkeepingEarnings(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackInnkeepingEarnings(playerStats, data);
        await playerStats.save();
    }

    async trackCustomerInteraction(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackCustomerInteraction(playerStats, data);
        await playerStats.save();
    }

    async trackInnExpansion(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackInnExpansion(playerStats, data);
        await playerStats.save();
    }

    async trackEmployeeHired(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackEmployeeHired(playerStats, data);
        await playerStats.save();
    }

    async trackWorkShiftCompleted(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackWorkShiftCompleted(playerStats, data);
        await playerStats.save();
    }

    async trackInnkeepingSession(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackInnkeepingSession(playerStats, data);
        await playerStats.save();
    }

    async trackInnkeepingBreak(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackInnkeepingBreak(playerStats, data);
        await playerStats.save();
    }

    // Market wrapper methods
    async trackItemSold(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackItemSold(playerStats, data);
        await playerStats.save();
    }

    async trackNpcShopSpending(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackNpcShopSpending(playerStats, data);
        await playerStats.save();
    }

    async trackShopVisit(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackShopVisit(playerStats, data);
        await playerStats.save();
    }

    async trackCustomerPurchase(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackCustomerPurchase(playerStats, data);
        await playerStats.save();
    }

    // Discord wrapper methods
    async trackMessageSent(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackMessageSent(playerStats, data);
        await playerStats.save();
    }

    async trackCommandUsed(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackCommandUsed(playerStats, data);
        await playerStats.save();
    }

    async trackVoiceTime(playerId, playerName, guildId, guildName, data) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        await this._trackVoiceTime(playerStats, data);
        await playerStats.save();
    }

    // Utility methods for direct stat updates
    async updateStat(playerId, playerName, guildId, guildName, statPath, value, operation = 'inc') {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        playerStats.updateStat(statPath, value, operation);
        await playerStats.save();
    }

    async addToArray(playerId, playerName, guildId, guildName, arrayPath, value) {
        const playerStats = await this.getPlayerStats(playerId, playerName, guildId, guildName);
        playerStats.addToArray(arrayPath, value);
        await playerStats.save();
    }

    // Get player stats for admin command
    async getPlayerStatsForAdmin(playerId, guildId) {
        return await PlayerStats.findOne({ playerId, guildId });
    }

    // Get all players in guild for admin command
    async getAllPlayersInGuild(guildId) {
        return await PlayerStats.find({ guildId }).sort({ lastActivity: -1 });
    }

    // Clear cache for a specific player
    clearPlayerCache(playerId, guildId) {
        const cacheKey = `${playerId}-${guildId}`;
        this.playerCache.delete(cacheKey);
    }

    // Clear all cache
    clearAllCache() {
        this.playerCache.clear();
    }

    // Stop processing
    stopProcessing() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
    }
}

module.exports = StatTracker;

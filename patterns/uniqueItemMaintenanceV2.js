// patterns/uniqueItemMaintenanceV2.js
// Streamlined unique item maintenance using comprehensive stat tracking system

const UniqueItem = require('../models/uniqueItems');
const Money = require('../models/currency');
const PlayerStats = require('../models/playerStats');
const { UserStats } = require('../models/statsSchema');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');

class UniqueMaintenanceV2 {
    constructor() {
        this.maintenanceHandlers = {
            // Wealthiest maintenance - check if player is still the richest
            wealthiest: this.handleWealthiestMaintenance.bind(this),
            
            // Coins maintenance - deduct money from player
            coins: this.handleCoinsMaintenance.bind(this),
            
            // Mining activity - check mining stats from comprehensive system
            mining_activity: this.handleMiningActivityMaintenance.bind(this),
            
            // Voice activity - check voice time from existing system
            voice_activity: this.handleVoiceActivityMaintenance.bind(this),
            
            // Movement activity - check tiles moved from comprehensive system
            movement_activity: this.handleMovementActivityMaintenance.bind(this),
            
            // Ore-specific mining - check specific ore types from comprehensive system
            ore_mining: this.handleOreMiningMaintenance.bind(this),
            
            // Wall breaking - check walls broken from comprehensive system
            wall_breaking: this.handleWallBreakingMaintenance.bind(this),
            
            // Innkeeping activity - check inn earnings from comprehensive system
            innkeeping_activity: this.handleInnkeepingActivityMaintenance.bind(this),
            
            // Customer service - check customers served from comprehensive system
            customer_service: this.handleCustomerServiceMaintenance.bind(this),
            
            // Market activity - check items sold from comprehensive system
            market_activity: this.handleMarketActivityMaintenance.bind(this),
            
            // Power level - check highest power level reached
            power_level: this.handlePowerLevelMaintenance.bind(this),
            
            // Break participation - check breaks reached
            break_participation: this.handleBreakParticipationMaintenance.bind(this)
        };
    }

    /**
     * Get current stat value from comprehensive system
     */
    async getCurrentStatValue(userId, guildId, statPath) {
        try {
            // Check comprehensive system first
            const playerStats = await PlayerStats.findOne({ playerId: userId, guildId });
            if (playerStats && playerStats.gameData) {
                const pathParts = statPath.split('.');
                let current = playerStats.gameData;
                
                for (const part of pathParts) {
                    if (current && typeof current === 'object') {
                        current = current[part];
                    } else {
                        current = undefined;
                        break;
                    }
                }
                
                if (current !== undefined) {
                    return current;
                }
            }
            
            // Fallback to existing system for Discord stats
            if (statPath.includes('voice') || statPath.includes('message') || statPath.includes('command')) {
                const userStats = await UserStats.findOne({ userId, guildId });
                if (userStats) {
                    switch (statPath) {
                        case 'discord.totalVoiceTime':
                            return Math.floor(userStats.totalVoiceTime / 1000); // Convert to milliseconds
                        case 'discord.miningChannelTime':
                            return Math.floor((userStats.miningChannelTime || 0) * 1000); // Convert to milliseconds
                        case 'discord.innkeepingChannelTime':
                            return Math.floor((userStats.innkeepingChannelTime || 0) * 1000); // Convert to milliseconds
                        case 'discord.messagesSent':
                            return userStats.totalMessages || 0;
                        case 'discord.commandsUsed':
                            return userStats.totalCommandsUsed || 0;
                    }
                }
            }
            
            return 0;
        } catch (error) {
            console.error(`Error getting current stat value for ${statPath}:`, error);
            return 0;
        }
    }

    /**
     * Get specific ore quantity from comprehensive system
     */
    async getCurrentOreQuantity(userId, guildId, oreId) {
        try {
            const playerStats = await PlayerStats.findOne({ playerId: userId, guildId });
            if (playerStats && playerStats.gameData && playerStats.gameData.mining && playerStats.gameData.mining.oresByType) {
                const oreEntry = playerStats.gameData.mining.oresByType.find(ore => ore.oreId === oreId);
                return oreEntry ? oreEntry.quantity : 0;
            }
            return 0;
        } catch (error) {
            console.error(`Error getting ore quantity for ${oreId}:`, error);
            return 0;
        }
    }

    /**
     * Wealthiest maintenance handler
     */
    async handleWealthiestMaintenance(userId, userTag, item, requirement) {
        const richestPlayer = await Money.findOne().sort({ money: -1 }).limit(1);
        
        if (!richestPlayer || richestPlayer.userId !== userId) {
            throw new Error(`You are no longer the wealthiest player. Midas' Burden only serves the richest.`);
        }
        
        // Apply Midas' Burden wealth effect
        const wealthEffect = await this.applyMidasWealthEffect(userId, userTag);
        
        // Update stored stat (wealth at time of maintenance)
        await this.updateStoredStat(item, 'lastWealthAmount', richestPlayer.money);
        
        return {
            success: true,
            message: wealthEffect.message || `Your wealth maintains your hold on Midas' Burden`,
            wealthChange: wealthEffect
        };
    }

    /**
     * Coins maintenance handler
     */
    async handleCoinsMaintenance(userId, userTag, item, cost) {
        const moneyDoc = await Money.findOne({ userId });
        
        if (!moneyDoc || moneyDoc.money < cost) {
            throw new Error(`Insufficient funds. Need ${cost} coins for maintenance.`);
        }
        
        moneyDoc.money -= cost;
        await moneyDoc.save();
        
        await this.updateStoredStat(item, 'lastMaintenanceCost', cost);
        
        return {
            success: true,
            message: `Spent ${cost} coins on maintenance`
        };
    }

    /**
     * Mining activity maintenance handler
     */
    async handleMiningActivityMaintenance(userId, userTag, item, requirement, guildId) {
        const currentMiningBlocks = await this.getCurrentStatValue(userId, guildId, 'mining.wallsBroken');
        const lastMiningBlocks = item.maintenanceStats?.lastMiningBlocks || 0;
        const blocksSinceLastMaintenance = currentMiningBlocks - lastMiningBlocks;
        
        if (blocksSinceLastMaintenance < requirement) {
            throw new Error(`Insufficient mining activity. Need ${requirement} blocks mined since last maintenance (current: ${blocksSinceLastMaintenance}).`);
        }
        
        await this.updateStoredStat(item, 'lastMiningBlocks', currentMiningBlocks);
        
        return {
            success: true,
            message: `Mining activity requirement met (${blocksSinceLastMaintenance}/${requirement} blocks since last maintenance)`
        };
    }

    /**
     * Voice activity maintenance handler
     */
    async handleVoiceActivityMaintenance(userId, userTag, item, requirement, guildId) {
        const currentVoiceTime = await this.getCurrentStatValue(userId, guildId, 'discord.totalVoiceTime');
        const lastVoiceTime = item.maintenanceStats?.lastVoiceTime || 0;
        const voiceTimeSinceLastMaintenance = currentVoiceTime - lastVoiceTime;
        const minutesSince = Math.floor(voiceTimeSinceLastMaintenance / (1000 * 60));
        
        if (minutesSince < requirement) {
            throw new Error(`Insufficient voice activity. Need ${requirement} minutes since last maintenance (current: ${minutesSince}).`);
        }
        
        await this.updateStoredStat(item, 'lastVoiceTime', currentVoiceTime);
        
        return {
            success: true,
            message: `Voice activity requirement met (${minutesSince}/${requirement} minutes since last maintenance)`
        };
    }

    /**
     * Movement activity maintenance handler
     */
    async handleMovementActivityMaintenance(userId, userTag, item, requirement, guildId) {
        const currentTilesMoved = await this.getCurrentStatValue(userId, guildId, 'mining.tilesTravelled');
        const lastTilesMoved = item.maintenanceStats?.lastTilesMoved || 0;
        const tilesSinceLastMaintenance = currentTilesMoved - lastTilesMoved;
        
        if (tilesSinceLastMaintenance < requirement) {
            throw new Error(`Insufficient movement. Need ${requirement} tiles moved since last maintenance (current: ${tilesSinceLastMaintenance}).`);
        }
        
        await this.updateStoredStat(item, 'lastTilesMoved', currentTilesMoved);
        
        return {
            success: true,
            message: `Movement requirement met (${tilesSinceLastMaintenance}/${requirement} tiles since last maintenance)`
        };
    }

    /**
     * Ore-specific mining maintenance handler
     */
    async handleOreMiningMaintenance(userId, userTag, item, requirement, guildId, oreId) {
        const currentOreQuantity = await this.getCurrentOreQuantity(userId, guildId, oreId);
        const lastOreQuantity = item.maintenanceStats?.lastOreQuantities?.[oreId] || 0;
        const oresSinceLastMaintenance = currentOreQuantity - lastOreQuantity;
        
        if (oresSinceLastMaintenance < requirement) {
            const oreName = this.getOreNameById(oreId);
            throw new Error(`Insufficient ${oreName} mined. Need ${requirement} ${oreName} since last maintenance (current: ${oresSinceLastMaintenance}).`);
        }
        
        await this.updateStoredOreStat(item, oreId, currentOreQuantity);
        
        const oreName = this.getOreNameById(oreId);
        return {
            success: true,
            message: `${oreName} mining requirement met (${oresSinceLastMaintenance}/${requirement} ${oreName} since last maintenance)`
        };
    }

    /**
     * Wall breaking maintenance handler
     */
    async handleWallBreakingMaintenance(userId, userTag, item, requirement, guildId) {
        const currentWallsBroken = await this.getCurrentStatValue(userId, guildId, 'mining.wallsBroken');
        const currentReinforcedWalls = await this.getCurrentStatValue(userId, guildId, 'mining.reinforcedWallsBroken');
        const totalWalls = currentWallsBroken + currentReinforcedWalls;
        
        const lastWallsBroken = item.maintenanceStats?.lastWallsBroken || 0;
        const wallsSinceLastMaintenance = totalWalls - lastWallsBroken;
        
        if (wallsSinceLastMaintenance < requirement) {
            throw new Error(`Insufficient wall breaking. Need ${requirement} walls broken since last maintenance (current: ${wallsSinceLastMaintenance}).`);
        }
        
        await this.updateStoredStat(item, 'lastWallsBroken', totalWalls);
        
        return {
            success: true,
            message: `Wall breaking requirement met (${wallsSinceLastMaintenance}/${requirement} walls since last maintenance)`
        };
    }

    /**
     * Innkeeping activity maintenance handler
     */
    async handleInnkeepingActivityMaintenance(userId, userTag, item, requirement, guildId) {
        const currentEarnings = await this.getCurrentStatValue(userId, guildId, 'innkeeping.totalEarned');
        const lastEarnings = item.maintenanceStats?.lastInnEarnings || 0;
        const earningsSinceLastMaintenance = currentEarnings - lastEarnings;
        
        if (earningsSinceLastMaintenance < requirement) {
            throw new Error(`Insufficient innkeeping earnings. Need ${requirement} coins earned since last maintenance (current: ${earningsSinceLastMaintenance}).`);
        }
        
        await this.updateStoredStat(item, 'lastInnEarnings', currentEarnings);
        
        return {
            success: true,
            message: `Innkeeping requirement met (${earningsSinceLastMaintenance}/${requirement} coins earned since last maintenance)`
        };
    }

    /**
     * Customer service maintenance handler
     */
    async handleCustomerServiceMaintenance(userId, userTag, item, requirement, guildId) {
        const currentCustomers = await this.getCurrentStatValue(userId, guildId, 'innkeeping.customersServed');
        const lastCustomers = item.maintenanceStats?.lastCustomersServed || 0;
        const customersSinceLastMaintenance = currentCustomers - lastCustomers;
        
        if (customersSinceLastMaintenance < requirement) {
            throw new Error(`Insufficient customer service. Need ${requirement} customers served since last maintenance (current: ${customersSinceLastMaintenance}).`);
        }
        
        await this.updateStoredStat(item, 'lastCustomersServed', currentCustomers);
        
        return {
            success: true,
            message: `Customer service requirement met (${customersSinceLastMaintenance}/${requirement} customers since last maintenance)`
        };
    }

    /**
     * Market activity maintenance handler
     */
    async handleMarketActivityMaintenance(userId, userTag, item, requirement, guildId) {
        const currentRevenue = await this.getCurrentStatValue(userId, guildId, 'market.totalRevenue');
        const lastRevenue = item.maintenanceStats?.lastMarketRevenue || 0;
        const revenueSinceLastMaintenance = currentRevenue - lastRevenue;
        
        if (revenueSinceLastMaintenance < requirement) {
            throw new Error(`Insufficient market activity. Need ${requirement} coins revenue since last maintenance (current: ${revenueSinceLastMaintenance}).`);
        }
        
        await this.updateStoredStat(item, 'lastMarketRevenue', currentRevenue);
        
        return {
            success: true,
            message: `Market activity requirement met (${revenueSinceLastMaintenance}/${requirement} coins revenue since last maintenance)`
        };
    }

    /**
     * Power level maintenance handler
     */
    async handlePowerLevelMaintenance(userId, userTag, item, requirement, guildId) {
        const currentPowerLevel = await this.getCurrentStatValue(userId, guildId, 'mining.highestPowerLevelReached');
        
        if (currentPowerLevel < requirement) {
            throw new Error(`Insufficient power level. Need to reach power level ${requirement} (current highest: ${currentPowerLevel}).`);
        }
        
        await this.updateStoredStat(item, 'lastPowerLevel', currentPowerLevel);
        
        return {
            success: true,
            message: `Power level requirement met (reached level ${currentPowerLevel})`
        };
    }

    /**
     * Break participation maintenance handler
     */
    async handleBreakParticipationMaintenance(userId, userTag, item, requirement, guildId) {
        const currentShortBreaks = await this.getCurrentStatValue(userId, guildId, 'mining.shortBreaksReached');
        const currentLongBreaks = await this.getCurrentStatValue(userId, guildId, 'mining.longBreaksReached');
        const totalBreaks = currentShortBreaks + currentLongBreaks;
        
        const lastBreaks = item.maintenanceStats?.lastBreaksReached || 0;
        const breaksSinceLastMaintenance = totalBreaks - lastBreaks;
        
        if (breaksSinceLastMaintenance < requirement) {
            throw new Error(`Insufficient break participation. Need ${requirement} breaks participated since last maintenance (current: ${breaksSinceLastMaintenance}).`);
        }
        
        await this.updateStoredStat(item, 'lastBreaksReached', totalBreaks);
        
        return {
            success: true,
            message: `Break participation requirement met (${breaksSinceLastMaintenance}/${requirement} breaks since last maintenance)`
        };
    }

    /**
     * Update stored stat for comparison in next maintenance cycle
     */
    async updateStoredStat(item, statKey, newValue) {
        if (!item.maintenanceStats) {
            item.maintenanceStats = {};
        }
        
        item.maintenanceStats[statKey] = newValue;
        item.maintenanceStats.lastUpdated = new Date();
        
        // Perform the actual maintenance (restore to full)
        await item.performMaintenance(item.ownerId, 0);
        
        await item.save();
    }

    /**
     * Update stored ore stat for ore-specific maintenance
     */
    async updateStoredOreStat(item, oreId, newQuantity) {
        if (!item.maintenanceStats) {
            item.maintenanceStats = {};
        }
        if (!item.maintenanceStats.lastOreQuantities) {
            item.maintenanceStats.lastOreQuantities = {};
        }
        
        item.maintenanceStats.lastOreQuantities[oreId] = newQuantity;
        item.maintenanceStats.lastUpdated = new Date();
        
        // Perform the actual maintenance (restore to full)
        await item.performMaintenance(item.ownerId, 0);
        
        await item.save();
    }

    /**
     * Apply Midas' Burden wealth effect (unchanged from original)
     */
    async applyMidasWealthEffect(userId, userTag) {
        try {
            const playerMoney = await Money.findOne({ userId });
            
            if (!playerMoney || playerMoney.money <= 0) {
                return {
                    message: `Your wealth maintains your hold on Midas' Burden (no coins to affect)`,
                    change: 0
                };
            }
            
            const currentWealth = playerMoney.money;
            const roll = Math.random();
            
            if (roll < 0.3) {
                // 30% chance: Increase wealth by 20%
                const bonus = Math.floor(currentWealth * 0.2);
                playerMoney.money = Math.floor(playerMoney.money + bonus);
                await playerMoney.save();
                
                return {
                    message: `The golden charm pulses with benevolent energy!`,
                    change: bonus,
                    isBlessing: true,
                    beforeAmount: currentWealth,
                    afterAmount: playerMoney.money,
                    percentage: 20
                };
            } else {
                // 70% chance: Take 5-60% of wealth
                const lossPercentage = 0.05 + (Math.random() * 0.55);
                const loss = Math.floor(currentWealth * lossPercentage);
                playerMoney.money = Math.floor(Math.max(0, playerMoney.money - loss));
                await playerMoney.save();
                
                return {
                    message: `The curse of King Midas weighs heavily upon your fortune!`,
                    change: -loss,
                    isBlessing: false,
                    beforeAmount: currentWealth,
                    afterAmount: playerMoney.money,
                    percentage: Math.round(lossPercentage * 100)
                };
            }
        } catch (error) {
            console.error(`Error applying Midas wealth effect:`, error);
            return {
                message: `Your wealth maintains your hold on Midas' Burden (error occurred)`,
                change: 0
            };
        }
    }

    /**
     * Get ore name by ID
     */
    getOreNameById(oreId) {
        const itemSheet = require('../data/itemSheet.json');
        const oreItem = itemSheet.find(item => String(item.id) === String(oreId));
        return oreItem ? oreItem.name : `Ore #${oreId}`;
    }

    /**
     * Main maintenance function
     */
    async performMaintenance(userId, userTag, itemId, guildId) {
        try {
            const item = await UniqueItem.findOne({ itemId });
            
            if (!item) {
                throw new Error('Unique item not found');
            }
            
            if (item.ownerId !== userId) {
                throw new Error('You do not own this item');
            }
            
            const itemData = getUniqueItemById(itemId);
            if (!itemData) {
                throw new Error('Item data not found');
            }
            
            if (!itemData.requiresMaintenance) {
                return {
                    success: true,
                    message: 'This item does not require maintenance'
                };
            }
            
            if (item.maintenanceLevel >= 10) {
                return {
                    success: true,
                    message: 'Item is already at maximum maintenance level'
                };
            }
            
            // Get the handler for this maintenance type
            const handler = this.maintenanceHandlers[itemData.maintenanceType];
            if (!handler) {
                throw new Error(`Unknown maintenance type: ${itemData.maintenanceType}`);
            }
            
            // Perform the maintenance with guild context
            const result = await handler(userId, userTag, item, itemData.maintenanceCost, guildId);
            
            return result;
            
        } catch (error) {
            console.error('[UNIQUE ITEMS V2] Maintenance error:', error);
            throw error;
        }
    }

    /**
     * Check maintenance status using comprehensive stats
     */
    async checkMaintenanceStatus(userId, guildId) {
        try {
            const items = await UniqueItem.findPlayerUniqueItems(userId);
            const statuses = [];
            
            for (const item of items) {
                const itemData = getUniqueItemById(item.itemId);
                if (!itemData) continue;
                
                // Get current progress for this maintenance type
                let currentProgress = 0;
                let lastProgress = 0;
                let progressSinceLastMaintenance = 0;
                
                if (itemData.requiresMaintenance) {
                    switch (itemData.maintenanceType) {
                        case 'mining_activity':
                            currentProgress = await this.getCurrentStatValue(userId, guildId, 'mining.wallsBroken');
                            lastProgress = item.maintenanceStats?.lastMiningBlocks || 0;
                            break;
                        case 'voice_activity':
                            currentProgress = await this.getCurrentStatValue(userId, guildId, 'discord.totalVoiceTime');
                            lastProgress = item.maintenanceStats?.lastVoiceTime || 0;
                            progressSinceLastMaintenance = Math.floor((currentProgress - lastProgress) / (1000 * 60)); // Convert to minutes
                            break;
                        case 'movement_activity':
                            currentProgress = await this.getCurrentStatValue(userId, guildId, 'mining.tilesTravelled');
                            lastProgress = item.maintenanceStats?.lastTilesMoved || 0;
                            break;
                        case 'ore_mining':
                            if (itemData.maintenanceOreType) {
                                currentProgress = await this.getCurrentOreQuantity(userId, guildId, itemData.maintenanceOreType);
                                lastProgress = item.maintenanceStats?.lastOreQuantities?.[itemData.maintenanceOreType] || 0;
                            }
                            break;
                    }
                    
                    if (itemData.maintenanceType !== 'voice_activity') {
                        progressSinceLastMaintenance = currentProgress - lastProgress;
                    }
                }
                
                statuses.push({
                    itemId: item.itemId,
                    name: itemData.name,
                    maintenanceLevel: item.maintenanceLevel,
                    maxLevel: 10,
                    requiresMaintenance: itemData.requiresMaintenance,
                    maintenanceType: itemData.maintenanceType,
                    maintenanceCost: itemData.maintenanceCost,
                    maintenanceOreType: itemData.maintenanceOreType,
                    lastMaintenance: item.lastMaintenanceDate,
                    nextCheck: item.nextMaintenanceCheck,
                    description: itemData.maintenanceDescription,
                    currentProgress,
                    lastProgress,
                    progressSinceLastMaintenance,
                    requirement: itemData.maintenanceCost
                });
            }
            
            return statuses;
        } catch (error) {
            console.error('[UNIQUE ITEMS V2] Error checking maintenance status:', error);
            return [];
        }
    }

    /**
     * Manual maintenance cycle for testing/admin purposes
     */
    async runMaintenanceCycle() {
        console.log('[UNIQUE ITEMS V2] Running manual maintenance cycle');
        
        try {
            const items = await UniqueItem.findItemsNeedingMaintenance();
            
            for (const item of items) {
                const itemData = getUniqueItemById(item.itemId);
                if (!itemData || !itemData.requiresMaintenance) continue;
                
                // Reduce maintenance by decay rate
                const decayRate = itemData.maintenanceDecayRate || 1;
                const oldLevel = item.maintenanceLevel;
                await item.reduceMaintenance(decayRate);
                
                // Update next check time
                item.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
                await item.save();
                
                console.log(`[UNIQUE ITEMS V2] ${itemData.name}: Maintenance ${oldLevel} -> ${item.maintenanceLevel} (Owner: ${item.ownerTag || 'None'})`);
                
                if (item.maintenanceLevel <= 0 && !item.ownerId) {
                    console.log(`[UNIQUE ITEMS V2] ${itemData.name} was lost due to maintenance failure!`);
                }
            }
            
            return items.length;
        } catch (error) {
            console.error('[UNIQUE ITEMS V2] Error in maintenance cycle:', error);
            return 0;
        }
    }
}

// Export singleton instance
const uniqueMaintenanceV2 = new UniqueMaintenanceV2();

module.exports = {
    performMaintenance: (userId, userTag, itemId, guildId) => uniqueMaintenanceV2.performMaintenance(userId, userTag, itemId, guildId),
    checkMaintenanceStatus: (userId, guildId) => uniqueMaintenanceV2.checkMaintenanceStatus(userId, guildId),
    runMaintenanceCycle: () => uniqueMaintenanceV2.runMaintenanceCycle(),
    
    // Keep backward compatibility with old system
    updateActivityTracking: async (userId, activityType, amount = 1, oreId = null) => {
        console.log(`[UNIQUE ITEMS V2] Legacy updateActivityTracking called - this is now handled by comprehensive stat tracking`);
        // This is now a no-op since comprehensive system handles all tracking
    }
};

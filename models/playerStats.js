// Enhanced Player Statistics Schema - Dynamic Expandable Structure
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Main Player Statistics Schema - Dynamic Structure
const playerStatsSchema = new mongoose.Schema({
    playerId: {
        type: String,
        required: true,
        index: true
    },
    playerName: {
        type: String,
        required: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    guildName: {
        type: String,
        required: true
    },

    // === DYNAMIC EXPANDABLE GAME DATA ===
    gameData: { 
        type: Schema.Types.Mixed, 
        required: false,
        default: () => ({
            // Initialize with basic structure but allow dynamic expansion
            mining: {
                // Basic counters
                tilesTravelled: 0,
                wallsBroken: 0,
                reinforcedWallsBroken: 0,
                tilesFailedToBreak: 0,
                oresFound: 0,
                rareOresFound: 0,
                uniqueItemsFound: 0,
                treasuresFound: 0,
                minesDiscovered: 0,
                mapsExpanded: 0,
                pickaxesBroken: 0,
                familiarsSummoned: 0,
                gulletItemsConsumed: 0,
                
                // Progression tracking
                highestPowerLevelReached: 1,
                highestMapWidth: 0,
                highestMapHeight: 0,
                largestMapSize: 0,
                
                // Value tracking
                totalMiningValue: 0,
                familiarTotalValue: 0,
                oresMinedByFamiliar: 0,
                
                // Time tracking
                totalTimeInMines: 0,
                longestMiningSession: 0,
                totalFamiliarMiningTime: 0,
                gulletConsumptionTime: 0,
                
                // Break tracking
                shortBreaksReached: 0,
                longBreaksReached: 0,
                
                // Detailed tracking arrays (will be populated dynamically)
                oresByType: [],
                mineDiscoveries: [],
                gachaVCTypesReached: [],
                powerLevelProgression: [],
                familiarsByType: [],
                itemUsageTime: [],
                gulletItemsByType: [],
                pickaxeBreaksByType: []
            },
            
            innkeeping: {
                // Basic counters
                totalEarned: 0,
                totalProfit: 0,
                customersServed: 0,
                customersHappy: 0,
                customersSad: 0,
                customersOvernight: 0,
                timesExpandedInn: 0,
                employeesHired: 0,
                currentEmployees: 0,
                workShiftsCompleted: 0,
                breaksCompleted: 0,
                
                // Time tracking
                totalTimeInInn: 0,
                averageEarningsPerShift: 0,
                
                // Break tracking
                shortBreaksReached: 0,
                longBreaksReached: 0,
                
                // Detailed tracking
                customerInteractions: []
            },
            
            market: {
                // Basic counters
                itemsSold: 0,
                oresSold: 0,
                pickaxesSold: 0,
                totalRevenue: 0,
                shopVisits: 0,
                npcShopSpending: 0,
                playerMarketTransactions: 0,
                uniqueCustomers: 0,
                repeatCustomers: 0,
                
                // Detailed tracking
                itemSales: []
            },
            
            discord: {
                // Basic counters
                messagesSent: 0,
                totalCharactersSent: 0,
                totalVoiceTime: 0,
                voiceSessionsJoined: 0,
                longestVoiceSession: 0,
                uniqueChannelsUsed: 0,
                commandsUsed: 0,
                
                // Calculated fields
                averageMessageLength: 0
            },
            
            general: {
                // Economic
                totalCoinsEarned: 0,
                totalCoinsSpent: 0,
                netWorth: 0,
                
                // Activity
                totalGameTime: 0,
                sessionsPlayed: 0,
                longestSession: 0,
                playersInteractedWith: 0,
                helpfulActions: 0
            },
            
            // Custom expandable sections
            custom: {}
        })
    },

    // === METADATA ===
    firstActivity: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    lastStatUpdate: {
        type: Date,
        default: Date.now
    },
    statsVersion: {
        type: String,
        default: '2.0.0' // Updated version for dynamic structure
    }
}, {
    timestamps: true,
    minimize: false // Important: prevents empty objects from being removed
});

// Compound indexes for efficient queries
playerStatsSchema.index({ playerId: 1, guildId: 1 }, { unique: true });
playerStatsSchema.index({ 'gameData.mining.totalMiningValue': -1 });
playerStatsSchema.index({ 'gameData.innkeeping.totalEarned': -1 });
playerStatsSchema.index({ 'gameData.market.totalRevenue': -1 });
playerStatsSchema.index({ 'gameData.discord.totalVoiceTime': -1 });
playerStatsSchema.index({ lastActivity: -1 });

// Static methods for leaderboards and analytics
playerStatsSchema.statics.getTopMiners = function(guildId = null, limit = 10) {
    const query = guildId ? { guildId } : {};
    return this.find(query)
        .sort({ 'gameData.mining.totalMiningValue': -1 })
        .limit(limit)
        .select('playerId playerName gameData.mining.totalMiningValue gameData.mining.oresFound gameData.mining.totalTimeInMines');
};

playerStatsSchema.statics.getTopInnkeepers = function(guildId = null, limit = 10) {
    const query = guildId ? { guildId } : {};
    return this.find(query)
        .sort({ 'gameData.innkeeping.totalEarned': -1 })
        .limit(limit)
        .select('playerId playerName gameData.innkeeping.totalEarned gameData.innkeeping.customersServed gameData.innkeeping.totalTimeInInn');
};

playerStatsSchema.statics.getTopTraders = function(guildId = null, limit = 10) {
    const query = guildId ? { guildId } : {};
    return this.find(query)
        .sort({ 'gameData.market.totalRevenue': -1 })
        .limit(limit)
        .select('playerId playerName gameData.market.totalRevenue gameData.market.itemsSold gameData.market.uniqueCustomers');
};

playerStatsSchema.statics.getMostActive = function(guildId = null, limit = 10) {
    const query = guildId ? { guildId } : {};
    return this.find(query)
        .sort({ 'gameData.general.totalGameTime': -1 })
        .limit(limit)
        .select('playerId playerName gameData.general.totalGameTime gameData.general.sessionsPlayed gameData.discord.messagesSent');
};

// Helper method to ensure gameData structure exists
playerStatsSchema.methods.ensureGameDataStructure = function() {
    if (!this.gameData) {
        this.gameData = {};
    }
    
    // Ensure all main sections exist
    const sections = ['mining', 'innkeeping', 'market', 'discord', 'general', 'custom'];
    sections.forEach(section => {
        if (!this.gameData[section]) {
            this.gameData[section] = {};
        }
    });
    
    // Mark as modified so Mongoose saves the changes
    this.markModified('gameData');
};

// Generic method to update any stat path
playerStatsSchema.methods.updateStat = function(path, value, operation = 'add') {
    this.ensureGameDataStructure();
    
    const pathParts = path.split('.');
    let current = this.gameData;
    
    // Navigate to the parent object
    for (let i = 0; i < pathParts.length - 1; i++) {
        if (!current[pathParts[i]]) {
            current[pathParts[i]] = {};
        }
        current = current[pathParts[i]];
    }
    
    const finalKey = pathParts[pathParts.length - 1];
    
    switch (operation) {
        case 'add':
            current[finalKey] = (current[finalKey] || 0) + value;
            break;
        case 'set':
            current[finalKey] = value;
            break;
        case 'max':
            current[finalKey] = Math.max(current[finalKey] || 0, value);
            break;
    }
    
    this.lastActivity = new Date();
    this.lastStatUpdate = new Date();
    this.markModified('gameData');
};

// Array helper method for detailed tracking
playerStatsSchema.methods.addToArray = function(arrayPath, item, uniqueKey = null) {
    this.ensureGameDataStructure();
    
    const pathParts = arrayPath.split('.');
    let current = this.gameData;
    
    // Navigate to the array location
    for (let i = 0; i < pathParts.length - 1; i++) {
        if (!current[pathParts[i]]) {
            current[pathParts[i]] = {};
        }
        current = current[pathParts[i]];
    }
    
    const arrayKey = pathParts[pathParts.length - 1];
    if (!current[arrayKey]) {
        current[arrayKey] = [];
    }
    
    // If uniqueKey is specified, check for existing entry
    if (uniqueKey && item[uniqueKey]) {
        const existingIndex = current[arrayKey].findIndex(existing => existing[uniqueKey] === item[uniqueKey]);
        if (existingIndex !== -1) {
            // Update existing entry
            current[arrayKey][existingIndex] = { ...current[arrayKey][existingIndex], ...item };
            this.markModified('gameData');
            return false; // Not a new entry
        }
    }
    
    // Add new entry
    current[arrayKey].push(item);
    this.markModified('gameData');
    return true; // New entry added
};

// Mining-specific methods using the new dynamic structure
playerStatsSchema.methods.addOreFound = function(oreId, oreName, quantity = 1, value = 0) {
    // Update basic counters
    this.updateStat('mining.oresFound', quantity);
    this.updateStat('mining.totalMiningValue', value);
    
    // Update detailed ore tracking
    const oreData = {
        oreId,
        oreName,
        quantity: quantity,
        totalValue: value,
        firstFound: new Date(),
        lastFound: new Date()
    };
    
    // Check if ore already exists
    this.ensureGameDataStructure();
    if (!this.gameData.mining.oresByType) {
        this.gameData.mining.oresByType = [];
    }
    
    const existingOre = this.gameData.mining.oresByType.find(ore => ore.oreId === oreId);
    if (existingOre) {
        existingOre.quantity += quantity;
        existingOre.totalValue += value;
        existingOre.lastFound = new Date();
    } else {
        this.gameData.mining.oresByType.push(oreData);
    }
    
    this.markModified('gameData');
};

playerStatsSchema.methods.addMineDiscovered = function(mineId, mineName) {
    this.ensureGameDataStructure();
    if (!this.gameData.mining.mineDiscoveries) {
        this.gameData.mining.mineDiscoveries = [];
    }
    
    const existingMine = this.gameData.mining.mineDiscoveries.find(mine => mine.mineId === mineId);
    if (existingMine) {
        existingMine.timesVisited += 1;
        existingMine.lastVisit = new Date();
        this.markModified('gameData');
        return false; // Already discovered
    } else {
        this.gameData.mining.mineDiscoveries.push({
            mineId,
            mineName,
            firstDiscovered: new Date(),
            timesVisited: 1,
            totalTimeSpent: 0,
            lastVisit: new Date()
        });
        this.updateStat('mining.minesDiscovered', 1);
        return true; // New discovery
    }
};

playerStatsSchema.methods.addGachaVCTypeReached = function(typeId, typeName) {
    this.ensureGameDataStructure();
    if (!this.gameData.mining.gachaVCTypesReached) {
        this.gameData.mining.gachaVCTypesReached = [];
    }
    
    const existingVC = this.gameData.mining.gachaVCTypesReached.find(vc => vc.typeId === typeId);
    if (existingVC) {
        existingVC.timesReached += 1;
        existingVC.lastReached = new Date();
        this.markModified('gameData');
        return false; // Already reached
    } else {
        this.gameData.mining.gachaVCTypesReached.push({
            typeId,
            typeName,
            timesReached: 1,
            firstReached: new Date(),
            lastReached: new Date(),
            totalTimeSpent: 0
        });
        this.markModified('gameData');
        return true; // New type reached
    }
};

playerStatsSchema.methods.updatePowerLevelReached = function(powerLevel) {
    this.updateStat('mining.highestPowerLevelReached', powerLevel, 'max');
    
    this.ensureGameDataStructure();
    if (!this.gameData.mining.powerLevelProgression) {
        this.gameData.mining.powerLevelProgression = [];
    }
    
    const existingLevel = this.gameData.mining.powerLevelProgression.find(p => p.powerLevel === powerLevel);
    if (existingLevel) {
        existingLevel.timesPlayed += 1;
    } else {
        this.gameData.mining.powerLevelProgression.push({
            powerLevel,
            firstReached: new Date(),
            timesPlayed: 1,
            totalTimeAtLevel: 0
        });
    }
    this.markModified('gameData');
};

playerStatsSchema.methods.updateMapSize = function(width, height) {
    const mapSize = width * height;
    
    this.updateStat('mining.highestMapWidth', width, 'max');
    this.updateStat('mining.highestMapHeight', height, 'max');
    this.updateStat('mining.largestMapSize', mapSize, 'max');
};

playerStatsSchema.methods.addFamiliarSummoned = function(familiarType) {
    this.updateStat('mining.familiarsSummoned', 1);
    
    this.ensureGameDataStructure();
    if (!this.gameData.mining.familiarsByType) {
        this.gameData.mining.familiarsByType = [];
    }
    
    const existingFamiliar = this.gameData.mining.familiarsByType.find(f => f.familiarType === familiarType);
    if (existingFamiliar) {
        existingFamiliar.timesSummoned += 1;
    } else {
        this.gameData.mining.familiarsByType.push({
            familiarType,
            timesSummoned: 1,
            totalActiveTime: 0,
            oresMined: 0,
            valueGenerated: 0
        });
    }
    this.markModified('gameData');
};

playerStatsSchema.methods.addFamiliarActivity = function(familiarType, oresMined = 0, valueGenerated = 0, activeTime = 0) {
    this.ensureGameDataStructure();
    if (!this.gameData.mining.familiarsByType) {
        this.gameData.mining.familiarsByType = [];
    }
    
    const familiarEntry = this.gameData.mining.familiarsByType.find(f => f.familiarType === familiarType);
    if (familiarEntry) {
        familiarEntry.oresMined += oresMined;
        familiarEntry.valueGenerated += valueGenerated;
        familiarEntry.totalActiveTime += activeTime;
        
        this.updateStat('mining.oresMinedByFamiliar', oresMined);
        this.updateStat('mining.familiarTotalValue', valueGenerated);
        this.updateStat('mining.totalFamiliarMiningTime', activeTime);
    }
};

playerStatsSchema.methods.trackItemUsage = function(itemId, itemName, usageTime = 0, equipped = false) {
    this.ensureGameDataStructure();
    if (!this.gameData.mining.itemUsageTime) {
        this.gameData.mining.itemUsageTime = [];
    }
    
    const itemEntry = this.gameData.mining.itemUsageTime.find(i => i.itemId === itemId);
    if (itemEntry) {
        itemEntry.totalTimeUsed += usageTime;
        itemEntry.lastUsed = new Date();
        if (equipped) {
            itemEntry.timesEquipped += 1;
        }
    } else {
        this.gameData.mining.itemUsageTime.push({
            itemId,
            itemName,
            totalTimeUsed: usageTime,
            timesEquipped: equipped ? 1 : 0,
            firstUsed: new Date(),
            lastUsed: new Date()
        });
    }
    this.markModified('gameData');
};

playerStatsSchema.methods.addGulletConsumption = function(itemId, itemName, consumptionTime = 0) {
    this.updateStat('mining.gulletItemsConsumed', 1);
    this.updateStat('mining.gulletConsumptionTime', consumptionTime);
    
    this.ensureGameDataStructure();
    if (!this.gameData.mining.gulletItemsByType) {
        this.gameData.mining.gulletItemsByType = [];
    }
    
    const gulletEntry = this.gameData.mining.gulletItemsByType.find(g => g.itemId === itemId);
    if (gulletEntry) {
        gulletEntry.timesConsumed += 1;
        gulletEntry.totalConsumptionTime += consumptionTime;
        gulletEntry.lastConsumed = new Date();
    } else {
        this.gameData.mining.gulletItemsByType.push({
            itemId,
            itemName,
            timesConsumed: 1,
            totalConsumptionTime: consumptionTime,
            firstConsumed: new Date(),
            lastConsumed: new Date()
        });
    }
    this.markModified('gameData');
};

playerStatsSchema.methods.addPickaxeBroken = function(pickaxeId, pickaxeName, isUnique = false, usageTime = 0) {
    this.updateStat('mining.pickaxesBroken', 1);
    
    if (isUnique) {
        this.updateStat('mining.uniquePickaxesUsed', 1);
    }
    
    this.ensureGameDataStructure();
    if (!this.gameData.mining.pickaxeBreaksByType) {
        this.gameData.mining.pickaxeBreaksByType = [];
    }
    
    const pickaxeEntry = this.gameData.mining.pickaxeBreaksByType.find(p => p.pickaxeId === pickaxeId);
    if (pickaxeEntry) {
        pickaxeEntry.timesBroken += 1;
        pickaxeEntry.totalUsageTime += usageTime;
    } else {
        this.gameData.mining.pickaxeBreaksByType.push({
            pickaxeId,
            pickaxeName,
            timesBroken: 1,
            totalUsageTime: usageTime,
            isUnique
        });
    }
    this.markModified('gameData');
};

playerStatsSchema.methods.addItemSold = function(itemId, itemName, quantity, revenue) {
    this.updateStat('market.itemsSold', quantity);
    this.updateStat('market.totalRevenue', revenue);
    
    this.ensureGameDataStructure();
    if (!this.gameData.market.itemSales) {
        this.gameData.market.itemSales = [];
    }
    
    const itemEntry = this.gameData.market.itemSales.find(item => item.itemId === itemId);
    if (itemEntry) {
        itemEntry.quantitySold += quantity;
        itemEntry.totalRevenue += revenue;
        itemEntry.averagePrice = itemEntry.totalRevenue / itemEntry.quantitySold;
        itemEntry.lastSold = new Date();
    } else {
        this.gameData.market.itemSales.push({
            itemId,
            itemName,
            quantitySold: quantity,
            totalRevenue: revenue,
            averagePrice: revenue / quantity,
            firstSold: new Date(),
            lastSold: new Date()
        });
    }
    this.markModified('gameData');
};

// Pre-save middleware to update calculated fields
playerStatsSchema.pre('save', function(next) {
    if (this.gameData) {
        // Update mining averages
        if (this.gameData.mining) {
            const mining = this.gameData.mining;
            const general = this.gameData.general || {};
            
            if (mining.oresFound > 0 && general.sessionsPlayed > 0) {
                mining.averageValuePerSession = mining.totalMiningValue / general.sessionsPlayed;
            }
        }
        
        // Update innkeeping averages
        if (this.gameData.innkeeping) {
            const innkeeping = this.gameData.innkeeping;
            if (innkeeping.workShiftsCompleted > 0) {
                innkeeping.averageEarningsPerShift = innkeeping.totalEarned / innkeeping.workShiftsCompleted;
            }
        }
        
        // Update Discord averages
        if (this.gameData.discord) {
            const discord = this.gameData.discord;
            if (discord.messagesSent > 0) {
                discord.averageMessageLength = discord.totalCharactersSent / discord.messagesSent;
            }
        }
        
        // Update general net worth
        if (this.gameData.general) {
            const general = this.gameData.general;
            general.netWorth = (general.totalCoinsEarned || 0) - (general.totalCoinsSpent || 0);
        }
        
        this.markModified('gameData');
    }
    
    this.lastStatUpdate = new Date();
    next();
});

module.exports = mongoose.model('PlayerStats', playerStatsSchema);

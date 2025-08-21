// patterns/uniqueItemMaintenance.js
// Handles all maintenance operations for unique items

const UniqueItem = require('../models/uniqueItems');
const Money = require('../models/currency');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');

// Global maintenance clock - runs once every 24 hours
class MaintenanceClock {
    constructor() {
        this.isRunning = false;
        this.interval = null;
        this.lastRun = null;
    }
    
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('[UNIQUE ITEMS] Starting global maintenance clock');
        
        // Run immediately on start
        this.runMaintenanceCycle();
        
        // Then run every 24 hours
        this.interval = setInterval(() => {
            this.runMaintenanceCycle();
        }, 24 * 60 * 60 * 1000); // 24 hours
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        console.log('[UNIQUE ITEMS] Stopped global maintenance clock');
    }
    
    async runMaintenanceCycle() {
        console.log('[UNIQUE ITEMS] Running global maintenance cycle');
        this.lastRun = new Date();
        
        try {
            // Find all items that require maintenance
            const items = await UniqueItem.findItemsNeedingMaintenance();
            
            for (const item of items) {
                if (!item.requiresMaintenance) continue;
                
                // Get item data from sheet
                const itemData = getUniqueItemById(item.itemId);
                if (!itemData) continue;
                
                // Reduce maintenance by decay rate
                const decayRate = itemData.maintenanceDecayRate || 1;
                await item.reduceMaintenance(decayRate);
                
                console.log(`[UNIQUE ITEMS] Reduced maintenance for ${itemData.name} (Owner: ${item.ownerTag || 'None'}). Level: ${item.maintenanceLevel}`);
                
                // If item was lost due to maintenance failure, log it
                if (item.maintenanceLevel <= 0 && !item.ownerId) {
                    console.log(`[UNIQUE ITEMS] ${itemData.name} was lost due to maintenance failure!`);
                }
            }
        } catch (error) {
            console.error('[UNIQUE ITEMS] Error in maintenance cycle:', error);
        }
    }
}

// Singleton instance
const maintenanceClock = new MaintenanceClock();

// Maintenance type handlers
const maintenanceHandlers = {
    // Coins maintenance - deduct money from player
    async coins(userId, userTag, item, cost) {
        const moneyDoc = await Money.findOne({ userId });
        
        if (!moneyDoc || moneyDoc.money < cost) {
            throw new Error(`Insufficient funds. Need ${cost} coins for maintenance.`);
        }
        
        // Deduct money
        moneyDoc.money -= cost;
        await moneyDoc.save();
        
        // Perform maintenance
        await item.performMaintenance(userId, cost);
        
        return {
            success: true,
            message: `Spent ${cost} coins on maintenance`,
            newMaintenanceLevel: item.maintenanceLevel
        };
    },
    
    // Mining activity maintenance - check if player has mined enough
    async mining_activity(userId, userTag, item, requirement) {
        const blocksMined = item.activityTracking.miningBlocksThisCycle || 0;
        
        if (blocksMined < requirement) {
            throw new Error(`Insufficient mining activity. Need ${requirement} blocks mined (current: ${blocksMined}).`);
        }
        
        // Perform maintenance
        await item.performMaintenance(userId, 0);
        
        return {
            success: true,
            message: `Mining activity requirement met (${blocksMined}/${requirement} blocks)`,
            newMaintenanceLevel: item.maintenanceLevel
        };
    },
    
    // Voice activity maintenance - check voice minutes
    async voice_activity(userId, userTag, item, requirement) {
        const voiceMinutes = item.activityTracking.voiceMinutesThisCycle || 0;
        
        if (voiceMinutes < requirement) {
            throw new Error(`Insufficient voice activity. Need ${requirement} minutes in voice (current: ${voiceMinutes}).`);
        }
        
        // Perform maintenance
        await item.performMaintenance(userId, 0);
        
        return {
            success: true,
            message: `Voice activity requirement met (${voiceMinutes}/${requirement} minutes)`,
            newMaintenanceLevel: item.maintenanceLevel
        };
    },
    
    // Combat activity maintenance - check combat wins
    async combat_activity(userId, userTag, item, requirement) {
        const combatWins = item.activityTracking.combatWinsThisCycle || 0;
        
        if (combatWins < requirement) {
            throw new Error(`Insufficient combat activity. Need ${requirement} victories (current: ${combatWins}).`);
        }
        
        // Perform maintenance
        await item.performMaintenance(userId, 0);
        
        return {
            success: true,
            message: `Combat requirement met (${combatWins}/${requirement} victories)`,
            newMaintenanceLevel: item.maintenanceLevel
        };
    },
    
    // Social activity maintenance - check interactions
    async social_activity(userId, userTag, item, requirement) {
        const interactions = item.activityTracking.socialInteractionsThisCycle || 0;
        
        if (interactions < requirement) {
            throw new Error(`Insufficient social activity. Need ${requirement} interactions (current: ${interactions}).`);
        }
        
        // Perform maintenance
        await item.performMaintenance(userId, 0);
        
        return {
            success: true,
            message: `Social requirement met (${interactions}/${requirement} interactions)`,
            newMaintenanceLevel: item.maintenanceLevel
        };
    }
};

// Main function to perform maintenance on an item
async function performMaintenance(userId, userTag, itemId) {
    try {
        // Find the unique item
        const item = await UniqueItem.findOne({ itemId });
        
        if (!item) {
            throw new Error('Unique item not found');
        }
        
        if (item.ownerId !== userId) {
            throw new Error('You do not own this item');
        }
        
        if (!item.requiresMaintenance) {
            return {
                success: true,
                message: 'This item does not require maintenance',
                newMaintenanceLevel: item.maintenanceLevel
            };
        }
        
        // Get item data from sheet
        const itemData = getUniqueItemById(itemId);
        if (!itemData) {
            throw new Error('Item data not found');
        }
        
        // Check if maintenance is needed
        if (item.maintenanceLevel >= 10) {
            return {
                success: true,
                message: 'Item is already at maximum maintenance level',
                newMaintenanceLevel: item.maintenanceLevel
            };
        }
        
        // Get the handler for this maintenance type
        const handler = maintenanceHandlers[item.maintenanceType];
        if (!handler) {
            throw new Error(`Unknown maintenance type: ${item.maintenanceType}`);
        }
        
        // Perform the maintenance
        const result = await handler(userId, userTag, item, item.maintenanceCost);
        
        return result;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Maintenance error:', error);
        throw error;
    }
}

// Update activity tracking for various activities
async function updateActivityTracking(userId, activityType, amount = 1) {
    try {
        const items = await UniqueItem.findPlayerUniqueItems(userId);
        
        for (const item of items) {
            if (!item.requiresMaintenance) continue;
            
            switch (activityType) {
                case 'mining':
                    item.activityTracking.miningBlocksThisCycle += amount;
                    item.activityTracking.lastMiningTime = new Date();
                    break;
                case 'voice':
                    item.activityTracking.voiceMinutesThisCycle += amount;
                    item.activityTracking.lastVoiceJoin = new Date();
                    break;
                case 'combat':
                    item.activityTracking.combatWinsThisCycle += amount;
                    item.activityTracking.lastCombatTime = new Date();
                    break;
                case 'social':
                    item.activityTracking.socialInteractionsThisCycle += amount;
                    item.activityTracking.lastSocialInteraction = new Date();
                    break;
            }
            
            await item.save();
        }
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error updating activity tracking:', error);
    }
}

// Check maintenance status for a player's items
async function checkMaintenanceStatus(userId) {
    try {
        const items = await UniqueItem.findPlayerUniqueItems(userId);
        const statuses = [];
        
        for (const item of items) {
            const itemData = getUniqueItemById(item.itemId);
            if (!itemData) continue;
            
            statuses.push({
                itemId: item.itemId,
                name: itemData.name,
                maintenanceLevel: item.maintenanceLevel,
                maxLevel: 10,
                requiresMaintenance: item.requiresMaintenance,
                maintenanceType: item.maintenanceType,
                maintenanceCost: item.maintenanceCost,
                lastMaintenance: item.lastMaintenanceDate,
                nextCheck: item.nextMaintenanceCheck,
                description: itemData.maintenanceDescription,
                activityProgress: {
                    mining: item.activityTracking.miningBlocksThisCycle,
                    voice: item.activityTracking.voiceMinutesThisCycle,
                    combat: item.activityTracking.combatWinsThisCycle,
                    social: item.activityTracking.socialInteractionsThisCycle
                }
            });
        }
        
        return statuses;
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error checking maintenance status:', error);
        return [];
    }
}

module.exports = {
    maintenanceClock,
    performMaintenance,
    updateActivityTracking,
    checkMaintenanceStatus
};

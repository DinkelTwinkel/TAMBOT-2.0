// patterns/uniqueItemMaintenance.js
// Handles all maintenance operations for unique items

const UniqueItem = require('../models/uniqueItems');
const Money = require('../models/currency');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');

// Maintenance utilities for unique items
// The actual maintenance clock is now handled in gachaGameMaster.js using database timestamps
// This ensures it's crash-proof and doesn't rely on in-memory state

// Manual maintenance cycle for testing/admin purposes
async function runMaintenanceCycle() {
    console.log('[UNIQUE ITEMS] Running manual maintenance cycle');
    
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
            const oldLevel = item.maintenanceLevel;
            await item.reduceMaintenance(decayRate);
            
            // Update next check time
            item.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await item.save();
            
            console.log(`[UNIQUE ITEMS] ${itemData.name}: Maintenance ${oldLevel} -> ${item.maintenanceLevel} (Owner: ${item.ownerTag || 'None'})`);
            
            // If item was lost due to maintenance failure, log it
            if (item.maintenanceLevel <= 0 && !item.ownerId) {
                console.log(`[UNIQUE ITEMS] ${itemData.name} was lost due to maintenance failure!`);
            }
        }
        
        return items.length;
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error in maintenance cycle:', error);
        return 0;
    }
}

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
    runMaintenanceCycle, // For manual/testing purposes
    performMaintenance,
    updateActivityTracking,
    checkMaintenanceStatus
};

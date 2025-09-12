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
            // Get item data from sheet
            const itemData = getUniqueItemById(item.itemId);
            if (!itemData) continue;
            
            if (!itemData.requiresMaintenance) continue;
            
            // Reduce maintenance by decay rate
            const decayRate = itemData.maintenanceDecayRate || 1;
            const oldLevel = item.maintenanceLevel;
            await item.reduceMaintenance(decayRate); // isRichest defaults to false
            
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
// Helper function to get ore name by ID
function getOreNameById(oreId) {
    const itemSheet = require('../data/itemSheet.json');
    const oreItem = itemSheet.find(item => String(item.id) === String(oreId));
    return oreItem ? oreItem.name : `Ore #${oreId}`;
}

const maintenanceHandlers = {
    // Wealthiest maintenance - check if player is still the richest (globally)
    async wealthiest(userId, userTag, item, requirement) {
        try {
            // Check if player is still the richest globally
            // Find the richest player across all users
            const richestPlayer = await Money.findOne().sort({ money: -1 }).limit(1);
            
            if (!richestPlayer || richestPlayer.userId !== userId) {
                throw new Error(`You are no longer the wealthiest player. Midas' Burden only serves the richest.`);
            }
            
            // Apply Midas' Burden wealth effect (random cost/gain)
            const wealthEffect = await maintenanceHandlers.applyMidasWealthEffect(userId, userTag);
            
            // If still richest, restore maintenance to full
            await item.performMaintenance(userId, 0);
            
            return {
                success: true,
                message: wealthEffect.message || `Your wealth maintains your hold on Midas' Burden`,
                newMaintenanceLevel: item.maintenanceLevel,
                wealthChange: wealthEffect // Return the full wealthEffect object
            };
            
        } catch (error) {
            console.error('[UNIQUE ITEMS] Error in wealthiest maintenance:', error);
            throw error;
        }
    },
    
    // Apply Midas Burden wealth effect during maintenance
    async applyMidasWealthEffect(userId, userTag) {
        try {
            const playerMoney = await Money.findOne({ userId });
            
            if (!playerMoney || playerMoney.money <= 0) {
                console.log(`[MIDAS WEALTH] Player ${userTag} has no wealth to affect`);
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
                playerMoney.money = Math.floor(playerMoney.money + bonus); // Ensure integer result
                await playerMoney.save();
                
                console.log(`[MIDAS WEALTH] 🌟 ${userTag} blessed by Midas! +${bonus} coins (${currentWealth} -> ${playerMoney.money})`);
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
                const lossPercentage = 0.05 + (Math.random() * 0.55); // Random between 5% and 60%
                const loss = Math.floor(currentWealth * lossPercentage);
                playerMoney.money = Math.floor(Math.max(0, playerMoney.money - loss)); // Ensure integer result
                await playerMoney.save();
                
                console.log(`[MIDAS WEALTH] 💸 ${userTag} cursed by Midas! -${loss} coins (${Math.round(lossPercentage * 100)}% loss: ${currentWealth} -> ${playerMoney.money})`);
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
            console.error(`[MIDAS WEALTH] Error applying wealth effect for ${userTag}:`, error);
            return {
                message: `Your wealth maintains your hold on Midas' Burden (error occurred)`,
                change: 0
            };
        }
    },
    
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
        // Get unique item data to check for specific ore requirements
        const { getUniqueItemById } = require('../data/uniqueItemsSheet');
        const itemData = getUniqueItemById(item.itemId);
        
        // Check if this item requires specific ore types (like Shadow Legion Amulet)
        if (itemData && itemData.maintenanceOreType) {
            const oreId = itemData.maintenanceOreType;
            const oresMined = item.activityTracking.oresMinedThisCycle?.get(oreId) || 0;
            
            if (oresMined < requirement) {
                const oreName = getOreNameById(oreId);
                throw new Error(`Insufficient ${oreName} mined. Need ${requirement} ${oreName} (current: ${oresMined}).`);
            }
            
            // Perform maintenance
            await item.performMaintenance(userId, 0);
            
            const oreName = getOreNameById(oreId);
            return {
                success: true,
                message: `${oreName} mining requirement met (${oresMined}/${requirement} ${oreName})`,
                newMaintenanceLevel: item.maintenanceLevel
            };
        } else {
            // Default behavior - check general mining blocks
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
        }
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
    },
    
    // Movement activity maintenance - check tiles moved in mining
    async movement_activity(userId, userTag, item, requirement) {
        const tilesMoved = item.activityTracking.tilesMovedThisCycle || 0;
        
        if (tilesMoved < requirement) {
            throw new Error(`Insufficient movement. Need to move ${requirement} tiles in mining (current: ${tilesMoved}).`);
        }
        
        // Perform maintenance
        await item.performMaintenance(userId, 0);
        
        return {
            success: true,
            message: `Movement requirement met (${tilesMoved}/${requirement} tiles)`,
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
        
        // Get item data from sheet
        const itemData = getUniqueItemById(itemId);
        if (!itemData) {
            throw new Error('Item data not found');
        }
        
        if (!itemData.requiresMaintenance) {
            return {
                success: true,
                message: 'This item does not require maintenance',
                newMaintenanceLevel: item.maintenanceLevel
            };
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
        const handler = maintenanceHandlers[itemData.maintenanceType];
        if (!handler) {
            throw new Error(`Unknown maintenance type: ${itemData.maintenanceType}`);
        }
        
        // Perform the maintenance
        const result = await handler(userId, userTag, item, itemData.maintenanceCost);
        
        return result;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Maintenance error:', error);
        throw error;
    }
}

// Update activity tracking for various activities
async function updateActivityTracking(userId, activityType, amount = 1, oreId = null) {
    try {
        const items = await UniqueItem.findPlayerUniqueItems(userId);
        
        for (const item of items) {
            // Get item data from sheet to check if maintenance is required
            const itemData = getUniqueItemById(item.itemId);
            if (!itemData || !itemData.requiresMaintenance) continue;
            
            switch (activityType) {
                case 'mining':
                    item.activityTracking.miningBlocksThisCycle += amount;
                    item.activityTracking.lastMiningTime = new Date();
                    
                    // Track specific ore types if provided
                    if (oreId) {
                        if (!item.activityTracking.oresMinedThisCycle) {
                            item.activityTracking.oresMinedThisCycle = new Map();
                        }
                        const currentAmount = item.activityTracking.oresMinedThisCycle.get(oreId) || 0;
                        item.activityTracking.oresMinedThisCycle.set(oreId, currentAmount + amount);
                    }
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
                case 'movement':
                    item.activityTracking.tilesMovedThisCycle += amount;
                    item.activityTracking.lastMovementTime = new Date();
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
                requiresMaintenance: itemData.requiresMaintenance,
                maintenanceType: itemData.maintenanceType,
                maintenanceCost: itemData.maintenanceCost,
                lastMaintenance: item.lastMaintenanceDate,
                nextCheck: item.nextMaintenanceCheck,
                description: itemData.maintenanceDescription,
                activityProgress: {
                    mining: item.activityTracking.miningBlocksThisCycle,
                    voice: item.activityTracking.voiceMinutesThisCycle,
                    combat: item.activityTracking.combatWinsThisCycle,
                    social: item.activityTracking.socialInteractionsThisCycle,
                    movement: item.activityTracking.tilesMovedThisCycle
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

// patterns/uniqueItemMaintenance.js
// Handles all maintenance operations for unique items
// Now uses GameStatTracker as the source of truth for stats

const UniqueItem = require('../models/uniqueItems');
const Money = require('../models/currency');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');
const GameStatTracker = require('./gameStatTracker');

// Maintenance utilities for unique items
// The actual maintenance clock is now handled in gachaGameMaster.js using database timestamps
// This ensures it's crash-proof and doesn't rely on in-memory state

// Initialize game stat tracker
const gameStatTracker = new GameStatTracker();

// Helper function to get current stats from GameStatTracker
async function getCurrentStats(userId, guildId) {
    try {
        const stats = await gameStatTracker.getUserGameStats(userId, guildId, 'mining');
        return {
            tilesMoved: stats.tilesMoved || 0,
            itemsFound: stats.itemsFound || {},
            itemsFoundBySource: stats.itemsFoundBySource || { mining: {}, treasure: {} },
            timeInMiningChannel: stats.timeInMiningChannel || 0,
            hazardsEvaded: stats.hazardsEvaded || 0,
            hazardsTriggered: stats.hazardsTriggered || 0,
            highestPowerLevel: stats.highestPowerLevel || 0
        };
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error getting current stats:', error);
        return {
            tilesMoved: 0,
            itemsFound: {},
            itemsFoundBySource: { mining: {}, treasure: {} },
            timeInMiningChannel: 0,
            hazardsEvaded: 0,
            hazardsTriggered: 0,
            highestPowerLevel: 0
        };
    }
}

// Helper function to calculate stat differences since last maintenance
function calculateStatDifferences(currentStats, previousStats) {
    const differences = {
        tilesMoved: currentStats.tilesMoved - (previousStats.tilesMoved || 0),
        timeInMiningChannel: currentStats.timeInMiningChannel - (previousStats.timeInMiningChannel || 0),
        hazardsEvaded: currentStats.hazardsEvaded - (previousStats.hazardsEvaded || 0),
        hazardsTriggered: currentStats.hazardsTriggered - (previousStats.hazardsTriggered || 0),
        highestPowerLevel: Math.max(0, currentStats.highestPowerLevel - (previousStats.highestPowerLevel || 0)),
        itemsFound: {},
        itemsFoundBySource: { mining: {}, treasure: {} }
    };

    // Calculate item differences
    const allItemIds = new Set([
        ...Object.keys(currentStats.itemsFound || {}),
        ...Object.keys(previousStats.itemsFound || {})
    ]);

    for (const itemId of allItemIds) {
        const current = currentStats.itemsFound?.[itemId] || 0;
        const previous = previousStats.itemsFound?.[itemId] || 0;
        const diff = current - previous;
        if (diff > 0) {
            differences.itemsFound[itemId] = diff;
        }
    }

    // Calculate mining source item differences - handle both Map and Object formats
    const currentMiningItems = currentStats.itemsFoundBySource?.mining || {};
    const previousMiningItems = previousStats.itemsFoundBySource?.mining || {};
    
    // Convert Maps to objects if needed
    const currentMiningObj = currentMiningItems instanceof Map ? Object.fromEntries(currentMiningItems) : currentMiningItems;
    const previousMiningObj = previousMiningItems instanceof Map ? Object.fromEntries(previousMiningItems) : previousMiningItems;
    
    const allMiningItemIds = new Set([
        ...Object.keys(currentMiningObj),
        ...Object.keys(previousMiningObj)
    ]);

    for (const itemId of allMiningItemIds) {
        const current = currentMiningObj[itemId] || 0;
        const previous = previousMiningObj[itemId] || 0;
        const diff = current - previous;
        if (diff > 0) {
            differences.itemsFoundBySource.mining[itemId] = diff;
        }
    }

    return differences;
}

// Helper function to initialize maintenance state for a single item
async function initializeMaintenanceStateForItem(item, userId, guildId = 'default') {
    try {
        // Get current stats to set as baseline
        const currentStats = await getCurrentStats(userId, guildId);
        
        // Initialize maintenance state
        item.maintenanceState = {
            previousStats: {
                tilesMoved: currentStats.tilesMoved || 0,
                itemsFound: currentStats.itemsFound || {},
                itemsFoundBySource: {
                    mining: currentStats.itemsFoundBySource?.mining || {},
                    treasure: currentStats.itemsFoundBySource?.treasure || {}
                },
                timeInMiningChannel: currentStats.timeInMiningChannel || 0,
                hazardsEvaded: currentStats.hazardsEvaded || 0,
                hazardsTriggered: currentStats.hazardsTriggered || 0,
                highestPowerLevel: currentStats.highestPowerLevel || 0
            },
            guildId: guildId
        };
        
        await item.save();
        console.log(`[UNIQUE ITEMS] Initialized maintenance state for item ${item.itemId} with guildId ${guildId}`);
    } catch (error) {
        console.error(`[UNIQUE ITEMS] Error initializing maintenance state for item ${item.itemId}:`, error);
    }
}

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
    async mining_activity(userId, userTag, item, requirement, guildId = 'default') {
        // Get unique item data to check for specific ore requirements
        const { getUniqueItemById } = require('../data/uniqueItemsSheet');
        const itemData = getUniqueItemById(item.itemId);
        
        // Check if item has new maintenance state, if not, initialize it
        if (!item.maintenanceState) {
            console.log(`[UNIQUE ITEMS] Initializing maintenance state for item ${item.itemId} (${itemData?.name})`);
            await initializeMaintenanceStateForItem(item, userId, guildId);
        }
        
        // Get current stats from GameStatTracker
        const effectiveGuildId = item.maintenanceState?.guildId || guildId;
        const currentStats = await getCurrentStats(userId, effectiveGuildId);
        const previousStats = item.maintenanceState?.previousStats || {};
        const statDifferences = calculateStatDifferences(currentStats, previousStats);
        
        // Check if this item requires specific ore types (like Shadow Legion Amulet)
        if (itemData && itemData.maintenanceOreType) {
            const oreId = itemData.maintenanceOreType;
            const oresMined = statDifferences.itemsFoundBySource.mining[oreId] || 0;
            
            if (oresMined < requirement) {
                const oreName = getOreNameById(oreId);
                throw new Error(`Insufficient ${oreName} mined. Need ${requirement} ${oreName} (mined since last maintenance: ${oresMined}).`);
            }
            
            // Perform maintenance and save current stats as new baseline
            await item.performMaintenance(userId, 0);
            await item.saveMaintenanceState(currentStats);
            
            const oreName = getOreNameById(oreId);
            return {
                success: true,
                message: `${oreName} mining requirement met (${oresMined}/${requirement} ${oreName} mined since last maintenance)`,
                newMaintenanceLevel: item.maintenanceLevel
            };
        } else {
            // Default behavior - check general mining activity (tiles moved)
            const tilesMoved = statDifferences.tilesMoved;
            
            if (tilesMoved < requirement) {
                throw new Error(`Insufficient mining activity. Need to move ${requirement} tiles (moved since last maintenance: ${tilesMoved}).`);
            }
            
            // Perform maintenance and save current stats as new baseline
            await item.performMaintenance(userId, 0);
            await item.saveMaintenanceState(currentStats);
            
            return {
                success: true,
                message: `Mining activity requirement met (${tilesMoved}/${requirement} tiles moved since last maintenance)`,
                newMaintenanceLevel: item.maintenanceLevel
            };
        }
    },
    
    // Voice activity maintenance - check voice minutes
    async voice_activity(userId, userTag, item, requirement, guildId = 'default') {
        // Get current stats from GameStatTracker
        const effectiveGuildId = item.maintenanceState?.guildId || guildId;
        const currentStats = await getCurrentStats(userId, effectiveGuildId);
        const previousStats = item.maintenanceState?.previousStats || {};
        const statDifferences = calculateStatDifferences(currentStats, previousStats);
        
        // Convert timeInMiningChannel from seconds to minutes
        const voiceMinutes = Math.floor(statDifferences.timeInMiningChannel / 60);
        
        if (voiceMinutes < requirement) {
            throw new Error(`Insufficient voice activity. Need ${requirement} minutes in voice (time since last maintenance: ${voiceMinutes} minutes).`);
        }
        
        // Perform maintenance and save current stats as new baseline
        await item.performMaintenance(userId, 0);
        await item.saveMaintenanceState(currentStats);
        
        return {
            success: true,
            message: `Voice activity requirement met (${voiceMinutes}/${requirement} minutes since last maintenance)`,
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
    async movement_activity(userId, userTag, item, requirement, guildId = 'default') {
        // Get current stats from GameStatTracker
        const effectiveGuildId = item.maintenanceState?.guildId || guildId;
        const currentStats = await getCurrentStats(userId, effectiveGuildId);
        const previousStats = item.maintenanceState?.previousStats || {};
        const statDifferences = calculateStatDifferences(currentStats, previousStats);
        
        const tilesMoved = statDifferences.tilesMoved;
        
        if (tilesMoved < requirement) {
            throw new Error(`Insufficient movement. Need to move ${requirement} tiles in mining (moved since last maintenance: ${tilesMoved}).`);
        }
        
        // Perform maintenance and save current stats as new baseline
        await item.performMaintenance(userId, 0);
        await item.saveMaintenanceState(currentStats);
        
        return {
            success: true,
            message: `Movement requirement met (${tilesMoved}/${requirement} tiles moved since last maintenance)`,
            newMaintenanceLevel: item.maintenanceLevel
        };
    }
};

// Main function to perform maintenance on an item
async function performMaintenance(userId, userTag, itemId, guildId = 'default') {
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
        const result = await handler(userId, userTag, item, itemData.maintenanceCost, guildId);
        
        return result;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Maintenance error:', error);
        throw error;
    }
}

// Legacy function - now deprecated as we use GameStatTracker as source of truth
// This function is kept for backward compatibility but does nothing
async function updateActivityTracking(userId, activityType, amount = 1, oreId = null) {
    console.log(`[UNIQUE ITEMS] updateActivityTracking called but deprecated - stats now tracked via GameStatTracker`);
    // No longer needed - stats are tracked in GameStatTracker
    return;
}

// Check maintenance status for a player's items
async function checkMaintenanceStatus(userId, guildId = 'default') {
    try {
        const items = await UniqueItem.findPlayerUniqueItems(userId);
        const statuses = [];
        
        // Get current stats from GameStatTracker
        const currentStats = await getCurrentStats(userId, guildId);
        
        for (const item of items) {
            const itemData = getUniqueItemById(item.itemId);
            if (!itemData) continue;
            
            // Check if item has new maintenance state, if not, initialize it
            if (!item.maintenanceState) {
                console.log(`[UNIQUE ITEMS] Initializing maintenance state for item ${item.itemId} (${itemData?.name}) in status check`);
                await initializeMaintenanceStateForItem(item, userId, guildId);
            }
            
            // Calculate progress since last maintenance
            const previousStats = item.maintenanceState?.previousStats || {};
            const statDifferences = calculateStatDifferences(currentStats, previousStats);
            
            statuses.push({
                itemId: item.itemId,
                name: itemData.name,
                maintenanceLevel: item.maintenanceLevel,
                maxLevel: 10,
                requiresMaintenance: itemData.requiresMaintenance,
                maintenanceType: itemData.maintenanceType,
                maintenanceCost: itemData.maintenanceCost,
                maintenanceOreType: itemData.maintenanceOreType, // Include ore type if specified
                lastMaintenance: item.lastMaintenanceDate,
                nextCheck: item.nextMaintenanceCheck,
                description: itemData.maintenanceDescription,
                activityProgress: {
                    // Show progress since last maintenance
                    tilesMoved: statDifferences.tilesMoved,
                    voiceMinutes: Math.floor(statDifferences.timeInMiningChannel / 60),
                    itemsFound: statDifferences.itemsFound,
                    itemsFoundBySource: statDifferences.itemsFoundBySource,
                    hazardsEvaded: statDifferences.hazardsEvaded,
                    hazardsTriggered: statDifferences.hazardsTriggered,
                    highestPowerLevel: statDifferences.highestPowerLevel
                }
            });
        }
        
        return statuses;
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error checking maintenance status:', error);
        return [];
    }
}

// Migration function to initialize maintenance state for existing unique items
async function initializeMaintenanceStateForExistingItems() {
    try {
        console.log('[UNIQUE ITEMS] Starting migration to initialize maintenance state for existing items...');
        
        const items = await UniqueItem.find({ 
            ownerId: { $ne: null },
            $or: [
                { 'maintenanceState': { $exists: false } },
                { 'maintenanceState.previousStats': { $exists: false } }
            ]
        });
        
        console.log(`[UNIQUE ITEMS] Found ${items.length} items that need maintenance state initialization`);
        
        for (const item of items) {
            // Initialize maintenance state if it doesn't exist
            if (!item.maintenanceState) {
                item.maintenanceState = {
                    previousStats: {
                        tilesMoved: 0,
                        itemsFound: {},
                        itemsFoundBySource: {
                            mining: {},
                            treasure: {}
                        },
                        timeInMiningChannel: 0,
                        hazardsEvaded: 0,
                        hazardsTriggered: 0,
                        highestPowerLevel: 0
                    },
                    guildId: 'default'
                };
            }
            
            // Get current stats and set them as the baseline
            const currentStats = await getCurrentStats(item.ownerId, item.maintenanceState.guildId);
            await item.saveMaintenanceState(currentStats);
            
            console.log(`[UNIQUE ITEMS] Initialized maintenance state for item ${item.itemId} (owner: ${item.ownerTag})`);
        }
        
        console.log(`[UNIQUE ITEMS] Migration completed. Initialized ${items.length} items.`);
        return items.length;
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error during migration:', error);
        return 0;
    }
}

module.exports = {
    runMaintenanceCycle, // For manual/testing purposes
    performMaintenance,
    updateActivityTracking, // Deprecated but kept for backward compatibility
    checkMaintenanceStatus,
    initializeMaintenanceStateForExistingItems // New migration function
};

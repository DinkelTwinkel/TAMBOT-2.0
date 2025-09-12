// healthSystem.js - Centralized health management for mining system
const { calculatePlayerStat } = require('../../calculatePlayerStat');

/**
 * Update player health
 */
async function updatePlayerHealth(playerId, healthChange, source = 'unknown') {
    try {
        const gachaVC = require('../../../models/activevcs');
        
        // Find the player's active mining channel
        const activeChannel = await gachaVC.findOne({
            'gameData.gamemode': 'mining',
            [`gameData.map.playerPositions.${playerId}`]: { $exists: true }
        });
        
        if (!activeChannel) {
            console.warn(`[HEALTH] No active mining channel found for player ${playerId}`);
            return { success: false, newHealth: 100, maxHealth: 100 };
        }
        
        // Get current health from database
        let currentHealth = 100;
        let maxHealth = 100;
        
        if (activeChannel.gameData.playerHealth && activeChannel.gameData.playerHealth[playerId]) {
            const healthData = activeChannel.gameData.playerHealth[playerId];
            currentHealth = healthData.current || 100;
            maxHealth = healthData.max || 100;
        }
        
        // Calculate new health
        const newHealth = Math.max(0, Math.min(maxHealth, currentHealth + healthChange));
        
        // Save the updated health back to the database
        try {
            const updateResult = await gachaVC.updateOne(
                { _id: activeChannel._id },
                { 
                    $set: { 
                        [`gameData.playerHealth.${playerId}`]: {
                            current: newHealth,
                            max: maxHealth,
                            lastUpdated: Date.now()
                        }
                    } 
                }
            );
            
            if (!updateResult.acknowledged) {
                console.error(`[HEALTH] Failed to save health update for player ${playerId}`);
                return { success: false, newHealth: currentHealth, maxHealth: maxHealth };
            }
        } catch (dbError) {
            console.error('[HEALTH] Error saving health to database:', dbError);
            return { success: false, newHealth: currentHealth, maxHealth: maxHealth };
        }
        
        console.log(`[HEALTH] ${playerId} health: ${currentHealth} -> ${newHealth} (${healthChange >= 0 ? '+' : ''}${healthChange} from ${source}) - DB updated: ${updateResult.acknowledged}`);
        console.log(`[HEALTH] Health data stored in channel ${activeChannel.channelId}`);
        
        return {
            success: true,
            newHealth: newHealth,
            maxHealth: maxHealth,
            previousHealth: currentHealth,
            healthChange: healthChange,
            source: source
        };
        
    } catch (error) {
        console.error(`[HEALTH] Error updating health for ${playerId}:`, error);
        return { success: false, newHealth: 100, maxHealth: 100 };
    }
}

/**
 * Apply healing to a player
 */
async function healPlayer(playerId, healAmount, source = 'unknown') {
    return await updatePlayerHealth(playerId, healAmount, source);
}

/**
 * Apply damage to a player
 */
async function damagePlayer(playerId, damageAmount, source = 'unknown') {
    return await updatePlayerHealth(playerId, -damageAmount, source);
}

/**
 * Initialize player health when they first join mining
 */
async function initializePlayerHealth(playerId, dbEntry) {
    try {
        if (!dbEntry.gameData.playerHealth) {
            dbEntry.gameData.playerHealth = {};
        }
        
        // Only initialize if not already present
        if (!dbEntry.gameData.playerHealth[playerId]) {
            dbEntry.gameData.playerHealth[playerId] = {
                current: 100,
                max: 100,
                lastUpdated: Date.now()
            };
            
            // Force save to database immediately
            const gachaVC = require('../../../models/activevcs');
            await gachaVC.updateOne(
                { channelId: dbEntry.channelId },
                { 
                    $set: { 
                        [`gameData.playerHealth.${playerId}`]: dbEntry.gameData.playerHealth[playerId]
                    } 
                }
            );
            
            console.log(`[HEALTH] Initialized health for player ${playerId} and saved to DB`);
            return true; // Indicates health was initialized
        }
        
        return false; // Health already existed
    } catch (error) {
        console.error(`[HEALTH] Error initializing health for ${playerId}:`, error);
        return false;
    }
}

/**
 * Get player's current health status
 */
async function getPlayerHealth(playerId) {
    try {
        const playerStats = await calculatePlayerStat(playerId);
        
        if (!playerStats || !playerStats.health) {
            return { current: 100, max: 100, percentage: 1.0 };
        }
        
        const current = playerStats.health.current || 100;
        const max = playerStats.health.max || 100;
        
        return {
            current: current,
            max: max,
            percentage: current / max,
            status: getHealthStatus(current / max)
        };
        
    } catch (error) {
        console.error(`[HEALTH] Error getting health for ${playerId}:`, error);
        return { current: 100, max: 100, percentage: 1.0, status: 'healthy' };
    }
}

/**
 * Get health status description
 */
function getHealthStatus(healthPercentage) {
    if (healthPercentage <= 0) return 'unconscious';
    if (healthPercentage < 0.25) return 'critical';
    if (healthPercentage < 0.5) return 'injured';
    if (healthPercentage < 0.75) return 'wounded';
    return 'healthy';
}

/**
 * Check if player needs revival
 */
async function checkAutoRevive(playerId, source = 'unknown') {
    try {
        const playerStats = await calculatePlayerStat(playerId);
        if (!playerStats || !playerStats.equippedItems) return false;
        
        const { parseUniqueItemBonuses } = require('./uniqueItemBonuses');
        const uniqueBonuses = parseUniqueItemBonuses(playerStats.equippedItems);
        
        // Check for Phoenix Feather Charm auto-revive
        if (uniqueBonuses.autoReviveChance > 0 && Math.random() < uniqueBonuses.autoReviveChance) {
            // Revive player to 50% health
            const maxHealth = uniqueBonuses.maxHealth || 100;
            const reviveHealth = Math.floor(maxHealth * 0.5);
            
            const healResult = await updatePlayerHealth(playerId, reviveHealth, 'phoenix_revive');
            
            if (healResult.success) {
                console.log(`[HEALTH] Phoenix Feather auto-revived player ${playerId}`);
                return {
                    revived: true,
                    newHealth: healResult.newHealth,
                    maxHealth: healResult.maxHealth,
                    source: 'Phoenix Feather Charm'
                };
            }
        }
        
        return { revived: false };
        
    } catch (error) {
        console.error(`[HEALTH] Error checking auto-revive for ${playerId}:`, error);
        return { revived: false };
    }
}

/**
 * Apply health regeneration over time
 */
async function processHealthRegeneration(playerId, uniqueBonuses) {
    try {
        if (!uniqueBonuses.healthRegen || uniqueBonuses.healthRegen <= 0) {
            return { regenerated: false };
        }
        
        const playerStats = await calculatePlayerStat(playerId);
        if (!playerStats || !playerStats.health) return { regenerated: false };
        
        const now = Date.now();
        const lastRegen = playerStats.health.lastRegen || now;
        const timeSinceRegen = now - lastRegen;
        
        // Regenerate every minute
        if (timeSinceRegen >= 60000) {
            const maxHealth = uniqueBonuses.maxHealth || 100;
            const regenAmount = Math.floor(uniqueBonuses.healthRegen * maxHealth);
            
            if (regenAmount > 0) {
                const healResult = await updatePlayerHealth(playerId, regenAmount, 'regeneration');
                
                if (healResult.success) {
                    // Update last regen time and save to database
                    playerStats.health.lastRegen = now;
                    
                    // CRITICAL FIX: Save the lastRegen time to database
                    try {
                        const gachaVC = require('../../../models/activevcs');
                        
                        // Find the player's active mining channel
                        const activeChannel = await gachaVC.findOne({
                            'gameData.gamemode': 'mining',
                            [`gameData.map.playerPositions.${playerId}`]: { $exists: true }
                        });
                        
                        if (activeChannel) {
                            await gachaVC.updateOne(
                                { _id: activeChannel._id },
                                { 
                                    $set: { 
                                        [`gameData.playerHealth.${playerId}.lastRegen`]: now,
                                        [`gameData.playerHealth.${playerId}.lastUpdated`]: now
                                    } 
                                }
                            );
                            console.log(`[HEALTH REGEN] Saved lastRegen time for player ${playerId}: ${now}`);
                        }
                    } catch (saveError) {
                        console.error(`[HEALTH REGEN] Error saving lastRegen time for player ${playerId}:`, saveError);
                    }
                    
                    return {
                        regenerated: true,
                        amount: regenAmount,
                        newHealth: healResult.newHealth,
                        maxHealth: healResult.maxHealth
                    };
                }
            }
        }
        
        return { regenerated: false };
        
    } catch (error) {
        console.error(`[HEALTH] Error processing regeneration for ${playerId}:`, error);
        return { regenerated: false };
    }
}

/**
 * Debug function to check player health in database
 */
async function debugPlayerHealth(playerId, channelId) {
    try {
        const gachaVC = require('../../../models/activevcs');
        const dbEntry = await gachaVC.findOne({ channelId: channelId });
        
        console.log(`[HEALTH DEBUG] Player ${playerId} in channel ${channelId}:`);
        console.log(`[HEALTH DEBUG] gameData exists:`, !!dbEntry?.gameData);
        console.log(`[HEALTH DEBUG] playerHealth exists:`, !!dbEntry?.gameData?.playerHealth);
        console.log(`[HEALTH DEBUG] player health data:`, dbEntry?.gameData?.playerHealth?.[playerId]);
        
        return dbEntry?.gameData?.playerHealth?.[playerId] || null;
    } catch (error) {
        console.error(`[HEALTH DEBUG] Error checking health for ${playerId}:`, error);
        return null;
    }
}

module.exports = {
    updatePlayerHealth,
    healPlayer,
    damagePlayer,
    getPlayerHealth,
    getHealthStatus,
    checkAutoRevive,
    processHealthRegeneration,
    initializePlayerHealth,
    debugPlayerHealth
};

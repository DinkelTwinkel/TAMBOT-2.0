// healthSystem.js - Centralized health management for mining system
const { calculatePlayerStat } = require('../../calculatePlayerStat');

/**
 * Update player health
 */
async function updatePlayerHealth(playerId, healthChange, source = 'unknown') {
    try {
        // Get current player stats which include health data
        const playerStats = await calculatePlayerStat(playerId);
        
        if (!playerStats) {
            console.warn(`[HEALTH] No player stats found for ${playerId}`);
            return { success: false, newHealth: 100, maxHealth: 100 };
        }
        
        // Initialize health if not present
        if (!playerStats.health) {
            playerStats.health = {
                current: 100,
                max: 100,
                lastRegen: Date.now()
            };
        }
        
        const currentHealth = playerStats.health.current || 100;
        const maxHealth = playerStats.health.max || 100;
        
        // Calculate new health
        const newHealth = Math.max(0, Math.min(maxHealth, currentHealth + healthChange));
        
        // Update health in player stats
        playerStats.health.current = newHealth;
        
        // Save the updated health back to the database
        // We need to update this through the proper channel since health is stored in gameData
        try {
            const gachaVC = require('../../../models/activevcs');
            
            // Find the player's active mining channel to update their health
            const activeChannels = await gachaVC.find({
                'gameData.gamemode': 'mining',
                [`gameData.map.playerPositions.${playerId}`]: { $exists: true }
            });
            
            // Update health in all active mining channels for this player
            for (const channelEntry of activeChannels) {
                await gachaVC.updateOne(
                    { _id: channelEntry._id },
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
            }
        } catch (dbError) {
            console.error('[HEALTH] Error saving health to database:', dbError);
        }
        
        console.log(`[HEALTH] ${playerId} health: ${currentHealth} -> ${newHealth} (${healthChange >= 0 ? '+' : ''}${healthChange} from ${source})`);
        
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
                    // Update last regen time
                    playerStats.health.lastRegen = now;
                    
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

module.exports = {
    updatePlayerHealth,
    healPlayer,
    damagePlayer,
    getPlayerHealth,
    getHealthStatus,
    checkAutoRevive,
    processHealthRegeneration
};

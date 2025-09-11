// patterns/conditionalUniqueItems.js
// Functions for handling conditional unique items like Midas' Burden

const Money = require('../models/currency');
const UniqueItem = require('../models/uniqueItems');

/**
 * Check if a player is the richest in the guild
 * @param {string} userId - The user ID to check
 * @param {string} guildId - The guild ID
 * @param {Array} memberIds - Array of guild member IDs
 * @returns {boolean} - True if the user is the richest
 */
async function checkRichestPlayer(userId, guildId, memberIds) {
    try {
        // Get all money records for guild members
        const allMoney = await Money.find({ 
            userId: { $in: memberIds } 
        }).sort({ money: -1 });
        
        if (allMoney.length === 0) {
            return false;
        }
        
        // Check if the user is the richest
        const richest = allMoney[0];
        return richest.userId === userId;
        
    } catch (error) {
        console.error('[CONDITIONAL] Error checking richest player:', error);
        return false;
    }
}

/**
 * Get the current luck multiplier for Midas' Burden
 * Randomly returns either 0 or 100 to simulate the curse/blessing
 * @returns {number} - Either 0 or 100
 */
function getMidasLuckMultiplier() {
    // Midas' Burden mechanic: luck is either cursed (0x) or blessed (100x)
    return Math.random() < 0.5 ? 0 : 100;
}

/**
 * Try to assign Midas' Burden to the richest player
 * @param {string} guildId - The guild ID
 * @param {Array} memberIds - Array of guild member IDs
 * @returns {Object|null} - Result of the assignment attempt
 */
async function tryAssignMidasBurden(guildId, memberIds) {
    try {
        // Find Midas' Burden
        const midasBurden = await UniqueItem.findOne({ itemId: 10 });
        
        if (!midasBurden) {
            console.log('[CONDITIONAL] Midas\' Burden not found in database');
            return null;
        }
        
        // Get the richest player
        const allMoney = await Money.find({ 
            userId: { $in: memberIds } 
        }).sort({ money: -1 }).limit(1);
        
        if (allMoney.length === 0) {
            return null;
        }
        
        const richest = allMoney[0];
        
        // Check if already owned by the richest
        if (midasBurden.ownerId === richest.userId) {
            return {
                success: false,
                message: 'Already owned by the richest player'
            };
        }
        
        // Transfer to the richest player
        const previousOwner = midasBurden.ownerId;
        
        if (previousOwner) {
            // Add to history
            midasBurden.previousOwners.push({
                userId: previousOwner,
                userTag: midasBurden.ownerTag,
                acquiredDate: midasBurden.updatedAt,
                lostDate: new Date(),
                lostReason: 'no_longer_richest'
            });
        }
        
        // Assign to new owner
        midasBurden.ownerId = richest.userId;
        midasBurden.ownerTag = richest.userTag || 'Unknown';
        midasBurden.maintenanceLevel = 10; // Reset maintenance
        
        await midasBurden.save();
        
        return {
            success: true,
            previousOwner,
            newOwner: richest.userId,
            wealth: richest.money,
            message: `Midas' Burden has recognized ${richest.userTag} as the wealthiest!`
        };
        
    } catch (error) {
        console.error('[CONDITIONAL] Error assigning Midas\' Burden:', error);
        return null;
    }
}

/**
 * Check and update Midas' Burden ownership if needed
 * Should be called periodically or when wealth changes
 * @param {string} guildId - The guild ID
 * @param {Array} memberIds - Array of guild member IDs
 */
async function updateMidasBurdenOwnership(guildId, memberIds) {
    try {
        const midasBurden = await UniqueItem.findOne({ itemId: 10 });
        
        if (!midasBurden || !midasBurden.ownerId) {
            // Try to assign to richest if unowned
            return await tryAssignMidasBurden(guildId, memberIds);
        }
        
        // Check if current owner is still the richest
        const isStillRichest = await checkRichestPlayer(
            midasBurden.ownerId, 
            guildId, 
            memberIds
        );
        
        if (!isStillRichest) {
            // Transfer to new richest
            return await tryAssignMidasBurden(guildId, memberIds);
        }
        
        return {
            success: false,
            message: 'Current owner is still the richest'
        };
        
    } catch (error) {
        console.error('[CONDITIONAL] Error updating Midas\' Burden ownership:', error);
        return null;
    }
}

/**
 * Handle maintenance decay for Midas' Burden
 * It only decays when the owner is not the richest
 * @param {string} userId - The owner's user ID
 * @param {string} guildId - The guild ID
 * @param {Array} memberIds - Array of guild member IDs
 */
async function handleMidasMaintenanceDecay(userId, guildId, memberIds) {
    try {
        const midasBurden = await UniqueItem.findOne({ 
            itemId: 10, 
            ownerId: userId 
        });
        
        if (!midasBurden) {
            return null;
        }
        
        const isRichest = await checkRichestPlayer(userId, guildId, memberIds);
        
        if (!isRichest) {
            // Decay maintenance - use decay rate from item configuration
            const { getUniqueItemById } = require('../data/uniqueItemsSheet');
            const itemData = getUniqueItemById(10);
            const decayRate = itemData?.maintenanceDecayRate || 10; // Default to 10 (immediate loss)
            
            midasBurden.maintenanceLevel = Math.max(0, midasBurden.maintenanceLevel - decayRate);
            
            if (midasBurden.maintenanceLevel <= 0) {
                // Remove from owner
                midasBurden.previousOwners.push({
                    userId: midasBurden.ownerId,
                    userTag: midasBurden.ownerTag,
                    acquiredDate: midasBurden.updatedAt,
                    lostDate: new Date(),
                    lostReason: 'maintenance_failure'
                });
                
                midasBurden.ownerId = null;
                midasBurden.ownerTag = null;
                midasBurden.maintenanceLevel = 10;
                midasBurden.statistics.timesLostToMaintenance++;
            }
            
            await midasBurden.save();
            
            return {
                decayed: true,
                newLevel: midasBurden.maintenanceLevel,
                lost: midasBurden.maintenanceLevel <= 0
            };
        }
        
        return {
            decayed: false,
            message: 'Owner is still the richest, no decay'
        };
        
    } catch (error) {
        console.error('[CONDITIONAL] Error handling Midas maintenance:', error);
        return null;
    }
}

/**
 * Check if a user meets conditions for a conditional item
 * @param {string} userId - The user ID
 * @param {string} guildId - The guild ID
 * @param {number} itemId - The item ID to check
 */
async function meetsConditionalRequirements(userId, guildId, itemId) {
    try {
        // Currently only Midas' Burden (ID: 10) is conditional
        if (itemId !== 10) {
            return true; // Non-conditional items always meet requirements
        }
        
        // For Midas' Burden, check if user is richest
        const guild = require('discord.js').Client.guilds?.cache?.get(guildId);
        if (!guild) return false;
        
        const members = await guild.members.fetch();
        const memberIds = members.map(m => m.id);
        
        return await checkRichestPlayer(userId, guildId, memberIds);
        
    } catch (error) {
        console.error('[CONDITIONAL] Error checking requirements:', error);
        return false;
    }
}

/**
 * Calculate Midas' Burden drop chance based on player wealth
 * @param {number} playerWealth - The player's current coin amount
 * @returns {number} - Drop chance between 0 and 1
 */
function calculateMidasDropChance(playerWealth) {
    // Base chance starts at 0.1% for poor players
    const BASE_CHANCE = 0.001;
    
    // At 1 million coins, chance is 90%
    const TARGET_WEALTH = 1000000;
    const TARGET_CHANCE = 0.9;
    
    if (playerWealth <= 0) {
        return BASE_CHANCE;
    }
    
    if (playerWealth >= TARGET_WEALTH) {
        // At 1 million coins: 90% chance
        // After 1 million: logarithmically increases towards 99.9%
        const baseChance = TARGET_CHANCE;
        const remainingToMax = 0.999 - baseChance; // Can go up to 99.9%
        
        // Logarithmic scaling for wealth above 1 million
        const wealthAboveTarget = playerWealth - TARGET_WEALTH;
        const scaleFactor = Math.log10(1 + wealthAboveTarget / TARGET_WEALTH);
        const additionalChance = remainingToMax * Math.min(scaleFactor, 1);
        
        return Math.min(0.999, baseChance + additionalChance);
    }
    
    // Linear scaling from BASE_CHANCE to TARGET_CHANCE based on wealth
    const wealthRatio = playerWealth / TARGET_WEALTH;
    const chance = BASE_CHANCE + (TARGET_CHANCE - BASE_CHANCE) * wealthRatio;
    
    return Math.min(Math.max(chance, BASE_CHANCE), TARGET_CHANCE);
}

/**
 * Try to drop a conditional item if conditions are met
 * @param {Object} member - Discord member object
 * @param {string} guildId - Guild ID
 * @param {number} itemId - Item ID to try dropping
 */
async function tryConditionalDrop(member, guildId, itemId) {
    try {
        // Only handle Midas' Burden for now
        if (itemId !== 10) return null;
        
        // Check if item is available (not already owned)
        const item = await UniqueItem.findOne({ itemId: 10 });
        if (!item || item.ownerId) return null;
        
        // Get player's current wealth
        const playerMoney = await Money.findOne({ userId: member.id });
        const playerWealth = playerMoney?.money || 0;
        
        // Calculate drop chance based on wealth
        const dropChance = calculateMidasDropChance(playerWealth);
        
        // Log the drop chance for debugging
        console.log(`[MIDAS] Player ${member.displayName || member.tag} wealth: ${playerWealth} coins, drop chance: ${(dropChance * 100).toFixed(2)}%`);
        
        // Roll for the drop
        const roll = Math.random();
        if (roll > dropChance) {
            // Didn't get the drop
            return null;
        }
        
        // Success! Assign to player
        item.ownerId = member.id;
        item.ownerTag = member.user?.tag || member.tag || 'Unknown';
        item.maintenanceLevel = 10;
        item.statistics.timesFound++;
        
        await item.save();
        
        // Create a special message based on wealth level
        let message;
        if (playerWealth >= 10000000) { // 10 million+
            message = "🌟💰 **MIDAS' BURDEN BOWS TO YOUR IMMENSE FORTUNE!** The golden weight recognizes you as a god of wealth! Your riches have attracted the legendary curse!";
        } else if (playerWealth >= 5000000) { // 5 million+
            message = "👑💰 **MIDAS' BURDEN IS DRAWN TO YOUR VAST WEALTH!** The golden weight has chosen you, recognizing your incredible fortune!";
        } else if (playerWealth >= 1000000) { // 1 million+
            message = "💰 **MIDAS' BURDEN RECOGNIZES YOUR WEALTH!** The golden weight has chosen you as one worthy of its power and curse!";
        } else if (playerWealth >= 500000) { // 500k+
            message = "💎 **MIDAS' BURDEN SENSES YOUR GROWING FORTUNE!** The golden weight deems you wealthy enough to bear its blessing and curse!";
        } else if (playerWealth >= 100000) { // 100k+
            message = "🪙 **MIDAS' BURDEN NOTICES YOUR RICHES!** The golden weight has found you worthy of its ancient power!";
        } else {
            message = "✨ **MIDAS' BURDEN HAS CHOSEN YOU!** Despite humble means, fate has granted you the golden weight's power!";
        }
        
        return {
            success: true,
            item: {
                id: 10,
                name: "Midas' Burden"
            },
            message: message,
            playerWealth: playerWealth,
            dropChance: dropChance
        };
        
    } catch (error) {
        console.error('[CONDITIONAL] Error in conditional drop:', error);
        return null;
    }
}

/**
 * Check if an item is conditional
 * @param {number} itemId - The item ID
 */
function isConditionalItem(itemId) {
    // Currently only Midas' Burden (ID: 10) is conditional
    return itemId === 10;
}

/**
 * Check and update conditional ownership for all guilds
 * This function is called periodically to ensure conditional items
 * are owned by the correct players based on their conditions
 */
async function checkConditionalOwnership() {
    try {
        console.log('[CONDITIONAL] Starting conditional ownership check...');
        
        // Get all conditional unique items
        const conditionalItems = await UniqueItem.find({ 
            itemId: { $in: [10] } // Currently only Midas' Burden
        });
        
        if (conditionalItems.length === 0) {
            console.log('[CONDITIONAL] No conditional items found');
            return;
        }
        
        // Get all unique guild IDs from active voice channels
        const ActiveVCS = require('../models/activevcs');
        const activeChannels = await ActiveVCS.find({}).distinct('guildId');
        
        if (activeChannels.length === 0) {
            console.log('[CONDITIONAL] No active guilds found');
            return;
        }
        
        let totalChecks = 0;
        let totalUpdates = 0;
        
        // Check each guild
        for (const guildId of activeChannels) {
            try {
                // Get guild members
                const guild = require('discord.js').Client.guilds?.cache?.get(guildId);
                if (!guild) continue;
                
                const members = await guild.members.fetch();
                const memberIds = members.map(m => m.id);
                
                if (memberIds.length === 0) continue;
                
                // Check Midas' Burden for this guild
                const midasResult = await updateMidasBurdenOwnership(guildId, memberIds);
                totalChecks++;
                
                if (midasResult && midasResult.success) {
                    totalUpdates++;
                    console.log(`[CONDITIONAL] Midas' Burden updated in guild ${guildId}:`, midasResult.message);
                }
                
            } catch (guildError) {
                console.error(`[CONDITIONAL] Error checking guild ${guildId}:`, guildError);
            }
        }
        
        console.log(`[CONDITIONAL] Ownership check complete: ${totalChecks} guilds checked, ${totalUpdates} updates made`);
        
    } catch (error) {
        console.error('[CONDITIONAL] Error in checkConditionalOwnership:', error);
    }
}

module.exports = {
    checkRichestPlayer,
    getMidasLuckMultiplier,
    tryAssignMidasBurden,
    updateMidasBurdenOwnership,
    handleMidasMaintenanceDecay,
    meetsConditionalRequirements,
    tryConditionalDrop,
    isConditionalItem,
    calculateMidasDropChance,
    checkConditionalOwnership
};

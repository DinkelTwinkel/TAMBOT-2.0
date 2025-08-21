// patterns/midasBurdenManager.js
// Manages the automatic granting and transfer of Midas' Burden

const UniqueItem = require('../models/uniqueItems');
const Money = require('../models/currency');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');
const { checkRichestPlayer } = require('./conditionalUniqueItems');

/**
 * Check and update Midas' Burden ownership after money changes
 * Should be called after any significant money transaction
 * @param {string} playerId - Player whose money changed
 * @param {Object} guild - Discord guild object (optional)
 * @returns {Promise<Object|null>} Transfer result or null
 */
async function checkMidasBurdenOwnership(playerId, guild = null) {
    try {
        const midasBurden = await UniqueItem.findOne({ itemId: 10 });
        if (!midasBurden) {
            console.log('[MIDAS BURDEN] Item not initialized in database');
            return null;
        }

        let guildMemberIds = null;
        if (guild) {
            try {
                const guildMembers = await guild.members.fetch();
                guildMemberIds = guildMembers.map(member => member.id);
            } catch (err) {
                console.log('[MIDAS BURDEN] Could not fetch guild members, checking globally');
            }
        }

        // Check if the player is now the richest
        const isRichest = await checkRichestPlayer(playerId, guild?.id, guildMemberIds);
        
        if (!isRichest) {
            // Player is not the richest, no action needed
            return null;
        }

        // Player is the richest - check current ownership
        if (midasBurden.ownerId === playerId) {
            // Already owns it
            return null;
        }

        // Transfer Midas' Burden to the new richest player
        const playerMoney = await Money.findOne({ userId: playerId });
        if (!playerMoney) return null;

        const previousOwner = midasBurden.ownerTag;
        
        // Add to history if there was a previous owner
        if (midasBurden.ownerId) {
            midasBurden.previousOwners.push({
                userId: midasBurden.ownerId,
                userTag: midasBurden.ownerTag,
                acquiredDate: midasBurden.updatedAt,
                lostDate: new Date(),
                lostReason: 'other' // Lost due to being surpassed in wealth
            });
            
            // Update statistics
            midasBurden.statistics.timesFound++;
        } else {
            // First time being claimed
            midasBurden.statistics.timesFound = 1;
        }

        // Transfer to new owner
        midasBurden.ownerId = playerId;
        midasBurden.ownerTag = playerMoney.usertag || playerId;
        midasBurden.maintenanceLevel = 10; // Reset maintenance
        midasBurden.lastMaintenanceDate = new Date();
        midasBurden.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        // Reset activity tracking
        midasBurden.activityTracking = {
            miningBlocksThisCycle: 0,
            voiceMinutesThisCycle: 0,
            combatWinsThisCycle: 0,
            socialInteractionsThisCycle: 0
        };
        
        await midasBurden.save();

        const itemData = getUniqueItemById(10);
        
        console.log(`[MIDAS BURDEN] Transferred from ${previousOwner || 'Unclaimed'} to ${midasBurden.ownerTag}`);
        
        return {
            type: 'transfer',
            previousOwner: previousOwner,
            newOwner: midasBurden.ownerTag,
            itemName: itemData.name,
            message: previousOwner 
                ? `💰👑 **${midasBurden.ownerTag}** has surpassed all others in wealth and claimed **Midas' Burden** from ${previousOwner}!`
                : `💰👑 **${midasBurden.ownerTag}** has become the wealthiest and claimed the unclaimed **Midas' Burden**!`
        };

    } catch (error) {
        console.error('[MIDAS BURDEN] Error checking ownership:', error);
        return null;
    }
}

/**
 * Trigger a drop chance for Midas' Burden
 * Called when conditions might be right for it to appear
 * @param {string} playerId - Player ID
 * @param {Object} guild - Discord guild object
 * @returns {Promise<Object|null>} Drop result or null
 */
async function tryMidasBurdenDrop(playerId, guild) {
    try {
        // Very rare chance (0.1%)
        if (Math.random() > 0.001) return null;

        const result = await checkMidasBurdenOwnership(playerId, guild);
        if (result && result.type === 'transfer') {
            return {
                ...result,
                dropped: true,
                rarity: 'legendary'
            };
        }
        
        return null;
    } catch (error) {
        console.error('[MIDAS BURDEN] Error in drop attempt:', error);
        return null;
    }
}

/**
 * Force check all guilds for Midas' Burden ownership
 * Used for maintenance and debugging
 */
async function forceCheckAllGuilds(client) {
    try {
        console.log('[MIDAS BURDEN] Starting force check of all guilds');
        
        const midasBurden = await UniqueItem.findOne({ itemId: 10 });
        if (!midasBurden) {
            console.log('[MIDAS BURDEN] Item not found in database');
            return;
        }

        // Get the globally richest player
        const richest = await Money.findOne({}).sort({ money: -1 }).limit(1);
        if (!richest) {
            console.log('[MIDAS BURDEN] No players with money found');
            return;
        }

        // Check if ownership needs to change
        if (midasBurden.ownerId !== richest.userId) {
            console.log(`[MIDAS BURDEN] Ownership should transfer from ${midasBurden.ownerTag || 'Unclaimed'} to ${richest.usertag}`);
            
            // You could trigger the transfer here if needed
            // await checkMidasBurdenOwnership(richest.userId);
        } else {
            console.log(`[MIDAS BURDEN] Current owner ${midasBurden.ownerTag} is still the richest`);
        }
        
    } catch (error) {
        console.error('[MIDAS BURDEN] Error in force check:', error);
    }
}

module.exports = {
    checkMidasBurdenOwnership,
    tryMidasBurdenDrop,
    forceCheckAllGuilds
};

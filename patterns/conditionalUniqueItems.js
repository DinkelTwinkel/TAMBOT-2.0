// patterns/conditionalUniqueItems.js
// System for unique items that require specific conditions to own

const UniqueItem = require('../models/uniqueItems');
const Money = require('../models/currency');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');

// Define conditional items and their requirements
const CONDITIONAL_ITEMS = {
    10: { // Midas' Burden
        condition: 'richest_player',
        checkFunction: async (playerId, guildId, itemId, guildMemberIds) => {
            return await checkRichestPlayer(playerId, guildId, guildMemberIds);
        },
        loseCondition: 'no_longer_richest',
        description: 'Only the wealthiest soul can bear this burden'
    },
    // Future conditional items can be added here:
    // 11: { condition: 'voice_8hours', checkFunction: checkVoiceTime },
    // 12: { condition: 'lost_million_gambling', checkFunction: checkGamblingLosses },
    // 13: { condition: 'specific_mine', checkFunction: checkSpecificMine },
    // 14: { condition: 'most_deaths', checkFunction: checkMostDeaths },
    // 15: { condition: 'longest_playtime', checkFunction: checkLongestPlaytime }
};

/**
 * Check if a player meets the condition for a conditional unique item
 * @param {string} playerId - Player's Discord ID
 * @param {string} guildId - Guild ID
 * @param {number} itemId - Unique item ID
 * @param {Array<string>} guildMemberIds - Array of guild member IDs (optional)
 * @returns {Promise<boolean>} Whether player meets the condition
 */
async function playerMeetsCondition(playerId, guildId, itemId, guildMemberIds = null) {
    const conditionalItem = CONDITIONAL_ITEMS[itemId];
    if (!conditionalItem) return true; // Non-conditional items always meet condition
    
    return await conditionalItem.checkFunction(playerId, guildId, itemId, guildMemberIds);
}

/**
 * Check if player is the richest in their guild
 * @param {string} playerId - Player's Discord ID
 * @param {string} guildId - Guild ID (optional)
 * @param {Array<string>} guildMemberIds - Array of guild member IDs (optional)
 * @returns {Promise<boolean>} Whether player is richest
 */
async function checkRichestPlayer(playerId, guildId, guildMemberIds = null) {
    try {
        let query = {};
        
        // If we have guild member IDs, filter by them
        if (guildMemberIds && Array.isArray(guildMemberIds)) {
            query = { userId: { $in: guildMemberIds } };
        }
        
        // Get the richest player(s) with the filter
        const allMoney = await Money.find(query).sort({ money: -1 }).limit(1);
        
        if (allMoney.length === 0) return false;
        
        // Check if this player is the richest
        const richest = allMoney[0];
        return richest.userId === playerId;
    } catch (error) {
        console.error('[CONDITIONAL UNIQUE] Error checking richest player:', error);
        return false;
    }
}

/**
 * Process conditional unique item drop attempt
 * @param {Object} member - Discord member object or simplified object with id, user.tag, displayName
 * @param {string} guildId - Guild ID
 * @param {number} itemId - Item to try dropping
 * @param {Array<string>} guildMemberIds - Array of guild member IDs (optional)
 * @returns {Promise<Object|null>} Drop result or null
 */
async function tryConditionalDrop(member, guildId, itemId, guildMemberIds = null) {
    const conditionalItem = CONDITIONAL_ITEMS[itemId];
    if (!conditionalItem) return null;
    
    // Check if player meets condition
    const meetsCondition = await conditionalItem.checkFunction(member.id, guildId, itemId, guildMemberIds);
    if (!meetsCondition) return null;
    
    // Check if item exists and is unowned
    const dbItem = await UniqueItem.findOne({ itemId });
    if (!dbItem) {
        // Create the item
        const itemData = getUniqueItemById(itemId);
        if (!itemData) return null;
        
        await UniqueItem.create({
            itemId: itemId,
            ownerId: null,
            maintenanceType: itemData.maintenanceType,
            maintenanceCost: itemData.maintenanceCost,
            requiresMaintenance: itemData.requiresMaintenance,
            maintenanceLevel: 10
        });
    }
    
    // Check if already owned by someone else
    if (dbItem && dbItem.ownerId && dbItem.ownerId !== member.id) {
        // For Midas' Burden, transfer to new richest
        if (conditionalItem.condition === 'richest_player') {
            await transferToNewRichest(member, guildId, itemId);
            return {
                type: 'transfer',
                message: `💰 **${member.displayName}** has become the richest and claimed Midas' Burden from its previous owner!`
            };
        }
        return null;
    }
    
    // Assign to player
    if (!dbItem.ownerId) {
        await dbItem.assignToPlayer(member.id, member.user.tag);
        const itemData = getUniqueItemById(itemId);
        return {
            type: 'new_drop',
            message: `💰🌟 **CONDITIONAL LEGENDARY!** ${member.displayName} has claimed **${itemData.name}**! ${conditionalItem.description}`
        };
    }
    
    return null;
}

/**
 * Transfer Midas' Burden to new richest player
 * @param {Object} newOwner - New owner Discord member
 * @param {string} guildId - Guild ID
 * @param {number} itemId - Item ID
 */
async function transferToNewRichest(newOwner, guildId, itemId) {
    try {
        const dbItem = await UniqueItem.findOne({ itemId });
        if (!dbItem) return;
        
        const previousOwner = dbItem.ownerTag;
        
        // Add to history
        if (dbItem.ownerId) {
            dbItem.previousOwners.push({
                userId: dbItem.ownerId,
                userTag: dbItem.ownerTag,
                acquiredDate: dbItem.updatedAt,
                lostDate: new Date(),
                lostReason: 'other' // Lost due to no longer being richest
            });
        }
        
        // Transfer to new owner
        dbItem.ownerId = newOwner.id;
        dbItem.ownerTag = newOwner.user.tag;
        dbItem.maintenanceLevel = 10; // Reset maintenance
        await dbItem.save();
        
        console.log(`[CONDITIONAL UNIQUE] Midas' Burden transferred from ${previousOwner} to ${newOwner.user.tag}`);
    } catch (error) {
        console.error('[CONDITIONAL UNIQUE] Error transferring item:', error);
    }
}

/**
 * Check all conditional items for ownership changes
 * Called periodically to update ownership based on conditions
 */
async function checkConditionalOwnership() {
    try {
        for (const [itemId, config] of Object.entries(CONDITIONAL_ITEMS)) {
            const dbItem = await UniqueItem.findOne({ itemId: parseInt(itemId) });
            if (!dbItem || !dbItem.ownerId) continue;
            
            // Special handling for richest player
            if (config.condition === 'richest_player') {
                const stillRichest = await checkRichestPlayer(dbItem.ownerId, null);
                
                if (!stillRichest) {
                    // Find the new richest player
                    const allMoney = await Money.find({}).sort({ money: -1 }).limit(1);
                    if (allMoney.length > 0 && allMoney[0].userId !== dbItem.ownerId) {
                        // Transfer to new richest
                        const newRichest = allMoney[0];
                        
                        console.log(`[CONDITIONAL UNIQUE] ${dbItem.ownerTag} is no longer richest, transferring to ${newRichest.usertag}`);
                        
                        // Add to history
                        dbItem.previousOwners.push({
                            userId: dbItem.ownerId,
                            userTag: dbItem.ownerTag,
                            acquiredDate: dbItem.updatedAt,
                            lostDate: new Date(),
                            lostReason: 'other'
                        });
                        
                        // Transfer ownership
                        dbItem.ownerId = newRichest.userId;
                        dbItem.ownerTag = newRichest.usertag;
                        dbItem.maintenanceLevel = 10;
                        await dbItem.save();
                    }
                }
            }
            
            // Add other condition checks here in the future
        }
    } catch (error) {
        console.error('[CONDITIONAL UNIQUE] Error checking ownership:', error);
    }
}

/**
 * Get all conditional unique items
 * @returns {Array} List of conditional item IDs
 */
function getConditionalItemIds() {
    return Object.keys(CONDITIONAL_ITEMS).map(id => parseInt(id));
}

/**
 * Check if an item is conditional
 * @param {number} itemId - Item ID to check
 * @returns {boolean} Whether item is conditional
 */
function isConditionalItem(itemId) {
    return CONDITIONAL_ITEMS.hasOwnProperty(itemId);
}

/**
 * Get random luck multiplier for Midas' Burden
 * @returns {number} Either 0 or 100
 */
function getMidasLuckMultiplier() {
    // 50/50 chance of either 0x or 100x luck
    return Math.random() < 0.5 ? 0 : 100;
}

module.exports = {
    playerMeetsCondition,
    tryConditionalDrop,
    checkConditionalOwnership,
    getConditionalItemIds,
    isConditionalItem,
    getMidasLuckMultiplier,
    CONDITIONAL_ITEMS
};

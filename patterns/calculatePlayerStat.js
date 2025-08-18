const PlayerInventory = require('../models/inventory');
const PlayerBuffs = require('../models/PlayerBuff');
const itemSheet = require('../data/itemSheet.json');

/**
 * Builds a player's stats based on their inventory and all active buffs.
 * Removes expired buffs from the database, ignores them in calculations.
 * Also returns the best non-consumable items for each ability type.
 * 
 * @param {string} playerId - Discord user ID or player identifier
 * @returns {Promise<Object>} - Object with stats and bestItems
 */
async function getPlayerStats(playerId) {
    const now = new Date();

    // Fetch inventory from DB
    const inv = await PlayerInventory.findOne({ playerId }).lean();
    const invItems = Array.isArray(inv?.items) ? inv.items : [];

    // Build base stats from inventory (take highest power per ability)
    const playerStats = {};
    const bestItems = {}; // Track best non-consumable item for each ability
    
    for (const invItem of invItems) {
        const itemData = itemSheet.find(it => String(it.id) === String(invItem.itemId));
        if (!itemData || !Array.isArray(itemData.abilities)) continue;

        // Only track non-consumable items for bestItems
        const isNonConsumable = itemData.type !== 'consumable';

        for (const abilityObj of itemData.abilities) {
            const ability = abilityObj.name;
            const power = Number(abilityObj.powerlevel) || 0;

            // Update stats if this is higher power
            if (!playerStats[ability] || power > playerStats[ability]) {
                playerStats[ability] = power;
                
                // Only update bestItems for non-consumables
                if (isNonConsumable) {
                    bestItems[ability] = {
                        itemId: itemData.id,
                        name: itemData.name,
                        power: power,
                        durability: itemData.durability || 0,
                        inventoryQuantity: invItem.quantity
                    };
                }
            }
        }
    }

    // Fetch buffs document
    const buffDoc = await PlayerBuffs.findOne({ playerId });
    if (buffDoc?.buffs?.length) {
        // Filter out expired buffs
        const activeBuffs = buffDoc.buffs.filter(buff => buff.expiresAt > now);

        // Only update DB if we removed any expired buffs
        if (activeBuffs.length !== buffDoc.buffs.length) {
            buffDoc.buffs = activeBuffs;
            await buffDoc.save();
        }

        // Apply active buffs (these don't affect bestItems, only stats)
        for (const buff of activeBuffs) {
            for (const [ability, power] of buff.effects.entries()) {
                const effectPower = Number(power) || 0;
                playerStats[ability] = (playerStats[ability] || 0) + effectPower;
            }
        }
    }

    return {
        stats: playerStats,
        bestItems: bestItems
    };
}

module.exports = getPlayerStats;
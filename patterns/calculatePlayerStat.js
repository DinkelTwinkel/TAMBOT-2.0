const PlayerInventory = require('../models/inventory');
const PlayerBuffs = require('../models/PlayerBuff');
const itemSheet = require('../data/itemSheet.json');

/**
 * Builds a player's stats based on their inventory and all active buffs.
 * Stacks all equipment stats together (only counts each unique item ID once).
 * Removes expired buffs from the database, ignores them in calculations.
 * 
 * @param {string} playerId - Discord user ID or player identifier
 * @returns {Promise<Object>} - Object with stats and equippedItems
 */
async function getPlayerStats(playerId) {
    const now = new Date();

    // Fetch inventory from DB
    const inv = await PlayerInventory.findOne({ playerId }).lean();
    const invItems = Array.isArray(inv?.items) ? inv.items : [];

    // Build base stats from inventory (stack all unique equipment)
    const playerStats = {};
    const equippedItems = {}; // Track all equipped items by ID
    const processedItemIds = new Set(); // Track which item IDs we've already processed
    
    for (const invItem of invItems) {
        const itemData = itemSheet.find(it => String(it.id) === String(invItem.itemId));
        if (!itemData || !Array.isArray(itemData.abilities)) continue;

        // Skip if we've already processed this item ID (only count each unique item once)
        if (processedItemIds.has(String(itemData.id))) continue;
        processedItemIds.add(String(itemData.id));

        // Only process non-consumable items for equipment stats
        const isNonConsumable = itemData.type !== 'consumable';
        if (!isNonConsumable) continue;

        // Track this item for display
        equippedItems[itemData.id] = {
            itemId: itemData.id,
            name: itemData.name,
            abilities: [],
            durability: itemData.durability || 0,
            inventoryQuantity: invItem.quantity
        };

        // Stack all abilities from this item
        for (const abilityObj of itemData.abilities) {
            const ability = abilityObj.name;
            const power = Number(abilityObj.powerlevel) || 0;

            // Add to total stats (stacking)
            playerStats[ability] = (playerStats[ability] || 0) + power;
            
            // Track abilities for this item
            equippedItems[itemData.id].abilities.push({
                name: ability,
                power: power
            });
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
        equippedItems: equippedItems
    };
}

module.exports = getPlayerStats;
const PlayerInventory = require('../models/inventory');
const itemSheet = require('../data/itemSheet.json');

/**
 * Builds a player's stats based on their inventory.
 * For each ability type, keeps the highest powerlevel found.
 * 
 * @param {string} playerId - Discord user ID or player identifier
 * @returns {Promise<Object>} - Object mapping ability name to highest power level
 */
async function getPlayerStats(playerId) {
    // Fetch inventory from DB
    const inv = await PlayerInventory.findOne({ playerId }).lean();
    if (!inv || !Array.isArray(inv.items)) {
        return {}; // no items means no stats
    }

    const playerStats = {};

    for (const invItem of inv.items) {
        // Find matching item in itemSheet
        const itemData = itemSheet.find(it => String(it.id) === String(invItem.itemId));
        if (!itemData || !itemData.ability || !itemData.powerlevel) {
            continue; // skip items without abilities or powerlevel
        }

        const ability = itemData.ability;
        const power = Number(itemData.powerlevel) || 0;

        // Keep the highest power for each ability
        if (!playerStats[ability] || power > playerStats[ability]) {
            playerStats[ability] = power;
        }
    }

    return playerStats;
}

module.exports = getPlayerStats;
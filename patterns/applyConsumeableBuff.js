// helpers/applyConsumableBuff.js
const PlayerBuffs = require('../models/PlayerBuff');

/**
 * Applies a consumable item's abilities as a timed buff for a player.
 * If the player already has the buff and it's still active, refreshes its expiry without stacking duplicates.
 *
 * @param {string} playerId - Discord user ID
 * @param {Object} item - Item object from itemSheet.json
 * @returns {Promise<{ expiresAt: Date, effects: Map<string, number>, refreshed: boolean }>} - Updated buff data
 */
async function applyConsumableBuff(playerId, item) {
    if (!item?.abilities || !item.duration) {
        throw new Error(`Item ${item?.name} is missing abilities or duration`);
    }

    let buffDoc = await PlayerBuffs.findOne({ playerId });

    const now = new Date();
    const durationMs = item.duration * 60 * 1000;
    const newExpiresAt = new Date(Date.now() + durationMs);

    if (!buffDoc) {
        buffDoc = new PlayerBuffs({
            playerId,
            buffs: []
        });
    }

    // Remove expired buffs
    buffDoc.buffs = buffDoc.buffs.filter(b => b.expiresAt > now);

    // Look for an existing buff with the same name
    const existingBuff = buffDoc.buffs.find(b => b.name === item.name);

    if (existingBuff) {
        // Refresh expiry time and update effects (no stacking)
        existingBuff.expiresAt = newExpiresAt;
        existingBuff.effects = new Map(item.abilities.map(a => [a.name, a.powerlevel]));
        await buffDoc.save();

        return {
            expiresAt: newExpiresAt,
            effects: existingBuff.effects,
            refreshed: true
        };
    }

    // Add as new buff
    const newBuff = {
        name: item.name,
        effects: new Map(item.abilities.map(a => [a.name, a.powerlevel])),
        expiresAt: newExpiresAt
    };

    buffDoc.buffs.push(newBuff);
    await buffDoc.save();

    return {
        expiresAt: newExpiresAt,
        effects: newBuff.effects,
        refreshed: false
    };
}

module.exports = applyConsumableBuff;

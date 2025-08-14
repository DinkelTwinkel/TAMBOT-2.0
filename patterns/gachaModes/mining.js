const PlayerInventory = require('../../models/inventory'); // uses items: [{ itemId, quantity }]

module.exports = async (channel, dbEntry, json) => {
    const now = Date.now();

    // schedule next trigger
    dbEntry.nextTrigger = new Date(now + 60 * 1000);
    await dbEntry.save();

    // must be a voice channel to read members
    if (!channel || !channel.isVoiceBased()) {
        console.warn('Mining event triggered outside a voice channel.');
        return;
    }

    // pick a random human in VC
    const humans = channel.members.filter(m => !m.user.bot);
    if (humans.size === 0) {
        console.log('No eligible members in VC.');
        return;
    }
    const winner = humans.random();

    // announce (if server has a system channel)
    const announce = channel;
    if (announce) {
        await announce.send(`⛏️ MINING EVENT! ${winner} found **Coal Ore**!`);
    }

    // give 1 Coal (itemId "1")
    const playerId = winner.id;
    const playerTag = winner.user.tag;
    const itemId = "1";

    try {
        // load or create inventory
        let inv = await PlayerInventory.findOne({ playerId, playerTag });

        if (!inv) {
            inv = new PlayerInventory({
                playerId,
                playerTag,
                items: [{ itemId, quantity: 1 }]
            });
        } else {
            const existing = inv.items.find(it => it.itemId === itemId);
            if (existing) existing.quantity += 1;
            else inv.items.push({ itemId, quantity: 1 });
        }

        await inv.save();
        console.log(`Gave 1 Coal to ${winner.user.tag}`);
    } catch (err) {
        console.error('Error adding coal to inventory:', err);
    }
};

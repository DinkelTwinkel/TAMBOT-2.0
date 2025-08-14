const PlayerInventory = require('../../models/inventory'); // your inventory schema

module.exports = async (channel, dbEntry, json) => {
    const now = Date.now(); // current timestamp in milliseconds

    // Set nextTrigger to 60 seconds from now
    dbEntry.nextTrigger = new Date(now + 60 * 1000);
    await dbEntry.save();

    // Send the event message
    if (channel && channel.isTextBased()) {
        channel.send('⛏️ MINING EVENT! You found **Coal Ore**!');
    }

    // --- Add 1 Coal Ore (id "1") to the player's inventory ---
   
};

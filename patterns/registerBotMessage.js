const messageDeletus = require('../models/tidyMessages');

module.exports = async (guildId, channelId, msgId, expireMinutes = 5) => {
    // Default to 5 minutes if expireMinutes is not provided
    console.log(`Registering bot message with ${expireMinutes} minute expiry`);

    const newStoreMsg = new messageDeletus({ 
        guildId: guildId,
        channelId: channelId,
        messageId: msgId,
        expireTime: new Date(Date.now() + 60 * 1000 * expireMinutes),
    });

    await newStoreMsg.save();

};

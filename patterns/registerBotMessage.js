const messageDeletus = require('../models/tidyMessages');

module.exports = async (guildId, channelId, msgId, expireMinutes) => {

    console.log (expireMinutes);

    const newStoreMsg = new messageDeletus({ 
        guildId: guildId,
        channelId: channelId,
        messageId: msgId,
        expireTime: Date.now() + 60 * 1000 * expireMinutes,
    });

    await newStoreMsg.save();

};

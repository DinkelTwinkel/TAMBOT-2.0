const messageDeletus = require('../models/tidyMessages');

module.exports = async (guildId, channelId, msgId) => {

    const newStoreMsg = new messageDeletus({ 
        guildId: guildId,
        channelId: channelId,
        messageId: msgId,
    });

    await newStoreMsg.save();

};

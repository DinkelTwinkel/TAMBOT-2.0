const messageDeletus = require('../models/tidyMessages');

module.exports = async (sentMessage) => {

    const newStoreMsg = new messageDeletus({ 
        guildId: sentMessage.guild.id,
        channelId: sentMessage.channel.id,
        messageId: sentMessage.id,
    });

    await newStoreMsg.save();

};

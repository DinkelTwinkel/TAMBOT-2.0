
const messageDeletus =  require ('../models/tidyMessages');

module.exports = async (sentMessage) => {

    const newStoreMsg = new messageDeletus({ 
        guildid: sentMessage.guild.id,
        channelid: sentMessage.channel.id,
        messageid: sentMessage.id,
    })
    newStoreMsg.save();

};

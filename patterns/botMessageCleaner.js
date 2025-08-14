const botMessageDeletus = require('../models/tidyMessages');

module.exports = async (guild) => {

    try {
        // Get all stored messages for this guild
        const messagesToDelete = await botMessageDeletus.find({ guildid: guild.id }).lean();

        for (const entry of messagesToDelete) {
            const { channelid, messageid } = entry;

            try {
                // Fetch the channel
                const channel = await guild.channels.fetch(channelid).catch(() => null);
                if (!channel) continue;

                // Fetch and delete the message
                const message = await channel.messages.fetch(messageid).catch(() => null);
                if (message) {
                    await message.delete();
                    console.log(`Deleted message ${messageid} in #${channel.name} (${guild.name})`);

                    // Optionally, remove entry from DB after deletion
                    await botMessageDeletus.deleteOne({ _id: entry._id });
                }
            } catch (err) {
                console.error(`Failed to delete message ${messageid} in channel ${channelid}:`, err);
            }
        }
    } catch (err) {
        console.error(`Error processing tidyMessages for guild ${guild.id}:`, err);
    }

};
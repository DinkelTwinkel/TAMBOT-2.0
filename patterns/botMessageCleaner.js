const botMessageDeletus = require('../models/tidyMessages');

module.exports = async (guild) => {

    try {
        // Get all stored messages for this guild
        const messagesToDelete = await botMessageDeletus.find({ guildId: guild.id }).lean();

        for (const entry of messagesToDelete) {
            const { channelId, messageId } = entry;

            try {
                // Fetch the channel
                const channel = await guild.channels.fetch(channelId).catch(() => null);
                if (!channel) continue;

                // Fetch and delete the message
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (message) {
                    await message.delete();
                    console.log(`Deleted message ${messageId} in #${channel.name} (${guild.name})`);

                    // Optionally, remove entry from DB after deletion
                    await botMessageDeletus.deleteOne({ _id: entry._id });
                }
            } catch (err) {
                console.error(`Failed to delete message ${messageId} in channel ${channelId}:`, err);
            }
        }
    } catch (err) {
        console.error(`Error processing tidyMessages for guild ${guild.id}:`, err);
    }

};

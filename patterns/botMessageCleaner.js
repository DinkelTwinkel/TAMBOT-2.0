const botMessageDeletus = require('../models/tidyMessages.js');

module.exports = async (guild) => {
    try {
        console.log('Attempting to tidy old bot messages for ' + guild.id);
        
        // Get all stored messages for this guild
        const messagesToDelete = await botMessageDeletus.find({ guildId: guild.id }).lean();
        console.log(`Found ${messagesToDelete.length} messages to process for guild ${guild.id}`);

        if (messagesToDelete.length === 0) {
            console.log('No messages found to delete');
            return;
        }

        for (const entry of messagesToDelete) {
            const { channelId, messageId, _id, expireTime } = entry; // Get the MongoDB _id
            console.log(`Processing message ${messageId} in channel ${channelId}`);

            const now = new Date();
            console.log (expireTime);
            if (now < expireTime) continue;

            try {
                // Fetch the channel
                const channel = await guild.channels.fetch(channelId).catch(() => null);
                if (!channel) {
                    console.log(`Channel ${channelId} doesn't exist, removing all entries for this channel`);
                    
                    // Delete by channelId AND guildId to be more specific
                    const deleteResult = await botMessageDeletus.deleteMany({ 
                        channelId: channelId,
                        guildId: guild.id 
                    });
                    console.log(`Deleted ${deleteResult.deletedCount} entries for non-existent channel ${channelId}`);
                    continue;
                }

                // Fetch and delete the message
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (message) {
                    await message.delete();
                    console.log(`✅ Deleted Discord message ${messageId} in #${channel.name} (${guild.name})`);
                } else {
                    console.log(`⚠️ Discord message ${messageId} not found (may already be deleted)`);
                }

                // Always remove the database entry (whether Discord message existed or not)
                // Use _id for more reliable deletion
                const deleteResult = await botMessageDeletus.deleteOne({ _id: entry._id });
                
                if (deleteResult.deletedCount > 0) {
                    console.log(`✅ Removed database entry for message ${messageId}`);
                } else {
                    console.log(`⚠️ Failed to remove database entry for message ${messageId}`);
                    
                    // Fallback: try deleting by messageId and guildId
                    const fallbackResult = await botMessageDeletus.deleteOne({ 
                        messageId: messageId, 
                        guildId: guild.id 
                    });
                    
                    if (fallbackResult.deletedCount > 0) {
                        console.log(`✅ Fallback deletion successful for message ${messageId}`);
                    } else {
                        console.log(`❌ Fallback deletion also failed for message ${messageId}`);
                    }
                }

            } catch (err) {
                console.error(`❌ Error processing message ${messageId} in channel ${channelId}:`, err);
                
                // Still try to clean up the database entry even if Discord operations failed
                try {
                    const cleanupResult = await botMessageDeletus.deleteOne({ _id: entry._id });
                    if (cleanupResult.deletedCount > 0) {
                        console.log(`🧹 Cleaned up database entry for failed message ${messageId}`);
                    }
                } catch (cleanupErr) {
                    console.error(`❌ Failed to cleanup database entry for message ${messageId}:`, cleanupErr);
                }
            }
        }

        // Final verification - check how many entries remain
        const remainingCount = await botMessageDeletus.countDocuments({ guildId: guild.id });
        console.log(`✅ Cleanup complete for guild ${guild.id}. ${remainingCount} entries remaining.`);

    } catch (err) {
        console.error(`❌ Error processing tidyMessages for guild ${guild.id}:`, err);
    }
};

// Optional: Add a function to manually clean up orphaned entries
async function cleanupOrphanedEntries(guildId) {
    try {
        const result = await botMessageDeletus.deleteMany({ 
            guildId: guildId,
            // Add additional criteria if needed, e.g., old timestamps
        });
        console.log(`🧹 Manually cleaned up ${result.deletedCount} orphaned entries for guild ${guildId}`);
        return result.deletedCount;
    } catch (err) {
        console.error(`❌ Error during manual cleanup for guild ${guildId}:`, err);
        return 0;
    }
}

module.exports.cleanupOrphanedEntries = cleanupOrphanedEntries;
const messageDeletus = require('../models/tidyMessages');

module.exports = async (guildId, channelId, msgId, expireMinutes = 5) => {
    try {
        // Default to 5 minutes if expireMinutes is not provided
        console.log(`Registering bot message with ${expireMinutes} minute expiry`);

        // Check if the message is already registered
        const existingMessage = await messageDeletus.findOne({ messageId: msgId });
        
        if (existingMessage) {
            console.log(`Message ${msgId} already registered, updating expiry time instead`);
            // Update the existing message's expiry time
            existingMessage.expireTime = new Date(Date.now() + 60 * 1000 * expireMinutes);
            await existingMessage.save();
            return;
        }

        // Create new message registration
        const newStoreMsg = new messageDeletus({ 
            guildId: guildId,
            channelId: channelId,
            messageId: msgId,
            expireTime: new Date(Date.now() + 60 * 1000 * expireMinutes),
        });

        await newStoreMsg.save();

    } catch (error) {
        // Handle the specific case of duplicate key error
        if (error.code === 11000 && error.keyValue && error.keyValue.messageId) {
            console.log(`Duplicate message registration prevented for messageId: ${error.keyValue.messageId}`);
            // Try to update the existing message instead
            try {
                await messageDeletus.findOneAndUpdate(
                    { messageId: msgId },
                    { 
                        expireTime: new Date(Date.now() + 60 * 1000 * expireMinutes),
                        guildId: guildId,
                        channelId: channelId
                    }
                );
                console.log(`Updated existing message registration for messageId: ${msgId}`);
            } catch (updateError) {
                console.error('Error updating existing message registration:', updateError);
            }
        } else {
            console.error('Error registering bot message:', error);
            throw error; // Re-throw if it's not a duplicate key error
        }
    }
};

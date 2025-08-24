const ActiveVCS = require('../../models/activevcs');

/**
 * Cleans up the ???'s gullet channel when sacrifice ends
 * @param {Guild} guild - The Discord guild
 * @returns {Promise<boolean>} - True if cleanup was successful
 */
async function cleanupGulletChannel(guild) {
    try {
        // Find the gullet channel in the database
        const gulletVC = await ActiveVCS.findOne({ 
            guildId: guild.id, 
            typeId: 16 
        });
        
        if (!gulletVC) {
            console.log(`🔥 No gullet channel found in database for guild ${guild.id}`);
            return true;
        }
        
        // Try to fetch and delete the channel
        try {
            const channel = await guild.channels.fetch(gulletVC.channelId);
            
            if (channel) {
                // Move any members still in the gullet to a safe location (like AFK channel or disconnect them)
                const members = channel.members;
                
                if (members.size > 0) {
                    console.log(`🔥 Moving ${members.size} members out of gullet before deletion`);
                    
                    // Try to move to AFK channel or disconnect
                    const afkChannel = guild.afkChannel;
                    
                    for (const [memberId, member] of members) {
                        try {
                            if (afkChannel) {
                                await member.voice.setChannel(afkChannel);
                                console.log(`🔥 Moved ${member.user.tag} to AFK channel`);
                            } else {
                                await member.voice.disconnect();
                                console.log(`🔥 Disconnected ${member.user.tag} from gullet`);
                            }
                        } catch (err) {
                            console.error(`Failed to move/disconnect member ${member.user.tag}:`, err);
                        }
                    }
                }
                
                // Delete the channel
                await channel.delete('Sacrifice event ended - cleaning up gullet channel');
                console.log(`🔥 Successfully deleted gullet channel: ${channel.name}`);
            }
        } catch (err) {
            console.log(`🔥 Gullet channel no longer exists, cleaning database entry`);
        }
        
        // Remove from database
        await ActiveVCS.deleteOne({ channelId: gulletVC.channelId });
        console.log(`🔥 Removed gullet channel from database`);
        
        return true;
    } catch (error) {
        console.error('Error cleaning up gullet channel:', error);
        return false;
    }
}

/**
 * Ensures there's only one gullet channel per guild
 * Called periodically or when creating a new gullet
 * @param {Guild} guild - The Discord guild
 */
async function ensureSingleGullet(guild) {
    try {
        // Find all gullet channels for this guild
        const gulletVCs = await ActiveVCS.find({ 
            guildId: guild.id, 
            typeId: 16 
        });
        
        if (gulletVCs.length <= 1) {
            return; // Only one or no gullet channels, all good
        }
        
        console.log(`⚠️ Found ${gulletVCs.length} gullet channels for guild ${guild.id}, cleaning up extras`);
        
        // Keep the most recent one (based on creation time)
        let mostRecentVC = null;
        let mostRecentChannel = null;
        
        // Find which channels still exist
        for (const vc of gulletVCs) {
            try {
                const channel = await guild.channels.fetch(vc.channelId);
                if (channel) {
                    if (!mostRecentChannel || channel.createdTimestamp > mostRecentChannel.createdTimestamp) {
                        mostRecentChannel = channel;
                        mostRecentVC = vc;
                    }
                }
            } catch (err) {
                // Channel doesn't exist, mark for deletion
                await ActiveVCS.deleteOne({ channelId: vc.channelId });
                console.log(`🔥 Removed stale gullet entry: ${vc.channelId}`);
            }
        }
        
        // Delete all but the most recent
        for (const vc of gulletVCs) {
            if (vc.channelId !== mostRecentVC?.channelId) {
                try {
                    const channel = await guild.channels.fetch(vc.channelId);
                    
                    // Move members from duplicate gullet to the main one
                    if (channel && mostRecentChannel) {
                        const members = channel.members;
                        for (const [memberId, member] of members) {
                            try {
                                await member.voice.setChannel(mostRecentChannel);
                                console.log(`🔥 Moved ${member.user.tag} from duplicate gullet to main gullet`);
                            } catch (err) {
                                console.error(`Failed to move member ${member.user.tag}:`, err);
                            }
                        }
                    }
                    
                    // Delete the duplicate channel
                    if (channel) {
                        await channel.delete('Removing duplicate gullet channel');
                        console.log(`🔥 Deleted duplicate gullet channel: ${channel.name}`);
                    }
                } catch (err) {
                    // Channel already gone
                }
                
                // Remove from database
                await ActiveVCS.deleteOne({ channelId: vc.channelId });
            }
        }
        
        console.log(`✅ Ensured only one gullet channel exists for guild ${guild.id}`);
    } catch (error) {
        console.error('Error ensuring single gullet:', error);
    }
}

/**
 * Checks if a gullet channel exists for the guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object|null>} - The gullet VC data or null
 */
async function getGulletChannel(guildId) {
    try {
        const gulletVC = await ActiveVCS.findOne({ 
            guildId: guildId, 
            typeId: 16 
        });
        
        return gulletVC;
    } catch (error) {
        console.error('Error getting gullet channel:', error);
        return null;
    }
}

/**
 * Sends a message to the gullet channel if it exists
 * @param {Guild} guild - The Discord guild
 * @param {string} message - The message to send
 */
async function messageGullet(guild, message) {
    try {
        const gulletVC = await getGulletChannel(guild.id);
        
        if (!gulletVC) {
            return false;
        }
        
        const channel = await guild.channels.fetch(gulletVC.channelId);
        if (channel) {
            await channel.send(message);
            return true;
        }
    } catch (error) {
        console.error('Error messaging gullet channel:', error);
    }
    return false;
}

module.exports = {
    cleanupGulletChannel,
    ensureSingleGullet,
    getGulletChannel,
    messageGullet
};
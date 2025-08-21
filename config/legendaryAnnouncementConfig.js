// Configuration for server-wide legendary announcements
// This controls how legendary item discoveries are announced across all channels

module.exports = {
    // Main announcement settings
    LEGENDARY_ANNOUNCEMENT: {
        // Send to all text channels
        sendToAllChannels: true,
        
        // Maximum channels to send to (set to 0 for unlimited)
        maxChannels: 0,
        
        // Delay between channel sends in milliseconds (to avoid rate limits)
        sendDelay: 100,
        
        // Channel filter options
        channelFilters: {
            // Skip channels with these names
            skipChannelNames: [
                'logs',
                'audit-log',
                'bot-commands',
                'admin',
                'moderator',
                'staff'
            ],
            
            // Only send to channels with these prefixes (empty array = no filter)
            allowedPrefixes: [], // e.g., ['general', 'chat', 'talk']
            
            // Skip NSFW channels
            skipNSFW: true,
            
            // Skip voice text channels
            skipVoiceText: true,
            
            // Skip forum channels
            skipForums: true,
            
            // Skip thread channels
            skipThreads: true
        },
        
        // Visual settings
        visualSettings: {
            // Use Discord's header markdown (# for biggest text)
            useBigText: true,
            
            // Include rich embeds with the announcement
            useEmbeds: false, // Set to true to use sendLegendaryAnnouncementWithEmbed
            
            // Embed color (hex)
            embedColor: '#FFD700',
            
            // Icon URL for embeds
            legendaryIconUrl: 'https://i.imgur.com/AfFp7pu.png',
            
            // Add reactions to messages
            addReactions: true,
            
            // Maximum messages to add reactions to (to avoid rate limits)
            maxReactionMessages: 5,
            
            // Reactions to add
            reactions: ['🎉', '🌟', '💎', '🏆', '✨', '🔥']
        },
        
        // Message format templates
        messageTemplates: {
            // Main announcement (supports Discord markdown)
            default: (playerTag, itemName, itemDescription) => 
                `# 🌟 LEGENDARY DISCOVERY! 🌟\n` +
                `## ${playerTag} has found the legendary **${itemName}**!\n` +
                `### ${itemDescription || 'A unique and powerful item!'}\n\n` +
                `*This item is one-of-a-kind and now belongs to ${playerTag}!*`,
            
            // Shorter version for servers that prefer less spam
            compact: (playerTag, itemName) =>
                `## 🌟 **LEGENDARY!** ${playerTag} found **${itemName}**! 🌟`,
            
            // Epic version with more flair
            epic: (playerTag, itemName, itemDescription) =>
                `# ⚡ LEGENDARY ITEM ALERT ⚡\n` +
                `# 🌟 ${playerTag.toUpperCase()} HAS DISCOVERED 🌟\n` +
                `# ✨ **${itemName.toUpperCase()}** ✨\n` +
                `## ${itemDescription}\n` +
                `### This moment will go down in server history!\n` +
                `*@everyone witness this legendary discovery!*`
        },
        
        // Special effects for ultra-rare items
        ultraRareSettings: {
            // Item IDs that are considered ultra-rare
            ultraRareItemIds: [1, 2, 3], // Add your actual ultra-rare item IDs
            
            // Ping everyone for ultra-rare finds
            pingEveryone: false,
            
            // Pin the message in channels
            pinMessage: false,
            
            // Send multiple times with delays for emphasis
            repeatAnnouncement: false,
            repeatCount: 3,
            repeatDelay: 2000
        },
        
        // Performance settings
        performance: {
            // Use parallel sending (faster but more resource intensive)
            parallelSend: false,
            
            // Batch size for parallel sending
            batchSize: 5,
            
            // Timeout for each channel send (ms)
            sendTimeout: 5000,
            
            // Log successful/failed sends
            logSends: true,
            
            // Continue on errors (don't stop if one channel fails)
            continueOnError: true
        }
    },
    
    // Function to filter channels based on configuration
    shouldSendToChannel(channel) {
        const filters = this.LEGENDARY_ANNOUNCEMENT.channelFilters;
        
        // Check channel type
        if (channel.type !== 0) return false; // Only text channels
        
        // Check NSFW
        if (filters.skipNSFW && channel.nsfw) return false;
        
        // Check channel name
        const channelName = channel.name.toLowerCase();
        for (const skipName of filters.skipChannelNames) {
            if (channelName.includes(skipName.toLowerCase())) {
                return false;
            }
        }
        
        // Check allowed prefixes if configured
        if (filters.allowedPrefixes.length > 0) {
            let hasAllowedPrefix = false;
            for (const prefix of filters.allowedPrefixes) {
                if (channelName.startsWith(prefix.toLowerCase())) {
                    hasAllowedPrefix = true;
                    break;
                }
            }
            if (!hasAllowedPrefix) return false;
        }
        
        return true;
    },
    
    // Function to get the appropriate message template
    getMessageTemplate(templateName = 'default') {
        return this.LEGENDARY_ANNOUNCEMENT.messageTemplates[templateName] || 
               this.LEGENDARY_ANNOUNCEMENT.messageTemplates.default;
    }
};

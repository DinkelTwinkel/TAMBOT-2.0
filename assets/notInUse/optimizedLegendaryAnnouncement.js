// Optimized legendary announcement system with configuration support
// This version includes channel filtering, batch sending, and performance optimizations

const config = require('../config/legendaryAnnouncementConfig');
const { EmbedBuilder } = require('discord.js');

/**
 * Send legendary announcement to all appropriate text channels
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {Object} itemResult - Item result from rollForItemFind
 * @param {string} playerTag - Player's Discord tag
 * @returns {Promise<Object>} Results of the announcement
 */
async function sendOptimizedLegendaryAnnouncement(client, guildId, itemResult, playerTag) {
    const startTime = Date.now();
    const results = {
        success: false,
        channelsSent: 0,
        channelsFailed: 0,
        totalChannels: 0,
        errors: [],
        duration: 0
    };
    
    try {
        // Check if announcement is enabled
        if (!itemResult.systemAnnouncement?.enabled || !config.LEGENDARY_ANNOUNCEMENT.sendToAllChannels) {
            return results;
        }
        
        // Fetch the guild
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            results.errors.push('Guild not found');
            return results;
        }
        
        // Filter channels based on configuration
        const textChannels = guild.channels.cache.filter(channel => {
            // Basic permission check
            if (!channel.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])) {
                return false;
            }
            
            // Apply custom filters from config
            return config.shouldSendToChannel(channel);
        });
        
        results.totalChannels = textChannels.size;
        
        if (textChannels.size === 0) {
            results.errors.push('No accessible text channels');
            return results;
        }
        
        // Prepare the message content
        const announcementMessage = itemResult.systemAnnouncement.message;
        
        // Prepare embed if configured
        let embed = null;
        if (config.LEGENDARY_ANNOUNCEMENT.visualSettings.useEmbeds) {
            embed = createLegendaryEmbed(itemResult, playerTag);
        }
        
        // Convert to array for processing
        const channelsArray = Array.from(textChannels.values());
        
        // Apply max channels limit if configured
        const maxChannels = config.LEGENDARY_ANNOUNCEMENT.maxChannels;
        const channelsToProcess = maxChannels > 0 
            ? channelsArray.slice(0, maxChannels)
            : channelsArray;
        
        console.log(`[LEGENDARY] Announcing to ${channelsToProcess.length} channels...`);
        
        // Send announcements based on performance settings
        if (config.LEGENDARY_ANNOUNCEMENT.performance.parallelSend) {
            // Parallel batch sending
            await sendInBatches(channelsToProcess, announcementMessage, embed, results);
        } else {
            // Sequential sending with delay
            await sendSequentially(channelsToProcess, announcementMessage, embed, results);
        }
        
        // Special handling for ultra-rare items
        if (isUltraRare(itemResult.item.id)) {
            await handleUltraRareEffects(guild, channelsToProcess, itemResult, playerTag);
        }
        
        results.success = results.channelsSent > 0;
        results.duration = Date.now() - startTime;
        
        // Log results if configured
        if (config.LEGENDARY_ANNOUNCEMENT.performance.logSends) {
            console.log(`[LEGENDARY] Announcement complete:`, {
                item: itemResult.item.name,
                player: playerTag,
                sent: results.channelsSent,
                failed: results.channelsFailed,
                duration: `${results.duration}ms`
            });
        }
        
        return results;
        
    } catch (error) {
        console.error('[LEGENDARY] Critical error:', error);
        results.errors.push(error.message);
        return results;
    }
}

/**
 * Send announcements sequentially with delay
 */
async function sendSequentially(channels, message, embed, results) {
    const delay = config.LEGENDARY_ANNOUNCEMENT.sendDelay;
    const reactions = config.LEGENDARY_ANNOUNCEMENT.visualSettings.reactions;
    const maxReactions = config.LEGENDARY_ANNOUNCEMENT.visualSettings.maxReactionMessages;
    
    for (const channel of channels) {
        try {
            // Prepare message options
            const messageOptions = { content: message };
            if (embed) messageOptions.embeds = [embed];
            
            // Send message
            const sentMessage = await channel.send(messageOptions);
            results.channelsSent++;
            
            // Add reactions if configured and within limit
            if (config.LEGENDARY_ANNOUNCEMENT.visualSettings.addReactions && 
                results.channelsSent <= maxReactions) {
                for (const reaction of reactions) {
                    await sentMessage.react(reaction).catch(() => {});
                    await sleep(50); // Small delay between reactions
                }
            }
            
            // Delay before next send
            if (delay > 0) await sleep(delay);
            
        } catch (error) {
            results.channelsFailed++;
            results.errors.push(`${channel.name}: ${error.message}`);
            
            if (!config.LEGENDARY_ANNOUNCEMENT.performance.continueOnError) {
                throw error;
            }
        }
    }
}

/**
 * Send announcements in parallel batches
 */
async function sendInBatches(channels, message, embed, results) {
    const batchSize = config.LEGENDARY_ANNOUNCEMENT.performance.batchSize;
    
    for (let i = 0; i < channels.length; i += batchSize) {
        const batch = channels.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async channel => {
            try {
                const messageOptions = { content: message };
                if (embed) messageOptions.embeds = [embed];
                
                await channel.send(messageOptions);
                results.channelsSent++;
                
            } catch (error) {
                results.channelsFailed++;
                results.errors.push(`${channel.name}: ${error.message}`);
            }
        });
        
        await Promise.allSettled(batchPromises);
        
        // Small delay between batches
        if (i + batchSize < channels.length) {
            await sleep(100);
        }
    }
}

/**
 * Create a rich embed for legendary announcements
 */
function createLegendaryEmbed(itemResult, playerTag) {
    const settings = config.LEGENDARY_ANNOUNCEMENT.visualSettings;
    
    return new EmbedBuilder()
        .setColor(settings.embedColor)
        .setTitle('🌟 LEGENDARY ITEM DISCOVERED! 🌟')
        .setDescription(`**${playerTag}** has found the legendary\n# **${itemResult.item.name}**`)
        .addFields(
            { 
                name: '📜 Description', 
                value: itemResult.item.description || 'A unique and powerful item!' 
            },
            { 
                name: '⚡ Power Level', 
                value: `${itemResult.item.powerLevel || 'Unknown'}`, 
                inline: true 
            },
            { 
                name: '🎯 Rarity', 
                value: itemResult.item.rarity?.toUpperCase() || 'LEGENDARY', 
                inline: true 
            },
            { 
                name: '🏆 Status', 
                value: 'One-of-a-kind item!', 
                inline: true 
            }
        )
        .setThumbnail(settings.legendaryIconUrl)
        .setTimestamp()
        .setFooter({ text: 'A legendary moment in server history!' });
}

/**
 * Handle special effects for ultra-rare items
 */
async function handleUltraRareEffects(guild, channels, itemResult, playerTag) {
    const ultraSettings = config.LEGENDARY_ANNOUNCEMENT.ultraRareSettings;
    
    if (!ultraSettings) return;
    
    // Send repeat announcements if configured
    if (ultraSettings.repeatAnnouncement) {
        for (let i = 1; i < ultraSettings.repeatCount; i++) {
            await sleep(ultraSettings.repeatDelay);
            
            // Send a follow-up message to first few channels
            const repeatChannels = channels.slice(0, 3);
            for (const channel of repeatChannels) {
                try {
                    await channel.send(`⚠️ **ULTRA-RARE ALERT** ⚠️\n**${playerTag}** has found **${itemResult.item.name}**!`);
                } catch (error) {
                    // Ignore errors for repeat messages
                }
            }
        }
    }
    
    // Pin message if configured (only in first channel)
    if (ultraSettings.pinMessage && channels.length > 0) {
        try {
            const firstChannel = channels[0];
            const messages = await firstChannel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();
            if (lastMessage) {
                await lastMessage.pin();
            }
        } catch (error) {
            console.error('[LEGENDARY] Failed to pin message:', error);
        }
    }
}

/**
 * Check if an item is ultra-rare
 */
function isUltraRare(itemId) {
    const ultraRareIds = config.LEGENDARY_ANNOUNCEMENT.ultraRareSettings?.ultraRareItemIds || [];
    return ultraRareIds.includes(itemId);
}

/**
 * Sleep utility function
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    sendOptimizedLegendaryAnnouncement,
    createLegendaryEmbed,
    isUltraRare
};

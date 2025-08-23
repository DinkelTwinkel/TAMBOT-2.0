// boost.js - Script for applying temporary boosts/buffs
const { EmbedBuilder } = require('discord.js');

/**
 * Boost script for items that provide temporary stat boosts
 * This script is called when an item with script: "boost" is used
 * 
 * @param {Object} context - The context object containing all necessary data
 */
module.exports = async (context) => {
    const { 
        interaction, 
        member,
        channel,
        guild,
        item, 
        userId,
        user,
        consumeItem,
        sendEmbed,
        client
    } = context;

    try {
        // Check if item has abilities to boost
        if (!item.abilities || item.abilities.length === 0) {
            throw new Error('This item has no boost effects!');
        }

        // Consume the item
        const remainingQuantity = await consumeItem(1);

        // Calculate boost duration (default 60 seconds if not specified)
        const duration = item.duration || 60;

        // Store active boosts (in a real implementation, this would be saved to database)
        if (!client.activeBoosts) {
            client.activeBoosts = new Map();
        }

        // Get user's current boosts
        let userBoosts = client.activeBoosts.get(userId) || [];

        // Create boost object
        const boost = {
            itemId: item.id,
            itemName: item.name,
            abilities: item.abilities,
            startTime: Date.now(),
            duration: duration * 1000, // Convert to milliseconds
            endTime: Date.now() + (duration * 1000)
        };

        // Add new boost
        userBoosts.push(boost);
        client.activeBoosts.set(userId, userBoosts);

        // Schedule boost removal
        setTimeout(() => {
            const boosts = client.activeBoosts.get(userId) || [];
            const updatedBoosts = boosts.filter(b => b.endTime > Date.now());
            
            if (updatedBoosts.length > 0) {
                client.activeBoosts.set(userId, updatedBoosts);
            } else {
                client.activeBoosts.delete(userId);
            }

            // Notify user that boost expired (optional)
            channel.send({
                content: `⏰ **${user.username}**, your boost from **${item.name}** has expired!`,
                allowedMentions: { users: [] } // Don't ping the user
            }).catch(console.error);
        }, duration * 1000);

        // Build the success message
        let description = [`**${user.username}** activated **${item.name}**!`, ''];
        
        if (item.description) {
            description.push(`*${item.description}*`, '');
        }

        // List active boosts
        description.push('**🚀 Active Boosts:**');
        for (const ability of item.abilities) {
            const sign = ability.powerlevel >= 0 ? '+' : '';
            const emoji = getAbilityEmoji(ability.name);
            description.push(`${emoji} **${formatAbilityName(ability.name)}:** ${sign}${ability.powerlevel}`);
        }
        
        description.push('', `⏱️ **Duration:** ${duration} seconds`);
        description.push(`📦 **Remaining:** ${remainingQuantity}x ${item.name}`);

        // Calculate total active boosts
        const totalActiveBoosts = userBoosts.length;
        if (totalActiveBoosts > 1) {
            description.push('', `💫 **Total Active Boosts:** ${totalActiveBoosts}`);
        }

        // Determine embed color based on boost power
        let embedColor = 0x3498DB; // Default blue
        const totalPower = item.abilities.reduce((sum, a) => sum + Math.abs(a.powerlevel), 0);
        if (totalPower >= 10) embedColor = 0xE74C3C; // Red for powerful boosts
        else if (totalPower >= 5) embedColor = 0xF39C12; // Orange for medium boosts

        // Send success embed
        await sendEmbed({
            title: '⚡ Boost Activated!',
            description: description.join('\n'),
            color: embedColor,
            thumbnail: item.image ? `https://example.com/images/${item.image}.png` : null,
            footer: { 
                text: `Expires in ${duration} seconds • Boost ID: ${boost.startTime}` 
            },
            fields: [
                {
                    name: '💰 Item Value',
                    value: item.value ? `${item.value} coins` : 'Priceless',
                    inline: true
                },
                {
                    name: '⏰ Expires At',
                    value: `<t:${Math.floor(boost.endTime / 1000)}:R>`,
                    inline: true
                }
            ]
        });

        // Log the boost activation
        console.log(`[BOOST] ${userId} activated boost: ${item.name} for ${duration}s`);

        // Optional: Send a reminder when boost is about to expire
        if (duration > 10) {
            setTimeout(() => {
                channel.send({
                    content: `⚠️ **${user.username}**, your **${item.name}** boost expires in 10 seconds!`,
                    allowedMentions: { users: [] }
                }).catch(console.error);
            }, (duration - 10) * 1000);
        }

    } catch (error) {
        console.error('[BOOST] Error:', error);
        throw error;
    }
};

// Helper function to get emoji for ability type
function getAbilityEmoji(abilityName) {
    const emojis = {
        'mining': '⛏️',
        'luck': '🍀',
        'speed': '💨',
        'sight': '👁️',
        'strength': '💪',
        'defense': '🛡️',
        'health': '❤️',
        'mana': '💙',
        'experience': '⭐'
    };
    return emojis[abilityName.toLowerCase()] || '✨';
}

// Helper function to format ability name
function formatAbilityName(name) {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Export a function to get active boosts for a user (useful for other systems)
module.exports.getActiveBoosts = (client, userId) => {
    if (!client.activeBoosts) return [];
    
    const boosts = client.activeBoosts.get(userId) || [];
    const now = Date.now();
    
    // Filter out expired boosts
    const activeBoosts = boosts.filter(b => b.endTime > now);
    
    // Update the stored boosts if any expired
    if (activeBoosts.length !== boosts.length) {
        if (activeBoosts.length > 0) {
            client.activeBoosts.set(userId, activeBoosts);
        } else {
            client.activeBoosts.delete(userId);
        }
    }
    
    return activeBoosts;
};

// Export a function to calculate total boost for a specific ability
module.exports.calculateTotalBoost = (client, userId, abilityName) => {
    const activeBoosts = module.exports.getActiveBoosts(client, userId);
    let total = 0;
    
    for (const boost of activeBoosts) {
        const ability = boost.abilities.find(a => a.name === abilityName);
        if (ability) {
            total += ability.powerlevel;
        }
    }
    
    return total;
};

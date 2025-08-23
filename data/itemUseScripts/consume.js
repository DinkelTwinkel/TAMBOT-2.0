// consume.js - Script for consuming items
const { EmbedBuilder } = require('discord.js');
const registerBotMessage = require('../../patterns/registerBotMessage');

/**
 * Consume script for items that provide temporary buffs or effects
 * This script is called when an item with script: "consume" is used
 * 
 * @param {Object} context - The context object containing all necessary data
 * @param {Object} context.interaction - The Discord interaction object
 * @param {Object} context.member - The guild member using the item
 * @param {Object} context.channel - The channel where the item is being used
 * @param {Object} context.guild - The guild object
 * @param {Object} context.client - The Discord client
 * @param {string} context.itemId - The ID of the item being used
 * @param {Object} context.item - The item data from itemSheet.json
 * @param {Object} context.ownedItem - The owned item data from inventory
 * @param {string} context.userId - The ID of the user using the item
 * @param {Object} context.user - The Discord user object
 * @param {Function} context.consumeItem - Helper function to consume the item from inventory
 * @param {Function} context.sendEmbed - Helper function to send embeds
 */
module.exports = async function consume(context) {
    const { 
        interaction, 
        member, 
        channel, 
        item, 
        ownedItem,
        userId,
        user,
        consumeItem,
        sendEmbed,
        PlayerInventory
    } = context;

    try {
        // Check if this is actually a consumable (special case for Banana Axe)
        if (item.type !== 'consumable' && item.id !== '13') {
            throw new Error('This item is not consumable!');
        }

        // Consume the item (remove 1 from inventory)
        const remainingQuantity = await consumeItem(1);

        // Build the success message
        let description = `**${user.username}** consumed **${item.name}**!\n\n`;
        
        // Add item description
        if (item.description) {
            description += `*${item.description}*\n\n`;
        }

        // List abilities/effects if any
        if (item.abilities && item.abilities.length > 0) {
            description += '**Effects:**\n';
            for (const ability of item.abilities) {
                const sign = ability.powerlevel >= 0 ? '+' : '';
                description += `• ${ability.name.charAt(0).toUpperCase() + ability.name.slice(1)}: ${sign}${ability.powerlevel}\n`;
            }
            description += '\n';
        }

        // Add duration if applicable
        if (item.duration) {
            description += `⏱️ **Duration:** ${item.duration} minute${item.duration !== 1 ? 's' : ''}\n\n`;
        }

        // Add remaining quantity
        description += `📦 **Remaining:** ${remainingQuantity}x ${item.name}`;

        // Determine embed color based on item type/rarity
        let embedColor = 0x2ECC71; // Default green for consumables
        if (item.value) {
            if (item.value >= 500) embedColor = 0xF39C12; // Orange for valuable items
            if (item.value >= 1000) embedColor = 0xE74C3C; // Red for very valuable items
        }

        // Send the detailed info as ephemeral (private)
        await interaction.editReply({ 
            embeds: [new EmbedBuilder()
                .setTitle('✅ Item Consumed')
                .setDescription(description)
                .setColor(embedColor)
                .setThumbnail(item.image ? `https://example.com/images/${item.image}.png` : null)
                .setFooter({ text: `Item ID: ${item.id}` })
                .addFields([
                    {
                        name: '💰 Value',
                        value: item.value ? `${item.value} coins` : 'Priceless',
                        inline: true
                    },
                    {
                        name: '📊 Type',
                        value: item.subtype || item.type || 'Unknown',
                        inline: true
                    }
                ])],
            ephemeral: true 
        });
        
        // Send a short public message about the consumption
        let publicMessage = `${user} consumed **${item.name}**`;
        if (item.abilities && item.abilities.length > 0) {
            const mainAbility = item.abilities[0];
            publicMessage += ` • ${mainAbility.name.charAt(0).toUpperCase() + mainAbility.name.slice(1)} +${mainAbility.powerlevel}`;
        }
        if (item.duration) {
            publicMessage += ` (${item.duration}m)`;
        }
        publicMessage += `! ${item.type === 'consumable' && item.subtype === 'food' ? '🍖' : item.type === 'consumable' && item.subtype === 'drink' ? '🍺' : '✨'}`;
        
        const publicMsg = await channel.send({
            content: publicMessage,
            allowedMentions: { users: [] }
        });
        // Register for auto-cleanup
        await registerBotMessage(channel.guild.id, channel.id, publicMsg.id, 5);

        // Apply actual buff effects if item has duration
        if (item.duration && item.abilities && item.abilities.length > 0) {
            try {
                const applyConsumableBuff = require('../../patterns/applyConsumeableBuff');
                const buffResult = await applyConsumableBuff(userId, item);
                
                // Add buff info to the embed
                const remainingMs = buffResult.expiresAt.getTime() - Date.now();
                const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));
                
                if (buffResult.refreshed) {
                    description += `\n\n🔄 **Buff Refreshed!** Duration extended to ${remainingMinutes} minutes.`;
                } else {
                    description += `\n\n✨ **Buff Applied!** Active for ${remainingMinutes} minutes.`;
                }
            } catch (buffError) {
                console.error('[CONSUME] Failed to apply buff:', buffError);
                // Continue even if buff fails - item is already consumed
            }
        }
        
        // Log the consumption for debugging
        console.log(`[CONSUME] ${userId} consumed item ${item.id} (${item.name})`);

        // If this is a special consumable with additional effects, handle them
        if (item.id === '13') { // Banana Axe special case
            // The Banana Axe is both a tool and consumable
            // It's a slippery, unreliable tool that can be eaten for power!
            const bananaMsg = await channel.send({
                content: `🍌 *${user.username} takes a bite out of the Banana Axe! It's surprisingly nutritious and grants temporary mining power! The axe handle dissolves into sweet banana flavor...*`,
                ephemeral: false
            });
            // Register for auto-cleanup (5 minute expiry)
            await registerBotMessage(channel.guild.id, channel.id, bananaMsg.id, 5);
            
            // Apply special Banana Axe buff using its duration from itemSheet
            try {
                const applyConsumableBuff = require('../../patterns/applyConsumeableBuff');
                const buffResult = await applyConsumableBuff(userId, item);
                
                const remainingMs = buffResult.expiresAt.getTime() - Date.now();
                const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));
                const miningPower = item.abilities.find(a => a.name === 'mining')?.powerlevel || 2;
                
                const buffMsg = await channel.send({
                    content: `⛏️ **Banana Power Active!** Mining +${miningPower} for ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}! 🍌`,
                    ephemeral: false
                });
                // Register for auto-cleanup (5 minute expiry)
                await registerBotMessage(channel.guild.id, channel.id, buffMsg.id, 5);
            } catch (buffError) {
                console.error('[CONSUME] Failed to apply Banana Axe buff:', buffError);
            }
        }
        
        // Handle other tool-consumables
        if (item.type === 'tool' && item.script === 'consume') {
            // This is a tool that can be consumed
            description += '\n\n⚠️ *You consumed a tool! Hope it was worth it!*';
            
            // Send private embed for tool consumption
            await interaction.editReply({ 
            embeds: [new EmbedBuilder()
                .setTitle('🔧➡️🍴 Tool Consumed!')
                .setDescription(description)
                .setColor(0xFFD700) // Gold color for special consumption
                .setThumbnail(item.image ? `https://example.com/images/${item.image}.png` : null)
                .setFooter({ text: `Tool sacrificed for power! • Item ID: ${item.id}` })
            .addFields([
            {
                name: '💰 Tool Value',
                value: item.value ? `${item.value} coins` : 'Priceless',
                    inline: true
                },
            {
                name: '📊 Original Type',
                value: 'Tool ➡️ Consumed',
                    inline: true
                },
            {
                name: '⚒️ Lost Durability',
                value: item.durability ? `${item.durability} uses` : 'N/A',
                    inline: true
                    }
                    ])],
                ephemeral: true
                });
                
                // Send short public message for tool consumption
                let toolMessage = `${user} consumed their **${item.name}** (tool)`;
                if (item.abilities && item.abilities.length > 0) {
                    const mainAbility = item.abilities[0];
                    toolMessage += ` • ${mainAbility.name.charAt(0).toUpperCase() + mainAbility.name.slice(1)} +${mainAbility.powerlevel}`;
                }
                if (item.duration) {
                    toolMessage += ` (${item.duration}m)`;
                }
                toolMessage += `! 🔧💥`;
                
                const toolPublicMsg = await channel.send({
                    content: toolMessage,
                    allowedMentions: { users: [] }
                });
                // Register for auto-cleanup
                await registerBotMessage(channel.guild.id, channel.id, toolPublicMsg.id, 5);
                return; // Exit early since we already sent the messages
        }

    } catch (error) {
        console.error('[CONSUME] Error:', error);
        throw error; // Re-throw to be handled by the ItemUseHandler
    }
};

// Alternative export style (both work)
// module.exports = {
//     execute: async (context) => {
//         // Script logic here
//     }
// };

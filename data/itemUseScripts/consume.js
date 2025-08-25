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

        // Build the success message with food/drink appropriate verb
        const actionVerb = item.subtype === 'drink' ? 'drank' : item.subtype === 'food' ? 'ate' : 'consumed';
        const actionVerbPast = item.subtype === 'drink' ? 'Drank' : item.subtype === 'food' ? 'Ate' : 'Consumed';
        
        let description = `**${user.username}** ${actionVerb} **${item.name}**!\n\n`;
        
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

        // Special messages for Gullet/flesh foods (disturbing items)
        const isGulletFood = parseInt(item.id) >= 200 && parseInt(item.id) <= 219;
        
        const gulletFoodMessages = [
            `${user} reluctantly consumed **${item.name}**`,
            `${user} forced down **${item.name}**`,
            `${user} hesitantly ingested **${item.name}**`,
            `${user} choked down **${item.name}**`,
            `${user} grimaced while eating **${item.name}**`,
            `${user} nervously consumed **${item.name}**`,
            `${user} swallowed **${item.name}** with difficulty`
        ];
        
        // Array of varied message templates for food and drinks
        const foodMessages = isGulletFood ? gulletFoodMessages : [
            `${user} ate **${item.name}**`,
            `${user} devoured **${item.name}**`,
            `${user} munched on **${item.name}**`,
            `${user} enjoyed **${item.name}**`,
            `${user} feasted on **${item.name}**`,
            `${user} consumed **${item.name}**`,
            `${user} wolfed down **${item.name}**`,
            `${user} savored **${item.name}**`
        ];
        
        const drinkMessages = [
            `${user} drank **${item.name}**`,
            `${user} sipped **${item.name}**`,
            `${user} chugged **${item.name}**`,
            `${user} gulped down **${item.name}**`,
            `${user} enjoyed **${item.name}**`,
            `${user} consumed **${item.name}**`,
            `${user} downed **${item.name}**`,
            `${user} quaffed **${item.name}**`
        ];
        
        const genericMessages = [
            `${user} consumed **${item.name}**`,
            `${user} used **${item.name}**`,
            `${user} ingested **${item.name}**`
        ];
        
        // Select appropriate message based on subtype
        let messageArray;
        if (item.subtype === 'food') {
            messageArray = foodMessages;
        } else if (item.subtype === 'drink') {
            messageArray = drinkMessages;
        } else {
            messageArray = genericMessages;
        }
        
        // Send a short public message about the consumption as the main reply
        let publicMessage = messageArray[Math.floor(Math.random() * messageArray.length)];
        if (item.abilities && item.abilities.length > 0) {
            const abilityList = item.abilities.map(ability => {
                const sign = ability.powerlevel >= 0 ? '+' : '';
                return `${ability.name.charAt(0).toUpperCase() + ability.name.slice(1)} ${sign}${ability.powerlevel}`;
            }).join(', ');
            publicMessage += ` • ${abilityList}`;
        }
        if (item.duration) {
            publicMessage += ` (${item.duration}m)`;
        }
        // Add emoji based on subtype with variety
        const gulletEmojis = ['🤢', '😵', '🤮', '😷', '🥴', '😰'];
        const foodEmojis = isGulletFood ? gulletEmojis : ['🍖', '🍗', '🍕', '🥘', '🍲', '🍱', '🍞', '🧀'];
        const drinkEmojis = ['🍺', '🍷', '🥤', '🍹', '☕', '🥃', '🍶', '🧃'];
        const genericEmojis = ['✨', '💫', '⭐', '🌟'];
        
        let emojiArray;
        if (item.subtype === 'food') {
            emojiArray = foodEmojis;
        } else if (item.subtype === 'drink') {
            emojiArray = drinkEmojis;
        } else {
            emojiArray = genericEmojis;
        }
        
        publicMessage += `! ${emojiArray[Math.floor(Math.random() * emojiArray.length)]}`;
        
        // Send public message as the main interaction reply
        const replyMsg = await channel.send({ 
            content: publicMessage
        });
        // Register for auto-cleanup
        //await registerBotMessage(interaction.guild.id, interaction.channel.id, replyMsg.id, 5);
        
        // Send detailed info as ephemeral follow-up
        await interaction.editReply({ 
            embeds: [new EmbedBuilder()
                .setTitle(item.subtype === 'drink' ? '🍺 Drink Consumed' : item.subtype === 'food' ? '🍖 Food Consumed' : '✅ Item Consumed')
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
                   // Log the consumption for debugging
                console.log(`[CONSUME] ${userId} consumed item ${item.id} (${item.name})`);
        }
        

        // If this is a special consumable with additional effects, handle them
        else if (item.id === '13') { // Banana Axe special case
            // The Banana Axe is both a tool and consumable
            // It's a slippery, unreliable tool that can be eaten for power!
            // Varied messages for eating the Banana Axe
            const bananaMessages = [
                `🍌 *${user.username} takes a bite out of the Banana Axe! It's surprisingly nutritious and grants temporary mining power! The axe handle dissolves into sweet banana flavor...*`,
                `🍌 *${user.username} chomps down on the Banana Axe! The tropical flavor bursts with mining energy as the tool transforms into a delicious snack!*`,
                `🍌 *${user.username} devours the Banana Axe! Who knew tools could be so tasty? The banana essence floods them with mining prowess!*`,
                `🍌 *${user.username} munches on the Banana Axe! It's both a tool AND a meal - revolutionary! Sweet banana power courses through their veins!*`,
                `🍌 *${user.username} consumes the entire Banana Axe! The potassium-powered pickaxe melts into a burst of mining energy!*`
            ];
            
            const bananaMsg = await channel.send({
                content: bananaMessages[Math.floor(Math.random() * bananaMessages.length)],
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
                
                // Get all abilities for Banana Axe
                let abilityText = '';
                if (item.abilities && item.abilities.length > 0) {
                    const abilityList = item.abilities.map(ability => {
                        const sign = ability.powerlevel >= 0 ? '+' : '';
                        return `${ability.name.charAt(0).toUpperCase() + ability.name.slice(1)} ${sign}${ability.powerlevel}`;
                    }).join(', ');
                    abilityText = abilityList;
                } else {
                    // Fallback if no abilities defined
                    abilityText = 'Mining +2';
                }
                
                const buffMsg = await channel.send({
                    content: `⛏️ **Banana Power Active!** ${abilityText} for ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}! 🍌`,
                    ephemeral: false
                });
                // Register for auto-cleanup (5 minute expiry)
                await registerBotMessage(channel.guild.id, channel.id, buffMsg.id, 5);
            } catch (buffError) {
                console.error('[CONSUME] Failed to apply Banana Axe buff:', buffError);
            }
            return; // Exit early for Banana Axe to prevent duplicate tool-consumable message
        }
        
        // Handle other tool-consumables (excluding Banana Axe which is already handled)
        if (item.type === 'tool' && item.script === 'consume' && item.id !== '13') {
            // This is a tool that can be consumed
            description += '\n\n⚠️ *You consumed a tool! Hope it was worth it!*';
            
            // Send short public message for tool consumption
            let toolMessage = `${user} consumed their **${item.name}** (tool)`;
            if (item.abilities && item.abilities.length > 0) {
                const abilityList = item.abilities.map(ability => {
                    const sign = ability.powerlevel >= 0 ? '+' : '';
                    return `${ability.name.charAt(0).toUpperCase() + ability.name.slice(1)} ${sign}${ability.powerlevel}`;
                }).join(', ');
                toolMessage += ` • ${abilityList}`;
            }
            if (item.duration) {
            toolMessage += ` (${item.duration}m)`;
            }
            toolMessage += `! 🔧💥`;
            
            // Send public message as the main interaction reply
            const toolReplyMsg = await channel.send({
            content: toolMessage
            });
            // Register for auto-cleanup
            await registerBotMessage(interaction.guild.id, interaction.channel.id, toolReplyMsg.id, 5);
            
            // Send private embed as follow-up for tool consumption
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

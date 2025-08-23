// special.js - Script for special/unique item effects
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Special script for items with unique effects
 * This script is called when an item with script: "special" is used
 * 
 * @param {Object} context - The context object containing all necessary data
 */
module.exports = {
    execute: async (context) => {
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
            client,
            PlayerInventory,
            itemMap
        } = context;

        try {
            // Handle different special items by their ID
            switch(item.id) {
                case 'mystery_box':
                    await handleMysteryBox(context);
                    break;
                    
                case 'teleport_scroll':
                    await handleTeleportScroll(context);
                    break;
                    
                case 'summon_pet':
                    await handleSummonPet(context);
                    break;
                    
                case 'transform_potion':
                    await handleTransformPotion(context);
                    break;
                    
                default:
                    // Generic special effect
                    await handleGenericSpecial(context);
                    break;
            }

        } catch (error) {
            console.error('[SPECIAL] Error:', error);
            throw error;
        }
    }
};

// Mystery Box - gives random items
async function handleMysteryBox(context) {
    const { user, item, consumeItem, sendEmbed, PlayerInventory, itemMap } = context;
    
    // Consume the mystery box
    const remainingQuantity = await consumeItem(1);
    
    // Define possible rewards (you can customize this)
    const possibleRewards = [
        { itemId: '1', quantity: 5, chance: 30 },   // Coal Ore x5
        { itemId: '21', quantity: 3, chance: 25 },  // Copper Ore x3
        { itemId: '22', quantity: 2, chance: 20 },  // Iron Ore x2
        { itemId: '2', quantity: 1, chance: 15 },   // Topaz x1
        { itemId: '6', quantity: 1, chance: 8 },    // Diamond x1
        { itemId: '4', quantity: 10, chance: 2 }    // Mining Bun x10
    ];
    
    // Roll for reward
    const roll = Math.random() * 100;
    let cumulativeChance = 0;
    let reward = null;
    
    for (const possibleReward of possibleRewards) {
        cumulativeChance += possibleReward.chance;
        if (roll <= cumulativeChance) {
            reward = possibleReward;
            break;
        }
    }
    
    // Default reward if nothing was selected
    if (!reward) {
        reward = possibleRewards[0];
    }
    
    // Get reward item data
    const rewardItem = itemMap.get(reward.itemId);
    if (!rewardItem) {
        throw new Error('Reward item not found!');
    }
    
    // Add reward to user's inventory
    const playerInv = await PlayerInventory.findOne({ playerId: context.userId });
    const existingItem = playerInv.items.find(i => i.itemId === reward.itemId);
    
    if (existingItem) {
        existingItem.quantity += reward.quantity;
    } else {
        playerInv.items.push({
            itemId: reward.itemId,
            quantity: reward.quantity
        });
    }
    
    playerInv.markModified('items');
    await playerInv.save();
    
    // Send success message
    await sendEmbed({
        title: '🎁 Mystery Box Opened!',
        description: [
            `**${user.username}** opened a **${item.name}**!`,
            '',
            '✨ **You received:**',
            `${getItemEmoji(rewardItem.type)} **${reward.quantity}x ${rewardItem.name}**`,
            rewardItem.description ? `*${rewardItem.description}*` : '',
            '',
            `📦 **Mystery Boxes Remaining:** ${remainingQuantity}`
        ].filter(Boolean).join('\n'),
        color: 0x9B59B6,
        thumbnail: 'https://example.com/images/mystery_box.png',
        fields: [
            {
                name: '💰 Item Value',
                value: `${rewardItem.value * reward.quantity} coins`,
                inline: true
            },
            {
                name: '🎲 Rarity',
                value: getRarityText(reward.chance),
                inline: true
            }
        ]
    });
}

// Teleport Scroll - teleports user to a random voice channel
async function handleTeleportScroll(context) {
    const { interaction, member, guild, user, item, consumeItem, sendEmbed } = context;
    
    // Check if user is in a voice channel
    if (!member.voice.channel) {
        throw new Error('You must be in a voice channel to use a teleport scroll!');
    }
    
    // Get all voice channels the user can access
    const voiceChannels = guild.channels.cache.filter(ch => 
        ch.type === 2 && // Voice channel
        ch.id !== member.voice.channel.id && // Not current channel
        ch.permissionsFor(member).has('Connect') // User can connect
    );
    
    if (voiceChannels.size === 0) {
        throw new Error('No available channels to teleport to!');
    }
    
    // Select random channel
    const randomChannel = voiceChannels.random();
    
    // Consume the scroll
    const remainingQuantity = await consumeItem(1);
    
    // Move the user
    await member.voice.setChannel(randomChannel);
    
    // Send success message
    await sendEmbed({
        title: '🌀 Teleported!',
        description: [
            `**${user.username}** used a **${item.name}**!`,
            '',
            `📍 **Teleported to:** ${randomChannel.name}`,
            `📦 **Scrolls Remaining:** ${remainingQuantity}`
        ].join('\n'),
        color: 0x00CED1,
        footer: { text: 'Whoosh!' }
    });
}

// Summon Pet - creates a temporary pet/companion
async function handleSummonPet(context) {
    const { channel, user, item, consumeItem, sendEmbed, client } = context;
    
    // Consume the item
    const remainingQuantity = await consumeItem(1);
    
    // Pet types
    const pets = [
        { name: 'Fluffy Cat', emoji: '🐱', duration: 300 },
        { name: 'Loyal Dog', emoji: '🐕', duration: 300 },
        { name: 'Wise Owl', emoji: '🦉', duration: 300 },
        { name: 'Mystic Dragon', emoji: '🐉', duration: 600 }
    ];
    
    const pet = pets[Math.floor(Math.random() * pets.length)];
    
    // Store pet data (in real implementation, save to database)
    if (!client.activePets) client.activePets = new Map();
    client.activePets.set(context.userId, {
        ...pet,
        summonTime: Date.now(),
        endTime: Date.now() + (pet.duration * 1000)
    });
    
    // Schedule pet dismissal
    setTimeout(() => {
        client.activePets.delete(context.userId);
        channel.send({
            content: `${pet.emoji} **${user.username}'s ${pet.name}** has returned to its realm.`,
            allowedMentions: { users: [] }
        }).catch(console.error);
    }, pet.duration * 1000);
    
    // Send success message
    await sendEmbed({
        title: `${pet.emoji} Pet Summoned!`,
        description: [
            `**${user.username}** summoned a **${pet.name}**!`,
            '',
            `Your loyal companion will stay with you for **${pet.duration / 60} minutes**.`,
            '',
            `📦 **Summon Items Remaining:** ${remainingQuantity}`
        ].join('\n'),
        color: 0xFF69B4,
        footer: { text: `${pet.name} is happy to see you!` }
    });
}

// Transform Potion - temporarily changes user's nickname
async function handleTransformPotion(context) {
    const { interaction, member, user, item, consumeItem, sendEmbed } = context;
    
    // Consume the potion
    const remainingQuantity = await consumeItem(1);
    
    // Transformation options
    const transformations = [
        { prefix: '🐺 Werewolf', color: 0x8B4513 },
        { prefix: '🧙 Wizard', color: 0x9B59B6 },
        { prefix: '🦇 Vampire', color: 0x8B0000 },
        { prefix: '🧚 Fairy', color: 0xFF69B4 },
        { prefix: '🤖 Robot', color: 0x708090 },
        { prefix: '👻 Ghost', color: 0xF8F8FF }
    ];
    
    const transform = transformations[Math.floor(Math.random() * transformations.length)];
    const duration = 600; // 10 minutes
    
    // Store original nickname
    const originalNickname = member.nickname || user.username;
    
    // Apply transformation (change nickname)
    try {
        await member.setNickname(`${transform.prefix} ${originalNickname}`.substring(0, 32));
    } catch (error) {
        console.error('Failed to change nickname:', error);
        // Continue even if nickname change fails
    }
    
    // Schedule reversal
    setTimeout(async () => {
        try {
            await member.setNickname(originalNickname);
        } catch (error) {
            console.error('Failed to restore nickname:', error);
        }
        
        await interaction.channel.send({
            content: `✨ **${user.username}'s** transformation has worn off!`,
            allowedMentions: { users: [] }
        }).catch(console.error);
    }, duration * 1000);
    
    // Send success message
    await sendEmbed({
        title: '✨ Transformed!',
        description: [
            `**${user.username}** drank a **${item.name}**!`,
            '',
            `You have been transformed into a **${transform.prefix}**!`,
            `This effect will last for **${duration / 60} minutes**.`,
            '',
            `📦 **Potions Remaining:** ${remainingQuantity}`
        ].join('\n'),
        color: transform.color,
        footer: { text: 'Feel the power of transformation!' }
    });
}

// Generic special effect
async function handleGenericSpecial(context) {
    const { user, item, consumeItem, sendEmbed } = context;
    
    // Consume the item
    const remainingQuantity = await consumeItem(1);
    
    // Random special effects descriptions
    const effects = [
        '✨ Sparkles fill the air around you!',
        '🌟 A bright light emanates from your position!',
        '🎆 Colorful fireworks explode above!',
        '🌈 A rainbow appears overhead!',
        '💫 Stardust swirls around you!',
        '🔮 Mystical energy surges through the area!'
    ];
    
    const effect = effects[Math.floor(Math.random() * effects.length)];
    
    // Send success message
    await sendEmbed({
        title: '⭐ Special Item Used!',
        description: [
            `**${user.username}** used **${item.name}**!`,
            '',
            effect,
            '',
            item.description ? `*${item.description}*` : '',
            '',
            `📦 **Items Remaining:** ${remainingQuantity}`
        ].filter(Boolean).join('\n'),
        color: 0xFFD700,
        footer: { text: 'Something special happened!' }
    });
}

// Helper functions
function getItemEmoji(type) {
    const emojis = {
        'mineLoot': '⛏️',
        'tool': '🔧',
        'consumable': '🍖',
        'equipment': '⚔️',
        'charm': '🔮',
        'material': '📦'
    };
    return emojis[type] || '📦';
}

function getRarityText(chance) {
    if (chance <= 5) return '🌟 Legendary';
    if (chance <= 10) return '💎 Epic';
    if (chance <= 20) return '💜 Rare';
    if (chance <= 40) return '🔵 Uncommon';
    return '⚪ Common';
}

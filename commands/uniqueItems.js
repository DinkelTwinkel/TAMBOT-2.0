// commands/uniqueItems.js
// Discord slash commands for unique items system

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { 
    getPlayerUniqueItems,
    getGlobalUniqueItemStats,
    transferUniqueItem
} = require('../patterns/uniqueItemFinding');
const { 
    performMaintenance,
    checkMaintenanceStatus
} = require('../patterns/uniqueItemMaintenance');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');
const UniqueItem = require('../models/uniqueItems');
const Money = require('../models/currency');
const { checkRichestPlayer, getMidasLuckMultiplier } = require('../patterns/conditionalUniqueItems');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unique')
        .setDescription('Manage your unique legendary items')
        .addSubcommand(subcommand =>
            subcommand
                .setName('inventory')
                .setDescription('View your unique items'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('maintain')
                .setDescription('Perform maintenance on a unique item')
                .addIntegerOption(option =>
                    option.setName('item_id')
                        .setDescription('The ID of the item to maintain')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check maintenance status of your unique items'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('global')
                .setDescription('View global unique item statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Get detailed info about a unique item')
                .addIntegerOption(option =>
                    option.setName('item_id')
                        .setDescription('The ID of the item to inspect')
                        .setRequired(true))),
                        
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        
        switch (subcommand) {
            case 'inventory':
                await handleInventory(interaction, userId);
                break;
            case 'maintain':
                await handleMaintain(interaction, userId, userTag);
                break;
            case 'status':
                await handleStatus(interaction, userId);
                break;
            case 'global':
                await handleGlobal(interaction);
                break;
            case 'info':
                await handleInfo(interaction);
                break;
        }
    }
};

async function handleInventory(interaction, userId) {
    await interaction.deferReply();
    
    const items = await getPlayerUniqueItems(userId);
    
    if (items.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📦 Your Unique Items')
            .setDescription('You don\'t own any unique legendary items yet!\n\nFind them while mining in high-level expeditions!')
            .setColor(0x808080)
            .setTimestamp();
            
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🌟 Your Legendary Collection')
        .setDescription(`You own **${items.length}** unique legendary items!`)
        .setColor(0xFFD700)
        .setTimestamp();
    
    for (const item of items) {
        const maintenanceBar = createMaintenanceBar(item.maintenanceLevel);
        
        let fieldValue = `*${item.description}*\n`;
        fieldValue += `**Type:** ${item.type} | **Slot:** ${item.slot}\n`;
        fieldValue += `**Maintenance:** ${maintenanceBar} (${item.maintenanceLevel}/10)\n`;
        
        // Special handling for Midas' Burden
        if (item.id === 10) {
            const currentMultiplier = getMidasLuckMultiplier();
            fieldValue += `**🎲 Current Luck:** ${currentMultiplier === 0 ? '💀 CURSED (0x)' : '🌟 BLESSED (100x)'}\n`;
        }
        
        fieldValue += `**Abilities:**\n`;
        
        for (const ability of item.abilities) {
            const symbol = ability.powerlevel > 0 ? '➕' : '➖';
            let abilityText = `${symbol} ${ability.name}: ${ability.powerlevel}`;
            if (item.id === 10 && ability.name === 'luck') {
                abilityText += ' (randomly 0x or 100x)';
            }
            fieldValue += `${abilityText}\n`;
        }
        
        if (item.specialEffects && item.specialEffects.length > 0) {
            fieldValue += `**Special Effects:**\n`;
            for (const effect of item.specialEffects) {
                fieldValue += `✨ ${effect}\n`;
            }
        }
        
        embed.addFields({
            name: `${getItemEmoji(item)} [ID: ${item.id}] ${item.name}`,
            value: fieldValue.substring(0, 1024),
            inline: false
        });
    }
    
    return interaction.editReply({ embeds: [embed] });
}

async function handleMaintain(interaction, userId, userTag) {
    const itemId = interaction.options.getInteger('item_id');
    
    await interaction.deferReply();
    
    // Check if item exists before trying to maintain it
    const itemData = getUniqueItemById(itemId);
    if (!itemData) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Invalid Item')
            .setDescription(`Item with ID ${itemId} does not exist!\nUse \`/unique inventory\` to see your items.`)
            .setColor(0xFF0000)
            .setTimestamp();
            
        return interaction.editReply({ embeds: [embed] });
    }
    
    try {
        const result = await performMaintenance(userId, userTag, itemId);
        
        if (result.success) {
            const maintenanceBar = createMaintenanceBar(result.newMaintenanceLevel);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Maintenance Successful!')
                .setDescription(`**${itemData.name}** has been maintained!`)
                .addFields(
                    { name: 'Maintenance Level', value: `${maintenanceBar} (${result.newMaintenanceLevel}/10)`, inline: false },
                    { name: 'Status', value: result.message, inline: false }
                )
                .setColor(0x00FF00)
                .setTimestamp();
                
            return interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Maintenance Failed')
            .setDescription(error.message)
            .setColor(0xFF0000)
            .setTimestamp();
            
        return interaction.editReply({ embeds: [embed] });
    }
}

async function handleStatus(interaction, userId) {
    await interaction.deferReply();
    
    const statuses = await checkMaintenanceStatus(userId);
    
    if (statuses.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📊 Maintenance Status')
            .setDescription('You don\'t own any unique items!')
            .setColor(0x808080)
            .setTimestamp();
            
        return interaction.editReply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🔧 Unique Items Maintenance Status')
        .setDescription('Keep your legendary items maintained or lose them!')
        .setColor(0x0099FF)
        .setTimestamp();
    
    // Check if user is richest (for Midas' Burden)
    let isRichest = false;
    if (interaction.guild) {
        const guildMembers = await interaction.guild.members.fetch();
        const memberIds = guildMembers.map(member => member.id);
        isRichest = await checkRichestPlayer(userId, interaction.guild.id, memberIds);
    }
    
    for (const status of statuses) {
        const maintenanceBar = createMaintenanceBar(status.maintenanceLevel);
        const urgency = getMaintenanceUrgency(status.maintenanceLevel);
        
        let fieldValue = `${urgency} **Maintenance:** ${maintenanceBar} (${status.maintenanceLevel}/10)\n`;
        
        if (status.requiresMaintenance) {
            // Special handling for Midas' Burden
            if (status.itemId === 10) {
                fieldValue += `**Type:** ${formatMaintenanceType(status.maintenanceType)}\n`;
                fieldValue += `**Status:** ${isRichest ? '✅ You are the wealthiest!' : '⚠️ Someone is wealthier than you!'}\n`;
                if (!isRichest) {
                    fieldValue += `**Warning:** Maintenance decaying! Regain your wealth or lose the burden!\n`;
                }
            } else {
                fieldValue += `**Type:** ${formatMaintenanceType(status.maintenanceType)}\n`;
                fieldValue += `**Requirement:** ${formatMaintenanceCost(status.maintenanceType, status.maintenanceCost)}\n`;
                
                if (status.maintenanceType !== 'coins' && status.maintenanceType !== 'wealthiest') {
                    fieldValue += `**Progress:** ${formatProgress(status.maintenanceType, status.activityProgress, status.maintenanceCost)}\n`;
                }
            }
            
            fieldValue += `*${status.description}*\n`;
        } else {
            fieldValue += `*This item doesn't require maintenance!*\n`;
        }
        
        embed.addFields({
            name: `${getItemEmoji({ id: status.itemId })} [ID: ${status.itemId}] ${status.name}`,
            value: fieldValue.substring(0, 1024),
            inline: false
        });
    }
    
    embed.setFooter({ text: 'Use /unique maintain item_id:<ID> to maintain | Maintenance decreases by 1 level every 24 hours!' });
    
    return interaction.editReply({ embeds: [embed] });
}

async function handleGlobal(interaction) {
    await interaction.deferReply();
    
    const stats = await getGlobalUniqueItemStats();
    
    if (!stats) {
        return interaction.editReply('Failed to retrieve global statistics.');
    }
    
    const embed = new EmbedBuilder()
        .setTitle('⚖ Known Unique Items')
        .setColor(0x9B59B6);
    
    // Check for Midas' Burden specifically
    const midasBurden = await UniqueItem.findOne({ itemId: 10 });
    let richestInfo = null;
    if (interaction.guild) {
        const guildMembers = await interaction.guild.members.fetch();
        const memberIds = guildMembers.map(member => member.id);
        const allMoney = await Money.find({ userId: { $in: memberIds } }).sort({ money: -1 }).limit(1);
        if (allMoney.length > 0) {
            richestInfo = allMoney[0];
        }
    }
    
    // List all items with their current status
    if (stats.items.length > 0) {
        const itemsText = stats.items
            .slice(0, 15)
            .map(item => {
                let text = '';
                if (item.name === "Midas' Burden") {
                    // Special display for Midas' Burden
                    text = `👑 **${item.name}**: `;
                    if (item.owner && item.owner !== 'Unowned') {
                        text += `${item.owner} (Maint: ${item.maintenanceLevel}/10)`;
                        if (richestInfo && midasBurden && midasBurden.ownerId !== richestInfo.userId) {
                            text += ' ⚠️';
                        }
                    } else if (richestInfo) {
                        text += `*Awaiting the wealthiest soul*`;
                        //text += `*Awaiting the wealthiest (${richestInfo.money.toLocaleString()} coins needed)*`;
                    } else {
                        text += `*Awaiting the wealthiest soul*`;
                    }
                } else if (item.owner && item.owner !== 'Unowned') {
                    text = `**${item.name}**: ${item.owner} (Maint: ${item.maintenanceLevel}/10)`;
                } else {
                    text = `**${item.name}**: Undiscovered`;
                }
                return text;
            })
            .join('\n');
            
        embed.addFields({
            name: '🌟 Legendary Artifacts',
            value: itemsText.substring(0, 1024),
            inline: false
        });
    }
    
    embed.setFooter({ text: 'Legendary loot awaits brave adventurers who dare to delve deep...' });
    
    return interaction.editReply({ embeds: [embed] });
}

async function handleInfo(interaction) {
    const itemId = interaction.options.getInteger('item_id');
    
    const itemData = getUniqueItemById(itemId);
    
    if (!itemData) {
        return interaction.reply({ 
            content: 'Invalid item ID! Use `/unique global` to see all items.',
            ephemeral: true 
        });
    }
    
    // Format rarity tag
    const rarityTag = `『 ${itemData.rarity.toUpperCase()} 』`;
    
    // Combine description and lore for the embed description
    const storyText = '```' + `${itemData.description} ${itemData.lore}` + '```';
    
    const embed = new EmbedBuilder()
        .setTitle(`${getItemEmoji(itemData)} ${itemData.name} ${rarityTag}`)
        .setDescription(storyText)
        .setColor(getColorForRarity(itemData.rarity));
    
    // Special info for Midas' Burden
    if (itemId === 10) {
        const midasBurden = await UniqueItem.findOne({ itemId: 10 });
        if (midasBurden && midasBurden.ownerId) {
            embed.addFields({
                name: '👑 Current Bearer',
                value: `${midasBurden.ownerTag} (Maintenance: ${midasBurden.maintenanceLevel}/10)`,
                inline: false
            });
        }
        
        // embed.addFields({
        //     name: '⚡ Unique Mechanics',
        //     value: [
        //         '• Luck randomly becomes 0x or 100x each calculation',
        //         '• Can only be owned by the wealthiest player',
        //         '• Transfers automatically when someone becomes richer',
        //         '• Maintenance decays only when not the richest'
        //     ].join('\n'),
        //     inline: false
        // });
    }
    
    // Add rumored effects if they exist
    if (itemData.rumoredEffects && itemData.rumoredEffects.length > 0) {
        const rumoredEffectsList = itemData.rumoredEffects.map(effect => `• ${effect}`).join('\n');
        embed.addFields({ 
            name: '✨ Rumored Effects', 
            value: rumoredEffectsList, 
            inline: false 
        });
    }
    
    // Set maintenance info in footer
    let footerText = '';
    if (itemData.requiresMaintenance) {
        let maintType = 'Unknown ritual';
        switch(itemData.maintenanceType) {
            case 'coins': maintType = 'Requires wealth offerings'; break;
            case 'mining_activity': maintType = 'Fed by earth\'s destruction'; break;
            case 'voice_activity': maintType = 'Sustained by spoken words'; break;
            case 'combat_activity': maintType = 'Thirsts for battle'; break;
            case 'social_activity': maintType = 'Craves interaction'; break;
        }
        footerText = `Maintenance: ${maintType}`;
    } else {
        footerText = 'This artifact requires no earthly maintenance';
    }
    
    embed.setFooter({ text: footerText });
    
    return interaction.reply({ embeds: [embed] });
}

// Helper functions
function createMaintenanceBar(level) {
    const filled = '█';
    const empty = '░';
    const bar = filled.repeat(level) + empty.repeat(10 - level);
    return `[${bar}]`;
}

function getMaintenanceUrgency(level) {
    if (level <= 2) return '🔴';
    if (level <= 5) return '🟡';
    return '🟢';
}

function formatMaintenanceType(type) {
    const types = {
        'coins': '💰 Coins',
        'mining_activity': '⛏️ Mining Activity',
        'voice_activity': '🎤 Voice Activity',
        'combat_activity': '⚔️ Combat Activity',
        'social_activity': '💬 Social Activity',
        'wealthiest': '👑 Wealthiest Player'
    };
    return types[type] || type;
}

function formatMaintenanceCost(type, cost) {
    const formats = {
        'coins': `${cost.toLocaleString()} coins`,
        'mining_activity': `Mine ${cost} blocks`,
        'voice_activity': `${cost} minutes in voice`,
        'combat_activity': `Win ${cost} battles`,
        'social_activity': `${cost} interactions`,
        'wealthiest': `Be the richest player in the guild`
    };
    return formats[type] || `${cost}`;
}

function formatProgress(type, progress, requirement) {
    const progressMap = {
        'mining_activity': `${progress.mining}/${requirement} blocks`,
        'voice_activity': `${progress.voice}/${requirement} minutes`,
        'combat_activity': `${progress.combat}/${requirement} wins`,
        'social_activity': `${progress.social}/${requirement} interactions`
    };
    return progressMap[type] || 'N/A';
}

function getItemEmoji(item) {
    const emojis = {
        'tool': '⚒️',
        'equipment': '🛡️',
        'charm': '🔮',
        'weapon': '⚔️'
    };
    return emojis[item.type] || '💎';
}

function getColorForRarity(rarity) {
    const colors = {
        'mythic': 0xFFFFFF,    // Pure white for mythic
        'legendary': 0xFFD700,
        'epic': 0x9B59B6,
        'rare': 0x3498DB,
        'uncommon': 0x2ECC71,
        'common': 0x95A5A6
    };
    return colors[rarity] || 0x000000;
}

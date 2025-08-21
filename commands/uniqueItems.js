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
        fieldValue += `**Abilities:**\n`;
        
        for (const ability of item.abilities) {
            const symbol = ability.powerlevel > 0 ? '➕' : '➖';
            fieldValue += `${symbol} ${ability.name}: ${ability.powerlevel}\n`;
        }
        
        if (item.specialEffects && item.specialEffects.length > 0) {
            fieldValue += `**Special Effects:**\n`;
            for (const effect of item.specialEffects) {
                fieldValue += `✨ ${effect}\n`;
            }
        }
        
        embed.addFields({
            name: `${getItemEmoji(item)} ${item.name}`,
            value: fieldValue.substring(0, 1024),
            inline: false
        });
    }
    
    return interaction.editReply({ embeds: [embed] });
}

async function handleMaintain(interaction, userId, userTag) {
    const itemId = interaction.options.getInteger('item_id');
    
    await interaction.deferReply();
    
    try {
        const result = await performMaintenance(userId, userTag, itemId);
        
        if (result.success) {
            const itemData = getUniqueItemById(itemId);
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
    
    for (const status of statuses) {
        const maintenanceBar = createMaintenanceBar(status.maintenanceLevel);
        const urgency = getMaintenanceUrgency(status.maintenanceLevel);
        
        let fieldValue = `${urgency} **Maintenance:** ${maintenanceBar} (${status.maintenanceLevel}/10)\n`;
        
        if (status.requiresMaintenance) {
            fieldValue += `**Type:** ${formatMaintenanceType(status.maintenanceType)}\n`;
            fieldValue += `**Requirement:** ${formatMaintenanceCost(status.maintenanceType, status.maintenanceCost)}\n`;
            
            if (status.maintenanceType !== 'coins') {
                fieldValue += `**Progress:** ${formatProgress(status.maintenanceType, status.activityProgress, status.maintenanceCost)}\n`;
            }
            
            fieldValue += `*${status.description}*\n`;
        } else {
            fieldValue += `*This item doesn't require maintenance!*\n`;
        }
        
        embed.addFields({
            name: `${getItemEmoji({ id: status.itemId })} ${status.name}`,
            value: fieldValue.substring(0, 1024),
            inline: false
        });
    }
    
    embed.setFooter({ text: 'Maintenance decreases by 1 level every 24 hours!' });
    
    return interaction.editReply({ embeds: [embed] });
}

async function handleGlobal(interaction) {
    await interaction.deferReply();
    
    const stats = await getGlobalUniqueItemStats();
    
    if (!stats) {
        return interaction.editReply('Failed to retrieve global statistics.');
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🌍 Global Unique Items Statistics')
        .setDescription(`Tracking **${stats.totalItems}** legendary items across all players`)
        .addFields(
            { name: '📊 Overview', value: `Owned: **${stats.ownedItems}**\nAvailable: **${stats.unownedItems}**`, inline: true },
            { name: '🏆 Most Found', value: stats.mostFound ? `**${stats.mostFound.name}**\nFound ${stats.mostFound.timesFound} times` : 'None yet', inline: true },
            { name: '💔 Most Lost', value: stats.mostLost ? `**${stats.mostLost.name}**\nLost ${stats.mostLost.timesLost} times` : 'None yet', inline: true }
        )
        .setColor(0x9B59B6)
        .setTimestamp();
    
    // Add current owners
    if (stats.items.length > 0) {
        const ownersText = stats.items
            .slice(0, 10)
            .map(item => `**${item.name}**: ${item.owner} (Maint: ${item.maintenanceLevel}/10)`)
            .join('\n');
            
        embed.addFields({
            name: '👑 Current Owners',
            value: ownersText.substring(0, 1024),
            inline: false
        });
    }
    
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
    
    const embed = new EmbedBuilder()
        .setTitle(`${getItemEmoji(itemData)} ${itemData.name}`)
        .setDescription(`*${itemData.description}*`)
        .addFields(
            { name: '📜 Lore', value: itemData.lore, inline: false },
            { name: '⚙️ Type', value: `${itemData.type} (${itemData.slot})`, inline: true },
            { name: '💎 Rarity', value: itemData.rarity, inline: true },
            { name: '💰 Value', value: itemData.value.toLocaleString(), inline: true }
        )
        .setColor(getColorForRarity(itemData.rarity))
        .setTimestamp();
    
    // Add abilities
    const abilitiesText = itemData.abilities
        .map(a => `${a.powerlevel > 0 ? '➕' : '➖'} **${a.name}**: ${a.powerlevel}`)
        .join('\n');
    embed.addFields({ name: '⚔️ Abilities', value: abilitiesText, inline: false });
    
    // Add special effects
    if (itemData.specialEffects && itemData.specialEffects.length > 0) {
        const effectsText = itemData.specialEffects.map(e => `✨ ${e}`).join('\n');
        embed.addFields({ name: '🌟 Special Effects', value: effectsText, inline: false });
    }
    
    // Add maintenance info
    if (itemData.requiresMaintenance) {
        embed.addFields({
            name: '🔧 Maintenance',
            value: `**Type:** ${formatMaintenanceType(itemData.maintenanceType)}\n` +
                   `**Cost:** ${formatMaintenanceCost(itemData.maintenanceType, itemData.maintenanceCost)}\n` +
                   `**Decay Rate:** ${itemData.maintenanceDecayRate} level(s) per day\n` +
                   `*${itemData.maintenanceDescription}*`,
            inline: false
        });
    }
    
    // Add requirements
    embed.addFields({
        name: '📋 Requirements',
        value: `**Min Power Level:** ${itemData.minPowerLevel}\n` +
               `**Drop Weight:** ${itemData.dropWeight} (lower = rarer)\n` +
               `**Durability:** ${itemData.baseDurability} (${Math.round(itemData.durabilityLossReduction * 100)}% damage reduction)`,
        inline: false
    });
    
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
        'social_activity': '💬 Social Activity'
    };
    return types[type] || type;
}

function formatMaintenanceCost(type, cost) {
    const formats = {
        'coins': `${cost.toLocaleString()} coins`,
        'mining_activity': `Mine ${cost} blocks`,
        'voice_activity': `${cost} minutes in voice`,
        'combat_activity': `Win ${cost} battles`,
        'social_activity': `${cost} interactions`
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
        'legendary': 0xFFD700,
        'epic': 0x9B59B6,
        'rare': 0x3498DB,
        'uncommon': 0x2ECC71,
        'common': 0x95A5A6
    };
    return colors[rarity] || 0x000000;
}

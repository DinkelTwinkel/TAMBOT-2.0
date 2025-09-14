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

// Helper function to get ore name by ID
function getOreNameById(oreId) {
    const itemSheet = require('../data/itemSheet.json');
    const oreItem = itemSheet.find(item => String(item.id) === String(oreId));
    return oreItem ? oreItem.name : `Ore #${oreId}`;
}

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
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('relinquish')
                .setDescription('Give up ownership of a unique item (permanent!)')
                .addIntegerOption(option =>
                    option.setName('item_id')
                        .setDescription('The ID of the item to relinquish')
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
            case 'relinquish':
                await handleRelinquish(interaction, userId, userTag);
                break;
        }
    }
};

async function handleInventory(interaction, userId) {
    await interaction.deferReply({ ephemeral: true });
    
    const items = await getPlayerUniqueItems(userId);
    
    if (items.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📦 Your Unique Items')
            .setDescription('You don\'t own any unique legendary items yet!\n\nFind them while mining in high-level expeditions!')
            .setColor(0x808080)
            .setTimestamp();
            
        return interaction.editReply({ embeds: [embed], ephemeral: true });
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
    
    embed.setFooter({ text: 'Use /unique maintain item_id:<ID> to perform maintenance' });
    
    return interaction.editReply({ embeds: [embed], ephemeral: true });
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
        const guildId = interaction.guild?.id || 'default';
        const result = await performMaintenance(userId, userTag, itemId, guildId);
        
        if (result.success) {
            // Special handling for Midas' Burden wealth gamble
            if (itemId === 10 && result.wealthChange && typeof result.wealthChange === 'object' && result.wealthChange.change !== undefined) {
                const wealthData = result.wealthChange;
                const maintenanceBar = createMaintenanceBar(result.newMaintenanceLevel);
                
                const embed = new EmbedBuilder()
                    .setTitle(wealthData.isBlessing ? '🌟 Midas\' Blessing!' : '💸 Midas\' Curse!')
                    .setDescription(`**${itemData.name}** maintenance triggers the ancient gamble...`)
                    .addFields(
                        { name: '🎲 Fortune\'s Gamble', value: wealthData.message, inline: false },
                        { 
                            name: wealthData.isBlessing ? '📈 Wealth Increased' : '📉 Wealth Decreased', 
                            value: `**${wealthData.percentage}%** ${wealthData.isBlessing ? 'bonus' : 'loss'}`, 
                            inline: true 
                        },
                        { 
                            name: '💰 Coin Change', 
                            value: `${wealthData.change > 0 ? '+' : ''}${wealthData.change.toLocaleString()} coins`, 
                            inline: true 
                        },
                        { 
                            name: '💎 New Balance', 
                            value: `${wealthData.afterAmount.toLocaleString()} coins`, 
                            inline: true 
                        },
                        { name: '🔧 Maintenance Level', value: `${maintenanceBar} (${result.newMaintenanceLevel}/10)`, inline: false }
                    )
                    .setColor(wealthData.isBlessing ? 0xFFD700 : 0x8B0000) // Gold for blessing, dark red for curse
                    .setFooter({ text: `Previous balance: ${wealthData.beforeAmount.toLocaleString()} coins` })
                    .setTimestamp();
                    
                return interaction.editReply({ embeds: [embed] });
            }
            
            // Regular maintenance embed for other items
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
    
    const guildId = interaction.guild?.id || 'default';
    const statuses = await checkMaintenanceStatus(userId, guildId);
    
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
                fieldValue += `**Requirement:** ${formatMaintenanceCost(status.maintenanceType, status.maintenanceCost, status.maintenanceOreType)}\n`;
                
                if (status.maintenanceType !== 'coins' && status.maintenanceType !== 'wealthiest') {
                    fieldValue += `**Progress:** ${formatProgress(status.maintenanceType, status.activityProgress, status.maintenanceCost, status.maintenanceOreType)}\n`;
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
    
    // Get all unique items from the sheet (complete list)
    const { UNIQUE_ITEMS } = require('../data/uniqueItemsSheet');
    
    // Get database items for ownership status
    const allDbItems = await UniqueItem.find({});
    const dbItemsMap = new Map();
    allDbItems.forEach(item => {
        dbItemsMap.set(item.itemId, item);
    });
    
    // Check for Midas' Burden specifically
    const midasBurden = dbItemsMap.get(10);
    let richestInfo = null;
    if (interaction.guild) {
        const guildMembers = await interaction.guild.members.fetch();
        const memberIds = guildMembers.map(member => member.id);
        const allMoney = await Money.find({ userId: { $in: memberIds } }).sort({ money: -1 }).limit(1);
        if (allMoney.length > 0) {
            richestInfo = allMoney[0];
        }
    }
    
    // Create complete item list with ownership status
    const allItems = UNIQUE_ITEMS.map(item => {
        const dbItem = dbItemsMap.get(item.id);
        let text = '';
        
        if (item.name === "🥇 Midas' Burden") {
            // Special display for Midas' Burden
            text = `👑 **[ID: ${item.id}] ${item.name}**: `;
            if (dbItem?.ownerId) {
                text += `${dbItem.ownerTag} (Maint: ${dbItem.maintenanceLevel}/10)`;
                if (richestInfo && midasBurden && midasBurden.ownerId !== richestInfo.userId) {
                    text += ' ⚠️';
                }
            } else if (richestInfo) {
                text += `*Awaiting the wealthiest soul*`;
            } else {
                text += `*Awaiting the wealthiest soul*`;
            }
        } else if (dbItem?.ownerId) {
            text = `**[ID: ${item.id}] ${item.name}**: ${dbItem.ownerTag} (Maint: ${dbItem.maintenanceLevel}/10)`;
        } else {
            text = `**[ID: ${item.id}] ${item.name}**: Undiscovered`;
        }
        
        return text;
    });
    
    // Pagination logic - 50 items per page
    const itemsPerPage = 50;
    const totalPages = Math.ceil(allItems.length / itemsPerPage);
    
    if (totalPages <= 1) {
        // Single page - use description
        const embed = new EmbedBuilder()
            .setTitle('⚖ All Unique Legendary Items')
            .setDescription(allItems.join('\n'))
            .setColor(0x9B59B6)
            .setFooter({ text: `Total: ${allItems.length} items | Use /unique info item_id:<ID> for details` });
            
        return interaction.editReply({ embeds: [embed] });
    } else {
        // Multiple pages - create pagination
        return await createPaginatedGlobalView(interaction, allItems, totalPages, itemsPerPage);
    }
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

async function handleRelinquish(interaction, userId, userTag) {
    const itemId = interaction.options.getInteger('item_id');
    
    await interaction.deferReply();
    
    try {
        // Find the unique item in the database
        const item = await UniqueItem.findOne({ itemId, ownerId: userId });
        
        if (!item) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Item Not Found')
                .setDescription(`You don't own a unique item with ID ${itemId}!\nUse \`/unique inventory\` to see your items.`)
                .setColor(0xFF0000)
                .setTimestamp();
                
            return interaction.editReply({ embeds: [embed] });
        }
        
        // Get item data for display
        const itemData = getUniqueItemById(itemId);
        if (!itemData) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Item')
                .setDescription(`Item data not found for ID ${itemId}!`)
                .setColor(0xFF0000)
                .setTimestamp();
                
            return interaction.editReply({ embeds: [embed] });
        }
        
        // Special handling for Midas' Burden - it can't be manually relinquished
        if (itemId === 10) {
            const embed = new EmbedBuilder()
                .setTitle('👑 Midas\' Burden Cannot Be Relinquished')
                .setDescription(`The golden weight of **${itemData.name}** cannot be willingly cast aside!\n\nThis legendary burden can only be lost through:\n• Falling from wealthiest status\n• Maintenance failure\n• Being surpassed by a richer soul`)
                .setColor(0xFFD700)
                .setTimestamp();
                
            return interaction.editReply({ embeds: [embed] });
        }
        
        // Create confirmation buttons
        const confirmButton = new ButtonBuilder()
            .setCustomId(`confirm_relinquish_${itemId}`)
            .setLabel('Yes, Relinquish Forever')
            .setStyle(ButtonStyle.Danger);
            
        const cancelButton = new ButtonBuilder()
            .setCustomId(`cancel_relinquish_${itemId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);
            
        const row = new ActionRowBuilder()
            .addComponents(confirmButton, cancelButton);
        
        const embed = new EmbedBuilder()
            .setTitle('⚠️ Confirm Relinquishment')
            .setDescription(`Are you sure you want to **permanently** give up **${itemData.name}**?\n\n${getItemEmoji(itemData)} *${itemData.description}*\n\n**This action cannot be undone!**\nThe item will become available for others to find.`)
            .addFields(
                { name: 'Current Maintenance', value: `${item.maintenanceLevel}/10`, inline: true },
                { name: 'Times Found', value: `${item.statistics?.timesFound || 0}`, inline: true }
            )
            .setColor(0xFF4444)
            .setTimestamp();
            
        const response = await interaction.editReply({ 
            embeds: [embed], 
            components: [row] 
        });
        
        // Wait for button interaction
        try {
            const confirmation = await response.awaitMessageComponent({ 
                filter: i => i.user.id === userId && (i.customId.startsWith('confirm_relinquish_') || i.customId.startsWith('cancel_relinquish_')),
                time: 30000 
            });
            
            if (confirmation.customId.startsWith('confirm_relinquish_')) {
                // Perform the relinquishment
                await relinquishUniqueItem(item, userId, userTag);
                
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Item Relinquished')
                    .setDescription(`You have permanently given up **${itemData.name}**.\n\nThe legendary artifact fades from your possession, returning to the realm of possibility for future adventurers to discover.`)
                    .setColor(0x808080)
                    .setTimestamp();
                    
                await confirmation.update({ embeds: [successEmbed], components: [] });
                
            } else {
                // Cancelled
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Relinquishment Cancelled')
                    .setDescription(`**${itemData.name}** remains in your possession.`)
                    .setColor(0x808080)
                    .setTimestamp();
                    
                await confirmation.update({ embeds: [cancelEmbed], components: [] });
            }
            
        } catch (error) {
            // Timeout
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Confirmation Timeout')
                .setDescription(`Relinquishment cancelled due to timeout. **${itemData.name}** remains in your possession.`)
                .setColor(0x808080)
                .setTimestamp();
                
            await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
        }
        
    } catch (error) {
        console.error('[UNIQUE RELINQUISH] Error:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('An error occurred while processing your request. Please try again.')
            .setColor(0xFF0000)
            .setTimestamp();
            
        return interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Relinquish a unique item - remove ownership and reset for rediscovery
 */
async function relinquishUniqueItem(item, userId, userTag) {
    // Add to previous owners history
    if (item.previousOwners) {
        item.previousOwners.push({
            userId: userId,
            userTag: userTag,
            acquiredDate: item.createdAt,
            lostDate: new Date(),
            lostReason: 'voluntary_relinquishment'
        });
    }
    
    // Update statistics
    if (item.statistics) {
        item.statistics.timesVoluntarilyRelinquished = (item.statistics.timesVoluntarilyRelinquished || 0) + 1;
    }
    
    // Remove current owner
    item.ownerId = null;
    item.ownerTag = null;
    
    // Reset maintenance for next owner
    item.maintenanceLevel = 10;
    item.nextMaintenanceCheck = null;
    
    // Reset activity tracking
    item.activityTracking = {
        miningBlocksThisCycle: 0,
        voiceMinutesThisCycle: 0,
        combatWinsThisCycle: 0,
        socialInteractionsThisCycle: 0,
        tilesMovedThisCycle: 0
    };
    
    await item.save();
    
    console.log(`[UNIQUE RELINQUISH] ${userTag} voluntarily relinquished item ${item.itemId}`);
}

/**
 * Create paginated view for global unique items list
 */
async function createPaginatedGlobalView(interaction, allItems, totalPages, itemsPerPage) {
    let currentPage = 0;
    
    // Create embed for current page
    function createPageEmbed(page) {
        const startIndex = page * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, allItems.length);
        const pageItems = allItems.slice(startIndex, endIndex);
        
        return new EmbedBuilder()
            .setTitle('⚖ All Unique Legendary Items')
            .setDescription(pageItems.join('\n'))
            .setColor(0x9B59B6)
            .setFooter({ 
                text: `Page ${page + 1}/${totalPages} | Items ${startIndex + 1}-${endIndex} of ${allItems.length} | Use /unique info item_id:<ID> for details` 
            });
    }
    
    // Create navigation buttons
    function createButtons(page) {
        const prevButton = new ButtonBuilder()
            .setCustomId('prev_page')
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0);
            
        const nextButton = new ButtonBuilder()
            .setCustomId('next_page')
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1);
            
        const pageInfo = new ButtonBuilder()
            .setCustomId('page_info')
            .setLabel(`${page + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);
            
        return new ActionRowBuilder()
            .addComponents(prevButton, pageInfo, nextButton);
    }
    
    // Send initial message
    const embed = createPageEmbed(currentPage);
    const row = createButtons(currentPage);
    
    const response = await interaction.editReply({
        embeds: [embed],
        components: [row]
    });
    
    // Create collector for button interactions
    const collector = response.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 300000 // 5 minutes
    });
    
    collector.on('collect', async i => {
        if (i.customId === 'prev_page' && currentPage > 0) {
            currentPage--;
        } else if (i.customId === 'next_page' && currentPage < totalPages - 1) {
            currentPage++;
        }
        
        const newEmbed = createPageEmbed(currentPage);
        const newRow = createButtons(currentPage);
        
        await i.update({
            embeds: [newEmbed],
            components: [newRow]
        });
    });
    
    collector.on('end', async () => {
        // Disable buttons when collector expires
        const disabledRow = new ActionRowBuilder()
            .addComponents(
                ButtonBuilder.from(row.components[0]).setDisabled(true),
                ButtonBuilder.from(row.components[1]).setDisabled(true),
                ButtonBuilder.from(row.components[2]).setDisabled(true)
            );
            
        try {
            await interaction.editReply({ components: [disabledRow] });
        } catch (error) {
            // Message might be deleted, ignore error
        }
    });
    
    return response;
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

function formatMaintenanceCost(type, cost, oreType = null) {
    if (type === 'mining_activity' && oreType) {
        // Get ore name for ore-specific requirements
        const oreName = getOreNameById(oreType);
        return `Mine ${cost} ${oreName}`;
    }
    
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

function formatProgress(type, progress, requirement, oreType = null) {
    if (type === 'mining_activity' && oreType) {
        // Get ore-specific progress from new GameStatTracker system
        const oresMined = progress.itemsFoundBySource?.mining?.[oreType] || 0;
        const oreName = getOreNameById(oreType);
        return `${oresMined}/${requirement} ${oreName}`;
    }
    
    const progressMap = {
        'mining_activity': `${progress.tilesMoved || 0}/${requirement} blocks`,
        'voice_activity': `${progress.voiceMinutes || 0}/${requirement} minutes`,
        'combat_activity': `${progress.combat || 0}/${requirement} wins`,
        'social_activity': `${progress.social || 0}/${requirement} interactions`,
        'movement_activity': `${progress.tilesMoved || 0}/${requirement} tiles`
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

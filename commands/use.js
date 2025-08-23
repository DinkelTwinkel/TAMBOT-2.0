const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const PlayerInventory = require('../models/inventory');
const itemSheet = require('../data/itemSheet.json');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

// Filter items that have scripts
const usableItems = itemSheet.filter(item => item.script);
const usableItemMap = new Map(usableItems.map(item => [item.id, item]));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('Use an item from your inventory'),

    async execute(interaction) {
        // Defer with ephemeral reply
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.user;

        // Get user's inventory
        const playerInv = await PlayerInventory.findOne({ playerId: user.id }).lean();
        if (!playerInv || playerInv.items.length === 0) {
            return interaction.editReply({
                content: '❌ You have no items in your inventory.',
                ephemeral: true
            });
        }

        // Filter inventory for items that have scripts
        const usableInventoryItems = [];
        for (const invItem of playerInv.items) {
            const itemData = usableItemMap.get(invItem.itemId);
            if (itemData && invItem.quantity > 0) {
                usableInventoryItems.push({
                    id: itemData.id,
                    name: itemData.name,
                    type: itemData.type,
                    description: itemData.description,
                    value: itemData.value,
                    script: itemData.script,
                    owned: invItem.quantity,
                    currentDurability: invItem.currentDurability,
                    maxDurability: itemData.durability,
                    duration: itemData.duration,
                    abilities: itemData.abilities
                });
            }
        }

        if (usableInventoryItems.length === 0) {
            return interaction.editReply({
                content: '❌ You have no usable items in your inventory.',
                ephemeral: true
            });
        }

        // Sort items by type, then by name for better organization
        usableInventoryItems.sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            return a.name.localeCompare(b.name);
        });

        // Pagination setup
        let currentPage = 0;
        const itemsPerPage = 25;
        const totalPages = Math.ceil(usableInventoryItems.length / itemsPerPage);

        // Send initial message
        const message = await interaction.editReply({
            embeds: [this.createUsableItemsEmbed(usableInventoryItems, currentPage, itemsPerPage, user, totalPages)],
            components: this.createComponents(usableInventoryItems, currentPage, itemsPerPage, totalPages, user.id, interaction.channelId),
            ephemeral: true
        });

        // Create collector for pagination buttons only
        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === user.id && i.customId.startsWith('use_page_'),
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'use_page_prev') {
                currentPage = Math.max(0, currentPage - 1);
            } else if (i.customId === 'use_page_next') {
                currentPage = Math.min(totalPages - 1, currentPage + 1);
            }

            await i.update({
                embeds: [this.createUsableItemsEmbed(usableInventoryItems, currentPage, itemsPerPage, user, totalPages)],
                components: this.createComponents(usableInventoryItems, currentPage, itemsPerPage, totalPages, user.id, interaction.channelId),
                ephemeral: true
            });
        });

        collector.on('end', () => {
            // Update the message to show it's expired
            interaction.editReply({
                content: '⏰ This use menu has expired. Use `/use` again to use items.',
                embeds: [],
                components: [],
                ephemeral: true
            }).catch(() => {}); // Ignore errors if message was deleted
        });
    },

    // Create embed showing usable items
    createUsableItemsEmbed(items, page, itemsPerPage, user, totalPages) {
        const start = page * itemsPerPage;
        const end = Math.min(start + itemsPerPage, items.length);
        const pageItems = items.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle('🎮 Use Items')
            .setDescription('Select an item to use from your inventory')
            .setColor(0x9B59B6)
            .setFooter({ text: `Page ${page + 1} of ${totalPages} • Total usable items: ${items.length}` })
            .setTimestamp();

        // Group items by type for better display
        const itemsByType = {};
        for (const item of pageItems) {
            if (!itemsByType[item.type]) {
                itemsByType[item.type] = [];
            }
            itemsByType[item.type].push(item);
        }

        // Add fields for each type
        for (const [type, typeItems] of Object.entries(itemsByType)) {
            const typeEmoji = this.getTypeEmoji(type);
            const itemList = typeItems.map(item => {
                let line = `• **${item.name}** (x${item.owned})`;
                
                // Add script type indicator
                line += ` [${item.script}]`;
                
                // Add value if exists
                if (item.value) {
                    line += ` - 💰${item.value}`;
                }
                
                // Add durability if exists
                if (item.maxDurability && item.currentDurability !== undefined) {
                    line += ` [${item.currentDurability}/${item.maxDurability}]`;
                }
                
                // Add duration if exists (for consumables)
                if (item.duration) {
                    line += ` ⏱️${item.duration}m`;
                }
                
                // Add abilities if exists
                if (item.abilities && item.abilities.length > 0) {
                    const abilityList = item.abilities.map(a => `${a.name}+${a.powerlevel}`).join(', ');
                    line += ` (${abilityList})`;
                }
                
                return line;
            }).join('\n');

            embed.addFields({
                name: `${typeEmoji} ${this.formatTypeName(type)}`,
                value: itemList || 'None',
                inline: false
            });
        }

        return embed;
    },

    createComponents(items, page, itemsPerPage, totalPages, userId, channelId) {
        const components = [];
        const start = page * itemsPerPage;
        const end = Math.min(start + itemsPerPage, items.length);
        const pageItems = items.slice(start, end);

        // Create select menu with items on current page
        const selectOptions = pageItems.map(item => {
            let label = `${item.name} (x${item.owned})`;
            if (label.length > 100) {
                label = label.substring(0, 97) + '...';
            }

            let description = `Use: ${item.script}`;
            if (item.description && item.description.length < 50) {
                description = item.description;
            }
            if (description.length > 100) {
                description = description.substring(0, 97) + '...';
            }

            // Create value with all necessary data encoded
            const value = `${userId}_${channelId}_${item.id}_${page}`;

            return {
                label: label,
                description: description,
                value: value,
                emoji: this.getTypeEmoji(item.type)
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`use_item_select`)
            .setPlaceholder('Select an item to use')
            .addOptions(selectOptions);

        components.push(new ActionRowBuilder().addComponents(selectMenu));

        // Add pagination buttons only if there are multiple pages
        if (totalPages > 1) {
            const buttons = [];

            // Previous button
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('use_page_prev')
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0)
            );

            // Page indicator button (disabled, just for display)
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('use_page_indicator')
                    .setLabel(`Page ${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

            // Next button
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('use_page_next')
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages - 1)
            );

            components.push(new ActionRowBuilder().addComponents(buttons));
        }

        return components;
    },

    getTypeEmoji(type) {
        const emojis = {
            'mineLoot': '⛏️',
            'tool': '🔧',
            'consumable': '🍖',
            'equipment': '⚔️',
            'charm': '🔮',
            'material': '📦',
            'quest': '📜',
            'special': '⭐'
        };
        return emojis[type] || '📦';
    },

    formatTypeName(type) {
        const names = {
            'mineLoot': 'Mining Loot',
            'tool': 'Tools',
            'consumable': 'Consumables',
            'equipment': 'Equipment',
            'charm': 'Charms',
            'material': 'Materials',
            'quest': 'Quest Items',
            'special': 'Special Items'
        };
        return names[type] || type.charAt(0).toUpperCase() + type.slice(1);
    }
};

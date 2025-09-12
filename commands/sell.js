const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const PlayerInventory = require('../models/inventory');
const ActiveShop = require('../models/activeShop');
const itemSheet = require('../data/itemSheet.json');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sell')
        .setDescription('Put items up for sale in the marketplace'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const seller = interaction.user;

        // Get seller's inventory
        const sellerInv = await PlayerInventory.findOne({ playerId: seller.id }).lean();
        if (!sellerInv || sellerInv.items.length === 0) {
            return interaction.editReply({
                content: '❌ You have no items in your inventory to sell.',
                ephemeral: true
            });
        }

        // Prepare items with full data (allow all items in player marketplace)
        const inventoryItems = [];
        for (const invItem of sellerInv.items) {
            const itemData = itemMap.get(invItem.itemId);
            if (itemData && invItem.quantity > 0) {
                // Allow all items in player marketplace (players can sell anything they own)
                inventoryItems.push({
                    id: itemData.id,
                    name: itemData.name,
                    type: itemData.type,
                    description: itemData.description,
                    value: itemData.value,
                    owned: invItem.quantity,
                    currentDurability: invItem.currentDurability,
                    maxDurability: itemData.durability,
                    image: itemData.image
                });
            }
        }

        if (inventoryItems.length === 0) {
            return interaction.editReply({
                content: '❌ You have no sellable items in your inventory.',
                ephemeral: true
            });
        }

        // Sort items by type, then by name for better organization
        inventoryItems.sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            return a.name.localeCompare(b.name);
        });

        // Pagination setup
        let currentPage = 0;
        const itemsPerPage = 25;
        const totalPages = Math.ceil(inventoryItems.length / itemsPerPage);

        // Send initial message
        const message = await interaction.editReply({
            embeds: [this.createInventoryEmbed(inventoryItems, currentPage, itemsPerPage, seller, totalPages)],
            components: this.createComponents(inventoryItems, currentPage, itemsPerPage, totalPages, seller.id),
            ephemeral: true
        });

        // Create collector for pagination buttons only
        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === seller.id && (i.customId.startsWith('player_market_page_') || i.customId.startsWith('player_market_item_select_')),
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'player_market_page_prev') {
                currentPage = Math.max(0, currentPage - 1);
                await i.update({
                    embeds: [this.createInventoryEmbed(inventoryItems, currentPage, itemsPerPage, seller, totalPages)],
                    components: this.createComponents(inventoryItems, currentPage, itemsPerPage, totalPages, seller.id),
                    ephemeral: true
                });
            } else if (i.customId === 'player_market_page_next') {
                currentPage = Math.min(totalPages - 1, currentPage + 1);
                await i.update({
                    embeds: [this.createInventoryEmbed(inventoryItems, currentPage, itemsPerPage, seller, totalPages)],
                    components: this.createComponents(inventoryItems, currentPage, itemsPerPage, totalPages, seller.id),
                    ephemeral: true
                });
            } else if (i.customId.startsWith('player_market_item_select_')) {
                // Handle item selection for selling
                await this.handleItemSelection(i, seller);
            }
        });

        collector.on('end', () => {
            // Optionally update the message to show it's expired
            interaction.editReply({
                content: '⏰ This sell menu has expired. Use `/sell` again to start selling.',
                embeds: [],
                components: [],
                ephemeral: true
            }).catch(() => {}); // Ignore errors if message was deleted
        });
    },

    async handleItemSelection(interaction, seller) {
        const selectedItemId = interaction.values[0];
        const itemData = itemMap.get(selectedItemId);
        
        if (!itemData) {
            return interaction.reply({
                content: '❌ Selected item not found.',
                ephemeral: true
            });
        }

        // Check if seller already has this item for sale
        const existingShop = await ActiveShop.findOne({
            shopOwnerId: seller.id,
            itemId: selectedItemId,
            guildId: interaction.guild.id
        });

        // Create modal for quantity and price
        const modal = new ModalBuilder()
            .setCustomId(`player_market_sale_modal_${selectedItemId}_${seller.id}_${Date.now()}`)
            .setTitle(`Sell ${itemData.name}`);

        // Get seller's current quantity
        const sellerInv = await PlayerInventory.findOne({ playerId: seller.id });
        const invItem = sellerInv?.items.find(item => item.itemId === selectedItemId);
        const maxQuantity = invItem?.quantity || 0;

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Quantity to sell')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`Max: ${maxQuantity}`)
            .setRequired(true)
            .setMaxLength(10);

        const priceInput = new TextInputBuilder()
            .setCustomId('price')
            .setLabel('Price per item (in coins)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`Suggested: ${Math.floor(itemData.value * 0.8)} coins`)
            .setRequired(true)
            .setMaxLength(10);

        modal.addComponents(
            new ActionRowBuilder().addComponents(quantityInput),
            new ActionRowBuilder().addComponents(priceInput)
        );

        await interaction.showModal(modal);
    },

    createInventoryEmbed(items, page, itemsPerPage, seller, totalPages) {
        const start = page * itemsPerPage;
        const end = Math.min(start + itemsPerPage, items.length);
        const pageItems = items.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle('🏪 Sell Items')
            .setDescription(`Select an item to put up for sale in the marketplace`)
            .setColor(0xf39c12)
            .setFooter({ text: `Page ${page + 1} of ${totalPages} • Total items: ${items.length}` })
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
                if (item.value) {
                    line += ` - 💰${item.value}`;
                }
                if (item.maxDurability && item.currentDurability !== undefined) {
                    line += ` [${item.currentDurability}/${item.maxDurability}]`;
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

    createComponents(items, page, itemsPerPage, totalPages, sellerId) {
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

            let description = item.description || `${item.type} item`;
            if (item.value) {
                description = `Value: ${item.value} coins`;
            }
            if (description.length > 100) {
                description = description.substring(0, 97) + '...';
            }

            return {
                label: label,
                description: description,
                value: item.id,
                emoji: this.getTypeEmoji(item.type)
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`player_market_item_select_${sellerId}_${page}`)
            .setPlaceholder('Select an item to sell')
            .addOptions(selectOptions);

        components.push(new ActionRowBuilder().addComponents(selectMenu));

        // Add pagination buttons only if there are multiple pages
        if (totalPages > 1) {
            const buttons = [];

            // Previous button
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('player_market_page_prev')
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0)
            );

            // Page indicator button (disabled, just for display)
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('player_market_page_indicator')
                    .setLabel(`Page ${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

            // Next button
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('player_market_page_next')
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

const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const mongoose = require('mongoose');
const Money = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const itemSheet = require('../data/itemSheet.json');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('Give coins or items to another player')
        .addSubcommand(subcommand =>
            subcommand
                .setName('coins')
                .setDescription('Give coins to another user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give coins to')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('The amount of coins to give')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('item')
                .setDescription('Give items to another player')
                .addUserOption(option => 
                    option.setName('member')
                        .setDescription('The player to give items to')
                        .setRequired(true))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'coins') {
            await this.executeGiveCoins(interaction);
        } else if (subcommand === 'item') {
            await this.executeGiveItem(interaction);
        }
    },

    // ========== GIVE COINS FUNCTIONALITY ==========
    async executeGiveCoins(interaction) {
        const senderId = interaction.user.id;
        const recipient = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (recipient.id === senderId) {
            return interaction.reply({ content: '❌ You can\'t give coins to yourself.', ephemeral: true });
        }

        // Allow giving coins to bots (removed restriction)

        if (amount <= 0) {
            return interaction.reply({ content: '❌ Please enter a valid amount greater than 0.', ephemeral: true });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find sender doc inside the transaction
            const senderProfile = await Money.findOne({ userId: senderId }).session(session);

            if (!senderProfile || senderProfile.money < amount) {
                await session.abortTransaction();
                session.endSession();
                return interaction.reply({ content: '❌ You don\'t have enough coins to give.', ephemeral: true });
            }

            // Deduct from sender
            senderProfile.money -= amount;
            await senderProfile.save({ session });

            // Find or create recipient doc inside the transaction
            let recipientProfile = await Money.findOne({ userId: recipient.id }).session(session);
            if (!recipientProfile) {
                recipientProfile = new Money({ userId: recipient.id, money: 0 });
            }
            recipientProfile.money += amount;
            await recipientProfile.save({ session });

            // Commit both changes atomically
            await session.commitTransaction();
            session.endSession();

            // Create a nice embed for the transaction
            const embed = new EmbedBuilder()
                .setTitle('💸 Coin Transfer Successful')
                .setDescription(`**${interaction.user.username}** gave **${amount} coins** to **${recipient.username}**!`)
                .setColor(0x2ecc71)
                .addFields(
                    { name: 'Sender', value: `<@${senderId}>`, inline: true },
                    { name: 'Recipient', value: `<@${recipient.id}>`, inline: true },
                    { name: 'Amount', value: `${amount} coins`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Transaction completed' });

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error('Transaction failed:', error);
            return interaction.reply({ content: '❌ Something went wrong while transferring coins.', ephemeral: true });
        }
    },

    // ========== GIVE ITEM FUNCTIONALITY ==========
    async executeGiveItem(interaction) {
        // Defer with ephemeral reply
        await interaction.deferReply({ ephemeral: true });

        const giver = interaction.user;
        const receiver = interaction.options.getUser('member');

        // Validation
        if (giver.id === receiver.id) {
            return interaction.editReply({
                content: '❌ You cannot give items to yourself.',
                ephemeral: true
            });
        }

        // Allow giving items to bots (removed restriction)

        // Get giver's inventory
        const giverInv = await PlayerInventory.findOne({ playerId: giver.id }).lean();
        if (!giverInv || giverInv.items.length === 0) {
            return interaction.editReply({
                content: '❌ You have no items in your inventory.',
                ephemeral: true
            });
        }

        // Prepare items with full data
        const inventoryItems = [];
        for (const invItem of giverInv.items) {
            const itemData = itemMap.get(invItem.itemId);
            if (itemData && invItem.quantity > 0) {
                inventoryItems.push({
                    id: itemData.id,
                    name: itemData.name,
                    type: itemData.type,
                    description: itemData.description,
                    value: itemData.value,
                    owned: invItem.quantity,
                    currentDurability: invItem.currentDurability,
                    maxDurability: itemData.durability
                });
            }
        }

        if (inventoryItems.length === 0) {
            return interaction.editReply({
                content: '❌ You have no valid items to give.',
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
            embeds: [this.createInventoryEmbed(inventoryItems, currentPage, itemsPerPage, giver, receiver, totalPages)],
            components: this.createComponents(inventoryItems, currentPage, itemsPerPage, totalPages, giver.id, receiver.id),
            ephemeral: true
        });

        // Create collector for pagination buttons only
        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === giver.id && i.customId.startsWith('transfer_page_'),
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'transfer_page_prev') {
                currentPage = Math.max(0, currentPage - 1);
            } else if (i.customId === 'transfer_page_next') {
                currentPage = Math.min(totalPages - 1, currentPage + 1);
            }

            await i.update({
                embeds: [this.createInventoryEmbed(inventoryItems, currentPage, itemsPerPage, giver, receiver, totalPages)],
                components: this.createComponents(inventoryItems, currentPage, itemsPerPage, totalPages, giver.id, receiver.id),
                ephemeral: true
            });
        });

        collector.on('end', () => {
            // Optionally update the message to show it's expired
            interaction.editReply({
                content: '⏰ This transfer menu has expired. Use `/give item` again to start a new transfer.',
                embeds: [],
                components: [],
                ephemeral: true
            }).catch(() => {}); // Ignore errors if message was deleted
        });
    },

    // ========== HELPER FUNCTIONS FOR ITEM GIVING ==========
    createInventoryEmbed(items, page, itemsPerPage, giver, receiver, totalPages) {
        const start = page * itemsPerPage;
        const end = Math.min(start + itemsPerPage, items.length);
        const pageItems = items.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle('📦 Give Items')
            .setDescription(`Select an item to give to **${receiver.username}**`)
            .setColor(0x3498db)
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

    createComponents(items, page, itemsPerPage, totalPages, giverId, receiverId) {
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
            .setCustomId(`transfer_item_select_${giverId}_${receiverId}_${page}`)
            .setPlaceholder('Select an item to give')
            .addOptions(selectOptions);

        components.push(new ActionRowBuilder().addComponents(selectMenu));

        // Add pagination buttons only if there are multiple pages
        if (totalPages > 1) {
            const buttons = [];

            // Previous button
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('transfer_page_prev')
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0)
            );

            // Page indicator button (disabled, just for display)
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('transfer_page_indicator')
                    .setLabel(`Page ${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

            // Next button
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('transfer_page_next')
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

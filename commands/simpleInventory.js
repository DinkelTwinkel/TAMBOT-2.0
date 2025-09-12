const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const PlayerInventory = require('../models/inventory');
const itemsheet = require('../data/itemSheet.json'); // must contain { id, name }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Check your inventory or another player\'s inventory')
        .addUserOption(option => 
            option.setName('member')
                .setDescription('Optional: View another player\'s inventory')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('member') || interaction.user;

            const playerInv = await PlayerInventory.findOne({
                playerId: targetUser.id,
            }).lean();

            if (!playerInv || playerInv.items.length === 0) {
                return interaction.editReply({
                    content: `${targetUser.username} has no items in their inventory.`,
                    ephemeral: true
                });
            }

            // Process and sort items
            const inventoryItems = playerInv.items
                .map(item => {
                    const itemData = itemsheet.find(i => i.id === item.itemId);
                    
                    // Determine display type - separate summons from regular consumables
                    let displayType = itemData ? itemData.type : 'unknown';
                    if (itemData && itemData.type === 'consumable' && itemData.subtype === 'familiar') {
                        displayType = 'summons'; // Create separate category for summons
                    }
                    
                    return {
                        id: item.itemId,
                        name: itemData ? itemData.name : `Unknown Item (${item.itemId})`,
                        type: displayType, // Use modified type for categorization
                        originalType: itemData ? itemData.type : 'unknown', // Keep original
                        quantity: item.quantity,
                        currentDurability: item.currentDurability,
                        maxDurability: itemData ? itemData.durability : null,
                        value: itemData ? itemData.value : 0
                    };
                })
                .filter(item => item.quantity > 0)
                .sort((a, b) => {
                    if (a.type !== b.type) return a.type.localeCompare(b.type);
                    return a.name.localeCompare(b.name);
                });

            // Paginate items
            const pages = this.paginateInventory(inventoryItems);
            let currentPage = 0;
            const totalPages = pages.length;

            // Send initial message
            const embed = this.createInventoryEmbed(pages[currentPage], currentPage, targetUser, totalPages);
            const components = this.createPaginationComponents(currentPage, totalPages, targetUser.id);

            const reply = await interaction.editReply({ 
                embeds: [embed], 
                components: components,
                ephemeral: true
            });

            // Pagination is now handled by the global InventoryHandler
            // No need for local collectors anymore

        } catch (error) {
            console.error('[INVENTORY] Main execution error:', error);
            try {
                await interaction.editReply({
                    content: '❌ There was an error displaying the inventory. Please try again later.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('[INVENTORY] Failed to send error reply:', replyError);
            }
        }
    },

    // Paginate inventory items
    paginateInventory(items) {
        const maxDescriptionLength = 4000; // Leave buffer under 4096 limit
        const maxItemsPerPage = 50; // Reasonable limit for inventory display
        const pages = [];
        let currentPageItems = [];
        let currentDescription = '';

        // Group items by type
        const itemsByType = {};
        for (const item of items) {
            if (!itemsByType[item.type]) {
                itemsByType[item.type] = [];
            }
            itemsByType[item.type].push(item);
        }

        // Build pages
        for (const [type, typeItems] of Object.entries(itemsByType)) {
            const typeEmoji = this.getTypeEmoji(type);
            const typeHeader = `**${typeEmoji} ${this.formatTypeName(type)}**\n\`\`\`\n`;
            const codeBlockEnd = '\`\`\`\n';

            // Check if we need a new page for this type
            if (currentDescription.length + typeHeader.length + codeBlockEnd.length > maxDescriptionLength && currentPageItems.length > 0) {
                pages.push(currentPageItems);
                currentPageItems = [];
                currentDescription = '';
            }

            let typeStarted = false;
            for (const item of typeItems) {
                // Only show durability for items that should have it (tools, equipment, charms)
                let durabilityText = '';
                if (item.originalType === 'tool' || item.originalType === 'equipment' || item.originalType === 'charm') {
                    if (item.currentDurability !== undefined && item.maxDurability) {
                        durabilityText = ` (${item.currentDurability}/${item.maxDurability})`;
                    } else if (item.maxDurability) {
                        // Show max durability if current is undefined (probably needs initialization)
                        durabilityText = ` (${item.maxDurability}/${item.maxDurability})`;
                    }
                }
                const line = `${item.name} x${item.quantity}${durabilityText}\n`;

                const toAdd = (!typeStarted ? typeHeader : '') + line;
                const futureLength = currentDescription.length + toAdd.length + codeBlockEnd.length;

                if ((futureLength > maxDescriptionLength || currentPageItems.length >= maxItemsPerPage) && currentPageItems.length > 0) {
                    if (typeStarted) {
                        currentDescription += codeBlockEnd;
                    }
                    pages.push(currentPageItems);
                    currentPageItems = [];
                    currentDescription = typeHeader + line;
                    typeStarted = true;
                } else {
                    if (!typeStarted) {
                        currentDescription += typeHeader;
                        typeStarted = true;
                    }
                    currentDescription += line;
                }
                
                currentPageItems.push(item);
            }

            if (typeStarted) {
                currentDescription += codeBlockEnd;
            }
        }

        if (currentPageItems.length > 0) {
            pages.push(currentPageItems);
        }

        return pages.length > 0 ? pages : [[]];
    },

    // Create inventory embed
    createInventoryEmbed(pageItems, page, user, totalPages) {
        // Build description from page items
        let description = '';
        const itemsByType = {};
        
        // Group items by type
        for (const item of pageItems) {
            if (!itemsByType[item.type]) {
                itemsByType[item.type] = [];
            }
            itemsByType[item.type].push(item);
        }
        
        // Build description with categories
        for (const [type, typeItems] of Object.entries(itemsByType)) {
            const typeEmoji = this.getTypeEmoji(type);
            description += `**${typeEmoji} ${this.formatTypeName(type)}**\n\`\`\`\n`;
            
            for (const item of typeItems) {
                // Only show durability for items that should have it (tools, equipment, charms)
                let durabilityText = '';
                if (item.originalType === 'tool' || item.originalType === 'equipment' || item.originalType === 'charm') {
                    if (item.currentDurability !== undefined && item.maxDurability) {
                        durabilityText = ` (${item.currentDurability}/${item.maxDurability})`;
                    } else if (item.maxDurability) {
                        // Show max durability if current is undefined (probably needs initialization)
                        durabilityText = ` (${item.maxDurability}/${item.maxDurability})`;
                    }
                }
                description += `${item.name} x${item.quantity}${durabilityText}\n`;
            }
            
            description += '\`\`\`\n';
        }
        
        if (description === '') {
            description = '\`\`\`\nNo items on this page.\n\`\`\`';
        }

        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.username}'s Inventory${totalPages > 1 ? ` (Page ${page + 1}/${totalPages})` : ''}`)
            .setDescription(description)
            .setColor(0xFFD700)
            .setFooter({ text: `${pageItems.length} items on this page` })
            .setTimestamp();

        return embed;
    },

    // Create pagination components
    createPaginationComponents(page, totalPages, userId) {
        if (totalPages <= 1) return [];

        const buttons = [];

        buttons.push(
            new ButtonBuilder()
                .setCustomId(`inv_page_prev_${userId}`)
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0)
        );

        buttons.push(
            new ButtonBuilder()
                .setCustomId('inv_page_indicator')
                .setLabel(`Page ${page + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        buttons.push(
            new ButtonBuilder()
                .setCustomId(`inv_page_next_${userId}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === totalPages - 1)
        );

        return [new ActionRowBuilder().addComponents(buttons)];
    },

    getTypeEmoji(type) {
        const emojis = {
            'mineLoot': '⛏️',
            'tool': '🔧',
            'consumable': '🍖',
            'summons': '🤖', // New category for familiars/golems
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
            'summons': 'Summons & Familiars', // New category name
            'equipment': 'Equipment',
            'charm': 'Charms',
            'material': 'Materials',
            'quest': 'Quest Items',
            'special': 'Special Items'
        };
        return names[type] || type.charAt(0).toUpperCase() + type.slice(1);
    }
};

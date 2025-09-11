// ============================================
// IMPORTS AND DEPENDENCIES
// ============================================


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


// ============================================
// ITEM MAP INITIALIZATION
// ============================================


// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

// Filter items that have scripts
const usableItems = itemSheet.filter(item => item.script);
const usableItemMap = new Map(usableItems.map(item => [item.id, item]));


// ============================================
// MODULE EXPORT AND COMMAND DEFINITION
// ============================================


module.exports = {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('Use an item from your inventory'),


// ============================================
// MAIN EXECUTE METHOD
// ============================================


    async execute(interaction) {
        try {
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
                // Determine display type - separate summons from regular consumables
                let displayType = itemData.type;
                if (itemData.type === 'consumable' && itemData.subtype === 'familiar') {
                    displayType = 'summons'; // Create separate category for summons
                }
                
                usableInventoryItems.push({
                    id: itemData.id,
                    name: itemData.name,
                    type: displayType, // Use modified type for categorization
                    originalType: itemData.type, // Keep original for other logic
                    subtype: itemData.subtype,
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

        // Paginate items based on description character limit
        const pages = this.paginateItems(usableInventoryItems);
        let currentPage = 0;
        const totalPages = pages.length;

        // Send initial message with error handling
        try {
            const embed = this.createUsableItemsEmbed(pages[currentPage], currentPage, user, totalPages);
            const components = this.createComponents(pages[currentPage], currentPage, totalPages, user.id, interaction.channelId);
            
            // Check if embed description is too long
            if (embed.data.description && embed.data.description.length > 4096) {
                console.error(`[USE COMMAND] Embed description too long: ${embed.data.description.length} characters`);
                return interaction.editReply({
                    content: '❌ Too many items to display. The inventory system needs optimization.',
                    ephemeral: true
                });
            }
            
            const message = await interaction.editReply({
                embeds: [embed],
                components: components,
                ephemeral: true
            });
            
            // Create collector for pagination buttons only
            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === user.id && i.customId.startsWith('use_page_'),
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (i) => {
                try {
                    if (i.customId === 'use_page_prev') {
                        currentPage = Math.max(0, currentPage - 1);
                    } else if (i.customId === 'use_page_next') {
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                    }

                    await i.update({
                        embeds: [this.createUsableItemsEmbed(pages[currentPage], currentPage, user, totalPages)],
                        components: this.createComponents(pages[currentPage], currentPage, totalPages, user.id, interaction.channelId),
                        ephemeral: true
                    });
                } catch (updateError) {
                    console.error('[USE COMMAND] Error updating pagination:', updateError);
                }
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
            
        } catch (embedError) {
            console.error('[USE COMMAND] Error creating embed:', embedError);
            return interaction.editReply({
                content: '❌ There was an error displaying your usable items. Please try again.',
                ephemeral: true
            });
        }
        
        } catch (mainError) {
            console.error('[USE COMMAND] Main execution error:', mainError);
            try {
                await interaction.editReply({
                    content: '❌ There was an error executing this command. Please try again later.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('[USE COMMAND] Failed to send error reply:', replyError);
            }
        }
    },

// ============================================
// PAGINATION METHOD
// ============================================

    // Paginate items based on Discord's description limit AND select menu limit
    paginateItems(items) {
        const maxDescriptionLength = 4096; // Discord's embed description limit
        const maxItemsPerPage = 24; // Leave room for 1 option buffer (Discord limit is 25)
        const pages = [];
        let currentPageItems = [];
        let currentDescription = '';

        // Group items by type first
        const itemsByType = {};
        for (const item of items) {
            if (!itemsByType[item.type]) {
                itemsByType[item.type] = [];
            }
            itemsByType[item.type].push(item);
        }

        // Build description and split into pages
        for (const [type, typeItems] of Object.entries(itemsByType)) {
            const typeEmoji = this.getTypeEmoji(type);
            // Category header (outside code block) + code block markers
            const typeHeader = `**${typeEmoji} ${this.formatTypeName(type)}**\n` + '```\n';
            const codeBlockEnd = '```\n';
            
            // Check if we need to start a new page for this type header
            if (currentDescription.length + typeHeader.length + codeBlockEnd.length > maxDescriptionLength && currentPageItems.length > 0) {
                pages.push(currentPageItems);
                currentPageItems = [];
                currentDescription = '';
            }
            
            let typeStartedOnPage = false;
            let typeItemsText = '';
            
            for (const item of typeItems) {
                let line = `x${item.owned} 『${item.name}』`;
                
                // Add subtype for consumables (food/drink)
                if (item.type === 'consumable' && item.subtype) {
                    line += ` ${item.subtype}`;
                }
                
                line += '\n';
                
                // Calculate what would be added (including code block end if not started)
                const toAdd = (!typeStartedOnPage ? typeHeader : '') + line + (!typeStartedOnPage ? '' : '');
                const futureLength = currentDescription.length + toAdd.length + (typeStartedOnPage ? 0 : codeBlockEnd.length);
                
                // Check if adding this item would exceed the limits (description OR select menu)
                if ((futureLength > maxDescriptionLength || currentPageItems.length >= maxItemsPerPage) && currentPageItems.length > 0) {
                    // Close current type's code block if started
                    if (typeStartedOnPage) {
                        currentDescription += codeBlockEnd;
                    }
                    // Start a new page
                    pages.push(currentPageItems);
                    currentPageItems = [];
                    currentDescription = typeHeader + line;
                    typeStartedOnPage = true;
                } else {
                    // Add to current page
                    if (!typeStartedOnPage) {
                        currentDescription += typeHeader;
                        typeStartedOnPage = true;
                    }
                    currentDescription += line;
                }
                
                currentPageItems.push(item);
            }
            
            // Close the code block for this type
            if (typeStartedOnPage) {
                currentDescription += codeBlockEnd;
            }
        }
        
        // Add remaining items
        if (currentPageItems.length > 0) {
            pages.push(currentPageItems);
        }
        
        return pages.length > 0 ? pages : [[]];
    },

// ============================================
// EMBED CREATION METHOD
// ============================================

    // Create embed showing usable items
    createUsableItemsEmbed(pageItems, page, user, totalPages) {
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
        
        // Build description with categories outside code blocks
        for (const [type, typeItems] of Object.entries(itemsByType)) {
            const typeEmoji = this.getTypeEmoji(type);
            // Category header outside code block
            description += `**${typeEmoji} ${this.formatTypeName(type)}**\n`;
            description += '```\n';
            
            for (const item of typeItems) {
                let line = `x${item.owned} 『${item.name}』`;
                
                // Add subtype for consumables (food/drink)
                if (item.type === 'consumable' && item.subtype) {
                    line += ` ${item.subtype}`;
                }
                
                description += line + '\n';
            }
            
            description += '```\n';
        }
        
        // If no items, show a message
        if (description === '') {
            description = '```\nNo items available on this page.\n```';
        }

        const embed = new EmbedBuilder()
            .setTitle('🎮 Use Items')
            .setDescription(description)
            .setColor(0x9B59B6)
            .setFooter({ text: `Page ${page + 1} of ${totalPages} • Items on this page: ${pageItems.length}` })
            .setTimestamp();

        return embed;
    },


// ============================================
// COMPONENT CREATION METHOD
// ============================================


    createComponents(pageItems, page, totalPages, userId, channelId) {
        const components = [];

        // Create select menu with items on current page
        const selectOptions = pageItems.map(item => {
            let label = `x${item.owned} ${item.name}`;
            if (label.length > 100) {
                label = label.substring(0, 97) + '...';
            }

            let description = '';
            
            // Build description with BUFF info if available
            if (item.abilities && item.abilities.length > 0) {
                const abilityList = item.abilities.map(a => {
                    const sign = a.powerlevel >= 0 ? '+' : '';
                    return `${a.name}${sign}${a.powerlevel}`;
                }).join(', ');
                description = `BUFF (${abilityList})`;
                
                // Add duration if exists
                if (item.duration) {
                    description += ` 🕐 ${item.duration} minutes`;
                }
            } else if (item.description && item.description.length < 50) {
                description = item.description;
            } else {
                description = `Use: ${item.script}`;
            }
            
            if (description.length > 100) {
                description = description.substring(0, 97) + '...';
            }

            // Create value with all necessary data encoded
            const value = `${userId}_${channelId}_${item.id}_${page}`;
            
            // Ensure value doesn't exceed Discord's limit (100 chars)
            if (value.length > 100) {
                console.error(`Warning: Select menu value too long for item ${item.id}`);
                return null; // Return null for invalid items
            }

            return {
                label: label,
                description: description,
                value: value,
                emoji: this.getTypeEmoji(item.type)
            };
        }).filter(option => option !== null); // Filter out null values

        // Ensure we have valid options and respect Discord's 25 option limit
        if (selectOptions.length === 0) {
            console.error(`[USE COMMAND] No valid select options for page ${page}`);
            return []; // Return empty components if no valid options
        }

        // Discord select menus have a maximum of 25 options
        if (selectOptions.length > 25) {
            console.warn(`[USE COMMAND] Trimming select options from ${selectOptions.length} to 25 for Discord limit`);
            selectOptions.splice(25); // Keep only first 25 options
        }

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


// ============================================
// UTILITY METHODS
// ============================================


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

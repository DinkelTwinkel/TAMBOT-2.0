// patterns/inventoryHandler.js
// Global handler for inventory pagination buttons

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const PlayerInventory = require('../models/inventory');
const itemSheet = require('../data/itemSheet.json');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

class InventoryHandler {
    constructor(client, guildId) {
        this.client = client;
        this.guildId = guildId;
        
        // Create a unique listener name for this guild
        this.listenerName = `inventoryHandler_${guildId}`;
        
        // Remove any existing listeners for this guild before setting up new ones
        this.removeExistingListeners();
        
        // Setup new listeners
        this.setupListeners();
        
        // Store the handler reference on the client to track it
        if (!this.client.inventoryHandlers) {
            this.client.inventoryHandlers = new Map();
        }
        this.client.inventoryHandlers.set(guildId, this);
    }

    removeExistingListeners() {
        // Get all existing listeners for interactionCreate
        const listeners = this.client.listeners('interactionCreate');
        
        // Remove listeners that match our naming pattern for this guild
        listeners.forEach(listener => {
            if (listener.inventoryHandlerGuildId === this.guildId) {
                this.client.removeListener('interactionCreate', listener);
            }
        });
    }

    setupListeners() {
        // Create a named function so we can track it
        const interactionHandler = async (interaction) => {
            if (interaction.guild?.id !== this.guildId) return;
            if (!interaction.isButton()) return;

            try {
                // Handle inventory pagination buttons
                if (interaction.customId.startsWith('inv_page_')) {
                    await this.handleInventoryPagination(interaction);
                }
            } catch (error) {
                console.error(`[INVENTORY_HANDLER] Error handling interaction in guild ${this.guildId}:`, error);
            }
        };
        
        // Add guild ID to the function for tracking
        interactionHandler.inventoryHandlerGuildId = this.guildId;
        
        // Add the listener
        this.client.on('interactionCreate', interactionHandler);
    }

    async handleInventoryPagination(interaction) {
        // Parse button custom ID to get user ID and direction
        const parts = interaction.customId.split('_');
        const direction = parts[2]; // 'prev' or 'next'
        const userId = parts[3]; // User ID from button
        
        // Validate user
        if (userId !== interaction.user.id) {
            return interaction.reply({
                content: '❌ These pagination buttons are not for you.',
                ephemeral: true
            });
        }

        await interaction.deferUpdate();

        try {
            // Get current page from the embed title
            const currentEmbed = interaction.message.embeds[0];
            let currentPage = 0;
            
            if (currentEmbed && currentEmbed.title) {
                const pageMatch = currentEmbed.title.match(/Page (\d+)\/(\d+)/);
                if (pageMatch) {
                    currentPage = parseInt(pageMatch[1]) - 1; // Convert to 0-based
                }
            }

            // Get user's inventory to regenerate pages
            const playerInv = await PlayerInventory.findOne({ playerId: userId });
            if (!playerInv) {
                return interaction.followUp({
                    content: '❌ Your inventory could not be found.',
                    ephemeral: true
                });
            }

            // Get inventory items with details
            const inventoryItems = [];
            for (const invItem of playerInv.items) {
                const itemData = itemMap.get(invItem.itemId);
                if (itemData) {
                    // Handle durability correctly
                    const currentDurability = invItem.currentDurability;
                    const maxDurability = itemData.durability; // Max durability comes from itemSheet
                    
                    inventoryItems.push({
                        ...itemData,
                        quantity: invItem.quantity,
                        currentDurability: currentDurability,
                        maxDurability: maxDurability
                    });
                }
            }

            if (inventoryItems.length === 0) {
                return interaction.editReply({
                    content: '📦 Your inventory is empty.',
                    embeds: [],
                    components: []
                });
            }

            // Sort items by type, then by name
            inventoryItems.sort((a, b) => {
                if (a.type !== b.type) return a.type.localeCompare(b.type);
                return a.name.localeCompare(b.name);
            });

            // Paginate the inventory
            const pages = this.paginateInventory(inventoryItems);
            const totalPages = pages.length;

            // Calculate new page
            let newPage = currentPage;
            if (direction === 'prev' && currentPage > 0) {
                newPage = currentPage - 1;
            } else if (direction === 'next' && currentPage < totalPages - 1) {
                newPage = currentPage + 1;
            }

            // Get target user for display
            const targetUser = await interaction.client.users.fetch(userId);

            // Update the message
            await interaction.editReply({
                embeds: [this.createInventoryEmbed(pages[newPage], newPage, targetUser, totalPages)],
                components: this.createPaginationComponents(newPage, totalPages, userId)
            });

        } catch (error) {
            console.error('[INVENTORY_HANDLER] Error handling pagination:', error);
            await interaction.followUp({
                content: '❌ An error occurred while changing pages.',
                ephemeral: true
            });
        }
    }

    // Paginate inventory items (same logic as simpleInventory.js)
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
                if (item.type === 'tool' || item.type === 'equipment' || item.type === 'charm') {
                    if (item.currentDurability !== undefined && item.maxDurability !== undefined) {
                        durabilityText = ` (${item.currentDurability}/${item.maxDurability})`;
                    } else if (item.maxDurability !== undefined) {
                        // Show max durability if current is undefined (probably needs initialization)
                        durabilityText = ` (${item.maxDurability}/${item.maxDurability})`;
                    }
                }
                const itemLine = `${item.name} x${item.quantity}${durabilityText}\n`;
                
                if (!typeStarted) {
                    const fullTypeSection = typeHeader + itemLine + codeBlockEnd;
                    if (currentDescription.length + fullTypeSection.length > maxDescriptionLength && currentPageItems.length > 0) {
                        pages.push(currentPageItems);
                        currentPageItems = [];
                        currentDescription = '';
                    }
                    currentDescription += typeHeader;
                    typeStarted = true;
                }

                if (currentDescription.length + itemLine + codeBlockEnd.length > maxDescriptionLength) {
                    currentDescription += codeBlockEnd;
                    pages.push([...currentPageItems]);
                    currentPageItems = [];
                    currentDescription = typeHeader + itemLine;
                } else {
                    currentDescription += itemLine;
                }
                currentPageItems.push(item);

                if (currentPageItems.length >= maxItemsPerPage) {
                    currentDescription += codeBlockEnd;
                    pages.push([...currentPageItems]);
                    currentPageItems = [];
                    currentDescription = '';
                    typeStarted = false;
                }
            }
            if (typeStarted) {
                currentDescription += codeBlockEnd;
            }
        }

        if (currentPageItems.length > 0) {
            pages.push(currentPageItems);
        }

        return pages.length > 0 ? pages : [[]];
    }

    createInventoryEmbed(pageItems, page, user, totalPages) {
        const maxDescriptionLength = 4000;
        let description = '';

        // Group items by type
        const itemsByType = {};
        for (const item of pageItems) {
            if (!itemsByType[item.type]) {
                itemsByType[item.type] = [];
            }
            itemsByType[item.type].push(item);
        }

        // Build description
        for (const [type, typeItems] of Object.entries(itemsByType)) {
            const typeEmoji = this.getTypeEmoji(type);
            description += `**${typeEmoji} ${this.formatTypeName(type)}**\n\`\`\`\n`;
            
            for (const item of typeItems) {
                // Only show durability for items that should have it (tools, equipment, charms)
                let durabilityText = '';
                if (item.type === 'tool' || item.type === 'equipment' || item.type === 'charm') {
                    if (item.currentDurability !== undefined && item.maxDurability !== undefined) {
                        durabilityText = ` (${item.currentDurability}/${item.maxDurability})`;
                    } else if (item.maxDurability !== undefined) {
                        // Show max durability if current is undefined (probably needs initialization)
                        durabilityText = ` (${item.maxDurability}/${item.maxDurability})`;
                    }
                }
                description += `${item.name} x${item.quantity}${durabilityText}\n`;
            }
            
            description += '\`\`\`\n';
        }

        if (description.length > maxDescriptionLength) {
            description = description.substring(0, maxDescriptionLength - 3) + '...';
        }

        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.displayName}'s Inventory - Page ${page + 1}/${totalPages}`)
            .setDescription(description || 'No items on this page.')
            .setColor(0x00AE86)
            .setTimestamp();

        return embed;
    }

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
    }

    getTypeEmoji(type) {
        const emojis = {
            'mineLoot': '⛏️',
            'tool': '🔧',
            'equipment': '⚔️',
            'consumable': '🧪',
            'material': '📦',
            'treasure': '💎',
            'misc': '📋'
        };
        return emojis[type] || '📋';
    }

    formatTypeName(type) {
        return type.charAt(0).toUpperCase() + type.slice(1).replace(/([A-Z])/g, ' $1');
    }

    cleanup() {
        this.removeExistingListeners();
        if (this.client.inventoryHandlers) {
            this.client.inventoryHandlers.delete(this.guildId);
        }
    }
}

module.exports = InventoryHandler;

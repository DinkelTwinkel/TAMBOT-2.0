// titleEquipHandler.js - Centralized title equip handler with select menu interactions
const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { equipTitle, unequipAllTitles, getPlayerTitles, TITLES } = require('./gachaModes/mining/titleSystem');

class TitleEquipHandler {
    constructor(client, guildId) {
        this.client = client;
        this.guildId = guildId;
        
        // Create a unique listener name for this guild
        this.listenerName = `titleEquipHandler_${guildId}`;
        
        // Remove any existing listeners for this guild before setting up new ones
        this.removeExistingListeners();
        
        // Setup new listeners
        this.setupListeners();
        
        // Store the handler reference on the client to track it
        if (!this.client.titleEquipHandlers) {
            this.client.titleEquipHandlers = new Map();
        }
        this.client.titleEquipHandlers.set(guildId, this);
        
        // Performance monitoring
        this.performanceStats = {
            totalEquips: 0,
            failedEquips: 0,
            successfulEquips: 0,
            roleAssignments: 0
        };
    }

    removeExistingListeners() {
        // Get all existing listeners for interactionCreate
        const listeners = this.client.listeners('interactionCreate');
        listeners.forEach(listener => {
            if (listener.titleEquipHandlerGuildId === this.guildId) {
                this.client.removeListener('interactionCreate', listener);
            }
        });
    }

    setupListeners() {
        // Create a named function so we can track it
        const interactionHandler = async (interaction) => {
            if (interaction.guild?.id !== this.guildId) return;
            
            try {
                // Handle title equip select menus
                if (interaction.isStringSelectMenu() && interaction.customId === 'titles_equip_select') {
                    await this.handleTitleEquip(interaction);
                }
                // Handle pagination buttons
                else if (interaction.isButton()) {
                    if (interaction.customId.startsWith(`titles_page_prev_`) || 
                        interaction.customId.startsWith(`titles_page_next_`)) {
                        await this.handlePagination(interaction);
                    }
                }
                    
            } catch (error) {
                console.error('[TITLE_EQUIP] Interaction error:', error);
                this.performanceStats.failedEquips++;
                
                // Try to respond with error if not already responded
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ 
                            content: '❌ An error occurred processing your title request.', 
                            ephemeral: true 
                        });
                    } else if (interaction.deferred) {
                        await interaction.editReply({ 
                            content: '❌ An error occurred processing your title request.' 
                        });
                    }
                } catch (e) {
                    console.error('[TITLE_EQUIP] Failed to send error message:', e);
                }
            }
        };
        
        // Tag the handler with the guild ID so we can identify it later
        interactionHandler.titleEquipHandlerGuildId = this.guildId;
        
        // Add the listener
        this.client.on('interactionCreate', interactionHandler);
    }

    async handleTitleEquip(interaction) {
        try {
            // Parse the select menu value: userId|guildId|titleId|page or userId|guildId|unequip|page
            const value = interaction.values[0];
            const [userId, guildId, action, page] = value.split('|');
            
            console.log(`[TITLE_EQUIP] Processing value: ${value}, parsed: userId=${userId}, guildId=${guildId}, action=${action}, page=${page}`);
            
            // Validate user
            if (userId !== interaction.user.id) {
                return interaction.reply({
                    content: '❌ This title menu is not for you.',
                    ephemeral: true
                });
            }

            await interaction.deferUpdate();

            if (action === 'unequip') {
                // Handle unequip all titles
                const result = await unequipAllTitles(userId, interaction.member);
                
                if (result.success) {
                    this.performanceStats.successfulEquips++;
                    
                    // Refresh the titles list to show updated state
                    await this.refreshTitlesMenu(interaction, parseInt(page));
                    
                    await interaction.followUp({
                        content: `🚫 **All titles unequipped!**${result.removedRoles > 0 ? `\n🎭 Removed ${result.removedRoles} Discord role(s)` : ''}`,
                        ephemeral: true
                    });
                } else {
                    this.performanceStats.failedEquips++;
                    await interaction.followUp({
                        content: '❌ Failed to unequip titles.',
                        ephemeral: true
                    });
                }
            } else {
                // Handle equip specific title
                const titleId = action;
                
                // Find title by ID (since TITLES uses uppercase keys but title.id is lowercase)
                const title = Object.values(TITLES).find(t => t.id === titleId);
                
                console.log(`[TITLE_EQUIP] Looking up title: ${titleId}, found: ${!!title}`);
                console.log(`[TITLE_EQUIP] TITLES object keys: ${Object.keys(TITLES).length} total`);
                console.log(`[TITLE_EQUIP] Diamond crown heir exists: ${!!TITLES.DIAMOND_CROWN_HEIR}`);
                console.log(`[TITLE_EQUIP] Direct lookup: ${!!TITLES[titleId]}`);
                
                if (title) {
                    console.log(`[TITLE_EQUIP] Title details: ${title.name} (${title.rarity})`);
                } else {
                    console.log(`[TITLE_EQUIP] Available title IDs: ${Object.keys(TITLES).slice(0, 10).join(', ')}...`);
                    
                    // Try alternative lookups
                    const foundByKey = Object.entries(TITLES).find(([key, titleData]) => titleData.id === titleId);
                    if (foundByKey) {
                        console.log(`[TITLE_EQUIP] Found by ID search: ${foundByKey[0]} -> ${foundByKey[1].name}`);
                    }
                }
                
                if (!title) {
                    this.performanceStats.failedEquips++;
                    return interaction.followUp({
                        content: `❌ Invalid title selected. Title ID: ${titleId}`,
                        ephemeral: true
                    });
                }

                const result = await equipTitle(userId, titleId, interaction.member);
                
                if (result.success) {
                    this.performanceStats.successfulEquips++;
                    if (result.role) {
                        this.performanceStats.roleAssignments++;
                    }
                    
                    // Refresh the titles list to show updated state
                    await this.refreshTitlesMenu(interaction, parseInt(page));
                    
                    let message = `👑 **${title.name} equipped!**\n*${title.description}*`;
                    
                    if (result.role) {
                        message += `\n🎭 **Discord role assigned**: ${result.role.name}`;
                    }
                    
                    // Show title benefits
                    if (title.benefits && Object.keys(title.benefits).length > 0) {
                        const benefitsList = Object.entries(title.benefits)
                            .map(([benefit, value]) => {
                                if (typeof value === 'number') {
                                    return `${benefit}: +${Math.round(value * 100)}%`;
                                }
                                return benefit;
                            })
                            .join(', ');
                        message += `\n✨ **Benefits**: ${benefitsList}`;
                    }
                    
                    await interaction.followUp({
                        content: message,
                        ephemeral: true
                    });
                } else {
                    this.performanceStats.failedEquips++;
                    await interaction.followUp({
                        content: `❌ ${result.message}`,
                        ephemeral: true
                    });
                }
            }

        } catch (error) {
            console.error('[TITLE_EQUIP] Error handling title equip:', error);
            this.performanceStats.failedEquips++;
            
            await interaction.followUp({
                content: '❌ An error occurred while equipping the title.',
                ephemeral: true
            });
        }
    }

    async handlePagination(interaction) {
        try {
            // Parse button custom ID
            const parts = interaction.customId.split('_');
            const direction = parts[2]; // 'prev' or 'next'
            const userId = parts[3];
            
            // Validate user
            if (userId !== interaction.user.id) {
                return interaction.reply({
                    content: '❌ These pagination buttons are not for you.',
                    ephemeral: true
                });
            }

            await interaction.deferUpdate();

            // Get current page from the embed title
            const currentEmbed = interaction.message.embeds[0];
            let currentPage = 0;
            
            if (currentEmbed && currentEmbed.title) {
                const pageMatch = currentEmbed.title.match(/Page (\d+)\/\d+/);
                if (pageMatch) {
                    currentPage = parseInt(pageMatch[1]) - 1; // Convert to 0-based
                }
            }

            // Calculate new page
            let newPage = currentPage;
            if (direction === 'prev' && currentPage > 0) {
                newPage = currentPage - 1;
            } else if (direction === 'next') {
                newPage = currentPage + 1;
            }

            // Refresh the menu with new page
            await this.refreshTitlesMenu(interaction, newPage);

        } catch (error) {
            console.error('[TITLE_EQUIP] Error handling pagination:', error);
            await interaction.followUp({
                content: '❌ An error occurred while changing pages.',
                ephemeral: true
            });
        }
    }

    async refreshTitlesMenu(interaction, page) {
        try {
            // Import the handleListTitlesWithMenu function and call it
            const titlesCommand = require('../commands/titles');
            
            // Get fresh player titles data
            const playerTitles = await getPlayerTitles(
                interaction.user.id, 
                interaction.user.displayName, 
                interaction.guild?.id
            );
            
            if (!playerTitles || playerTitles.available.length === 0) {
                return interaction.editReply({ 
                    content: '📜 You haven\'t unlocked any titles yet!',
                    embeds: [],
                    components: []
                });
            }

            // Recreate the titles menu with updated data
            await this.createTitlesMenuResponse(interaction, playerTitles, page);

        } catch (error) {
            console.error('[TITLE_EQUIP] Error refreshing menu:', error);
        }
    }

    async createTitlesMenuResponse(interaction, playerTitles, page) {
        // This will be implemented to recreate the menu - for now, just edit with a message
        const user = interaction.user;
        
        // Pagination setup (24 titles per page + 1 for "no title")
        const itemsPerPage = 24;
        const totalPages = Math.ceil(playerTitles.available.length / itemsPerPage);
        const startIndex = page * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, playerTitles.available.length);
        const titlesOnPage = playerTitles.available.slice(startIndex, endIndex);

        // Create updated embed
        const embed = new EmbedBuilder()
            .setTitle(`📜 ${user.displayName}'s Titles${totalPages > 1 ? ` (Page ${page + 1}/${totalPages})` : ''}`)
            .setColor('Purple');

        // Show current display title
        if (playerTitles.display) {
            embed.addFields({
                name: '👑 Currently Equipped',
                value: `${playerTitles.display.emoji} **${playerTitles.display.name}**\n*${playerTitles.display.description}*`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '👑 Currently Equipped',
                value: '*No title equipped*\nSelect a title from the menu below to equip it',
                inline: false
            });
        }

        // Show titles on this page
        if (titlesOnPage.length > 0) {
            const titleList = titlesOnPage
                .map(title => `${title.emoji} **${title.name}** (${title.rarity})${title.active ? ' ✅' : ''}`)
                .join('\n');

            embed.addFields({
                name: `📋 Available Titles (${startIndex + 1}-${endIndex} of ${playerTitles.available.length})`,
                value: titleList,
                inline: false
            });
        }

        // Create select menu and components (same as in the command)
        const components = this.createTitleComponents(user, titlesOnPage, page, totalPages);

        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    }

    createTitleComponents(user, titlesOnPage, page, totalPages) {
        const components = [];
        const selectOptions = [];

        // Always add "No Title" as first option
        selectOptions.push({
            label: '🚫 No Title Equipped',
            description: 'Remove all equipped titles and roles',
            value: `${user.id}|${user.guild?.id || 'unknown'}|unequip|${page}`,
            emoji: '🚫'
        });

        // Add titles for this page
        titlesOnPage.forEach(title => {
            const rarityEmoji = {
                'mythic': '🌟',
                'legendary': '⭐', 
                'epic': '💜',
                'rare': '💙',
                'uncommon': '💚',
                'common': '🤍'
            };

            const activeIndicator = title.active ? ' (Currently Equipped)' : '';
            let description = title.description;
            if (description.length > 100) {
                description = description.substring(0, 97) + '...';
            }

            selectOptions.push({
                label: `${title.emoji} ${title.name}${activeIndicator}`,
                description: `${rarityEmoji[title.rarity]} ${title.rarity} - ${description}`,
                value: `${user.id}|${user.guild?.id || 'unknown'}|${title.id}|${page}`,
                emoji: title.emoji
            });
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('titles_equip_select')
            .setPlaceholder('Select a title to equip or unequip all')
            .addOptions(selectOptions);

        components.push(new ActionRowBuilder().addComponents(selectMenu));

        // Add pagination buttons if needed
        if (totalPages > 1) {
            const buttons = [];

            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`titles_page_prev_${user.id}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0)
            );

            buttons.push(
                new ButtonBuilder()
                    .setCustomId('titles_page_indicator')
                    .setLabel(`Page ${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`titles_page_next_${user.id}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages - 1)
            );

            components.push(new ActionRowBuilder().addComponents(buttons));
        }

        return components;
    }

    // Cleanup method to remove listeners when needed
    cleanup() {
        this.removeExistingListeners();
        
        if (this.client.titleEquipHandlers) {
            this.client.titleEquipHandlers.delete(this.guildId);
        }
        
        console.log(`[TITLE_EQUIP] Cleaned up handler for guild ${this.guildId}`);
    }

    getStats() {
        return {
            ...this.performanceStats,
            guildId: this.guildId
        };
    }
}

// Static method to create handlers for all guilds
TitleEquipHandler.createForAllGuilds = function(client) {
    const handlers = new Map();
    
    client.guilds.cache.forEach(guild => {
        try {
            const handler = new TitleEquipHandler(client, guild.id);
            handlers.set(guild.id, handler);
            console.log(`[TITLE_EQUIP] Created handler for guild ${guild.name} (${guild.id})`);
        } catch (error) {
            console.error(`[TITLE_EQUIP] Failed to create handler for guild ${guild.id}:`, error);
        }
    });
    
    return handlers;
};

// Static method to cleanup all handlers
TitleEquipHandler.cleanupAll = function(client) {
    if (client.titleEquipHandlers) {
        client.titleEquipHandlers.forEach(handler => {
            handler.cleanup();
        });
        client.titleEquipHandlers.clear();
    }
};

module.exports = TitleEquipHandler;

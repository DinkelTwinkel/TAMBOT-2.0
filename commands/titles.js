const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { getPlayerTitles, TITLES } = require('../patterns/gachaModes/mining/titleSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('titles')
        .setDescription('View and equip your mining titles and achievements'),

    async execute(interaction) {
        const user = interaction.user;

        try {
            // Show the titles list with select menu directly
            await this.showTitlesMenu(interaction, user, 0);
        } catch (error) {
            console.error('[Titles Command] Error:', error);
            await interaction.reply({ content: '❌ An error occurred while loading your titles.', ephemeral: true });
        }
    },

    async showTitlesMenu(interaction, user, page = 0) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        let playerTitles;
        try {
            playerTitles = await getPlayerTitles(user.id, user.displayName, interaction.guild?.id);
        } catch (dbError) {
            console.error('[TITLES] Database error getting player titles:', dbError);
            return interaction.editReply({ 
                content: '❌ Could not load your titles from the database. Please try again later.',
                components: []
            });
        }
        
        if (!playerTitles) {
            console.warn('[TITLES] getPlayerTitles returned null/undefined');
            return interaction.editReply({ 
                content: '❌ Could not access your title data. Please try again.',
                components: []
            });
        }
        
        if (!playerTitles.available || playerTitles.available.length === 0) {
            return interaction.editReply({ 
                content: '📜 You haven\'t unlocked any titles yet! Keep mining and using unique items to earn titles.',
                components: []
            });
        }

        // Pagination setup (24 titles per page + 1 for "no title")
        const itemsPerPage = 24;
        const totalPages = Math.ceil(playerTitles.available.length / itemsPerPage);
        const startIndex = page * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, playerTitles.available.length);
        const titlesOnPage = playerTitles.available.slice(startIndex, endIndex);

        // Create embed
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
                .filter(title => title && title.name) // Filter out invalid titles
                .map(title => `${title.emoji || '🏷️'} **${title.name}** (${title.rarity || 'common'})${title.active ? ' ✅' : ''}`)
                .join('\n');

            embed.addFields({
                name: `📋 Available Titles (${startIndex + 1}-${endIndex} of ${playerTitles.available.length})`,
                value: titleList,
                inline: false
            });
        }

        // Create select menu options
        const components = [];
        const selectOptions = [];

        // Always add "No Title" as first option
        selectOptions.push({
            label: '🚫 No Title Equipped',
            description: 'Remove all equipped titles and roles',
            value: `${user.id}|${interaction.guild?.id || 'unknown'}|unequip|${page}`,
            emoji: '🚫'
        });

        // Add titles for this page
        titlesOnPage.forEach(title => {
            // Add null checking for all title properties
            if (!title || !title.id || !title.name) {
                console.warn('[TITLES] Skipping invalid title:', title);
                return;
            }
            
            const rarityEmoji = {
                'mythic': '🌟',
                'legendary': '⭐', 
                'epic': '💜',
                'rare': '💙',
                'uncommon': '💚',
                'common': '🤍'
            };

            const activeIndicator = title.active ? ' (Currently Equipped)' : '';
            let description = title.description || 'No description available';
            if (description && description.length > 100) {
                description = description.substring(0, 97) + '...';
            }

            const rarity = title.rarity || 'common';
            const emoji = title.emoji || '🏷️';

            selectOptions.push({
                label: `${emoji} ${title.name}${activeIndicator}`,
                description: `${rarityEmoji[rarity] || '🤍'} ${rarity} - ${description}`,
                value: `${user.id}|${interaction.guild?.id || 'unknown'}|${title.id}|${page}`,
                emoji: emoji
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

        embed.setFooter({ text: `${playerTitles.available.length} titles unlocked • Select from menu to equip` });

        await interaction.editReply({
            embeds: [embed],
            components: components
        });

    } catch (error) {
        console.error('[Titles List] Error:', error);
        await interaction.editReply({ 
            content: '❌ An error occurred while loading your titles.', 
            components: [] 
        });
    }
    }
};

// Removed unused functions - unequip and info now handled by select menu

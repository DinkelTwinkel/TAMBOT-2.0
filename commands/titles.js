const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { getPlayerTitles, TITLES, ACHIEVEMENTS } = require('../patterns/gachaModes/mining/titleSystem');

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

        // Build achievements list
        const achievementsList = Object.values(ACHIEVEMENTS)
            .map(achievement => `${achievement.name} - ${achievement.description}`)
            .join('\n');

        // Build titles list for description
        const currentTitleText = playerTitles.display 
            ? `👑 **Currently Equipped:** ${playerTitles.display.emoji} ${playerTitles.display.name}\n*${playerTitles.display.description}*\n\n`
            : `👑 **Currently Equipped:** *No title equipped*\n\n`;

        const titlesListText = titlesOnPage
            .filter(title => title && title.name)
            .map(title => `${title.emoji || '🏷️'} **${title.name}** (${title.rarity || 'common'})${title.active ? ' ✅' : ''}\n*${title.description || 'No description'}*`)
            .join('\n\n');

        // Combine all content
        let fullDescription = `${currentTitleText}**Achievements**\n\`\`\`\n${achievementsList}\n\`\`\`\n\n**📋 Available Titles (${startIndex + 1}-${endIndex} of ${playerTitles.available.length}):**\n${titlesListText}`;

        // Handle Discord's 4096 character limit for embed descriptions
        const maxDescriptionLength = 4000; // Leave some buffer
        let descriptionToUse = fullDescription;
        let isTruncated = false;

        if (fullDescription.length > maxDescriptionLength) {
            // Try to fit at least the achievements and current title
            const essentialContent = `${currentTitleText}**Achievements**\n\`\`\`\n${achievementsList}\n\`\`\`\n\n**📋 Available Titles:** *(Showing fewer due to length limit)*\n`;
            
            if (essentialContent.length > maxDescriptionLength) {
                // If even achievements don't fit, truncate achievements
                const truncatedAchievements = achievementsList.substring(0, maxDescriptionLength - currentTitleText.length - 100) + '...';
                descriptionToUse = `${currentTitleText}**Achievements**\n\`\`\`\n${truncatedAchievements}\n\`\`\``;
            } else {
                // Fit as many titles as possible
                const remainingSpace = maxDescriptionLength - essentialContent.length;
                const truncatedTitles = titlesListText.substring(0, remainingSpace - 20) + '...';
                descriptionToUse = essentialContent + truncatedTitles;
            }
            isTruncated = true;
        }

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(`📜 ${user.displayName}'s Titles${totalPages > 1 ? ` (Page ${page + 1}/${totalPages})` : ''}`)
            .setDescription(descriptionToUse)
            .setColor('Purple');

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

        // Track used values to prevent duplicates
        const usedValues = new Set();
        usedValues.add(`${user.id}|${interaction.guild?.id || 'unknown'}|unequip|${page}`);
        
        // Add titles for this page
        titlesOnPage.forEach(title => {
            // Add null checking for all title properties
            if (!title || !title.id || !title.name) {
                console.warn('[TITLES] Skipping invalid title:', title);
                return;
            }
            
            // Create unique value
            const value = `${user.id}|${interaction.guild?.id || 'unknown'}|${title.id}|${page}`;
            
            // Skip if value already exists (prevents duplicates)
            if (usedValues.has(value)) {
                console.warn(`[TITLES] Skipping duplicate title value: ${title.id}`);
                return;
            }
            usedValues.add(value);
            
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
                value: value,
                emoji: emoji
            });
        });

        // Ensure we have valid options and don't exceed Discord's 25 option limit
        if (selectOptions.length === 0) {
            selectOptions.push({
                label: '🚫 No Titles Available',
                description: 'No titles to display on this page',
                value: `${user.id}|${interaction.guild?.id || 'unknown'}|none|${page}`,
                emoji: '🚫'
            });
        } else if (selectOptions.length > 25) {
            // Trim to 25 options (Discord limit)
            selectOptions.splice(25);
            console.warn(`[TITLES] Trimmed select options to 25 for Discord limit`);
        }

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

        const footerText = `${playerTitles.available.length} titles unlocked • Select from menu to equip${isTruncated ? ' • Some content truncated due to length' : ''}`;
        embed.setFooter({ text: footerText });

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

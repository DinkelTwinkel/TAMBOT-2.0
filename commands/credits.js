const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('credits')
    .setDescription('Show credits for artists and contributors'),

  async execute(interaction) {
    try {
      // Read the credits.json file
      const creditsPath = path.join(__dirname, '../data/credits.json');
      const creditsData = JSON.parse(fs.readFileSync(creditsPath, 'utf8'));

      // Always include the hardcoded user ID
      const hardcodedUserId = '100625124520112128';
      const hardcodedUserExists = creditsData.credits.some(credit => credit.userId === hardcodedUserId);
      
      // Create an embed for the credits
      const embed = new EmbedBuilder()
        .setTitle('🎨 Credits & Contributors')
        .setDescription('Thank you to all the artists who contributed to Hellungi.')
        .setColor(0x00AE86)
        .setTimestamp();

      // Add each credit entry as a field
      creditsData.credits.forEach((credit, index) => {
        let value = `<@${credit.userId}>`;
        
        // Add portfolio link if it exists
        if (credit.portfolioLink) {
          value += `\n[Art Link](${credit.portfolioLink})`;
        }
        
        embed.addFields({
          name: `${credit.name}`,
          value: value,
          inline: true
        });
      });

      // If the hardcoded user isn't already in the credits, add them
      if (!hardcodedUserExists) {
        embed.addFields({
          name: 'Special Contributor',
          value: `<@${hardcodedUserId}>`,
          inline: true
        });
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: false
      });

    } catch (error) {
      console.error('Error reading credits:', error);
      await interaction.reply({
        content: '❌ Unable to load credits information.',
        ephemeral: true
      });
    }
  }
};

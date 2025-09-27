const { SlashCommandBuilder } = require('discord.js');
const { processTileMapTick } = require('../patterns/tileMapTick');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('maptick')
    .setDescription('Manually trigger a tile map tick for testing (admin only)'),

  async execute(interaction) {
    try {
      // Check if user has admin permissions
      if (!interaction.member.permissions.has('Administrator')) {
        return await interaction.reply({
          content: '❌ This command requires administrator permissions.',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });
      
      const guildId = interaction.guild.id;
      
      console.log(`🔧 [MANUAL TICK] Admin ${interaction.user.tag} triggered manual tile tick for guild ${guildId}`);
      
      // Process the tile map tick
      await processTileMapTick(guildId, interaction.client);
      
      await interaction.editReply({
        content: '✅ Manual tile map tick completed! Check console logs for details.'
      });

    } catch (error) {
      console.error('Error in manual tile tick:', error);
      await interaction.editReply({
        content: '❌ Error processing tile tick. Check console logs.'
      });
    }
  }
};

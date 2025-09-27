const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { generateTileMapImage, getMapStats } = require('../patterns/mapSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('View your guild\'s hexagonal tile map with point values and gacha servers'),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      
      // Generate the tile map image and get stats
      const [mapBuffer, stats] = await Promise.all([
        generateTileMapImage(guildId),
        getMapStats(guildId)
      ]);
      
      // Create attachment
      const attachment = new AttachmentBuilder(mapBuffer, { name: 'guild_tile_map.png' });
      
      // Create info embed
      const embed = new EmbedBuilder()
        .setTitle('🗺️ Guild Tile Map')
        .setDescription('Your guild\'s hexagonal tile map showing point values and gacha server locations')
        .addFields(
          { name: '📊 Total Points', value: stats.totalPoints.toString(), inline: true },
          { name: '📈 Average Points', value: stats.averagePoints.toString(), inline: true },
          { name: '⭐ Center Tile', value: `${stats.centerTilePoints} points`, inline: true },
          { name: '🎰 Gacha Servers', value: stats.gachaTiles.toString(), inline: true },
          { name: '🔓 Available Slots', value: stats.availableForGacha.toString(), inline: true },
          { name: '🏠 Total Tiles', value: stats.totalTiles.toString(), inline: true }
        )
        .setColor(0x00AE86)
        .setImage('attachment://guild_tile_map.png')
        .setFooter({ 
          text: '⭐ = Center tile | G = Gacha server | ✦ = Influential (100+) | Black (0) → White (100+)' 
        })
        .setTimestamp();
      
      // Send ephemeral response
      await interaction.reply({
        embeds: [embed],
        files: [attachment],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error generating tile map:', error);
      await interaction.reply({
        content: '❌ Unable to generate tile map. Please try again later.',
        ephemeral: true
      });
    }
  }
};


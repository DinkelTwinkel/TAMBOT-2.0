const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { generateTileMapImage, getMapStats } = require('../patterns/mapSystem');

/**
 * Check if a channel is visible to the special role
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID to check
 * @param {Object} client - Discord client
 * @returns {Promise<string>} "ACTIVE" or "FALLEN"
 */
async function getChannelVisibilityStatus(guildId, channelId, client) {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      return 'FALLEN';
    }
    
    const channel = await guild.channels.fetch(channelId);
    if (!channel) {
      return 'FALLEN';
    }
    
    const specialRoleId = '1421477924187541504';
    const specialRole = await guild.roles.fetch(specialRoleId);
    if (!specialRole) {
      return 'FALLEN';
    }
    
    // Check if the special role can view the channel
    const canView = channel.permissionsFor(specialRole)?.has('ViewChannel');
    return canView ? 'ACTIVE' : 'FALLEN';
    
  } catch (error) {
    console.error(`Error checking channel visibility for ${channelId}:`, error);
    return 'FALLEN';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('View your guild\'s hexagonal tile map with point values and gacha servers'),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      
      // Generate the tile map image and get stats
      const [mapBuffer, stats] = await Promise.all([
        generateTileMapImage(guildId, interaction.client),
        getMapStats(guildId)
      ]);
      
      // Check marketplace and citadel status
      const [marketplaceStatus, citadelStatus] = await Promise.all([
        getChannelVisibilityStatus(guildId, '1416024145128587437', interaction.client),
        getChannelVisibilityStatus(guildId, '1407609278315102208', interaction.client)
      ]);
      
      // Create attachment
      const attachment = new AttachmentBuilder(mapBuffer, { name: 'guild_tile_map.png' });
      
      // Determine capital risk status (same logic as war map)
      const centerPoints = stats.centerTilePoints;
      let riskStatus;
      if (centerPoints < 25) {
        riskStatus = '💀 **CRITICAL** - Capital may fall!';
      } else if (centerPoints < 50) {
        riskStatus = '⚠️ **HIGH** - Under siege!';
      } else if (centerPoints < 75) {
        riskStatus = '🟡 **MODERATE** - Holding steady';
      } else {
        riskStatus = '🛡️ **LOW** - Well defended';
      }
      
      // Create health bar for CORE HP (0-1000) - same as war map
      const maxHP = 1000;
      const currentHP = Math.min(centerPoints, maxHP);
      const healthPercentage = (currentHP / maxHP) * 100;
      const healthBarLength = 20;
      const filledBars = Math.round((healthPercentage / 100) * healthBarLength);
      const emptyBars = healthBarLength - filledBars;
      
      const healthBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
      const healthBarTitle = `⚡ CORE HP\n\`${healthBar}\` ${currentHP}/${maxHP} (${healthPercentage.toFixed(1)}%)`;
      
      // Create info embed (same format as status message)
      const embed = new EmbedBuilder()
        .setTitle(healthBarTitle)
        .setDescription('Current territorial control status')
        .addFields(
          { name: '🗺️ Total Points', value: stats.totalPoints.toLocaleString(), inline: true },
          { name: '🎰 Active Gacha', value: stats.gachaTiles.toString(), inline: true },
          { name: '⚠️ Capital at Risk', value: riskStatus, inline: false },
          { name: '🏪 Marketplace', value: marketplaceStatus, inline: true },
          { name: '🏰 Capital', value: citadelStatus, inline: true }
        )
        .setColor(centerPoints < 25 ? 0xff0000 : centerPoints < 50 ? 0xffaa00 : 0x00ff00)
        .setFooter({ text: 'STATUS' })
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


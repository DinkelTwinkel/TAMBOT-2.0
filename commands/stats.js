const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const getPlayerStats = require('../patterns/calculatePlayerStat');
const PlayerBuffs = require('../models/PlayerBuff');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your complete mining stats, equipment, and active buffs')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to check stats for')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Get the target user (either specified user or the command user)
    const target = interaction.options.getUser('user') || interaction.user;
    
    // Defer reply as this might take a moment to calculate
    await interaction.deferReply();

    try {
      // Get player stats and best items
      const { stats, bestItems } = await getPlayerStats(target.id);
      
      // Get active buffs for display
      const buffDoc = await PlayerBuffs.findOne({ playerId: target.id });
      const now = new Date();
      const activeBuffs = buffDoc?.buffs?.filter(buff => buff.expiresAt > now) || [];

      // Create the embed
      const embed = new EmbedBuilder()
        .setTitle(`⛏️ ${target.username}'s Mining Stats`)
        .setColor(0x00AE86)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: 'HELLUNGI Mining System' });

      // Add total stats field (includes equipment + buffs)
      if (Object.keys(stats).length > 0) {
        const statsDisplay = Object.entries(stats)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ability, power]) => {
            // Add appropriate emoji for each stat type
            const emoji = getStatEmoji(ability);
            return `${emoji} **${capitalize(ability)}:** ${power}`;
          })
          .join('\n');
        
        embed.addFields({
          name: '📊 Total Stats',
          value: statsDisplay || '*No stats yet*',
          inline: false
        });
      } else {
        embed.addFields({
          name: '📊 Total Stats',
          value: '*No stats yet - visit the shop to get started!*',
          inline: false
        });
      }

      // Add best equipment field
      if (Object.keys(bestItems).length > 0) {
        const equipmentDisplay = Object.entries(bestItems)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ability, item]) => {
            const emoji = getStatEmoji(ability);
            const durabilityInfo = item.durability ? ` (${item.durability} durability)` : '';
            return `${emoji} **${capitalize(ability)}:** ${item.name} (+${item.power})${durabilityInfo}`;
          })
          .join('\n');
        
        embed.addFields({
          name: '🎒 Best Equipment',
          value: equipmentDisplay,
          inline: false
        });
      }

      // Add active buffs field
      if (activeBuffs.length > 0) {
        const buffsDisplay = activeBuffs.map(buff => {
          const timeLeft = getTimeRemaining(buff.expiresAt);
          const effects = Array.from(buff.effects.entries())
            .map(([ability, power]) => `${getStatEmoji(ability)} ${capitalize(ability)} +${power}`)
            .join(', ');
          return `✨ **${buff.name}**\n   ${effects}\n   *Expires in ${timeLeft}*`;
        }).join('\n\n');
        
        embed.addFields({
          name: '🔮 Active Buffs',
          value: buffsDisplay,
          inline: false
        });
      }

      // Add a summary field with key stats
      const miningPower = stats.mining || 0;
      const luckPower = stats.luck || 0;
      const speedPower = stats.speed || 0;
      const sightPower = stats.sight || 0;
      
      let summaryText = [];
      if (miningPower > 0) summaryText.push(`Mining Power: **${miningPower}**`);
      if (luckPower > 0) summaryText.push(`Luck Bonus: **${luckPower}**`);
      if (speedPower > 0) summaryText.push(`Speed Boost: **${speedPower}**`);
      if (sightPower > 0) summaryText.push(`Vision Range: **${sightPower}**`);
      
      if (summaryText.length > 0) {
        embed.addFields({
          name: '💎 Quick Summary',
          value: summaryText.join(' | '),
          inline: false
        });
      }

      // Send the embed
      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error fetching player stats:', error);
      await interaction.editReply({
        content: '❌ An error occurred while fetching stats. Please try again later.',
        ephemeral: true
      });
    }
  }
};

// Helper function to get emoji for stat type
function getStatEmoji(statType) {
  const emojiMap = {
    'mining': '⛏️',
    'luck': '🍀',
    'speed': '💨',
    'sight': '👁️',
    'attack': '⚔️',
    'defense': '🛡️',
    'health': '❤️',
    'energy': '⚡',
    'stealth': '🌫️',
    'charisma': '✨'
  };
  return emojiMap[statType.toLowerCase()] || '📈';
}

// Helper function to capitalize first letter
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Helper function to get time remaining in human-readable format
function getTimeRemaining(expiresAt) {
  const now = new Date();
  const msRemaining = expiresAt - now;
  
  if (msRemaining <= 0) return 'Expired';
  
  const seconds = Math.floor(msRemaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
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
      // Get player stats and equipped items
      const { stats, equippedItems } = await getPlayerStats(target.id);
      
      // Get active buffs for display
      const buffDoc = await PlayerBuffs.findOne({ playerId: target.id });
      const now = new Date();
      const activeBuffs = buffDoc?.buffs?.filter(buff => buff.expiresAt > now) || [];

      // Create the embed
      const embed = new EmbedBuilder()
        .setTitle(`⛏️ ${target.username}'s Stats`)
        .setColor(0x00AE86)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      // Add combined stats display (equipment + buffs)
      if (Object.keys(stats).length > 0) {
        const statsDisplay = Object.entries(stats)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ability, power]) => `${getStatEmoji(ability)} **${capitalize(ability)}:** ${power}`)
          .join(' | ');
        
        embed.addFields({
          name: '💎 Total Power',
          value: statsDisplay,
          inline: false
        });
      } else {
        embed.addFields({
          name: '💎 Total Power',
          value: '*No stats yet - visit the shop to get started!*',
          inline: false
        });
      }

      // Add equipped items field (simplified)
      if (Object.keys(equippedItems).length > 0) {
        const itemsList = Object.values(equippedItems)
          .map(item => {
            const statsStr = item.abilities
              .map(a => `${a.name} +${a.power}`)
              .join(', ');
            return `• **${item.name}** (${statsStr})`;
          })
          .join('\n');
        
        embed.addFields({
          name: '🎒 Equipment',
          value: itemsList,
          inline: false
        });
      }

      // Add active buffs field (simplified)
      if (activeBuffs.length > 0) {
        const buffsDisplay = activeBuffs.map(buff => {
          const timeLeft = getTimeRemaining(buff.expiresAt);
          const effects = Array.from(buff.effects.entries())
            .map(([ability, power]) => `${ability} +${power}`)
            .join(', ');
          return `• **${buff.name}** (${effects}) - *${timeLeft}*`;
        }).join('\n');
        
        embed.addFields({
          name: '✨ Active Buffs',
          value: buffsDisplay,
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
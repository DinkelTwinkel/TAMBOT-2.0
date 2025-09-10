const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const PlayerBuffs = require('../models/PlayerBuff');
const registerBotMessage = require('../patterns/registerBotMessage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buffs')
    .setDescription('View all your active buffs in detail')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to check buffs for')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Get the target user (either specified user or the command user)
    const target = interaction.options.getUser('user') || interaction.user;
    
    // Defer reply as this might take a moment to calculate
    await interaction.deferReply();

    try {
      // Get active buffs for display
      const buffDoc = await PlayerBuffs.findOne({ playerId: target.id });
      const now = new Date();
      const activeBuffs = buffDoc?.buffs?.filter(buff => buff.expiresAt > now) || [];

      // Get user's role color from guild member
      let roleColor = 0x00AE86; // Default color
      try {
        const guildMember = await interaction.guild.members.fetch(target.id);
        if (guildMember && guildMember.displayHexColor && guildMember.displayHexColor !== '#000000') {
          roleColor = parseInt(guildMember.displayHexColor.replace('#', ''), 16);
        }
      } catch (memberError) {
        console.warn('[BUFFS] Could not fetch guild member for role color:', memberError);
      }

      if (activeBuffs.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle(`✨ ${target.username}'s Active Buffs`)
          .setDescription('*No active buffs*\n\nVisit the shop to buy consumables for temporary stat boosts!')
          .setColor(roleColor);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Group buffs by type for better organization
      const buffsByType = {
        permanent: [],
        temporary: [],
        equipment: []
      };

      for (const buff of activeBuffs) {
        const timeLeft = getTimeRemaining(buff.expiresAt);
        const effects = Array.from(buff.effects.entries())
          .map(([ability, power]) => {
            const sign = power >= 0 ? '+' : '';
            return `${getStatEmoji(ability)} ${ability} ${sign}${power}`;
          })
          .join(', ');
        
        const buffDisplay = {
          name: buff.name,
          effects: effects,
          timeLeft: timeLeft,
          line: `• **${buff.name}**\n  ${effects}\n  ⏰ *${timeLeft}*`
        };

        // Categorize buffs
        if (buff.name.includes('Equipment') || buff.name.includes('Gear')) {
          buffsByType.equipment.push(buffDisplay);
        } else if (timeLeft.includes('d') || timeLeft.includes('h')) {
          buffsByType.permanent.push(buffDisplay);
        } else {
          buffsByType.temporary.push(buffDisplay);
        }
      }

      // Create embeds - split into multiple if needed
      const embeds = [];
      let currentEmbed = new EmbedBuilder()
        .setTitle(`✨ ${target.username}'s Active Buffs (${activeBuffs.length})`)
        .setColor(roleColor);

      let currentDescription = '';
      const maxDescriptionLength = 4000;

      // Add buffs by category
      const categories = [
        { name: '🏆 **Long-Term Buffs**', buffs: buffsByType.permanent },
        { name: '⚡ **Temporary Buffs**', buffs: buffsByType.temporary },
        { name: '🛡️ **Equipment Buffs**', buffs: buffsByType.equipment }
      ];

      for (const category of categories) {
        if (category.buffs.length === 0) continue;

        const categoryHeader = `\n${category.name}\n`;
        const categoryContent = category.buffs.map(b => b.line).join('\n');
        const categorySection = categoryHeader + categoryContent + '\n';

        // Check if adding this category would exceed the limit
        if (currentDescription.length + categorySection.length > maxDescriptionLength) {
          // Finalize current embed and start a new one
          if (currentDescription.trim()) {
            currentEmbed.setDescription(currentDescription.trim());
            embeds.push(currentEmbed);
          }

          // Start new embed
          currentEmbed = new EmbedBuilder()
            .setTitle(`✨ ${target.username}'s Active Buffs (continued)`)
            .setColor(roleColor);
          currentDescription = categorySection;
        } else {
          currentDescription += categorySection;
        }
      }

      // Add the final embed
      if (currentDescription.trim()) {
        currentEmbed.setDescription(currentDescription.trim());
        embeds.push(currentEmbed);
      }

      // If still no embeds (shouldn't happen), create a fallback
      if (embeds.length === 0) {
        embeds.push(new EmbedBuilder()
          .setTitle(`✨ ${target.username}'s Active Buffs`)
          .setDescription('*Error displaying buffs - too much data*')
          .setColor(roleColor));
      }

      // Add footer to last embed
      const lastEmbed = embeds[embeds.length - 1];
      if (embeds.length > 1) {
        lastEmbed.setFooter({ text: `Showing ${activeBuffs.length} total buffs across ${embeds.length} pages` });
      } else {
        lastEmbed.setFooter({ text: `${activeBuffs.length} active buffs` });
      }

      const reply = await interaction.editReply({ embeds });
      
      // Register for auto-cleanup after 10 minutes
      await registerBotMessage(interaction.guild.id, interaction.channel.id, reply.id, 10);

    } catch (error) {
      console.error('Error fetching player buffs:', error);
      await interaction.editReply({
        content: '❌ An error occurred while fetching buffs. Please try again later.',
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

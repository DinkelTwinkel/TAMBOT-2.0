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

      const embed = new EmbedBuilder()
        .setTitle(`📜 ${target.username}'s Stats`)
        .setColor(0x00AE86)
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

      // Build equipment description with categories and durability bars
      if (Object.keys(equippedItems).length > 0) {
        // Group items by type
        const tools = [];
        const equipment = [];
        const charms = [];
        
        for (const item of Object.values(equippedItems)) {
          // Format stats with actual power shown (for unique items with maintenance scaling)
          const statsStr = item.abilities
            .map(a => {
              // Show base power in parentheses if it's scaled down
              if (item.isUnique && a.basePower && a.power !== a.basePower) {
                return `${a.name} +${a.power} (${a.basePower})`;
              }
              return `${a.name} +${a.power}`;
            })
            .join(', ');
          
          // Categorize by type
          if (item.type === 'tool' || item.type === 'equipment') {
            // Calculate durability percentage and add visual indicator for tools and equipment
            const maxDurability = item.durability || 100;
            const currentDurability = item.currentDurability !== undefined ? item.currentDurability : maxDurability;
            const durabilityPercent = Math.round((currentDurability / maxDurability) * 100);
            const durabilityBar = getDurabilityBar(durabilityPercent);
            
            // Format with primary stat inline and additional stats on separate lines
            let itemDisplay;
            
            // Add legendary indicator for unique items
            const itemName = item.isUnique ? `🌟 ${item.name} [LEGENDARY]` : item.name;
            
            if (item.abilities.length === 1) {
              // Single stat - show inline
              if (item.isUnique) {
                // Unique items don't show durability bar
                itemDisplay = `• ${itemName} **(${statsStr})**`;
              } else {
                itemDisplay = `• ${itemName} **(${statsStr})**\n  ${durabilityBar} ${currentDurability}/${maxDurability} (${durabilityPercent}%)`;
              }
            } else {
              // Multiple stats - show first inline, rest with └
              const primaryStat = item.abilities[0].basePower && item.isUnique && item.abilities[0].power !== item.abilities[0].basePower
                ? `${item.abilities[0].name} +${item.abilities[0].power} (${item.abilities[0].basePower})`
                : `${item.abilities[0].name} +${item.abilities[0].power}`;
              const additionalStats = item.abilities.slice(1)
                .map(a => {
                  if (item.isUnique && a.basePower && a.power !== a.basePower) {
                    return `${a.name} +${a.power} (${a.basePower})`;
                  }
                  return `${a.name} +${a.power}`;
                })
                .join(', ');
              
              if (item.isUnique) {
                // Unique items don't show durability bar
                itemDisplay = `• ${itemName} **(${primaryStat})**\n  └ ${additionalStats}`;
              } else {
                itemDisplay = `• ${itemName} **(${primaryStat})**\n  ${durabilityBar} ${currentDurability}/${maxDurability} (${durabilityPercent}%)\n  └ ${additionalStats}`;
              }
            }
            
            // Add maintenance level for unique items
            if (item.isUnique && item.maintenanceLevel !== undefined) {
              const maintBar = getMaintenanceBar(item.maintenanceLevel);
              itemDisplay += `\n  📧 Maintenance: ${maintBar} ${item.maintenanceLevel}/10`;
            }
            
            // Add special effects for unique items (simplified)
            if (item.isUnique && item.specialEffects && item.specialEffects.length > 0) {
              const effectCount = item.specialEffects.length;
              itemDisplay += `\n  ✨ ${effectCount} special effect${effectCount > 1 ? 's' : ''} (use /unique status for details)`;
            }
            
            if (item.type === 'tool') {
              tools.push(itemDisplay);
            } else {
              equipment.push(itemDisplay);
            }
          } else if (item.type === 'charm') {
            // Simplified format for charms - no durability needed
            const charmName = item.isUnique ? `🌟 ${item.name}` : item.name;
            charms.push({ name: charmName, stats: statsStr, isUnique: item.isUnique });
          }
        }
        
        // Build description sections
        const descriptionParts = [];
        
        if (tools.length > 0) {
          descriptionParts.push(`**⛏️ Tools**\n${tools.join('\n')}`);
        }
        
        if (equipment.length > 0) {
          descriptionParts.push(`**🛡️ Equipment**\n${equipment.join('\n')}`);
        }
        
        if (charms.length > 0) {
          // Format charms in a code block for cleaner display
          const maxNameLength = Math.max(...charms.map(c => c.name.length));
          const charmLines = charms.map(charm => {
            const padding = ' '.repeat(maxNameLength - charm.name.length + 2);
            return `${charm.name}${padding}│ ${charm.stats}`;
          });
          
          descriptionParts.push(`**✨ Charms**\n\`\`\`\n${charmLines.join('\n')}\n\`\`\``);
        }
        
        // Set the description with all equipment
        if (descriptionParts.length > 0) {
          embed.setDescription(descriptionParts.join('\n\n'));
        }
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

// Helper function to create a maintenance bar for unique items
function getMaintenanceBar(level) {
  const barLength = 10;
  const filled = level;
  const empty = barLength - filled;
  
  let barChar, emptyChar;
  
  if (level > 7) {
    barChar = '🟩';
    emptyChar = '⬜';
  } else if (level > 4) {
    barChar = '🟨';
    emptyChar = '⬜';
  } else if (level > 2) {
    barChar = '🟧';
    emptyChar = '⬜';
  } else {
    barChar = '🟥';
    emptyChar = '⬜';
  }
  
  return `${barChar.repeat(filled)}${emptyChar.repeat(empty)}`;
}

// Helper function to create a visual durability bar
function getDurabilityBar(percent) {
  const barLength = 10;
  const filled = Math.round((percent / 100) * barLength);
  const empty = barLength - filled;
  
  let barChar, emptyChar, emoji;
  
  if (percent > 75) {
    barChar = '🟩';
    emptyChar = '⬜';
    emoji = '🛡️';
  } else if (percent > 50) {
    barChar = '🟨';
    emptyChar = '⬜';
    emoji = '⚠️';
  } else if (percent > 25) {
    barChar = '🟧';
    emptyChar = '⬜';
    emoji = '⚠️';
  } else {
    barChar = '🟥';
    emptyChar = '⬜';
    emoji = '🔨';
  }
  //${emoji} 
  return `${barChar.repeat(filled)}${emptyChar.repeat(empty)}`;
}
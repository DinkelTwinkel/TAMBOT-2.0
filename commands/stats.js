const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const getPlayerStats = require('../patterns/calculatePlayerStat');
const PlayerBuffs = require('../models/PlayerBuff');
const PlayerProfile = require('../models/PlayerProfile');
const registerBotMessage = require('../patterns/registerBotMessage');
const { createStatsThumb } = require('../patterns/gachaModes/mining/imageProcessing/statsThumbnailer');

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
      // Get player stats and equipped items (including armor data)
      const { stats, equippedItems, totalArmorPoints, bestArmor } = await getPlayerStats(target.id);
      const { calculateDamageReduction } = require('../patterns/calculatePlayerStat');
      
      // Calculate damage reduction from armor points
      const totalArmorReduction = calculateDamageReduction(totalArmorPoints);
      
      // Get active buffs for display
      const buffDoc = await PlayerBuffs.findOne({ playerId: target.id });
      const now = new Date();
      const activeBuffs = buffDoc?.buffs?.filter(buff => buff.expiresAt > now) || [];

      // Get player profile for thumbnail
      const playerProfile = await PlayerProfile.findOne({ playerId: target.id });

      // Get user's role color from guild member
      let roleColor = 0x00AE86; // Default color
      try {
        const guildMember = await interaction.guild.members.fetch(target.id);
        if (guildMember && guildMember.displayHexColor && guildMember.displayHexColor !== '#000000') {
          roleColor = parseInt(guildMember.displayHexColor.replace('#', ''), 16);
        }
      } catch (memberError) {
        console.warn('[STATS] Could not fetch guild member for role color:', memberError);
      }

      const embed = new EmbedBuilder()
        .setTitle(`📜 ${target.username}'s Stats`)
        .setColor(roleColor);

      // Generate custom stats thumbnail
      let attachment = null;
      try {
        // Get guild member for role color support in thumbnail
        const guildMember = await interaction.guild.members.fetch(target.id).catch(() => null);
        const memberForThumbnail = guildMember || target;
        
        const thumbnailResult = await createStatsThumb(memberForThumbnail, { equippedItems }, interaction.channel?.id);
        
        if (thumbnailResult) {
          if (thumbnailResult.url) {
            // Use cached URL
            embed.setThumbnail(thumbnailResult.url);
          } else if (thumbnailResult.buffer) {
            // Use generated buffer
            attachment = new AttachmentBuilder(thumbnailResult.buffer, { name: 'stats-thumb.png' });
            embed.setThumbnail('attachment://stats-thumb.png');
          }
        } else {
          // Fallback to Discord avatar
          const avatarUrl = target.displayAvatarURL({ 
            dynamic: true, 
            size: 512,
            format: 'png'
          });
          embed.setThumbnail(avatarUrl);
        }
      } catch (thumbnailError) {
        console.error('Failed to generate stats thumbnail:', thumbnailError);
        // Fallback to Discord avatar
        try {
          const avatarUrl = target.displayAvatarURL({ 
            dynamic: true, 
            size: 512,
            format: 'png'
          });
          embed.setThumbnail(avatarUrl);
        } catch (avatarError) {
          console.error('Failed to set fallback avatar:', avatarError);
        }
      }

      // Add combined stats display (equipment + buffs)
      if (Object.keys(stats).length > 0) {
        const statsDisplay = Object.entries(stats)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ability, power]) => {
            const sign = power >= 0 ? '+' : '';
            return `${getStatEmoji(ability)} **${capitalize(ability)}:** ${sign}${power}`;
          })
          .join(' | ');
        
        embed.addFields({
          name: 'Total Power',
          value: statsDisplay,
          inline: false
        });
      } else {
        embed.addFields({
          name: 'Total Power',
          value: '*No stats yet - visit the shop to get started!*',
          inline: false
        });
      }

      // Add armor protection display
      if (totalArmorPoints > 0 && bestArmor) {
        const armorPercentage = Math.round(totalArmorReduction * 100);
        const armorStatPoints = stats.armor || 0; // Use the actual armor stat shown in Total Power
        
        embed.addFields({
          name: '🛡️ Armor Protection',
          value: `${armorPercentage}% damage reduction (${armorStatPoints} armor points)`,
          inline: false
        });
      }

      // Build equipment description with categories and durability bars
      if (Object.keys(equippedItems).length > 0) {
        // Group items by type and rarity
        const legendaryItems = [];
        const tools = [];
        const equipment = [];
        const charms = [];
        
        for (const item of Object.values(equippedItems)) {
          // Format stats with actual power shown (for unique items with maintenance scaling)
          const statsStr = item.abilities
            .map(a => {
              const power = a.power || a.powerlevel || 0;
              const sign = power >= 0 ? '+' : '';
              // Show base power in parentheses if it's scaled down
              if (item.isUnique && a.basePower && power !== a.basePower) {
                return `${a.name} ${sign}${power} (${a.basePower})`;
              }
              return `${a.name} ${sign}${power}`;
            })
            .join(', ');
          
          // Categorize by type
          if (item.type === 'tool' || item.type === 'equipment') {
            // Calculate durability percentage and add visual indicator for tools and equipment
            const maxDurability = item.durability || 100;
            const currentDurability = item.currentDurability !== undefined ? item.currentDurability : maxDurability;
            // Ensure we don't divide by zero and handle edge cases
            const durabilityPercent = maxDurability > 0 
              ? Math.round((currentDurability / maxDurability) * 100)
              : 100; // Default to 100% if maxDurability is 0 or invalid
            const durabilityBar = getDurabilityBar(durabilityPercent);
            
            // Format with primary stat inline and additional stats on separate lines
            let itemDisplay;
            
            // Regular item name (no legendary tag here anymore)
            const itemName = item.name;
            
            // Check if legendary and format accordingly
            if (item.isUnique) {
              // Store legendary items separately for special formatting
              legendaryItems.push(item);
              continue; // Skip to next item
            }
            
            if (item.abilities.length === 1) {
              // Single stat - show inline
              itemDisplay = `• ${itemName} **(${statsStr})**\n  ${durabilityBar} ${currentDurability}/${maxDurability} (${durabilityPercent}%)`;
            } else {
              // Multiple stats - show first inline, rest with └
              const primaryPower = item.abilities[0].power || item.abilities[0].powerlevel || 0;
              const primarySign = primaryPower >= 0 ? '+' : '';
              const primaryStat = `${item.abilities[0].name} ${primarySign}${primaryPower}`;
              const additionalStats = item.abilities.slice(1)
                .map(a => {
                  const power = a.power || a.powerlevel || 0;
                  const sign = power >= 0 ? '+' : '';
                  return `${a.name} ${sign}${power}`;
                })
                .join(', ');
              
              itemDisplay = `• ${itemName} **(${primaryStat})**\n  ${durabilityBar} ${currentDurability}/${maxDurability} (${durabilityPercent}%)\n  └ ${additionalStats}`;
            }
            
            if (item.type === 'tool') {
              tools.push(itemDisplay);
            } else {
              equipment.push(itemDisplay);
            }
          } else if (item.type === 'charm') {
            // Check if legendary charm
            if (item.isUnique) {
              legendaryItems.push(item);
            } else {
              // Simplified format for regular charms - no durability needed
              charms.push({ name: item.name, stats: statsStr, isUnique: false });
            }
          }
        }
        
        // Build description sections
        const descriptionParts = [];
        
        // Add legendary items at the top with special formatting
        if (legendaryItems.length > 0) {
          let legendarySection = '';
          
          for (let i = 0; i < legendaryItems.length; i++) {
            const legendary = legendaryItems[i];
            
            // Each legendary item gets its own header and section
            legendarySection += `# **${legendary.name} [LEGENDARY]**\n`;
            
            // List all stats in code block
            const statsLine = legendary.abilities
              .map(ability => {
                const sign = ability.power >= 0 ? '+' : '';
                const powerDisplay = ability.basePower && ability.power !== ability.basePower
                  ? `${ability.name} ${sign}${ability.power} (base: ${ability.basePower})`
                  : `${ability.name} ${sign}${ability.power}`;
                return powerDisplay;
              })
              .join(', ');
            legendarySection += `${statsLine}\n`;

            // Add special effects count
            if (legendary.specialEffects && legendary.specialEffects.length > 0) {
              const effectCount = legendary.specialEffects.length;
              legendarySection += `✨ ${effectCount} special effect${effectCount > 1 ? 's' : ''} (use /unique status for details)\n`;
            }
            
            // Add maintenance level if applicable
            if (legendary.maintenanceLevel !== undefined) {
              const maintBar = getMaintenanceBar(legendary.maintenanceLevel);
              legendarySection += `🔧 MAINTAIN: ${maintBar} ${legendary.maintenanceLevel}/10`;
            }
            
            // Add spacing between multiple legendary items
            if (i < legendaryItems.length - 1) {
              legendarySection += '\n\n';
            }
          }
          
          descriptionParts.push(legendarySection);
        }
        
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

      // Prepare active buffs display
      let buffsEmbed = null;
      if (activeBuffs.length > 0) {
        const buffsDisplay = activeBuffs.map(buff => {
          const timeLeft = getTimeRemaining(buff.expiresAt);
          const effects = Array.from(buff.effects.entries())
            .map(([ability, power]) => {
              const sign = power >= 0 ? '+' : '';
              return `${getStatEmoji(ability)} ${ability} ${sign}${power}`;
            })
            .join(', ');
          return `• **${buff.name}** (${effects}) - *${timeLeft}*`;
        }).join('\n');
        
        // More accurate embed length calculation
        const embedTitle = embed.data.title || '';
        const embedDescription = embed.data.description || '';
        const embedFields = embed.data.fields || [];
        
        // Calculate current embed size more accurately
        let currentEmbedLength = embedTitle.length + embedDescription.length;
        for (const field of embedFields) {
          currentEmbedLength += (field.name || '').length + (field.value || '').length;
        }
        
        const buffsFieldLength = buffsDisplay.length + '✨ Active Buffs'.length;
        const totalLength = currentEmbedLength + buffsFieldLength;
        
        console.log(`[STATS] Embed length check: current=${currentEmbedLength}, buffs=${buffsFieldLength}, total=${totalLength}`);
        
        // Use more conservative limit and handle very long buff lists
        if (totalLength > 5500 || buffsDisplay.length > 1000) {
          console.log(`[STATS] Moving buffs to separate embed due to length: ${totalLength} chars`);
          
          // If buffs display itself is too long, truncate it intelligently
          let finalBuffsDisplay = buffsDisplay;
          if (buffsDisplay.length > 4000) {
            console.log(`[STATS] Buffs display too long (${buffsDisplay.length} chars), truncating...`);
            
            // Start with fewer buffs and build up to fit in limit
            let truncatedBuffs = [];
            let currentLength = 0;
            const maxLength = 3800; // Leave room for footer message
            
            for (const buff of activeBuffs) {
              const timeLeft = getTimeRemaining(buff.expiresAt);
              const effects = Array.from(buff.effects.entries())
                .map(([ability, power]) => {
                  const sign = power >= 0 ? '+' : '';
                  return `${getStatEmoji(ability)} ${ability} ${sign}${power}`;
                })
                .join(', ');
              const buffLine = `• **${buff.name}** (${effects}) - *${timeLeft}*\n`;
              
              if (currentLength + buffLine.length > maxLength) {
                break; // Stop adding buffs if we'd exceed the limit
              }
              
              truncatedBuffs.push(buffLine);
              currentLength += buffLine.length;
            }
            
            const remainingCount = activeBuffs.length - truncatedBuffs.length;
            finalBuffsDisplay = truncatedBuffs.join('');
            
            if (remainingCount > 0) {
              finalBuffsDisplay += `\n📋 *... and ${remainingCount} more buffs*\n💡 *Use \`/buffs\` to see all active buffs*`;
            }
            
            console.log(`[STATS] Truncated to ${truncatedBuffs.length}/${activeBuffs.length} buffs, final length: ${finalBuffsDisplay.length}`);
          }
          
          // Create separate buffs embed
          buffsEmbed = new EmbedBuilder()
            .setTitle(`✨ ${target.username}'s Active Buffs (${activeBuffs.length})`)
            .setDescription(finalBuffsDisplay)
            .setColor(roleColor);
        } else {
          // Add to main embed
          embed.addFields({
            name: `✨ Active Buffs (${activeBuffs.length})`,
            value: buffsDisplay,
            inline: false
          });
        }
      }

      // Send the embed(s) with safety checks
      const embeds = [embed];
      if (buffsEmbed) {
        embeds.push(buffsEmbed);
      }
      
      // Final safety check - validate embed sizes
      for (let i = 0; i < embeds.length; i++) {
        const embedData = embeds[i].data;
        const totalLength = (embedData.title || '').length + 
                           (embedData.description || '').length +
                           (embedData.fields || []).reduce((total, field) => 
                             total + (field.name || '').length + (field.value || '').length, 0);
        
        if (totalLength > 6000) {
          console.warn(`[STATS] Embed ${i} still too long (${totalLength} chars), creating emergency fallback`);
          embeds[i] = new EmbedBuilder()
            .setTitle(`📜 ${target.username}'s Stats`)
            .setDescription(`⚠️ **Display error - too much data**\n\nTotal stats: ${Object.keys(stats).length} stats\nActive buffs: ${activeBuffs.length} buffs\n\n💡 Try \`/buffs\` to view buffs separately`)
            .setColor(roleColor);
        }
      }
      
      const replyOptions = { embeds };
      if (attachment) {
        replyOptions.files = [attachment];
      }
      
      const reply = await interaction.editReply(replyOptions);
      
      // Register for auto-cleanup after 10 minutes
      await registerBotMessage(interaction.guild.id, interaction.channel.id, reply.id, 10);

    } catch (error) {
      console.error('Error fetching player stats:', error);
      
      // Check if it's specifically a character limit error
      if (error.message && error.message.includes('Invalid Form Body')) {
        console.error('[STATS] Discord embed character limit exceeded, attempting emergency fallback');
        try {
          // Emergency fallback - send minimal stats without buffs
          const fallbackEmbed = new EmbedBuilder()
            .setTitle(`📜 ${target.username}'s Stats`)
            .setDescription('⚠️ **Stats display truncated due to too many buffs**\n\nUse `/buffs` to view all active buffs separately.')
            .setColor(roleColor);
            
          if (Object.keys(stats).length > 0) {
            const statsDisplay = Object.entries(stats)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([ability, power]) => {
                const sign = power >= 0 ? '+' : '';
                return `${getStatEmoji(ability)} **${capitalize(ability)}:** ${sign}${power}`;
              })
              .join(' | ');
            
            fallbackEmbed.addFields({
              name: 'Total Power',
              value: statsDisplay,
              inline: false
            });
          }
          
          await interaction.editReply({ embeds: [fallbackEmbed] });
          return;
        } catch (fallbackError) {
          console.error('[STATS] Emergency fallback also failed:', fallbackError);
        }
      }
      
      await interaction.editReply({
        content: '❌ An error occurred while fetching stats. This might be due to too many active buffs. Please try again later.',
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
  // Validate and clamp percent to 0-100 range
  if (isNaN(percent) || percent === null || percent === undefined) {
    percent = 100; // Default to full durability if invalid
  }
  percent = Math.max(0, Math.min(100, percent)); // Clamp between 0 and 100
  
  const barLength = 10;
  const filled = Math.round((percent / 100) * barLength);
  const empty = barLength - filled;
  
  // Extra validation to ensure filled and empty are valid
  const validFilled = Math.max(0, Math.min(barLength, filled));
  const validEmpty = Math.max(0, barLength - validFilled);
  
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
  return `${barChar.repeat(validFilled)}${emptyChar.repeat(validEmpty)}`;
}


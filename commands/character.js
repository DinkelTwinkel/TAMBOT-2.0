const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const PlayerProfile = require('../models/PlayerProfile');

// Constants for profile picture storage
const PROFILE_STORAGE_GUILD_ID = '1221772148385910835';
const PROFILE_STORAGE_CHANNEL_ID = '1408543899185840250';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('character')
    .setDescription('Manage your character profile')
    .addSubcommand(subcommand =>
      subcommand
        .setName('profilepicture')
        .setDescription('Set or update your profile picture')
        .addAttachmentOption(option =>
          option
            .setName('image')
            .setDescription('The image to use as your profile picture')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('removeprofile')
        .setDescription('Remove your profile picture')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your character profile')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user whose profile to view')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'profilepicture':
        return this.handleProfilePicture(interaction);
      case 'removeprofile':
        return this.handleRemoveProfile(interaction);
      case 'view':
        return this.handleViewProfile(interaction);
      default:
        return interaction.reply({
          content: '❌ Unknown subcommand.',
          ephemeral: true
        });
    }
  },

  async handleProfilePicture(interaction) {
    const attachment = interaction.options.getAttachment('image');
    
    // Validate attachment is an image
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validImageTypes.includes(attachment.contentType)) {
      return interaction.reply({
        content: '❌ Please upload a valid image file (JPG, PNG, GIF, or WebP).',
        ephemeral: true
      });
    }

    // Check file size (Discord CDN limit is usually 8MB for regular users)
    if (attachment.size > 8 * 1024 * 1024) {
      return interaction.reply({
        content: '❌ Image file size must be under 8MB.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Get the storage guild and channel
      const storageGuild = await interaction.client.guilds.fetch(PROFILE_STORAGE_GUILD_ID);
      if (!storageGuild) {
        throw new Error('Storage guild not found');
      }

      const storageChannel = await storageGuild.channels.fetch(PROFILE_STORAGE_CHANNEL_ID);
      if (!storageChannel || !storageChannel.isTextBased()) {
        throw new Error('Storage channel not found or is not a text channel');
      }

      // Check if user already has a profile picture and delete the old message
      const existingProfile = await PlayerProfile.findOne({ playerId: interaction.user.id });
      if (existingProfile?.profilePicture?.messageId) {
        try {
          const oldMessage = await storageChannel.messages.fetch(existingProfile.profilePicture.messageId);
          if (oldMessage) {
            await oldMessage.delete();
          }
        } catch (err) {
          // Message might already be deleted, continue
          console.log('Could not delete old profile picture message:', err.message);
        }
      }

      // Upload the new image to the storage channel
      const embed = new EmbedBuilder()
        .setTitle(`Profile Picture - ${interaction.user.tag}`)
        .setDescription(`User ID: ${interaction.user.id}`)
        .setImage(attachment.url)
        .setColor(0x00AE86)
        .setTimestamp();

      const sentMessage = await storageChannel.send({
        content: `Profile picture for <@${interaction.user.id}>`,
        embeds: [embed]
      });

      // Get the permanent CDN URL for the attachment
      const imageUrl = sentMessage.embeds[0]?.image?.url || attachment.url;

      // Save or update the profile in MongoDB
      let profile = await PlayerProfile.findOne({ playerId: interaction.user.id });
      if (!profile) {
        profile = new PlayerProfile({
          playerId: interaction.user.id
        });
      }

      await profile.updateProfilePicture(
        imageUrl,
        sentMessage.id,
        PROFILE_STORAGE_CHANNEL_ID,
        PROFILE_STORAGE_GUILD_ID
      );

      // Success response
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Profile Picture Updated!')
        .setDescription('Your profile picture has been successfully updated.')
        .setThumbnail(imageUrl)
        .setColor(0x00FF00)
        .setFooter({ text: 'Your new profile picture will appear in /stats and other commands' })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error updating profile picture:', error);
      await interaction.editReply({
        content: '❌ An error occurred while updating your profile picture. Please try again later.',
        ephemeral: true
      });
    }
  },

  async handleRemoveProfile(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const profile = await PlayerProfile.findOne({ playerId: interaction.user.id });
      
      if (!profile || !profile.profilePicture?.url) {
        return interaction.editReply({
          content: '❌ You don\'t have a profile picture set.',
          ephemeral: true
        });
      }

      // Try to delete the message from the storage channel
      if (profile.profilePicture.messageId) {
        try {
          const storageGuild = await interaction.client.guilds.fetch(PROFILE_STORAGE_GUILD_ID);
          const storageChannel = await storageGuild.channels.fetch(PROFILE_STORAGE_CHANNEL_ID);
          const message = await storageChannel.messages.fetch(profile.profilePicture.messageId);
          if (message) {
            await message.delete();
          }
        } catch (err) {
          console.log('Could not delete profile picture message:', err.message);
        }
      }

      // Clear the profile picture from database
      await profile.clearProfilePicture();

      await interaction.editReply({
        content: '✅ Your profile picture has been removed. Your Discord avatar will be used instead.',
        ephemeral: true
      });

    } catch (error) {
      console.error('Error removing profile picture:', error);
      await interaction.editReply({
        content: '❌ An error occurred while removing your profile picture. Please try again later.',
        ephemeral: true
      });
    }
  },

  async handleViewProfile(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    await interaction.deferReply();

    try {
      const profile = await PlayerProfile.findOne({ playerId: target.id });
      
      const embed = new EmbedBuilder()
        .setTitle(`🎭 ${target.username}'s Character Profile`)
        .setColor(0x00AE86)
        .setTimestamp();

      // Add profile picture or Discord avatar
      if (profile?.profilePicture?.url) {
        embed.setThumbnail(profile.profilePicture.url);
        embed.addFields({
          name: '📸 Profile Picture',
          value: '✅ Custom profile picture set',
          inline: true
        });
      } else {
        embed.setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }));
        embed.addFields({
          name: '📸 Profile Picture',
          value: 'Using Discord avatar (no custom picture set)',
          inline: true
        });
      }

      // Add profile creation/update info
      if (profile) {
        embed.addFields({
          name: '📅 Profile Created',
          value: `<t:${Math.floor(profile.createdAt.getTime() / 1000)}:R>`,
          inline: true
        });

        if (profile.profilePicture?.uploadedAt) {
          embed.addFields({
            name: '🖼️ Picture Updated',
            value: `<t:${Math.floor(profile.profilePicture.uploadedAt.getTime() / 1000)}:R>`,
            inline: true
          });
        }
      }

      // Add bio if it exists (for future use)
      if (profile?.bio) {
        embed.addFields({
          name: '📝 Bio',
          value: profile.bio,
          inline: false
        });
      }

      // Add instructions if viewing own profile without custom picture
      if (target.id === interaction.user.id && !profile?.profilePicture?.url) {
        embed.setFooter({ 
          text: 'Use /character profilepicture to set a custom profile picture!' 
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error viewing profile:', error);
      await interaction.editReply({
        content: '❌ An error occurred while fetching the profile. Please try again later.',
        ephemeral: true
      });
    }
  }
};

/**
 * Invite Ticket Script - Creates single-use Discord server invites
 * Used when players use the "Invite Ticket" item
 */

const { EmbedBuilder } = require('discord.js');

/**
 * Generate a single-use Discord server invite
 * @param {Object} interaction - Discord interaction object
 * @param {Object} item - Item data from itemSheet
 * @param {number} quantity - Quantity being used (should be 1)
 * @returns {Promise<Object>} Result object with success status and message
 */
async function execute(interaction, item, quantity = 1) {
    try {
        const targetGuildId = '1221772148385910835';
        
        // Get the target guild
        const targetGuild = await interaction.client.guilds.fetch(targetGuildId);
        if (!targetGuild) {
            return {
                success: false,
                message: '❌ Unable to access Hellungi server. The portal magic has failed.',
                shouldConsumeItem: false
            };
        }
        
        // Find a suitable channel to create invite from (preferably general or first text channel)
        const channels = await targetGuild.channels.fetch();
        const textChannels = channels.filter(channel => 
            channel.isTextBased() && 
            channel.permissionsFor(targetGuild.members.me)?.has(['CreateInstantInvite', 'ViewChannel'])
        );
        
        if (textChannels.size === 0) {
            return {
                success: false,
                message: '❌ Unable to create portal invitation. No suitable channels available.',
                shouldConsumeItem: false
            };
        }
        
        // Use the first available text channel
        const inviteChannel = textChannels.first();
        
        // Create the invite
        const invite = await inviteChannel.createInvite({
            maxUses: 1,           // Single use only
            maxAge: 86400,        // 24 hours (86400 seconds)
            unique: true,         // Create a unique invite
            reason: `Invite Ticket used by ${interaction.user.tag}`
        });
        
        // Create response embed
        const embed = new EmbedBuilder()
            .setTitle('📨 Portal Invitation Created!')
            .setDescription('A magical portal to Hellungi has been summoned!')
            .addFields(
                { name: '🌟 Invitation Link', value: `[Join Hellungi](${invite.url})`, inline: false },
                { name: '⏱️ Expires', value: '<t:' + Math.floor((Date.now() + 86400000) / 1000) + ':R>', inline: true },
                { name: '🎫 Uses Remaining', value: '1 (single use)', inline: true },
                { name: '🏰 Destination', value: targetGuild.name, inline: true }
            )
            .setColor(0x00ff88)
            .setFooter({ text: 'Share this link to bring a friend to Hellungi!' })
            .setTimestamp();
        
        console.log(`📨 [INVITE TICKET] ${interaction.user.tag} created invite: ${invite.code} (expires in 24h, 1 use)`);
        
        return {
            success: true,
            message: 'Portal invitation successfully created!',
            embed: embed,
            shouldConsumeItem: true,
            ephemeral: false // Make invite visible so it can be shared
        };
        
    } catch (error) {
        console.error('Error creating invite ticket:', error);
        
        return {
            success: false,
            message: '❌ The portal magic has failed. Unable to create invitation.',
            shouldConsumeItem: false
        };
    }
}

module.exports = { execute };

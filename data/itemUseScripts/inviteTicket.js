/**
 * Invite Ticket Script - Creates single-use Discord server invites
 * Used when players use the "Invite Ticket" item
 */

const { EmbedBuilder } = require('discord.js');

/**
 * Generate a single-use Discord server invite
 * @param {Object} context - Context object from itemUseHandler containing interaction, client, etc.
 * @returns {Promise<void>}
 */
async function execute(context) {
    try {
        const { interaction, client, consumeItem } = context;
        const targetGuildId = '1221772148385910835';
        const targetChannelId = '1406523058663198763';
        
        // Get the target guild
        const targetGuild = await client.guilds.fetch(targetGuildId);
        if (!targetGuild) {
            await interaction.editReply({
                content: '❌ Unable to access Hellungi server. The portal magic has failed.',
                ephemeral: true
            });
            return;
        }
        
        // Get the specific channel to create invite from
        const inviteChannel = await targetGuild.channels.fetch(targetChannelId);
        if (!inviteChannel) {
            await interaction.editReply({
                content: '❌ Unable to access the target channel. The portal magic has failed.',
                ephemeral: true
            });
            return;
        }
        
        // Check if bot has permission to create invites in this channel
        const botMember = await targetGuild.members.fetch(client.user.id);
        if (!inviteChannel.permissionsFor(botMember)?.has(['CreateInstantInvite', 'ViewChannel'])) {
            await interaction.editReply({
                content: '❌ Unable to create portal invitation. Insufficient permissions.',
                ephemeral: true
            });
            return;
        }
        
        // Create the invite
        const invite = await inviteChannel.createInvite({
            maxUses: 1,           // Single use only
            maxAge: 86400,        // 24 hours (86400 seconds)
            unique: true,         // Create a unique invite
            reason: `Invite Ticket used by ${interaction.user.tag}`
        });
        
        // Send ephemeral message to player with the invite link
        const playerEmbed = new EmbedBuilder()
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
        
        await interaction.editReply({
            embeds: [playerEmbed],
            ephemeral: true
        });
        
        // Post public announcement in the channel
        const announcementEmbed = new EmbedBuilder()
            .setTitle('🎫 Invite Ticket Used!')
            .setDescription(`${interaction.user} has used an **Invite Ticket** to create a portal to Hellungi!`)
            .setColor(0x00ff88)
            .setTimestamp();
        
        await inviteChannel.send({ embeds: [announcementEmbed] });
        
        // Consume the item
        await consumeItem(1);
        
        console.log(`📨 [INVITE TICKET] ${interaction.user.tag} created invite: ${invite.code} (expires in 24h, 1 use)`);
        
    } catch (error) {
        console.error('Error creating invite ticket:', error);
        
        await interaction.editReply({
            content: '❌ The portal magic has failed. Unable to create invitation.',
            ephemeral: true
        });
    }
}

module.exports = { execute };

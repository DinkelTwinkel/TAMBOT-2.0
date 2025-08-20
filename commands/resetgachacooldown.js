const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Cooldown = require('../models/coolDowns');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetgachacooldown')
        .setDescription('Reset gacha roll cooldown for a user (Admin only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to reset cooldown for')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        
        // Fetch user's cooldown data
        const userCooldown = await Cooldown.findOne({ userId: targetUser.id });
        
        if (!userCooldown || !userCooldown.gachaRollData || !userCooldown.gachaRollData.expiresAt) {
            return interaction.reply({
                content: `❌ **${targetUser.tag}** doesn't have an active gacha roll cooldown.`,
                ephemeral: true
            });
        }
        
        // Get info about the cooldown before removing it
        const cooldownExpiry = new Date(userCooldown.gachaRollData.expiresAt);
        const now = new Date();
        const remainingMs = cooldownExpiry - now;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        
        // Remove the cooldown
        userCooldown.gachaRollData = undefined;
        await userCooldown.save();
        
        return interaction.reply({
            content: `✅ Successfully reset gacha roll cooldown for **${targetUser.tag}**\n` +
                    `They had **${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}** remaining on their cooldown.`,
            ephemeral: false
        });
    }
};

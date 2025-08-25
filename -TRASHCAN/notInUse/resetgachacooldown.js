const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetgachacooldown')
        .setDescription('[DEPRECATED] This command has been moved to /admin resetgachacooldown')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to reset cooldown for')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        return interaction.reply({ 
            content: '⚠️ This command has been deprecated.\n\nPlease use `/admin resetgachacooldown` instead.\n\nOnly administrators can use this command.', 
            ephemeral: true 
        });
    }
};

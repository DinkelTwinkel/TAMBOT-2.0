const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug-unique')
        .setDescription('[DEPRECATED] This command has been moved to /admin unique')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('announce')
                .setDescription('[DEPRECATED] Use /admin unique announce')
                .addIntegerOption(option =>
                    option.setName('item_id')
                        .setDescription('The unique item ID to announce')
                        .setRequired(true))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user who "found" the item')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('with_embed')
                        .setDescription('Use the fancy embed version')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test-announcement')
                .setDescription('[DEPRECATED] Use /admin unique test-announcement'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('assign')
                .setDescription('[DEPRECATED] Use /admin unique assign')
                .addIntegerOption(option =>
                    option.setName('item_id')
                        .setDescription('The unique item ID to assign')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('[DEPRECATED] Use /admin unique remove')
                .addIntegerOption(option =>
                    option.setName('item_id')
                        .setDescription('The unique item ID to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('[DEPRECATED] Use /admin unique reset')
                .addIntegerOption(option =>
                    option.setName('item_id')
                        .setDescription('The unique item ID to reset')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('maintenance')
                .setDescription('[DEPRECATED] Use /admin unique maintenance')
                .addIntegerOption(option =>
                    option.setName('item_id')
                        .setDescription('The unique item ID')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('level')
                        .setDescription('Maintenance level (0-10)')
                        .setMinValue(0)
                        .setMaxValue(10)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('[DEPRECATED] Use /admin unique list'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('give-blue-breeze')
                .setDescription('[DEPRECATED] Use /admin unique give-blue-breeze'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('grant-the-one')
                .setDescription('[DEPRECATED] Use /admin unique grant-the-one')
                .addUserOption(option =>
                    option.setName('chosen')
                        .setDescription('The chosen heir of the Miner King')
                        .setRequired(true))),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        return interaction.reply({ 
            content: `⚠️ This command has been deprecated.\n\nPlease use \`/admin unique ${subcommand}\` instead.\n\nAll unique item management commands have been moved to the admin command group for better organization.\n\nOnly administrators can use these commands.`, 
            ephemeral: true 
        });
    }
};

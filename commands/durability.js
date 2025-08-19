// durabilityCommand.js - Admin command to manage durability
const { SlashCommandBuilder } = require('discord.js');
const { initializeDurabilityForAllPlayers, initializeDurabilityForPlayer } = require('../patterns/gachaModes/mining/durabilityMigration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('durability')
        .setDescription('Admin command to manage item durability')
        .addSubcommand(subcommand =>
            subcommand
                .setName('migrate')
                .setDescription('Initialize durability for all player inventories')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('player')
                .setDescription('Initialize durability for a specific player')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The player to initialize durability for')
                        .setRequired(true)
                )
        ),
    
    async execute(interaction) {
        // Check if user is admin (you may want to adjust this check based on your bot's permission system)
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ 
                content: 'You do not have permission to use this command.', 
                ephemeral: true 
            });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'migrate') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const result = await initializeDurabilityForAllPlayers();
                await interaction.editReply({
                    content: `✅ Durability migration complete!\n` +
                             `• Players updated: ${result.playersUpdated}\n` +
                             `• Items updated: ${result.itemsUpdated}`
                });
            } catch (error) {
                console.error('Error during durability migration:', error);
                await interaction.editReply({
                    content: '❌ An error occurred during migration. Check console for details.'
                });
            }
        } else if (subcommand === 'player') {
            const user = interaction.options.getUser('user');
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const result = await initializeDurabilityForPlayer(user.id);
                await interaction.editReply({
                    content: `✅ Durability initialized for ${user.tag}!\n` +
                             `• Items updated: ${result.itemsUpdated}`
                });
            } catch (error) {
                console.error(`Error initializing durability for ${user.tag}:`, error);
                await interaction.editReply({
                    content: '❌ An error occurred. Check console for details.'
                });
            }
        }
    }
};

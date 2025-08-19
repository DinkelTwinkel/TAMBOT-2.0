// durabilityCommand.js - Admin command to manage durability
const { SlashCommandBuilder } = require('discord.js');
const { initializeDurabilityForAllPlayers, initializeDurabilityForPlayer, checkDurabilityStatus } = require('../patterns/gachaModes/mining/durabilityMigration');

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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check durability status for a specific player')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The player to check durability for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Test if durability saving works (admin only)')
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
        } else if (subcommand === 'check') {
            const user = interaction.options.getUser('user');
            await interaction.deferReply({ ephemeral: true });
            
            try {
                // This will log to console, but we can also get the status for the reply
                await checkDurabilityStatus(user.id);
                
                // Get inventory for reply message
                const PlayerInventory = require('../models/inventory');
                const itemSheet = require('../data/itemSheet.json');
                const inventory = await PlayerInventory.findOne({ playerId: user.id });
                
                if (!inventory) {
                    return interaction.editReply({ content: `No inventory found for ${user.tag}` });
                }
                
                let toolsWithDurability = 0;
                let toolsWithoutDurability = 0;
                const itemsNeedingFix = [];
                
                for (const invItem of inventory.items) {
                    const itemId = invItem.itemId || invItem.id;
                    const itemData = itemSheet.find(it => String(it.id) === String(itemId));
                    
                    if (itemData && (itemData.type === 'tool' || itemData.type === 'equipment' || itemData.type === 'charm')) {
                        if (invItem.currentDurability !== undefined && invItem.currentDurability !== null) {
                            toolsWithDurability++;
                        } else {
                            toolsWithoutDurability++;
                            itemsNeedingFix.push(itemData.name);
                        }
                    }
                }
                
                let response = `📊 **Durability Status for ${user.tag}**\n\n`;
                response += `✅ Items with durability: ${toolsWithDurability}\n`;
                response += `❌ Items WITHOUT durability: ${toolsWithoutDurability}\n`;
                
                if (itemsNeedingFix.length > 0) {
                    response += `\n**Items needing durability:**\n`;
                    response += itemsNeedingFix.slice(0, 10).join(', ');
                    if (itemsNeedingFix.length > 10) {
                        response += ` and ${itemsNeedingFix.length - 10} more...`;
                    }
                    response += `\n\n💡 Run \`/durability player\` to fix these items.`;
                }
                
                await interaction.editReply({ content: response });
            } catch (error) {
                console.error(`Error checking durability for ${user.tag}:`, error);
                await interaction.editReply({
                    content: '❌ An error occurred. Check console for details.'
                });
            }
        } else if (subcommand === 'test') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const testDurability = require('../patterns/gachaModes/mining/testDurability');
                await testDurability('test_' + Date.now());
                
                await interaction.editReply({
                    content: '✅ Durability test completed! Check console for detailed results.\n\n' +
                             'If the test shows SUCCESS, the schema is working correctly.\n' +
                             'If it shows FAILED, there may still be database configuration issues.'
                });
            } catch (error) {
                console.error('Error during durability test:', error);
                await interaction.editReply({
                    content: '❌ Test failed. Check console for details.'
                });
            }
        }
    }
};

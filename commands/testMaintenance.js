// commands/testMaintenance.js
// Test command to manipulate maintenance for testing
// REMOVE THIS FILE IN PRODUCTION!

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UniqueItem = require('../models/uniqueItems');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');
const { maintenanceClock } = require('../patterns/uniqueItemMaintenance');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-maintenance')
        .setDescription('Test maintenance system (DEV ONLY)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('degrade')
                .setDescription('Reduce maintenance of your Blue Breeze by 1')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set maintenance to specific level')
                .addIntegerOption(option =>
                    option.setName('level')
                        .setDescription('Maintenance level (0-10)')
                        .setMinValue(0)
                        .setMaxValue(10)
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('run-cycle')
                .setDescription('Manually run the maintenance cycle (normally runs every 24h)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('Restore maintenance to full (10/10)')
        ),
        
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        await interaction.deferReply();
        
        try {
            // Find Blue Breeze (ID 1) owned by the user
            const dbItem = await UniqueItem.findOne({ 
                itemId: 1, 
                ownerId: interaction.user.id 
            });
            
            if (!dbItem && subcommand !== 'run-cycle') {
                return interaction.editReply('❌ You don\'t own Blue Breeze! Use `/test-blue-breeze` first.');
            }
            
            const itemData = dbItem ? getUniqueItemById(1) : null;
            
            switch (subcommand) {
                case 'degrade': {
                    const oldLevel = dbItem.maintenanceLevel;
                    await dbItem.reduceMaintenance(1);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔧 Maintenance Degraded')
                        .setDescription(`**${itemData.name}** maintenance reduced`)
                        .addFields(
                            { name: 'Previous Level', value: `${oldLevel}/10`, inline: true },
                            { name: 'New Level', value: `${dbItem.maintenanceLevel}/10`, inline: true },
                            { name: 'Status', value: dbItem.maintenanceLevel > 0 ? '✅ Still owned' : '❌ Lost item!', inline: true }
                        )
                        .setColor(dbItem.maintenanceLevel > 0 ? 0xFFFF00 : 0xFF0000)
                        .setTimestamp();
                    
                    if (dbItem.maintenanceLevel <= 0) {
                        embed.addFields({
                            name: '⚠️ Item Lost',
                            value: 'Blue Breeze has been lost due to maintenance failure! It\'s now available for someone else to find.',
                            inline: false
                        });
                    } else if (dbItem.maintenanceLevel <= 3) {
                        embed.addFields({
                            name: '⚠️ Warning',
                            value: `Only ${dbItem.maintenanceLevel} maintenance levels remaining! Item effectiveness is at ${dbItem.maintenanceLevel * 10}%`,
                            inline: false
                        });
                    }
                    
                    return interaction.editReply({ embeds: [embed] });
                }
                
                case 'set': {
                    const newLevel = interaction.options.getInteger('level');
                    const oldLevel = dbItem.maintenanceLevel;
                    
                    dbItem.maintenanceLevel = newLevel;
                    
                    // If setting to 0, remove ownership
                    if (newLevel <= 0 && dbItem.ownerId) {
                        dbItem.previousOwners.push({
                            userId: dbItem.ownerId,
                            userTag: dbItem.ownerTag,
                            acquiredDate: dbItem.createdAt,
                            lostDate: new Date(),
                            lostReason: 'maintenance_failure'
                        });
                        dbItem.statistics.timesLostToMaintenance++;
                        dbItem.ownerId = null;
                        dbItem.ownerTag = null;
                    }
                    
                    await dbItem.save();
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔧 Maintenance Level Set')
                        .setDescription(`**${itemData.name}** maintenance updated`)
                        .addFields(
                            { name: 'Previous Level', value: `${oldLevel}/10`, inline: true },
                            { name: 'New Level', value: `${newLevel}/10`, inline: true },
                            { name: 'Effectiveness', value: `${newLevel * 10}%`, inline: true }
                        )
                        .setColor(newLevel > 5 ? 0x00FF00 : newLevel > 2 ? 0xFFFF00 : 0xFF0000)
                        .setTimestamp();
                    
                    if (newLevel <= 0) {
                        embed.addFields({
                            name: '❌ Item Lost',
                            value: 'Blue Breeze has been removed from your inventory!',
                            inline: false
                        });
                    }
                    
                    return interaction.editReply({ embeds: [embed] });
                }
                
                case 'run-cycle': {
                    // Manually trigger the maintenance cycle
                    await maintenanceClock.runMaintenanceCycle();
                    
                    const embed = new EmbedBuilder()
                        .setTitle('⏰ Maintenance Cycle Complete')
                        .setDescription('Global maintenance cycle has been run')
                        .addFields({
                            name: 'What Happened',
                            value: '• All unique items with maintenance requirements lost 1 level\n' +
                                   '• Items at 0 maintenance were returned to the pool\n' +
                                   '• Activity trackers were reset',
                            inline: false
                        })
                        .setColor(0x0099FF)
                        .setFooter({ text: 'Check /unique status to see your items' })
                        .setTimestamp();
                    
                    return interaction.editReply({ embeds: [embed] });
                }
                
                case 'restore': {
                    const oldLevel = dbItem.maintenanceLevel;
                    
                    dbItem.maintenanceLevel = 10;
                    dbItem.lastMaintenanceDate = new Date();
                    dbItem.nextMaintenanceCheck = new Date(Date.now() + 24 * 60 * 60 * 1000);
                    await dbItem.save();
                    
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Maintenance Restored')
                        .setDescription(`**${itemData.name}** is now at full maintenance!`)
                        .addFields(
                            { name: 'Previous Level', value: `${oldLevel}/10`, inline: true },
                            { name: 'New Level', value: '10/10', inline: true },
                            { name: 'Effectiveness', value: '100%', inline: true }
                        )
                        .setColor(0x00FF00)
                        .setFooter({ text: 'Use /stats to see full power!' })
                        .setTimestamp();
                    
                    return interaction.editReply({ embeds: [embed] });
                }
            }
            
        } catch (error) {
            console.error('Error in test maintenance:', error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    }
};

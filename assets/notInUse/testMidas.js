const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UniqueItem = require('../models/uniqueItems');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');
const { checkMidasBurdenOwnership } = require('../patterns/midasBurdenManager');
const getPlayerStats = require('../patterns/calculatePlayerStat');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testmidas')
        .setDescription('[ADMIN] Test Midas\' Burden functionality')
        .addSubcommand(subcommand =>
            subcommand
                .setName('init')
                .setDescription('Initialize Midas\' Burden in the database'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check and update Midas\' Burden ownership'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('luck')
                .setDescription('Test your current luck with Midas\' Burden'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('maintenance')
                .setDescription('Check maintenance status of Midas\' Burden')),

    async execute(interaction) {
        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'init': {
                    // Initialize Midas' Burden if it doesn't exist
                    let midasBurden = await UniqueItem.findOne({ itemId: 10 });
                    
                    if (midasBurden) {
                        return interaction.editReply('✅ Midas\' Burden already exists in the database.');
                    }

                    const itemData = getUniqueItemById(10);
                    if (!itemData) {
                        return interaction.editReply('❌ Midas\' Burden not found in item sheet.');
                    }

                    midasBurden = await UniqueItem.create({
                        itemId: 10,
                        maintenanceType: itemData.maintenanceType,
                        maintenanceCost: itemData.maintenanceCost,
                        requiresMaintenance: itemData.requiresMaintenance,
                        maintenanceLevel: 10
                    });

                    const embed = new EmbedBuilder()
                        .setTitle('✅ Midas\' Burden Initialized')
                        .setColor(0xFFD700)
                        .setDescription('The golden curse has manifested in this realm!')
                        .addFields(
                            { name: 'Item ID', value: '10', inline: true },
                            { name: 'Maintenance Type', value: itemData.maintenanceType, inline: true },
                            { name: 'Status', value: 'Unclaimed', inline: true }
                        );

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'check': {
                    // Force check ownership
                    const result = await checkMidasBurdenOwnership(interaction.user.id, interaction.guild);
                    
                    if (result) {
                        const embed = new EmbedBuilder()
                            .setTitle('👑 Ownership Updated!')
                            .setColor(0xFFD700)
                            .setDescription(result.message)
                            .addFields(
                                { name: 'Previous Owner', value: result.previousOwner || 'None', inline: true },
                                { name: 'New Owner', value: result.newOwner, inline: true }
                            );

                        await interaction.editReply({ embeds: [embed] });
                    } else {
                        await interaction.editReply('No ownership changes detected. The current owner (if any) remains the wealthiest.');
                    }
                    break;
                }

                case 'luck': {
                    // Test luck multiplier
                    const midasBurden = await UniqueItem.findOne({ itemId: 10, ownerId: interaction.user.id });
                    
                    if (!midasBurden) {
                        return interaction.editReply('You do not own Midas\' Burden.');
                    }

                    // Get player stats multiple times to show the randomness
                    const results = [];
                    for (let i = 0; i < 10; i++) {
                        const stats = await getPlayerStats(interaction.user.id);
                        results.push(stats.stats.luck || 0);
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🎲 Midas\' Burden Luck Test')
                        .setColor(0xFFD700)
                        .setDescription('Testing luck multiplier (10 calculations):')
                        .addFields(
                            { 
                                name: 'Results', 
                                value: results.map((luck, i) => 
                                    `Roll ${i + 1}: ${luck} ${luck === 0 ? '💀 (Cursed!)' : luck > 100 ? '🌟 (Blessed!)' : ''}`
                                ).join('\n'),
                                inline: false
                            },
                            {
                                name: 'Statistics',
                                value: [
                                    `Cursed (0x): ${results.filter(r => r === 0).length}/10`,
                                    `Blessed (100x): ${results.filter(r => r > 100).length}/10`,
                                    `Average: ${Math.round(results.reduce((a, b) => a + b, 0) / results.length)}`
                                ].join('\n'),
                                inline: false
                            }
                        );

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'maintenance': {
                    // Check maintenance status
                    const midasBurden = await UniqueItem.findOne({ itemId: 10 });
                    
                    if (!midasBurden) {
                        return interaction.editReply('Midas\' Burden not found in database.');
                    }

                    const itemData = getUniqueItemById(10);
                    const { checkRichestPlayer } = require('../patterns/conditionalUniqueItems');
                    
                    let isStillRichest = false;
                    if (midasBurden.ownerId) {
                        const guildMembers = await interaction.guild.members.fetch();
                        const memberIds = guildMembers.map(member => member.id);
                        isStillRichest = await checkRichestPlayer(midasBurden.ownerId, interaction.guild.id, memberIds);
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🔧 Midas\' Burden Maintenance Status')
                        .setColor(midasBurden.maintenanceLevel > 5 ? 0x00FF00 : midasBurden.maintenanceLevel > 2 ? 0xFFFF00 : 0xFF0000)
                        .addFields(
                            { name: 'Owner', value: midasBurden.ownerId ? `<@${midasBurden.ownerId}>` : 'Unclaimed', inline: true },
                            { name: 'Maintenance Level', value: `${midasBurden.maintenanceLevel}/10`, inline: true },
                            { name: 'Status', value: isStillRichest ? '✅ Stable' : '⚠️ Decaying', inline: true },
                            { name: 'Maintenance Type', value: itemData.maintenanceType, inline: true },
                            { name: 'Decay Rate', value: `${itemData.maintenanceDecayRate} per cycle`, inline: true },
                            { name: 'Next Check', value: midasBurden.nextMaintenanceCheck ? 
                                `<t:${Math.floor(midasBurden.nextMaintenanceCheck.getTime() / 1000)}:R>` : 
                                'Not scheduled', inline: true }
                        );

                    if (midasBurden.maintenanceLevel <= 3) {
                        embed.addFields({
                            name: '⚠️ Warning',
                            value: 'Maintenance critically low! The burden will abandon its owner soon if they don\'t reclaim their wealth!',
                            inline: false
                        });
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }
            }
        } catch (error) {
            console.error('[TEST MIDAS] Error:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    }
};

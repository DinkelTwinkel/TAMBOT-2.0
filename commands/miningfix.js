// miningfix.js - Admin command to fix stuck mining channels
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { MiningBreakRepair, quickRepair, getStatus, forceClearBreak } = require('../patterns/gachaModes/mining/fixStuckBreaks');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('miningfix')
        .setDescription('Fix stuck mining channels (Admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check the status of the current mining channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('repair')
                .setDescription('Repair the current stuck mining channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('forcebreak')
                .setDescription('Force clear any break state (emergency use)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('repairall')
                .setDescription('Repair all stuck mining channels server-wide')
        ),
    
    async execute(interaction) {
        // Check if user is admin
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ This command requires administrator permissions.',
                ephemeral: true
            });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        // Get the voice channel the user is in
        const voiceChannel = interaction.member.voice.channel;
        
        // For commands that require a channel, check if user is in voice
        if ((subcommand === 'status' || subcommand === 'repair' || subcommand === 'forcebreak') && !voiceChannel) {
            return interaction.reply({
                content: '❌ You must be in a voice channel to use this command.',
                ephemeral: true
            });
        }
        
        const channelId = voiceChannel ? voiceChannel.id : null;
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            switch (subcommand) {
                case 'status': {
                    const status = await getStatus(channelId);
                    
                    if (!status.exists) {
                        return interaction.editReply({
                            content: '❌ This channel is not a mining channel.',
                            ephemeral: true
                        });
                    }
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔧 Mining Channel Status')
                        .setColor(status.isStuck ? 0xFF0000 : 0x00FF00)
                        .addFields(
                            { name: 'Channel ID', value: channelId, inline: true },
                            { name: 'Status', value: status.isStuck ? '⚠️ STUCK' : '✅ OK', inline: true },
                            { name: 'Game Mode', value: status.gamemode || 'Unknown', inline: true }
                        );
                    
                    if (status.breakDetails) {
                        const breakInfo = status.breakDetails;
                        embed.addFields(
                            { name: 'Break Status', value: breakInfo.inBreak ? 'In Break' : 'Not in Break', inline: true },
                            { name: 'Break Type', value: breakInfo.isLongBreak ? 'Long Break' : 'Short Break', inline: true }
                        );
                        
                        if (breakInfo.minutesOverdue > 0) {
                            embed.addFields({
                                name: '⚠️ Overdue',
                                value: `Break should have ended ${breakInfo.minutesOverdue} minutes ago`,
                                inline: false
                            });
                        } else if (breakInfo.minutesRemaining > 0) {
                            embed.addFields({
                                name: 'Time Remaining',
                                value: `${breakInfo.minutesRemaining} minutes`,
                                inline: true
                            });
                        }
                    }
                    
                    if (status.disabledPlayerCount > 0) {
                        embed.addFields({
                            name: 'Disabled Players',
                            value: `${status.disabledPlayerCount} players knocked out`,
                            inline: true
                        });
                    }
                    
                    return interaction.editReply({ embeds: [embed], ephemeral: true });
                }
                
                case 'repair': {
                    const status = await getStatus(channelId);
                    
                    if (!status.exists) {
                        return interaction.editReply({
                            content: '❌ This channel is not a mining channel.',
                            ephemeral: true
                        });
                    }
                    
                    if (!status.isStuck) {
                        return interaction.editReply({
                            content: '✅ This channel is not stuck. No repair needed.',
                            ephemeral: true
                        });
                    }
                    
                    const success = await quickRepair(channelId);
                    
                    if (success) {
                        const embed = new EmbedBuilder()
                            .setTitle('✅ Mining Channel Repaired')
                            .setColor(0x00FF00)
                            .setDescription('The mining channel has been successfully repaired.')
                            .addFields(
                                { name: 'Action Taken', value: 'Cleared stuck break state', inline: false },
                                { name: 'Status', value: 'Mining should resume momentarily', inline: false }
                            )
                            .setTimestamp();
                        
                        return interaction.editReply({ embeds: [embed], ephemeral: true });
                    } else {
                        return interaction.editReply({
                            content: '❌ Failed to repair the channel. Please try the force clear option or contact support.',
                            ephemeral: true
                        });
                    }
                }
                
                case 'forcebreak': {
                    const success = await forceClearBreak(channelId);
                    
                    if (success) {
                        const embed = new EmbedBuilder()
                            .setTitle('⚡ Force Clear Complete')
                            .setColor(0xFFFF00)
                            .setDescription('All break states have been forcefully cleared.')
                            .addFields(
                                { name: 'Warning', value: 'This is an emergency action. Some data may be lost.', inline: false },
                                { name: 'Next Step', value: 'Mining will restart on the next trigger.', inline: false }
                            )
                            .setTimestamp();
                        
                        return interaction.editReply({ embeds: [embed], ephemeral: true });
                    } else {
                        return interaction.editReply({
                            content: '❌ Force clear failed. Manual database intervention may be required.',
                            ephemeral: true
                        });
                    }
                }
                
                case 'repairall': {
                    await interaction.editReply({
                        content: '🔄 Scanning all mining channels for stuck states...',
                        ephemeral: true
                    });
                    
                    const repair = new MiningBreakRepair();
                    const result = await repair.repairAllStuck();
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔧 Server-Wide Mining Repair Complete')
                        .setColor(result.success ? 0x00FF00 : 0xFF0000)
                        .setDescription(result.message)
                        .setTimestamp();
                    
                    if (result.repaired.length > 0) {
                        embed.addFields({
                            name: `✅ Repaired (${result.repaired.length})`,
                            value: result.repaired.join(', ').substring(0, 1024) || 'None',
                            inline: false
                        });
                    }
                    
                    if (result.failed.length > 0) {
                        embed.addFields({
                            name: `❌ Failed (${result.failed.length})`,
                            value: result.failed.join(', ').substring(0, 1024) || 'None',
                            inline: false
                        });
                    }
                    
                    return interaction.editReply({ embeds: [embed], ephemeral: true });
                }
            }
        } catch (error) {
            console.error('[MININGFIX] Command error:', error);
            return interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
                ephemeral: true
            });
        }
    }
};

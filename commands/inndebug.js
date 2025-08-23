// Inn Debug Command - Slash command for debugging and recovering stuck inns
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ActiveVCs = require('../models/activevcs');
const { forceRecoverInn, forceDistributeProfits, getDetailedInnStatus } = require('../patterns/gachaModes/innKeeping/innRecoveryCommand');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inndebug')
        .setDescription('Debug and manage inn systems (Admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Get detailed status of the current inn')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('recover')
                .setDescription('Force recover a stuck inn')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('distribute')
                .setDescription('Force distribute profits now')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('forcebreak')
                .setDescription('Force the inn to take a break now')
        ),
    
    async execute(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ 
                content: '❌ This command requires Administrator permissions.', 
                ephemeral: true 
            });
        }
        
        const subcommand = interaction.options.getSubcommand();
        const channel = interaction.channel;
        const channelId = channel.id;
        
        // Defer reply since operations might take time
        await interaction.deferReply({ ephemeral: true });
        
        try {
            switch (subcommand) {
                case 'status': {
                    const status = await getDetailedInnStatus(channelId);
                    
                    if (status.error) {
                        return interaction.editReply({ 
                            content: `❌ Error: ${status.error}` 
                        });
                    }
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🏪 Inn Debug Status')
                        .setColor(status.health.needsRecovery ? 0xFF0000 : 0x00FF00)
                        .addFields(
                            { 
                                name: '📊 Current State', 
                                value: `State: **${status.currentState || 'Unknown'}**\n` +
                                      `Version: ${status.stateVersion}\n` +
                                      `Work Period: ${status.workPeriodId || 'None'}`,
                                inline: true
                            },
                            {
                                name: '⏰ Timing',
                                value: status.currentState === 'break' ? 
                                    `On break for ${status.timing.breakTimeRemaining} more minutes` :
                                    `Worked ${status.timing.workMinutesElapsed} minutes\n` +
                                    `Break in ${status.timing.workMinutesUntilBreak} minutes\n` +
                                    (status.timing.isOverdue ? 
                                        `⚠️ OVERDUE by ${status.timing.minutesOverdue} minutes` :
                                        `Next check in ${status.timing.nextTriggerIn}s`),
                                inline: true
                            },
                            {
                                name: '💰 Data',
                                value: `Sales: ${status.data.sales}\n` +
                                      `Events: ${status.data.events}\n` +
                                      `Profits Distributed: ${status.data.profitsDistributed ? 'Yes' : 'No'}`,
                                inline: true
                            },
                            {
                                name: '🔒 Locks',
                                value: `Has Lock: ${status.locks.hasLock ? 'Yes' : 'No'}\n` +
                                      `Lock Expired: ${status.locks.lockExpired ? 'Yes' : 'No'}\n` +
                                      `Distribution in Progress: ${status.locks.distributionInProgress ? 'Yes' : 'No'}\n` +
                                      `Retry Count: ${status.locks.retryCount}`,
                                inline: true
                            },
                            {
                                name: '🏥 Health',
                                value: `Is Stuck: ${status.health.isStuck ? '⚠️ YES' : '✅ No'}\n` +
                                      `Needs Recovery: ${status.health.needsRecovery ? '⚠️ YES' : '✅ No'}`,
                                inline: true
                            }
                        )
                        .setTimestamp()
                        .setFooter({ text: 'Use /inndebug recover if stuck' });
                    
                    return interaction.editReply({ embeds: [embed] });
                }
                
                case 'recover': {
                    const success = await forceRecoverInn(channel);
                    
                    if (success) {
                        return interaction.editReply({ 
                            content: '✅ Inn successfully recovered! The inn is now working and will take a break in ~25 minutes.' 
                        });
                    } else {
                        return interaction.editReply({ 
                            content: '❌ Failed to recover inn. Check console logs for details.' 
                        });
                    }
                }
                
                case 'distribute': {
                    const success = await forceDistributeProfits(channel);
                    
                    if (success) {
                        return interaction.editReply({ 
                            content: '✅ Profits distributed successfully!' 
                        });
                    } else {
                        return interaction.editReply({ 
                            content: '❌ Failed to distribute profits. The inn might not have any data to distribute.' 
                        });
                    }
                }
                
                case 'forcebreak': {
                    // Force the inn to take a break
                    const now = Date.now();
                    const breakEndTime = now + (5 * 60 * 1000); // 5 minute break
                    
                    const updated = await ActiveVCs.findOneAndUpdate(
                        { 
                            channelId,
                            'gameData.gamemode': 'innkeeper'
                        },
                        {
                            $set: {
                                'gameData.workState': 'break',
                                'gameData.breakEndTime': new Date(breakEndTime),
                                'gameData.sales': [],
                                'gameData.events': [],
                                'gameData.profitsDistributed': true,
                                nextTrigger: new Date(now + 30000)
                            }
                        },
                        { new: true }
                    );
                    
                    if (updated) {
                        // Send break announcement
                        const embed = new EmbedBuilder()
                            .setTitle('☕ Forced Break Time!')
                            .setColor(0xF39C12)
                            .setDescription('The inn has been forced to take a 5-minute break.')
                            .addFields(
                                { name: 'Break Duration', value: '5 minutes', inline: true },
                                { name: 'Reopening At', value: `<t:${Math.floor(breakEndTime / 1000)}:R>`, inline: true }
                            )
                            .setTimestamp();
                        
                        await channel.send({ embeds: [embed] });
                        
                        return interaction.editReply({ 
                            content: '✅ Inn forced to take a break. Will reopen in 5 minutes.' 
                        });
                    } else {
                        return interaction.editReply({ 
                            content: '❌ Failed to force break. Is this an inn channel?' 
                        });
                    }
                }
            }
        } catch (error) {
            console.error('[InnDebug] Command error:', error);
            return interaction.editReply({ 
                content: `❌ An error occurred: ${error.message}` 
            });
        }
    }
};

// testMiningEvent.js - Debug command for mining special events
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { 
    debugSpecialEvent, 
    forceEndSpecialEvent, 
    forceStartThiefEvent 
} = require('../patterns/gachaModes/mining/miningEvents');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testminingevent')
        .setDescription('Debug mining special events')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check current special event status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('forceend')
                .setDescription('Force end the current special event')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('startthief')
                .setDescription('Force start a thief event (testing only)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('breakinfo')
                .setDescription('Get detailed break and event information')
        ),
    
    async execute(interaction) {
        // Additional admin check as fallback
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '❌ This command is restricted to administrators only!', 
                ephemeral: true 
            });
        }
        
        // Check if user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ 
                content: '❌ You must be in a voice channel to use this command!', 
                ephemeral: true 
            });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'status': {
                await interaction.deferReply({ ephemeral: true });
                
                const dbEntry = await debugSpecialEvent(voiceChannel);
                
                // Create a formatted response
                let response = '**🔍 Mining Event Status**\n\n';
                
                if (dbEntry?.gameData?.specialEvent) {
                    const event = dbEntry.gameData.specialEvent;
                    const timeRemaining = event.endTime - Date.now();
                    const minutesRemaining = Math.floor(timeRemaining / 60000);
                    const secondsRemaining = Math.floor((timeRemaining % 60000) / 1000);
                    
                    response += '**Active Event:**\n';
                    response += `• Type: ${event.type}\n`;
                    response += `• Ends: <t:${Math.floor(event.endTime / 1000)}:R>\n`;
                    response += `• Time remaining: ${minutesRemaining}m ${secondsRemaining}s\n`;
                    
                    if (event.type === 'thief') {
                        response += `• Thief: <@${event.thiefId}>\n`;
                        response += `• Amount stolen: ${event.amount} coins\n`;
                    }
                } else {
                    response += '**No special event active**\n';
                }
                
                if (dbEntry?.gameData?.breakInfo) {
                    const breakInfo = dbEntry.gameData.breakInfo;
                    const breakRemaining = breakInfo.breakEndTime - Date.now();
                    const breakMinutes = Math.floor(breakRemaining / 60000);
                    const breakSeconds = Math.floor((breakRemaining % 60000) / 1000);
                    
                    response += '\n**Break Status:**\n';
                    response += `• Type: ${breakInfo.isLongBreak ? 'Long Break' : 'Short Break'}\n`;
                    response += `• Ends: <t:${Math.floor(breakInfo.breakEndTime / 1000)}:R>\n`;
                    response += `• Time remaining: ${breakMinutes}m ${breakSeconds}s\n`;
                } else {
                    response += '\n**Not in break period** (Mining active)\n';
                }
                
                response += '\n*Check console for detailed debug information.*';
                
                await interaction.editReply(response);
                break;
            }
                
            case 'forceend': {
                await interaction.deferReply({ ephemeral: false });
                
                const result = await forceEndSpecialEvent(voiceChannel);
                
                await interaction.editReply({ 
                    content: `✅ ${result}`
                });
                break;
            }
                
            case 'startthief': {
                await interaction.deferReply({ ephemeral: false });
                
                // Check if there are enough players
                const members = voiceChannel.members.filter(m => !m.user.bot);
                if (members.size < 2) {
                    return interaction.editReply({ 
                        content: '❌ Need at least 2 players in the voice channel for thief event!',
                    });
                }
                
                const result = await forceStartThiefEvent(voiceChannel);
                
                await interaction.editReply({ 
                    content: `✅ ${result}`,
                });
                break;
            }
            
            case 'breakinfo': {
                await interaction.deferReply({ ephemeral: true });
                
                const gachaVC = require('../models/activevcs');
                const dbEntry = await gachaVC.findOne({ channelId: voiceChannel.id });
                
                if (!dbEntry) {
                    return interaction.editReply('❌ No active mining session in this channel!');
                }
                
                const embed = {
                    title: '📊 Mining Session Debug Info',
                    fields: [],
                    color: 0x8B4513,
                    timestamp: new Date()
                };
                
                // Session info
                embed.fields.push({
                    name: '⛏️ Session Info',
                    value: [
                        `Channel: ${voiceChannel.name}`,
                        `Next trigger: <t:${Math.floor(dbEntry.nextTrigger / 1000)}:R>`,
                        `Next shop: <t:${Math.floor(dbEntry.nextShopRefresh / 1000)}:R>`,
                        `Cycle count: ${dbEntry.gameData?.cycleCount || 0}`
                    ].join('\n'),
                    inline: false
                });
                
                // Break info
                if (dbEntry.gameData?.breakInfo) {
                    const breakInfo = dbEntry.gameData.breakInfo;
                    embed.fields.push({
                        name: '☕ Break Info',
                        value: [
                            `In break: ${breakInfo.inBreak ? 'Yes' : 'No'}`,
                            `Type: ${breakInfo.isLongBreak ? 'Long' : 'Short'}`,
                            `Started: <t:${Math.floor(breakInfo.breakStartTime / 1000)}:T>`,
                            `Ends: <t:${Math.floor(breakInfo.breakEndTime / 1000)}:T>`
                        ].join('\n'),
                        inline: true
                    });
                }
                
                // Event info
                if (dbEntry.gameData?.specialEvent) {
                    const event = dbEntry.gameData.specialEvent;
                    embed.fields.push({
                        name: '🎪 Special Event',
                        value: [
                            `Type: ${event.type}`,
                            `End time: <t:${Math.floor(event.endTime / 1000)}:T>`,
                            event.thiefId ? `Thief: <@${event.thiefId}>` : null,
                            event.amount ? `Amount: ${event.amount} coins` : null
                        ].filter(Boolean).join('\n'),
                        inline: true
                    });
                }
                
                // Stats
                if (dbEntry.gameData?.stats) {
                    const stats = dbEntry.gameData.stats;
                    embed.fields.push({
                        name: '📈 Session Stats',
                        value: [
                            `Walls broken: ${stats.wallsBroken || 0}`,
                            `Treasures found: ${stats.treasuresFound || 0}`,
                            `Total mined value: ${stats.totalMinedValue || 0}`
                        ].join('\n'),
                        inline: true
                    });
                }
                
                await interaction.editReply({ embeds: [embed] });
                break;
            }
                
            default:
                await interaction.reply({ 
                    content: '❌ Unknown subcommand', 
                    ephemeral: true 
                });
        }
    },
};
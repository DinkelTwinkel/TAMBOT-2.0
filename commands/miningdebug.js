// miningdebug.js - Comprehensive mining system debug command
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('miningdebug')
        .setDescription('Debug and control mining system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('forcebreak')
                .setDescription('Force start a break period')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of break')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Short Break (5 min)', value: 'short' },
                            { name: 'Long Break (25 min)', value: 'long' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('endbreak')
                .setDescription('Force end the current break')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetcycle')
                .setDescription('Reset the mining cycle counter')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clearmap')
                .setDescription('Clear and regenerate the mining map')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('sessioninfo')
                .setDescription('Get complete mining session information')
        ),
    
    async execute(interaction) {
        // Admin check (optional - uncomment if you want admin-only)
        // if (!interaction.member.permissions.has('ADMINISTRATOR')) {
        //     return interaction.reply({ 
        //         content: '❌ This command requires administrator permissions!', 
        //         ephemeral: true 
        //     });
        // }
        
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ 
                content: '❌ You must be in a voice channel to use this command!', 
                ephemeral: true 
            });
        }
        
        const gachaVC = require('../models/activevcs');
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'forcebreak': {
                await interaction.deferReply({ ephemeral: false });
                
                const breakType = interaction.options.getString('type');
                const dbEntry = await gachaVC.findOne({ channelId: voiceChannel.id });
                
                if (!dbEntry) {
                    return interaction.editReply('❌ No active mining session in this channel!');
                }
                
                const now = Date.now();
                const isLongBreak = breakType === 'long';
                const duration = isLongBreak ? 25 * 60 * 1000 : 5 * 60 * 1000;
                
                // Update database to start break
                await gachaVC.updateOne(
                    { channelId: voiceChannel.id },
                    {
                        $set: {
                            'gameData.breakInfo': {
                                inBreak: true,
                                isLongBreak: isLongBreak,
                                breakStartTime: now,
                                breakEndTime: now + duration
                            },
                            nextTrigger: new Date(now + duration),
                            nextShopRefresh: new Date(now + duration)
                        }
                    }
                );
                
                // Generate shop if not long break
                if (!isLongBreak) {
                    const generateShop = require('../patterns/generateShop');
                    await generateShop(voiceChannel, 5);
                }
                
                await interaction.editReply({
                    content: `✅ Forced ${breakType} break! Duration: ${isLongBreak ? '25' : '5'} minutes.\n${!isLongBreak ? '🛒 Shop is now open!' : '🎪 Ready for special event!'}`
                });
                break;
            }
            
            case 'endbreak': {
                await interaction.deferReply({ ephemeral: false });
                
                const dbEntry = await gachaVC.findOne({ channelId: voiceChannel.id });
                
                if (!dbEntry) {
                    return interaction.editReply('❌ No active mining session in this channel!');
                }
                
                if (!dbEntry.gameData?.breakInfo?.inBreak) {
                    return interaction.editReply('❌ Not currently in a break period!');
                }
                
                // Clear break info
                await gachaVC.updateOne(
                    { channelId: voiceChannel.id },
                    {
                        $unset: { 'gameData.breakInfo': 1 },
                        $set: {
                            nextTrigger: new Date(Date.now() + 25 * 60 * 1000),
                            nextShopRefresh: new Date(Date.now() + 25 * 60 * 1000)
                        }
                    }
                );
                
                await interaction.editReply('✅ Break ended! Mining resumed.');
                break;
            }
            
            case 'resetcycle': {
                await interaction.deferReply({ ephemeral: false });
                
                const dbEntry = await gachaVC.findOne({ channelId: voiceChannel.id });
                
                if (!dbEntry) {
                    return interaction.editReply('❌ No active mining session in this channel!');
                }
                
                await gachaVC.updateOne(
                    { channelId: voiceChannel.id },
                    { $set: { 'gameData.cycleCount': 0 } }
                );
                
                await interaction.editReply('✅ Cycle counter reset to 0. Next long break will be on cycle 3.');
                break;
            }
            
            case 'clearmap': {
                await interaction.deferReply({ ephemeral: false });
                
                const dbEntry = await gachaVC.findOne({ channelId: voiceChannel.id });
                
                if (!dbEntry) {
                    return interaction.editReply('❌ No active mining session in this channel!');
                }
                
                // Clear the map
                await gachaVC.updateOne(
                    { channelId: voiceChannel.id },
                    { $unset: { 'gameData.map': 1 } }
                );
                
                await interaction.editReply('✅ Mining map cleared! A new map will be generated on the next mining tick.');
                break;
            }
            
            case 'sessioninfo': {
                await interaction.deferReply({ ephemeral: true });
                
                const dbEntry = await gachaVC.findOne({ channelId: voiceChannel.id }).lean();
                
                if (!dbEntry) {
                    return interaction.editReply('❌ No active mining session in this channel!');
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('⛏️ Complete Mining Session Information')
                    .setColor(0x8B4513)
                    .setTimestamp();
                
                // Basic info
                embed.addFields({
                    name: '📍 Basic Info',
                    value: [
                        `**Channel:** ${voiceChannel.name}`,
                        `**Type:** ${dbEntry.gachaType || 'Unknown'}`,
                        `**Power Level:** ${dbEntry.json?.power || 1}`,
                        `**Server:** ${dbEntry.json?.name || 'Unknown'}`
                    ].join('\n'),
                    inline: false
                });
                
                // Timing info
                const now = Date.now();
                embed.addFields({
                    name: '⏰ Timing',
                    value: [
                        `**Next Trigger:** <t:${Math.floor(dbEntry.nextTrigger / 1000)}:R>`,
                        `**Next Shop:** <t:${Math.floor(dbEntry.nextShopRefresh / 1000)}:R>`,
                        `**Cycle Count:** ${dbEntry.gameData?.cycleCount || 0}/4`,
                        `**Next Long Break:** Cycle ${((dbEntry.gameData?.cycleCount || 0) % 4) === 3 ? 'NOW' : (3 - ((dbEntry.gameData?.cycleCount || 0) % 4)) + ' cycles'}`
                    ].join('\n'),
                    inline: true
                });
                
                // Break status
                if (dbEntry.gameData?.breakInfo) {
                    const breakInfo = dbEntry.gameData.breakInfo;
                    embed.addFields({
                        name: '☕ Break Status',
                        value: [
                            `**Active:** ${breakInfo.inBreak ? '✅' : '❌'}`,
                            `**Type:** ${breakInfo.isLongBreak ? 'Long (25m)' : 'Short (5m)'}`,
                            `**Ends:** <t:${Math.floor(breakInfo.breakEndTime / 1000)}:R>`
                        ].join('\n'),
                        inline: true
                    });
                }
                
                // Special event
                if (dbEntry.gameData?.specialEvent) {
                    const event = dbEntry.gameData.specialEvent;
                    embed.addFields({
                        name: '🎪 Special Event',
                        value: [
                            `**Type:** ${event.type}`,
                            `**Ends:** <t:${Math.floor(event.endTime / 1000)}:R>`,
                            event.thiefId ? `**Thief:** <@${event.thiefId}>` : null,
                            event.amount ? `**Amount:** ${event.amount} coins` : null
                        ].filter(Boolean).join('\n'),
                        inline: true
                    });
                }
                
                // Map info
                if (dbEntry.gameData?.map) {
                    const map = dbEntry.gameData.map;
                    const playerCount = Object.keys(map.playerPositions || {}).length;
                    
                    embed.addFields({
                        name: '🗺️ Map Info',
                        value: [
                            `**Size:** ${map.width}x${map.height}`,
                            `**Entrance:** (${map.entranceX}, ${map.entranceY})`,
                            `**Players:** ${playerCount}`,
                            `**Seed:** ${map.seed || 'Unknown'}`
                        ].join('\n'),
                        inline: true
                    });
                }
                
                // Stats
                if (dbEntry.gameData?.stats) {
                    const stats = dbEntry.gameData.stats;
                    embed.addFields({
                        name: '📊 Session Statistics',
                        value: [
                            `**Walls Broken:** ${stats.wallsBroken || 0}`,
                            `**Treasures Found:** ${stats.treasuresFound || 0}`,
                            `**Total Value:** ${stats.totalMinedValue || 0} coins`,
                            `**Items Mined:** ${stats.itemsMined || 0}`
                        ].join('\n'),
                        inline: true
                    });
                }
                
                // Minecart info
                if (dbEntry.gameData?.minecarts) {
                    const minecarts = Object.keys(dbEntry.gameData.minecarts);
                    let totalItems = 0;
                    let totalValue = 0;
                    
                    for (const userId of minecarts) {
                        const cart = dbEntry.gameData.minecarts[userId];
                        if (cart.items) {
                            for (const item of cart.items) {
                                totalItems += item.quantity || 0;
                                totalValue += (item.value || 0) * (item.quantity || 0);
                            }
                        }
                    }
                    
                    embed.addFields({
                        name: '🛒 Minecart Summary',
                        value: [
                            `**Active Carts:** ${minecarts.length}`,
                            `**Total Items:** ${totalItems}`,
                            `**Total Value:** ${totalValue} coins`
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
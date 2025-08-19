// miningDebug.js - Debug commands for testing mining breaks and events
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const gachaVC = require('../models/activevcs');
const generateShop = require('../patterns/generateShop');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('miningdebug')
        .setDescription('Debug commands for mining system (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('forceshortbreak')
                .setDescription('Force a short break (5 min) immediately'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('forcelongbreak')
                .setDescription('Force a long break (25 min) with event immediately'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('forceendbreak')
                .setDescription('Force end the current break'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('forcethief')
                .setDescription('Force start a thief event'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('forcecollapse')
                .setDescription('Force start a mine collapse event'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current mining status and timers'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetcycle')
                .setDescription('Reset the break cycle counter'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('skipmining')
                .setDescription('Skip to next break time (set timer to 1 minute)')),

    async execute(interaction) {
        // Check if user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'You must be in a voice channel to use mining debug commands!', ephemeral: true });
        }

        if (interaction.member.id !== '865147754358767627') {
          return interaction.reply({ content: 'You cant use this.', ephemeral: true });
        }

        const channelId = voiceChannel.id;
        const subcommand = interaction.options.getSubcommand();

        // Get current database entry
        let dbEntry = await gachaVC.findOne({ channelId: channelId });
        if (!dbEntry) {
            return interaction.reply({ content: 'No active mining session in this voice channel!', ephemeral: true });
        }

        const now = Date.now();

        switch (subcommand) {
            case 'forceshortbreak': {
                // Import required functions
                const { createMiningSummary } = require('../patterns/gachaModes/mining/miningDatabase');
                
                // Create mining summary first
                await createMiningSummary(voiceChannel, dbEntry);
                
                // Force short break
                const breakEndTime = now + (5 * 60 * 1000); // 5 minutes
                
                // Get random floor tile for gathering
                const mapData = dbEntry.gameData?.map;
                if (!mapData) {
                    return interaction.reply({ content: 'No map data found!', ephemeral: true });
                }
                
                const floorTiles = [];
                for (let y = 0; y < mapData.height; y++) {
                    for (let x = 0; x < mapData.width; x++) {
                        const tile = mapData.tiles[y] && mapData.tiles[y][x];
                        if (tile && tile.type === 0 && tile.discovered) { // TILE_TYPES.FLOOR = 0
                            floorTiles.push({ x, y });
                        }
                    }
                }
                
                const gatherPoint = floorTiles.length > 0 
                    ? floorTiles[Math.floor(Math.random() * floorTiles.length)]
                    : { x: mapData.entranceX, y: mapData.entranceY };
                
                // Update all player positions to be tents
                const members = voiceChannel.members.filter(m => !m.user.bot);
                const scatteredPositions = {};
                
                for (const member of members.values()) {
                    scatteredPositions[member.id] = {
                        x: gatherPoint.x + Math.floor(Math.random() * 3 - 1),
                        y: gatherPoint.y + Math.floor(Math.random() * 3 - 1),
                        isTent: true
                    };
                }
                
                // Update database
                await gachaVC.updateOne(
                    { channelId: channelId },
                    {
                        $set: {
                            'gameData.breakInfo': {
                                inBreak: true,
                                isLongBreak: false,
                                breakStartTime: now,
                                breakEndTime: breakEndTime,
                                gatherPoint: gatherPoint
                            },
                            'gameData.map.playerPositions': scatteredPositions,
                            nextTrigger: new Date(breakEndTime),
                            nextShopRefresh: new Date(breakEndTime)
                        }
                    }
                );
                
                // Open shop
                await generateShop(voiceChannel, 5);
                
                const embed = new EmbedBuilder()
                    .setTitle('🛠️ Debug: Short Break Forced')
                    .setDescription(`⛺ SHORT BREAK started!\nPlayers camping at (${gatherPoint.x}, ${gatherPoint.y})\nShop is open for 5 minutes!`)
                    .setColor(0x00FF00)
                    .setTimestamp();
                
                await voiceChannel.send({ embeds: [embed] });
                await interaction.reply({ content: 'Short break forced successfully!', ephemeral: true });
                break;
            }

            case 'forcelongbreak': {
                // Import required functions
                const { createMiningSummary } = require('../patterns/gachaModes/mining/miningDatabase');
                const { pickLongBreakEvent } = require('../patterns/gachaModes/mining/miningEvents');
                
                // Create mining summary first
                await createMiningSummary(voiceChannel, dbEntry);
                
                // Force long break
                const breakEndTime = now + (25 * 60 * 1000); // 25 minutes
                
                // Update database
                const mapData = dbEntry.gameData?.map;
                if (!mapData) {
                    return interaction.reply({ content: 'No map data found!', ephemeral: true });
                }
                
                const members = voiceChannel.members.filter(m => !m.user.bot);
                const updatedPositions = {};
                
                for (const member of members.values()) {
                    updatedPositions[member.id] = {
                        x: mapData.entranceX,
                        y: mapData.entranceY,
                        hidden: true
                    };
                }
                
                await gachaVC.updateOne(
                    { channelId: channelId },
                    {
                        $set: {
                            'gameData.breakInfo': {
                                inBreak: true,
                                isLongBreak: true,
                                breakStartTime: now,
                                breakEndTime: breakEndTime
                            },
                            'gameData.map.playerPositions': updatedPositions,
                            nextTrigger: new Date(breakEndTime),
                            nextShopRefresh: new Date(breakEndTime)
                        }
                    }
                );
                
                // Get updated entry and start event
                const updatedDbEntry = await gachaVC.findOne({ channelId: channelId });
                const selectedEvent = pickLongBreakEvent();
                const eventResult = await selectedEvent(voiceChannel, updatedDbEntry);
                
                const embed = new EmbedBuilder()
                    .setTitle('🛠️ Debug: Long Break Forced')
                    .setDescription(`🎪 LONG BREAK started!\n${eventResult || 'Event started'}`)
                    .setColor(0xFF00FF)
                    .setTimestamp();
                
                await voiceChannel.send({ embeds: [embed] });
                
                // Schedule shop opening after 15 minutes (for event duration)
                setTimeout(async () => {
                    const refreshedEntry = await gachaVC.findOne({ channelId: channelId });
                    if (refreshedEntry.gameData?.breakInfo?.inBreak) {
                        await generateShop(voiceChannel, 10);
                        await voiceChannel.send('🛒 Event ended! Shop is now open for 10 minutes!');
                    }
                }, 15 * 60 * 1000);
                
                await interaction.reply({ content: 'Long break with event forced successfully!', ephemeral: true });
                break;
            }

            case 'forcethief': {
                // Force thief event specifically
                const { startThiefGame } = require('../patterns/gachaModes/mining/miningEvents');
                
                const eventResult = await startThiefGame(voiceChannel, dbEntry);
                
                const embed = new EmbedBuilder()
                    .setTitle('🛠️ Debug: Thief Event Forced')
                    .setDescription(eventResult || 'Thief event started!')
                    .setColor(0xFF0000)
                    .setTimestamp();
                
                await voiceChannel.send({ embeds: [embed] });
                await interaction.reply({ content: 'Thief event forced successfully!', ephemeral: true });
                break;
            }

            case 'forcecollapse': {
                // Force mine collapse event
                const { startMineCollapseEvent } = require('../patterns/gachaModes/mining/miningEvents');
                
                const eventResult = await startMineCollapseEvent(voiceChannel, dbEntry);
                
                const embed = new EmbedBuilder()
                    .setTitle('🛠️ Debug: Mine Collapse Forced')
                    .setDescription(eventResult || 'Mine collapse event started!')
                    .setColor(0x8B4513)
                    .setTimestamp();
                
                await voiceChannel.send({ embeds: [embed] });
                await interaction.reply({ content: 'Mine collapse event forced successfully!', ephemeral: true });
                break;
            }

            case 'forceendbreak': {
                // Force end current break
                const mapData = dbEntry.gameData?.map;
                const members = voiceChannel.members.filter(m => !m.user.bot);
                
                if (!mapData) {
                    return interaction.reply({ content: 'No map data found!', ephemeral: true });
                }
                
                // Reset all players to entrance
                const resetPositions = {};
                for (const member of members.values()) {
                    resetPositions[member.id] = {
                        x: mapData.entranceX,
                        y: mapData.entranceY,
                        isTent: false,
                        hidden: false
                    };
                }
                
                // Calculate next break timing
                const cycleCount = (dbEntry.gameData?.cycleCount || 0) + 1;
                const isNextLongBreak = (cycleCount % 4) === 3;
                const nextBreakTime = now + (25 * 60 * 1000); // 25 minutes
                
                // Clear break info and special events
                await gachaVC.updateOne(
                    { channelId: channelId },
                    {
                        $set: {
                            'gameData.map.playerPositions': resetPositions,
                            'gameData.cycleCount': cycleCount,
                            nextShopRefresh: new Date(nextBreakTime),
                            nextTrigger: new Date(nextBreakTime)
                        },
                        $unset: {
                            'gameData.breakInfo': 1,
                            'gameData.specialEvent': 1
                        }
                    }
                );
                
                const embed = new EmbedBuilder()
                    .setTitle('🛠️ Debug: Break Ended')
                    .setDescription(`⛏️ Break ended! Mining resumed.\nNext break in 25 minutes (will be ${isNextLongBreak ? 'LONG' : 'SHORT'} break)`)
                    .setColor(0x00FF00)
                    .setTimestamp();
                
                await voiceChannel.send({ embeds: [embed] });
                await interaction.reply({ content: 'Break ended successfully!', ephemeral: true });
                break;
            }

            case 'status': {
                // Show current status
                const breakInfo = dbEntry.gameData?.breakInfo;
                const specialEvent = dbEntry.gameData?.specialEvent;
                const cycleCount = dbEntry.gameData?.cycleCount || 0;
                const stats = dbEntry.gameData?.stats || {};
                
                let statusText = '';
                
                if (breakInfo?.inBreak) {
                    const timeRemaining = Math.max(0, Math.floor((breakInfo.breakEndTime - now) / 1000));
                    statusText = `**Status:** ${breakInfo.isLongBreak ? 'LONG BREAK' : 'SHORT BREAK'}\n`;
                    statusText += `**Time Remaining:** ${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s\n`;
                    
                    if (specialEvent) {
                        const eventTimeRemaining = Math.max(0, Math.floor((specialEvent.endTime - now) / 1000));
                        statusText += `**Special Event:** ${specialEvent.type}\n`;
                        statusText += `**Event Time Remaining:** ${Math.floor(eventTimeRemaining / 60)}m ${eventTimeRemaining % 60}s\n`;
                    }
                } else {
                    const miningTimeRemaining = Math.max(0, Math.floor((dbEntry.nextShopRefresh - now) / 1000));
                    statusText = `**Status:** MINING\n`;
                    statusText += `**Time Until Break:** ${Math.floor(miningTimeRemaining / 60)}m ${miningTimeRemaining % 60}s\n`;
                }
                
                statusText += `\n**Cycle Count:** ${cycleCount} (Next break: ${(cycleCount % 4) === 3 ? 'LONG' : 'SHORT'})\n`;
                statusText += `**Session Stats:**\n`;
                statusText += `• Ore Found: ${stats.totalOreFound || 0}\n`;
                statusText += `• Walls Broken: ${stats.wallsBroken || 0}\n`;
                statusText += `• Treasures Found: ${stats.treasuresFound || 0}\n`;
                
                const embed = new EmbedBuilder()
                    .setTitle('⛏️ Mining Status')
                    .setDescription(statusText)
                    .setColor(0x0099FF)
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                break;
            }

            case 'resetcycle': {
                // Reset cycle counter
                await gachaVC.updateOne(
                    { channelId: channelId },
                    {
                        $set: {
                            'gameData.cycleCount': 0
                        }
                    }
                );
                
                await interaction.reply({ content: 'Cycle counter reset to 0. Next long break will be after 3 short breaks.', ephemeral: true });
                break;
            }

            case 'skipmining': {
                // Skip to next break (set timer to 1 minute)
                const oneMinuteFromNow = now + (60 * 1000);
                
                await gachaVC.updateOne(
                    { channelId: channelId },
                    {
                        $set: {
                            nextShopRefresh: new Date(oneMinuteFromNow),
                            nextTrigger: new Date(oneMinuteFromNow)
                        }
                    }
                );
                
                const cycleCount = dbEntry.gameData?.cycleCount || 0;
                const isNextLongBreak = (cycleCount % 4) === 3;
                
                await interaction.reply({ 
                    content: `Mining timer set to 1 minute. Next break will be a ${isNextLongBreak ? 'LONG' : 'SHORT'} break.`, 
                    ephemeral: true 
                });
                break;
            }
        }
    }
};
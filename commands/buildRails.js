// commands/buildRails.js - Debug slash command for testing rail building with smart pathfinding
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const gachaVC = require('../models/activevcs');
const generateTileMapImage = require('../patterns/generateMiningProcedural');
const { clearAllRails, getRailPositions } = require('../patterns/gachaModes/mining/railPathfinding');
const railStorage = require('../patterns/gachaModes/mining/railStorage');
const { findOptimalRailStart, getRailNetworkStats } = require('../patterns/gachaModes/mining/railPathfindingExtended');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debugrails')
        .setDescription('Debug command to test minecart rail building')
        .addSubcommand(subcommand =>
            subcommand
                .setName('build')
                .setDescription('Build rails from closest rail/entrance to your position'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all rails from the map'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Show information about current rails')),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Check if user is in a voice channel
            const member = interaction.member;
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) {
                return await interaction.editReply({
                    content: '❌ You must be in a voice channel to use this command.',
                    ephemeral: true
                });
            }

            // Get the active VC data
            const activeVC = await gachaVC.findOne({ channelId: voiceChannel.id });

            if (!activeVC) {
                return await interaction.editReply({
                    content: '❌ This voice channel is not an active mining channel.',
                    ephemeral: true
                });
            }

            // Check if it's a mining type VC
            if (!activeVC.gameData || !activeVC.gameData.map) {
                return await interaction.editReply({
                    content: '❌ This channel does not have mining data. Make sure you\'re in a mining voice channel.',
                    ephemeral: true
                });
            }

            const mapData = activeVC.gameData.map;
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'build': {
                    // Find player's current position
                    const playerPosition = mapData.playerPositions?.[member.id];
                    
                    if (!playerPosition) {
                        return await interaction.editReply({
                            content: '❌ Could not find your position on the map. Make sure you\'ve joined the mining session.',
                            ephemeral: true
                        });
                    }

                    // Find optimal starting point (closest rail or entrance)
                    console.log(`[DEBUG RAILS] Finding optimal starting point for player at (${playerPosition.x}, ${playerPosition.y})`);
                    const startPoint = await findOptimalRailStart(mapData, playerPosition, voiceChannel.id);
                    
                    if (!startPoint.path) {
                        return await interaction.editReply({
                            content: `❌ Failed to build rails: ${startPoint.error || 'No valid path found'}`,
                            ephemeral: true
                        });
                    }

                    // Build rails along the path using the new storage system
                    await railStorage.buildRailPath(voiceChannel.id, startPoint.path);
                    
                    // Clear any mining system caches if they exist
                    if (global.dbCache) {
                        global.dbCache.delete(voiceChannel.id);
                    }
                    if (global.visibilityCalculator) {
                        global.visibilityCalculator.invalidate();
                    }
                    
                    console.log(`[DEBUG RAILS] Rails built from ${startPoint.isRail ? 'existing rail' : 'entrance'} to player`);

                    // Generate the new map image
                    const mapBuffer = await generateTileMapImage(voiceChannel);
                    const attachment = new AttachmentBuilder(mapBuffer, { name: 'rails_debug.png' });

                    // Determine start type for display
                    let startType = '🚂 Entrance';
                    let startColor = 0x8B4513;
                    if (startPoint.isRail) {
                        startType = '🛤️ Existing Rail';
                        startColor = 0x4169E1;
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🛤️ Rails Built Successfully!')
                        .setDescription(`Successfully built ${startPoint.distance} rail segments`)
                        .addFields(
                            { name: 'Start Type', value: startType, inline: true },
                            { name: 'Start Position', value: `(${startPoint.x}, ${startPoint.y})`, inline: true },
                            { name: 'Your Position', value: `(${playerPosition.x}, ${playerPosition.y})`, inline: true },
                            { name: 'Rail Segments', value: `${startPoint.distance}`, inline: true },
                            { name: 'Path Type', value: startPoint.isRail ? '🔗 Extension' : '🆕 New Network', inline: true },
                            { name: 'Storage', value: '✅ Separate Storage', inline: true }
                        )
                        .setColor(startColor)
                        .setImage('attachment://rails_debug.png')
                        .setTimestamp();

                    await interaction.editReply({
                        embeds: [embed],
                        files: [attachment]
                    });
                    break;
                }

                case 'clear': {
                    // Get current rail count before clearing
                    const railsData = await railStorage.getRailsData(voiceChannel.id);
                    const railCount = railStorage.countRails(railsData);
                    
                    // Clear all rails using new storage system
                    await clearAllRails(voiceChannel.id);
                    
                    // Clear mining system caches
                    if (global.dbCache) {
                        global.dbCache.delete(voiceChannel.id);
                    }
                    if (global.visibilityCalculator) {
                        global.visibilityCalculator.invalidate();
                    }
                    
                    console.log('[DEBUG RAILS] Rails cleared from separate storage');

                    // Generate the new map image
                    const mapBuffer = await generateTileMapImage(voiceChannel);
                    const attachment = new AttachmentBuilder(mapBuffer, { name: 'rails_cleared.png' });

                    const embed = new EmbedBuilder()
                        .setTitle('🧹 Rails Cleared!')
                        .setDescription(`All ${railCount} rail segments have been removed from the map.`)
                        .setColor(0xFF6347)
                        .setImage('attachment://rails_cleared.png')
                        .setTimestamp();

                    await interaction.editReply({
                        embeds: [embed],
                        files: [attachment]
                    });
                    break;
                }

                case 'info': {
                    // Get information about current rails from new storage
                    const railPositions = await getRailPositions(voiceChannel.id);
                    const railsData = await railStorage.getRailsData(voiceChannel.id);
                    const railCount = railStorage.countRails(railsData);
                    
                    // Get network statistics
                    const networkStats = await getRailNetworkStats(voiceChannel.id);
                    
                    // Generate current map image
                    const mapBuffer = await generateTileMapImage(voiceChannel);
                    const attachment = new AttachmentBuilder(mapBuffer, { name: 'rails_info.png' });

                    const embed = new EmbedBuilder()
                        .setTitle('🛤️ Rail Network Information')
                        .setDescription(`Current rail network status for this mining channel.`)
                        .addFields(
                            { name: 'Total Rail Tiles', value: `${railCount}`, inline: true },
                            { name: 'Map Size', value: `${mapData.width}x${mapData.height}`, inline: true },
                            { name: 'Entrance', value: `(${mapData.entranceX}, ${mapData.entranceY})`, inline: true },
                            { name: 'Networks', value: `${networkStats.networks}`, inline: true },
                            { name: 'Largest Network', value: `${networkStats.largestNetwork} tiles`, inline: true },
                            { name: 'Isolated Rails', value: `${networkStats.isolated}`, inline: true },
                            { name: 'Storage Type', value: '✅ Separate Rail Storage', inline: false }
                        )
                        .setColor(0x4169E1)
                        .setImage('attachment://rails_info.png')
                        .setTimestamp();

                    // Add network sizes if there are multiple networks
                    if (networkStats.networks > 1 && networkStats.networkSizes) {
                        const networkSizesStr = networkStats.networkSizes.slice(0, 5).join(', ');
                        embed.addFields({ 
                            name: 'Network Sizes', 
                            value: `${networkSizesStr}${networkStats.networkSizes.length > 5 ? ', ...' : ''}`, 
                            inline: false 
                        });
                    }

                    // Add rail positions if there aren't too many
                    if (railPositions.length > 0 && railPositions.length <= 15) {
                        const positionsStr = railPositions.map(p => `(${p.x},${p.y})`).join(', ');
                        embed.addFields({ name: 'Rail Positions', value: positionsStr, inline: false });
                    } else if (railPositions.length > 15) {
                        const coverage = ((railPositions.length / (mapData.width * mapData.height)) * 100).toFixed(1);
                        embed.addFields({ 
                            name: 'Rail Coverage', 
                            value: `Rails cover ${coverage}% of the map (${railPositions.length} tiles)`, 
                            inline: false 
                        });
                    }

                    await interaction.editReply({
                        embeds: [embed],
                        files: [attachment]
                    });
                    break;
                }
            }

        } catch (error) {
            console.error('[DEBUG RAILS] Error:', error);
            await interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
                ephemeral: true
            });
        }
    }
};
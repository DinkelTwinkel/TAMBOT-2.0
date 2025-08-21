// commands/build.js - Build mining rails from entrance/nearest rail to player position
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const gachaVC = require('../models/activevcs');
const PlayerInventory = require('../models/inventory');
const generateTileMapImage = require('../patterns/gachaModes/mining/imageProcessing/mining-layered-render.js');
const { findOptimalRailStart } = require('../patterns/gachaModes/mining/railPathfindingExtended');
const { checkAndHandleMapChanges } = require('../patterns/gachaModes/mining/coordinateManager');
const railStorage = require('../patterns/gachaModes/mining/railStorage');

// Item ID for Iron Ore from itemSheet.json
const IRON_ORE_ID = '22';
const RAIL_COST_PER_TILE = 1; // 1 iron per tile

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build')
        .setDescription('Build minecart rails from the nearest point to your position (costs 1 iron per tile)'),

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
                    content: '❌ There is nothing to build here.',
                    ephemeral: true
                });
            }

            // Check if it's a mining type VC (verify gameData.map exists and type is mining)
            if (!activeVC.gameData || !activeVC.gameData.map) {
                return await interaction.editReply({
                    content: '❌ There is nothing to build here.',
                    ephemeral: true
                });
            }

            // Additional check for mining type - check if typeId indicates mining
            // You can verify this by checking against gachaServers.json if needed
            // For now, we'll assume if it has map data, it's a mining channel

            const mapData = activeVC.gameData.map;

            // Find player's current position
            const playerPosition = mapData.playerPositions?.[member.id];
            
            if (!playerPosition) {
                return await interaction.editReply({
                    content: '❌ Could not find your position on the map. Make sure you\'ve joined the mining session.',
                    ephemeral: true
                });
            }

            // Check for map changes and update coordinates if needed
            const coordinateUpdate = await checkAndHandleMapChanges(voiceChannel.id, mapData);
            if (coordinateUpdate.updated) {
                console.log(`[BUILD] Map expanded, coordinates updated with shift (${coordinateUpdate.shiftX}, ${coordinateUpdate.shiftY})`);
            }

            // Find optimal starting point (closest rail or entrance)
            console.log(`[BUILD] Finding optimal starting point for player at (${playerPosition.x}, ${playerPosition.y})`);
            const startPoint = await findOptimalRailStart(mapData, playerPosition, voiceChannel.id);
            
            if (!startPoint.path || startPoint.path.length === 0) {
                return await interaction.editReply({
                    content: `❌ Failed to build rails: ${startPoint.error || 'No valid path found'}`,
                    ephemeral: true
                });
            }

            // Calculate cost (path includes start and end points)
            const railsNeeded = startPoint.path.length - 1; // Subtract 1 because we don't build on the player's position
            const ironCost = railsNeeded * RAIL_COST_PER_TILE;

            // Check player's inventory for iron ore
            const userId = interaction.user.id;
            let inventory = await PlayerInventory.findOne({ playerId: userId });

            if (!inventory) {
                inventory = new PlayerInventory({
                    playerId: userId,
                    playerTag: interaction.user.tag,
                    items: []
                });
            }

            // Find iron ore in inventory
            const ironOre = inventory.items.find(item => 
                item.itemId === IRON_ORE_ID || item.id === IRON_ORE_ID
            );
            const currentIronQuantity = ironOre?.quantity || 0;

            // Check if player has enough iron
            if (currentIronQuantity < ironCost) {
                if (currentIronQuantity === 0) {
                    return await interaction.editReply({
                        content: `❌ You need **${ironCost} Iron Ore** to build rails here, but you don't have any.\n` +
                                `💡 Mine iron ore from the walls to collect materials for building rails!`,
                        ephemeral: true
                    });
                }

                // Calculate how many tiles they can afford
                const affordableTiles = Math.floor(currentIronQuantity / RAIL_COST_PER_TILE);
                
                if (affordableTiles === 0) {
                    return await interaction.editReply({
                        content: `❌ You need at least **1 Iron Ore** to build rails, but you only have ${currentIronQuantity}.`,
                        ephemeral: true
                    });
                }

                // Build only what they can afford
                const partialPath = startPoint.path.slice(0, affordableTiles + 1); // Include start position
                
                // Deduct all their iron
                if (ironOre) {
                    inventory.items = inventory.items.filter(item => 
                        item.itemId !== IRON_ORE_ID && item.id !== IRON_ORE_ID
                    );
                }
                
                await inventory.save();

                // Build the partial rails
                await railStorage.mergeRailPath(voiceChannel.id, partialPath);
                
                // Clear any caches
                if (global.dbCache) {
                    global.dbCache.delete(voiceChannel.id);
                }
                if (global.visibilityCalculator) {
                    global.visibilityCalculator.invalidate();
                }

                // Generate the new map image
                const mapBuffer = await generateTileMapImage(voiceChannel);
                const attachment = new AttachmentBuilder(mapBuffer, { name: 'rails_built.png' });

                const embed = new EmbedBuilder()
                    .setTitle('🛤️ Partial Rails Built')
                    .setDescription(`Built **${affordableTiles}** rail segments using all your iron ore.\n` +
                                  `You need **${ironCost - currentIronQuantity} more Iron Ore** to complete the path to your position.`)
                    .addFields(
                        { name: 'Rails Built', value: `${affordableTiles}`, inline: true },
                        { name: 'Iron Used', value: `${currentIronQuantity}`, inline: true },
                        { name: 'Still Needed', value: `${railsNeeded - affordableTiles} rails`, inline: true }
                    )
                    .setColor(0xFFA500) // Orange for partial completion
                    .setImage('attachment://rails_built.png')
                    .setTimestamp();

                return await interaction.editReply({
                    embeds: [embed],
                    files: [attachment]
                });
            }

            // Player has enough iron, deduct the cost
            if (ironOre) {
                ironOre.quantity -= ironCost;
                
                // Remove the item if quantity reaches 0
                if (ironOre.quantity <= 0) {
                    inventory.items = inventory.items.filter(item => 
                        item.itemId !== IRON_ORE_ID && item.id !== IRON_ORE_ID
                    );
                }
            }
            
            // Save inventory changes
            inventory.markModified('items');
            await inventory.save();

            // Build rails along the full path
            await railStorage.mergeRailPath(voiceChannel.id, startPoint.path);
            
            // Clear any mining system caches
            if (global.dbCache) {
                global.dbCache.delete(voiceChannel.id);
            }
            if (global.visibilityCalculator) {
                global.visibilityCalculator.invalidate();
            }
            
            console.log(`[BUILD] Rails built from ${startPoint.isRail ? 'existing rail' : 'entrance'} to player`);

            // Generate the new map image
            const mapBuffer = await generateTileMapImage(voiceChannel);
            const attachment = new AttachmentBuilder(mapBuffer, { name: 'rails_built.png' });

            // Determine start type for display
            let startType = '🚂 Entrance';
            let startColor = 0x8B4513;
            if (startPoint.isRail) {
                startType = '🛤️ Existing Rail';
                startColor = 0x4169E1;
            }

            const embed = new EmbedBuilder()
                .setTitle('🛤️ Rails Built Successfully!')
                .setDescription(`Successfully built **${railsNeeded}** rail segments using **${ironCost} Iron Ore**.`)
                .addFields(
                    { name: 'Start Type', value: startType, inline: true },
                    { name: 'Start Position', value: `(${startPoint.x}, ${startPoint.y})`, inline: true },
                    { name: 'Your Position', value: `(${playerPosition.x}, ${playerPosition.y})`, inline: true },
                    { name: 'Rail Segments', value: `${railsNeeded}`, inline: true },
                    { name: 'Iron Cost', value: `${ironCost}`, inline: true },
                    { name: 'Iron Remaining', value: `${currentIronQuantity - ironCost}`, inline: true }
                )
                .setColor(startColor)
                .setImage('attachment://rails_built.png')
                .setFooter({ text: 'Rails help you travel quickly through the mine!' })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                files: [attachment]
            });

        } catch (error) {
            console.error('[BUILD] Error:', error);
            await interaction.editReply({
                content: `❌ An error occurred: ${error.message}`,
                ephemeral: true
            });
        }
    }
};
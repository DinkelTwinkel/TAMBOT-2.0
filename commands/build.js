// commands/build.js - Build mining rails from entrance/nearest rail to player position
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const gachaVC = require('../models/activevcs');
const PlayerInventory = require('../models/inventory');
const generateTileMapImage = require('../patterns/gachaModes/mining/imageProcessing/mining-layered-render.js');
const { findOptimalRailStart } = require('../patterns/gachaModes/mining/railPathfindingExtended');
const { checkAndHandleMapChanges } = require('../patterns/gachaModes/mining/coordinateManager');
const railStorage = require('../patterns/gachaModes/mining/railStorage');
const mongoose = require('mongoose');

// Item ID for Iron Ore from itemSheet.json
const IRON_ORE_ID = '22';
const RAIL_COST_PER_TILE = 1; // 1 iron per tile

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build')
        .setDescription('Build minecart rails from the nearest point to your position (costs 1 iron per tile)'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

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

            // If starting from entrance, find an adjacent floor tile to start from instead
            if (startPoint.x === mapData.entranceX && startPoint.y === mapData.entranceY) {
                // Get the neighbors of the entrance
                const entranceNeighbors = [
                    { x: mapData.entranceX, y: mapData.entranceY - 1 }, // North
                    { x: mapData.entranceX + 1, y: mapData.entranceY }, // East  
                    { x: mapData.entranceX, y: mapData.entranceY + 1 }, // South
                    { x: mapData.entranceX - 1, y: mapData.entranceY }  // West
                ];
                
                // Find the neighbor that's on the path (should be the second position)
                let adjacentStart = null;
                if (startPoint.path.length > 1) {
                    const secondPos = startPoint.path[1];
                    adjacentStart = entranceNeighbors.find(n => 
                        n.x === secondPos.x && n.y === secondPos.y
                    );
                }
                
                // If we found an adjacent start, update the start point and path
                if (adjacentStart) {
                    startPoint.x = adjacentStart.x;
                    startPoint.y = adjacentStart.y;
                    // Remove the entrance from the path (first element)
                    startPoint.path = startPoint.path.slice(1);
                    console.log(`[BUILD] Adjusted start point to adjacent tile (${adjacentStart.x}, ${adjacentStart.y})`);
                }
            }

            // Calculate cost (path includes start and end points)
            const railsNeeded = startPoint.path.length - 1; // Subtract 1 because we don't build on the player's position
            const ironCost = railsNeeded * RAIL_COST_PER_TILE;

            // Start a MongoDB session for atomic operations
            const session = await mongoose.startSession();
            
            try {
                await session.withTransaction(async () => {
                    // Re-fetch documents within the transaction for consistency
                    const userId = interaction.user.id;
                    let inventory = await PlayerInventory.findOne({ playerId: userId }).session(session);
                    
                    if (!inventory) {
                        inventory = new PlayerInventory({
                            playerId: userId,
                            playerTag: interaction.user.tag,
                            items: []
                        });
                    }

                    // Re-fetch activeVC within transaction
                    const currentVC = await gachaVC.findOne({ channelId: voiceChannel.id }).session(session);
                    
                    if (!currentVC) {
                        throw new Error('Voice channel data no longer exists');
                    }

                    // Find iron ore in inventory
                    const ironOre = inventory.items.find(item => 
                        item.itemId === IRON_ORE_ID || item.id === IRON_ORE_ID
                    );
                    const playerIronQuantity = ironOre?.quantity || 0;

                    // Check minecart inventory for iron ore
                    let minecartIronQuantity = 0;
                    let minecartIronOre = null;
                    if (currentVC.gameData.minecart && currentVC.gameData.minecart.items) {
                        minecartIronOre = currentVC.gameData.minecart.items.find(item => 
                            item.itemId === IRON_ORE_ID || item.id === IRON_ORE_ID
                        );
                        minecartIronQuantity = minecartIronOre?.quantity || 0;
                    }

                    const totalAvailableIron = playerIronQuantity + minecartIronQuantity;

                    // Check if there's enough iron between player and minecart
                    if (totalAvailableIron < ironCost) {
                        if (totalAvailableIron === 0) {
                            throw new Error(
                                `You need **${ironCost} Iron Ore** to build rails here, but you don't have any.\n` +
                                `💡 Mine iron ore from the walls to collect materials for building rails!`
                            );
                        }

                        // Calculate how many tiles they can afford
                        const affordableTiles = Math.floor(totalAvailableIron / RAIL_COST_PER_TILE);
                        
                        if (affordableTiles === 0) {
                            throw new Error(`You need at least **1 Iron Ore** to build rails, but you only have ${totalAvailableIron}.`);
                        }

                        // Build only what they can afford
                        const partialPath = startPoint.path.slice(0, affordableTiles + 1); // Include start position
                        const actualIronUsed = affordableTiles * RAIL_COST_PER_TILE;
                        
                        // Deduct iron from player first, then minecart
                        let remainingToDeduct = actualIronUsed;
                        let usedPlayerIron = 0;
                        let usedMinecartIron = 0;
                        
                        // Deduct from player inventory first
                        if (ironOre && playerIronQuantity > 0) {
                            const deductFromPlayer = Math.min(playerIronQuantity, remainingToDeduct);
                            ironOre.quantity -= deductFromPlayer;
                            remainingToDeduct -= deductFromPlayer;
                            usedPlayerIron = deductFromPlayer;
                            
                            if (ironOre.quantity <= 0) {
                                inventory.items = inventory.items.filter(item => 
                                    item.itemId !== IRON_ORE_ID && item.id !== IRON_ORE_ID
                                );
                            }
                        }
                        
                        // Deduct remaining from minecart if needed
                        if (remainingToDeduct > 0 && minecartIronOre) {
                            minecartIronOre.quantity -= remainingToDeduct;
                            usedMinecartIron = remainingToDeduct;
                            
                            if (minecartIronOre.quantity <= 0) {
                                currentVC.gameData.minecart.items = currentVC.gameData.minecart.items.filter(item => 
                                    item.itemId !== IRON_ORE_ID && item.id !== IRON_ORE_ID
                                );
                            }
                            
                            currentVC.markModified('gameData.minecart.items');
                        }
                        
                        // Save within transaction
                        inventory.markModified('items');
                        await inventory.save({ session });
                        await currentVC.save({ session });

                        // Build the partial rails (entrance already excluded by adjustment above)
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

                        const ironSource = usedMinecartIron > 0 && usedPlayerIron > 0 ? 
                            '(Used iron from inventory and minecart)' : 
                            usedPlayerIron > 0 ? '(Used iron from inventory)' : '(Used iron from minecart)';

                        const embed = new EmbedBuilder()
                            .setTitle('🛤️ Partial Rails Built')
                            .setDescription(`Built **${affordableTiles}** rail segments using all available iron ore ${ironSource}.\n` +
                                          `You need **${ironCost - totalAvailableIron} more Iron Ore** to complete the path to your position.`)
                            .addFields(
                                { name: 'Rails Built', value: `${affordableTiles}`, inline: true },
                                { name: 'Iron Used', value: `${actualIronUsed}`, inline: true },
                                { name: 'Still Needed', value: `${railsNeeded - affordableTiles} rails`, inline: true }
                            )
                            .setColor(0xFFA500) // Orange for partial completion
                            .setImage('attachment://rails_built.png')
                            .setTimestamp();

                        await interaction.editReply({
                            embeds: [embed],
                            files: [attachment],
                            ephemeral: true
                        });
                        
                        // Exit the transaction early for partial builds
                        return;
                    }

                    // Player has enough iron, deduct the cost (prioritize player inventory, then minecart)
                    let remainingToDeduct = ironCost;
                    let usedPlayerIron = 0;
                    let usedMinecartIron = 0;
                    
                    // Deduct from player inventory first
                    if (ironOre && playerIronQuantity > 0) {
                        const deductFromPlayer = Math.min(playerIronQuantity, remainingToDeduct);
                        ironOre.quantity -= deductFromPlayer;
                        remainingToDeduct -= deductFromPlayer;
                        usedPlayerIron = deductFromPlayer;
                        
                        // Remove the item if quantity reaches 0
                        if (ironOre.quantity <= 0) {
                            inventory.items = inventory.items.filter(item => 
                                item.itemId !== IRON_ORE_ID && item.id !== IRON_ORE_ID
                            );
                        }
                    }
                    
                    // Deduct remaining from minecart if needed
                    if (remainingToDeduct > 0 && minecartIronOre) {
                        minecartIronOre.quantity -= remainingToDeduct;
                        usedMinecartIron = remainingToDeduct;
                        
                        if (minecartIronOre.quantity <= 0) {
                            currentVC.gameData.minecart.items = currentVC.gameData.minecart.items.filter(item => 
                                item.itemId !== IRON_ORE_ID && item.id !== IRON_ORE_ID
                            );
                        }
                        
                        currentVC.markModified('gameData.minecart.items');
                    }
                    
                    // Save inventory changes within transaction
                    inventory.markModified('items');
                    await inventory.save({ session });
                    await currentVC.save({ session });

                    // Build rails along the path (entrance already excluded by adjustment above)
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

                    // Build source description
                    let ironSourceDesc = '';
                    if (usedMinecartIron > 0 && usedPlayerIron > 0) {
                        ironSourceDesc = `\n*Used ${usedPlayerIron} from inventory and ${usedMinecartIron} from minecart*`;
                    } else if (usedMinecartIron > 0) {
                        ironSourceDesc = `\n*Used ${usedMinecartIron} iron from minecart*`;
                    } else {
                        ironSourceDesc = `\n*Used ${usedPlayerIron} iron from inventory*`;
                    }

                    const remainingPlayerIron = (ironOre?.quantity || 0);
                    const remainingMinecartIron = (minecartIronOre?.quantity || 0);

                    const embed = new EmbedBuilder()
                        .setTitle('🛤️ Rails Built Successfully!')
                        .setDescription(`Successfully built **${railsNeeded}** rail segments using **${ironCost} Iron Ore**.${ironSourceDesc}`)
                        .addFields(
                            { name: 'Start Type', value: startType, inline: true },
                            { name: 'Start Position', value: `(${startPoint.x}, ${startPoint.y})`, inline: true },
                            { name: 'Your Position', value: `(${playerPosition.x}, ${playerPosition.y})`, inline: true },
                            { name: 'Rail Segments', value: `${railsNeeded}`, inline: true },
                            { name: 'Iron Cost', value: `${ironCost}`, inline: true },
                            { name: 'Iron Remaining', value: `Inv: ${remainingPlayerIron}\nCart: ${remainingMinecartIron}`, inline: true }
                        )
                        .setColor(startColor)
                        .setImage('attachment://rails_built.png')
                        .setFooter({ text: 'Rails help you travel quickly through the mine!' })
                        .setTimestamp();

                    await interaction.editReply({
                        embeds: [embed],
                        files: [attachment],
                        ephemeral: true
                    });
                });
            } finally {
                await session.endSession();
            }

        } catch (error) {
            console.error('[BUILD] Error:', error);
            
            // Check if it's one of our controlled error messages
            if (error.message && (error.message.includes('Iron Ore') || error.message.includes('rail'))) {
                await interaction.editReply({
                    content: `❌ ${error.message}`,
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: `❌ An error occurred: ${error.message}`,
                    ephemeral: true
                });
            }
        }
    }
};
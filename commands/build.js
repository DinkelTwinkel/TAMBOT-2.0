// commands/build.js - Build mining rails from entrance/nearest rail to player position
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const gachaVC = require('../models/activevcs');
const PlayerInventory = require('../models/inventory');
const { generateTileMapImage } = require('../patterns/gachaModes/mining/imageProcessing/mining-layered-render.js');
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
                const entranceNeighbors = [
                    { x: mapData.entranceX, y: mapData.entranceY - 1 }, // North
                    { x: mapData.entranceX + 1, y: mapData.entranceY }, // East  
                    { x: mapData.entranceX, y: mapData.entranceY + 1 }, // South
                    { x: mapData.entranceX - 1, y: mapData.entranceY }  // West
                ];
                
                let adjacentStart = null;
                if (startPoint.path.length > 1) {
                    const secondPos = startPoint.path[1];
                    adjacentStart = entranceNeighbors.find(n => 
                        n.x === secondPos.x && n.y === secondPos.y
                    );
                }
                
                if (adjacentStart) {
                    startPoint.x = adjacentStart.x;
                    startPoint.y = adjacentStart.y;
                    startPoint.path = startPoint.path.slice(1);
                    console.log(`[BUILD] Adjusted start point to adjacent tile (${adjacentStart.x}, ${adjacentStart.y})`);
                }
            }

            // Calculate cost
            const railsNeeded = startPoint.path.length - 1; // Subtract 1 because we don't build on the player's position
            const ironCost = railsNeeded * RAIL_COST_PER_TILE;

            // Variables to track what was used
            let usedMinecartIron = 0;
            let usedPlayerIron = 0;
            let pathToBuild = startPoint.path;
            let actualRailsBuilt = railsNeeded;

            // Start a MongoDB session for atomic operations
            const session = await mongoose.startSession();
            
            try {
                // Perform the transaction
                const transactionResult = await session.withTransaction(async () => {
                    // Re-fetch documents within the transaction for consistency
                    const currentVC = await gachaVC.findOne({ channelId: voiceChannel.id }).session(session);
                    
                    if (!currentVC) {
                        throw new Error('Voice channel data no longer exists');
                    }

                    // Check minecart inventory for iron ore first
                    let minecartIronQuantity = 0;
                    const minecartItems = currentVC.gameData?.minecart?.items;
                    
                    if (minecartItems && minecartItems[IRON_ORE_ID]) {
                        minecartIronQuantity = minecartItems[IRON_ORE_ID].quantity || 0;
                    }

                    // Check player's inventory
                    const userId = interaction.user.id;
                    let inventory = await PlayerInventory.findOne({ playerId: userId }).session(session);
                    let playerIronQuantity = 0;
                    let ironOre = null;
                    
                    if (!inventory) {
                        inventory = new PlayerInventory({
                            playerId: userId,
                            playerTag: interaction.user.tag,
                            items: []
                        });
                    } else {
                        ironOre = inventory.items.find(item => 
                            item.itemId === IRON_ORE_ID || item.id === IRON_ORE_ID
                        );
                        playerIronQuantity = ironOre?.quantity || 0;
                    }

                    const totalAvailableIron = minecartIronQuantity + playerIronQuantity;

                    // Check if there's enough iron
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

                        // Build only what they can afford (partial build)
                        pathToBuild = startPoint.path.slice(0, affordableTiles + 1);
                        actualRailsBuilt = affordableTiles;
                        const actualIronUsed = affordableTiles * RAIL_COST_PER_TILE;
                        
                        // Deduct iron from minecart first, then player inventory
                        let remainingToDeduct = actualIronUsed;
                        
                        // Deduct from minecart first
                        if (minecartIronQuantity > 0) {
                            const deductFromMinecart = Math.min(minecartIronQuantity, remainingToDeduct);
                            
                            currentVC.gameData.minecart.items[IRON_ORE_ID].quantity -= deductFromMinecart;
                            
                            const contributors = currentVC.gameData.minecart.items[IRON_ORE_ID].contributors;
                            if (contributors && contributors[userId]) {
                                contributors[userId] = Math.max(0, contributors[userId] - deductFromMinecart);
                            }
                            
                            if (currentVC.gameData.minecart.items[IRON_ORE_ID].quantity <= 0) {
                                delete currentVC.gameData.minecart.items[IRON_ORE_ID];
                            }
                            
                            remainingToDeduct -= deductFromMinecart;
                            usedMinecartIron = deductFromMinecart;
                            currentVC.markModified('gameData.minecart.items');
                        }
                        
                        // Deduct remaining from player inventory
                        if (remainingToDeduct > 0 && ironOre) {
                            ironOre.quantity -= remainingToDeduct;
                            usedPlayerIron = remainingToDeduct;
                            
                            if (ironOre.quantity <= 0) {
                                inventory.items = inventory.items.filter(item => 
                                    item.itemId !== IRON_ORE_ID && item.id !== IRON_ORE_ID
                                );
                            }
                            inventory.markModified('items');
                        }
                        
                        // Save within transaction
                        if (usedPlayerIron > 0) {
                            await inventory.save({ session });
                        }
                        if (usedMinecartIron > 0) {
                            await currentVC.save({ session });
                        }
                        
                        return { partial: true, ironCost: actualIronUsed };
                    }

                    // Full build - player has enough iron
                    let remainingToDeduct = ironCost;
                    
                    // Deduct from minecart first
                    if (minecartIronQuantity > 0) {
                        const deductFromMinecart = Math.min(minecartIronQuantity, remainingToDeduct);
                        
                        currentVC.gameData.minecart.items[IRON_ORE_ID].quantity -= deductFromMinecart;
                        
                        const contributors = currentVC.gameData.minecart.items[IRON_ORE_ID].contributors;
                        if (contributors && contributors[userId]) {
                            contributors[userId] = Math.max(0, contributors[userId] - deductFromMinecart);
                        }
                        
                        if (currentVC.gameData.minecart.items[IRON_ORE_ID].quantity <= 0) {
                            delete currentVC.gameData.minecart.items[IRON_ORE_ID];
                        }
                        
                        remainingToDeduct -= deductFromMinecart;
                        usedMinecartIron = deductFromMinecart;
                        currentVC.markModified('gameData.minecart.items');
                    }
                    
                    // Deduct remaining from player inventory
                    if (remainingToDeduct > 0 && ironOre) {
                        ironOre.quantity -= remainingToDeduct;
                        usedPlayerIron = remainingToDeduct;
                        
                        if (ironOre.quantity <= 0) {
                            inventory.items = inventory.items.filter(item => 
                                item.itemId !== IRON_ORE_ID && item.id !== IRON_ORE_ID
                            );
                        }
                        inventory.markModified('items');
                    }
                    
                    // Save within transaction
                    if (usedPlayerIron > 0) {
                        await inventory.save({ session });
                    }
                    if (usedMinecartIron > 0) {
                        await currentVC.save({ session });
                    }
                    
                    return { partial: false, ironCost };
                });

                // Transaction completed successfully, now build the rails (outside transaction)
                console.log(`[BUILD] Transaction complete, building ${actualRailsBuilt} rails...`);
                
                // Build rails (this is separate from the transaction)
                await railStorage.mergeRailPath(voiceChannel.id, pathToBuild);
                
                // Clear caches
                if (global.dbCache) {
                    global.dbCache.delete(voiceChannel.id);
                }
                if (global.visibilityCalculator) {
                    global.visibilityCalculator.invalidate();
                }
                
                console.log(`[BUILD] Rails built successfully`);

                // Generate the map image
                const mapBuffer = await generateTileMapImage(voiceChannel);
                const attachment = new AttachmentBuilder(mapBuffer, { name: 'rails_built.png' });

                // Get updated quantities for display
                const updatedVC = await gachaVC.findOne({ channelId: voiceChannel.id });
                const remainingMinecartIron = updatedVC.gameData?.minecart?.items?.[IRON_ORE_ID]?.quantity || 0;
                
                const updatedInventory = await PlayerInventory.findOne({ playerId: interaction.user.id });
                let remainingPlayerIron = 0;
                if (updatedInventory) {
                    const updatedIronOre = updatedInventory.items.find(item => 
                        item.itemId === IRON_ORE_ID || item.id === IRON_ORE_ID
                    );
                    remainingPlayerIron = updatedIronOre?.quantity || 0;
                }

                // Build response embed based on whether it was partial or full build
                if (transactionResult.partial) {
                    // Partial build response
                    const ironSource = usedMinecartIron > 0 && usedPlayerIron > 0 ? 
                        '(Used iron from minecart and inventory)' : 
                        usedMinecartIron > 0 ? '(Used iron from minecart)' : '(Used iron from inventory)';

                    const embed = new EmbedBuilder()
                        .setTitle('🛤️ Partial Rails Built')
                        .setDescription(`Built **${actualRailsBuilt}** rail segments using all available iron ore ${ironSource}.\n` +
                                      `You need **${ironCost - transactionResult.ironCost} more Iron Ore** to complete the path to your position.`)
                        .addFields(
                            { name: 'Rails Built', value: `${actualRailsBuilt}`, inline: true },
                            { name: 'Iron Used', value: `${transactionResult.ironCost}`, inline: true },
                            { name: 'Still Needed', value: `${railsNeeded - actualRailsBuilt} rails`, inline: true }
                        )
                        .setColor(0xFFA500) // Orange for partial completion
                        .setImage('attachment://rails_built.png')
                        .setTimestamp();

                    await interaction.editReply({
                        embeds: [embed],
                        files: [attachment],
                        ephemeral: true
                    });
                } else {
                    // Full build response
                    let startType = '🚂 Entrance';
                    let startColor = 0x8B4513;
                    if (startPoint.isRail) {
                        startType = '🛤️ Existing Rail';
                        startColor = 0x4169E1;
                    }

                    let ironSourceDesc = '';
                    if (usedMinecartIron > 0 && usedPlayerIron > 0) {
                        ironSourceDesc = `\n*Used ${usedMinecartIron} from minecart and ${usedPlayerIron} from inventory*`;
                    } else if (usedMinecartIron > 0) {
                        ironSourceDesc = `\n*Used ${usedMinecartIron} iron from minecart*`;
                    } else {
                        ironSourceDesc = `\n*Used ${usedPlayerIron} iron from inventory*`;
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🛤️ Rails Built Successfully!')
                        .setDescription(`Successfully built **${railsNeeded}** rail segments using **${ironCost} Iron Ore**.${ironSourceDesc}`)
                        .addFields(
                            { name: 'Start Type', value: startType, inline: true },
                            { name: 'Start Position', value: `(${startPoint.x}, ${startPoint.y})`, inline: true },
                            { name: 'Your Position', value: `(${playerPosition.x}, ${playerPosition.y})`, inline: true },
                            { name: 'Rail Segments', value: `${railsNeeded}`, inline: true },
                            { name: 'Iron Cost', value: `${ironCost}`, inline: true },
                            { name: 'Iron Remaining', value: `Cart: ${remainingMinecartIron}\nInv: ${remainingPlayerIron}`, inline: true }
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
                }

            } catch (sessionError) {
                console.error('[BUILD] Session/Transaction error:', sessionError);
                throw sessionError;
            } finally {
                // Always end the session
                await session.endSession();
                console.log('[BUILD] Session ended');
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
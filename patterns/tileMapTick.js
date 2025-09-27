const TileMap = require('../models/TileMap');
const { getOrCreateTileMap, generateTileMapImage } = require('./mapSystem');
const ActiveVCS = require('../models/activevcs');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');

// Track previous center tile points for assault detection
let previousCenterPoints = null;

// Track previous war map message for editing
let previousWarMapMessageId = null;

/**
 * Main tile processing function - handles decay, growth, influence, and channel updates
 * @param {string} guildId - Guild ID to process
 * @param {Object} client - Discord client instance
 */
async function processTileMapTick(guildId, client) {
    try {
        console.log(`🗺️ [TICK START] Processing tile map tick for guild ${guildId}`);
        const tileMap = await getOrCreateTileMap(guildId);
        let changesCount = 0;
        
        // Clean up invalid gacha server references
        const cleanupCount = await cleanupInvalidGachaServers(guildId, tileMap, client);
        if (cleanupCount > 0) {
            changesCount += cleanupCount;
            console.log(`🗺️ [CLEANUP] Removed ${cleanupCount} invalid gacha server reference(s)`);
        }
        
        // Retroactively assign tiles to activeVCs that don't have assignments
        const assignmentCount = await assignUnassignedActiveVCs(guildId, tileMap, client);
        if (assignmentCount > 0) {
            changesCount += assignmentCount;
            console.log(`🗺️ [RETROACTIVE] Assigned ${assignmentCount} existing activeVC(s) to tiles`);
        }
        
        // Find all tiles with points > 0 (player territory)
        const territoryTiles = tileMap.tiles.filter(tile => tile.points > 0);
        
        if (territoryTiles.length === 0) {
            // Still update channels even if no territory
            if (guildId === '1221772148385910835') {
                await updateHellungiChannelName(guildId, tileMap, client);
                await updateCitadelAndVisibility(guildId, tileMap, client);
            }
            return;
        }
        
        // Create a set of territory coordinates for quick lookup
        const territoryCoords = new Set(
            territoryTiles.map(tile => `${tile.row},${tile.col}`)
        );
        
        // Find edge tiles (territory tiles that have at least one non-territory neighbor)
        const edgeTiles = [];
        
        for (const tile of territoryTiles) {
            const neighbors = getHexagonalNeighbors(tile.row, tile.col, tileMap.mapSize);
            
            // Check if this tile is on the edge (has at least one neighbor with 0 points)
            const isEdge = neighbors.some(([nRow, nCol]) => {
                const neighborKey = `${nRow},${nCol}`;
                return !territoryCoords.has(neighborKey);
            });
            
            if (isEdge) {
                edgeTiles.push(tile);
            }
        }
        
        // First, process ALL gacha server tiles (regardless of edge status)
        const gachaTiles = tileMap.tiles.filter(tile => tile.gachaServerId);
        console.log(`🗺️ [DEBUG] Found ${gachaTiles.length} gacha tiles to process`);
        
        for (const tile of gachaTiles) {
            // Has gacha server: increase by number of users in channel
            const userCount = await getChannelUserCount(guildId, tile.gachaServerId, client);
            const pointIncrease = Math.max(1, userCount); // Minimum 1 point even if no users
            const oldPoints = tile.points;
            const newPoints = tile.points + pointIncrease;
            
            const updateSuccess = tileMap.updateTilePoints(tile.row, tile.col, newPoints);
            if (updateSuccess) {
                changesCount++;
                console.log(`🗺️ [GACHA GROWTH] Tile (${tile.row}, ${tile.col}) with gacha ${tile.gachaServerId}: ${oldPoints} → ${newPoints} (+${pointIncrease} from ${userCount} user(s))`);
                
                // Check if this gacha tile is adjacent to the capital
                const neighbors = getHexagonalNeighbors(tile.row, tile.col, tileMap.mapSize);
                const isAdjacentToCapital = neighbors.some(([nRow, nCol]) => 
                    nRow === tileMap.centerRow && nCol === tileMap.centerCol
                );
                
                if (isAdjacentToCapital) {
                    // Increase capital tile points as well
                    const capitalTile = tileMap.getTile(tileMap.centerRow, tileMap.centerCol);
                    const capitalOldPoints = capitalTile.points;
                    const capitalNewPoints = capitalTile.points + pointIncrease;
                    
                    const capitalUpdateSuccess = tileMap.updateTilePoints(tileMap.centerRow, tileMap.centerCol, capitalNewPoints);
                    if (capitalUpdateSuccess) {
                        changesCount++;
                        console.log(`🗺️ [CAPITAL BOOST] Capital tile boosted by adjacent gacha: ${capitalOldPoints} → ${capitalNewPoints} (+${pointIncrease})`);
                    }
                }
            } else {
                console.error(`🗺️ [ERROR] Failed to update tile (${tile.row}, ${tile.col}) points`);
            }
        }
        
        // Then, process edge tiles for decay (only non-gacha tiles)
        for (const tile of edgeTiles) {
            if (!tile.gachaServerId) {
                // No gacha server: decrease by 1 point (min 0)
                const newPoints = Math.max(0, tile.points - 1);
                if (newPoints !== tile.points) {
                    tileMap.updateTilePoints(tile.row, tile.col, newPoints);
                    changesCount++;
                    console.log(`🗺️ [DECAY] Tile (${tile.row}, ${tile.col}) without gacha: ${tile.points} → ${newPoints}`);
                }
            }
        }
        
        // Process gacha server influence (100+ point tiles affect neighbors)
        const influentialTiles = tileMap.tiles.filter(tile => tile.gachaServerId && tile.points >= 100);
        
        if (influentialTiles.length > 0) {
            console.log(`🗺️ [INFLUENCE] Found ${influentialTiles.length} influential gacha server(s) affecting neighbors`);
        }
        
        for (const tile of influentialTiles) {
            const neighbors = getHexagonalNeighbors(tile.row, tile.col, tileMap.mapSize);
            const userCount = await getChannelUserCount(guildId, tile.gachaServerId, client);
            const influenceBonus = Math.max(1, userCount); // Minimum 1 influence even if no users
            
            for (const [nRow, nCol] of neighbors) {
                const neighborTile = tileMap.getTile(nRow, nCol);
                if (neighborTile) {
                    const newPoints = neighborTile.points + influenceBonus;
                    tileMap.updateTilePoints(nRow, nCol, newPoints);
                    changesCount++;
                    console.log(`🗺️ [INFLUENCE] Tile (${nRow}, ${nCol}) influenced by (${tile.row}, ${tile.col}): ${neighborTile.points} → ${newPoints} (+${influenceBonus} from ${userCount} user(s))`);
                }
            }
        }
        
        // Save changes if any were made
        if (changesCount > 0) {
            try {
                await tileMap.save();
                console.log(`🗺️ [TILE SYSTEM] Successfully saved ${changesCount} changes to database for guild ${guildId}`);
                
                // Debug: Verify the save worked by checking a few tiles
                const verifyTileMap = await TileMap.findOne({ guildId });
                const verifyGachaTiles = verifyTileMap.tiles.filter(tile => tile.gachaServerId);
                console.log(`🗺️ [VERIFY] After save, database shows ${verifyGachaTiles.length} gacha tiles:`);
                verifyGachaTiles.slice(0, 3).forEach(tile => {
                    console.log(`🗺️ [VERIFY] Tile (${tile.row}, ${tile.col}): ${tile.points} points`);
                });
            } catch (saveError) {
                console.error(`🗺️ [ERROR] Failed to save tile map changes:`, saveError);
            }
        } else {
            console.log(`🗺️ [TILE SYSTEM] No changes to save for guild ${guildId}`);
        }
        
        // Update channel names and visibility (for specific guild)
        if (guildId === '1221772148385910835') {
            await updateHellungiChannelName(guildId, tileMap, client);
            await updateCitadelAndVisibility(guildId, tileMap, client);
            await updateWarMapMessage(guildId, tileMap, client);
        }
        
    } catch (error) {
        console.error('[TILE SYSTEM] Error in processTileMapTick:', error);
    }
}

/**
 * Helper function to get hexagonal neighbors
 * @param {number} row - Row coordinate
 * @param {number} col - Column coordinate
 * @param {number} mapSize - Size of the map
 * @returns {Array} Array of neighbor coordinates
 */
function getHexagonalNeighbors(row, col, mapSize) {
    const neighbors = [];
    
    // Hexagonal grid neighbor offsets (depends on whether row is even or odd)
    const isEvenRow = row % 2 === 0;
    const offsets = isEvenRow ? [
        [-1, -1], [-1, 0],  // Top-left, Top-right
        [0, -1],  [0, 1],   // Left, Right
        [1, -1],  [1, 0]    // Bottom-left, Bottom-right
    ] : [
        [-1, 0],  [-1, 1],  // Top-left, Top-right
        [0, -1],  [0, 1],   // Left, Right
        [1, 0],   [1, 1]    // Bottom-left, Bottom-right
    ];
    
    for (const [dRow, dCol] of offsets) {
        const newRow = row + dRow;
        const newCol = col + dCol;
        
        // Check if neighbor is within map bounds
        if (newRow >= 0 && newRow < mapSize && newCol >= 0 && newCol < mapSize) {
            neighbors.push([newRow, newCol]);
        }
    }
    
    return neighbors;
}

/**
 * Helper function to update Hellungi channel name with total points
 * @param {string} guildId - Guild ID
 * @param {Object} tileMap - TileMap instance
 * @param {Object} client - Discord client
 */
async function updateHellungiChannelName(guildId, tileMap, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.warn(`[HELLUNGI] Guild ${guildId} not found`);
            return;
        }
        
        const channelId = '1406523875583332412';
        const channel = await guild.channels.fetch(channelId);
        if (!channel) {
            console.warn(`[HELLUNGI] Channel ${channelId} not found in guild ${guildId}`);
            return;
        }
        
        // Get capital tile points
        const centerTile = tileMap.getTile(tileMap.centerRow, tileMap.centerCol);
        const capitalPoints = centerTile ? centerTile.points : 0;
        
        // Format the new channel name using capital points
        const newName = `🔥 HELLUNGI 『 ${capitalPoints.toLocaleString()} 』`;
        
        // Only update if name has changed
        if (channel.name !== newName) {
            await channel.setName(newName);
            console.log(`🔥 [HELLUNGI] Updated channel name to: ${newName}`);
        }
        
    } catch (error) {
        console.error('[HELLUNGI] Error updating channel name:', error);
    }
}

/**
 * Helper function to update Citadel channel and manage visibility/announcements
 * @param {string} guildId - Guild ID
 * @param {Object} tileMap - TileMap instance
 * @param {Object} client - Discord client
 */
async function updateCitadelAndVisibility(guildId, tileMap, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.warn(`[CITADEL] Guild ${guildId} not found`);
            return;
        }
        
        const citadelChannelId = '1407609278315102208';
        const marketplaceChannelId = '1416024145128587437';
        
        const [citadelChannel, marketplaceChannel] = await Promise.all([
            guild.channels.fetch(citadelChannelId).catch(() => null),
            guild.channels.fetch(marketplaceChannelId).catch(() => null)
        ]);
        
        // Get center tile points
        const centerTile = tileMap.getTile(tileMap.centerRow, tileMap.centerCol);
        const centerPoints = centerTile ? centerTile.points : 0;
        
        // Check if center tile lost points (assault detection)
        if (previousCenterPoints !== null && centerPoints < previousCenterPoints && citadelChannel) {
            const pointsLost = previousCenterPoints - centerPoints;
            const assaultMessage = `🚨 **THE CAPITAL IS UNDER ASSAULT!** 🚨\n` +
                                 `The citadel has lost **${pointsLost}** point${pointsLost !== 1 ? 's' : ''}!\n` +
                                 `Current citadel strength: **${centerPoints.toLocaleString()}** points\n` +
                                 `${centerPoints < 25 ? '💀 **CRITICAL CONDITION** - Citadel visibility at risk!' : 
                                   centerPoints < 50 ? '⚠️ **UNDER SIEGE** - Marketplace visibility compromised!' : 
                                   '🛡️ Still standing strong!'}`;
            
            try {
                await citadelChannel.send(assaultMessage);
                console.log(`🚨 [ASSAULT] Announced center tile loss: ${previousCenterPoints} → ${centerPoints}`);
            } catch (sendError) {
                console.error('[ASSAULT] Error sending assault message:', sendError);
            }
        }
        
        // Update previous points for next comparison
        previousCenterPoints = centerPoints;
        
        // Update citadel channel name based on capital point level
        if (citadelChannel) {
            let settlementType;
            if (centerPoints >= 1000) {
                settlementType = 'invictus';
            } else if (centerPoints >= 500) {
                settlementType = 'citadel';
            } else if (centerPoints >= 200) {
                settlementType = 'city';
            } else if (centerPoints >= 50) {
                settlementType = 'town';
            } else {
                settlementType = 'village';
            }
            
            const newName = `${settlementType} 『 ${centerPoints.toLocaleString()} 』`;
            if (citadelChannel.name !== newName) {
                await citadelChannel.setName(newName);
                console.log(`🏰 [CITADEL] Updated settlement name to: ${newName}`);
            }
        }
        
        // Handle marketplace channel visibility (hide if center < 50)
        if (marketplaceChannel) {
            const shouldHideMarketplace = centerPoints < 50;
            const currentlyHidden = !marketplaceChannel.permissionsFor(guild.roles.everyone)?.has('ViewChannel');
            
            if (shouldHideMarketplace && !currentlyHidden) {
                await marketplaceChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    ViewChannel: false
                });
                console.log(`🔒 [MARKETPLACE] Hidden due to center points: ${centerPoints}`);
            } else if (!shouldHideMarketplace && currentlyHidden) {
                await marketplaceChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    ViewChannel: true
                });
                console.log(`🔓 [MARKETPLACE] Made visible, center points: ${centerPoints}`);
            }
        }
        
        // Handle citadel channel visibility (hide if center < 25)
        if (citadelChannel) {
            const shouldHideCitadel = centerPoints < 25;
            const currentlyHidden = !citadelChannel.permissionsFor(guild.roles.everyone)?.has('ViewChannel');
            
            if (shouldHideCitadel && !currentlyHidden) {
                await citadelChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    ViewChannel: false
                });
                console.log(`🔒 [CITADEL] Hidden due to center points: ${centerPoints}`);
            } else if (!shouldHideCitadel && currentlyHidden) {
                await citadelChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    ViewChannel: true
                });
                console.log(`🔓 [CITADEL] Made visible, center points: ${centerPoints}`);
            }
        }
        
    } catch (error) {
        console.error('[CITADEL] Error updating citadel and visibility:', error);
    }
}

/**
 * Clean up gacha server references for channels that no longer exist
 * @param {string} guildId - Guild ID
 * @param {Object} tileMap - TileMap instance
 * @param {Object} client - Discord client
 * @returns {number} Number of cleaned up references
 */
async function cleanupInvalidGachaServers(guildId, tileMap, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            return 0;
        }
        
        let cleanupCount = 0;
        
        // Get all tiles with gacha servers
        const tilesWithGacha = tileMap.tiles.filter(tile => tile.gachaServerId);
        
        for (const tile of tilesWithGacha) {
            try {
                // Try to fetch the channel
                const channel = await guild.channels.fetch(tile.gachaServerId);
                if (!channel) {
                    // Channel doesn't exist, remove gacha reference
                    tileMap.removeGachaFromTile(tile.row, tile.col);
                    cleanupCount++;
                    console.log(`🗺️ [CLEANUP] Removed invalid gacha ${tile.gachaServerId} from tile (${tile.row}, ${tile.col})`);
                }
            } catch (error) {
                // Channel fetch failed (doesn't exist), remove gacha reference
                tileMap.removeGachaFromTile(tile.row, tile.col);
                cleanupCount++;
                console.log(`🗺️ [CLEANUP] Removed invalid gacha ${tile.gachaServerId} from tile (${tile.row}, ${tile.col})`);
            }
        }
        
        if (cleanupCount > 0) {
            await tileMap.save();
        }
        
        return cleanupCount;
        
    } catch (error) {
        console.error('[CLEANUP] Error cleaning up invalid gacha servers:', error);
        return 0;
    }
}

/**
 * Assign tiles to activeVCs that don't currently have tile assignments
 * @param {string} guildId - Guild ID
 * @param {Object} tileMap - TileMap instance
 * @param {Object} client - Discord client
 * @returns {number} Number of assignments made
 */
async function assignUnassignedActiveVCs(guildId, tileMap, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            return 0;
        }
        
        // Get all activeVCs for this guild
        const activeVCs = await ActiveVCS.find({ guildId });
        if (activeVCs.length === 0) {
            return 0;
        }
        
        // Get all channel IDs that already have tile assignments
        const assignedChannelIds = new Set(
            tileMap.tiles
                .filter(tile => tile.gachaServerId)
                .map(tile => tile.gachaServerId)
        );
        
        // Find activeVCs that don't have tile assignments
        const unassignedVCs = [];
        
        for (const vc of activeVCs) {
            if (!assignedChannelIds.has(vc.channelId)) {
                // Check if the channel still exists
                try {
                    const channel = await guild.channels.fetch(vc.channelId);
                    if (channel) {
                        unassignedVCs.push(vc);
                    }
                } catch (error) {
                    // Channel doesn't exist, skip it
                    console.log(`🗺️ [RETROACTIVE] Skipping non-existent channel ${vc.channelId}`);
                }
            }
        }
        
        if (unassignedVCs.length === 0) {
            return 0;
        }
        
        let assignmentCount = 0;
        
        // Assign each unassigned VC to an available tile
        for (const vc of unassignedVCs) {
            // Find available tiles (points < 20 and no existing gacha server)
            const availableTiles = tileMap.tiles.filter(tile => 
                tile.points < 20 && !tile.gachaServerId
            );
            
            if (availableTiles.length === 0) {
                console.log(`🗺️ [RETROACTIVE] No available tiles for channel ${vc.channelId}`);
                break; // No more tiles available
            }
            
            // Sort by points first, then by distance to center (closest first)
            const centerRow = tileMap.centerRow;
            const centerCol = tileMap.centerCol;
            
            availableTiles.sort((a, b) => {
                // First priority: lower points
                if (a.points !== b.points) {
                    return a.points - b.points;
                }
                
                // Second priority: distance to center (closer is better)
                const distanceA = Math.sqrt(Math.pow(a.row - centerRow, 2) + Math.pow(a.col - centerCol, 2));
                const distanceB = Math.sqrt(Math.pow(b.row - centerRow, 2) + Math.pow(b.col - centerCol, 2));
                return distanceA - distanceB;
            });
            
            const selectedTile = availableTiles[0];
            
            // Assign the gacha server to the tile
            const success = tileMap.attachGachaToTile(selectedTile.row, selectedTile.col, vc.channelId);
            if (success) {
                assignmentCount++;
                console.log(`🗺️ [RETROACTIVE] Assigned channel ${vc.channelId} to tile (${selectedTile.row}, ${selectedTile.col}) with ${selectedTile.points} points`);
            }
        }
        
        if (assignmentCount > 0) {
            await tileMap.save();
        }
        
        return assignmentCount;
        
    } catch (error) {
        console.error('[RETROACTIVE] Error assigning unassigned activeVCs:', error);
        return 0;
    }
}

/**
 * Get the number of users currently in a voice channel
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 * @param {Object} client - Discord client
 * @returns {Promise<number>} Number of users in the channel
 */
async function getChannelUserCount(guildId, channelId, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            return 0;
        }
        
        const channel = await guild.channels.fetch(channelId);
        if (!channel || !channel.isVoiceBased()) {
            return 0;
        }
        
        return channel.members.size;
        
    } catch (error) {
        // Channel doesn't exist or can't be accessed
        return 0;
    }
}

/**
 * Update or create war map message in specified channel
 * @param {string} guildId - Guild ID
 * @param {Object} tileMap - TileMap instance
 * @param {Object} client - Discord client
 */
async function updateWarMapMessage(guildId, tileMap, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            console.warn(`[WAR MAP] Guild ${guildId} not found`);
            return;
        }
        
        const warChannelId = '1421460021405024356';
        const warChannel = await guild.channels.fetch(warChannelId);
        if (!warChannel) {
            console.warn(`[WAR MAP] War channel ${warChannelId} not found in guild ${guildId}`);
            return;
        }
        
        // Generate fresh map image
        const mapBuffer = await generateTileMapImage(guildId, client);
        const attachment = new AttachmentBuilder(mapBuffer, { name: 'war_map.png' });
        
        // Get current stats
        const centerTile = tileMap.getTile(tileMap.centerRow, tileMap.centerCol);
        const centerPoints = centerTile ? centerTile.points : 0;
        const totalPoints = tileMap.tiles.reduce((sum, tile) => sum + tile.points, 0);
        const gachaCount = tileMap.tiles.filter(tile => tile.gachaServerId).length;
        
        // Check marketplace and citadel status
        const [marketplaceStatus, citadelStatus] = await Promise.all([
            getChannelVisibilityStatus(guildId, '1416024145128587437', client),
            getChannelVisibilityStatus(guildId, '1407609278315102208', client)
        ]);
        
        // Determine capital risk status
        let riskStatus;
        if (centerPoints < 25) {
            riskStatus = '💀 **CRITICAL** - Capital may fall!';
        } else if (centerPoints < 50) {
            riskStatus = '⚠️ **HIGH** - Under siege!';
        } else if (centerPoints < 75) {
            riskStatus = '🟡 **MODERATE** - Holding steady';
        } else {
            riskStatus = '🛡️ **LOW** - Well defended';
        }
        
        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('⚔️ WAR MAP')
            .setDescription('Current territorial control status')
            .addFields(
                { name: '🏰 Capital Points', value: centerPoints.toLocaleString(), inline: true },
                { name: '🗺️ Total Points', value: totalPoints.toLocaleString(), inline: true },
                { name: '🎰 Active Gacha', value: gachaCount.toString(), inline: true },
                { name: '⚠️ Capital at Risk', value: riskStatus, inline: false },
                { name: '🏪 Marketplace', value: marketplaceStatus, inline: true },
                { name: '🏰 Capital', value: citadelStatus, inline: true }
            )
            .setColor(centerPoints < 25 ? 0xff0000 : centerPoints < 50 ? 0xffaa00 : 0x00ff00)
            .setTimestamp();
        
        const messageData = {
            embeds: [embed],
            files: [attachment]
        };
        
        // Delete previous message if it exists, then create new one
        if (previousWarMapMessageId) {
            try {
                const previousMessage = await warChannel.messages.fetch(previousWarMapMessageId);
                await previousMessage.delete();
                console.log(`⚔️ [WAR MAP] Deleted previous war map message`);
            } catch (deleteError) {
                console.log(`⚔️ [WAR MAP] Previous message not found or couldn't be deleted`);
            }
        }
        
        // Create new message
        const newMessage = await warChannel.send(messageData);
        previousWarMapMessageId = newMessage.id;
        console.log(`⚔️ [WAR MAP] Created new war map message: ${newMessage.id}`);
        
    } catch (error) {
        console.error('[WAR MAP] Error updating war map message:', error);
    }
}

/**
 * Check if a channel is visible to everyone
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID to check
 * @param {Object} client - Discord client
 * @returns {Promise<string>} "ACTIVE" or "FALLEN"
 */
async function getChannelVisibilityStatus(guildId, channelId, client) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            return 'FALLEN';
        }
        
        const channel = await guild.channels.fetch(channelId);
        if (!channel) {
            return 'FALLEN';
        }
        
        // Check if @everyone can view the channel
        const canView = channel.permissionsFor(guild.roles.everyone)?.has('ViewChannel');
        return canView ? 'ACTIVE' : 'FALLEN';
        
    } catch (error) {
        console.error(`Error checking channel visibility for ${channelId}:`, error);
        return 'FALLEN';
    }
}

module.exports = {
    processTileMapTick
};

const TileMap = require('../models/TileMap');
const { getOrCreateTileMap } = require('./mapSystem');

// Track previous center tile points for assault detection
let previousCenterPoints = null;

/**
 * Main tile processing function - handles decay, growth, influence, and channel updates
 * @param {string} guildId - Guild ID to process
 * @param {Object} client - Discord client instance
 */
async function processTileMapTick(guildId, client) {
    try {
        const tileMap = await getOrCreateTileMap(guildId);
        let changesCount = 0;
        
        // Clean up invalid gacha server references
        const cleanupCount = await cleanupInvalidGachaServers(guildId, tileMap, client);
        if (cleanupCount > 0) {
            changesCount += cleanupCount;
            console.log(`🗺️ [CLEANUP] Removed ${cleanupCount} invalid gacha server reference(s)`);
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
        
        // Process each edge tile
        for (const tile of edgeTiles) {
            if (tile.gachaServerId) {
                // Has gacha server: increase by 1 point (no max limit now)
                const newPoints = tile.points + 1;
                tileMap.updateTilePoints(tile.row, tile.col, newPoints);
                changesCount++;
                console.log(`🗺️ [GROWTH] Tile (${tile.row}, ${tile.col}) with gacha: ${tile.points} → ${newPoints}`);
            } else {
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
            
            for (const [nRow, nCol] of neighbors) {
                const neighborTile = tileMap.getTile(nRow, nCol);
                if (neighborTile) {
                    const newPoints = neighborTile.points + 1;
                    tileMap.updateTilePoints(nRow, nCol, newPoints);
                    changesCount++;
                    console.log(`🗺️ [INFLUENCE] Tile (${nRow}, ${nCol}) influenced by (${tile.row}, ${tile.col}): ${neighborTile.points} → ${newPoints}`);
                }
            }
        }
        
        // Save changes if any were made
        if (changesCount > 0) {
            await tileMap.save();
            console.log(`🗺️ [TILE SYSTEM] Processed ${edgeTiles.length} edge tiles, ${changesCount} changes made for guild ${guildId}`);
        }
        
        // Update channel names and visibility (for specific guild)
        if (guildId === '1221772148385910835') {
            await updateHellungiChannelName(guildId, tileMap, client);
            await updateCitadelAndVisibility(guildId, tileMap, client);
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
        
        // Calculate total points across all tiles
        const totalPoints = tileMap.tiles.reduce((sum, tile) => sum + tile.points, 0);
        
        // Format the new channel name
        const newName = `🔥 HELLUNGI 『 ${totalPoints.toLocaleString()} 』`;
        
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
        
        // Update citadel channel name
        if (citadelChannel) {
            const newName = `citadel 『 ${centerPoints.toLocaleString()} 』`;
            if (citadelChannel.name !== newName) {
                await citadelChannel.setName(newName);
                console.log(`🏰 [CITADEL] Updated channel name to: ${newName}`);
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

module.exports = {
    processTileMapTick
};

// miningEvents.js - Event system for mining breaks and special events
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Currency = require('../../../models/currency');
const PlayerInventory = require('../../../models/inventory');
const gachaVC = require('../../../models/activevcs');
const generateShop = require('../../generateShop');
const Canvas = require('canvas');

// ============ LONG BREAK SPECIAL EVENTS ============

/**
 * Rail Building Event - Builds rails from entrance in straight lines
 * Uses persistent rail storage that survives map expansions
 */
async function startRailBuildingEvent(channel, dbEntry) {
    if (!channel?.isVoiceBased()) return;
    
    const { EmbedBuilder } = require('discord.js');
    const railStorage = require('./railStorage');
    const { TILE_TYPES } = require('./miningConstants');
    
    // Get current map data
    const mapData = dbEntry.gameData?.map;
    if (!mapData || !mapData.tiles) {
        console.log('No map data available for rail building');
        return 'Map not initialized for rail building';
    }
    
    const { entranceX, entranceY, width, height, tiles } = mapData;
    
    // Get existing rails data using persistent storage
    const existingRails = await railStorage.getRailsData(channel.id);
    const railPositions = railStorage.getAllRailPositions(existingRails);
    
    // Check if there are existing rails adjacent to entrance
    const entranceNeighbors = [
        { x: entranceX, y: entranceY - 1, dir: 'north' },
        { x: entranceX + 1, y: entranceY, dir: 'east' },
        { x: entranceX, y: entranceY + 1, dir: 'south' },
        { x: entranceX - 1, y: entranceY, dir: 'west' }
    ];
    
    const hasRailsAtEntrance = entranceNeighbors.some(pos => 
        railStorage.hasRail(existingRails, pos.x, pos.y)
    );
    
    const newRailPaths = [];
    let totalNewRails = 0;
    
    if (!hasRailsAtEntrance || railPositions.length < 10) {
        // Build from entrance in all 4 directions
        console.log('[RAIL EVENT] Building initial rails from entrance in all directions');
        
        for (const neighbor of entranceNeighbors) {
            const path = buildStraightLine(
                tiles, 
                neighbor.x, 
                neighbor.y, 
                neighbor.dir, 
                width, 
                height
            );
            
            if (path.length > 0) {
                newRailPaths.push(path);
                totalNewRails += path.length;
            }
        }
    } else {
        // Pick 4 random points along existing rails and build perpendicular
        console.log('[RAIL EVENT] Building perpendicular rails from existing network');
        
        // Get all connected rail positions (not just any rail)
        const connectedRails = getConnectedRails(existingRails, entranceNeighbors);
        
        if (connectedRails.length >= 4) {
            // Shuffle and pick 4 random points
            const shuffled = [...connectedRails].sort(() => Math.random() - 0.5);
            const selectedPoints = shuffled.slice(0, Math.min(4, shuffled.length));
            
            for (const point of selectedPoints) {
                // Determine which directions are perpendicular based on existing connections
                const connections = railStorage.getRailConnections(existingRails, point.x, point.y);
                const perpendicularDirs = getPerpendicularDirections(connections);
                
                // Build in perpendicular directions
                for (const dir of perpendicularDirs) {
                    const path = buildStraightLine(
                        tiles,
                        point.x + dir.dx,
                        point.y + dir.dy,
                        dir.name,
                        width,
                        height
                    );
                    
                    if (path.length > 0) {
                        // Include the starting point in the path
                        path.unshift(point);
                        newRailPaths.push(path);
                        totalNewRails += path.length;
                    }
                }
            }
        } else {
            // Not enough connected rails, build more from entrance
            console.log('[RAIL EVENT] Not enough connected rails, building more from entrance');
            
            for (const neighbor of entranceNeighbors) {
                if (!railStorage.hasRail(existingRails, neighbor.x, neighbor.y)) {
                    const path = buildStraightLine(
                        tiles,
                        neighbor.x,
                        neighbor.y,
                        neighbor.dir,
                        width,
                        height
                    );
                    
                    if (path.length > 0) {
                        newRailPaths.push(path);
                        totalNewRails += path.length;
                    }
                }
            }
        }
    }
    
    // Merge all new rail paths with existing rails (preserves existing)
    for (const path of newRailPaths) {
        await railStorage.mergeRailPath(channel.id, path);
    }
    
    // Get updated rail count
    const updatedRails = await railStorage.getRailsData(channel.id);
    const totalRailCount = railStorage.countRails(updatedRails);
    
    // Create announcement embed
    const embed = new EmbedBuilder()
        .setTitle('🚂 RAIL CONSTRUCTION EVENT! 🚂')
        .setDescription(
            `The mining company has invested in infrastructure!\n\n` +
            (hasRailsAtEntrance ? 
                `Rails have been extended from **${newRailPaths.length} points** along the existing network!` :
                `Rails have been constructed from the **entrance** in all directions!`) +
            `\n\n` +
            `🛤️ **New Rails:** ${totalNewRails} segments\n` +
            `📊 **Total Rails:** ${totalRailCount} segments\n\n` +
            `⚡ **Rail Boost:** Players within 3 blocks of rails get **2x speed boost** for more actions per round!\n`
        )
        .setColor(0x4169E1)
        .setTimestamp()
        .setFooter({ text: 'Use /build to manually extend the rail network!' });
    
    await channel.send({ embeds: [embed] });
    console.log(`[RAIL EVENT] Built ${totalNewRails} new rail segments!`);
    
    return `🚂 RAIL EVENT: Built ${totalNewRails} new rail segments!`;
}

/**
 * Build a straight line of rails in a given direction until hitting a wall
 */
function buildStraightLine(tiles, startX, startY, direction, width, height) {
    const path = [];
    const { TILE_TYPES } = require('./miningConstants');
    
    const directions = {
        north: { dx: 0, dy: -1 },
        south: { dx: 0, dy: 1 },
        east: { dx: 1, dy: 0 },
        west: { dx: -1, dy: 0 }
    };
    
    const dir = directions[direction];
    if (!dir) return path;
    
    let x = startX;
    let y = startY;
    
    // Continue until we hit a wall or map boundary
    while (x >= 0 && x < width && y >= 0 && y < height) {
        const tile = tiles[y]?.[x];
        
        // Stop if we hit a wall or invalid tile
        if (!tile || 
            tile.type === TILE_TYPES.WALL ||
            tile.type === TILE_TYPES.WALL_WITH_ORE ||
            tile.type === TILE_TYPES.RARE_ORE ||
            tile.type === TILE_TYPES.REINFORCED_WALL) {
            break;
        }
        
        // Add floor tiles to the path
        if (tile.type === TILE_TYPES.FLOOR) {
            path.push({ x, y });
        }
        
        // Move to next position
        x += dir.dx;
        y += dir.dy;
    }
    
    return path;
}

/**
 * Get all rails connected to the entrance
 */
function getConnectedRails(railsData, entranceNeighbors) {
    const railStorage = require('./railStorage');
    const connected = new Set();
    const toCheck = [];
    
    // Start with rails adjacent to entrance
    for (const pos of entranceNeighbors) {
        if (railStorage.hasRail(railsData, pos.x, pos.y)) {
            toCheck.push(pos);
            connected.add(`${pos.x},${pos.y}`);
        }
    }
    
    // Flood fill to find all connected rails
    while (toCheck.length > 0) {
        const current = toCheck.pop();
        const neighbors = [
            { x: current.x, y: current.y - 1 },
            { x: current.x + 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x - 1, y: current.y }
        ];
        
        for (const neighbor of neighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            if (!connected.has(key) && railStorage.hasRail(railsData, neighbor.x, neighbor.y)) {
                connected.add(key);
                toCheck.push(neighbor);
            }
        }
    }
    
    // Convert back to array of positions
    return Array.from(connected).map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
    });
}

/**
 * Get perpendicular directions based on existing rail connections
 */
function getPerpendicularDirections(connections) {
    const dirs = [];
    
    // If rail runs north-south, build east-west
    if (connections.north || connections.south) {
        if (!connections.east) dirs.push({ name: 'east', dx: 1, dy: 0 });
        if (!connections.west) dirs.push({ name: 'west', dx: -1, dy: 0 });
    }
    
    // If rail runs east-west, build north-south
    if (connections.east || connections.west) {
        if (!connections.north) dirs.push({ name: 'north', dx: 0, dy: -1 });
        if (!connections.south) dirs.push({ name: 'south', dx: 0, dy: 1 });
    }
    
    // If no connections (shouldn't happen), build in all directions
    if (dirs.length === 0) {
        dirs.push(
            { name: 'north', dx: 0, dy: -1 },
            { name: 'south', dx: 0, dy: 1 },
            { name: 'east', dx: 1, dy: 0 },
            { name: 'west', dx: -1, dy: 0 }
        );
    }
    
    return dirs;
}

/**
 * Thief Game - Players must vote to catch the thief
 * Now properly uses minecart sale money as the theft pool
 */
async function startThiefGame(channel, dbEntry) {
    if (!channel?.isVoiceBased()) return '⚠️ Invalid channel';

    const guild = channel.guild;
    const humansArray = guild.members.cache
        .filter(member => member.voice.channelId === channel.id && !member.user.bot)
        .map(member => member);

    if (humansArray.length < 2) { // Changed to 2 for easier testing
        console.log('[THIEF EVENT] Not enough players for thief event. Need at least 2 players.');
        return '⚠️ Not enough players for thief event';
    }

    // Thief is always a player (removed shop keeper option)
    const thief = humansArray[Math.floor(Math.random() * humansArray.length)];
    const thiefId = thief.id;
    const thiefName = thief.user.username;
    
    let stealAmount = 0;
    const lossDescriptions = [];
    const stolenFromPlayers = {};
    
    // Check if we have minecart money to steal (this should be set by the caller)
    if (dbEntry.gameData?.pendingMinecartValue && dbEntry.gameData.pendingMinecartValue > 0) {
        // Use the minecart sale value as the theft pool
        stealAmount = dbEntry.gameData.pendingMinecartValue;
        const contributorRewards = dbEntry.gameData.pendingContributorRewards || {};
        
        // Track who "lost" money (but don't actually deduct it since they never received it)
        for (const [playerId, reward] of Object.entries(contributorRewards)) {
            const member = humansArray.find(m => m.id === playerId);
            if (member && reward.coins > 0) {
                stolenFromPlayers[playerId] = reward.coins;
                lossDescriptions.push(`${member.user.username} lost ${reward.coins} coins from minecart sale`);
            }
        }
        
        // Clear the pending minecart data using atomic operation
        await gachaVC.updateOne(
            { channelId: channel.id },
            { 
                $unset: { 
                    'gameData.pendingMinecartValue': 1,
                    'gameData.pendingContributorRewards': 1
                }
            }
        );
    } else {
        // Fallback: Create a fake minecart pool based on 10% of poorest player's money
        console.log('[THIEF EVENT] No pending minecart value, creating fake pool based on poorest player');
        const Currency = require('../../../models/currency');
        
        // Find the poorest player in the voice channel
        let poorestPlayerMoney = Infinity;
        let poorestPlayer = null;
        
        for (const user of humansArray) {
            const playerMoney = await Currency.findOne({ userId: user.id });
            const balance = playerMoney ? playerMoney.money : 0;
            
            if (balance < poorestPlayerMoney) {
                poorestPlayerMoney = balance;
                poorestPlayer = user;
            }
        }
        
        // Calculate theft pool as 10% of poorest player's money
        if (poorestPlayerMoney > 0) {
            stealAmount = Math.floor(poorestPlayerMoney * 0.1);
            
            // If the amount is too small, set a minimum
            if (stealAmount < 50) {
                stealAmount = Math.min(50, poorestPlayerMoney); // At least 50 or their full balance if less
            }
            
            // Distribute the "loss" evenly among all players
            const lossPerPlayer = Math.floor(stealAmount / humansArray.length);
            const remainder = stealAmount - (lossPerPlayer * humansArray.length);
            
            for (let i = 0; i < humansArray.length; i++) {
                const user = humansArray[i];
                // First player gets the remainder to ensure total matches
                const playerLoss = lossPerPlayer + (i === 0 ? remainder : 0);
                stolenFromPlayers[user.id] = playerLoss;
                lossDescriptions.push(`${user.user.username}'s share: ${playerLoss} coins at risk`);
            }
            
            console.log(`[THIEF EVENT] Poorest player has ${poorestPlayerMoney} coins, theft pool is ${stealAmount} coins`);
        } else {
            // If everyone has 0 coins, create a minimal pool
            stealAmount = 50 * humansArray.length; // 50 coins per player minimum
            for (const user of humansArray) {
                stolenFromPlayers[user.id] = 50;
                lossDescriptions.push(`${user.user.username}'s share: 50 coins at risk`);
            }
            console.log('[THIEF EVENT] All players have 0 coins, using minimum pool');
        }
    }

    // Store thief info with proper time and stolen values
    const endTime = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    await setSpecialEvent(channel.id, {
        type: 'thief',
        thiefId: thiefId,
        thiefName: thiefName,
        amount: stealAmount,
        stolenFromPlayers: stolenFromPlayers,  // Store who lost what
        endTime: endTime
    });

    // Create vote entries for each user with auto-voting
    const Vote = require('../../../models/votes');
    
    // Clear any existing votes first
    await Vote.deleteMany({ channelId: channel.id });
    
    // Create list of all possible suspects (players only)
    const allSuspects = [...humansArray];
    
    // Create auto-votes
    const autoVoteDescriptions = [];
    for (const user of humansArray) {
        // Filter out self from possible targets (can't vote for yourself)
        const possibleTargets = allSuspects.filter(suspect => suspect.id !== user.id);
        
        // Random selection with weighted chances:
        // 30% chance to vote correctly
        // Rest distributed among other suspects
        let targetId;
        let targetName;
        
        if (Math.random() < 0.3 && thiefId !== user.id) {
            // Vote correctly (if thief isn't self)
            targetId = thiefId;
            targetName = thiefName;
        } else if (possibleTargets.length > 0) {
            // Vote for random other suspect
            const randomTarget = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
            targetId = randomTarget.id;
            targetName = randomTarget.user.username;
        } else {
            // Solo game edge case - can only vote for self
            targetId = user.id;
            targetName = user.user.username;
        }
        
        await Vote.create({
            channelId: channel.id,
            userId: user.id,
            targetId: targetId
        });
        
        autoVoteDescriptions.push(`• ${user.user.username} → ${targetName}`);
    }

    // Build public embed
    const embed = new EmbedBuilder()
        .setTitle('⚠️ THIEF ALERT! ⚠️')
        .setDescription(`In the darkness of the mines, someone has stolen coins from everyone!\n\n` +
                        (lossDescriptions.length > 0 ? lossDescriptions.join('\n') : 'No coins were stolen') +
                        `\n\n💰 Total stolen: ${stealAmount} coins\n\n` +
                        `**Suspects:** All players in the voice channel\n\n` +
                        `💡 **Use /vote** to vote for who you think is the thief!\n` +
                        `⚡ Auto-voting is currently active for demonstration\n\n` +
                        `⚠️ If you catch the thief, the stolen coins will be returned!`)
        .setColor(0xff0000)
        .setTimestamp();

    const endTimeSeconds = Math.floor(endTime / 1000);
    embed.addFields(
        { name: 'Event Ends', value: `<t:${endTimeSeconds}:R>` },
        { name: 'Default Auto-Votes', value: autoVoteDescriptions.join('\n') || 'No votes set' }
    );

    await channel.send({ embeds: [embed] });

    // DM the thief (only if it's a player)
    if (thief) {
        try {
            await thief.send(`You are the thief! You stole a total of ${stealAmount} coins. Be careful not to get caught!`);
        } catch {
            console.log(`Could not DM thief: ${thief.user.tag}`);
        }
    }

    return `⚠️ THIEF EVENT: ${stealAmount} coins stolen!`;
}


/**
 * Mine Collapse Event - Floor tiles collapse and transform into various tile types
 * Enhanced for solo players with guaranteed rewards
 * Now scales dynamically with the number of floor tiles on the map
 */
async function startMineCollapseEvent(channel, dbEntry) {
    if (!channel?.isVoiceBased()) return;
    
    const { TILE_TYPES } = require('./miningConstants');
    const gachaVC = require('../../../models/activevcs');
    
    // Check player count for solo mode enhancements
    const members = channel.members.filter(m => !m.user.bot);
    const isSolo = members.size === 1;
    
    // Get current map data
    const mapData = dbEntry.gameData?.map;
    if (!mapData || !mapData.tiles) {
        console.log('No map data available for mine collapse');
        return 'Map not initialized for mine collapse event';
    }
    
    // Find all floor tiles
    const floorTiles = [];
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            const tile = mapData.tiles[y]?.[x];
            if (tile && tile.type === TILE_TYPES.FLOOR && tile.discovered) {
                // Don't collapse entrance area
                const distFromEntrance = Math.abs(x - mapData.entranceX) + Math.abs(y - mapData.entranceY);
                if (distFromEntrance > 2) {
                    floorTiles.push({ x, y });
                }
            }
        }
    }
    
    if (floorTiles.length < 10) {
        console.log('Not enough floor tiles for collapse event');
        return 'Mine too small for collapse event';
    }
    
    // Determine number of collapse zones - scales with floor tile count
    // Base: 1 collapse per 20 floor tiles
    // Minimum: 1 collapse zone
    // Maximum: 12 collapse zones (for huge maps)
    // Scaling formula: sqrt(floorTiles) / 4 gives good distribution
    const scaleFactor = Math.sqrt(floorTiles.length);
    const baseCollapses = Math.floor(scaleFactor / 4);
    const numCollapses = Math.min(12, Math.max(1, baseCollapses));
    
    console.log(`[MINE COLLAPSE] Floor tiles: ${floorTiles.length}, Collapse zones: ${numCollapses}`);
    const collapsedZones = [];
    const affectedTiles = new Set();
    
    // Create collapse zones
    for (let i = 0; i < numCollapses; i++) {
        // Pick random center point from floor tiles
        const centerIndex = Math.floor(Math.random() * floorTiles.length);
        const center = floorTiles[centerIndex];
        
        // Dynamic radius based on map size
        // Small maps (< 100 floor tiles): radius 1-2
        // Medium maps (100-400 floor tiles): radius 1-3
        // Large maps (> 400 floor tiles): radius 2-4
        let minRadius = 1;
        let maxRadius = 2;
        
        if (floorTiles.length >= 100 && floorTiles.length < 400) {
            maxRadius = 3;
        } else if (floorTiles.length >= 400) {
            minRadius = 2;
            maxRadius = 4;
        }
        
        const radius = Math.floor(Math.random() * (maxRadius - minRadius + 1)) + minRadius;
        
        // Determine collapse pattern for this zone
        const collapseType = pickCollapseType();
        
        // Track this collapse zone
        collapsedZones.push({
            center,
            radius,
            type: collapseType.name
        });
        
        // Apply collapse in radius
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                // Check if within circular radius
                if (Math.sqrt(dx * dx + dy * dy) <= radius) {
                    const tileX = center.x + dx;
                    const tileY = center.y + dy;
                    
                    // Ensure within bounds
                    if (tileX >= 0 && tileX < mapData.width && 
                        tileY >= 0 && tileY < mapData.height) {
                        
                        const currentTile = mapData.tiles[tileY][tileX];
                        // Only collapse floor tiles
                        if (currentTile && currentTile.type === TILE_TYPES.FLOOR) {
                            // Don't collapse entrance
                            const distFromEntrance = Math.abs(tileX - mapData.entranceX) + 
                                                    Math.abs(tileY - mapData.entranceY);
                            if (distFromEntrance > 2) {
                                // Apply random transformation based on collapse type
                                const newTileType = getRandomTileFromCollapseType(collapseType);
                                mapData.tiles[tileY][tileX] = {
                                    type: newTileType,
                                    discovered: true,
                                    hardness: getTileHardness(newTileType)
                                };
                                affectedTiles.add(`${tileX},${tileY}`);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Save updated map
    await gachaVC.updateOne(
        { channelId: channel.id },
        { $set: { 'gameData.map': mapData } }
    );
    
    // Build event description
    const collapseDescriptions = collapsedZones.map(zone => 
        `• ${zone.type} collapse at (${zone.center.x}, ${zone.center.y}) - radius ${zone.radius}`
    );
    
    // Enhanced rewards for solo players
    let bonusMessage = '';
    if (isSolo) {
        // Give solo player a bonus for surviving the collapse
        const Currency = require('../../../models/currency');
        const soloPlayer = members.first();
        const survivalBonus = 100 + Math.floor(Math.random() * 200);
        
        let playerMoney = await Currency.findOne({ userId: soloPlayer.id });
        if (!playerMoney) {
            playerMoney = await Currency.create({
                userId: soloPlayer.id,
                usertag: soloPlayer.user.tag,
                money: survivalBonus
            });
        } else {
            playerMoney.money += survivalBonus;
            await playerMoney.save();
        }
        
        bonusMessage = `\n\n💰 **Solo Survivor Bonus**: ${survivalBonus} coins for weathering the collapse alone!`;
        
        // Guarantee at least one rare ore zone for solo players
        if (collapsedZones.length > 0) {
            const rareZone = collapsedZones[0];
            mapData.tiles[rareZone.center.y][rareZone.center.x] = {
                type: TILE_TYPES.RARE_ORE,
                discovered: true,
                hardness: 3
            };
            bonusMessage += `\n📍 **Rare ore detected at (${rareZone.center.x}, ${rareZone.center.y})**`;
        }
    }
    
    const embed = new EmbedBuilder()
        .setTitle('⛰️ MINE COLLAPSE! ⛰️')
        .setDescription(`The mine structure has become unstable! Multiple sections have collapsed and transformed:\n\n` +
                       collapseDescriptions.join('\n') +
                       `\n\n${affectedTiles.size} tiles affected!\n` +
                       `⚠️ Collapsed areas may contain valuable ores... or dangerous hazards!` +
                       bonusMessage)
        .setColor(0x8B4513)
        .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    
    return `⛰️ MINE COLLAPSE: ${numCollapses} zones collapsed, ${affectedTiles.size} tiles affected!`;
}

/**
 * Determine the type of collapse (what tiles will appear)
 */
function pickCollapseType() {
    const types = [
        { name: 'Rich Vein', weight: 25, distribution: { ore: 60, rare: 20, wall: 15, reinforced: 5 } },
        { name: 'Cave-in', weight: 35, distribution: { wall: 50, ore: 30, reinforced: 15, hazard: 5 } },
        { name: 'Dead Zone', weight: 20, distribution: { wall: 60, reinforced: 30, hazard: 10 } },
        { name: 'Danger Zone', weight: 10, distribution: { hazard: 40, wall: 30, reinforced: 20, ore: 10 } },
        { name: 'Crystal Cave', weight: 10, distribution: { rare: 50, ore: 35, wall: 15 } }
    ];
    
    const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
    let rand = Math.random() * totalWeight;
    
    for (const type of types) {
        rand -= type.weight;
        if (rand <= 0) return type;
    }
    
    return types[0]; // Fallback
}

/**
 * Get a random tile type based on collapse type distribution
 */
function getRandomTileFromCollapseType(collapseType) {
    const { TILE_TYPES } = require('./miningConstants');
    const dist = collapseType.distribution;
    const rand = Math.random() * 100;
    
    let accumulated = 0;
    
    if (dist.ore) {
        accumulated += dist.ore;
        if (rand < accumulated) return TILE_TYPES.WALL_WITH_ORE;
    }
    
    if (dist.rare) {
        accumulated += dist.rare;
        if (rand < accumulated) return TILE_TYPES.RARE_ORE;
    }
    
    // Treasure tiles removed - no longer used
    // if (dist.treasure) {
    //     accumulated += dist.treasure;
    //     if (rand < accumulated) return TILE_TYPES.TREASURE_CHEST;
    // }
    
    if (dist.hazard) {
        accumulated += dist.hazard;
        if (rand < accumulated) return TILE_TYPES.HAZARD;
    }
    
    if (dist.reinforced) {
        accumulated += dist.reinforced;
        if (rand < accumulated) return TILE_TYPES.REINFORCED_WALL;
    }
    
    // Default to regular wall
    return TILE_TYPES.WALL;
}

/**
 * Get tile hardness value
 */
function getTileHardness(tileType) {
    const { TILE_TYPES } = require('./miningConstants');
    
    const hardnessMap = {
        [TILE_TYPES.WALL]: 1,
        [TILE_TYPES.WALL_WITH_ORE]: 2,
        [TILE_TYPES.RARE_ORE]: 3,
        [TILE_TYPES.REINFORCED_WALL]: 5,
        // [TILE_TYPES.TREASURE_CHEST]: 2, // Removed - no longer used
        [TILE_TYPES.HAZARD]: 0,
        [TILE_TYPES.FLOOR]: 0
    };
    
    return hardnessMap[tileType] || 1;
}



/**
 * End Thief Game and distribute rewards
 * Now properly handles minecart money distribution based on voting results
 */
async function endThiefGame(channel, dbEntry) {
    if (!dbEntry.gameData?.specialEvent || dbEntry.gameData.specialEvent.type !== 'thief') {
        console.log('[END THIEF] No thief event to end');
        return 'No thief event active';
    }

    const { thiefId, thiefName, amount: totalStolen, stolenFromPlayers } = dbEntry.gameData.specialEvent;
    
    // Ensure we have valid data
    if (!thiefId || !totalStolen) {
        console.error('[END THIEF] Invalid thief event data:', dbEntry.gameData.specialEvent);
        await clearSpecialEvent(channel.id);
        return 'Invalid thief event data';
    }
    
    const Vote = require('../../../models/votes');

    // Fetch all votes for this channel
    const votes = await Vote.find({ channelId: channel.id });

    const embed = new EmbedBuilder()
        .setTitle('🕵️ Thief Game Results')
        .setTimestamp();

    let winners = [];
    let losers = [];
    let jailImageAttachment = null;

    if (!votes.length) {
        embed.setDescription('No votes were cast this round.');
        embed.setColor(0xFF0000);
    } else {
        const voteLines = [];

        // Process each user's vote
        for (const vote of votes) {
            const user = await channel.guild.members.fetch(vote.userId).catch(() => null);
            if (!user) continue;
            
            const target = await channel.guild.members.fetch(vote.targetId).catch(() => null);
            const targetName = target ? target.user.username : 'unknown';
            
            voteLines.push(`${user.user.username} voted for ${targetName}`);
            
            // Check if vote was correct
            if (vote.targetId === thiefId) {
                winners.push(vote.toObject());
            } else {
                losers.push(vote.toObject());
            }
        }

        embed.addFields({ name: 'Votes', value: voteLines.join('\n') || 'No votes recorded' });

        const totalPlayers = votes.length;

        // Generate jail image if thief was caught
        if (winners.length > 0) {
            try {
                const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
                if (thiefMember) {
                    jailImageAttachment = await createJailImage(thiefMember);
                    if (jailImageAttachment) {
                        embed.setImage('attachment://thief_jailed.png');
                    }
                }
            } catch (error) {
                console.error('Error creating jail image:', error);
            }
        }

        // Determine rewards (distribute minecart money based on voting results)
        if (winners.length > 0 && winners.length < totalPlayers) {
            // Partial success - thief keeps 50%, rest distributed to victims
            embed.setColor(0xFFFF00);
            
            // Thief keeps 50% of stolen coins
            const thiefKeeps = Math.floor(totalStolen / 2);
            const toDistribute = totalStolen - thiefKeeps;
            
            // Give thief their share
            await rewardThief(thiefId, thiefKeeps);
            
            // Distribute remaining 50% to victims based on their original contribution
            await distributeMinecartRewards(stolenFromPlayers, 0.5);
            
            embed.setTitle('📰 THIEF CAUGHT (Partial Success)');
            embed.addFields(
                { name: 'Result', value: `Some players identified the thief!\n\nThief keeps ${thiefKeeps} coins\n${toDistribute} coins distributed to miners` },
                { name: 'Winners', value: winners.map(w => `<@${w.userId}> correctly identified the thief`).join('\n') }
            );

        } else if (winners.length === totalPlayers && totalPlayers > 1) {
            // Complete success - distribute all minecart money to contributors
            embed.setColor(0x00FF00);
            
            // Distribute all money to original contributors
            await distributeMinecartRewards(stolenFromPlayers, 1.0);
            
            embed.setTitle('📰 THIEF CAUGHT (Complete Success)');
            embed.addFields({
                name: 'Result',
                value: `Everyone identified the thief! All ${totalStolen} coins from the minecart sale have been distributed to the miners.`
            });

        } else {
            // Thief escapes - keeps everything
            embed.setColor(0xFF0000);
            
            embed.setTitle('🏃‍♂️ THIEF ESCAPED');
            
            // Give thief all the minecart money
            await rewardThief(thiefId, totalStolen);
            
            embed.addFields({
                name: 'Result',
                value: `No one guessed correctly. The thief stole the entire minecart sale of ${totalStolen} coins!`
            });
        }
    }

    // Announce the thief
    const thiefMember = await channel.guild.members.fetch(thiefId).catch(() => null);
    if (thiefMember) {
        embed.addFields({ name: 'The Thief Was', value: `<@${thiefId}>` });
    }

    // Send results
    const messageOptions = { embeds: [embed] };
    if (jailImageAttachment) {
        messageOptions.files = [jailImageAttachment];
    }
    await channel.send(messageOptions);

    // Cleanup
    await Vote.deleteMany({ channelId: channel.id });
    await clearSpecialEvent(channel.id);
    
    console.log('[END THIEF] Thief game concluded successfully');
    return 'Thief game concluded!';
}

/**
 * Create jail image for caught thief
 */
async function createJailImage(thiefMember) {
    try {
        const canvas = Canvas.createCanvas(256, 256);
        const ctx = canvas.getContext('2d');

        // Load thief's avatar
        const avatarUrl = thiefMember.user.displayAvatarURL({ format: 'png', size: 256 });
        const avatar = await Canvas.loadImage(avatarUrl);
        
        // Draw avatar
        ctx.drawImage(avatar, 0, 0, 256, 256);

        // Draw jail bars
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 8;
        
        // Vertical bars
        for (let i = 0; i < 6; i++) {
            const x = (i + 1) * (256 / 7);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 256);
            ctx.stroke();
        }
        
        // Horizontal bars
        for (let i = 0; i < 4; i++) {
            const y = (i + 1) * (256 / 5);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(256, y);
            ctx.stroke();
        }

        const buffer = canvas.toBuffer('image/png');
        return new AttachmentBuilder(buffer, { name: 'thief_jailed.png' });
    } catch (error) {
        console.error('Error creating jail image:', error);
        return null;
    }
}

/**
 * Reward winners with coins
 */
async function rewardWinners(winners, amount) {
    console.log(`Rewarding ${winners.length} winners with ${amount} coins each`);
    for (const winner of winners) {
        try {
            let winnerMoney = await Currency.findOne({ userId: winner.userId });
            if (!winnerMoney) {
                winnerMoney = await Currency.create({
                    userId: winner.userId,
                    usertag: `User-${winner.userId}`, // Add usertag field
                    money: amount
                });
                console.log(`Created new currency record for ${winner.userId} with ${amount} coins`);
            } else {
                const oldAmount = winnerMoney.money;
                winnerMoney.money += amount;
                await winnerMoney.save();
                console.log(`Updated ${winner.userId} from ${oldAmount} to ${winnerMoney.money} coins`);
            }
        } catch (error) {
            console.error(`Error rewarding winner ${winner.userId}:`, error);
        }
    }
}

/**
 * Reward thief with coins
 */
async function rewardThief(thiefId, amount) {
    // Don't reward the shop keeper NPC
    if (thiefId === 'shopkeeper-npc') {
        console.log(`Shop keeper NPC was the thief - no reward needed`);
        return;
    }
    
    console.log(`Rewarding thief ${thiefId} with ${amount} coins`);
    try {
        let thiefMoney = await Currency.findOne({ userId: thiefId });
        if (!thiefMoney) {
            thiefMoney = await Currency.create({
                userId: thiefId,
                usertag: `User-${thiefId}`, // Add usertag field
                money: amount
            });
            console.log(`Created new currency record for thief ${thiefId} with ${amount} coins`);
        } else {
            const oldAmount = thiefMoney.money;
            thiefMoney.money += amount;
            await thiefMoney.save();
            console.log(`Updated thief ${thiefId} from ${oldAmount} to ${thiefMoney.money} coins`);
        }
    } catch (error) {
        console.error(`Error rewarding thief ${thiefId}:`, error);
    }
}

/**
 * Distribute minecart rewards to contributors
 * @param {Object} stolenFromPlayers - Object mapping userId to amount they would have received
 * @param {number} distributionRatio - Ratio of amount to distribute (0-1)
 */
async function distributeMinecartRewards(stolenFromPlayers, distributionRatio) {
    console.log(`Distributing ${(distributionRatio * 100).toFixed(0)}% of minecart rewards to contributors`);
    
    if (!stolenFromPlayers || typeof stolenFromPlayers !== 'object') {
        console.error('[DISTRIBUTE] Invalid stolenFromPlayers data:', stolenFromPlayers);
        return;
    }
    
    for (const [userId, originalReward] of Object.entries(stolenFromPlayers)) {
        const rewardAmount = Math.floor(originalReward * distributionRatio);
        
        if (rewardAmount > 0) {
            try {
                let playerMoney = await Currency.findOne({ userId });
                if (!playerMoney) {
                    playerMoney = await Currency.create({
                        userId: userId,
                        usertag: `User-${userId}`,
                        money: rewardAmount
                    });
                    console.log(`Created currency record for ${userId} with ${rewardAmount} coins from minecart`);
                } else {
                    const oldAmount = playerMoney.money || 0;
                    playerMoney.money = oldAmount + rewardAmount;
                    await playerMoney.save();
                    console.log(`Distributed ${rewardAmount} coins to ${userId} from minecart (from ${oldAmount} to ${playerMoney.money})`);
                }
            } catch (error) {
                console.error(`Error distributing coins to ${userId}:`, error);
            }
        }
    }
}

/**
 * Return stolen coins to victims (legacy function for backwards compatibility)
 * @param {Object} stolenFromPlayers - Object mapping userId to amount stolen
 * @param {number} returnRatio - Ratio of stolen amount to return (0-1)
 */
async function returnStolenCoins(stolenFromPlayers, returnRatio) {
    // This now just calls the new distribution function
    return distributeMinecartRewards(stolenFromPlayers, returnRatio);
}

// ============ EVENT MANAGEMENT ============

/**
 * Set special event data
 */
async function setSpecialEvent(channelId, eventData) {
    await gachaVC.updateOne(
        { channelId: channelId },
        { $set: { 'gameData.specialEvent': eventData } }
    );
}

/**
 * Clear special event data
 */
async function clearSpecialEvent(channelId) {
    await gachaVC.updateOne(
        { channelId: channelId },
        { $unset: { 'gameData.specialEvent': 1 } }
    );
}

/**
 * Enhanced checkAndEndSpecialEvent with better logging
 */
async function checkAndEndSpecialEvent(channel, dbEntry) {
    const now = Date.now();
    
    console.log(`[checkAndEndSpecialEvent] Checking for channel ${channel.id}`);
    console.log(`[checkAndEndSpecialEvent] Current time: ${now}`);
    
    if (dbEntry.gameData?.specialEvent) {
        const event = dbEntry.gameData.specialEvent;
        console.log(`[checkAndEndSpecialEvent] Event type: ${event.type}`);
        console.log(`[checkAndEndSpecialEvent] Event end time: ${event.endTime}`);
        console.log(`[checkAndEndSpecialEvent] Should end? ${now > event.endTime}`);
        
        if (now >= event.endTime) {
            const eventType = event.type;
            
            try {
                let eventResult = null;
                switch (eventType) {
                    case 'thief':
                        console.log(`[checkAndEndSpecialEvent] Ending thief game...`);
                        eventResult = await endThiefGame(channel, dbEntry);
                        break;
                    // Add other event endings here
                    default:
                        console.log(`[checkAndEndSpecialEvent] Clearing unknown event type: ${eventType}`);
                        await clearSpecialEvent(channel.id);
                }
                
                // Don't modify timers here - let the main mining loop handle it
                console.log(`[checkAndEndSpecialEvent] Event ended successfully`);
                return eventResult || `🛒 ${eventType} event concluded!`;
            } catch (error) {
                console.error(`[checkAndEndSpecialEvent] Error ending event:`, error);
                // Try to clear the event to prevent getting stuck
                await clearSpecialEvent(channel.id);
                return `⚠️ Event ended with errors`;
            }
        } else {
            console.log(`[checkAndEndSpecialEvent] Event not ready to end yet (${event.endTime - now}ms remaining)`);
        }
    } else {
        console.log(`[checkAndEndSpecialEvent] No special event active`);
    }
    
    return null;
}

// ============ EVENT CONFIGURATION ============

/**
 * Available long break events with weights and player requirements
 */
const longBreakEvents = [
    { 
        func: startThiefGame, 
        weight: 30, 
        name: 'Thief Game',
        minPlayers: 2,  // Need at least 2 players for voting
        maxPlayers: null, // No upper limit
        optimalPlayers: { min: 3, max: 8 } // Works best with 3-8 players
    },
    { 
        func: startMineCollapseEvent, 
        weight: 25, 
        name: 'Mine Collapse',
        minPlayers: 1,  // Can work with any number
        maxPlayers: null,
        optimalPlayers: { min: 1, max: 20 } // Works for any size
    },
    { 
        func: startRailBuildingEvent, 
        weight: 35, 
        name: 'Rail Building',
        minPlayers: 1,  // Can work with any number
        maxPlayers: null,
        optimalPlayers: { min: 1, max: 20 } // Works for any size
    }
    // Future events can be added here with their requirements:
    // { 
    //     func: startTreasureHunt, 
    //     weight: 20, 
    //     name: 'Treasure Hunt',
    //     minPlayers: 3,  // Need teams
    //     maxPlayers: 12, // Too chaotic with more
    //     optimalPlayers: { min: 4, max: 10 }
    // }
];

/**
 * Pick a random long break event based on weights and player count
 * @param {number} playerCount - Number of players in the channel
 * @returns {Function} The selected event function
 */
function pickLongBreakEvent(playerCount = 1) {
    // Filter events based on player requirements
    const eligibleEvents = longBreakEvents.filter(event => {
        // Check minimum players
        if (event.minPlayers && playerCount < event.minPlayers) {
            console.log(`${event.name} requires min ${event.minPlayers} players, have ${playerCount}`);
            return false;
        }
        
        // Check maximum players
        if (event.maxPlayers && playerCount > event.maxPlayers) {
            console.log(`${event.name} allows max ${event.maxPlayers} players, have ${playerCount}`);
            return false;
        }
        
        return true;
    });
    
    // If no events are eligible, fall back to mine collapse (works with any count)
    if (eligibleEvents.length === 0) {
        console.log('No eligible events for player count, defaulting to Mine Collapse');
        return startMineCollapseEvent;
    }
    
    // Adjust weights based on optimal player counts
    const adjustedEvents = eligibleEvents.map(event => {
        let adjustedWeight = event.weight;
        
        // Boost weight if within optimal range
        if (event.optimalPlayers) {
            if (playerCount >= event.optimalPlayers.min && 
                playerCount <= event.optimalPlayers.max) {
                adjustedWeight *= 1.5; // 50% boost for optimal player count
                console.log(`${event.name} weight boosted from ${event.weight} to ${adjustedWeight} (optimal player count)`);
            }
        }
        
        return { ...event, adjustedWeight };
    });
    
    // Calculate total weight
    const totalWeight = adjustedEvents.reduce((sum, e) => sum + e.adjustedWeight, 0);
    
    // Pick random event based on adjusted weights
    let rand = Math.random() * totalWeight;
    const selected = adjustedEvents.find(e => (rand -= e.adjustedWeight) < 0) || adjustedEvents[0];
    
    console.log(`Selected ${selected.name} for ${playerCount} players`);
    return selected.func;
}

/**
 * Check if it's time for a long break (every 4th break)
 */
function shouldTriggerLongBreak(breakCount) {
    return breakCount % 4 === 0;
}

/**
 * Get list of available events for a given player count
 * Useful for debugging and information
 * @param {number} playerCount - Number of players
 * @returns {Array} Array of available event names with their selection chances
 */
function getAvailableEvents(playerCount) {
    const eligible = longBreakEvents.filter(event => {
        if (event.minPlayers && playerCount < event.minPlayers) return false;
        if (event.maxPlayers && playerCount > event.maxPlayers) return false;
        return true;
    });
    
    const totalWeight = eligible.reduce((sum, e) => {
        let weight = e.weight;
        if (e.optimalPlayers && 
            playerCount >= e.optimalPlayers.min && 
            playerCount <= e.optimalPlayers.max) {
            weight *= 1.5;
        }
        return sum + weight;
    }, 0);
    
    return eligible.map(event => {
        let weight = event.weight;
        let status = '';
        
        if (event.optimalPlayers && 
            playerCount >= event.optimalPlayers.min && 
            playerCount <= event.optimalPlayers.max) {
            weight *= 1.5;
            status = ' (optimal)';
        }
        
        const chance = ((weight / totalWeight) * 100).toFixed(1);
        return `${event.name}: ${chance}%${status}`;
    });
}

// ============ BREAK PLAYER POSITIONING ============

/**
 * Scatter players around entrance during breaks
 * Creates tent positions on floor tiles only
 */
function scatterPlayersForBreak(playerPositions, entranceX, entranceY, playerCount, mapData) {
    const scattered = {};
    
    // First, find all available floor tiles near the entrance
    const floorTiles = [];
    const maxRadius = Math.min(10, Math.ceil(Math.sqrt(playerCount * 2)) + 3);
    
    for (let y = Math.max(0, entranceY - maxRadius); y <= Math.min(mapData.height - 1, entranceY + maxRadius); y++) {
        for (let x = Math.max(0, entranceX - maxRadius); x <= Math.min(mapData.width - 1, entranceX + maxRadius); x++) {
            const tile = mapData.tiles[y] && mapData.tiles[y][x];
            if (tile && (tile.type === 'floor' || tile.type === 'entrance')) {
                const distance = Math.sqrt(Math.pow(x - entranceX, 2) + Math.pow(y - entranceY, 2));
                if (distance > 0 && distance <= maxRadius) { // Not on entrance itself
                    floorTiles.push({ x, y, distance });
                }
            }
        }
    }
    
    // Sort floor tiles by distance from entrance (closer first)
    floorTiles.sort((a, b) => a.distance - b.distance);
    
    // Get list of player IDs
    const playerIds = Object.keys(playerPositions);
    const usedPositions = new Set();
    
    for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i];
        let tentPos = null;
        
        // Try to find an unused floor tile
        for (const floorTile of floorTiles) {
            const posKey = `${floorTile.x},${floorTile.y}`;
            if (!usedPositions.has(posKey)) {
                tentPos = floorTile;
                usedPositions.add(posKey);
                break;
            }
        }
        
        // If no floor tile available, place at entrance (shouldn't happen normally)
        if (!tentPos) {
            tentPos = { x: entranceX, y: entranceY };
        }
        
        scattered[playerId] = { x: tentPos.x, y: tentPos.y, isTent: true };
    }
    
    return scattered;
}

// ============ DEBUG FUNCTIONS ============

/**
 * Debug function to check special event status
 */
async function debugSpecialEvent(channel) {
    const dbEntry = await gachaVC.findOne({ channelId: channel.id });
    
    console.log('=== SPECIAL EVENT DEBUG ===');
    console.log('Channel ID:', channel.id);
    console.log('Current time:', new Date().toISOString());
    console.log('Current timestamp:', Date.now());
    
    if (dbEntry?.gameData?.specialEvent) {
        const event = dbEntry.gameData.specialEvent;
        console.log('Event type:', event.type);
        console.log('Event end time:', new Date(event.endTime).toISOString());
        console.log('Event end timestamp:', event.endTime);
        console.log('Time remaining (ms):', event.endTime - Date.now());
        console.log('Should end?:', Date.now() > event.endTime);
        
        if (event.type === 'thief') {
            console.log('Thief ID:', event.thiefId);
            console.log('Amount stolen:', event.amount);
        }
    } else {
        console.log('No special event active');
    }
    
    if (dbEntry?.gameData?.breakInfo) {
        const breakInfo = dbEntry.gameData.breakInfo;
        console.log('--- Break Info ---');
        console.log('In break?:', breakInfo.inBreak);
        console.log('Is long break?:', breakInfo.isLongBreak);
        console.log('Break end time:', new Date(breakInfo.breakEndTime).toISOString());
        console.log('Break time remaining (ms):', breakInfo.breakEndTime - Date.now());
    }
    
    console.log('=========================');
    
    return dbEntry;
}

/**
 * Force end a special event (for testing/debugging)
 */
async function forceEndSpecialEvent(channel) {
    const dbEntry = await gachaVC.findOne({ channelId: channel.id });
    
    if (!dbEntry?.gameData?.specialEvent) {
        console.log('No special event to end');
        return 'No special event active';
    }
    
    const eventType = dbEntry.gameData.specialEvent.type;
    console.log(`Force ending ${eventType} event...`);
    
    // Call the appropriate end function
    switch (eventType) {
        case 'thief':
            await endThiefGame(channel, dbEntry);
            break;
        default:
            await clearSpecialEvent(channel.id);
    }
    
    console.log('Event force ended');
    return `Force ended ${eventType} event`;
}

/**
 * Force start a thief event (for testing)
 */
async function forceStartThiefEvent(channel) {
    const dbEntry = await gachaVC.findOne({ channelId: channel.id });
    
    if (!dbEntry) {
        return 'No active mining session';
    }
    
    // Clear any existing event
    if (dbEntry.gameData?.specialEvent) {
        await clearSpecialEvent(channel.id);
    }
    
    // Start thief event
    const result = await startThiefGame(channel, dbEntry);
    return result || 'Thief event started';
}

/**
 * Calculate minecart value without distributing it
 * Used when a thief event is about to happen
 */
async function calculateMinecartValue(dbEntry) {
    const { miningItemPool, SERVER_POWER_MODIFIERS, POWER_LEVEL_CONFIG } = require('./miningConstants');
    const gachaInfo = require('../../../data/gachaServers.json');
    
    const gameData = dbEntry.gameData;
    if (!gameData || gameData.gamemode !== 'mining') return null;

    const minecart = gameData.minecart;
    if (!minecart || !minecart.items) return null;
    
    // Get server power level and modifiers
    const gachaVCInfo = gachaInfo.find(s => s.id === dbEntry.typeId);
    const serverType = gachaVCInfo?.name || null;
    const serverPowerLevel = gachaVCInfo?.power || 1;
    const serverModifier = serverType && SERVER_POWER_MODIFIERS[serverType] 
        ? SERVER_POWER_MODIFIERS[serverType] 
        : null;
    const config = POWER_LEVEL_CONFIG[serverPowerLevel];

    // Calculate total value and create contributor rewards
    let totalValue = 0;
    const contributorRewards = {};

    // Process each item type in the minecart
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        const poolItem = miningItemPool.find(item => item.itemId === itemId);
        if (!poolItem || itemData.quantity <= 0) continue;

        let itemTotalValue = poolItem.value * itemData.quantity;
        
        // Apply server-specific value bonuses
        if (serverModifier && serverModifier.itemBonuses[itemId]) {
            itemTotalValue = Math.floor(itemTotalValue * serverModifier.itemBonuses[itemId]);
        }
        
        // Apply power level value multiplier
        if (config) {
            itemTotalValue = Math.floor(itemTotalValue * config.valueMultiplier);
        }
        
        totalValue += itemTotalValue;

        // Calculate rewards for contributors of this specific item
        const contributorCount = Object.keys(itemData.contributors || {}).length;
        if (contributorCount > 0) {
            const coinsPerContributor = Math.floor(itemTotalValue / contributorCount);
            
            for (const [playerId, contributed] of Object.entries(itemData.contributors)) {
                if (!contributorRewards[playerId]) {
                    contributorRewards[playerId] = { coins: 0, items: [] };
                }
                contributorRewards[playerId].coins += coinsPerContributor;
                contributorRewards[playerId].items.push(`${poolItem.name} x${contributed}`);
            }
        }
    }

    return {
        totalValue,
        contributorRewards
    };
}

// ============ EXPORTS ============

module.exports = {
    // Event functions
    startThiefGame,
    startMineCollapseEvent,
    startRailBuildingEvent,
    endThiefGame,
    calculateMinecartValue,
    
    // Event management
    setSpecialEvent,
    clearSpecialEvent,
    checkAndEndSpecialEvent,
    
    // Event selection
    pickLongBreakEvent,
    shouldTriggerLongBreak,
    getAvailableEvents,
    
    // Break positioning
    scatterPlayersForBreak,
    
    // Configuration
    longBreakEvents,
    
    // Debug functions
    debugSpecialEvent,
    forceEndSpecialEvent,
    forceStartThiefEvent
};

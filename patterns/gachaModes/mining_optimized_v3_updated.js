// mining_optimized_v3.js - Enhanced Mining System with Scheduled Breaks
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
const generateTileMapImage = require('../generateMiningProcedural');
const gachaVC = require('../../models/activevcs');

// Import modular components
const { 
    IMAGE_GENERATION_INTERVAL, 
    MAX_SPEED_ACTIONS, 
    EXPLORATION_BONUS_CHANCE,
    TILE_TYPES 
} = require('./mining/miningConstants');

const {
    calculateTeamVisibility,
    findNearestTarget,
    pickWeightedItem,
    getDirectionToTarget,
    getRandomDirection,
    canBreakTile,
    checkPickaxeBreak,
    getMinecartSummary,
    createPlayerSeed
} = require('./mining/miningUtils');

const {
    DatabaseTransaction,
    addItemToMinecart,
    initializeGameData,
    createMiningSummary
} = require('./mining/miningDatabase');

const {
    initializeMap,
    initializeBreakPositions,
    cleanupPlayerPositions,
    checkMapExpansion
} = require('./mining/miningMap');

const {
    checkAndEndSpecialEvent,
    pickLongBreakEvent,
    shouldTriggerLongBreak,
    scatterPlayersForBreak
} = require('./mining/miningEvents');

// Global event counter for image generation
let eventCounter = 0;

// TIMING CONFIGURATION
const MINING_DURATION = 25 * 60 * 1000; // 25 minutes
const SHORT_BREAK_DURATION = 5 * 60 * 1000; // 5 minutes
const LONG_BREAK_DURATION = 25 * 60 * 1000; // 25 minutes
const LONG_EVENT_DURATION = 15 * 60 * 1000; // 15 minutes of long break for event

// Calculate next break time based on current cycle
function calculateNextBreakTime(dbEntry) {
    const now = Date.now();
    const cycleCount = dbEntry.gameData?.cycleCount || 0;
    
    // Pattern: 3 cycles of (25min mining + 5min break), then 1 cycle of (25min mining + 25min long break)
    const isLongBreakCycle = (cycleCount % 4) === 3;
    
    if (isLongBreakCycle) {
        // Long break cycle
        return {
            nextShopRefresh: new Date(now + MINING_DURATION),
            breakDuration: LONG_BREAK_DURATION,
            isLongBreak: true
        };
    } else {
        // Short break cycle
        return {
            nextShopRefresh: new Date(now + MINING_DURATION),
            breakDuration: SHORT_BREAK_DURATION,
            isLongBreak: false
        };
    }
}

// Check if currently in break period
function isBreakPeriod(dbEntry) {
    const now = Date.now();
    return dbEntry.gameData?.breakInfo?.inBreak || false;
}

// Get a random floor tile for gathering during breaks
function getRandomFloorTile(mapData) {
    const floorTiles = [];
    
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            const tile = mapData.tiles[y] && mapData.tiles[y][x];
            if (tile && tile.type === TILE_TYPES.FLOOR && tile.discovered) {
                floorTiles.push({ x, y });
            }
        }
    }
    
    if (floorTiles.length === 0) {
        // Fallback to entrance if no floor tiles
        return { x: mapData.entranceX, y: mapData.entranceY };
    }
    
    return floorTiles[Math.floor(Math.random() * floorTiles.length)];
}

// Scatter players around a central tile
function scatterPlayersAroundTile(members, centerX, centerY, mapData) {
    const positions = {};
    const memberArray = Array.from(members.values());
    
    // Define scatter pattern (spiraling outward)
    const offsets = [
        [0, 0],   // Center
        [0, -1], [1, 0], [0, 1], [-1, 0],  // Adjacent tiles
        [1, -1], [1, 1], [-1, 1], [-1, -1], // Diagonal tiles
        [0, -2], [2, 0], [0, 2], [-2, 0],   // Further out
        [2, -1], [2, 1], [1, 2], [-1, 2],
        [-2, 1], [-2, -1], [-1, -2], [1, -2]
    ];
    
    for (let i = 0; i < memberArray.length; i++) {
        const member = memberArray[i];
        const offsetIndex = Math.min(i, offsets.length - 1);
        const [dx, dy] = offsets[offsetIndex];
        
        let finalX = centerX + dx;
        let finalY = centerY + dy;
        
        // Ensure position is within map bounds
        finalX = Math.max(0, Math.min(finalX, mapData.width - 1));
        finalY = Math.max(0, Math.min(finalY, mapData.height - 1));
        
        positions[member.id] = {
            x: finalX,
            y: finalY,
            isTent: true
        };
    }
    
    return positions;
}

// Enhanced mining system for individual players
async function mineFromTile(member, miningPower, luckStat, powerLevel, tileType) {
    const item = pickWeightedItem(powerLevel, tileType);
    
    let quantity = 1;
    
    if (miningPower > 0) {
        const maxBonus = Math.min(miningPower, 4);
        quantity = 1 + Math.floor(Math.random() * maxBonus);
    }
    
    if (luckStat && luckStat > 0) {
        const bonusChance = Math.min(0.6, luckStat * 0.08);
        if (Math.random() < bonusChance) {
            quantity += Math.floor(1 + Math.random() * 3);
        }
    }
    
    if (tileType === TILE_TYPES.RARE_ORE) {
        quantity *= 2;
    } else if (tileType === TILE_TYPES.TREASURE_CHEST) {
        quantity = Math.max(quantity, 3);
    }
    
    return { item, quantity };
}

// Enhanced Event Log System
async function logEvent(channel, eventText, forceNew = false) {
    eventCounter++;
    const shouldGenerateImage = forceNew || (eventCounter % IMAGE_GENERATION_INTERVAL === 0);
    
    const result = await gachaVC.findOne({ channelId: channel.id });
    const now = new Date();
    
    let timeStatus = "MINING";
    let timeRemaining = 0;
    
    if (result.gameData?.breakInfo?.inBreak) {
        const breakEndTime = result.gameData.breakInfo.breakEndTime;
        timeRemaining = Math.max(0, Math.floor((breakEndTime - now) / (1000 * 60)));
        
        if (result.gameData.breakInfo.isLongBreak) {
            if (result.gameData?.specialEvent) {
                timeStatus = "LONG BREAK (EVENT)";
            } else {
                timeStatus = "LONG BREAK (SHOP)";
            }
        } else {
            timeStatus = "SHORT BREAK";
        }
    } else if (result.nextShopRefresh) {
        timeRemaining = Math.max(0, Math.floor((result.nextShopRefresh - now) / (1000 * 60)));
        timeStatus = "MINING";
    }

    const minecartSummary = getMinecartSummary(result);
    const sessionStats = result.gameData?.stats || { totalOreFound: 0, wallsBroken: 0, treasuresFound: 0 };

    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const logEntry = eventText ? `[${timestamp}] ${eventText}` : null;

    try {
        const messages = await channel.messages.fetch({ limit: 2 });
        let eventLogMessage = null;

        for (const [, message] of messages) {
            if (message.embeds.length > 0 && 
                message.embeds[0].title === '🗺️ MINING MAP' && 
                message.author.bot) {
                eventLogMessage = message;
                break;
            }
        }

        let attachment = null;
        if (shouldGenerateImage) {
            const mapBuffer = await generateTileMapImage(channel);
            attachment = new AttachmentBuilder(mapBuffer, { name: 'mine_map.png' });
        }

        if (logEntry || shouldGenerateImage) {
            const embed = new EmbedBuilder()
                .setTitle('🗺️ MINING MAP')
                .setColor(0x8B4513)
                .setFooter({ 
                    text: `${timeStatus}: ${timeRemaining}m | MINECART: ${minecartSummary.summary} | ORE: ${sessionStats.totalOreFound} | WALLS: ${sessionStats.wallsBroken}`
                })
                .setTimestamp();

            if (logEntry) {
                embed.setDescription('```\n' + logEntry + '\n```');
            }

            if (shouldGenerateImage) {
                embed.setImage('attachment://mine_map.png');
            }

            if (eventLogMessage && forceNew === false) {
                const existingEmbed = eventLogMessage.embeds[0];
                let currentDescription = existingEmbed.description || '';
                currentDescription = currentDescription.replace(/^```\n?|```$/g, '');
                
                const lines = currentDescription.split('\n').filter(line => line.trim());
                if (logEntry) {
                    if (lines.length >= 12) lines.shift();
                    lines.push(logEntry);
                }

                const newDescription = lines.length > 0 ? '```\n' + lines.join('\n') + '\n```' : null;

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('🗺️ MINING MAP')
                    .setColor(0x8B4513)
                    .setFooter({ 
                        text: `${timeStatus}: ${timeRemaining}m | MINECART: ${minecartSummary.summary} | ORE: ${sessionStats.totalOreFound} | WALLS: ${sessionStats.wallsBroken}`
                    })
                    .setTimestamp();

                if (newDescription) updatedEmbed.setDescription(newDescription);
                if (shouldGenerateImage) updatedEmbed.setImage('attachment://mine_map.png');

                await eventLogMessage.edit({ embeds: [updatedEmbed], files: attachment ? [attachment] : [] });
                return;
            }

            const messageOptions = { embeds: [embed] };
            if (attachment) messageOptions.files = [attachment];

            await channel.send(messageOptions);
        }

    } catch (error) {
        console.error('Error updating mining map:', error);
        if (eventText) await channel.send(`\`${logEntry}\``);
    }
}

// Handle break start
async function startBreak(channel, dbEntry, isLongBreak = false) {
    const now = Date.now();
    const members = channel.members.filter(m => !m.user.bot);
    
    if (isLongBreak) {
        // Long break - 25 minutes total
        const breakEndTime = now + LONG_BREAK_DURATION;
        const eventEndTime = now + LONG_EVENT_DURATION;
        
        // Update database with break info
        await gachaVC.updateOne(
            { channelId: channel.id },
            {
                $set: {
                    'gameData.breakInfo': {
                        inBreak: true,
                        isLongBreak: true,
                        breakStartTime: now,
                        breakEndTime: breakEndTime,
                        eventEndTime: eventEndTime
                    },
                    nextTrigger: new Date(breakEndTime),
                    nextShopRefresh: new Date(breakEndTime)
                }
            }
        );
        
        // Move all players to entrance without drawing avatars (they'll be hidden)
        const mapData = dbEntry.gameData.map;
        const updatedPositions = {};
        for (const member of members.values()) {
            updatedPositions[member.id] = {
                x: mapData.entranceX,
                y: mapData.entranceY,
                hidden: true // Mark as hidden during long break
            };
        }
        
        await gachaVC.updateOne(
            { channelId: channel.id },
            { $set: { 'gameData.map.playerPositions': updatedPositions } }
        );
        
        // Start long event
        const selectedEvent = pickLongBreakEvent();
        const eventResult = await selectedEvent(channel, dbEntry);
        
        await logEvent(channel, `🎪 LONG BREAK: ${eventResult}`, true);
        
        // Schedule shop opening after event (15 minutes)
        setTimeout(async () => {
            const refreshedEntry = await gachaVC.findOne({ channelId: channel.id });
            if (refreshedEntry.gameData?.breakInfo?.inBreak) {
                await generateShop(channel, 10); // Shop for last 10 minutes
                await logEvent(channel, '🛒 Event ended! Shop is now open!', true);
            }
        }, LONG_EVENT_DURATION);
        
    } else {
        // Short break - 5 minutes
        const breakEndTime = now + SHORT_BREAK_DURATION;
        
        // Get random floor tile for gathering
        const mapData = dbEntry.gameData.map;
        const gatherPoint = getRandomFloorTile(mapData);
        
        // Scatter players around the gather point as tents
        const scatteredPositions = scatterPlayersAroundTile(members, gatherPoint.x, gatherPoint.y, mapData);
        
        // Update database with break info
        await gachaVC.updateOne(
            { channelId: channel.id },
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
        await generateShop(channel, 5);
        await logEvent(channel, `⛺ SHORT BREAK: Players camping at (${gatherPoint.x}, ${gatherPoint.y}). Shop open!`, true);
    }
}

// Handle break end
async function endBreak(channel, dbEntry, isLongBreak) {
    const mapData = dbEntry.gameData.map;
    const members = channel.members.filter(m => !m.user.bot);
    

    if (isLongBreak){
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
    }
    // Calculate next break timing
    const cycleCount = (dbEntry.gameData?.cycleCount || 0) + 1;
    const nextBreakInfo = calculateNextBreakTime({ gameData: { cycleCount } });
    
    // Clear break info and update positions
    await gachaVC.updateOne(
        { channelId: channel.id },
        {
            $set: {
                'gameData.map.playerPositions': resetPositions,
                'gameData.cycleCount': cycleCount,
                nextShopRefresh: nextBreakInfo.nextShopRefresh
            },
            $unset: {
                'gameData.breakInfo': 1
            }
        }
    );
    
    await logEvent(channel, '⛏️ Break ended! Mining resumed.', true);
}

// Main Mining Event
module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();
    
    initializeGameData(dbEntry, channel.id);
    await dbEntry.save();

    if (!channel?.isVoiceBased()) return;
    const members = channel.members.filter(m => !m.user.bot);
    if (!members.size) return;

    // Check if we're in a break period
    const inBreak = isBreakPeriod(dbEntry);
    
    if (inBreak) {
        const breakInfo = dbEntry.gameData.breakInfo;
        
        // Check if break should end
        if (now >= breakInfo.breakEndTime) {
            await endBreak(channel, dbEntry, breakInfo.isLongBreak);
            return;
        }
        
        // During long break, check if event should transition to shop
        if (breakInfo.isLongBreak && breakInfo.eventEndTime && now >= breakInfo.eventEndTime) {
            const eventEndResult = await checkAndEndSpecialEvent(channel, dbEntry);
            if (eventEndResult) {
                await logEvent(channel, eventEndResult, true);
                await generateShop(channel, Math.floor((breakInfo.breakEndTime - now) / (1000 * 60)));
            }
        }
        
        // Don't process mining during breaks
        return;
    }

    // Check if it's time to start a break
    if (now >= dbEntry.nextShopRefresh) {
        const cycleCount = dbEntry.gameData?.cycleCount || 0;
        const isLongBreak = (cycleCount % 4) === 3;
        
        // Create mining summary before break
        await createMiningSummary(channel, dbEntry);
        
        // Start the appropriate break
        await startBreak(channel, dbEntry, isLongBreak);
        return;
    }

    // Normal mining logic continues below...
    
    // Cache all player stats
    const playerStatsCache = new Map();
    const playerStatPromises = Array.from(members.values()).map(async (member) => {
        const result = await getPlayerStats(member.id);
        playerStatsCache.set(member.id, result);
    });
    await Promise.all(playerStatPromises);

    let mapData = dbEntry.gameData.map;
    let mapChanged = false;
    const transaction = new DatabaseTransaction();
    
    // Initialize map if not present
    if (!mapData) {
        mapData = initializeMap(channel.id);
        mapChanged = true;
    }

    // Initialize/update player positions
    mapData = initializeBreakPositions(mapData, members, false);
    mapChanged = true;

    // Remove positions for players no longer in VC
    const currentPlayerIds = Array.from(members.keys());
    mapData = cleanupPlayerPositions(mapData, currentPlayerIds);

    // Calculate enhanced team sight radius
    let totalSight = 0;
    let playerCount = 0;
    for (const member of members.values()) {
        const playerData = playerStatsCache.get(member.id);
        totalSight += playerData.stats.sight || 0;
        playerCount++;
    }
    const teamSightRadius = Math.floor(totalSight / playerCount) + 1;

    // Calculate team visibility
    const teamVisibleTiles = calculateTeamVisibility(mapData.playerPositions, teamSightRadius, mapData.tiles);
    
    // Mark visible tiles as discovered
    for (const tileKey of teamVisibleTiles) {
        const [x, y] = tileKey.split(',').map(Number);
        if (mapData.tiles[y] && mapData.tiles[y][x]) {
            if (!mapData.tiles[y][x].discovered) {
                mapData.tiles[y][x].discovered = true;
                mapChanged = true;
            }
        }
    }

    const eventLogs = [];
    const powerLevel = json.power || 1;
    let wallsBroken = 0;
    let treasuresFound = 0;

    // Process actions for each player
    for (const member of members.values()) {
        const playerData = playerStatsCache.get(member.id);
        const miningPower = playerData.stats.mining || 0;
        const luckStat = playerData.stats.luck || 0;
        const speedStat = Math.min(playerData.stats.speed || 1, MAX_SPEED_ACTIONS);
        const bestPickaxe = playerData.bestItems.mining || null;
        
        const numActions = speedStat > 0 ? Math.floor(Math.random() * speedStat) + 1 : 1;
        
        for (let actionNum = 0; actionNum < numActions; actionNum++) {
            const position = mapData.playerPositions[member.id];
            if (!position) break;
            
            // Check for adjacent mineable tiles
            const adjacentPositions = [
                { x: position.x, y: position.y - 1 },
                { x: position.x + 1, y: position.y },
                { x: position.x, y: position.y + 1 },
                { x: position.x - 1, y: position.y }
            ];
            
            let adjacentTarget = null;
            for (const adj of adjacentPositions) {
                const tileY = Math.max(0, Math.min(adj.y, mapData.height - 1));
                const tileX = Math.max(0, Math.min(adj.x, mapData.width - 1));
                
                if (mapData.tiles[tileY] && mapData.tiles[tileY][tileX]) {
                    const tile = mapData.tiles[tileY][tileX];
                    if (tile && (tile.type === TILE_TYPES.WALL_WITH_ORE || 
                               tile.type === TILE_TYPES.RARE_ORE ||
                               tile.type === TILE_TYPES.TREASURE_CHEST)) {
                        adjacentTarget = { ...adj, tile };
                        break;
                    }
                }
            }
            
            // Enhanced mining logic
            if (adjacentTarget) {
                const tile = adjacentTarget.tile;
                if (await canBreakTile(member.id, miningPower, tile)) {
                    const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, tile.type);
                    
                    await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                    
                    const mineY = Math.max(0, Math.min(adjacentTarget.y, mapData.height - 1));
                    const mineX = Math.max(0, Math.min(adjacentTarget.x, mapData.width - 1));
                    
                    mapData.tiles[mineY][mineX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                    mapChanged = true;
                    wallsBroken++;
                    
                    // Special messaging for different tile types
                    let findMessage;
                    if (tile.type === TILE_TYPES.TREASURE_CHEST) {
                        findMessage = `🏆 ${member.displayName} discovered a treasure chest! Found ${item.name} x${quantity}!`;
                        treasuresFound++;
                    } else if (tile.type === TILE_TYPES.RARE_ORE) {
                        findMessage = `✨ ${member.displayName} struck rare ore! Found ${item.name} x${quantity}!`;
                    } else {
                        findMessage = `💎 ${member.displayName} found ${item.name} x${quantity}`;
                    }
                    
                    // Check for pickaxe break
                    if (bestPickaxe && checkPickaxeBreak(bestPickaxe, tile.hardness)) {
                        transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                        eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered!`);
                        eventLogs.push(findMessage);
                    } else {
                        eventLogs.push(findMessage);
                    }
                } else {
                    // Failed to break tile
                    if (miningPower <= 0) {
                        if (Math.random() < 0.001) {
                            const { item, quantity } = await mineFromTile(member, 1, luckStat, powerLevel, tile.type);
                            eventLogs.push(`🔥 ${member.displayName}'s determination broke through! Found ${item.name} x${quantity} with bare hands!`);
                            await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                            wallsBroken++;
                        } else {
                            eventLogs.push(`${member.displayName} tried to mine ${tile.type.replace('_', ' ')} but has no pickaxe`);
                        }
                    } else {
                        const tileTypeNames = {
                            [TILE_TYPES.WALL_WITH_ORE]: 'ore wall',
                            [TILE_TYPES.RARE_ORE]: 'rare ore vein',
                            [TILE_TYPES.TREASURE_CHEST]: 'treasure chest',
                            [TILE_TYPES.REINFORCED_WALL]: 'reinforced wall'
                        };
                        eventLogs.push(`${member.displayName} struck the ${tileTypeNames[tile.type] || 'wall'} but couldn't break through`);
                        
                        // Check for pickaxe break on failed attempt
                        if (bestPickaxe && checkPickaxeBreak(bestPickaxe, tile.hardness)) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered from the impact`);
                        }
                    }
                }
                continue;
            }
            
            // Enhanced pathfinding with target priorities
            const visibleTargets = [
                TILE_TYPES.TREASURE_CHEST,
                TILE_TYPES.RARE_ORE,
                TILE_TYPES.WALL_WITH_ORE
            ];
            
            const nearestTarget = findNearestTarget(position, teamVisibleTiles, mapData.tiles, visibleTargets);
            
            let direction;
            if (nearestTarget) {
                direction = getDirectionToTarget(position, nearestTarget);
            } else {
                const seed = createPlayerSeed(channel.id, member.id) + Math.floor(now / 30000) + actionNum;
                direction = getRandomDirection(seed);
            }
            
            if (direction.dx === 0 && direction.dy === 0) continue;
            
            const newX = position.x + direction.dx;
            const newY = position.y + direction.dy;
            
            // Enhanced map expansion with size limits
            mapData = checkMapExpansion(mapData, newX, newY, channel.id);
            if (mapData !== dbEntry.gameData.map) {
                mapChanged = true;
            }
            
            // Ensure we're within bounds after expansion
            const clampedX = Math.max(0, Math.min(newX, mapData.width - 1));
            const clampedY = Math.max(0, Math.min(newY, mapData.height - 1));
            
            const targetTile = mapData.tiles[clampedY] && mapData.tiles[clampedY][clampedX];
            if (!targetTile) continue;
            
            // Enhanced wall breaking
            if (targetTile.type === TILE_TYPES.WALL || 
                targetTile.type === TILE_TYPES.REINFORCED_WALL ||
                targetTile.type === TILE_TYPES.WALL_WITH_ORE ||
                targetTile.type === TILE_TYPES.RARE_ORE ||
                targetTile.type === TILE_TYPES.TREASURE_CHEST) {
                
                if (await canBreakTile(member.id, miningPower, targetTile)) {
                    // Special handling for different tile types
                    if (targetTile.type === TILE_TYPES.WALL_WITH_ORE ||
                        targetTile.type === TILE_TYPES.RARE_ORE ||
                        targetTile.type === TILE_TYPES.TREASURE_CHEST) {
                        
                        const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, targetTile.type);
                        await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                        
                        let findMessage;
                        if (targetTile.type === TILE_TYPES.TREASURE_CHEST) {
                            findMessage = `🏆 ${member.displayName} opened a treasure chest! Found ${item.name} x${quantity}!`;
                            treasuresFound++;
                        } else if (targetTile.type === TILE_TYPES.RARE_ORE) {
                            findMessage = `✨ ${member.displayName} mined rare ore! Found ${item.name} x${quantity}!`;
                        } else {
                            findMessage = `💎 ${member.displayName} found ${item.name} x${quantity}`;
                        }
                        
                        if (bestPickaxe && checkPickaxeBreak(bestPickaxe, targetTile.hardness)) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered!`);
                            eventLogs.push(findMessage);
                        } else {
                            eventLogs.push(findMessage);
                        }
                    }
                    
                    // Convert to floor and move player
                    mapData.tiles[clampedY][clampedX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                    position.x = clampedX;
                    position.y = clampedY;
                    mapChanged = true;
                    wallsBroken++;
                } else {
                    // Failed to break wall
                    if (miningPower <= 0) {
                        if (Math.random() < 0.001) {
                            eventLogs.push(`🔥 ${member.displayName} broke through with sheer willpower!`);
                            mapData.tiles[clampedY][clampedX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                            position.x = clampedX;
                            position.y = clampedY;
                            mapChanged = true;
                            wallsBroken++;
                        } else {
                            eventLogs.push(`${member.displayName} tried to break a ${targetTile.type.replace('_', ' ')} but has no pickaxe`);
                        }
                    } else {
                        const tileTypeNames = {
                            [TILE_TYPES.WALL]: 'wall',
                            [TILE_TYPES.REINFORCED_WALL]: 'reinforced wall',
                            [TILE_TYPES.WALL_WITH_ORE]: 'ore wall',
                            [TILE_TYPES.RARE_ORE]: 'rare ore vein'
                        };
                        eventLogs.push(`${member.displayName} struck the ${tileTypeNames[targetTile.type] || 'wall'} but it held firm`);
                        
                        if (bestPickaxe && checkPickaxeBreak(bestPickaxe, targetTile.hardness)) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered from the impact`);
                        }
                    }
                }
            } else if (targetTile.type === TILE_TYPES.HAZARD) {
                // Handle hazard tiles
                // if (Math.random() < 0.7) {
                //     eventLogs.push(`⚠️ ${member.displayName} avoided a dangerous hazard`);
                // } else {
                //     eventLogs.push(`💥 ${member.displayName} triggered a hazard and was knocked back!`);
                // }
            } else {
                // Free movement on floor/entrance tiles
                position.x = clampedX;
                position.y = clampedY;
                mapChanged = true;
                
                // Enhanced exploration rewards
                if (Math.random() < EXPLORATION_BONUS_CHANCE) {
                    const bonusItem = pickWeightedItem(1, TILE_TYPES.WALL_WITH_ORE);
                    eventLogs.push(`🔍 ${member.displayName} found ${bonusItem.name} while exploring!`);
                    await addItemToMinecart(dbEntry, member.id, bonusItem.itemId, 1);
                }
            }
        }
    }

    // Update session statistics
    if (wallsBroken > 0 || treasuresFound > 0) {
        await gachaVC.updateOne(
            { channelId: channel.id },
            {
                $inc: {
                    'gameData.stats.wallsBroken': wallsBroken,
                    'gameData.stats.treasuresFound': treasuresFound
                }
            }
        );
    }

    // Commit all database changes
    if (mapChanged) {
        transaction.setMapUpdate(channel.id, mapData);
    }
    await transaction.commit();

    // Enhanced event logging
    if (eventLogs.length > 0) {
        const combinedEvents = eventLogs.join(' | ');
        await logEvent(channel, combinedEvents);
    } else {
        await logEvent(channel, '');
    }
};

// Export utility functions for testing
module.exports.pickWeightedItem = pickWeightedItem;
module.exports.calculateTeamVisibility = calculateTeamVisibility;
module.exports.getMinecartSummary = getMinecartSummary;
module.exports.TILE_TYPES = TILE_TYPES;

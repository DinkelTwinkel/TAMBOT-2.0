// mining_optimized_v4_performance.js - Performance-optimized Mining System
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

// Import performance optimizations
const {
    batchDB,
    playerStatsCache,
    visibilityCalculator,
    messageThrottler,
    eventBatcher
} = require('./mining/miningPerformance');

// Global event counter for image generation
let eventCounter = 0;

// Track users who have been announced in this session
const announcedUsers = new Set();

// Performance: Reduce image generation frequency
const REDUCED_IMAGE_INTERVAL = 1; // Generate image every 5 events instead of 1

// TIMING CONFIGURATION
const MINING_DURATION = 25 * 60 * 1000; // 25 minutes
const SHORT_BREAK_DURATION = 5 * 60 * 1000; // 5 minutes
const LONG_BREAK_DURATION = 25 * 60 * 1000; // 25 minutes
const LONG_EVENT_DURATION = 15 * 60 * 1000; // 15 minutes of long break for event

// Performance: Cache database entries
const dbCache = new Map();
const DB_CACHE_TTL = 30000; // 30 seconds

async function getCachedDBEntry(channelId, forceRefresh = false) {
    const now = Date.now();
    const cached = dbCache.get(channelId);
    
    if (!forceRefresh && cached && (now - cached.timestamp) < DB_CACHE_TTL) {
        return cached.data;
    }
    
    const entry = await gachaVC.findOne({ channelId });
    dbCache.set(channelId, { data: entry, timestamp: now });
    return entry;
}

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

// Optimized Event Log System with batching
async function logEvent(channel, eventText, forceNew = false) {
    eventCounter++;
    const shouldGenerateImage = forceNew || (eventCounter % REDUCED_IMAGE_INTERVAL === 0);
        
    const result = await getCachedDBEntry(channel.id);
    const now = new Date();
    
    let timeStatus = "MINING";
    let timeRemaining = 0;
    let endTimestamp = null;

    if (result.gameData?.breakInfo?.inBreak) {
        const breakEndTime = result.gameData.breakInfo.breakEndTime;
        timeRemaining = Math.max(0, Math.floor((breakEndTime - now) / (1000 * 60)));
        endTimestamp = Math.floor(breakEndTime / 1000); // convert to seconds

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
        endTimestamp = Math.floor(result.nextShopRefresh / 1000);
        timeStatus = "MINING";
    }

    const minecartSummary = getMinecartSummary(result);

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
            if (
                message.embeds.length > 0 &&
                message.embeds[0].title &&
                message.embeds[0].title.includes('MINING MAP') &&
                message.author.bot
            ) {
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
            const titleText = endTimestamp
                ? `🗺️ MINING MAP | ${timeStatus} ends <t:${endTimestamp}:R>`
                : `🗺️ MINING MAP | ${timeStatus}`;

            const embed = new EmbedBuilder()
                .setTitle(titleText)
                .setColor(0x8B4513)
                .setFooter({ 
                    text: `MINECART: ${minecartSummary.summary}`
                })
                .setTimestamp();

            if (logEntry) {
                embed.setDescription('```\n' + logEntry + '\n```');
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

                // Check if description would exceed 4000 chars
                if (newDescription && newDescription.length > 4000) {
                    const newEmbed = new EmbedBuilder()
                        .setTitle(titleText)
                        .setColor(0x8B4513)
                        .setFooter({ 
                            text: `MINECART: ${minecartSummary.summary}`
                        })
                        .setTimestamp();

                    if (logEntry) newEmbed.setDescription('```\n' + logEntry + '\n```');

                    const messageOptions = { embeds: [newEmbed] };
                    if (attachment) messageOptions.files = [attachment];

                    await channel.send(messageOptions);
                    return;
                }

                const updatedEmbed = new EmbedBuilder()
                    .setTitle(titleText)
                    .setColor(0x8B4513)
                    .setFooter({ 
                        text: `MINECART: ${minecartSummary.summary}`
                    })
                    .setTimestamp();

                if (newDescription) updatedEmbed.setDescription(newDescription);

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

// Handle break start with optimized database operations
async function startBreak(channel, dbEntry, isLongBreak = false) {
    const now = Date.now();
    const members = channel.members.filter(m => !m.user.bot);
    
    if (isLongBreak) {
        // Long break - 25 minutes total
        const breakEndTime = now + LONG_BREAK_DURATION;
        const eventEndTime = now + LONG_EVENT_DURATION;
        
        // Batch database update
        batchDB.queueUpdate(channel.id, {
            'gameData.breakInfo': {
                inBreak: true,
                isLongBreak: true,
                breakStartTime: now,
                breakEndTime: breakEndTime,
                eventEndTime: eventEndTime
            },
            nextTrigger: new Date(breakEndTime),
            nextShopRefresh: new Date(breakEndTime)
        });
        
        // Move all players to entrance
        const mapData = dbEntry.gameData.map;
        const updatedPositions = {};
        for (const member of members.values()) {
            updatedPositions[member.id] = {
                x: mapData.entranceX,
                y: mapData.entranceY,
                hidden: true
            };
        }
        
        batchDB.queueUpdate(channel.id, {
            'gameData.map.playerPositions': updatedPositions
        });
        
        await batchDB.flush();
        
        // Get updated dbEntry after database changes
        const updatedDbEntry = await getCachedDBEntry(channel.id, true);
        
        // Start long event - pass player count for event selection
        const playerCount = members.size;
        const selectedEvent = pickLongBreakEvent(playerCount);
        const eventResult = await selectedEvent(channel, updatedDbEntry);
        
        await logEvent(channel, `🎪 LONG BREAK: ${eventResult || 'Event started'}`, true);
        
        // Schedule shop opening after event (15 minutes)
        setTimeout(async () => {
            const refreshedEntry = await getCachedDBEntry(channel.id, true);
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
        
        // Batch database update
        batchDB.queueUpdate(channel.id, {
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
        });
        
        await batchDB.flush();
        
        // Open shop
        await generateShop(channel, 5);
        await logEvent(channel, `⛺ SHORT BREAK: Players camping at (${gatherPoint.x}, ${gatherPoint.y}). Shop open!`, true);
    }
}

// Handle break end with optimized operations
async function endBreak(channel, dbEntry) {
    const mapData = dbEntry.gameData.map;
    const members = channel.members.filter(m => !m.user.bot);
    const breakInfo = dbEntry.gameData.breakInfo;
    
    // Determine where players should return to
    const resetPositions = {};
    
    if (breakInfo.isLongBreak) {
        // Long break - reset all players to entrance
        for (const member of members.values()) {
            resetPositions[member.id] = {
                x: mapData.entranceX,
                y: mapData.entranceY,
                isTent: false,
                hidden: false
            };
        }
    } else {
        // Short break - return players to their camping positions
        const currentPositions = mapData.playerPositions || {};
        for (const member of members.values()) {
            const currentPos = currentPositions[member.id];
            if (currentPos) {
                // Keep their camping position but remove tent status
                resetPositions[member.id] = {
                    x: currentPos.x,
                    y: currentPos.y,
                    isTent: false,
                    hidden: false
                };
            } else {
                // Fallback to entrance if no position found
                resetPositions[member.id] = {
                    x: mapData.entranceX,
                    y: mapData.entranceY,
                    isTent: false,
                    hidden: false
                };
            }
        }
    }
    
    // Calculate next break timing
    const cycleCount = (dbEntry.gameData?.cycleCount || 0) + 1;
    const nextBreakInfo = calculateNextBreakTime({ gameData: { cycleCount } });
    
    // Batch database update
    batchDB.queueUpdate(channel.id, {
        'gameData.map.playerPositions': resetPositions,
        'gameData.cycleCount': cycleCount,
        nextShopRefresh: nextBreakInfo.nextShopRefresh
    });
    
    await gachaVC.updateOne(
        { channelId: channel.id },
        { $unset: { 'gameData.breakInfo': 1 } }
    );
    
    await batchDB.flush();
    
    // Clear caches after break ends
    visibilityCalculator.invalidate();
    dbCache.delete(channel.id);
    
    await logEvent(channel, '⛏️ Break ended! Mining resumed.', true);
}

// Main Mining Event - Optimized
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
            await endBreak(channel, dbEntry);
            return;
        }
        
        // During long break, check if special event should end
        if (breakInfo.isLongBreak && dbEntry.gameData?.specialEvent) {
            const specialEvent = dbEntry.gameData.specialEvent;
            if (now >= specialEvent.endTime) {
                const eventEndResult = await checkAndEndSpecialEvent(channel, dbEntry);
                if (eventEndResult) {
                    await logEvent(channel, eventEndResult, true);
                }
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

    // Normal mining logic with optimized player stats caching
    const memberIds = Array.from(members.keys());
    const playerStatsMap = await playerStatsCache.getMultiple(memberIds);

    let mapData = dbEntry.gameData.map;
    let mapChanged = false;
    const transaction = new DatabaseTransaction();
    const eventLogs = [];
    const powerLevel = json.power || 1;
    let wallsBroken = 0;
    let treasuresFound = 0;
    
    // Initialize map if not present
    if (!mapData) {
        mapData = initializeMap(channel.id);
        mapChanged = true;
    }

    // Initialize/update player positions
    mapData = initializeBreakPositions(mapData, members, false);
    mapChanged = true;
    
    // Check for new users joining and announce them
    for (const member of members.values()) {
        if (!announcedUsers.has(member.id)) {
            announcedUsers.add(member.id);
            eventLogs.push(`👋 ${member.displayName} has joined the mining expedition!`);
        }
    }

    // Remove positions for players no longer in VC
    const currentPlayerIds = Array.from(members.keys());
    mapData = cleanupPlayerPositions(mapData, currentPlayerIds);

    // Calculate enhanced team sight radius (reduced to 1 during breaks)
    let teamSightRadius = 1;
    if (!inBreak) {
        let totalSight = 0;
        let playerCount = 0;
        for (const member of members.values()) {
            const playerData = playerStatsMap.get(member.id);
            totalSight += playerData.stats.sight || 0;
            playerCount++;
        }
        teamSightRadius = Math.floor(totalSight / playerCount) + 1;
    }

    // Use optimized visibility calculation
    const teamVisibleTiles = visibilityCalculator.calculateTeamVisibility(
        mapData.playerPositions, 
        teamSightRadius, 
        mapData.tiles
    );
    
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

    // Process actions for each player (optimized with parallel processing where possible)
    const playerActions = [];
    
    for (const member of members.values()) {
        const playerData = playerStatsMap.get(member.id);
        playerActions.push(processPlayerActions(
            member, 
            playerData, 
            mapData, 
            teamVisibleTiles, 
            powerLevel,
            transaction,
            eventLogs,
            dbEntry
        ));
    }
    
    // Wait for all player actions to complete
    const actionResults = await Promise.all(playerActions);
    
    // Aggregate results
    for (const result of actionResults) {
        if (result.mapChanged) mapChanged = true;
        wallsBroken += result.wallsBroken;
        treasuresFound += result.treasuresFound;
    }

    // Update session statistics (batched)
    if (wallsBroken > 0 || treasuresFound > 0) {
        batchDB.queueUpdate(channel.id, {
            'gameData.stats.wallsBroken': dbEntry.gameData.stats.wallsBroken + wallsBroken,
            'gameData.stats.treasuresFound': dbEntry.gameData.stats.treasuresFound + treasuresFound
        });
    }

    // Commit all database changes
    if (mapChanged) {
        transaction.setMapUpdate(channel.id, mapData);
    }
    await transaction.commit();
    await batchDB.flush();

    // Enhanced event logging with batching
    if (eventLogs.length > 0) {
        const combinedEvents = eventLogs.join(' | ');
        await logEvent(channel, combinedEvents);
    } else {
        await logEvent(channel, '');
    }
};

// Extracted player action processing for parallel execution
async function processPlayerActions(member, playerData, mapData, teamVisibleTiles, powerLevel, transaction, eventLogs, dbEntry) {
    const miningPower = playerData.stats.mining || 0;
    const luckStat = playerData.stats.luck || 0;
    const speedStat = Math.min(playerData.stats.speed || 1, MAX_SPEED_ACTIONS);
    
    let wallsBroken = 0;
    let treasuresFound = 0;
    let mapChanged = false;
    
    // Find the best pickaxe
    let bestPickaxe = null;
    for (const [key, item] of Object.entries(playerData.equippedItems || {})) {
        if (!item) continue;
        if (item.type !== 'tool' || item.slot !== 'mining') continue;

        const miningAbility = item.abilities?.find(a => a.name === 'mining');
        if (miningAbility) {
            const currentPower = miningAbility.powerlevel || miningAbility.power || 0;
            const bestPower = bestPickaxe?.abilities?.find(a => a.name === 'mining')?.powerlevel || 
                                bestPickaxe?.abilities?.find(a => a.name === 'mining')?.power || 0;
            
            if (!bestPickaxe || currentPower > bestPower) {
                let itemId = item.itemId || item.id || key;
                bestPickaxe = { ...item, itemId: itemId };
            }
        }
    }
    
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
            // Only check tiles that are within bounds
            if (adj.y >= 0 && adj.y < mapData.height && 
                adj.x >= 0 && adj.x < mapData.width) {
                
                const tile = mapData.tiles[adj.y][adj.x];
                if (tile && (tile.type === TILE_TYPES.WALL_WITH_ORE || 
                           tile.type === TILE_TYPES.RARE_ORE ||
                           tile.type === TILE_TYPES.TREASURE_CHEST)) {
                    adjacentTarget = { ...adj, tile };
                    break;
                }
            }
        }
        
        // Mining logic
        if (adjacentTarget) {
            const tile = adjacentTarget.tile;
            if (await canBreakTile(member.id, miningPower, tile)) {
                const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, tile.type);
                
                await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                
                // Make sure the adjacent tile is within bounds before mining
                if (adjacentTarget.y >= 0 && adjacentTarget.y < mapData.height && 
                    adjacentTarget.x >= 0 && adjacentTarget.x < mapData.width) {
                    mapData.tiles[adjacentTarget.y][adjacentTarget.x] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                } else {
                    // Adjacent tile is out of bounds, skip mining
                    continue;
                }
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
                
                // Check for pickaxe durability
                if (bestPickaxe) {
                    const durabilityCheck = checkPickaxeBreak(bestPickaxe, tile.hardness);
                    if (durabilityCheck.shouldBreak) {
                        transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                        eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered!`);
                        eventLogs.push(findMessage);
                    } else {
                        // Update durability in transaction
                        transaction.updatePickaxeDurability(member.id, bestPickaxe.itemId, durabilityCheck.newDurability);
                        
                        // Add durability warning if low
                        const maxDurability = bestPickaxe.durability || 100;
                        const durabilityPercent = (durabilityCheck.newDurability / maxDurability) * 100;
                        
                        if (durabilityPercent <= 10) {
                            eventLogs.push(`${findMessage} ⚠️ [${bestPickaxe.name}: ${durabilityCheck.newDurability}/${maxDurability} durability]`);
                        } else if (durabilityPercent <= 25) {
                            eventLogs.push(`${findMessage} [${bestPickaxe.name}: ${durabilityCheck.newDurability}/${maxDurability} durability]`);
                        } else {
                            eventLogs.push(findMessage);
                        }
                    }
                } else {
                    eventLogs.push(findMessage);
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
            const now = Date.now();
            const seed = createPlayerSeed(dbEntry.channelId, member.id) + Math.floor(now / 30000) + actionNum;
            direction = getRandomDirection(seed);
        }
        
        if (direction.dx === 0 && direction.dy === 0) continue;
        
        const newX = position.x + direction.dx;
        const newY = position.y + direction.dy;
        
        // First, try to expand the map if needed
        const expandedMap = checkMapExpansion(mapData, newX, newY, dbEntry.channelId);
        if (expandedMap !== mapData) {
            mapData = expandedMap;
            mapChanged = true;
        }
        
        // After expansion (or if expansion failed), check if position is valid
        // If the new position is out of bounds, don't move
        if (newX < 0 || newX >= mapData.width || newY < 0 || newY >= mapData.height) {
            continue; // Skip this movement - can't go out of bounds
        }
        
        const targetTile = mapData.tiles[newY] && mapData.tiles[newY][newX];
        if (!targetTile) continue;
        
        // Enhanced wall breaking
        if (targetTile.type === TILE_TYPES.WALL || 
            targetTile.type === TILE_TYPES.REINFORCED_WALL ||
            targetTile.type === TILE_TYPES.WALL_WITH_ORE ||
            targetTile.type === TILE_TYPES.RARE_ORE ||
            targetTile.type === TILE_TYPES.TREASURE_CHEST) {
            
            const canBreak = await canBreakTile(member.id, miningPower, targetTile);
            if (canBreak) {
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
                    
                    if (bestPickaxe) {
                        const durabilityCheck = checkPickaxeBreak(bestPickaxe, targetTile.hardness);
                        if (durabilityCheck.shouldBreak) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered!`);
                            eventLogs.push(findMessage);
                        } else {
                            // Update durability in transaction
                            transaction.updatePickaxeDurability(member.id, bestPickaxe.itemId, durabilityCheck.newDurability);
                            
                            // Add durability warning if low
                            const maxDurability = bestPickaxe.durability || 100;
                            const durabilityPercent = (durabilityCheck.newDurability / maxDurability) * 100;
                            
                            if (durabilityPercent <= 10) {
                                eventLogs.push(`${findMessage} ⚠️ [${bestPickaxe.name}: ${durabilityCheck.newDurability}/${maxDurability} durability]`);
                            } else if (durabilityPercent <= 25) {
                                eventLogs.push(`${findMessage} [${bestPickaxe.name}: ${durabilityCheck.newDurability}/${maxDurability} durability]`);
                            } else {
                                eventLogs.push(findMessage);
                            }
                        }
                    } else {
                        eventLogs.push(findMessage);
                    }
                } else {
                    const tileTypeNames = {
                        [TILE_TYPES.WALL]: 'wall',
                        [TILE_TYPES.REINFORCED_WALL]: 'reinforced wall',
                        [TILE_TYPES.WALL_WITH_ORE]: 'ore wall',
                        [TILE_TYPES.RARE_ORE]: 'rare ore vein'
                    };
                    
                    // Check pickaxe durability for regular wall breaking
                    if (bestPickaxe) {
                        const durabilityCheck = checkPickaxeBreak(bestPickaxe, targetTile.hardness);
                        if (durabilityCheck.shouldBreak) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName} broke through ${tileTypeNames[targetTile.type] || 'wall'} but their ${bestPickaxe.name} shattered!`);
                        } else {
                            transaction.updatePickaxeDurability(member.id, bestPickaxe.itemId, durabilityCheck.newDurability);
                            
                            const maxDurability = bestPickaxe.durability || 100;
                            const durabilityPercent = (durabilityCheck.newDurability / maxDurability) * 100;
                            
                            if (durabilityPercent <= 10) {
                                eventLogs.push(`${member.displayName} broke through ${tileTypeNames[targetTile.type] || 'wall'}! ⚠️ [${bestPickaxe.name}: ${durabilityCheck.newDurability}/${maxDurability}]`);
                            } else if (durabilityPercent <= 25) {
                                eventLogs.push(`${member.displayName} broke through ${tileTypeNames[targetTile.type] || 'wall'}! [${bestPickaxe.name}: ${durabilityCheck.newDurability}/${maxDurability}]`);
                            } else {
                                eventLogs.push(`${member.displayName} broke through ${tileTypeNames[targetTile.type] || 'wall'}!`);
                            }
                        }
                    } else {
                        eventLogs.push(`${member.displayName} broke through ${tileTypeNames[targetTile.type] || 'wall'}!`);
                    }
                }
                
                // Convert to floor and move player
                mapData.tiles[newY][newX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                position.x = newX;
                position.y = newY;
                mapChanged = true;
                wallsBroken++;
            } else {
                // Failed to break wall - DON'T MOVE THE PLAYER
                if (miningPower <= 0) {
                    if (Math.random() < 0.001) {
                        eventLogs.push(`🔥 ${member.displayName} broke through with sheer willpower!`);
                        mapData.tiles[newY][newX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                        position.x = newX;
                        position.y = newY;
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
                    
                    if (bestPickaxe) {
                        const durabilityCheck = checkPickaxeBreak(bestPickaxe, targetTile.hardness);
                        if (durabilityCheck.shouldBreak) {
                            transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                            eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered from the impact`);
                        } else {
                            // Update durability even on failed breaks
                            transaction.updatePickaxeDurability(member.id, bestPickaxe.itemId, durabilityCheck.newDurability);
                        }
                    }
                }
            }
        } else if (targetTile.type === TILE_TYPES.HAZARD) {
            mapData.tiles[newY][newX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
            
            // Handle hazard tiles
            if (Math.random() < 0.7) {
                eventLogs.push(`⚠️ ${member.displayName} avoided a dangerous hazard`);
                position.x = newX;
                position.y = newY;
                mapChanged = true;
            } else {
                eventLogs.push(`💥 ${member.displayName} triggered a hazard and was sent back to the entrance!!`);
                // Send back to entrance
                position.x = mapData.entranceX;
                position.y = mapData.entranceY;
                mapChanged = true;
            }
        } else if (targetTile.type === TILE_TYPES.FLOOR || targetTile.type === TILE_TYPES.ENTRANCE) {
            // Free movement ONLY on floor/entrance tiles
            position.x = newX;
            position.y = newY;
            mapChanged = true;
            
            // Enhanced exploration rewards
            if (Math.random() < EXPLORATION_BONUS_CHANCE) {
                const bonusItem = pickWeightedItem(1, TILE_TYPES.WALL_WITH_ORE);
                eventLogs.push(`🔍 ${member.displayName} found ${bonusItem.name} while exploring!`);
                await addItemToMinecart(dbEntry, member.id, bonusItem.itemId, 1);
            }
        }
    }
    
    return { mapChanged, wallsBroken, treasuresFound };
}

// Export utility functions for testing
module.exports.pickWeightedItem = pickWeightedItem;
module.exports.calculateTeamVisibility = calculateTeamVisibility;
module.exports.getMinecartSummary = getMinecartSummary;
module.exports.TILE_TYPES = TILE_TYPES;

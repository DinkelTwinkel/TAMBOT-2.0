// mining_optimized_v5_performance.js - Power Level Integrated Mining System
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
const generateTileMapImage = require('../generateMiningProcedural');
const gachaVC = require('../../models/activevcs');

// Import enhanced power level components
const { 
    IMAGE_GENERATION_INTERVAL, 
    MAX_SPEED_ACTIONS, 
    EXPLORATION_BONUS_CHANCE,
    TILE_TYPES,
    POWER_LEVEL_CONFIG,
    SERVER_POWER_MODIFIERS,
    calculateMiningEfficiency,
    getAvailableItems,
    getAvailableTreasures,
    miningItemPool,
    treasureItems
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

// Performance: Reduce image generation frequency based on power level
const REDUCED_IMAGE_INTERVAL = 1;

// TIMING CONFIGURATION
const MINING_DURATION = 25 * 60 * 1000; // 25 minutes
const SHORT_BREAK_DURATION = 5 * 60 * 1000; // 5 minutes
const LONG_BREAK_DURATION = 25 * 60 * 1000; // 25 minutes
const LONG_EVENT_DURATION = 15 * 60 * 1000; // 15 minutes of long break for event

// Performance: Cache database entries
const dbCache = new Map();
const DB_CACHE_TTL = 30000; // 30 seconds

// Power level efficiency cache
const efficiencyCache = new Map();

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

// Enhanced function to get server modifiers based on gacha server name
function getServerModifiers(serverName, serverPower) {
    // Convert server name to server key for lookup
    const nameToKey = {
        "Coal Mines": "coalMines",
        "Copper Quarry": "copperQuarry", 
        "Topaz Mine": "topazMine",
        "Iron Stronghold": "ironStronghold",
        "Diamond Mines": "diamondMines",
        "Emerald Caverns": "emeraldCaverns",
        "Ruby Depths": "rubyDepths",
        "Crystal Grottos": "crystalGrottos",
        "Obsidian Forge": "obsidianForge",
        "Mythril Sanctum": "mythrilSanctum",
        "Adamantite Abyss": "adamantiteAbyss"
    };
    
    // Clean server name (remove emojis and extra spaces)
    const cleanName = serverName.replace(/⛏️|️/g, '').trim();
    const serverKey = nameToKey[cleanName];
    
    if (serverKey && SERVER_POWER_MODIFIERS[serverKey]) {
        return SERVER_POWER_MODIFIERS[serverKey];
    }
    
    // Fallback: create default modifier based on power level
    return {
        powerLevel: serverPower || 1,
        specialBonus: "Standard mining efficiency",
        itemBonuses: {}
    };
}

// Enhanced mining efficiency calculation with caching
function getCachedMiningEfficiency(serverPowerLevel, playerLevel = 1, serverModifiers = null) {
    const cacheKey = `${serverPowerLevel}-${playerLevel}`;
    
    if (efficiencyCache.has(cacheKey)) {
        const cached = efficiencyCache.get(cacheKey);
        return applyServerModifiers(cached, serverModifiers);
    }
    
    const efficiency = calculateMiningEfficiency(serverPowerLevel, playerLevel);
    efficiencyCache.set(cacheKey, efficiency);
    
    return applyServerModifiers(efficiency, serverModifiers);
}

// Apply server-specific modifiers to mining efficiency
function applyServerModifiers(efficiency, serverModifiers) {
    if (!serverModifiers) return efficiency;
    
    return {
        ...efficiency,
        // Server modifiers can enhance base efficiency
        oreSpawnChance: efficiency.oreSpawnChance * 1.1, // 10% server bonus
        rareOreChance: efficiency.rareOreChance * 1.1,
        treasureChance: efficiency.treasureChance * 1.2, // 20% treasure bonus
        specialBonus: serverModifiers.specialBonus,
        itemBonuses: serverModifiers.itemBonuses
    };
}

// Calculate next break time based on current cycle
function calculateNextBreakTime(dbEntry) {
    const now = Date.now();
    const cycleCount = dbEntry.gameData?.cycleCount || 0;
    
    // Pattern: 3 cycles of (25min mining + 5min break), then 1 cycle of (25min mining + 25min long break)
    const isLongBreakCycle = (cycleCount % 4) === 3;
    
    if (isLongBreakCycle) {
        return {
            nextShopRefresh: new Date(now + MINING_DURATION),
            breakDuration: LONG_BREAK_DURATION,
            isLongBreak: true
        };
    } else {
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
        return { x: mapData.entranceX, y: mapData.entranceY };
    }
    
    return floorTiles[Math.floor(Math.random() * floorTiles.length)];
}

// Scatter players around a central tile
function scatterPlayersAroundTile(members, centerX, centerY, mapData) {
    const positions = {};
    const memberArray = Array.from(members.values());
    
    const offsets = [
        [0, 0], [0, -1], [1, 0], [0, 1], [-1, 0],
        [1, -1], [1, 1], [-1, 1], [-1, -1],
        [0, -2], [2, 0], [0, 2], [-2, 0],
        [2, -1], [2, 1], [1, 2], [-1, 2],
        [-2, 1], [-2, -1], [-1, -2], [1, -2]
    ];
    
    for (let i = 0; i < memberArray.length; i++) {
        const member = memberArray[i];
        const offsetIndex = Math.min(i, offsets.length - 1);
        const [dx, dy] = offsets[offsetIndex];
        
        let finalX = Math.max(0, Math.min(centerX + dx, mapData.width - 1));
        let finalY = Math.max(0, Math.min(centerY + dy, mapData.height - 1));
        
        positions[member.id] = {
            x: finalX,
            y: finalY,
            isTent: true
        };
    }
    
    return positions;
}

// Enhanced mining system with power level filtering
async function mineFromTile(member, miningPower, luckStat, powerLevel, tileType, availableItems, efficiency) {
    // Filter items by power level and tile type
    let eligibleItems = availableItems.filter(item => {
        if (tileType === TILE_TYPES.TREASURE_CHEST) {
            // For treasure chests, use treasure items or rare mining items
            return item.tier === 'epic' || item.tier === 'legendary';
        } else if (tileType === TILE_TYPES.RARE_ORE) {
            // For rare ore, prefer rare+ items
            return item.tier === 'rare' || item.tier === 'epic' || item.tier === 'legendary';
        } else {
            // For regular ore walls, any available item
            return true;
        }
    });
    
    if (eligibleItems.length === 0) {
        eligibleItems = availableItems; // Fallback to all available items
    }
    
    // Select item using weighted probability
    const totalWeight = eligibleItems.reduce((sum, item) => sum + item.baseWeight, 0);
    let random = Math.random() * totalWeight;
    
    let selectedItem = eligibleItems[0];
    for (const item of eligibleItems) {
        random -= item.baseWeight;
        if (random <= 0) {
            selectedItem = item;
            break;
        }
    }
    
    // Calculate quantity with power level bonuses
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
    
    // Apply tile type multipliers
    if (tileType === TILE_TYPES.RARE_ORE) {
        quantity *= 2;
    } else if (tileType === TILE_TYPES.TREASURE_CHEST) {
        quantity = Math.max(quantity, 3);
    }
    
    // Apply power level value multiplier
    const enhancedValue = Math.floor(selectedItem.value * efficiency.valueMultiplier);
    
    return { 
        item: { ...selectedItem, value: enhancedValue }, 
        quantity 
    };
}

// Enhanced treasure generation with power level requirements
async function generateTreasure(powerLevel, efficiency) {
    const availableTreasures = getAvailableTreasures(powerLevel);
    
    if (Math.random() < efficiency.treasureChance && availableTreasures.length > 0) {
        const treasure = availableTreasures[Math.floor(Math.random() * availableTreasures.length)];
        const enhancedValue = Math.floor(treasure.value * efficiency.valueMultiplier);
        
        return {
            ...treasure,
            value: enhancedValue
        };
    }
    
    return null;
}

// Optimized Event Log System with power level display
async function logEvent(channel, eventText, forceNew = false, powerLevelInfo = null) {
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
        endTimestamp = Math.floor(breakEndTime / 1000);

        if (result.gameData.breakInfo.isLongBreak) {
            timeStatus = result.gameData?.specialEvent ? "LONG BREAK (EVENT)" : "LONG BREAK (SHOP)";
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
            if (message.embeds.length > 0 && message.embeds[0].title?.includes('MINING MAP') && message.author.bot) {
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
            // Enhanced title with power level info
            let titleText = endTimestamp
                ? `🗺️ MINING MAP | ${timeStatus} ends <t:${endTimestamp}:R>`
                : `🗺️ MINING MAP | ${timeStatus}`;
                
            if (powerLevelInfo) {
                titleText += ` | ${powerLevelInfo.name} (Lv.${powerLevelInfo.level})`;
            }

            const embed = new EmbedBuilder()
                .setTitle(titleText)
                .setColor(0x8B4513)
                .setFooter({ 
                    text: `MINECART: ${minecartSummary.summary}`
                })
                .setTimestamp();

            // Add power level description if available
            if (powerLevelInfo && forceNew) {
                let description = logEntry ? `\`\`\`\n${logEntry}\n\`\`\`` : '';
                if (powerLevelInfo.specialBonus) {
                    description += `\n🎯 **${powerLevelInfo.specialBonus}**`;
                }
                if (description) {
                    embed.setDescription(description);
                }
            } else if (logEntry) {
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

                if (newDescription && newDescription.length > 4000) {
                    const newEmbed = new EmbedBuilder()
                        .setTitle(titleText)
                        .setColor(0x8B4513)
                        .setFooter({ text: `MINECART: ${minecartSummary.summary}` })
                        .setTimestamp();

                    if (logEntry) newEmbed.setDescription('```\n' + logEntry + '\n```');

                    await channel.send({ 
                        embeds: [newEmbed], 
                        files: attachment ? [attachment] : [] 
                    });
                    return;
                }

                const updatedEmbed = new EmbedBuilder()
                    .setTitle(titleText)
                    .setColor(0x8B4513)
                    .setFooter({ text: `MINECART: ${minecartSummary.summary}` })
                    .setTimestamp();

                if (newDescription) updatedEmbed.setDescription(newDescription);

                await eventLogMessage.edit({ 
                    embeds: [updatedEmbed], 
                    files: attachment ? [attachment] : [] 
                });
                return;
            }

            await channel.send({ 
                embeds: [embed], 
                files: attachment ? [attachment] : [] 
            });
        }

    } catch (error) {
        console.error('Error updating mining map:', error);
        if (eventText) await channel.send(`\`${logEntry}\``);
    }
}

// Handle break start with power level considerations
async function startBreak(channel, dbEntry, isLongBreak = false, powerLevel = 1) {
    const now = Date.now();
    const members = channel.members.filter(m => !m.user.bot);
    
    if (isLongBreak) {
        // Long break - enhanced for higher power levels
        const breakEndTime = now + LONG_BREAK_DURATION;
        const eventEndTime = now + LONG_EVENT_DURATION;
        
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
        
        const mapData = dbEntry.gameData.map;
        const updatedPositions = {};
        for (const member of members.values()) {
            updatedPositions[member.id] = {
                x: mapData.entranceX,
                y: mapData.entranceY,
                hidden: true
            };
        }
        
        batchDB.queueUpdate(channel.id, { 'gameData.map.playerPositions': updatedPositions });
        await batchDB.flush();
        
        const updatedDbEntry = await getCachedDBEntry(channel.id, true);
        const playerCount = members.size;
        const selectedEvent = pickLongBreakEvent(playerCount);
        const eventResult = await selectedEvent(channel, updatedDbEntry);
        
        const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
        await logEvent(channel, `🎪 LONG BREAK: ${eventResult || 'Event started'}`, true, {
            level: powerLevel,
            name: powerLevelConfig?.name || 'Unknown Miner',
            specialBonus: `Power Level ${powerLevel} Event`
        });
        
        setTimeout(async () => {
            const refreshedEntry = await getCachedDBEntry(channel.id, true);
            if (refreshedEntry.gameData?.breakInfo?.inBreak) {
                await generateShop(channel, 10);
                await logEvent(channel, '🛒 Event ended! Shop is now open!', true);
            }
        }, LONG_EVENT_DURATION);
        
    } else {
        // Short break
        const breakEndTime = now + SHORT_BREAK_DURATION;
        const mapData = dbEntry.gameData.map;
        const gatherPoint = getRandomFloorTile(mapData);
        const scatteredPositions = scatterPlayersAroundTile(members, gatherPoint.x, gatherPoint.y, mapData);
        
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
        await generateShop(channel, 5);
        await logEvent(channel, `⛺ SHORT BREAK: Players camping at (${gatherPoint.x}, ${gatherPoint.y}). Shop open!`, true);
    }
}

// Handle break end with power level considerations
async function endBreak(channel, dbEntry, powerLevel = 1) {
    const mapData = dbEntry.gameData.map;
    const members = channel.members.filter(m => !m.user.bot);
    const breakInfo = dbEntry.gameData.breakInfo;
    
    const resetPositions = {};
    
    if (breakInfo.isLongBreak) {
        for (const member of members.values()) {
            resetPositions[member.id] = {
                x: mapData.entranceX,
                y: mapData.entranceY,
                isTent: false,
                hidden: false
            };
        }
    } else {
        const currentPositions = mapData.playerPositions || {};
        for (const member of members.values()) {
            const currentPos = currentPositions[member.id];
            resetPositions[member.id] = currentPos ? {
                x: currentPos.x,
                y: currentPos.y,
                isTent: false,
                hidden: false
            } : {
                x: mapData.entranceX,
                y: mapData.entranceY,
                isTent: false,
                hidden: false
            };
        }
    }
    
    const cycleCount = (dbEntry.gameData?.cycleCount || 0) + 1;
    const nextBreakInfo = calculateNextBreakTime({ gameData: { cycleCount } });
    
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
    
    visibilityCalculator.invalidate();
    dbCache.delete(channel.id);
    
    const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
    await logEvent(channel, '⛏️ Break ended! Mining resumed.', true, {
        level: powerLevel,
        name: powerLevelConfig?.name || 'Unknown Miner',
        specialBonus: powerLevelConfig?.description || 'Mining efficiency active'
    });
}

// Main Mining Event - Enhanced with Full Power Level Integration
module.exports = async (channel, dbEntry, json, client) => {
    const now = Date.now();
    
    initializeGameData(dbEntry, channel.id);
    await dbEntry.save();

    if (!channel?.isVoiceBased()) return;
    const members = channel.members.filter(m => !m.user.bot);
    if (!members.size) return;

    // Enhanced power level detection
    const serverPowerLevel = json.power || 1;
    const serverName = json.name || 'Unknown Mine';
    const serverModifiers = getServerModifiers(serverName, serverPowerLevel);
    
    console.log(`[MINING] Power Level ${serverPowerLevel} detected for ${serverName}`);
    console.log(`[MINING] Server modifiers:`, serverModifiers);

    // Check if we're in a break period
    const inBreak = isBreakPeriod(dbEntry);
    
    if (inBreak) {
        const breakInfo = dbEntry.gameData.breakInfo;
        
        if (now >= breakInfo.breakEndTime) {
            await endBreak(channel, dbEntry, serverPowerLevel);
            return;
        }
        
        if (breakInfo.isLongBreak && dbEntry.gameData?.specialEvent) {
            const specialEvent = dbEntry.gameData.specialEvent;
            if (now >= specialEvent.endTime) {
                const eventEndResult = await checkAndEndSpecialEvent(channel, dbEntry);
                if (eventEndResult) {
                    await logEvent(channel, eventEndResult, true);
                }
            }
        }
        
        return;
    }

    // Check if it's time to start a break
    if (now >= dbEntry.nextShopRefresh) {
        const cycleCount = dbEntry.gameData?.cycleCount || 0;
        const isLongBreak = (cycleCount % 4) === 3;
        
        await createMiningSummary(channel, dbEntry);
        await startBreak(channel, dbEntry, isLongBreak, serverPowerLevel);
        return;
    }

    // Enhanced mining logic with power level integration
    const memberIds = Array.from(members.keys());
    const playerStatsMap = await playerStatsCache.getMultiple(memberIds);

    // Get available items and efficiency based on power level
    const availableItems = getAvailableItems(serverPowerLevel);
    const availableTreasures = getAvailableTreasures(serverPowerLevel);
    
    console.log(`[MINING] Available items for power level ${serverPowerLevel}:`, availableItems.length);
    console.log(`[MINING] Available treasures for power level ${serverPowerLevel}:`, availableTreasures.length);

    let mapData = dbEntry.gameData.map;
    let mapChanged = false;
    const transaction = new DatabaseTransaction();
    const eventLogs = [];
    let wallsBroken = 0;
    let treasuresFound = 0;
    
    if (!mapData) {
        mapData = initializeMap(channel.id);
        mapChanged = true;
    }

    mapData = initializeBreakPositions(mapData, members, false);
    mapChanged = true;
    
    // Announce new players
    for (const member of members.values()) {
        if (!announcedUsers.has(member.id)) {
            announcedUsers.add(member.id);
            const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
            eventLogs.push(`👋 ${member.displayName} joined as ${powerLevelConfig?.name || 'Miner'}!`);
        }
    }

    const currentPlayerIds = Array.from(members.keys());
    mapData = cleanupPlayerPositions(mapData, currentPlayerIds);

    // Calculate team sight radius with power level bonuses
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
        
        // Power level bonus to sight
        const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
        if (powerLevelConfig) {
            teamSightRadius = Math.floor(teamSightRadius * powerLevelConfig.speedBonus);
        }
    }

    let teamVisibleTiles = visibilityCalculator.calculateTeamVisibility(
        mapData.playerPositions, 
        teamSightRadius, 
        mapData.tiles
    );
    
    // Mark visible tiles as discovered
    for (const tileKey of teamVisibleTiles) {
        const [x, y] = tileKey.split(',').map(Number);
        if (mapData.tiles[y] && mapData.tiles[y][x] && !mapData.tiles[y][x].discovered) {
            mapData.tiles[y][x].discovered = true;
            mapChanged = true;
        }
    }

    // Process actions for each player with power level enhancements
    for (const member of members.values()) {
        const playerData = playerStatsMap.get(member.id);
        const playerLevel = playerData.level || 1;
        
        // Get mining efficiency with power level and server modifiers
        const efficiency = getCachedMiningEfficiency(serverPowerLevel, playerLevel, serverModifiers);
        
        const result = await processPlayerActionsEnhanced(
            member, 
            playerData, 
            mapData, 
            teamVisibleTiles, 
            serverPowerLevel,
            availableItems,
            availableTreasures,
            efficiency,
            serverModifiers,
            transaction,
            eventLogs,
            dbEntry
        );
        
        if (result.mapChanged) {
            mapChanged = true;
            if (result.mapData) {
                mapData = result.mapData;
                teamVisibleTiles = visibilityCalculator.calculateTeamVisibility(
                    mapData.playerPositions, 
                    teamSightRadius, 
                    mapData.tiles
                );
            }
        }
        wallsBroken += result.wallsBroken;
        treasuresFound += result.treasuresFound;
    }

    // Update session statistics
    if (wallsBroken > 0 || treasuresFound > 0) {
        batchDB.queueUpdate(channel.id, {
            'gameData.stats.wallsBroken': dbEntry.gameData.stats.wallsBroken + wallsBroken,
            'gameData.stats.treasuresFound': dbEntry.gameData.stats.treasuresFound + treasuresFound
        });
    }

    // Commit changes
    if (mapChanged) {
        console.log(`[MINING] Map changed for channel ${channel.id} (Power Level ${serverPowerLevel})`);
        console.log(`[MINING] Final map size: ${mapData.width}x${mapData.height}`);
        
        visibilityCalculator.invalidate();
        transaction.setMapUpdate(channel.id, mapData);
        
        const { clearOreCache } = require('./mining/miningUtils');
        clearOreCache();
    }
    
    try {
        await transaction.commit();
        if (mapChanged) {
            console.log(`[MINING] Map update committed successfully for channel ${channel.id}`);
        }
    } catch (error) {
        console.error(`[MINING] Error committing transaction for channel ${channel.id}:`, error);
    }
    
    await batchDB.flush();
    
    if (mapChanged) {
        dbCache.delete(channel.id);
    }

    // Enhanced event logging with power level info
    const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
    const powerLevelInfo = {
        level: serverPowerLevel,
        name: powerLevelConfig?.name || 'Unknown Miner',
        specialBonus: serverModifiers.specialBonus
    };

    if (eventLogs.length > 0) {
        const combinedEvents = eventLogs.join(' | ');
        await logEvent(channel, combinedEvents, false, powerLevelInfo);
    } else {
        await logEvent(channel, '', false, powerLevelInfo);
    }
};

// Enhanced player action processing with full power level integration
async function processPlayerActionsEnhanced(member, playerData, mapData, teamVisibleTiles, powerLevel, availableItems, availableTreasures, efficiency, serverModifiers, transaction, eventLogs, dbEntry) {
    const miningPower = playerData.stats.mining || 0;
    const luckStat = playerData.stats.luck || 0;
    const speedStat = Math.min(playerData.stats.speed || 1, MAX_SPEED_ACTIONS);
    
    let wallsBroken = 0;
    let treasuresFound = 0;
    let mapChanged = false;
    
    // Find best pickaxe
    let bestPickaxe = null;
    for (const [key, item] of Object.entries(playerData.equippedItems || {})) {
        if (!item || item.type !== 'tool' || item.slot !== 'mining') continue;

        const miningAbility = item.abilities?.find(a => a.name === 'mining');
        if (miningAbility) {
            const currentPower = miningAbility.powerlevel || miningAbility.power || 0;
            const bestPower = bestPickaxe?.abilities?.find(a => a.name === 'mining')?.powerlevel || 
                                bestPickaxe?.abilities?.find(a => a.name === 'mining')?.power || 0;
            
            if (!bestPickaxe || currentPower > bestPower) {
                bestPickaxe = { ...item, itemId: item.itemId || item.id || key };
            }
        }
    }
    
    // Apply power level speed bonus
    const enhancedSpeed = Math.floor(speedStat * efficiency.speedMultiplier);
    const numActions = enhancedSpeed > 0 ? Math.floor(Math.random() * enhancedSpeed) + 1 : 1;
    
    for (let actionNum = 0; actionNum < numActions; actionNum++) {
        const position = mapData.playerPositions[member.id];
        if (!position) break;
        
        // Enhanced treasure generation with power level
        if (Math.random() < efficiency.treasureChance) {
            const treasure = await generateTreasure(powerLevel, efficiency);
            if (treasure) {
                await addItemToMinecart(dbEntry, member.id, treasure.itemId, 1);
                eventLogs.push(`🎁 ${member.displayName} discovered ${treasure.name} while exploring!`);
                treasuresFound++;
            }
        }
        
        // Check adjacent tiles for mining (same logic as before but with enhanced items)
        const adjacentPositions = [
            { x: position.x, y: position.y - 1 },
            { x: position.x + 1, y: position.y },
            { x: position.x, y: position.y + 1 },
            { x: position.x - 1, y: position.y }
        ];
        
        let adjacentTarget = null;
        for (const adj of adjacentPositions) {
            let checkX = adj.x, checkY = adj.y;
            
            if (checkX < 0 || checkX >= mapData.width || checkY < 0 || checkY >= mapData.height) {
                const expandedMap = checkMapExpansion(mapData, checkX, checkY, dbEntry.channelId);
                if (expandedMap !== mapData) {
                    mapData = expandedMap;
                    mapChanged = true;
                    eventLogs.push(`🗺️ MAP EXPANDED! New size: ${expandedMap.width}x${expandedMap.height}`);
                }
            }
            
            if (checkY >= 0 && checkY < mapData.height && checkX >= 0 && checkX < mapData.width) {
                const tile = mapData.tiles[checkY][checkX];
                if (tile && (tile.type === TILE_TYPES.WALL_WITH_ORE || 
                           tile.type === TILE_TYPES.RARE_ORE ||
                           tile.type === TILE_TYPES.TREASURE_CHEST)) {
                    adjacentTarget = { x: checkX, y: checkY, tile };
                    break;
                }
            }
        }
        
        // Enhanced mining logic with power level items
        if (adjacentTarget) {
            const tile = adjacentTarget.tile;
            if (await canBreakTile(member.id, miningPower, tile)) {
                const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, tile.type, availableItems, efficiency);
                
                // Apply server-specific item bonuses
                let finalQuantity = quantity;
                let finalValue = item.value;
                
                if (serverModifiers.itemBonuses && serverModifiers.itemBonuses[item.itemId]) {
                    const bonus = serverModifiers.itemBonuses[item.itemId];
                    finalQuantity = Math.floor(quantity * bonus);
                    finalValue = Math.floor(item.value * bonus);
                }
                
                await addItemToMinecart(dbEntry, member.id, item.itemId, finalQuantity);
                
                mapData.tiles[adjacentTarget.y][adjacentTarget.x] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                mapChanged = true;
                wallsBroken++;
                
                let findMessage;
                if (tile.type === TILE_TYPES.TREASURE_CHEST) {
                    findMessage = `🏆 ${member.displayName} discovered treasure! Found ${item.name} x${finalQuantity}! (${finalValue} value)`;
                    treasuresFound++;
                } else if (tile.type === TILE_TYPES.RARE_ORE) {
                    findMessage = `✨ ${member.displayName} struck rare ore! Found ${item.name} x${finalQuantity}! (${finalValue} value)`;
                } else {
                    findMessage = `💎 ${member.displayName} found ${item.name} x${finalQuantity} (${finalValue} value)`;
                }
                
                if (bestPickaxe) {
                    const durabilityCheck = checkPickaxeBreak(bestPickaxe, tile.hardness);
                    if (durabilityCheck.shouldBreak) {
                        transaction.addPickaxeBreak(member.id, member.user.tag, bestPickaxe);
                        eventLogs.push(`${member.displayName}'s ${bestPickaxe.name} shattered!`);
                    } else {
                        transaction.updatePickaxeDurability(member.id, bestPickaxe.itemId, durabilityCheck.newDurability);
                        
                        const maxDurability = bestPickaxe.durability || 100;
                        const durabilityPercent = (durabilityCheck.newDurability / maxDurability) * 100;
                        
                        if (durabilityPercent <= 10) {
                            findMessage += ` ⚠️ [${bestPickaxe.name}: ${durabilityCheck.newDurability}/${maxDurability}]`;
                        }
                    }
                }
                
                eventLogs.push(findMessage);
            }
            continue;
        }
        
        // Enhanced pathfinding and movement (same logic as before)
        const visibleTargets = [TILE_TYPES.TREASURE_CHEST, TILE_TYPES.RARE_ORE, TILE_TYPES.WALL_WITH_ORE];
        const nearestTarget = findNearestTarget(position, teamVisibleTiles, mapData.tiles, visibleTargets);
        
        let direction;
        if (nearestTarget) {
            direction = getDirectionToTarget(position, nearestTarget);
        } else {
            const seed = createPlayerSeed(dbEntry.channelId, member.id) + Math.floor(Date.now() / 30000) + actionNum;
            direction = getRandomDirection(seed);
        }
        
        if (direction.dx === 0 && direction.dy === 0) continue;
        
        let newX = position.x + direction.dx;
        let newY = position.y + direction.dy;
        
        const expandedMap = checkMapExpansion(mapData, newX, newY, dbEntry.channelId);
        if (expandedMap !== mapData) {
            mapData = expandedMap;
            mapChanged = true;
            eventLogs.push(`🗺️ MAP EXPANDED! New size: ${expandedMap.width}x${expandedMap.height}`);
        }
        
        if (newX < 0 || newX >= mapData.width || newY < 0 || newY >= mapData.height) continue;
        
        const targetTile = mapData.tiles[newY] && mapData.tiles[newY][newX];
        if (!targetTile) continue;
        
        // Handle different tile types (same logic as before but with enhanced messaging)
        if ([TILE_TYPES.WALL, TILE_TYPES.REINFORCED_WALL, TILE_TYPES.WALL_WITH_ORE, TILE_TYPES.RARE_ORE, TILE_TYPES.TREASURE_CHEST].includes(targetTile.type)) {
            const canBreak = await canBreakTile(member.id, miningPower, targetTile);
            if (canBreak) {
                if ([TILE_TYPES.WALL_WITH_ORE, TILE_TYPES.RARE_ORE, TILE_TYPES.TREASURE_CHEST].includes(targetTile.type)) {
                    const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, targetTile.type, availableItems, efficiency);
                    
                    // Apply server bonuses
                    let finalQuantity = quantity;
                    if (serverModifiers.itemBonuses && serverModifiers.itemBonuses[item.itemId]) {
                        finalQuantity = Math.floor(quantity * serverModifiers.itemBonuses[item.itemId]);
                    }
                    
                    await addItemToMinecart(dbEntry, member.id, item.itemId, finalQuantity);
                    
                    let findMessage;
                    if (targetTile.type === TILE_TYPES.TREASURE_CHEST) {
                        findMessage = `🏆 ${member.displayName} opened treasure! Found ${item.name} x${finalQuantity}!`;
                        treasuresFound++;
                    } else if (targetTile.type === TILE_TYPES.RARE_ORE) {
                        findMessage = `✨ ${member.displayName} mined rare ore! Found ${item.name} x${finalQuantity}!`;
                    } else {
                        findMessage = `💎 ${member.displayName} found ${item.name} x${finalQuantity}`;
                    }
                    
                    eventLogs.push(findMessage);
                }
                
                mapData.tiles[newY][newX] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                position.x = newX;
                position.y = newY;
                mapChanged = true;
                wallsBroken++;
            }
        } else if (targetTile.type === TILE_TYPES.FLOOR || targetTile.type === TILE_TYPES.ENTRANCE) {
            position.x = newX;
            position.y = newY;
            mapChanged = true;
            
            // Enhanced exploration rewards with power level
            if (Math.random() < EXPLORATION_BONUS_CHANCE * efficiency.speedMultiplier) {
                const bonusItems = availableItems.filter(item => item.tier === 'common');
                if (bonusItems.length > 0) {
                    const bonusItem = bonusItems[Math.floor(Math.random() * bonusItems.length)];
                    eventLogs.push(`🔍 ${member.displayName} found ${bonusItem.name} while exploring!`);
                    await addItemToMinecart(dbEntry, member.id, bonusItem.itemId, 1);
                }
            }
        }
    }
    
    return { mapChanged, wallsBroken, treasuresFound, mapData };
}

// Export utility functions for testing
module.exports.mineFromTile = mineFromTile;
module.exports.generateTreasure = generateTreasure;
module.exports.getServerModifiers = getServerModifiers;
module.exports.getCachedMiningEfficiency = getCachedMiningEfficiency;
module.exports.POWER_LEVEL_CONFIG = POWER_LEVEL_CONFIG;
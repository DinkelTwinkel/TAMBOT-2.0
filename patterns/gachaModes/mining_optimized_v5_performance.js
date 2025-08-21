// mining_optimized_v5_performance.js - Power Level Integrated Mining System with Enhanced Reliability
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const generateShop = require('../generateShop');
const getPlayerStats = require('../calculatePlayerStat');
// Use the new layered rendering system with auto-generated images
const generateTileMapImage = require('./mining/imageProcessing/mining-layered-render');
const gachaVC = require('../../models/activevcs');
const { 
    parseUniqueItemBonuses, 
    applyDoubleOreBonus, 
    checkHazardResistance, 
    applyMovementSpeedBonus,
    checkUniquePickaxeBreak,
    applyAreaDamage,
    getChainMiningTargets
} = require('./mining/uniqueItemBonuses');

// Import concurrency control
const { concurrencyManager, messageQueue } = require('./mining_concurrency_fix');

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
    scatterPlayersForBreak,
    startThiefGame,
    calculateMinecartValue
} = require('./mining/miningEvents');

// Import hazard systems
const hazardStorage = require('./mining/hazardStorage');
const hazardEffects = require('./mining/hazardEffects');
const { getHazardSpawnChance } = require('./mining/miningConstants');

// Import performance optimizations
const {
    batchDB,
    playerStatsCache,
    visibilityCalculator,
    messageThrottler,
    eventBatcher
} = require('./mining/miningPerformance');

// Import unique item integration
const { 
    processUniqueItemFinding,
    updateMiningActivity
} = require('./mining/uniqueItemIntegration');

// Global event counter for image generation
let eventCounter = 0;

// Performance: Reduce image generation frequency based on power level
const REDUCED_IMAGE_INTERVAL = 1;

// TIMING CONFIGURATION with fallbacks
const MINING_DURATION = process.env.MINING_DURATION || 25 * 60 * 1000; // 25 minutes
const SHORT_BREAK_DURATION = process.env.SHORT_BREAK_DURATION || 5 * 60 * 1000; // 5 minutes
const LONG_BREAK_DURATION = process.env.LONG_BREAK_DURATION || 20 * 60 * 1000; // 20 minutes (reduced from 25)
const LONG_EVENT_DURATION = process.env.LONG_EVENT_DURATION || 15 * 60 * 1000; // 15 minutes of long break for event
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute health checks
const MAX_PROCESSING_TIME = 120000; // 2 minutes max processing time

// Cache Management Configuration
const MAX_CACHE_SIZE = 100;
const DB_CACHE_TTL = 30000; // 30 seconds
const EFFICIENCY_CACHE_SIZE = 50;

// Performance: Cache database entries with size management
const dbCache = new Map();
const efficiencyCache = new Map();

// Track processing times and health metrics
const healthMetrics = {
    lastProcessed: new Map(), // channelId -> timestamp
    processingErrors: new Map(), // channelId -> error count
    averageProcessingTime: new Map(), // channelId -> avg time
    stuckChannels: new Set()
};

// Track recent movements to prevent straight-line behavior
const playerMovementHistory = new Map();

// Enhanced cache management with size limits
function addToCache(cache, key, value, maxSize = MAX_CACHE_SIZE) {
    if (cache.size >= maxSize) {
        // Remove oldest entry (first in map)
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, value);
}

// Export caches globally for external clearing (needed for rail system)
global.dbCache = dbCache;
global.efficiencyCache = efficiencyCache;
// Proper initialization without race condition
if (typeof visibilityCalculator !== 'undefined') {
    global.visibilityCalculator = visibilityCalculator;
}

// Enhanced error-safe database fetch with retry logic
async function getCachedDBEntry(channelId, forceRefresh = false, retryCount = 0) {
    try {
        const now = Date.now();
        const cached = dbCache.get(channelId);
        
        if (!forceRefresh && cached && (now - cached.timestamp) < DB_CACHE_TTL) {
            return cached.data;
        }
        
        const entry = await gachaVC.findOne({ channelId });
        if (!entry) {
            console.error(`[MINING] No database entry found for channel ${channelId}`);
            return null;
        }
        
        addToCache(dbCache, channelId, { data: entry, timestamp: now });
        return entry;
    } catch (error) {
        console.error(`[MINING] Error fetching DB entry for channel ${channelId}:`, error);
        
        // Retry logic
        if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return getCachedDBEntry(channelId, forceRefresh, retryCount + 1);
        }
        
        return null;
    }
}

// Health check system to detect and recover from stuck states
async function performHealthCheck(channelId) {
    try {
        const debugInfo = concurrencyManager.getDebugInfo();
        const lastProcessed = healthMetrics.lastProcessed.get(channelId);
        const now = Date.now();
        
        // Check if channel has been locked too long
        if (debugInfo.lockedChannels.includes(channelId)) {
            const lockTime = now - (lastProcessed || 0);
            if (lockTime > MAX_PROCESSING_TIME) {
                console.warn(`[HEALTH] Channel ${channelId} locked for ${lockTime}ms, forcing unlock`);
                concurrencyManager.releaseLock(channelId);
                healthMetrics.stuckChannels.add(channelId);
                
                // Clear any intervals for this channel
                concurrencyManager.clearAllIntervalsForChannel(channelId);
                
                return false;
            }
        }
        
        // Check if channel hasn't been processed in too long (stuck)
        if (lastProcessed && (now - lastProcessed) > MINING_DURATION + LONG_BREAK_DURATION) {
            console.warn(`[HEALTH] Channel ${channelId} hasn't been processed in ${(now - lastProcessed) / 1000}s`);
            healthMetrics.stuckChannels.add(channelId);
            
            // Force clear any locks or intervals
            concurrencyManager.releaseLock(channelId);
            concurrencyManager.clearAllIntervalsForChannel(channelId);
            
            return false;
        }
        
        // Check error rate
        const errorCount = healthMetrics.processingErrors.get(channelId) || 0;
        if (errorCount > 5) {
            console.warn(`[HEALTH] Channel ${channelId} has ${errorCount} errors, resetting`);
            healthMetrics.processingErrors.set(channelId, 0);
            healthMetrics.stuckChannels.add(channelId);
            
            return false;
        }
        
        return true;
    } catch (error) {
        console.error(`[HEALTH] Error during health check for channel ${channelId}:`, error);
        return true; // Don't block on health check errors
    }
}

// Auto-recovery system for stuck channels
async function attemptAutoRecovery(channel) {
    try {
        console.log(`[RECOVERY] Attempting auto-recovery for channel ${channel.id}`);
        
        // Clear all state for this channel
        concurrencyManager.releaseLock(channel.id);
        concurrencyManager.clearAllIntervalsForChannel(channel.id);
        dbCache.delete(channel.id);
        healthMetrics.stuckChannels.delete(channel.id);
        healthMetrics.processingErrors.set(channel.id, 0);
        
        // Re-initialize if needed
        const dbEntry = await getCachedDBEntry(channel.id, true);
        if (dbEntry && dbEntry.gameData) {
            console.log(`[RECOVERY] Successfully recovered channel ${channel.id}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`[RECOVERY] Failed to recover channel ${channel.id}:`, error);
        return false;
    }
}

// Enhanced function to get server modifiers based on gacha server name
function getServerModifiers(serverName, serverPower) {
    try {
        // Convert server name to server key for lookup
        const nameToKey = {
            "Coal Mines": "coalMines",
            "Copper Quarry": "copperQuarry", 
            "Topaz Mine": "topazMine",
            "Iron Stronghold": "ironStronghold",
            "Fossil Excavation": "fossilExcavation",
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
    } catch (error) {
        console.error('[MINING] Error getting server modifiers:', error);
        return {
            powerLevel: serverPower || 1,
            specialBonus: "Standard mining efficiency",
            itemBonuses: {}
        };
    }
}

// Enhanced mining efficiency calculation with caching and error handling
function getCachedMiningEfficiency(serverPowerLevel, playerLevel = 1, serverModifiers = null) {
    try {
        const cacheKey = `${serverPowerLevel}-${playerLevel}`;
        
        if (efficiencyCache.has(cacheKey)) {
            const cached = efficiencyCache.get(cacheKey);
            return applyServerModifiers(cached, serverModifiers);
        }
        
        const efficiency = calculateMiningEfficiency(serverPowerLevel, playerLevel);
        addToCache(efficiencyCache, cacheKey, efficiency, EFFICIENCY_CACHE_SIZE);
        
        return applyServerModifiers(efficiency, serverModifiers);
    } catch (error) {
        console.error('[MINING] Error calculating efficiency:', error);
        // Return safe defaults
        return {
            oreSpawnChance: 0.3,
            rareOreChance: 0.05,
            treasureChance: 0.02,
            speedMultiplier: 1,
            valueMultiplier: 1
        };
    }
}

// Apply server-specific modifiers to mining efficiency
function applyServerModifiers(efficiency, serverModifiers) {
    if (!serverModifiers) return efficiency;
    
    try {
        return {
            ...efficiency,
            // Server modifiers can enhance base efficiency
            oreSpawnChance: efficiency.oreSpawnChance * 1.1, // 10% server bonus
            rareOreChance: efficiency.rareOreChance * 1.1,
            treasureChance: efficiency.treasureChance * 1.2, // 20% treasure bonus
            specialBonus: serverModifiers.specialBonus,
            itemBonuses: serverModifiers.itemBonuses
        };
    } catch (error) {
        console.error('[MINING] Error applying server modifiers:', error);
        return efficiency;
    }
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
    return dbEntry?.gameData?.breakInfo?.inBreak || false;
}

// Get a random floor tile for gathering during breaks
function getRandomFloorTile(mapData) {
    try {
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
    } catch (error) {
        console.error('[MINING] Error getting random floor tile:', error);
        return { x: mapData.entranceX || 0, y: mapData.entranceY || 0 };
    }
}

// Enhanced mining system with power level filtering and error handling
async function mineFromTile(member, miningPower, luckStat, powerLevel, tileType, availableItems, efficiency) {
    try {
        // Filter items by power level and tile type
        let eligibleItems = availableItems.filter(item => {
            if (tileType === TILE_TYPES.TREASURE_CHEST) {
                // For treasure chests, use treasure items or rare mining items
                return item.tier === 'epic' || item.tier === 'legendary';
            } else if (tileType === TILE_TYPES.RARE_ORE) {
                // For rare ore, get the best tiers available at this power level
                // Power 1-2: uncommon+, Power 3-4: rare+, Power 5+: epic+
                if (powerLevel <= 2) {
                    // At low power levels, rare ore gives uncommon or better (exclude common)
                    return item.tier !== 'common';
                } else if (powerLevel <= 4) {
                    // Mid power levels, rare ore gives rare or better
                    return item.tier === 'rare' || item.tier === 'epic' || item.tier === 'legendary';
                } else {
                    // High power levels, rare ore gives epic or better
                    return item.tier === 'epic' || item.tier === 'legendary';
                }
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
    } catch (error) {
        console.error('[MINING] Error mining from tile:', error);
        // Return safe default
        return {
            item: availableItems[0] || { itemId: 'default', name: 'Stone', value: 1 },
            quantity: 1
        };
    }
}

// Enhanced treasure generation with power level requirements
async function generateTreasure(powerLevel, efficiency) {
    try {
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
    } catch (error) {
        console.error('[MINING] Error generating treasure:', error);
        return null;
    }
}

// Optimized Event Log System with power level display and error handling
async function logEvent(channel, eventText, forceNew = false, powerLevelInfo = null) {
    try {
        eventCounter++;
        const shouldGenerateImage = forceNew || (eventCounter % REDUCED_IMAGE_INTERVAL === 0);
            
        const result = await getCachedDBEntry(channel.id);
        if (!result) {
            console.error(`[MINING] Cannot log event - no DB entry for channel ${channel.id}`);
            return;
        }
        
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
        const logEntry = eventText ? `${eventText} \n-------------------------------` : null;

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
            try {
                const mapBuffer = await generateTileMapImage(channel);
                attachment = new AttachmentBuilder(mapBuffer, { name: 'mine_map.png' });
            } catch (imgError) {
                console.error('[MINING] Error generating image:', imgError);
                // Continue without image
            }
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
        // Try simple text fallback
        try {
            if (eventText) await channel.send(`\`${eventText}\``);
        } catch (fallbackError) {
            console.error('Failed to send fallback message:', fallbackError);
        }
    }
}

// Handle break start with power level considerations and error recovery
async function startBreak(channel, dbEntry, isLongBreak = false, powerLevel = 1, preSelectedEvent = null) {
    try {
        const channelId = channel.id;
        const now = Date.now();
        const members = channel.members.filter(m => !m.user.bot);
        
        // Prevent duplicate break announcements
        const breakKey = isLongBreak ? 'LONG_BREAK_START' : 'SHORT_BREAK_START';
        if (messageQueue.isDuplicate(channelId, breakKey, 'break')) {
            console.log(`[MINING] Duplicate break start prevented for channel ${channelId}`);
            return;
        }
        
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
            if (!updatedDbEntry) {
                console.error(`[MINING] Failed to get updated DB entry for long break`);
                return;
            }
            
            const playerCount = members.size;
            
            // Use pre-selected event if provided, otherwise select one
            const selectedEvent = preSelectedEvent || pickLongBreakEvent(playerCount);
            
            console.log(`[LONG BREAK] Selected event: ${selectedEvent.name || 'Unknown'}`);
            
            // Run the selected event
            // Note: Rewards have already been distributed before the break started
            const eventResult = await selectedEvent(channel, updatedDbEntry);
            
            const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
            await logEvent(channel, `🎪 LONG BREAK: ${eventResult || 'Event started'}`, true, {
                level: powerLevel,
                name: powerLevelConfig?.name || 'Unknown Miner',
                specialBonus: `Power Level ${powerLevel} Event`
            });
            
            // Clear any existing event check interval for this channel
            const existingInterval = concurrencyManager.getInterval?.(channelId, 'eventCheck');
            if (existingInterval) {
                console.warn(`[MINING] Clearing existing event check interval for channel ${channelId}`);
                concurrencyManager.clearInterval(channelId, 'eventCheck');
            }
            
            // Set up new interval with proper management
            concurrencyManager.setInterval(channelId, 'eventCheck', async () => {
                try {
                    const currentEntry = await getCachedDBEntry(channel.id, true);
                    if (!currentEntry) return;
                    
                    // Check if special event should end
                    if (currentEntry.gameData?.specialEvent) {
                        const eventEndResult = await checkAndEndSpecialEvent(channel, currentEntry);
                        if (eventEndResult) {
                            // Prevent duplicate event end messages
                            if (!messageQueue.isDuplicate(channelId, eventEndResult, 'eventEnd')) {
                                await logEvent(channel, eventEndResult, true);
                            }
                            concurrencyManager.clearInterval(channelId, 'eventCheck');
                            
                            // Open shop after event ends if still in break
                            if (currentEntry.gameData?.breakInfo?.inBreak) {
                                // Prevent duplicate shop open message
                                if (!messageQueue.isDuplicate(channelId, 'SHOP_OPEN', 'shop')) {
                                    await generateShop(channel, 10);
                                    await logEvent(channel, '🛒 Shop is now open!', true);
                                }
                            }
                        }
                    } else {
                        // No special event or already ended
                        concurrencyManager.clearInterval(channelId, 'eventCheck');
                    }
                    
                    // Stop checking if break ended
                    if (!currentEntry.gameData?.breakInfo?.inBreak) {
                        concurrencyManager.clearInterval(channelId, 'eventCheck');
                    }
                } catch (error) {
                    console.error('Error checking special event:', error);
                    concurrencyManager.clearInterval(channelId, 'eventCheck');
                }
            }, 30000); // Check every 30 seconds
            
            // Fallback: ensure interval is cleared after max time
            setTimeout(() => {
                concurrencyManager.clearInterval(channelId, 'eventCheck');
            }, LONG_BREAK_DURATION);
            
        } else {
            // Short break
            const breakEndTime = now + SHORT_BREAK_DURATION;
            const mapData = dbEntry.gameData.map;
            const gatherPoint = getRandomFloorTile(mapData);
            // Use scatterPlayersForBreak to place tents on floor tiles only
            const scatteredPositions = scatterPlayersForBreak(
                mapData.playerPositions || {}, 
                gatherPoint.x, 
                gatherPoint.y, 
                members.size,
                mapData
            );
            
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
            
            // Prevent duplicate shop generation
            if (!messageQueue.isDuplicate(channelId, 'SHORT_BREAK_SHOP', 'shop')) {
                await generateShop(channel, 5);
                await logEvent(channel, `⛺ SHORT BREAK: Players camping at (${gatherPoint.x}, ${gatherPoint.y}). Shop open!`, true);
            }
        }
    } catch (error) {
        console.error(`[MINING] Error starting break for channel ${channel.id}:`, error);
        // Try to continue mining instead of getting stuck
        healthMetrics.processingErrors.set(channel.id, 
            (healthMetrics.processingErrors.get(channel.id) || 0) + 1);
    }
}

// Handle break end with power level considerations and error recovery
async function endBreak(channel, dbEntry, powerLevel = 1) {
    try {
        const channelId = channel.id;
        
        // Prevent duplicate break end announcements
        if (messageQueue.isDuplicate(channelId, 'BREAK_END', 'break')) {
            console.log(`[MINING] Duplicate break end prevented for channel ${channelId}`);
            return;
        }
        
        // Clear any lingering intervals for this channel
        concurrencyManager.clearAllIntervalsForChannel(channelId);
        
        const mapData = dbEntry.gameData.map;
        const members = channel.members.filter(m => !m.user.bot);
        const breakInfo = dbEntry.gameData.breakInfo;
        const railStorage = require('./mining/railStorage');
        
        const resetPositions = {};
        
        if (breakInfo.isLongBreak) {
            // After long break, place players at random rail tiles (or entrance if no rails)
            const railsData = await railStorage.getRailsData(channel.id);
            const railTiles = [];
            
            // Collect all rail positions
            if (railsData && railsData.rails && railsData.rails.size > 0) {
                for (const [key, rail] of railsData.rails) {
                    const [x, y] = key.split(',').map(Number);
                    // Only add rail tiles that are within map bounds
                    if (x >= 0 && x < mapData.width && y >= 0 && y < mapData.height) {
                        railTiles.push({ x, y });
                    }
                }
            }
            
            // Place each player at a random rail tile (or entrance if no rails)
            for (const member of members.values()) {
                if (railTiles.length > 0) {
                    // Pick random rail tile
                    const randomRail = railTiles[Math.floor(Math.random() * railTiles.length)];
                    resetPositions[member.id] = {
                        x: randomRail.x,
                        y: randomRail.y,
                        isTent: false,
                        hidden: false
                    };
                } else {
                    // No rails, place at entrance
                    resetPositions[member.id] = {
                        x: mapData.entranceX,
                        y: mapData.entranceY,
                        isTent: false,
                        hidden: false
                    };
                }
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
            'gameData.breakInfo.justEnded': true,  // Mark that break just ended for hazard system
            nextShopRefresh: nextBreakInfo.nextShopRefresh,
            nextTrigger: new Date(Date.now() + 1000)  // Trigger mining again in 1 second
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
            name: powerLevelConfig?.name || 'Unknown Mine',
            specialBonus: powerLevelConfig?.description || 'Mining efficiency active'
        });
    } catch (error) {
        console.error(`[MINING] Error ending break for channel ${channel.id}:`, error);
        // Force clear break state to prevent getting stuck
        try {
            await gachaVC.updateOne(
                { channelId: channel.id },
                { $unset: { 'gameData.breakInfo': 1 } }
            );
            dbCache.delete(channel.id);
        } catch (clearError) {
            console.error(`[MINING] Failed to force clear break state:`, clearError);
        }
    }
}

// Main Mining Event - Enhanced with Full Power Level Integration and Crash Protection
module.exports = async (channel, dbEntry, json, client) => {
    const channelId = channel.id;
    const processingStartTime = Date.now();
    
    // CRITICAL: Check if we're already processing this channel
    if (concurrencyManager.isLocked(channelId)) {
        console.log(`[MINING] Channel ${channelId} is already being processed, skipping...`);
        return;
    }
    
    // Perform health check before processing
    const isHealthy = await performHealthCheck(channelId);
    if (!isHealthy) {
        console.warn(`[MINING] Channel ${channelId} failed health check, attempting recovery...`);
        const recovered = await attemptAutoRecovery(channel);
        if (!recovered) {
            console.error(`[MINING] Failed to recover channel ${channelId}, skipping this cycle`);
            return;
        }
    }
    
    // Acquire lock for this channel
    await concurrencyManager.acquireLock(channelId);
    
    try {
        const now = Date.now();
        
        // Update health metrics
        healthMetrics.lastProcessed.set(channelId, now);
        
        // Initialize game data if needed
        if (!dbEntry.gameData) {
            initializeGameData(dbEntry, channel.id);
            await dbEntry.save();
        }

        if (!channel?.isVoiceBased()) {
            return;
        }
        
        const members = channel.members.filter(m => !m.user.bot);
        if (!members.size) {
            return;
        }

        // Enhanced power level detection with error handling
        const serverPowerLevel = json?.power || 1;
        const serverName = json?.name || 'Unknown Mine';
        const serverModifiers = getServerModifiers(serverName, serverPowerLevel);
        
        console.log(`[MINING] Power Level ${serverPowerLevel} detected for ${serverName}`);
        
        // Check if we're in a break period
        const inBreak = isBreakPeriod(dbEntry);
        
        if (inBreak) {
            const breakInfo = dbEntry.gameData.breakInfo;
            
            if (now >= breakInfo.breakEndTime) {
                // Check for any lingering special events before ending break
                if (dbEntry.gameData?.specialEvent) {
                    const eventEndResult = await checkAndEndSpecialEvent(channel, dbEntry);
                    if (eventEndResult) {
                        await logEvent(channel, eventEndResult, true);
                    }
                }
                await endBreak(channel, dbEntry, serverPowerLevel);
                return;
            }
            
            // Check for special event end during break
            if (dbEntry.gameData?.specialEvent) {
                const specialEvent = dbEntry.gameData.specialEvent;
                if (now >= specialEvent.endTime) {
                    const eventEndResult = await checkAndEndSpecialEvent(channel, dbEntry);
                    if (eventEndResult) {
                        await logEvent(channel, eventEndResult, true);
                        
                        // Open shop if event ended and still in break
                        if (breakInfo.isLongBreak && !dbEntry.gameData?.specialEvent) {
                            await generateShop(channel, 10);
                            await logEvent(channel, '🛒 Shop is now open after event!', true);
                        }
                    }
                }
            }
            
            return;
        }

        // Check if it's time to start a break
        if (now >= dbEntry.nextShopRefresh) {
            const cycleCount = dbEntry.gameData?.cycleCount || 0;
            const isLongBreak = (cycleCount % 4) === 3;
            
            let selectedEvent = null;
            
            // ALWAYS create mining summary to distribute rewards
            // This ensures players get their coins before any events
            await createMiningSummary(channel, dbEntry);
            
            if (isLongBreak) {
                // Long break - pre-select the event to avoid double selection
                const playerCount = members.size;
                selectedEvent = pickLongBreakEvent(playerCount);
                
                console.log(`[MAIN] Long break: Selected event for ${playerCount} players`);
            }
            
            await startBreak(channel, dbEntry, isLongBreak, serverPowerLevel, selectedEvent);
            return;
        }

        // Enhanced mining logic with power level integration and error handling
        const memberIds = Array.from(members.keys());
        const playerStatsMap = await playerStatsCache.getMultiple(memberIds);

        // Get available items and efficiency based on power level
        const availableItems = getAvailableItems(serverPowerLevel);
        const availableTreasures = getAvailableTreasures(serverPowerLevel);
        
        console.log(`[MINING] Available items for power level ${serverPowerLevel}:`, availableItems.length);
        
        let mapData = dbEntry.gameData.map;
        let mapChanged = false;
        const transaction = new DatabaseTransaction();
        const eventLogs = [];
        let wallsBroken = 0;
        let treasuresFound = 0;
        
        // Get or initialize hazards data
        let hazardsData = await hazardStorage.getHazardsData(channel.id);
        let hazardsChanged = false;
        
        if (!mapData) {
            mapData = initializeMap(channel.id);
            mapChanged = true;
            
            // Generate initial hazards for the starting map
            const hazardSpawnChance = getHazardSpawnChance(serverPowerLevel);
            hazardsData = hazardStorage.generateHazardsForArea(
                hazardsData,
                0,
                0,
                mapData.width,
                mapData.height,
                hazardSpawnChance,
                serverPowerLevel
            );
            hazardsChanged = true;
        }

        // Check for new players BEFORE initializing their positions
        const existingPositions = mapData.playerPositions || {};
        const newPlayers = [];
        for (const member of members.values()) {
            if (!existingPositions[member.id]) {
                newPlayers.push(member);
                const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
                eventLogs.push(`👋 ${member.displayName} joined the ${powerLevelConfig?.name || 'Expedition'}!`);
            }
        }
        
        mapData = initializeBreakPositions(mapData, members, false);
        mapChanged = true;
        
        // Check for players who left and clean up their data
        const currentPlayerIds = Array.from(members.keys());
        const departedPlayers = [];
        for (const playerId of Object.keys(existingPositions)) {
            if (!currentPlayerIds.includes(playerId)) {
                // Get the player's display name if possible
                const memberName = channel.guild.members.cache.get(playerId)?.displayName || 'A miner';
                departedPlayers.push({ id: playerId, name: memberName });
                eventLogs.push(`👋 ${memberName} left the mines`);
                
                // Clean up movement history for departed players
                playerMovementHistory.delete(playerId);
            }
        }
        
        // Clean up positions for departed players
        mapData = cleanupPlayerPositions(mapData, currentPlayerIds);

        // Calculate team sight radius with power level bonuses
        let teamSightRadius = 1;
        let maxSightThroughWalls = 0;
        if (!inBreak) {
            let totalSight = 0;
            let playerCount = 0;
            for (const member of members.values()) {
                const playerData = playerStatsMap.get(member.id);
                totalSight += playerData?.stats?.sight || 0;
                playerCount++;
                
                // Check for sight through walls from unique items
                const uniqueBonuses = parseUniqueItemBonuses(playerData?.equippedItems);
                maxSightThroughWalls = Math.max(maxSightThroughWalls, uniqueBonuses.sightThroughWalls || 0);
            }
            teamSightRadius = Math.floor(totalSight / playerCount) + 1;
            
            // Power level bonus to sight
            const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
            if (powerLevelConfig) {
                teamSightRadius = Math.floor(teamSightRadius * powerLevelConfig.speedBonus);
            }
            
            // Add bonus from unique items
            if (maxSightThroughWalls > 0) {
                teamSightRadius += Math.floor(maxSightThroughWalls);
                eventLogs.push(`👁️ Enhanced vision reveals hidden areas!`);
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

        // Re-enable players after break if needed
        if (dbEntry.gameData?.breakInfo?.justEnded) {
            hazardEffects.enablePlayersAfterBreak(dbEntry);
            delete dbEntry.gameData.breakInfo.justEnded;
            await dbEntry.save();
        }
        
        // Clean up any expired disabled statuses
        const hadExpiredDisables = hazardEffects.cleanupExpiredDisables(dbEntry);
        if (hadExpiredDisables) {
            await dbEntry.save();
        }
        
        // Process actions for each player with power level enhancements
        for (const member of members.values()) {
            try {
                // Check if player was previously disabled but can now be re-enabled
                const wasDisabled = dbEntry.gameData?.disabledPlayers?.[member.id];
                const isDisabled = hazardEffects.isPlayerDisabled(member.id, dbEntry);
                
                // If player just woke up, announce it
                if (wasDisabled && !isDisabled) {
                    eventLogs.push(`⭐ ${member.displayName} recovered from being knocked out!`);
                    // Move them back to entrance if they aren't already there
                    const position = mapData.playerPositions[member.id];
                    if (position && (position.x !== mapData.entranceX || position.y !== mapData.entranceY)) {
                        position.x = mapData.entranceX;
                        position.y = mapData.entranceY;
                        position.disabled = false;
                        mapChanged = true;
                    }
                }
                
                // Skip if still disabled
                if (isDisabled) {
                    // Add a periodic message about remaining knockout time
                    const disabledInfo = dbEntry.gameData?.disabledPlayers?.[member.id];
                    if (disabledInfo?.enableAt && Math.random() < 0.1) { // 10% chance to show message
                        const now = Date.now();
                        const remainingMs = disabledInfo.enableAt - now;
                        const remainingMinutes = Math.ceil(remainingMs / 60000);
                        if (remainingMinutes > 0) {
                            eventLogs.push(`💤 ${member.displayName} is knocked out (${remainingMinutes} min remaining)`);
                        }
                    }
                    continue;
                }
                
                const playerData = playerStatsMap.get(member.id) || { stats: {}, level: 1 };
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
                    dbEntry,
                    hazardsData
                );
                
                if (result.hazardsChanged) {
                    hazardsChanged = true;
                }
                
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
            } catch (playerError) {
                console.error(`[MINING] Error processing player ${member.displayName}:`, playerError);
                // Continue with other players
            }
        }

        // Update session statistics
        if (wallsBroken > 0 || treasuresFound > 0) {
            batchDB.queueUpdate(channel.id, {
                'gameData.stats.wallsBroken': (dbEntry.gameData.stats?.wallsBroken || 0) + wallsBroken,
                'gameData.stats.treasuresFound': (dbEntry.gameData.stats?.treasuresFound || 0) + treasuresFound
            });
        }

        // Save hazards data if changed
        if (hazardsChanged) {
            await hazardStorage.saveHazardsData(channel.id, hazardsData);
        }
        
        // Commit changes
        if (mapChanged) {
            console.log(`[MINING] Map changed for channel ${channel.id} (Power Level ${serverPowerLevel})`);
            
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
        } catch (commitError) {
            console.error(`[MINING] Error committing transaction for channel ${channel.id}:`, commitError);
            // Continue anyway to avoid getting stuck
        }
        
        await batchDB.flush();
        
        if (mapChanged) {
            dbCache.delete(channel.id);
        }

        // Enhanced event logging with power level info
        const powerLevelConfig = POWER_LEVEL_CONFIG[serverPowerLevel];
        const powerLevelInfo = {
            level: serverPowerLevel,
            name: powerLevelConfig?.name || 'Unknown Expedition',
            specialBonus: serverModifiers.specialBonus
        };

        if (eventLogs.length > 0) {
            const combinedEvents = eventLogs.join(' | ');
            await logEvent(channel, combinedEvents, false, powerLevelInfo);
        } else {
            await logEvent(channel, '', false, powerLevelInfo);
        }
        
        // Update processing time metrics
        const processingTime = Date.now() - processingStartTime;
        const avgTime = healthMetrics.averageProcessingTime.get(channelId) || processingTime;
        healthMetrics.averageProcessingTime.set(channelId, (avgTime + processingTime) / 2);
        
        // Reset error count on successful processing
        healthMetrics.processingErrors.set(channelId, 0);
        
    } catch (error) {
        console.error(`[MINING] Error processing channel ${channelId}:`, error);
        
        // Track errors
        healthMetrics.processingErrors.set(channelId, 
            (healthMetrics.processingErrors.get(channelId) || 0) + 1);
        
        // Try to auto-recover if too many errors
        if (healthMetrics.processingErrors.get(channelId) > 3) {
            console.warn(`[MINING] Too many errors for channel ${channelId}, attempting recovery...`);
            await attemptAutoRecovery(channel);
        }
    } finally {
        // ALWAYS release the lock when done
        concurrencyManager.releaseLock(channelId);
    }
};

// Enhanced player action processing with full error recovery
async function processPlayerActionsEnhanced(member, playerData, mapData, teamVisibleTiles, powerLevel, availableItems, availableTreasures, efficiency, serverModifiers, transaction, eventLogs, dbEntry, hazardsData) {
    const miningPower = playerData?.stats?.mining || 0;
    const luckStat = playerData?.stats?.luck || 0;
    const speedStat = Math.min(playerData?.stats?.speed || 1, MAX_SPEED_ACTIONS);
    
    // Parse unique item bonuses from equipped items with error handling
    let uniqueBonuses;
    try {
        uniqueBonuses = parseUniqueItemBonuses(playerData?.equippedItems);
    } catch (error) {
        console.error(`[MINING] Error parsing unique bonuses for ${member.displayName}:`, error);
        uniqueBonuses = {
            doubleOreChance: 0,
            hazardResistance: 0,
            movementSpeedBonus: 0,
            lootMultiplier: 1,
            areaDamageChance: 0,
            chainMiningChance: 0,
            sightThroughWalls: 0,
            uniqueItems: []
        };
    }
    
    let wallsBroken = 0;
    let treasuresFound = 0;
    let mapChanged = false;
    let hazardsChanged = false;
    
    // Get or initialize movement history for this player
    if (!playerMovementHistory.has(member.id)) {
        playerMovementHistory.set(member.id, { lastDirection: null, sameDirectionCount: 0 });
    }
    const moveHistory = playerMovementHistory.get(member.id);
    
    // Find best pickaxe (including unique items) with error handling
    let bestPickaxe = null;
    let isUniquePickaxe = false;
    try {
        for (const [key, item] of Object.entries(playerData?.equippedItems || {})) {
            if (!item || item.type !== 'tool' || item.slot !== 'mining') continue;

            const miningAbility = item.abilities?.find(a => a.name === 'mining');
            if (miningAbility) {
                const currentPower = miningAbility.powerlevel || miningAbility.power || 0;
                const bestPower = bestPickaxe?.abilities?.find(a => a.name === 'mining')?.powerlevel || 
                                    bestPickaxe?.abilities?.find(a => a.name === 'mining')?.power || 0;
                
                if (!bestPickaxe || currentPower > bestPower) {
                    bestPickaxe = { ...item, itemId: item.itemId || item.id || key };
                    isUniquePickaxe = item.isUnique || false;
                }
            }
        }
    } catch (error) {
        console.error(`[MINING] Error finding best pickaxe for ${member.displayName}:`, error);
    }
    
    // Apply power level speed bonus and unique item movement speed bonus
    let enhancedSpeed = Math.floor(speedStat * efficiency.speedMultiplier);
    enhancedSpeed = applyMovementSpeedBonus(enhancedSpeed, uniqueBonuses.movementSpeedBonus);
    const numActions = enhancedSpeed > 0 ? Math.floor(Math.random() * enhancedSpeed) + 1 : 1;
    
    for (let actionNum = 0; actionNum < numActions; actionNum++) {
        try {
            const position = mapData.playerPositions[member.id];
            if (!position) break;
            
            // Check if player is stuck (from portal trap into wall) - they cannot do anything!
            if (position.stuck || position.trapped) {
                // Player is stuck/trapped and cannot take any actions
                break;
            }
            
            // Enhanced treasure generation with power level
            if (Math.random() < efficiency.treasureChance) {
                const treasure = await generateTreasure(powerLevel, efficiency);
                if (treasure) {
                    await addItemToMinecart(dbEntry, member.id, treasure.itemId, 1);
                    eventLogs.push(`🎁 ${member.displayName} discovered ${treasure.name} while exploring!`);
                    treasuresFound++;
                }
            }
            
            // Check adjacent tiles for mining
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
                    const expandedMap = await checkMapExpansion(mapData, checkX, checkY, dbEntry.channelId, hazardsData, powerLevel);
                    if (expandedMap !== mapData) {
                        mapData = expandedMap;
                        mapChanged = true;
                        hazardsChanged = true;
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
                    
                    // Apply double ore bonus from unique items
                    finalQuantity = applyDoubleOreBonus(finalQuantity, uniqueBonuses.doubleOreChance, member, eventLogs);
                    
                    // Apply loot multiplier from other unique items
                    finalQuantity = Math.floor(finalQuantity * uniqueBonuses.lootMultiplier);
                    
                    await addItemToMinecart(dbEntry, member.id, item.itemId, finalQuantity);
                    
                    // Convert to floor
                    mapData.tiles[adjacentTarget.y][adjacentTarget.x] = { type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 };
                    mapChanged = true;
                    wallsBroken++;
                    
                    let findMessage;
                    if (tile.type === TILE_TYPES.TREASURE_CHEST) {
                        findMessage = `💍 ${member.displayName} discovered treasure! Found『 ${item.name} x ${finalQuantity} 』!`;
                        treasuresFound++;
                    } else if (tile.type === TILE_TYPES.RARE_ORE) {
                        findMessage = `💎 ${member.displayName} struck rare ore! Harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                    } else {
                        findMessage = `⛏️ ${member.displayName} harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                    }
                    
                    if (bestPickaxe) {
                        // Check if it's a unique pickaxe first
                        const uniqueCheck = checkUniquePickaxeBreak(bestPickaxe, isUniquePickaxe);
                        
                        if (uniqueCheck && uniqueCheck.isUnique) {
                            // Unique items never break, just show status
                            if (uniqueBonuses.uniqueItems.length > 0) {
                                const uniqueItem = uniqueBonuses.uniqueItems[0];
                                if (uniqueItem.maintenanceRatio < 0.3) {
                                    findMessage += ` ⚡ [${bestPickaxe.name}: Legendary - ${Math.round(uniqueItem.maintenanceRatio * 100)}% power]`;
                                }
                            }
                        } else {
                            // Regular pickaxe breaking logic
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
                    }
                    
                    eventLogs.push(findMessage);
                    
                    // Track mining activity for unique item maintenance
                    await updateMiningActivity(member.id, 1);
                    
                    // Check for unique item find while mining
                    const itemFind = await processUniqueItemFinding(
                        member,
                        'mining',
                        powerLevel,
                        luckStat,
                        null
                    );
                    
                    if (itemFind) {
                        eventLogs.push(itemFind.message);
                    }
                    
                    // Apply area damage from unique items
                    if (uniqueBonuses.areaDamageChance > 0) {
                        const extraWalls = applyAreaDamage(
                            { x: adjacentTarget.x, y: adjacentTarget.y },
                            mapData,
                            uniqueBonuses.areaDamageChance,
                            member,
                            eventLogs
                        );
                        wallsBroken += extraWalls;
                    }
                    
                    // Apply chain mining from unique items
                    if (uniqueBonuses.chainMiningChance > 0) {
                        const chainTargets = getChainMiningTargets(
                            { x: adjacentTarget.x, y: adjacentTarget.y },
                            mapData,
                            uniqueBonuses.chainMiningChance,
                            member,
                            eventLogs
                        );
                        
                        for (const chainTarget of chainTargets) {
                            const chainTile = mapData.tiles[chainTarget.y][chainTarget.x];
                            if (chainTile && await canBreakTile(member.id, miningPower, chainTile)) {
                                const { item: chainItem, quantity: chainQty } = await mineFromTile(
                                    member, miningPower, luckStat, powerLevel, 
                                    chainTile.type, availableItems, efficiency
                                );
                                await addItemToMinecart(dbEntry, member.id, chainItem.itemId, chainQty);
                                mapData.tiles[chainTarget.y][chainTarget.x] = { 
                                    type: TILE_TYPES.FLOOR, discovered: true, hardness: 0 
                                };
                                wallsBroken++;
                            }
                        }
                    }
                } else {
                    let findMessage;
                    if (tile.type === TILE_TYPES.TREASURE_CHEST) {
                        findMessage = `${member.displayName} discovered treasure! But failed to open it...)`;
                        treasuresFound++;
                    } else if (tile.type === TILE_TYPES.RARE_ORE) {
                        findMessage = `${member.displayName} struck rare ore! But they were parried! Wait what?)`;
                    } else {
                        findMessage = `${member.displayName} struck the ore wall but nothing happened...)`;
                    }
                    eventLogs.push(findMessage);
                }
                continue;
            }
            
            // Enhanced pathfinding and movement with better randomization
            const visibleTargets = [TILE_TYPES.TREASURE_CHEST, TILE_TYPES.RARE_ORE, TILE_TYPES.WALL_WITH_ORE];
            const nearestTarget = findNearestTarget(position, teamVisibleTiles, mapData.tiles, visibleTargets);
            
            let direction;
            if (nearestTarget) {
                direction = getDirectionToTarget(position, nearestTarget);
                // Add some randomness to avoid always going in straight lines (20% chance to deviate)
                if (Math.random() < 0.2) {
                    const randomOffsets = [
                        { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, 
                        { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
                    ];
                    const randomDir = randomOffsets[Math.floor(Math.random() * randomOffsets.length)];
                    direction = randomDir;
                }
            } else {
                // Use true randomness instead of seed-based for exploration
                const directions = [
                    { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, 
                    { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
                ];
                direction = directions[Math.floor(Math.random() * directions.length)];
            }
            
            // Check if we've been moving in the same direction too long
            if (moveHistory.lastDirection && 
                moveHistory.lastDirection.dx === direction.dx && 
                moveHistory.lastDirection.dy === direction.dy) {
                moveHistory.sameDirectionCount++;
                
                // Force a direction change after 3-5 moves in the same direction
                if (moveHistory.sameDirectionCount >= 3 + Math.floor(Math.random() * 3)) {
                    const allDirections = [
                        { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, 
                        { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
                    ];
                    // Filter out the current direction
                    const newDirections = allDirections.filter(d => 
                        d.dx !== direction.dx || d.dy !== direction.dy
                    );
                    direction = newDirections[Math.floor(Math.random() * newDirections.length)];
                    moveHistory.sameDirectionCount = 0;
                }
            } else {
                moveHistory.sameDirectionCount = 0;
            }
            moveHistory.lastDirection = { dx: direction.dx, dy: direction.dy };
            
            if (direction.dx === 0 && direction.dy === 0) continue;
            
            let newX = position.x + direction.dx;
            let newY = position.y + direction.dy;
            
            const expandedMap = await checkMapExpansion(mapData, newX, newY, dbEntry.channelId, hazardsData, powerLevel);
            if (expandedMap !== mapData) {
                mapData = expandedMap;
                mapChanged = true;
                hazardsChanged = true;
            }
            
            if (newX < 0 || newX >= mapData.width || newY < 0 || newY >= mapData.height) continue;
            
            const targetTile = mapData.tiles[newY] && mapData.tiles[newY][newX];
            if (!targetTile) continue;
            
            // Handle different tile types with occasional direction changes
            if ([TILE_TYPES.WALL, TILE_TYPES.REINFORCED_WALL, TILE_TYPES.WALL_WITH_ORE, TILE_TYPES.RARE_ORE, TILE_TYPES.TREASURE_CHEST].includes(targetTile.type)) {
                const canBreak = await canBreakTile(member.id, miningPower, targetTile);
                if (canBreak) {
                    // 15% chance to stop digging in a straight line and change direction next action
                    if (Math.random() < 0.15 && targetTile.type === TILE_TYPES.WALL) {
                        continue; // Skip this wall and try a different direction next action
                    }
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
                            findMessage = `👑 ${member.displayName} opened treasure! Found『 ${item.name} x${finalQuantity} 』!`;
                            treasuresFound++;
                        } else if (targetTile.type === TILE_TYPES.RARE_ORE) {
                            findMessage = `💎 ${member.displayName} mined rare ore! Found『 ${item.name} x${finalQuantity} 』!`;
                        } else {
                            findMessage = `⛏️ ${member.displayName} harvested『 ${item.name} x ${finalQuantity} 』from wall!`;
                        }
                        
                        eventLogs.push(findMessage);
                    }
                    
                    // Convert to floor
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
                
                // Check for hazard or treasure trigger
                if (hazardStorage.hasHazard(hazardsData, newX, newY)) {
                    // Check for hazard resistance from unique items
                    if (checkHazardResistance(uniqueBonuses.hazardResistance, member, eventLogs)) {
                        // Hazard was resisted, remove it but don't trigger
                        hazardStorage.removeHazard(hazardsData, newX, newY);
                        hazardsChanged = true;
                        continue;
                    }
                    
                    const hazard = hazardStorage.getHazard(hazardsData, newX, newY);
                    
                    // Check if it's a treasure
                    if (hazard && (hazard.type === 'treasure' || hazard.type === 'rare_treasure')) {
                        // Handle treasure
                        const treasureConfig = hazardEffects.ENCOUNTER_CONFIG?.[hazard.type] || { name: 'Treasure', minItems: 1, maxItems: 3 };
                        const itemCount = Math.floor(Math.random() * (treasureConfig.maxItems - treasureConfig.minItems + 1)) + treasureConfig.minItems;
                        
                        let totalValue = 0;
                        const foundItems = [];
                        
                        for (let i = 0; i < itemCount; i++) {
                            const { item, quantity } = await mineFromTile(member, miningPower, luckStat, powerLevel, TILE_TYPES.TREASURE_CHEST, availableItems, efficiency);
                            await addItemToMinecart(dbEntry, member.id, item.itemId, quantity);
                            foundItems.push(`${item.name} x${quantity}`);
                            totalValue += item.value * quantity;
                        }
                        
                        eventLogs.push(`💎 ${member.displayName} found treasure! Got: ${foundItems.join(', ')}`);
                        treasuresFound++;
                        
                        // Higher chance for unique items from treasure
                        const treasureFind = await processUniqueItemFinding(
                            member,
                            'treasure', // 3x chance for unique items
                            powerLevel,
                            luckStat,
                            null
                        );
                        
                        if (treasureFind) {
                            eventLogs.push(treasureFind.message);
                        }
                        
                        // Remove the treasure after collecting
                        hazardStorage.removeHazard(hazardsData, newX, newY);
                        hazardsChanged = true;
                    } else {
                        // Handle regular hazard
                        const hazardResult = await hazardEffects.processHazardTrigger(
                            member,
                            position,
                            mapData,
                            hazardsData,
                            dbEntry,
                            transaction,
                            eventLogs
                        );
                        
                        if (hazardResult) {
                            if (hazardResult.mapChanged) mapChanged = true;
                            if (hazardResult.playerDisabled) {
                                // Player is knocked out, stop processing their actions
                                break;
                            }
                            hazardsChanged = true;
                        }
                    }
                }
                
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
        } catch (actionError) {
            console.error(`[MINING] Error processing action ${actionNum} for ${member.displayName}:`, actionError);
            // Continue with next action
        }
    }
    
    return { mapChanged, wallsBroken, treasuresFound, mapData, hazardsChanged };
}

// Cleanup function for when bot shuts down or restarts
function cleanupAllChannels() {
    console.log('[MINING] Cleaning up all locks and intervals...');
    const debugInfo = concurrencyManager.getDebugInfo();
    console.log('[MINING] Active locks:', debugInfo.lockedChannels);
    console.log('[MINING] Active intervals:', debugInfo.activeIntervals);
    
    // Clear all locks
    for (const channelId of debugInfo.lockedChannels) {
        concurrencyManager.releaseLock(channelId);
    }
    
    // Clear all intervals
    for (const key of debugInfo.activeIntervals) {
        const [channelId] = key.split('_');
        concurrencyManager.clearAllIntervalsForChannel(channelId);
    }
    
    // Clear message queue
    messageQueue.recentMessages.clear();
    
    // Clear player movement history
    playerMovementHistory.clear();
    
    // Clear caches
    dbCache.clear();
    efficiencyCache.clear();
    
    // Clear health metrics
    healthMetrics.lastProcessed.clear();
    healthMetrics.processingErrors.clear();
    healthMetrics.averageProcessingTime.clear();
    healthMetrics.stuckChannels.clear();
}

// Set up periodic health check for all channels
let healthCheckInterval = null;

function startHealthMonitoring() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    
    healthCheckInterval = setInterval(() => {
        const debugInfo = concurrencyManager.getDebugInfo();
        const now = Date.now();
        
        // Check each locked channel
        for (const channelId of debugInfo.lockedChannels) {
            const lastProcessed = healthMetrics.lastProcessed.get(channelId);
            if (lastProcessed && (now - lastProcessed) > MAX_PROCESSING_TIME) {
                console.warn(`[HEALTH] Channel ${channelId} has been locked for too long, forcing unlock`);
                concurrencyManager.releaseLock(channelId);
                concurrencyManager.clearAllIntervalsForChannel(channelId);
            }
        }
        
        // Clean up old metrics
        for (const [channelId, timestamp] of healthMetrics.lastProcessed) {
            if (now - timestamp > 60 * 60 * 1000) { // 1 hour
                healthMetrics.lastProcessed.delete(channelId);
                healthMetrics.processingErrors.delete(channelId);
                healthMetrics.averageProcessingTime.delete(channelId);
            }
        }
    }, HEALTH_CHECK_INTERVAL);
}

// Start health monitoring
startHealthMonitoring();

// Export utility functions for testing
module.exports.mineFromTile = mineFromTile;
module.exports.generateTreasure = generateTreasure;
module.exports.getServerModifiers = getServerModifiers;
module.exports.getCachedMiningEfficiency = getCachedMiningEfficiency;
module.exports.POWER_LEVEL_CONFIG = POWER_LEVEL_CONFIG;
module.exports.cleanupAllChannels = cleanupAllChannels;
module.exports.performHealthCheck = performHealthCheck;
module.exports.attemptAutoRecovery = attemptAutoRecovery;
module.exports.startHealthMonitoring = startHealthMonitoring;
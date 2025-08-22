// Add this at the top of your mining_optimized_v5_performance.js file, after the other requires
const { concurrencyManager, messageQueue } = require('./mining_concurrency_fix');

// Modified main mining event handler with concurrency protection
module.exports = async (channel, dbEntry, json, client) => {
    const channelId = channel.id;
    
    // CRITICAL: Check if we're already processing this channel
    if (concurrencyManager.isLocked(channelId)) {
        console.log(`[MINING] Channel ${channelId} is already being processed, skipping...`);
        return;
    }
    
    // Acquire lock for this channel
    await concurrencyManager.acquireLock(channelId);
    
    try {
        // Your existing mining logic starts here
        const now = Date.now();
        
        initializeGameData(dbEntry, channel.id);
        await dbEntry.save();

        if (!channel?.isVoiceBased()) return;
        const members = channel.members.filter(m => !m.user.bot);
        if (!members.size) return;

        // ... rest of your existing code ...
        
    } catch (error) {
        console.error(`[MINING] Error processing channel ${channelId}:`, error);
    } finally {
        // ALWAYS release the lock when done
        concurrencyManager.releaseLock(channelId);
    }
};

// Modified startBreak function with interval management
async function startBreak(channel, dbEntry, isLongBreak = false, powerLevel = 1) {
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
        const playerCount = members.size;
        const selectedEvent = pickLongBreakEvent(playerCount);
        const eventResult = await selectedEvent(channel, updatedDbEntry);
        
        const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
        await logEvent(channel, `🎪 LONG BREAK: ${eventResult || 'Event started'}`, true, {
            level: powerLevel,
            name: powerLevelConfig?.name || 'Unknown Miner',
            specialBonus: `Power Level ${powerLevel} Event`
        });
        
        // FIX: Use concurrency manager for interval management
        // Clear any existing event check interval for this channel
        concurrencyManager.clearInterval(channelId, 'eventCheck');
        
        // Set up new interval with proper management
        concurrencyManager.setInterval(channelId, 'eventCheck', async () => {
            try {
                const currentEntry = await getCachedDBEntry(channel.id, true);
                
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
}

// Modified endBreak function with duplicate prevention
async function endBreak(channel, dbEntry, powerLevel = 1) {
    const channelId = channel.id;
    
    // Prevent duplicate break end announcements
    if (messageQueue.isDuplicate(channelId, 'BREAK_END', 'break')) {
        console.log(`[MINING] Duplicate break end prevented for channel ${channelId}`);
        return;
    }
    
    // Clear any lingering intervals for this channel
    concurrencyManager.clearAllIntervalsForChannel(channelId);
    
    // ... rest of your existing endBreak code ...
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
        name: powerLevelConfig?.name || 'Unknown Mine',
        specialBonus: powerLevelConfig?.description || 'Mining efficiency active'
    });
}

// Add cleanup function for when bot shuts down or restarts
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
}

// Export cleanup function
module.exports.cleanupAllChannels = cleanupAllChannels;

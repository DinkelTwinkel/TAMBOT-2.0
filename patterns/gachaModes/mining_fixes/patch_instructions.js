// Patched getCachedDBEntry function with proper minecart initialization
// Replace the getCachedDBEntry function (around line 320-420) with this version:

async function getCachedDBEntry(channelId, forceRefresh = false, retryCount = 0) {
    try {
        // Force refresh if we suspect stale break data
        const now = Date.now();
        if (!forceRefresh && mapCacheSystem.isCached(channelId)) {
            const cached = mapCacheSystem.getCachedData(channelId);
            if (cached?.breakInfo) {
                // Force refresh if break should have ended
                if (cached.breakInfo.breakEndTime && now >= cached.breakInfo.breakEndTime) {
                    console.log(`[MINING] Cached break expired, forcing refresh for ${channelId}`);
                    forceRefresh = true;
                    
                    // Clear break info immediately
                    mapCacheSystem.deleteField(channelId, 'breakInfo');
                    await mapCacheSystem.forceFlush();
                }
            }
        }
        
        // Initialize cache if not already done or forcing refresh
        if (!mapCacheSystem.isCached(channelId) || forceRefresh) {
            await mapCacheSystem.initialize(channelId, forceRefresh);
        }
        
        // Get cached data
        const cached = mapCacheSystem.getCachedData(channelId);
        
        if (!cached) {
            // Fallback to direct DB read if cache fails
            console.error(`[MINING] Cache miss for channel ${channelId}, falling back to DB`);
            const entry = await gachaVC.findOne({ channelId });
            if (entry) {
                // CRITICAL FIX: Ensure minecart structure exists at the correct location
                if (!entry.gameData) entry.gameData = {};
                if (!entry.gameData.minecart) {
                    entry.gameData.minecart = { items: {}, contributors: {} };
                }
                if (!entry.gameData.minecart.items) {
                    entry.gameData.minecart.items = {};
                }
                if (!entry.gameData.minecart.contributors) {
                    entry.gameData.minecart.contributors = {};
                }
                
                // Save the structure immediately
                entry.markModified('gameData.minecart');
                await entry.save();
                
                // Re-initialize cache with correct data
                await mapCacheSystem.initialize(channelId, true);
                return entry;
            }
            return null;
        }
        
        // CRITICAL FIX: Ensure minecart exists in cached data at gameData.minecart
        if (!cached.minecart) {
            cached.minecart = { items: {}, contributors: {} };
            
            // Update cache immediately
            await mapCacheSystem.updateMultiple(channelId, {
                minecart: cached.minecart
            });
        }
        
        // Ensure sub-structures
        if (!cached.minecart.items) cached.minecart.items = {};
        if (!cached.minecart.contributors) cached.minecart.contributors = {};
        
        // Return cached data formatted like DB entry
        return {
            channelId: channelId,
            gameData: cached, // The cached data IS the gameData
            nextShopRefresh: cached.nextShopRefresh,
            nextTrigger: cached.nextTrigger,
            save: async function() {
                const updates = {};
                for (const [key, value] of Object.entries(this.gameData)) {
                    if (key !== 'lastUpdated' && key !== 'channelId') {
                        updates[key] = value;
                    }
                }
                return mapCacheSystem.updateMultiple(channelId, updates);
            },
            markModified: function() {}
        };
        
    } catch (error) {
        console.error(`[MINING] Error fetching cached entry for channel ${channelId}:`, error);
        if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return getCachedDBEntry(channelId, forceRefresh, retryCount + 1);
        }
        return null;
    }
}

// Patched isBreakPeriod function with better validation
// Replace the isBreakPeriod function (around line 760) with this:

function isBreakPeriod(dbEntry) {
    const now = Date.now();
    const breakInfo = dbEntry?.gameData?.breakInfo;
    
    // If no break info, not in break
    if (!breakInfo || !breakInfo.inBreak) return false;
    
    // Check if break has expired - CRITICAL FIX
    if (breakInfo.breakEndTime) {
        const breakEndTime = typeof breakInfo.breakEndTime === 'string' 
            ? new Date(breakInfo.breakEndTime).getTime()
            : breakInfo.breakEndTime;
            
        if (now >= breakEndTime) {
            console.log(`[MINING] Break has expired (ended ${Math.floor((now - breakEndTime) / 1000)}s ago), should end break`);
            return false; // Break time has passed
        }
    }
    
    // Only return true if actually in break and time hasn't expired
    return true;
}

// Patched startBreak function with better state management
// Add this check at the beginning of startBreak function (around line 1980):

async function startBreak(channel, dbEntry, isLongBreak = false, powerLevel = 1, preSelectedEvent = null) {
    try {
        const channelId = channel.id;
        const now = Date.now();
        const members = channel.members.filter(m => !m.user.bot);
        
        // CRITICAL FIX: Check if already in break
        if (dbEntry.gameData?.breakInfo?.inBreak) {
            console.log(`[MINING] Already in break for channel ${channelId}, skipping duplicate start`);
            return;
        }
        
        // Kill any parallel instances before starting break
        instanceManager.forceKillChannel(channelId);
        
        const breakKey = isLongBreak ? 'LONG_BREAK_START' : 'SHORT_BREAK_START';
        if (messageQueue.isDuplicate(channelId, breakKey, 'break')) {
            console.log(`[MINING] Duplicate break start prevented for channel ${channelId}`);
            return;
        }
        
        // Continue with rest of function...
        // [Rest of the original startBreak code]

// Patched endBreak function with better cleanup
// Replace endBreak function (around line 2130) with this enhanced version:

async function endBreak(channel, dbEntry, powerLevel = 1) {
    try {
        const channelId = channel.id;
        
        // CRITICAL FIX: Check if actually in break
        if (!dbEntry.gameData?.breakInfo?.inBreak) {
            console.log(`[MINING] Not in break for channel ${channelId}, skipping end break`);
            return;
        }
        
        // Clear any existing locks and instances
        instanceManager.forceKillChannel(channelId);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Register new instance for post-break mining
        if (!instanceManager.registerInstance(channelId)) {
            console.error(`[MINING] Cannot end break - channel ${channelId} is locked by another process`);
            instanceManager.forceKillChannel(channelId);
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!instanceManager.registerInstance(channelId)) {
                console.error(`[MINING] Failed to register instance after retry`);
                return;
            }
        }
        
        if (messageQueue.isDuplicate(channelId, 'BREAK_END', 'break')) {
            console.log(`[MINING] Duplicate break end prevented for channel ${channelId}`);
            instanceManager.killInstance(channelId);
            return;
        }
        
        concurrencyManager.clearAllIntervalsForChannel(channelId);
        
        const mapData = dbEntry.gameData.map;
        const members = channel.members.filter(m => !m.user.bot);
        const breakInfo = dbEntry.gameData.breakInfo;
        
        // Reset player positions
        const resetPositions = {};
        for (const member of members.values()) {
            resetPositions[member.id] = {
                x: mapData.entranceX || 0,
                y: mapData.entranceY || 0,
                isTent: false,
                hidden: false,
                stuck: false,  // Clear stuck status
                trapped: false  // Clear trapped status
            };
        }
        
        const cycleCount = (dbEntry.gameData?.cycleCount || 0) + 1;
        const nextBreakInfo = calculateNextBreakTime({ gameData: { cycleCount } });
        
        // CRITICAL FIX: Clear break from both cache and database atomically
        // First clear from cache
        mapCacheSystem.deleteField(channelId, 'breakInfo');
        await mapCacheSystem.forceFlush();
        
        // Then clear from database with single atomic operation
        await gachaVC.updateOne(
            { channelId: channel.id },
            { 
                $unset: { 'gameData.breakInfo': 1 },
                $set: {
                    'gameData.cycleCount': cycleCount,
                    'gameData.breakJustEnded': Date.now(),
                    'gameData.map.playerPositions': resetPositions,
                    nextShopRefresh: nextBreakInfo.nextShopRefresh,
                    nextTrigger: new Date(Date.now() + 1000)
                }
            }
        );
        
        // Force clear all caches
        mapCacheSystem.clearChannel(channelId);
        if (typeof visibilityCalculator !== 'undefined' && visibilityCalculator.invalidate) {
            visibilityCalculator.invalidate();
        }
        dbCache.delete(channelId);
        efficiencyCache.clear();
        
        // Re-initialize with fresh data
        await mapCacheSystem.initialize(channelId, true);
        
        const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
        await logEvent(channel, '⛏️ Break ended! Mining resumed.', true, {
            level: powerLevel,
            name: powerLevelConfig?.name || 'Unknown Mine',
            specialBonus: powerLevelConfig?.description || 'Mining efficiency active'
        });
        
        console.log(`[MINING] Break ended successfully for channel ${channelId}`);
        
        // Release instance lock
        instanceManager.killInstance(channelId);
        
    } catch (error) {
        console.error(`[MINING] Error ending break for channel ${channel.id}:`, error);
        
        // Emergency cleanup
        instanceManager.forceKillChannel(channel.id);
        mapCacheSystem.clearChannel(channel.id);
        
        try {
            // Force clear break state in database
            await gachaVC.updateOne(
                { channelId: channel.id },
                { 
                    $unset: { 'gameData.breakInfo': 1 },
                    $set: { 
                        'gameData.breakJustEnded': Date.now(),
                        nextTrigger: new Date(Date.now() + 1000)
                    }
                }
            );
            dbCache.delete(channel.id);
            console.log(`[MINING] Emergency break clear completed for ${channel.id}`);
        } catch (clearError) {
            console.error(`[MINING] Failed to force clear break state:`, clearError);
        }
    }
}

// Add this validation at the beginning of the main module.exports function (around line 2300):

module.exports = async (channel, dbEntry, json, client) => {
    const channelId = channel.id;
    const processingStartTime = Date.now();
    
    // CRITICAL FIX: Import and apply fixes at startup
    const { detectMiningIssues, applyMiningFixes } = require('./mining_fixes/fix_mining_bugs');
    
    // Detect issues first
    const issues = detectMiningIssues(dbEntry, channel);
    if (issues.length > 0) {
        console.log(`[MINING] Detected ${issues.length} issues for channel ${channelId}:`);
        for (const issue of issues) {
            console.log(`  - [${issue.severity}] ${issue.type}: ${issue.message}`);
        }
        
        // Apply fixes for high severity issues
        const highSeverityIssues = issues.filter(i => i.severity === 'HIGH');
        if (highSeverityIssues.length > 0) {
            console.log(`[MINING] Applying fixes for ${highSeverityIssues.length} high severity issues...`);
            const fixResults = await applyMiningFixes(
                channel, 
                dbEntry, 
                gachaVC, 
                mapCacheSystem, 
                instanceManager, 
                concurrencyManager
            );
            
            if (fixResults.applied.length > 0) {
                console.log(`[MINING] Applied fixes: ${fixResults.applied.join(', ')}`);
            }
            if (fixResults.warnings.length > 0) {
                console.log(`[MINING] Warnings: ${fixResults.warnings.join(', ')}`);
            }
            
            // Refresh dbEntry after fixes
            dbEntry = await getCachedDBEntry(channelId, true);
            if (!dbEntry) {
                console.error(`[MINING] Failed to get DB entry after fixes`);
                return;
            }
        }
    }
    
    // Continue with original code...
    // [Rest of the original module.exports code]

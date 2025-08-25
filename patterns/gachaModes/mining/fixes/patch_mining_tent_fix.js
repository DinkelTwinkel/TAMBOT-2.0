// patch_mining_tent_fix.js - Apply this patch to mining_optimized_v5_performance.js

/**
 * INSTRUCTIONS:
 * 1. Import the fix module at the top of mining_optimized_v5_performance.js:
 *    const { clearTentFlags, verifyAndFixPlayerPositions } = require('./mining/fix_tent_display');
 * 
 * 2. Replace the existing endBreak function with this enhanced version
 */

// Enhanced break end with proper tent flag clearing
async function endBreak(channel, dbEntry, powerLevel = 1) {
    try {
        const channelId = channel.id;
        
        // Clear any existing locks and instances
        instanceManager.forceKillChannel(channelId);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Register new instance for post-break mining
        if (!instanceManager.registerInstance(channelId)) {
            console.error(`[MINING] Cannot end break - channel ${channelId} is locked by another process`);
            // Force clear and retry once
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
        const railStorage = require('./mining/railStorage');
        
        // Import the fix function
        const { clearTentFlags } = require('./mining/fix_tent_display');
        
        let resetPositions = {};
        
        if (breakInfo.isLongBreak) {
            // Long break: return players to rails or entrance
            const railsData = await railStorage.getRailsData(channel.id);
            const railTiles = [];
            
            if (railsData && railsData.rails && railsData.rails.size > 0) {
                for (const [key, rail] of railsData.rails) {
                    const [x, y] = key.split(',').map(Number);
                    if (x >= 0 && x < mapData.width && y >= 0 && y < mapData.height) {
                        railTiles.push({ x, y });
                    }
                }
            }
            
            for (const member of members.values()) {
                if (railTiles.length > 0) {
                    const randomRail = railTiles[Math.floor(Math.random() * railTiles.length)];
                    resetPositions[member.id] = {
                        x: randomRail.x,
                        y: randomRail.y,
                        isTent: false,  // CRITICAL: Clear tent flag
                        hidden: false
                    };
                } else {
                    resetPositions[member.id] = {
                        x: mapData.entranceX,
                        y: mapData.entranceY,
                        isTent: false,  // CRITICAL: Clear tent flag
                        hidden: false
                    };
                }
            }
        } else {
            // Short break: clear tent flags from current positions
            const currentPositions = mapData.playerPositions || {};
            
            // CRITICAL FIX: Use clearTentFlags to ensure all tent flags are removed
            resetPositions = clearTentFlags(currentPositions);
            
            // Ensure all players are accounted for
            for (const member of members.values()) {
                if (!resetPositions[member.id]) {
                    resetPositions[member.id] = {
                        x: mapData.entranceX,
                        y: mapData.entranceY,
                        isTent: false,
                        hidden: false
                    };
                }
            }
        }
        
        const cycleCount = (dbEntry.gameData?.cycleCount || 0) + 1;
        const nextBreakInfo = calculateNextBreakTime({ gameData: { cycleCount } });
        
        console.log(`[MINING] Setting next break for channel ${channelId}:`, {
            nextBreakTime: nextBreakInfo.nextShopRefresh.toISOString(),
            miningDuration: MINING_DURATION / 1000 / 60 + ' minutes',
            cycleCount: cycleCount,
            isNextLongBreak: nextBreakInfo.isLongBreak,
            playersCleared: Object.keys(resetPositions).length
        });
        
        // CRITICAL FIX: Clear breakInfo from cache BEFORE database update
        mapCacheSystem.deleteField(channel.id, 'breakInfo');
        
        // CRITICAL FIX: Update cache with cleaned positions FIRST
        mapCacheSystem.updateMultiple(channel.id, {
            'map.playerPositions': resetPositions,  // Use cleaned positions
            'cycleCount': cycleCount,
            'breakJustEnded': Date.now(),
            'miningResumedAt': Date.now(),
            nextShopRefresh: nextBreakInfo.nextShopRefresh,
            nextTrigger: new Date(Date.now() + 1000)
        });
        
        // Force flush cache to ensure changes are saved
        await mapCacheSystem.forceFlush();
        
        // Update database with cleaned positions
        const updateResult = await gachaVC.updateOne(
            { channelId: channel.id },
            { 
                $unset: { 'gameData.breakInfo': 1 },
                $set: {
                    'gameData.cycleCount': cycleCount,
                    'gameData.breakJustEnded': Date.now(),
                    'gameData.miningResumedAt': Date.now(),
                    'gameData.map.playerPositions': resetPositions,  // Use cleaned positions
                    nextShopRefresh: nextBreakInfo.nextShopRefresh,
                    nextTrigger: new Date(Date.now() + 1000)
                }
            }
        );
        
        // Verify the update was successful
        if (!updateResult.acknowledged) {
            console.error(`[MINING] Failed to update database after break end for ${channel.id}`);
        } else {
            console.log(`[MINING] Successfully updated database with cleaned positions for ${channel.id}`);
        }
        
        // Clear all caches to force fresh data
        mapCacheSystem.clearChannel(channel.id);
        visibilityCalculator.invalidate();
        dbCache.delete(channel.id);
        efficiencyCache.clear();
        
        // Force re-initialize with fresh data
        await mapCacheSystem.initialize(channel.id, true);
        
        // Double-check that tent flags are cleared
        const { verifyAndFixPlayerPositions } = require('./mining/fix_tent_display');
        await verifyAndFixPlayerPositions(channel.id, mapCacheSystem, gachaVC);
        
        const powerLevelConfig = POWER_LEVEL_CONFIG[powerLevel];
        await logEvent(channel, '⛏️ Break ended! Mining resumed.', true, {
            level: powerLevel,
            name: powerLevelConfig?.name || 'Unknown Mine',
            specialBonus: powerLevelConfig?.description || 'Mining efficiency active'
        });
        
        console.log(`[MINING] Break ended successfully for channel ${channelId} - tent flags cleared`);
        
        // Release instance lock to allow normal mining to proceed
        instanceManager.killInstance(channelId);
        
    } catch (error) {
        console.error(`[MINING] Error ending break for channel ${channel.id}:`, error);
        
        // Emergency cleanup
        instanceManager.forceKillChannel(channel.id);
        mapCacheSystem.clearChannel(channel.id);
        
        try {
            // Import emergency fix
            const { clearTentFlags } = require('./mining/fix_tent_display');
            
            // Get current positions and clear tent flags
            const dbResult = await gachaVC.findOne({ channelId: channel.id });
            if (dbResult?.gameData?.map?.playerPositions) {
                const cleanedPositions = clearTentFlags(dbResult.gameData.map.playerPositions);
                
                // Force clear break state and tent flags in database
                await gachaVC.updateOne(
                    { channelId: channel.id },
                    { 
                        $unset: { 'gameData.breakInfo': 1 },
                        $set: { 
                            'gameData.breakJustEnded': Date.now(),
                            'gameData.map.playerPositions': cleanedPositions,
                            nextTrigger: new Date(Date.now() + 1000)
                        }
                    }
                );
            }
            
            dbCache.delete(channel.id);
            console.log(`[MINING] Emergency break clear with tent fix completed for ${channel.id}`);
        } catch (clearError) {
            console.error(`[MINING] Failed to force clear break state:`, clearError);
        }
    }
}

/**
 * ADDITIONAL FIX: Add this to the main module.exports function after the CRITICAL HOTFIX section
 */

// Add this after line 2752 (after the CRITICAL HOTFIX END comment):
// Fix any stale tent flags if not in break
if (!isBreakPeriod(dbEntry)) {
    const { verifyAndFixPlayerPositions } = require('./mining/fix_tent_display');
    const fixed = await verifyAndFixPlayerPositions(channelId, mapCacheSystem, gachaVC);
    if (fixed) {
        console.log(`[MINING] Fixed stale tent flags for channel ${channelId}`);
        // Refresh the dbEntry to get the cleaned data
        dbEntry = await getCachedDBEntry(channelId, true);
    }
}

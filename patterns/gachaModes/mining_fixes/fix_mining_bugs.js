// Mining System Bug Fixes
// This file contains patches for the identified issues in mining_optimized_v5_performance.js

const FIXES = {
    // FIX 1: Minecart initialization and structure issues
    ensureMinecartStructure: async function(dbEntry, channelId) {
        // Ensure proper minecart structure at gameData level
        if (!dbEntry.gameData) {
            dbEntry.gameData = {};
        }
        
        // Initialize minecart at correct location: gameData.minecart
        if (!dbEntry.gameData.minecart) {
            dbEntry.gameData.minecart = {
                items: {},
                contributors: {}
            };
            console.log(`[FIX] Initialized minecart structure for channel ${channelId}`);
        }
        
        // Ensure sub-structures exist
        if (!dbEntry.gameData.minecart.items) {
            dbEntry.gameData.minecart.items = {};
        }
        if (!dbEntry.gameData.minecart.contributors) {
            dbEntry.gameData.minecart.contributors = {};
        }
        
        return true;
    },

    // FIX 2: Break state management
    fixBreakStateManagement: async function(gachaVC, mapCacheSystem, channelId) {
        const now = Date.now();
        
        // Check database for stale break states
        const dbEntry = await gachaVC.findOne({ channelId });
        if (!dbEntry) return false;
        
        const breakInfo = dbEntry.gameData?.breakInfo;
        
        // If break has expired but still marked as active, clear it
        if (breakInfo && breakInfo.inBreak && breakInfo.breakEndTime) {
            if (now >= breakInfo.breakEndTime) {
                console.log(`[FIX] Clearing expired break state for channel ${channelId}`);
                
                // Clear from database
                await gachaVC.updateOne(
                    { channelId },
                    { 
                        $unset: { 'gameData.breakInfo': 1 },
                        $set: { 
                            'gameData.breakJustEnded': now,
                            nextTrigger: new Date(now + 1000)
                        }
                    }
                );
                
                // Clear from cache
                mapCacheSystem.deleteField(channelId, 'breakInfo');
                await mapCacheSystem.forceFlush();
                
                return true;
            }
        }
        
        return false;
    },

    // FIX 3: Timer update issues
    fixTimerUpdates: function(dbEntry) {
        const now = Date.now();
        const result = {
            needsUpdate: false,
            updates: {}
        };
        
        // Check if nextShopRefresh is in the past
        if (dbEntry.nextShopRefresh && new Date(dbEntry.nextShopRefresh) < now) {
            if (!dbEntry.gameData?.breakInfo?.inBreak) {
                // Should be in break but isn't
                result.needsUpdate = true;
                result.updates.shouldStartBreak = true;
            }
        }
        
        // Check if nextTrigger needs updating
        if (!dbEntry.nextTrigger || new Date(dbEntry.nextTrigger) < now) {
            result.needsUpdate = true;
            result.updates.nextTrigger = new Date(now + 5000);
        }
        
        return result;
    },

    // FIX 4: Mining action validation
    validateMiningActions: function(mapData, member, position) {
        const errors = [];
        
        // Validate player position exists
        if (!position) {
            errors.push(`Player ${member.displayName} has no position`);
            return { valid: false, errors };
        }
        
        // Validate position is within bounds
        if (position.x < 0 || position.x >= mapData.width || 
            position.y < 0 || position.y >= mapData.height) {
            errors.push(`Player ${member.displayName} is out of bounds at (${position.x}, ${position.y})`);
            return { valid: false, errors };
        }
        
        // Validate tile exists at position
        if (!mapData.tiles[position.y] || !mapData.tiles[position.y][position.x]) {
            errors.push(`No tile at player position (${position.x}, ${position.y})`);
            return { valid: false, errors };
        }
        
        return { valid: true, errors: [] };
    },

    // FIX 5: Instance and lock management
    clearStuckInstances: function(instanceManager, concurrencyManager, channelId) {
        // Force clear all locks and instances
        concurrencyManager.forceUnlock(channelId);
        instanceManager.forceKillChannel(channelId);
        
        // Clear all intervals
        concurrencyManager.clearAllIntervalsForChannel(channelId);
        
        console.log(`[FIX] Cleared stuck instances for channel ${channelId}`);
        return true;
    },

    // FIX 6: Cache synchronization
    synchronizeCache: async function(mapCacheSystem, gachaVC, channelId) {
        // Force flush any pending cache updates
        await mapCacheSystem.forceFlush();
        
        // Clear channel cache to force fresh read
        mapCacheSystem.clearChannel(channelId);
        
        // Re-initialize with fresh data from database
        await mapCacheSystem.initialize(channelId, true);
        
        console.log(`[FIX] Synchronized cache for channel ${channelId}`);
        return true;
    },

    // FIX 7: Add item to minecart with proper structure
    safeAddToMinecart: async function(dbEntry, memberId, itemId, quantity) {
        // Ensure minecart structure
        if (!dbEntry.gameData) dbEntry.gameData = {};
        if (!dbEntry.gameData.minecart) {
            dbEntry.gameData.minecart = { items: {}, contributors: {} };
        }
        if (!dbEntry.gameData.minecart.items) {
            dbEntry.gameData.minecart.items = {};
        }
        if (!dbEntry.gameData.minecart.contributors) {
            dbEntry.gameData.minecart.contributors = {};
        }
        
        // Add item
        const currentQuantity = dbEntry.gameData.minecart.items[itemId] || 0;
        dbEntry.gameData.minecart.items[itemId] = currentQuantity + quantity;
        
        // Track contributor
        const currentContribution = dbEntry.gameData.minecart.contributors[memberId] || 0;
        dbEntry.gameData.minecart.contributors[memberId] = currentContribution + quantity;
        
        // Mark as modified
        if (typeof dbEntry.markModified === 'function') {
            dbEntry.markModified('gameData.minecart');
        }
        
        return true;
    }
};

// Main fix application function
async function applyMiningFixes(channel, dbEntry, gachaVC, mapCacheSystem, instanceManager, concurrencyManager) {
    const channelId = channel.id;
    const fixResults = {
        applied: [],
        failed: [],
        warnings: []
    };
    
    try {
        // Fix 1: Ensure minecart structure
        const minecartFixed = await FIXES.ensureMinecartStructure(dbEntry, channelId);
        if (minecartFixed) {
            fixResults.applied.push('Minecart structure initialized');
        }
        
        // Fix 2: Fix break state management
        const breakFixed = await FIXES.fixBreakStateManagement(gachaVC, mapCacheSystem, channelId);
        if (breakFixed) {
            fixResults.applied.push('Break state cleared');
        }
        
        // Fix 3: Fix timer updates
        const timerCheck = FIXES.fixTimerUpdates(dbEntry);
        if (timerCheck.needsUpdate) {
            for (const [key, value] of Object.entries(timerCheck.updates)) {
                if (key === 'nextTrigger') {
                    dbEntry.nextTrigger = value;
                    fixResults.applied.push('Timer updated');
                } else if (key === 'shouldStartBreak') {
                    fixResults.warnings.push('Break should have started - triggering now');
                }
            }
        }
        
        // Fix 4: Validate mining actions for all players
        const members = channel.members.filter(m => !m.user.bot);
        for (const member of members.values()) {
            const position = dbEntry.gameData?.map?.playerPositions?.[member.id];
            const validation = FIXES.validateMiningActions(dbEntry.gameData?.map, member, position);
            
            if (!validation.valid) {
                fixResults.warnings.push(...validation.errors);
                
                // Reset player to entrance if invalid
                if (dbEntry.gameData?.map?.playerPositions) {
                    dbEntry.gameData.map.playerPositions[member.id] = {
                        x: dbEntry.gameData.map.entranceX || 0,
                        y: dbEntry.gameData.map.entranceY || 0,
                        isTent: false,
                        hidden: false
                    };
                    fixResults.applied.push(`Reset ${member.displayName} to entrance`);
                }
            }
        }
        
        // Fix 5: Clear stuck instances
        FIXES.clearStuckInstances(instanceManager, concurrencyManager, channelId);
        fixResults.applied.push('Cleared stuck instances');
        
        // Fix 6: Synchronize cache
        await FIXES.synchronizeCache(mapCacheSystem, gachaVC, channelId);
        fixResults.applied.push('Cache synchronized');
        
        // Save all changes
        if (typeof dbEntry.save === 'function') {
            await dbEntry.save();
            fixResults.applied.push('Database changes saved');
        }
        
    } catch (error) {
        console.error(`[FIX] Error applying fixes for channel ${channelId}:`, error);
        fixResults.failed.push(error.message);
    }
    
    return fixResults;
}

// Monitoring function to detect issues
function detectMiningIssues(dbEntry, channel) {
    const issues = [];
    const now = Date.now();
    
    // Check minecart structure
    if (!dbEntry.gameData?.minecart?.items) {
        issues.push({
            type: 'MINECART_STRUCTURE',
            severity: 'HIGH',
            message: 'Minecart structure is missing or corrupted'
        });
    }
    
    // Check break state
    const breakInfo = dbEntry.gameData?.breakInfo;
    if (breakInfo && breakInfo.inBreak && breakInfo.breakEndTime) {
        if (now >= breakInfo.breakEndTime) {
            issues.push({
                type: 'EXPIRED_BREAK',
                severity: 'HIGH',
                message: `Break expired ${Math.floor((now - breakInfo.breakEndTime) / 60000)} minutes ago`
            });
        }
    }
    
    // Check timer consistency
    if (dbEntry.nextShopRefresh && new Date(dbEntry.nextShopRefresh) < now) {
        if (!breakInfo?.inBreak) {
            issues.push({
                type: 'TIMER_MISMATCH',
                severity: 'MEDIUM',
                message: 'Shop refresh timer expired but not in break'
            });
        }
    }
    
    // Check player positions
    const members = channel.members.filter(m => !m.user.bot);
    const positions = dbEntry.gameData?.map?.playerPositions || {};
    
    for (const member of members.values()) {
        if (!positions[member.id]) {
            issues.push({
                type: 'MISSING_POSITION',
                severity: 'MEDIUM',
                message: `Player ${member.displayName} has no position`
            });
        }
    }
    
    // Check for stuck players
    for (const [playerId, position] of Object.entries(positions)) {
        if (position.stuck || position.trapped) {
            const member = channel.guild.members.cache.get(playerId);
            issues.push({
                type: 'STUCK_PLAYER',
                severity: 'LOW',
                message: `${member?.displayName || 'Unknown player'} is stuck`
            });
        }
    }
    
    return issues;
}

module.exports = {
    FIXES,
    applyMiningFixes,
    detectMiningIssues,
    
    // Quick fix functions for immediate use
    quickFixMinecart: FIXES.ensureMinecartStructure,
    quickFixBreak: FIXES.fixBreakStateManagement,
    quickFixTimers: FIXES.fixTimerUpdates,
    quickClearInstances: FIXES.clearStuckInstances,
    quickSyncCache: FIXES.synchronizeCache,
    safeAddToMinecart: FIXES.safeAddToMinecart
};

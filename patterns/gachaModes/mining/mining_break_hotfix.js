// mining_break_hotfix.js
// EMERGENCY HOTFIX for break loop issue
// Place in patterns/gachaModes/mining/ and require in main file

const MINIMUM_MINING_DURATION = 20 * 60 * 1000; // 20 minutes minimum between breaks
const BREAK_COOLDOWN_PERIOD = 60 * 1000; // 1 minute cooldown after break ends

class BreakLoopPrevention {
    constructor() {
        // Track break history per channel
        this.breakHistory = new Map();
        this.breakLocks = new Map();
    }

    /**
     * Check if a break can safely start
     * @param {string} channelId - Channel ID
     * @param {Object} dbEntry - Database entry
     * @returns {Object} { canStart: boolean, reason: string }
     */
    canStartBreak(channelId, dbEntry) {
        const now = Date.now();
        
        // Check 1: Already locked?
        if (this.breakLocks.has(channelId)) {
            const lock = this.breakLocks.get(channelId);
            if (now - lock.timestamp < 5000) { // 5 second lock
                return { 
                    canStart: false, 
                    reason: `Break operation locked by ${lock.operation}` 
                };
            }
            // Clear stale lock
            this.breakLocks.delete(channelId);
        }

        // Check 2: Already in break?
        if (dbEntry?.gameData?.breakInfo?.inBreak) {
            return { 
                canStart: false, 
                reason: 'Already in break period' 
            };
        }

        // Check 3: Just ended a break?
        if (dbEntry?.gameData?.breakJustEnded) {
            const timeSinceEnd = now - dbEntry.gameData.breakJustEnded;
            if (timeSinceEnd < BREAK_COOLDOWN_PERIOD) {
                return { 
                    canStart: false, 
                    reason: `Cooldown active: ${Math.ceil((BREAK_COOLDOWN_PERIOD - timeSinceEnd) / 1000)}s remaining` 
                };
            }
        }

        // Check 4: Check break history
        const history = this.breakHistory.get(channelId);
        if (history && history.length > 0) {
            const lastBreak = history[history.length - 1];
            const timeSinceLastBreak = now - lastBreak.startTime;
            
            if (timeSinceLastBreak < MINIMUM_MINING_DURATION) {
                return { 
                    canStart: false, 
                    reason: `Mining time too short: ${Math.ceil(timeSinceLastBreak / 60000)}min < ${MINIMUM_MINING_DURATION / 60000}min required` 
                };
            }

            // Detect rapid cycling (3 breaks in 1 hour)
            if (history.length >= 3) {
                const recentBreaks = history.slice(-3);
                const oldestRecent = recentBreaks[0].startTime;
                if (now - oldestRecent < 60 * 60 * 1000) { // 1 hour
                    console.error(`[BREAK_PREVENTION] Rapid cycling detected for ${channelId}`);
                    return { 
                        canStart: false, 
                        reason: 'Break cycling detected - manual intervention required' 
                    };
                }
            }
        }

        // Check 5: Validate next shop refresh time
        if (dbEntry?.nextShopRefresh) {
            const nextBreakTime = new Date(dbEntry.nextShopRefresh).getTime();
            if (now < nextBreakTime - 1000) { // 1 second tolerance
                return { 
                    canStart: false, 
                    reason: `Next break scheduled in ${Math.ceil((nextBreakTime - now) / 60000)}min` 
                };
            }
        }

        return { 
            canStart: true, 
            reason: 'All checks passed' 
        };
    }

    /**
     * Lock break operations to prevent concurrent execution
     * @param {string} channelId - Channel ID
     * @param {string} operation - Operation name (START_BREAK, END_BREAK)
     */
    lockBreakOperation(channelId, operation) {
        this.breakLocks.set(channelId, {
            operation,
            timestamp: Date.now()
        });
    }

    /**
     * Unlock break operations
     * @param {string} channelId - Channel ID
     */
    unlockBreakOperation(channelId) {
        this.breakLocks.delete(channelId);
    }

    /**
     * Record a break start
     * @param {string} channelId - Channel ID
     * @param {string} type - Break type (short/long)
     */
    recordBreakStart(channelId, type) {
        if (!this.breakHistory.has(channelId)) {
            this.breakHistory.set(channelId, []);
        }

        const history = this.breakHistory.get(channelId);
        history.push({
            startTime: Date.now(),
            type: type,
            endTime: null
        });

        // Keep only last 10 breaks
        if (history.length > 10) {
            history.shift();
        }

        console.log(`[BREAK_PREVENTION] Recorded ${type} break start for ${channelId}`);
    }

    /**
     * Record a break end
     * @param {string} channelId - Channel ID
     */
    recordBreakEnd(channelId) {
        const history = this.breakHistory.get(channelId);
        if (history && history.length > 0) {
            const lastBreak = history[history.length - 1];
            lastBreak.endTime = Date.now();
            console.log(`[BREAK_PREVENTION] Recorded break end for ${channelId}`);
        }
    }

    /**
     * Get break statistics for debugging
     * @param {string} channelId - Channel ID
     */
    getBreakStats(channelId) {
        const history = this.breakHistory.get(channelId);
        if (!history || history.length === 0) {
            return { hasHistory: false };
        }

        const now = Date.now();
        const lastBreak = history[history.length - 1];
        
        return {
            hasHistory: true,
            totalBreaks: history.length,
            lastBreakType: lastBreak.type,
            lastBreakStart: new Date(lastBreak.startTime).toISOString(),
            lastBreakEnd: lastBreak.endTime ? new Date(lastBreak.endTime).toISOString() : 'In Progress',
            timeSinceLastBreak: Math.floor((now - lastBreak.startTime) / 60000) + ' minutes',
            currentlyInBreak: !lastBreak.endTime,
            breakPattern: history.slice(-5).map(b => ({
                type: b.type,
                duration: b.endTime ? Math.floor((b.endTime - b.startTime) / 60000) + 'min' : 'ongoing'
            }))
        };
    }

    /**
     * Clear break history for a channel (use when resetting)
     * @param {string} channelId - Channel ID
     */
    clearHistory(channelId) {
        this.breakHistory.delete(channelId);
        this.breakLocks.delete(channelId);
        console.log(`[BREAK_PREVENTION] Cleared history for ${channelId}`);
    }
}

// Create singleton instance
const breakLoopPrevention = new BreakLoopPrevention();

/**
 * Safe break start wrapper
 * Use this instead of directly calling startBreak
 */
async function safeStartBreak(channel, dbEntry, isLongBreak, powerLevel, preSelectedEvent) {
    const channelId = channel.id;
    
    // Check if we can start a break
    const check = breakLoopPrevention.canStartBreak(channelId, dbEntry);
    if (!check.canStart) {
        console.log(`[SAFE_START_BREAK] Cannot start break for ${channelId}: ${check.reason}`);
        return false;
    }

    // Lock the operation
    breakLoopPrevention.lockBreakOperation(channelId, 'START_BREAK');

    try {
        // Record the break start
        breakLoopPrevention.recordBreakStart(channelId, isLongBreak ? 'long' : 'short');

        // Call original startBreak function
        // You'll need to import or pass the original function
        console.log(`[SAFE_START_BREAK] Starting ${isLongBreak ? 'long' : 'short'} break for ${channelId}`);
        
        // Add the actual startBreak call here
        // await startBreak(channel, dbEntry, isLongBreak, powerLevel, preSelectedEvent);
        
        return true;
    } catch (error) {
        console.error(`[SAFE_START_BREAK] Error starting break for ${channelId}:`, error);
        return false;
    } finally {
        // Always unlock
        breakLoopPrevention.unlockBreakOperation(channelId);
    }
}

/**
 * Safe break end wrapper
 * Use this instead of directly calling endBreak
 */
async function safeEndBreak(channel, dbEntry, powerLevel) {
    const channelId = channel.id;

    // Lock the operation
    breakLoopPrevention.lockBreakOperation(channelId, 'END_BREAK');

    try {
        // Record the break end
        breakLoopPrevention.recordBreakEnd(channelId);

        // Call original endBreak function
        console.log(`[SAFE_END_BREAK] Ending break for ${channelId}`);
        
        // Add the actual endBreak call here
        // await endBreak(channel, dbEntry, powerLevel);
        
        return true;
    } catch (error) {
        console.error(`[SAFE_END_BREAK] Error ending break for ${channelId}:`, error);
        return false;
    } finally {
        // Always unlock
        breakLoopPrevention.unlockBreakOperation(channelId);
    }
}

/**
 * Emergency break reset function
 * Use when a channel is stuck in a break loop
 */
async function emergencyBreakReset(channelId, gachaVC, mapCacheSystem) {
    console.log(`[EMERGENCY_RESET] Resetting break state for ${channelId}`);

    try {
        // Clear prevention history
        breakLoopPrevention.clearHistory(channelId);

        // Clear from database
        await gachaVC.updateOne(
            { channelId },
            {
                $unset: {
                    'gameData.breakInfo': 1,
                    'gameData.specialEvent': 1,
                    'gameData.breakJustEnded': 1
                },
                $set: {
                    'gameData.miningResumedAt': Date.now(),
                    nextShopRefresh: new Date(Date.now() + 25 * 60 * 1000), // 25 minutes from now
                    nextTrigger: new Date(Date.now() + 1000)
                }
            }
        );

        // Clear from cache
        if (mapCacheSystem) {
            mapCacheSystem.deleteField(channelId, 'breakInfo');
            mapCacheSystem.deleteField(channelId, 'specialEvent');
            mapCacheSystem.deleteField(channelId, 'breakJustEnded');
            await mapCacheSystem.forceFlush();
            mapCacheSystem.clearChannel(channelId);
        }

        console.log(`[EMERGENCY_RESET] Successfully reset ${channelId}`);
        return true;
    } catch (error) {
        console.error(`[EMERGENCY_RESET] Failed to reset ${channelId}:`, error);
        return false;
    }
}

// Export for use in main mining file
module.exports = {
    breakLoopPrevention,
    safeStartBreak,
    safeEndBreak,
    emergencyBreakReset,
    
    // Direct access to prevention checks
    canStartBreak: (channelId, dbEntry) => breakLoopPrevention.canStartBreak(channelId, dbEntry),
    getBreakStats: (channelId) => breakLoopPrevention.getBreakStats(channelId),
    
    // Constants for consistency
    MINIMUM_MINING_DURATION,
    BREAK_COOLDOWN_PERIOD
};

// Integration Instructions:
// 1. Save this file as patterns/gachaModes/mining/mining_break_hotfix.js
// 2. In your main mining file, add at the top:
//    const { safeStartBreak, safeEndBreak, canStartBreak } = require('./mining/mining_break_hotfix');
// 
// 3. Replace all calls to startBreak() with safeStartBreak()
// 4. Replace all calls to endBreak() with safeEndBreak()
// 
// 5. In the main mining event handler, before checking shouldStartBreak, add:
//    const breakCheck = canStartBreak(channelId, dbEntry);
//    if (!breakCheck.canStart) {
//        console.log(`[MINING] ${breakCheck.reason}`);
//        return;
//    }
//
// 6. For stuck channels, run:
//    const { emergencyBreakReset } = require('./mining/mining_break_hotfix');
//    await emergencyBreakReset(channelId, gachaVC, mapCacheSystem);
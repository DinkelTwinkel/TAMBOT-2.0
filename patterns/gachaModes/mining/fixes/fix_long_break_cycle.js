// fix_long_break_cycle.js - Fix for long breaks repeating due to cycleCount issues

/**
 * Initialize or fix cycleCount for a channel
 */
function initializeCycleCount(gameData) {
    if (gameData.cycleCount === undefined || gameData.cycleCount === null) {
        console.log('[CYCLE FIX] Initializing cycleCount to 0');
        gameData.cycleCount = 0;
        return true;
    }
    return false;
}

/**
 * Verify cycle count is properly incrementing
 */
function verifyCycleCount(channelId, cycleCount) {
    // Log the cycle count for debugging
    console.log(`[CYCLE COUNT] Channel ${channelId}: Cycle ${cycleCount}`);
    console.log(`[CYCLE COUNT] Next break type: ${(cycleCount % 4) === 3 ? 'LONG BREAK' : 'SHORT BREAK'}`);
    console.log(`[CYCLE COUNT] Pattern: Cycle ${cycleCount} % 4 = ${cycleCount % 4}`);
    
    // Pattern should be:
    // Cycle 0: % 4 = 0 -> SHORT
    // Cycle 1: % 4 = 1 -> SHORT  
    // Cycle 2: % 4 = 2 -> SHORT
    // Cycle 3: % 4 = 3 -> LONG
    // Cycle 4: % 4 = 0 -> SHORT (restart pattern)
    
    return {
        current: cycleCount,
        isLongBreakNext: (cycleCount % 4) === 3,
        pattern: `${cycleCount} % 4 = ${cycleCount % 4}`,
        nextCycle: cycleCount + 1
    };
}

/**
 * Fix stuck cycle count (if it's not incrementing)
 */
async function fixStuckCycleCount(channelId, gachaVC) {
    try {
        const channel = await gachaVC.findOne({ channelId });
        if (!channel) {
            console.log(`[CYCLE FIX] Channel ${channelId} not found`);
            return false;
        }
        
        const currentCycle = channel.gameData?.cycleCount || 0;
        const lastCycleUpdate = channel.gameData?.lastCycleUpdate || 0;
        const now = Date.now();
        
        // If cycle hasn't been updated in over 2 hours, it might be stuck
        if (lastCycleUpdate && (now - lastCycleUpdate) > 2 * 60 * 60 * 1000) {
            console.log(`[CYCLE FIX] Cycle count stuck at ${currentCycle} for channel ${channelId}`);
            
            // Force increment the cycle
            const newCycle = currentCycle + 1;
            await gachaVC.updateOne(
                { channelId },
                { 
                    $set: { 
                        'gameData.cycleCount': newCycle,
                        'gameData.lastCycleUpdate': now
                    }
                }
            );
            
            console.log(`[CYCLE FIX] Force incremented cycle from ${currentCycle} to ${newCycle}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`[CYCLE FIX] Error fixing stuck cycle:`, error);
        return false;
    }
}

/**
 * Enhanced calculateNextBreakTime with better cycle tracking
 */
function calculateNextBreakTimeFixed(dbEntry, MINING_DURATION, SHORT_BREAK_DURATION, LONG_BREAK_DURATION) {
    const now = Date.now();
    let cycleCount = dbEntry.gameData?.cycleCount;
    
    // Initialize if missing
    if (cycleCount === undefined || cycleCount === null) {
        console.log('[CYCLE FIX] cycleCount was undefined, initializing to 0');
        cycleCount = 0;
    }
    
    // Verify the cycle pattern
    const verification = verifyCycleCount(dbEntry.channelId, cycleCount);
    
    const isLongBreakCycle = (cycleCount % 4) === 3;
    
    // CRITICAL: Ensure we're creating a proper future timestamp
    const nextBreakTime = new Date(now + MINING_DURATION);
    
    console.log(`[CYCLE FIX] Cycle ${cycleCount}: Next break at ${nextBreakTime.toISOString()}`);
    console.log(`[CYCLE FIX] This will be a ${isLongBreakCycle ? 'LONG' : 'SHORT'} break`);
    
    if (isLongBreakCycle) {
        return {
            nextShopRefresh: nextBreakTime,
            breakDuration: LONG_BREAK_DURATION,
            isLongBreak: true,
            cycleInfo: verification
        };
    } else {
        return {
            nextShopRefresh: nextBreakTime,
            breakDuration: SHORT_BREAK_DURATION,
            isLongBreak: false,
            cycleInfo: verification
        };
    }
}

/**
 * Debug all mining channels to check their cycle status
 */
async function debugAllCycles(gachaVC) {
    try {
        const channels = await gachaVC.find({ 'gameData.gamemode': 'mining' });
        
        console.log('\n=== CYCLE COUNT DEBUG REPORT ===');
        console.log(`Found ${channels.length} mining channels\n`);
        
        for (const channel of channels) {
            const cycleCount = channel.gameData?.cycleCount || 0;
            const inBreak = channel.gameData?.breakInfo?.inBreak || false;
            const isLongBreak = channel.gameData?.breakInfo?.isLongBreak || false;
            const nextBreak = channel.nextShopRefresh;
            
            console.log(`Channel: ${channel.channelId}`);
            console.log(`  Cycle Count: ${cycleCount}`);
            console.log(`  Next cycle will be: ${(cycleCount % 4) === 3 ? 'LONG BREAK' : 'SHORT BREAK'}`);
            console.log(`  Currently in break: ${inBreak} (${isLongBreak ? 'LONG' : 'SHORT'})`);
            console.log(`  Next break time: ${nextBreak ? new Date(nextBreak).toISOString() : 'Not set'}`);
            console.log('');
        }
        
        console.log('=== END REPORT ===\n');
        
    } catch (error) {
        console.error('[CYCLE DEBUG] Error:', error);
    }
}

/**
 * Force fix a channel that's stuck in long break loops
 */
async function forceFixLongBreakLoop(channelId, gachaVC) {
    try {
        console.log(`[CYCLE FIX] Force fixing long break loop for channel ${channelId}`);
        
        const channel = await gachaVC.findOne({ channelId });
        if (!channel) {
            console.log(`[CYCLE FIX] Channel not found`);
            return false;
        }
        
        const currentCycle = channel.gameData?.cycleCount || 0;
        
        // If current cycle would trigger a long break, increment it to skip
        if ((currentCycle % 4) === 3) {
            const newCycle = currentCycle + 1;
            console.log(`[CYCLE FIX] Skipping long break cycle ${currentCycle} -> ${newCycle}`);
            
            await gachaVC.updateOne(
                { channelId },
                { 
                    $set: { 
                        'gameData.cycleCount': newCycle,
                        'gameData.lastCycleUpdate': Date.now()
                    }
                }
            );
            
            return true;
        }
        
        // If we're in a break, check if it's supposed to be long
        if (channel.gameData?.breakInfo?.inBreak && channel.gameData?.breakInfo?.isLongBreak) {
            // Force it to be a short break instead
            console.log(`[CYCLE FIX] Converting long break to short break`);
            
            await gachaVC.updateOne(
                { channelId },
                { 
                    $set: { 
                        'gameData.breakInfo.isLongBreak': false,
                        'gameData.cycleCount': currentCycle + 1
                    }
                }
            );
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`[CYCLE FIX] Error force fixing:`, error);
        return false;
    }
}

module.exports = {
    initializeCycleCount,
    verifyCycleCount,
    fixStuckCycleCount,
    calculateNextBreakTimeFixed,
    debugAllCycles,
    forceFixLongBreakLoop
};

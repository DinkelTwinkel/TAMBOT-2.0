// debug_and_fix_cycles.js - Debug and fix long break cycle issues

const gachaVC = require('../../../models/activevcs');
const mapCacheSystem = require('./cache/mapCacheSystem');

/**
 * Debug all mining channels to see their cycle status
 */
async function debugAllChannels() {
    try {
        const channels = await gachaVC.find({ 'gameData.gamemode': 'mining' });
        
        console.log('\n=== MINING CYCLE DEBUG REPORT ===');
        console.log(`Found ${channels.length} mining channels\n`);
        
        const issues = [];
        
        for (const channel of channels) {
            const channelId = channel.channelId;
            const cycleCount = channel.gameData?.cycleCount;
            const inBreak = channel.gameData?.breakInfo?.inBreak || false;
            const isLongBreak = channel.gameData?.breakInfo?.isLongBreak || false;
            const nextBreak = channel.nextShopRefresh;
            const breakEndTime = channel.gameData?.breakInfo?.breakEndTime;
            const now = Date.now();
            
            // Check for issues
            const problems = [];
            
            // Issue 1: Missing cycleCount
            if (cycleCount === undefined || cycleCount === null) {
                problems.push('Missing cycleCount');
            }
            
            // Issue 2: Expired break still active
            if (inBreak && breakEndTime && now >= breakEndTime) {
                problems.push(`Break expired ${Math.floor((now - breakEndTime) / 60000)} minutes ago`);
            }
            
            // Issue 3: Stuck on long break cycle
            if (cycleCount !== undefined && (cycleCount % 4) === 3 && !inBreak) {
                problems.push('Should be in long break but isn\'t');
            }
            
            // Issue 4: Wrong break type
            if (inBreak && cycleCount !== undefined) {
                const expectedLongBreak = (cycleCount % 4) === 3;
                if (expectedLongBreak !== isLongBreak) {
                    problems.push(`Wrong break type: expected ${expectedLongBreak ? 'LONG' : 'SHORT'}, got ${isLongBreak ? 'LONG' : 'SHORT'}`);
                }
            }
            
            console.log(`Channel: ${channelId}`);
            console.log(`  Cycle Count: ${cycleCount !== undefined ? cycleCount : 'UNDEFINED'}`);
            console.log(`  Pattern: ${cycleCount !== undefined ? `${cycleCount} % 4 = ${cycleCount % 4}` : 'N/A'}`);
            console.log(`  Expected next: ${cycleCount !== undefined ? ((cycleCount % 4) === 3 ? 'LONG BREAK' : 'SHORT BREAK') : 'UNKNOWN'}`);
            console.log(`  Currently in break: ${inBreak} (${isLongBreak ? 'LONG' : 'SHORT'})`);
            
            if (breakEndTime) {
                const remaining = breakEndTime - now;
                if (remaining > 0) {
                    console.log(`  Break ends in: ${Math.ceil(remaining / 60000)} minutes`);
                } else {
                    console.log(`  Break EXPIRED: ${Math.floor(-remaining / 60000)} minutes ago`);
                }
            }
            
            if (nextBreak) {
                const timeUntil = new Date(nextBreak).getTime() - now;
                if (timeUntil > 0) {
                    console.log(`  Next break in: ${Math.ceil(timeUntil / 60000)} minutes`);
                } else {
                    console.log(`  Next break OVERDUE: ${Math.floor(-timeUntil / 60000)} minutes ago`);
                }
            }
            
            if (problems.length > 0) {
                console.log(`  ⚠️ PROBLEMS: ${problems.join(', ')}`);
                issues.push({ channelId, problems });
            }
            
            console.log('');
        }
        
        if (issues.length > 0) {
            console.log('=== CHANNELS WITH ISSUES ===');
            for (const issue of issues) {
                console.log(`${issue.channelId}: ${issue.problems.join(', ')}`);
            }
            console.log('\nRun fixAllIssues() to automatically fix these problems');
        } else {
            console.log('✅ No issues found!');
        }
        
        console.log('=== END REPORT ===\n');
        
        return issues;
        
    } catch (error) {
        console.error('[DEBUG] Error:', error);
        return [];
    }
}

/**
 * Fix all detected issues
 */
async function fixAllIssues() {
    try {
        const issues = await debugAllChannels();
        
        if (issues.length === 0) {
            console.log('No issues to fix!');
            return;
        }
        
        console.log(`\n=== FIXING ${issues.length} CHANNELS ===\n`);
        
        for (const issue of issues) {
            await fixChannel(issue.channelId);
        }
        
        console.log('\n=== FIXES COMPLETE ===\n');
        
        // Re-run debug to verify fixes
        console.log('Verifying fixes...');
        await debugAllChannels();
        
    } catch (error) {
        console.error('[FIX ALL] Error:', error);
    }
}

/**
 * Fix a specific channel
 */
async function fixChannel(channelId) {
    try {
        console.log(`[FIX] Fixing channel ${channelId}...`);
        
        const channel = await gachaVC.findOne({ channelId });
        if (!channel) {
            console.log(`[FIX] Channel not found`);
            return false;
        }
        
        const updates = {};
        const now = Date.now();
        
        // Fix 1: Initialize missing cycleCount
        if (channel.gameData?.cycleCount === undefined || channel.gameData?.cycleCount === null) {
            console.log(`[FIX] Initializing cycleCount to 0`);
            updates['gameData.cycleCount'] = 0;
        }
        
        // Fix 2: Clear expired breaks
        if (channel.gameData?.breakInfo?.inBreak) {
            const breakEndTime = channel.gameData.breakInfo.breakEndTime;
            if (breakEndTime && now >= breakEndTime) {
                console.log(`[FIX] Clearing expired break`);
                updates.$unset = { 'gameData.breakInfo': 1 };
                updates['gameData.breakJustEnded'] = now;
                updates.nextTrigger = new Date(now + 1000);
            }
        }
        
        // Fix 3: Force increment stuck cycle counts
        const cycleCount = channel.gameData?.cycleCount || 0;
        if ((cycleCount % 4) === 3 && !channel.gameData?.breakInfo?.inBreak) {
            // Stuck on long break cycle
            console.log(`[FIX] Incrementing stuck cycle ${cycleCount} -> ${cycleCount + 1}`);
            updates['gameData.cycleCount'] = cycleCount + 1;
        }
        
        // Fix 4: Clear tent flags if not in break
        if (!channel.gameData?.breakInfo?.inBreak && channel.gameData?.map?.playerPositions) {
            let hasTentFlags = false;
            for (const pos of Object.values(channel.gameData.map.playerPositions)) {
                if (pos.isTent) {
                    hasTentFlags = true;
                    break;
                }
            }
            
            if (hasTentFlags) {
                console.log(`[FIX] Clearing tent flags`);
                const cleanedPositions = {};
                for (const [playerId, pos] of Object.entries(channel.gameData.map.playerPositions)) {
                    cleanedPositions[playerId] = {
                        x: pos.x,
                        y: pos.y,
                        isTent: false,
                        hidden: false,
                        disabled: pos.disabled || false
                    };
                }
                updates['gameData.map.playerPositions'] = cleanedPositions;
            }
        }
        
        // Apply updates if any
        if (Object.keys(updates).length > 0 || updates.$unset) {
            const updateQuery = {};
            if (updates.$unset) {
                updateQuery.$unset = updates.$unset;
                delete updates.$unset;
            }
            if (Object.keys(updates).length > 0) {
                updateQuery.$set = updates;
            }
            
            await gachaVC.updateOne({ channelId }, updateQuery);
            
            // Clear cache
            mapCacheSystem.clearChannel(channelId);
            
            console.log(`[FIX] Applied ${Object.keys(updates).length} fixes to channel ${channelId}`);
            return true;
        } else {
            console.log(`[FIX] No fixes needed for channel ${channelId}`);
            return false;
        }
        
    } catch (error) {
        console.error(`[FIX] Error fixing channel ${channelId}:`, error);
        return false;
    }
}

/**
 * Force reset a channel's cycle to 0
 */
async function resetChannelCycle(channelId) {
    try {
        console.log(`[RESET] Resetting cycle for channel ${channelId}...`);
        
        await gachaVC.updateOne(
            { channelId },
            { 
                $set: { 
                    'gameData.cycleCount': 0
                },
                $unset: {
                    'gameData.breakInfo': 1
                }
            }
        );
        
        mapCacheSystem.clearChannel(channelId);
        
        console.log(`[RESET] Cycle reset to 0 for channel ${channelId}`);
        return true;
        
    } catch (error) {
        console.error(`[RESET] Error:`, error);
        return false;
    }
}

// Export functions
module.exports = {
    debugAllChannels,
    fixAllIssues,
    fixChannel,
    resetChannelCycle
};

// If run directly, execute debug
if (require.main === module) {
    console.log('Running mining cycle debug...');
    debugAllChannels()
        .then(() => {
            console.log('\nTo fix issues, run: node debug_and_fix_cycles.js --fix');
            
            if (process.argv.includes('--fix')) {
                return fixAllIssues();
            }
        })
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Failed:', error);
            process.exit(1);
        });
}

// Emergency Channel Reset Tool
// Use this when a channel is completely stuck and needs a hard reset

const gachaVC = require('../../../models/activevcs');
const mapCacheSystem = require('../mining/cache/mapCacheSystem');

async function emergencyReset(channelId, options = {}) {
    const {
        clearBreak = true,
        resetMinecart = false,
        resetPositions = true,
        clearCache = true,
        verbose = true
    } = options;
    
    const log = verbose ? console.log : () => {};
    
    try {
        log(`\n🚨 EMERGENCY RESET for channel ${channelId}`);
        log('=' .repeat(50));
        
        // Step 1: Get current state
        const dbEntry = await gachaVC.findOne({ channelId });
        if (!dbEntry) {
            log('❌ Channel not found in database');
            return false;
        }
        
        log('📊 Current state:');
        log(`  - In break: ${dbEntry.gameData?.breakInfo?.inBreak || false}`);
        log(`  - Minecart items: ${Object.keys(dbEntry.gameData?.minecart?.items || {}).length}`);
        log(`  - Players: ${Object.keys(dbEntry.gameData?.map?.playerPositions || {}).length}`);
        
        const updates = {};
        const unsets = {};
        
        // Step 2: Clear break if requested
        if (clearBreak && dbEntry.gameData?.breakInfo) {
            log('🔧 Clearing break state...');
            unsets['gameData.breakInfo'] = 1;
            updates['gameData.breakJustEnded'] = Date.now();
            updates.nextTrigger = new Date(Date.now() + 1000);
        }
        
        // Step 3: Reset minecart if requested
        if (resetMinecart) {
            log('🔧 Resetting minecart...');
            updates['gameData.minecart'] = {
                items: {},
                contributors: {}
            };
        } else {
            // Just ensure structure exists
            if (!dbEntry.gameData?.minecart) {
                log('🔧 Initializing minecart structure...');
                updates['gameData.minecart'] = {
                    items: {},
                    contributors: {}
                };
            }
        }
        
        // Step 4: Reset player positions if requested
        if (resetPositions && dbEntry.gameData?.map) {
            log('🔧 Resetting player positions...');
            const positions = dbEntry.gameData.map.playerPositions || {};
            const resetPos = {};
            
            for (const playerId of Object.keys(positions)) {
                resetPos[playerId] = {
                    x: dbEntry.gameData.map.entranceX || 0,
                    y: dbEntry.gameData.map.entranceY || 0,
                    isTent: false,
                    hidden: false,
                    stuck: false,
                    trapped: false,
                    disabled: false
                };
            }
            
            updates['gameData.map.playerPositions'] = resetPos;
        }
        
        // Step 5: Clear disabled players
        if (dbEntry.gameData?.disabledPlayers) {
            log('🔧 Clearing disabled players...');
            unsets['gameData.disabledPlayers'] = 1;
        }
        
        // Step 6: Reset cycle count if break was stuck
        if (clearBreak && dbEntry.gameData?.breakInfo) {
            const cycleCount = (dbEntry.gameData?.cycleCount || 0) + 1;
            updates['gameData.cycleCount'] = cycleCount;
            
            // Calculate next break time
            const MINING_DURATION = 25 * 60 * 1000;
            updates.nextShopRefresh = new Date(Date.now() + MINING_DURATION);
        }
        
        // Step 7: Apply database updates
        const updateQuery = {};
        if (Object.keys(updates).length > 0) {
            updateQuery.$set = updates;
        }
        if (Object.keys(unsets).length > 0) {
            updateQuery.$unset = unsets;
        }
        
        if (Object.keys(updateQuery).length > 0) {
            log('💾 Applying database updates...');
            await gachaVC.updateOne({ channelId }, updateQuery);
        }
        
        // Step 8: Clear cache if requested
        if (clearCache) {
            log('🔧 Clearing cache...');
            mapCacheSystem.clearChannel(channelId);
            await mapCacheSystem.forceFlush();
            
            // Re-initialize with fresh data
            await mapCacheSystem.initialize(channelId, true);
        }
        
        // Step 9: Clear any locks (if instance manager available)
        try {
            const instanceManager = require('../instance-manager');
            instanceManager.forceKillChannel(channelId);
            log('🔧 Cleared instance locks');
        } catch (e) {
            // Instance manager might not be available
        }
        
        log('\n✅ EMERGENCY RESET COMPLETE');
        log('=' .repeat(50));
        
        // Verify the reset
        const verifyEntry = await gachaVC.findOne({ channelId });
        log('\n📊 New state:');
        log(`  - In break: ${verifyEntry.gameData?.breakInfo?.inBreak || false}`);
        log(`  - Minecart items: ${Object.keys(verifyEntry.gameData?.minecart?.items || {}).length}`);
        log(`  - Players: ${Object.keys(verifyEntry.gameData?.map?.playerPositions || {}).length}`);
        
        return true;
        
    } catch (error) {
        console.error('❌ Emergency reset failed:', error);
        return false;
    }
}

// Batch reset for multiple channels
async function batchReset(channelIds, options = {}) {
    console.log(`\n🔄 Batch resetting ${channelIds.length} channels...`);
    
    const results = {
        success: [],
        failed: []
    };
    
    for (const channelId of channelIds) {
        const success = await emergencyReset(channelId, { ...options, verbose: false });
        
        if (success) {
            results.success.push(channelId);
            console.log(`  ✅ ${channelId}`);
        } else {
            results.failed.push(channelId);
            console.log(`  ❌ ${channelId}`);
        }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`  Success: ${results.success.length}`);
    console.log(`  Failed: ${results.failed.length}`);
    
    return results;
}

// Find and fix all stuck channels
async function findAndFixStuck() {
    console.log('\n🔍 Finding stuck channels...');
    
    const now = Date.now();
    const stuck = [];
    
    // Find channels with expired breaks
    const withBreaks = await gachaVC.find({
        'gameData.breakInfo.inBreak': true
    });
    
    for (const entry of withBreaks) {
        if (entry.gameData?.breakInfo?.breakEndTime) {
            if (entry.gameData.breakInfo.breakEndTime < now) {
                const minutesExpired = Math.floor((now - entry.gameData.breakInfo.breakEndTime) / 60000);
                stuck.push({
                    channelId: entry.channelId,
                    issue: `Break expired ${minutesExpired} minutes ago`
                });
            }
        }
    }
    
    // Find channels with timer mismatches
    const withTimers = await gachaVC.find({
        nextShopRefresh: { $lt: new Date(now) },
        'gameData.breakInfo.inBreak': { $ne: true }
    });
    
    for (const entry of withTimers) {
        const minutesOverdue = Math.floor((now - new Date(entry.nextShopRefresh)) / 60000);
        stuck.push({
            channelId: entry.channelId,
            issue: `Timer overdue by ${minutesOverdue} minutes`
        });
    }
    
    console.log(`Found ${stuck.length} stuck channels\n`);
    
    if (stuck.length > 0) {
        console.log('Stuck channels:');
        for (const channel of stuck) {
            console.log(`  ${channel.channelId}: ${channel.issue}`);
        }
        
        console.log('\n🔧 Fixing stuck channels...');
        const channelIds = stuck.map(s => s.channelId);
        const results = await batchReset(channelIds, {
            clearBreak: true,
            resetMinecart: false,
            resetPositions: true,
            clearCache: true
        });
        
        return results;
    }
    
    return { success: [], failed: [] };
}

// CLI interface
if (require.main === module) {
    const command = process.argv[2];
    const channelId = process.argv[3];
    
    (async () => {
        switch (command) {
            case 'reset':
                if (!channelId) {
                    console.log('❌ Please provide a channel ID');
                    process.exit(1);
                }
                await emergencyReset(channelId);
                break;
                
            case 'reset-hard':
                if (!channelId) {
                    console.log('❌ Please provide a channel ID');
                    process.exit(1);
                }
                await emergencyReset(channelId, {
                    clearBreak: true,
                    resetMinecart: true,
                    resetPositions: true,
                    clearCache: true
                });
                break;
                
            case 'find-stuck':
                await findAndFixStuck();
                break;
                
            default:
                console.log('Emergency Channel Reset Tool');
                console.log('===========================');
                console.log('Usage:');
                console.log('  node emergency_reset.js reset <channelId>      - Soft reset (keep minecart)');
                console.log('  node emergency_reset.js reset-hard <channelId> - Hard reset (clear everything)');
                console.log('  node emergency_reset.js find-stuck             - Find and fix all stuck channels');
                break;
        }
        
        process.exit(0);
    })();
}

module.exports = {
    emergencyReset,
    batchReset,
    findAndFixStuck
};

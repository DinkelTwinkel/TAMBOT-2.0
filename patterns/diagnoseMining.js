// diagnoseMining.js - Diagnose mining channel issues without resetting

const mongoose = require('mongoose');
require('dotenv').config();
const gachaVC = require('../models/activevcs');
const mapCacheSystem = require('./gachaModes/mining/cache/mapCacheSystem');
const instanceManager = require('./gachaModes/instance-manager');

async function diagnoseChannel(channelId) {
    console.log('\n' + '='.repeat(60));
    console.log(`MINING CHANNEL DIAGNOSTICS: ${channelId}`);
    console.log('='.repeat(60) + '\n');
    
    const issues = [];
    const warnings = [];
    const info = [];
    
    try {
        // Connect to MongoDB if needed
        if (mongoose.connection.readyState !== 1) {
            console.log('📡 Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tambot');
            console.log('✅ Connected to MongoDB\n');
        }
        
        // 1. Check database entry
        console.log('1️⃣ Checking database entry...');
        const dbEntry = await gachaVC.findOne({ channelId });
        
        if (!dbEntry) {
            console.log('   ❌ No database entry found');
            issues.push('No database entry - channel not initialized');
            return { issues, warnings, info };
        }
        
        console.log('   ✅ Database entry found');
        
        if (!dbEntry.gameData) {
            issues.push('No gameData - corrupted entry');
            console.log('   ❌ No gameData object');
            return { issues, warnings, info };
        }
        
        // 2. Check game mode
        console.log('\n2️⃣ Checking game mode...');
        const gamemode = dbEntry.gameData.gamemode;
        console.log(`   Mode: ${gamemode || 'NOT SET'}`);
        
        if (gamemode !== 'mining') {
            warnings.push(`Game mode is '${gamemode}' not 'mining'`);
            console.log('   ⚠️ Not in mining mode');
        }
        
        // 3. Check break status
        console.log('\n3️⃣ Checking break status...');
        const now = Date.now();
        const breakInfo = dbEntry.gameData.breakInfo;
        
        if (breakInfo?.inBreak) {
            console.log('   📍 Currently in break');
            console.log(`      Type: ${breakInfo.isLongBreak ? 'LONG' : 'SHORT'}`);
            
            if (breakInfo.breakEndTime) {
                const endTime = new Date(breakInfo.breakEndTime);
                const remaining = endTime - now;
                
                if (remaining < 0) {
                    issues.push(`Break expired ${Math.abs(remaining / 60000).toFixed(1)} minutes ago`);
                    console.log(`   ❌ Break should have ended ${Math.abs(remaining / 60000).toFixed(1)} min ago`);
                } else {
                    info.push(`Break ends in ${(remaining / 60000).toFixed(1)} minutes`);
                    console.log(`   ⏰ Break ends in ${(remaining / 60000).toFixed(1)} min`);
                }
            } else {
                warnings.push('In break but no end time set');
                console.log('   ⚠️ No break end time');
            }
        } else {
            console.log('   ✅ Not in break (mining active)');
        }
        
        // 4. Check next trigger times
        console.log('\n4️⃣ Checking trigger times...');
        
        if (dbEntry.nextTrigger) {
            const nextTrigger = new Date(dbEntry.nextTrigger);
            const timeUntil = nextTrigger - now;
            
            if (timeUntil < -3600000) { // More than 1 hour overdue
                issues.push(`Next trigger overdue by ${Math.abs(timeUntil / 60000).toFixed(1)} minutes`);
                console.log(`   ❌ Trigger overdue by ${Math.abs(timeUntil / 60000).toFixed(1)} min`);
            } else if (timeUntil < 0) {
                warnings.push(`Trigger slightly overdue (${Math.abs(timeUntil / 1000).toFixed(0)}s)`);
                console.log(`   ⚠️ Trigger overdue by ${Math.abs(timeUntil / 1000).toFixed(0)}s`);
            } else {
                console.log(`   ✅ Next trigger in ${(timeUntil / 1000).toFixed(0)}s`);
            }
        }
        
        if (dbEntry.nextShopRefresh) {
            const nextShop = new Date(dbEntry.nextShopRefresh);
            const timeUntil = nextShop - now;
            console.log(`   🛒 Next shop refresh in ${(timeUntil / 60000).toFixed(1)} min`);
        }
        
        // 5. Check cycle count
        console.log('\n5️⃣ Checking cycle count...');
        const cycleCount = dbEntry.gameData.cycleCount || 0;
        const expectedBreakType = (cycleCount % 4) === 3 ? 'LONG' : 'SHORT';
        console.log(`   Cycle: ${cycleCount} (next break: ${expectedBreakType})`);
        
        // 6. Check minecart
        console.log('\n6️⃣ Checking minecart...');
        const minecart = dbEntry.gameData.minecart;
        
        if (!minecart) {
            warnings.push('No minecart data');
            console.log('   ⚠️ No minecart object');
        } else {
            const itemCount = Object.keys(minecart.items || {}).length;
            const contributorCount = Object.keys(minecart.contributors || {}).length;
            
            console.log(`   📦 Items: ${itemCount}`);
            console.log(`   👥 Contributors: ${contributorCount}`);
            
            if (itemCount > 100) {
                warnings.push(`Minecart has ${itemCount} items (may cause performance issues)`);
            }
        }
        
        // 7. Check map
        console.log('\n7️⃣ Checking map data...');
        const map = dbEntry.gameData.map;
        
        if (!map) {
            issues.push('No map data');
            console.log('   ❌ No map object');
        } else {
            const playerCount = Object.keys(map.playerPositions || {}).length;
            console.log(`   📍 Map size: ${map.width}x${map.height}`);
            console.log(`   👥 Players on map: ${playerCount}`);
            console.log(`   🚪 Entrance: (${map.entranceX}, ${map.entranceY})`);
            
            // Check for tent flags
            let tentCount = 0;
            for (const pos of Object.values(map.playerPositions || {})) {
                if (pos.isTent) tentCount++;
            }
            
            if (tentCount > 0 && !breakInfo?.inBreak) {
                issues.push(`${tentCount} players showing as tents but not in break`);
                console.log(`   ❌ ${tentCount} tent flags outside of break`);
            }
        }
        
        // 8. Check instance status
        console.log('\n8️⃣ Checking instance status...');
        const hasInstance = instanceManager.hasActiveInstance(channelId);
        const instanceInfo = instanceManager.getInstanceInfo(channelId);
        
        if (hasInstance) {
            console.log(`   🔒 Active instance (PID: ${instanceInfo?.pid || 'unknown'})`);
            if (instanceInfo?.startTime) {
                const runtime = (now - instanceInfo.startTime) / 1000;
                console.log(`   ⏱️ Running for ${runtime.toFixed(0)}s`);
                
                if (runtime > 7200) { // 2 hours
                    warnings.push(`Instance running for ${(runtime / 3600).toFixed(1)} hours`);
                }
            }
        } else {
            console.log('   ✅ No active instance');
        }
        
        // 9. Check cache status
        console.log('\n9️⃣ Checking cache status...');
        const isCached = mapCacheSystem.isCached(channelId);
        
        if (isCached) {
            const cacheData = mapCacheSystem.getCachedData(channelId);
            console.log('   ✅ Channel is cached');
            
            if (cacheData?.lastUpdated) {
                const cacheAge = (now - cacheData.lastUpdated) / 1000;
                console.log(`   📅 Cache age: ${cacheAge.toFixed(0)}s`);
                
                if (cacheAge > 3600) { // 1 hour
                    warnings.push(`Cache is ${(cacheAge / 3600).toFixed(1)} hours old`);
                }
            }
        } else {
            console.log('   ℹ️ Channel not cached');
        }
        
        // 10. Summary
        console.log('\n' + '='.repeat(60));
        console.log('DIAGNOSTIC SUMMARY');
        console.log('='.repeat(60));
        
        if (issues.length === 0 && warnings.length === 0) {
            console.log('\n✅ No issues detected - channel appears healthy');
        } else {
            if (issues.length > 0) {
                console.log('\n❌ Critical Issues:');
                issues.forEach(issue => console.log(`   • ${issue}`));
            }
            
            if (warnings.length > 0) {
                console.log('\n⚠️ Warnings:');
                warnings.forEach(warning => console.log(`   • ${warning}`));
            }
        }
        
        if (info.length > 0) {
            console.log('\nℹ️ Info:');
            info.forEach(i => console.log(`   • ${i}`));
        }
        
        // Recommendations
        if (issues.length > 0) {
            console.log('\n💡 RECOMMENDATION: Reset this channel');
            console.log('   Run: node patterns/resetMiningData.js ' + channelId);
        } else if (warnings.length > 2) {
            console.log('\n💡 RECOMMENDATION: Monitor this channel');
            console.log('   May need reset if issues persist');
        }
        
        return { issues, warnings, info };
        
    } catch (error) {
        console.error('\n❌ Diagnostic failed:', error);
        throw error;
    }
}

// Command line interface
if (require.main === module) {
    const channelId = process.argv[2];
    
    if (!channelId) {
        console.log('Mining Channel Diagnostics');
        console.log('==========================\n');
        console.log('Usage: node diagnoseMining.js <channelId>');
        console.log('Example: node diagnoseMining.js 1234567890123456789');
        console.log('\nThis will analyze the channel and report any issues without making changes.');
        process.exit(1);
    }
    
    diagnoseChannel(channelId)
        .then(results => {
            const exitCode = results.issues.length > 0 ? 1 : 0;
            console.log('\n✨ Diagnostics complete');
            process.exit(exitCode);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { diagnoseChannel };

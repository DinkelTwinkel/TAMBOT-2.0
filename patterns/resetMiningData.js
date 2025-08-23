// resetMiningData.js - Utility script to reset mining data for a channel
// Can be run directly: node resetMiningData.js <channelId>

const mongoose = require('mongoose');
require('dotenv').config();

// Import all the systems we need to clear
const gachaVC = require('../models/activevcs');
const mapCacheSystem = require('./gachaModes/mining/cache/mapCacheSystem');
const hazardStorage = require('./gachaModes/mining/hazardStorage');
const railStorage = require('./gachaModes/mining/railStorage');
const instanceManager = require('./gachaModes/instance-manager');

async function resetChannel(channelId) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESETTING MINING DATA FOR CHANNEL: ${channelId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const results = {
        success: [],
        warnings: [],
        errors: []
    };
    
    try {
        // Connect to MongoDB if not connected
        if (mongoose.connection.readyState !== 1) {
            console.log('📡 Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tambot');
            console.log('✅ Connected to MongoDB');
        }
        
        // 1. Kill instances
        console.log('\n1️⃣ Killing active instances...');
        try {
            instanceManager.forceKillChannel(channelId);
            results.success.push('Instances killed');
            console.log('   ✅ Done');
        } catch (error) {
            results.warnings.push(`Instance kill: ${error.message}`);
            console.log('   ⚠️ Warning:', error.message);
        }
        
        // 2. Clear map cache
        console.log('\n2️⃣ Clearing map cache...');
        try {
            mapCacheSystem.clearChannel(channelId);
            await mapCacheSystem.forceFlush();
            results.success.push('Map cache cleared');
            console.log('   ✅ Done');
        } catch (error) {
            results.warnings.push(`Map cache: ${error.message}`);
            console.log('   ⚠️ Warning:', error.message);
        }
        
        // 3. Clear hazard data
        console.log('\n3️⃣ Clearing hazard data...');
        try {
            await hazardStorage.clearHazardsData(channelId);
            results.success.push('Hazard data cleared');
            console.log('   ✅ Done');
        } catch (error) {
            results.warnings.push(`Hazards: ${error.message}`);
            console.log('   ⚠️ Warning:', error.message);
        }
        
        // 4. Clear rail data
        console.log('\n4️⃣ Clearing rail data...');
        try {
            await railStorage.clearRailsData(channelId);
            results.success.push('Rail data cleared');
            console.log('   ✅ Done');
        } catch (error) {
            results.warnings.push(`Rails: ${error.message}`);
            console.log('   ⚠️ Warning:', error.message);
        }
        
        // 5. Clear global caches
        console.log('\n5️⃣ Clearing global caches...');
        try {
            if (global.dbCache) {
                global.dbCache.delete(channelId);
            }
            if (global.efficiencyCache) {
                global.efficiencyCache.clear();
            }
            results.success.push('Global caches cleared');
            console.log('   ✅ Done');
        } catch (error) {
            results.warnings.push(`Global caches: ${error.message}`);
            console.log('   ⚠️ Warning:', error.message);
        }
        
        // 6. Backup current data
        console.log('\n6️⃣ Backing up current data...');
        const currentEntry = await gachaVC.findOne({ channelId });
        
        if (currentEntry && currentEntry.gameData) {
            const backup = {
                channelId: channelId,
                timestamp: new Date().toISOString(),
                gamemode: currentEntry.gameData.gamemode,
                cycleCount: currentEntry.gameData.cycleCount || 0,
                inBreak: currentEntry.gameData.breakInfo?.inBreak || false,
                minecartItems: currentEntry.gameData.minecart?.items ? 
                    Object.keys(currentEntry.gameData.minecart.items).length : 0,
                minecartValue: 0
            };
            
            // Calculate minecart value
            if (currentEntry.gameData.minecart?.items) {
                for (const [itemId, data] of Object.entries(currentEntry.gameData.minecart.items)) {
                    backup.minecartValue += (data.value || 0) * (data.quantity || 0);
                }
            }
            
            console.log('   📊 Current data:');
            console.log(`      - Mode: ${backup.gamemode}`);
            console.log(`      - Cycle: ${backup.cycleCount}`);
            console.log(`      - In Break: ${backup.inBreak}`);
            console.log(`      - Minecart Items: ${backup.minecartItems}`);
            console.log(`      - Minecart Value: ${backup.minecartValue} coins`);
            
            results.backup = backup;
        } else {
            console.log('   ℹ️ No existing data found');
        }
        
        // 7. Delete database entry
        console.log('\n7️⃣ Deleting database entry...');
        const deleteResult = await gachaVC.deleteOne({ channelId });
        if (deleteResult.deletedCount > 0) {
            results.success.push('Database entry deleted');
            console.log('   ✅ Deleted 1 entry');
        } else {
            console.log('   ℹ️ No entry to delete');
        }
        
        // 8. Final summary
        console.log(`\n${'='.repeat(60)}`);
        console.log('RESET COMPLETE');
        console.log(`${'='.repeat(60)}`);
        
        console.log('\n✅ Successes:', results.success.length);
        results.success.forEach(s => console.log(`   - ${s}`));
        
        if (results.warnings.length > 0) {
            console.log('\n⚠️ Warnings:', results.warnings.length);
            results.warnings.forEach(w => console.log(`   - ${w}`));
        }
        
        if (results.errors.length > 0) {
            console.log('\n❌ Errors:', results.errors.length);
            results.errors.forEach(e => console.log(`   - ${e}`));
        }
        
        console.log('\n✨ Channel is now ready for a fresh start!');
        
        return results;
        
    } catch (error) {
        console.error('\n❌ CRITICAL ERROR:', error);
        results.errors.push(error.message);
        return results;
    }
}

// Allow running from command line
if (require.main === module) {
    const channelId = process.argv[2];
    
    if (!channelId) {
        console.log('Usage: node resetMiningData.js <channelId>');
        console.log('Example: node resetMiningData.js 1234567890123456789');
        process.exit(1);
    }
    
    resetChannel(channelId)
        .then(() => {
            console.log('\n👋 Exiting...');
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

// Export for use in other scripts
module.exports = { resetChannel };

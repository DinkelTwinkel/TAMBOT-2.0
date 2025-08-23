// checkMinecart.js - Diagnostic tool to check minecart data
const gachaVC = require('./models/activevcs');
const mapCacheSystem = require('./patterns/gachaModes/mining/cache/mapCacheSystem');

async function checkMinecart(channelId) {
    console.log('========================================');
    console.log('Minecart Diagnostic Tool');
    console.log(`Channel: ${channelId}`);
    console.log('========================================\n');
    
    try {
        // 1. Check direct database
        console.log('1. CHECKING DATABASE DIRECTLY:');
        const dbEntry = await gachaVC.findOne({ channelId });
        
        if (!dbEntry) {
            console.log('   ❌ No database entry found for this channel');
            process.exit(1);
        }
        
        if (!dbEntry.gameData) {
            console.log('   ❌ No gameData in database entry');
            process.exit(1);
        }
        
        console.log('   ✅ Database entry found');
        console.log(`   - Gamemode: ${dbEntry.gameData.gamemode || 'not set'}`);
        
        // Check for minecart vs minecarts
        if (dbEntry.gameData.minecart) {
            console.log('   ✅ Found gameData.minecart (correct)');
            const itemCount = Object.keys(dbEntry.gameData.minecart.items || {}).length;
            const contributorCount = Object.keys(dbEntry.gameData.minecart.contributors || {}).length;
            console.log(`   - Items: ${itemCount}`);
            console.log(`   - Contributors: ${contributorCount}`);
            
            if (itemCount > 0) {
                console.log('\n   Item Details:');
                for (const [itemId, data] of Object.entries(dbEntry.gameData.minecart.items)) {
                    console.log(`     - Item ${itemId}: ${data.quantity} units`);
                }
            }
        } else {
            console.log('   ❌ No gameData.minecart found');
        }
        
        if (dbEntry.gameData.minecarts) {
            console.log('   ⚠️ Found gameData.minecarts (incorrect plural form) - this needs to be migrated');
        }
        
        // 2. Check cache
        console.log('\n2. CHECKING CACHE SYSTEM:');
        
        // Clear and reinitialize cache to get fresh data
        mapCacheSystem.clearChannel(channelId);
        await mapCacheSystem.initialize(channelId, true);
        
        const cached = mapCacheSystem.getCachedData(channelId);
        
        if (!cached) {
            console.log('   ❌ Failed to load cache');
        } else {
            console.log('   ✅ Cache loaded');
            
            if (cached.minecart) {
                console.log('   ✅ Cache has minecart field');
                const itemCount = Object.keys(cached.minecart.items || {}).length;
                const contributorCount = Object.keys(cached.minecart.contributors || {}).length;
                console.log(`   - Cached Items: ${itemCount}`);
                console.log(`   - Cached Contributors: ${contributorCount}`);
            } else {
                console.log('   ❌ Cache missing minecart field');
            }
            
            if (cached.minecarts) {
                console.log('   ⚠️ Cache has incorrect minecarts field (plural)');
            }
        }
        
        // 3. Check via getCachedDBEntry function
        console.log('\n3. CHECKING getCachedDBEntry FUNCTION:');
        
        // Import the function
        const getCachedDBEntry = require('./patterns/gachaModes/mining_optimized_v5_performance').getCachedDBEntry;
        
        if (getCachedDBEntry) {
            const entry = await getCachedDBEntry(channelId, true);
            if (entry && entry.gameData && entry.gameData.minecart) {
                console.log('   ✅ getCachedDBEntry returns minecart correctly');
                const itemCount = Object.keys(entry.gameData.minecart.items || {}).length;
                console.log(`   - Items accessible: ${itemCount}`);
            } else {
                console.log('   ❌ getCachedDBEntry not returning minecart data properly');
            }
        } else {
            console.log('   ⚠️ Cannot test getCachedDBEntry (not exported)');
        }
        
        // 4. Summary
        console.log('\n========================================');
        console.log('SUMMARY:');
        
        if (dbEntry.gameData.minecart && Object.keys(dbEntry.gameData.minecart.items || {}).length > 0) {
            console.log('✅ Minecart has items in database');
            console.log('✅ Data structure is correct (minecart, not minecarts)');
            
            if (cached && cached.minecart) {
                console.log('✅ Cache system is working correctly');
            } else {
                console.log('❌ Cache system needs fixing');
            }
        } else {
            console.log('⚠️ Minecart is empty or missing');
            console.log('   This could be normal if no mining has occurred');
        }
        
        console.log('========================================');
        
    } catch (error) {
        console.error('Error during diagnostic:', error);
    }
    
    process.exit(0);
}

// Check for command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage: node checkMinecart.js <channelId>');
    console.log('Example: node checkMinecart.js 1234567890123456');
    process.exit(1);
}

const channelId = args[0];
checkMinecart(channelId);

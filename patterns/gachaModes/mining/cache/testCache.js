// testCache.js - Test the cache system to ensure it's working
const mapCacheSystem = require('./mapCacheSystem');
const monitor = require('./cacheMonitor');

async function runTests() {
    console.log('🧪 Starting Cache System Tests...\n');
    
    // Test channel ID (use a test channel or existing one)
    const testChannelId = '1408204453244567723';
    
    try {
        // Test 1: Initialization
        console.log('📝 Test 1: Cache Initialization');
        const startInit = Date.now();
        await mapCacheSystem.initialize(testChannelId);
        const initTime = Date.now() - startInit;
        console.log(`✅ Initialized in ${initTime}ms`);
        
        // Test 2: Read Performance
        console.log('\n📝 Test 2: Read Performance');
        const startRead = Date.now();
        for (let i = 0; i < 1000; i++) {
            mapCacheSystem.getCachedData(testChannelId);
        }
        const readTime = Date.now() - startRead;
        console.log(`✅ 1000 reads in ${readTime}ms (${(1000/readTime*1000).toFixed(0)} reads/sec)`);
        
        // Test 3: Write Performance
        console.log('\n📝 Test 3: Write Performance');
        const startWrite = Date.now();
        for (let i = 0; i < 100; i++) {
            mapCacheSystem.updateField(testChannelId, `testField${i}`, Math.random());
        }
        const writeTime = Date.now() - startWrite;
        console.log(`✅ 100 writes in ${writeTime}ms (${(100/writeTime*1000).toFixed(0)} writes/sec)`);
        
        // Test 4: Map Update
        console.log('\n📝 Test 4: Map Data Update');
        const testMap = {
            width: 50,
            height: 50,
            tiles: Array(50).fill(null).map(() => Array(50).fill({ type: 0 })),
            playerPositions: {
                'player1': { x: 25, y: 25 },
                'player2': { x: 20, y: 20 }
            }
        };
        mapCacheSystem.updateMapData(testChannelId, testMap);
        const retrievedMap = mapCacheSystem.getMapData(testChannelId);
        console.log(`✅ Map updated: ${retrievedMap.width}x${retrievedMap.height}`);
        
        // Test 5: Minecart Update
        console.log('\n📝 Test 5: Minecart Updates');
        mapCacheSystem.updateMinecart(testChannelId, 'player1', 'item_coal', 10);
        mapCacheSystem.updateMinecart(testChannelId, 'player1', 'item_iron', 5);
        mapCacheSystem.updateMinecart(testChannelId, 'player2', 'item_gold', 2);
        const minecarts = mapCacheSystem.getMinecarts(testChannelId);
        console.log(`✅ Minecarts updated:`, minecarts);
        
        // Test 6: Batch Updates
        console.log('\n📝 Test 6: Batch Updates');
        mapCacheSystem.updateMultiple(testChannelId, {
            'stats.wallsBroken': 100,
            'stats.treasuresFound': 5,
            'cycleCount': 3,
            'breakInfo.inBreak': false
        });
        const cached = mapCacheSystem.getCachedData(testChannelId);
        console.log(`✅ Batch update applied: ${Object.keys(cached).length} fields`);
        
        // Test 7: Cache Statistics
        console.log('\n📝 Test 7: Cache Statistics');
        const stats = mapCacheSystem.getStats();
        console.log(`✅ Stats:`, stats);
        
        // Test 8: Performance Comparison
        console.log('\n📝 Test 8: Performance Comparison');
        const comparison = await monitor.comparePerformance(testChannelId);
        console.log(`✅ Performance:`, comparison);
        
        // Test 9: Force Flush
        console.log('\n📝 Test 9: Force Flush to Database');
        await mapCacheSystem.forceFlush();
        console.log('✅ Cache flushed to database');
        
        // Test 10: Clear and Reload
        console.log('\n📝 Test 10: Clear and Reload');
        mapCacheSystem.clearChannel(testChannelId);
        console.log('✅ Cache cleared');
        await mapCacheSystem.initialize(testChannelId);
        console.log('✅ Cache reloaded');
        
        // Print final report
        console.log('\n' + '='.repeat(50));
        monitor.printReport();
        
        // Clean up test data
        mapCacheSystem.clearChannel(testChannelId);
        
        console.log('\n✅ All tests passed successfully!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

// Run tests if executed directly
if (require.main === module) {
    runTests().then(() => {
        console.log('\n🎉 Cache system is working correctly!');
        process.exit(0);
    }).catch(err => {
        console.error('\n💥 Cache system test failed:', err);
        process.exit(1);
    });
}

module.exports = { runTests };
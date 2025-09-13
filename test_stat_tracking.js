// test_stat_tracking.js - Test script for the stat tracking system
const mongoose = require('mongoose');
const GameStatTracker = require('./patterns/gameStatTracker');

async function testStatTracking() {
    try {
        console.log('🧪 Starting stat tracking system test...');
        
        // Connect to MongoDB (assuming it's already running)
        if (mongoose.connection.readyState !== 1) {
            console.log('⚠️ MongoDB not connected. Please ensure MongoDB is running and connected.');
            return;
        }
        
        const gameStatTracker = new GameStatTracker();
        
        // Test data
        const testUserId = 'test_user_123';
        const testGuildId = 'test_guild_456';
        
        console.log('📊 Testing stat tracking methods...');
        
        // Test 1: Track tile movement
        console.log('1. Testing tile movement tracking...');
        await gameStatTracker.trackTileMovement(testUserId, testGuildId, 'north');
        await gameStatTracker.trackTileMovement(testUserId, testGuildId, 'east');
        await gameStatTracker.trackTileMovement(testUserId, testGuildId, 'south');
        console.log('✅ Tile movement tracking completed');
        
        // Test 2: Track items found
        console.log('2. Testing item tracking...');
        await gameStatTracker.trackItemFound(testUserId, testGuildId, '1', 5, 'mining');
        await gameStatTracker.trackItemFound(testUserId, testGuildId, '2', 3, 'mining');
        await gameStatTracker.trackItemFound(testUserId, testGuildId, '10', 1, 'treasure');
        console.log('✅ Item tracking completed');
        
        // Test 3: Track tile breaking
        console.log('3. Testing tile breaking tracking...');
        await gameStatTracker.trackTileBroken(testUserId, testGuildId, 'wall');
        await gameStatTracker.trackTileBroken(testUserId, testGuildId, 'wall');
        await gameStatTracker.trackTileBroken(testUserId, testGuildId, 'ore');
        console.log('✅ Tile breaking tracking completed');
        
        // Test 4: Track hazard interactions
        console.log('4. Testing hazard tracking...');
        await gameStatTracker.trackHazardInteraction(testUserId, testGuildId, 'gas', 'evaded');
        await gameStatTracker.trackHazardInteraction(testUserId, testGuildId, 'cave_in', 'triggered');
        await gameStatTracker.trackHazardInteraction(testUserId, testGuildId, 'gas', 'seen');
        console.log('✅ Hazard tracking completed');
        
        // Test 5: Track power level
        console.log('5. Testing power level tracking...');
        await gameStatTracker.trackPowerLevel(testUserId, testGuildId, 5);
        await gameStatTracker.trackPowerLevel(testUserId, testGuildId, 3); // Should not update (lower)
        await gameStatTracker.trackPowerLevel(testUserId, testGuildId, 8); // Should update (higher)
        console.log('✅ Power level tracking completed');
        
        // Test 6: Track mining time
        console.log('6. Testing mining time tracking...');
        await gameStatTracker.trackMiningTime(testUserId, testGuildId, 300); // 5 minutes
        await gameStatTracker.trackMiningTime(testUserId, testGuildId, 180); // 3 minutes
        console.log('✅ Mining time tracking completed');
        
        // Test 7: Retrieve stats
        console.log('7. Testing stats retrieval...');
        const userStats = await gameStatTracker.getUserGameStats(testUserId, testGuildId, 'mining');
        console.log('📊 Retrieved user stats:', JSON.stringify(userStats, null, 2));
        
        // Test 8: Test batch update
        console.log('8. Testing batch update...');
        await gameStatTracker.batchUpdateStats(testUserId, testGuildId, {
            'gameData.mining.tilesMoved': 10,
            'gameData.mining.itemsFound.5': 2
        });
        console.log('✅ Batch update completed');
        
        // Test 9: Retrieve updated stats
        console.log('9. Testing updated stats retrieval...');
        const updatedStats = await gameStatTracker.getUserGameStats(testUserId, testGuildId, 'mining');
        console.log('📊 Updated user stats:', JSON.stringify(updatedStats, null, 2));
        
        console.log('🎉 All stat tracking tests completed successfully!');
        console.log('📋 Summary:');
        console.log(`   - Tiles moved: ${updatedStats.tilesMoved || 0}`);
        console.log(`   - Items found: ${updatedStats.itemsFound ? Object.values(updatedStats.itemsFound).reduce((sum, count) => sum + count, 0) : 0}`);
        console.log(`   - Tiles broken: ${updatedStats.tilesBroken ? Object.values(updatedStats.tilesBroken).reduce((sum, count) => sum + count, 0) : 0}`);
        console.log(`   - Hazards evaded: ${updatedStats.hazardsEvaded || 0}`);
        console.log(`   - Hazards triggered: ${updatedStats.hazardsTriggered || 0}`);
        console.log(`   - Hazards seen: ${updatedStats.hazardsSeen || 0}`);
        console.log(`   - Highest power level: ${updatedStats.highestPowerLevel || 0}`);
        console.log(`   - Time in mining: ${updatedStats.timeInMiningChannel || 0} seconds`);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
if (require.main === module) {
    testStatTracking().then(() => {
        console.log('🏁 Test script finished');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Test script crashed:', error);
        process.exit(1);
    });
}

module.exports = { testStatTracking };

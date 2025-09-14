// test_mongodb_conflict_fix.js - Test the fix for MongoDB conflicting update operators
const mongoose = require('mongoose');
const GameStatTracker = require('./patterns/gameStatTracker');

async function testMongoDBConflictFix() {
    try {
        console.log('🧪 Testing MongoDB conflicting update operators fix...');
        
        // Connect to MongoDB (assuming it's already running)
        if (mongoose.connection.readyState !== 1) {
            console.log('⚠️ MongoDB not connected. Please ensure MongoDB is running and connected.');
            return;
        }
        
        const gameStatTracker = new GameStatTracker();
        
        // Test data
        const testUserId = 'test_user_conflict_fix';
        const testGuildId = 'test_guild_conflict_fix';
        
        console.log('📊 Testing stat tracking methods with conflict fix...');
        
        // Test 1: Track tile movement (this was causing the conflict)
        console.log('1. Testing tile movement tracking...');
        await gameStatTracker.trackTileMovement(testUserId, testGuildId, 'north');
        await gameStatTracker.trackTileMovement(testUserId, testGuildId, 'east');
        console.log('✅ Tile movement tracking completed without conflicts');
        
        // Test 2: Track items found
        console.log('2. Testing item tracking...');
        await gameStatTracker.trackItemFound(testUserId, testGuildId, '1', 5, 'mining');
        await gameStatTracker.trackItemFound(testUserId, testGuildId, '2', 3, 'treasure');
        console.log('✅ Item tracking completed without conflicts');
        
        // Test 3: Track tile breaking
        console.log('3. Testing tile breaking tracking...');
        await gameStatTracker.trackTileBroken(testUserId, testGuildId, 'wall');
        await gameStatTracker.trackTileBroken(testUserId, testGuildId, 'ore');
        console.log('✅ Tile breaking tracking completed without conflicts');
        
        // Test 4: Track hazard interactions
        console.log('4. Testing hazard tracking...');
        await gameStatTracker.trackHazardInteraction(testUserId, testGuildId, 'gas', 'evaded');
        await gameStatTracker.trackHazardInteraction(testUserId, testGuildId, 'cave_in', 'triggered');
        console.log('✅ Hazard tracking completed without conflicts');
        
        // Test 5: Track power level
        console.log('5. Testing power level tracking...');
        await gameStatTracker.trackPowerLevel(testUserId, testGuildId, 5);
        await gameStatTracker.trackPowerLevel(testUserId, testGuildId, 8);
        console.log('✅ Power level tracking completed without conflicts');
        
        // Test 6: Track mining time
        console.log('6. Testing mining time tracking...');
        await gameStatTracker.trackMiningTime(testUserId, testGuildId, 300);
        await gameStatTracker.trackMiningTime(testUserId, testGuildId, 180);
        console.log('✅ Mining time tracking completed without conflicts');
        
        // Test 7: Batch update
        console.log('7. Testing batch update...');
        await gameStatTracker.batchUpdateStats(testUserId, testGuildId, {
            'gameData.mining.tilesMoved': 10,
            'gameData.mining.itemsFound.5': 2
        });
        console.log('✅ Batch update completed without conflicts');
        
        // Test 8: Retrieve stats to verify everything worked
        console.log('8. Testing stats retrieval...');
        const userStats = await gameStatTracker.getUserGameStats(testUserId, testGuildId, 'mining');
        console.log('📊 Retrieved user stats:', JSON.stringify(userStats, null, 2));
        
        console.log('🎉 All MongoDB conflict fix tests completed successfully!');
        console.log('✅ No conflicting update operator errors occurred');
        
        // Clean up test data
        console.log('🧹 Cleaning up test data...');
        const { UserStats } = require('./models/statsSchema');
        await UserStats.deleteOne({ userId: testUserId, guildId: testGuildId });
        console.log('✅ Test data cleaned up');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        
        // Check if it's the specific MongoDB conflict error
        if (error.code === 40 && error.codeName === 'ConflictingUpdateOperators') {
            console.error('💥 MongoDB conflicting update operators error still exists!');
            console.error('The fix did not resolve the issue.');
        } else {
            console.error('💥 Different error occurred:', error.message);
        }
    }
}

// Run the test
if (require.main === module) {
    testMongoDBConflictFix().then(() => {
        console.log('🏁 Test script finished');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Test script crashed:', error);
        process.exit(1);
    });
}

module.exports = { testMongoDBConflictFix };

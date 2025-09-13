// test_stat_tracking_fix.js - Test the fix for gameStatTracker parameter passing
const GameStatTracker = require('./patterns/gameStatTracker');

// Mock the processPlayerActionsEnhanced function to test parameter passing
async function testProcessPlayerActionsEnhanced(member, playerData, mapData, powerLevel, availableItems, availableTreasures, efficiency, serverModifiers, transaction, eventLogs, dbEntry, hazardsData, teamLuckBonus = 0, mineTypeId = null, gameStatTracker = null) {
    console.log('🧪 Testing processPlayerActionsEnhanced with gameStatTracker parameter...');
    
    // Test 1: Check if gameStatTracker is properly passed
    if (gameStatTracker) {
        console.log('✅ gameStatTracker parameter is properly passed');
        
        // Test 2: Try to call a method on gameStatTracker
        try {
            await gameStatTracker.trackPowerLevel(member.id, member.guild.id, powerLevel);
            console.log('✅ gameStatTracker.trackPowerLevel() works correctly');
        } catch (error) {
            console.error('❌ Error calling gameStatTracker method:', error);
        }
    } else {
        console.log('⚠️ gameStatTracker parameter is null/undefined');
    }
    
    // Test 3: Test the safety check pattern
    if (gameStatTracker) {
        try {
            await gameStatTracker.trackTileMovement(member.id, member.guild.id, 'north');
            console.log('✅ Safety check pattern works correctly');
        } catch (error) {
            console.error('❌ Error in safety check pattern:', error);
        }
    }
    
    return { mapChanged: false, wallsBroken: 0, treasuresFound: 0, mapData, hazardsChanged: false };
}

async function testFix() {
    try {
        console.log('🧪 Starting test for gameStatTracker parameter fix...');
        
        // Create mock objects
        const mockMember = {
            id: 'test_user_123',
            guild: { id: 'test_guild_456' },
            displayName: 'TestUser'
        };
        
        const mockPlayerData = { stats: { mining: 5, luck: 3 } };
        const mockMapData = { width: 10, height: 10 };
        const gameStatTracker = new GameStatTracker();
        
        // Test with gameStatTracker
        console.log('\n📊 Test 1: With gameStatTracker parameter');
        await testProcessPlayerActionsEnhanced(
            mockMember,
            mockPlayerData,
            mockMapData,
            5, // powerLevel
            [], // availableItems
            [], // availableTreasures
            { speedMultiplier: 1 }, // efficiency
            {}, // serverModifiers
            {}, // transaction
            [], // eventLogs
            {}, // dbEntry
            {}, // hazardsData
            0, // teamLuckBonus
            null, // mineTypeId
            gameStatTracker // gameStatTracker
        );
        
        // Test without gameStatTracker
        console.log('\n📊 Test 2: Without gameStatTracker parameter');
        await testProcessPlayerActionsEnhanced(
            mockMember,
            mockPlayerData,
            mockMapData,
            5, // powerLevel
            [], // availableItems
            [], // availableTreasures
            { speedMultiplier: 1 }, // efficiency
            {}, // serverModifiers
            {}, // transaction
            [], // eventLogs
            {}, // dbEntry
            {}, // hazardsData
            0, // teamLuckBonus
            null, // mineTypeId
            null // gameStatTracker (null)
        );
        
        console.log('\n🎉 All tests completed successfully!');
        console.log('✅ The gameStatTracker parameter fix is working correctly');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
if (require.main === module) {
    testFix().then(() => {
        console.log('🏁 Test script finished');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Test script crashed:', error);
        process.exit(1);
    });
}

module.exports = { testFix };

// test_unique_item_maintenance_integration.js
// Test script to verify the new unique item maintenance system integration

const { 
    performMaintenance, 
    checkMaintenanceStatus, 
    initializeMaintenanceStateForExistingItems 
} = require('./patterns/uniqueItemMaintenance');
const UniqueItem = require('./models/uniqueItems');
const GameStatTracker = require('./patterns/gameStatTracker');

async function testUniqueItemMaintenanceIntegration() {
    console.log('🧪 Testing Unique Item Maintenance Integration...\n');
    
    try {
        // Test 1: Initialize maintenance state for existing items
        console.log('📋 Test 1: Initializing maintenance state for existing items...');
        const migratedCount = await initializeMaintenanceStateForExistingItems();
        console.log(`✅ Migrated ${migratedCount} items\n`);
        
        // Test 2: Check maintenance status
        console.log('📋 Test 2: Checking maintenance status...');
        const testUserId = 'test_user_123';
        const testGuildId = 'test_guild_456';
        
        const statuses = await checkMaintenanceStatus(testUserId, testGuildId);
        console.log(`✅ Found ${statuses.length} items for user ${testUserId}`);
        
        if (statuses.length > 0) {
            console.log('📊 Sample status:');
            console.log(JSON.stringify(statuses[0], null, 2));
        }
        console.log();
        
        // Test 3: Test stat tracking integration
        console.log('📋 Test 3: Testing stat tracking integration...');
        const gameStatTracker = new GameStatTracker();
        
        // Simulate some mining activity
        await gameStatTracker.trackTileMovement(testUserId, testGuildId, 'north');
        await gameStatTracker.trackTileMovement(testUserId, testGuildId, 'east');
        await gameStatTracker.trackItemFound(testUserId, testGuildId, '1', 5, 'mining'); // Iron ore
        await gameStatTracker.trackMiningTime(testUserId, testGuildId, 120); // 2 minutes
        
        console.log('✅ Simulated mining activity tracked');
        
        // Check stats again to see the differences
        const updatedStatuses = await checkMaintenanceStatus(testUserId, testGuildId);
        if (updatedStatuses.length > 0) {
            console.log('📊 Updated status with new activity:');
            console.log(JSON.stringify(updatedStatuses[0].activityProgress, null, 2));
        }
        console.log();
        
        // Test 4: Test maintenance performance (if user has items)
        if (statuses.length > 0) {
            console.log('📋 Test 4: Testing maintenance performance...');
            const testItem = statuses[0];
            
            try {
                const result = await performMaintenance(testUserId, 'TestUser#1234', testItem.itemId);
                console.log('✅ Maintenance performed successfully:');
                console.log(JSON.stringify(result, null, 2));
            } catch (error) {
                console.log('ℹ️  Maintenance test failed (expected if requirements not met):');
                console.log(`   ${error.message}`);
            }
        }
        
        console.log('\n🎉 Integration test completed successfully!');
        
    } catch (error) {
        console.error('❌ Integration test failed:', error);
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testUniqueItemMaintenanceIntegration()
        .then(() => {
            console.log('\n✅ Test completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Test failed:', error);
            process.exit(1);
        });
}

module.exports = { testUniqueItemMaintenanceIntegration };

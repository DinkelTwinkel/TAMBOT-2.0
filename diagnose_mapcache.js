// Diagnostic script for mapCacheSystem conflicts
// Run this to inspect and fix pending write conflicts

const mapCacheSystem = require('./patterns/gachaModes/mining/cache/mapCacheSystem');

console.log('🔍 MAP CACHE DIAGNOSTIC TOOL\n');
console.log('=' .repeat(50));

// Function to run diagnostics
async function runDiagnostics() {
    console.log('\n1. Current Cache Statistics:');
    const stats = mapCacheSystem.getStats();
    console.log(`   - Cache Size: ${stats.cacheSize} channels`);
    console.log(`   - Pending Writes: ${stats.pendingWrites} channels`);
    console.log(`   - Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
    console.log(`   - Total Hits: ${stats.hits}`);
    console.log(`   - Total Misses: ${stats.misses}`);
    console.log(`   - Total Writes: ${stats.writes}`);
    console.log(`   - Total Errors: ${stats.errors}`);
    
    console.log('\n2. Inspecting Pending Writes:');
    // This will show all pending writes and identify conflicts
    mapCacheSystem.inspectPendingWrites();
    
    console.log('\n3. Available Actions:');
    console.log('   a) Force flush all pending writes');
    console.log('   b) Clear all pending writes (data loss!)');
    console.log('   c) Clear pending writes for specific channel');
    console.log('   d) Exit without changes');
    
    // If running interactively, you can uncomment this:
    /*
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    rl.question('\nChoose action (a/b/c/d): ', async (answer) => {
        switch(answer.toLowerCase()) {
            case 'a':
                console.log('\nForce flushing all pending writes...');
                await mapCacheSystem.forceFlush();
                console.log('Done!');
                break;
            case 'b':
                console.log('\n⚠️  WARNING: This will clear all pending writes without saving!');
                rl.question('Are you sure? (yes/no): ', (confirm) => {
                    if (confirm.toLowerCase() === 'yes') {
                        mapCacheSystem.clearPendingWrites();
                        console.log('Cleared all pending writes.');
                    } else {
                        console.log('Cancelled.');
                    }
                    rl.close();
                });
                return;
            case 'c':
                rl.question('Enter channel ID: ', (channelId) => {
                    mapCacheSystem.clearPendingWrites(channelId);
                    console.log(`Cleared pending writes for channel ${channelId}`);
                    rl.close();
                });
                return;
            case 'd':
                console.log('Exiting without changes.');
                break;
            default:
                console.log('Invalid option.');
        }
        rl.close();
    });
    */
    
    // For automated testing, just try to flush
    console.log('\n4. Attempting to force flush pending writes...');
    try {
        await mapCacheSystem.forceFlush();
        console.log('✅ Flush completed successfully!');
    } catch (error) {
        console.error('❌ Flush failed with error:', error.message);
        
        // If flush fails, show what's in the pending writes
        console.log('\n5. Detailed Pending Writes Analysis:');
        mapCacheSystem.inspectPendingWrites();
        
        console.log('\n⚠️  RECOMMENDATION:');
        console.log('The conflict is likely due to updates trying to modify both a parent');
        console.log('path (like gameData.breakInfo) and child paths (like gameData.breakInfo.someField)');
        console.log('at the same time. The improved conflict resolution should handle this.');
        console.log('\nIf the error persists:');
        console.log('1. Check your code for duplicate update calls');
        console.log('2. Make sure you\'re not updating the same field multiple times');
        console.log('3. Consider using updateField() for single fields or updateMultiple() for batches');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('Diagnostic complete!\n');
}

// Function to test conflict resolution
function testConflictResolution() {
    console.log('\n📝 Testing Conflict Resolution Logic:\n');
    
    // Create a test instance
    const testSystem = new (require('./patterns/gachaModes/mining/cache/mapCacheSystem').constructor)();
    
    // Test case 1: Parent-child conflict
    const test1 = {
        'gameData.breakInfo': { entire: 'object' },
        'gameData.breakInfo.field1': 'value1',
        'gameData.breakInfo.field2': 'value2'
    };
    
    console.log('Test 1 - Parent-child conflict:');
    console.log('  Input:', Object.keys(test1));
    const cleaned1 = testSystem.cleanConflictingPaths(test1);
    console.log('  Output:', Object.keys(cleaned1));
    console.log('  Expected: Should keep only child paths\n');
    
    // Test case 2: Multiple roots
    const test2 = {
        'gameData.map': { entire: 'map' },
        'gameData.map.tiles': [],
        'gameData.breakInfo': { entire: 'break' },
        'gameData.minecart.items.1': { item: 1 }
    };
    
    console.log('Test 2 - Multiple roots with conflicts:');
    console.log('  Input:', Object.keys(test2));
    const cleaned2 = testSystem.cleanConflictingPaths(test2);
    console.log('  Output:', Object.keys(cleaned2));
    console.log('  Expected: Should resolve conflicts per root\n');
    
    // Test case 3: No conflicts
    const test3 = {
        'gameData.map.tiles': [],
        'gameData.breakInfo.active': true,
        'gameData.minecart.items': {}
    };
    
    console.log('Test 3 - No conflicts:');
    console.log('  Input:', Object.keys(test3));
    const cleaned3 = testSystem.cleanConflictingPaths(test3);
    console.log('  Output:', Object.keys(cleaned3));
    console.log('  Expected: Should keep all paths\n');
}

// Run everything
async function main() {
    // First run tests
    testConflictResolution();
    
    // Then run diagnostics
    await runDiagnostics();
    
    // Exit
    process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});

// Run
main().catch(console.error);

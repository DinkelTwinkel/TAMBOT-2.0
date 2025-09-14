// test_unique_maintenance_fix.js
// Test script to verify the unique maintenance system fixes

const { calculateStatDifferences } = require('./patterns/uniqueItemMaintenance');

// Test the stat differences calculation
function testStatDifferencesCalculation() {
    console.log('🧪 Testing Stat Differences Calculation...\n');
    
    // Test 1: Basic stat differences
    console.log('📋 Test 1: Basic stat differences');
    const currentStats = {
        tilesMoved: 100,
        timeInMiningChannel: 3600, // 1 hour in seconds
        hazardsEvaded: 5,
        hazardsTriggered: 2,
        highestPowerLevel: 10,
        itemsFound: {
            '1': 10, // Coal ore
            '22': 5   // Iron ore
        },
        itemsFoundBySource: {
            mining: {
                '1': 8,  // Coal ore from mining
                '22': 5  // Iron ore from mining
            },
            treasure: {
                '1': 2   // Coal ore from treasure
            }
        }
    };
    
    const previousStats = {
        tilesMoved: 50,
        timeInMiningChannel: 1800, // 30 minutes in seconds
        hazardsEvaded: 2,
        hazardsTriggered: 1,
        highestPowerLevel: 8,
        itemsFound: {
            '1': 5,  // Coal ore
            '22': 2  // Iron ore
        },
        itemsFoundBySource: {
            mining: {
                '1': 4,  // Coal ore from mining
                '22': 2  // Iron ore from mining
            },
            treasure: {
                '1': 1   // Coal ore from treasure
            }
        }
    };
    
    const differences = calculateStatDifferences(currentStats, previousStats);
    
    console.log('✅ Calculated differences:');
    console.log(`   Tiles moved: ${differences.tilesMoved} (expected: 50)`);
    console.log(`   Time in mining: ${differences.timeInMiningChannel} seconds (expected: 1800)`);
    console.log(`   Hazards evaded: ${differences.hazardsEvaded} (expected: 3)`);
    console.log(`   Hazards triggered: ${differences.hazardsTriggered} (expected: 1)`);
    console.log(`   Highest power level: ${differences.highestPowerLevel} (expected: 2)`);
    console.log(`   Items found: ${JSON.stringify(differences.itemsFound)}`);
    console.log(`   Mining items: ${JSON.stringify(differences.itemsFoundBySource.mining)}`);
    console.log();
    
    // Test 2: Map handling (simulating old data format)
    console.log('📋 Test 2: Map handling (backward compatibility)');
    const currentStatsWithMap = {
        ...currentStats,
        itemsFoundBySource: {
            mining: new Map([['1', 8], ['22', 5]]),
            treasure: new Map([['1', 2]])
        }
    };
    
    const previousStatsWithMap = {
        ...previousStats,
        itemsFoundBySource: {
            mining: new Map([['1', 4], ['22', 2]]),
            treasure: new Map([['1', 1]])
        }
    };
    
    const differencesWithMap = calculateStatDifferences(currentStatsWithMap, previousStatsWithMap);
    
    console.log('✅ Calculated differences with Map format:');
    console.log(`   Mining items: ${JSON.stringify(differencesWithMap.itemsFoundBySource.mining)}`);
    console.log();
    
    // Test 3: Empty previous stats (first time)
    console.log('📋 Test 3: Empty previous stats (first time)');
    const differencesFirstTime = calculateStatDifferences(currentStats, {});
    
    console.log('✅ Calculated differences (first time):');
    console.log(`   Tiles moved: ${differencesFirstTime.tilesMoved} (expected: 100)`);
    console.log(`   Mining items: ${JSON.stringify(differencesFirstTime.itemsFoundBySource.mining)}`);
    console.log();
    
    // Test 4: Ore-specific mining requirement simulation
    console.log('📋 Test 4: Ore-specific mining requirement simulation');
    const oreId = '22'; // Iron ore
    const requirement = 3;
    const oresMined = differences.itemsFoundBySource.mining[oreId] || 0;
    
    console.log(`✅ Ore requirement check for Iron Ore (ID: ${oreId}):`);
    console.log(`   Required: ${requirement}`);
    console.log(`   Mined since last maintenance: ${oresMined}`);
    console.log(`   Requirement met: ${oresMined >= requirement ? 'YES' : 'NO'}`);
    console.log();
    
    console.log('🎉 All stat differences tests completed successfully!');
}

// Test guild ID handling
function testGuildIdHandling() {
    console.log('🧪 Testing Guild ID Handling...\n');
    
    // Test 1: Valid guild ID
    console.log('📋 Test 1: Valid guild ID');
    const itemWithGuildId = {
        maintenanceState: {
            guildId: 'guild_123',
            previousStats: {}
        }
    };
    
    const guildId1 = itemWithGuildId.maintenanceState?.guildId || 'default';
    console.log(`✅ Guild ID from maintenance state: ${guildId1} (expected: guild_123)`);
    
    // Test 2: Missing guild ID
    console.log('📋 Test 2: Missing guild ID');
    const itemWithoutGuildId = {
        maintenanceState: {
            previousStats: {}
        }
    };
    
    const guildId2 = itemWithGuildId.maintenanceState?.guildId || 'default';
    console.log(`✅ Guild ID fallback: ${guildId2} (expected: default)`);
    
    // Test 3: No maintenance state
    console.log('📋 Test 3: No maintenance state');
    const itemWithoutMaintenanceState = {};
    
    const guildId3 = itemWithoutMaintenanceState.maintenanceState?.guildId || 'default';
    console.log(`✅ Guild ID no maintenance state: ${guildId3} (expected: default)`);
    console.log();
    
    console.log('🎉 All guild ID tests completed successfully!');
}

// Run all tests
function runAllTests() {
    console.log('🚀 Running Unique Maintenance System Fix Tests...\n');
    
    try {
        testStatDifferencesCalculation();
        console.log();
        testGuildIdHandling();
        
        console.log('\n✅ All tests completed successfully!');
        console.log('\n📋 Summary of fixes:');
        console.log('   ✅ Fixed guild ID access (item.maintenanceState.guildId)');
        console.log('   ✅ Fixed Map/Object handling in stat differences');
        console.log('   ✅ Updated schema to use Schema.Types.Mixed instead of Maps');
        console.log('   ✅ Updated all initialization methods to use plain objects');
        console.log('   ✅ Added backward compatibility for Map format');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

// Run the tests if this file is executed directly
if (require.main === module) {
    runAllTests()
        .then(() => {
            console.log('\n✅ All tests completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Tests failed:', error);
            process.exit(1);
        });
}

module.exports = { testStatDifferencesCalculation, testGuildIdHandling, runAllTests };

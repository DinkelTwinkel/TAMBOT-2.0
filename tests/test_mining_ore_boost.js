// Test script to verify ore boost is working correctly
const miningConstants = require('../patterns/gachaModes/mining/miningConstants_unified.js');

// Test function to simulate mining and check ore distribution
function testOreDistribution(mineId, mineName, expectedOreId, expectedBoost) {
    console.log(`\nTesting ${mineName} (ID: ${mineId})`);
    console.log(`Expected: ${expectedBoost * 100}% chance for ore ID ${expectedOreId}`);
    
    const results = {};
    const numTests = 10000;
    
    // Simulate mining many times
    for (let i = 0; i < numTests; i++) {
        const item = miningConstants.findItemUnified(
            'mining_wall',  // Context
            3,              // Power level
            0,              // Luck stat
            false,          // Is unique roll
            false,          // Is deeper mine
            mineId          // Mine type ID
        );
        
        if (item && item.itemId) {
            results[item.itemId] = (results[item.itemId] || 0) + 1;
        }
    }
    
    // Calculate percentages
    console.log('\nResults:');
    const sortedResults = Object.entries(results)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Show top 5 items
    
    for (const [itemId, count] of sortedResults) {
        const percentage = (count / numTests * 100).toFixed(2);
        const itemName = getItemName(itemId);
        const marker = itemId === expectedOreId ? ' ✓ (CORRESPONDING ORE)' : '';
        console.log(`  ${itemName} (ID: ${itemId}): ${percentage}%${marker}`);
    }
    
    // Check if the corresponding ore meets the minimum threshold
    const correspondingOreCount = results[expectedOreId] || 0;
    const actualPercentage = correspondingOreCount / numTests;
    
    if (actualPercentage >= expectedBoost * 0.9) { // Allow 10% margin
        console.log(`✅ PASS: Corresponding ore appears ${(actualPercentage * 100).toFixed(2)}% of the time (target: ${expectedBoost * 100}%)`);
    } else {
        console.log(`❌ FAIL: Corresponding ore appears only ${(actualPercentage * 100).toFixed(2)}% of the time (target: ${expectedBoost * 100}%)`);
    }
}

// Helper function to get item name
function getItemName(itemId) {
    const allItems = [
        ...miningConstants.UNIFIED_ITEM_POOL.ores,
        ...miningConstants.UNIFIED_ITEM_POOL.equipment,
        ...miningConstants.UNIFIED_ITEM_POOL.treasures,
        ...miningConstants.UNIFIED_ITEM_POOL.consumables
    ];
    
    const item = allItems.find(i => i.itemId === itemId);
    return item ? item.name : `Unknown (${itemId})`;
}

// Run tests for different mines
console.log('='.repeat(60));
console.log('MINING ORE BOOST TEST');
console.log('='.repeat(60));

// Test base level mines (30% boost)
testOreDistribution('1', 'Coal Mines L0', '1', 0.30);
testOreDistribution('2', 'Topaz Mine L0', '2', 0.30);
testOreDistribution('3', 'Diamond Mines L0', '6', 0.30);
testOreDistribution('4', 'Emerald Caverns L0', '23', 0.30);
testOreDistribution('5', 'Ruby Depths L0', '24', 0.30);

// Test mid-level mines (50% boost)
testOreDistribution('1004', 'Coal Mines L-4', '1', 0.50);
testOreDistribution('2004', 'Topaz Mine L-4', '2', 0.50);

// Test deeper mines (60%+ boost)
testOreDistribution('101', 'The Coal Pits L0', '1', 0.60);
testOreDistribution('103', 'Diamond Throne L0', '6', 0.60);

// Test ultimate mines (90% boost)
testOreDistribution('113', 'The All Black', '1', 0.90);
testOreDistribution('115', 'The Diamond Crown', '6', 0.90);

console.log('\n' + '='.repeat(60));
console.log('TEST COMPLETE');
console.log('='.repeat(60));

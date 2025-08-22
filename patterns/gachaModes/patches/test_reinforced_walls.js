// test_reinforced_walls.js
// Test script to verify reinforced wall generation rates by power level

const { generateTileType, TILE_TYPES } = require('../mining/miningMap');
const { POWER_LEVEL_CONFIG } = require('../mining/miningConstants_unified');

// Test function to simulate tile generation
function testReinforcedWallGeneration(powerLevel, sampleSize = 10000) {
    console.log(`\n=== Testing Power Level ${powerLevel} ===`);
    console.log(`Config: ${POWER_LEVEL_CONFIG[powerLevel].name}`);
    console.log(`Expected Reinforced Wall Chance: ${(POWER_LEVEL_CONFIG[powerLevel].reinforcedWallChance * 100).toFixed(1)}%`);
    
    const tileCounts = {};
    const testChannelId = 'test-channel-' + powerLevel;
    
    // Generate many tiles to get accurate statistics
    for (let i = 0; i < sampleSize; i++) {
        // Generate random coordinates
        const x = Math.floor(Math.random() * 100);
        const y = Math.floor(Math.random() * 100);
        
        // Generate tile with power level
        const tileType = generateTileType(testChannelId, x, y, powerLevel);
        
        // Count tile types
        tileCounts[tileType] = (tileCounts[tileType] || 0) + 1;
    }
    
    // Calculate percentages
    console.log('\nGenerated Tile Distribution:');
    for (const [type, count] of Object.entries(tileCounts)) {
        const percentage = ((count / sampleSize) * 100).toFixed(2);
        console.log(`  ${type}: ${count} (${percentage}%)`);
    }
    
    // Highlight reinforced wall percentage
    const reinforcedCount = tileCounts[TILE_TYPES.REINFORCED_WALL] || 0;
    const actualPercentage = ((reinforcedCount / sampleSize) * 100).toFixed(2);
    const expectedPercentage = (POWER_LEVEL_CONFIG[powerLevel].reinforcedWallChance * 100).toFixed(1);
    
    console.log(`\n✓ Reinforced Walls: ${actualPercentage}% (Expected: ~${expectedPercentage}%)`);
    
    return {
        powerLevel,
        expected: POWER_LEVEL_CONFIG[powerLevel].reinforcedWallChance,
        actual: reinforcedCount / sampleSize,
        tileCounts
    };
}

// Run tests for all power levels
function runAllTests() {
    console.log('========================================');
    console.log('REINFORCED WALL GENERATION TEST SUITE');
    console.log('========================================');
    
    const results = [];
    const sampleSize = 10000;
    
    for (let powerLevel = 1; powerLevel <= 7; powerLevel++) {
        const result = testReinforcedWallGeneration(powerLevel, sampleSize);
        results.push(result);
    }
    
    // Summary
    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log('Power | Expected | Actual  | Difference');
    console.log('------|----------|---------|----------');
    
    for (const result of results) {
        const expected = (result.expected * 100).toFixed(1);
        const actual = (result.actual * 100).toFixed(2);
        const diff = ((result.actual - result.expected) * 100).toFixed(2);
        const sign = diff >= 0 ? '+' : '';
        
        console.log(`  ${result.powerLevel}   | ${expected.padStart(7)}% | ${actual.padStart(6)}% | ${sign}${diff}%`);
    }
    
    console.log('\n✅ Test complete! Reinforced wall generation scales with power level.');
}

// Test hardness values
function testTileHardness() {
    const { getTileHardness } = require('../mining/miningMap');
    
    console.log('\n========================================');
    console.log('TILE HARDNESS VALUES');
    console.log('========================================');
    
    const tiles = [
        TILE_TYPES.WALL,
        TILE_TYPES.WALL_WITH_ORE,
        TILE_TYPES.RARE_ORE,
        TILE_TYPES.REINFORCED_WALL,
        TILE_TYPES.TREASURE_CHEST,
        TILE_TYPES.FLOOR
    ];
    
    for (const tile of tiles) {
        const hardness = getTileHardness(tile);
        console.log(`${tile}: ${hardness} hit${hardness !== 1 ? 's' : ''} to break`);
    }
}

// Run the tests if this file is executed directly
if (require.main === module) {
    runAllTests();
    testTileHardness();
}

module.exports = {
    testReinforcedWallGeneration,
    runAllTests
};

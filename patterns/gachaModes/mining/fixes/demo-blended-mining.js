// demo-blended-mining.js - Demo script to test tileset blending
const { 
    analyzeMineProgression,
    calculateBlendingPercentage,
    getBlendedTileTheme,
    debugMineProgression,
    TIER_GROUPS
} = require('./tileset-blender');

// Load the gachaServers data
const gachaServers = require('../../../../data/gachaServers.json');

// Demo function to show blending in action
function demonstrateTilesetBlending() {
    console.log('=== TILESET BLENDING DEMO ===\n');
    
    // Show the progression analysis
    debugMineProgression(gachaServers);
    
    // Test a specific mine with in-between levels
    const testMineId = '1002'; // Coal Mines L-2
    const channelId = 'demo123456789';
    
    console.log('\\n=== TESTING INDIVIDUAL TILE BLENDING ===');
    console.log(`Testing mine ID: ${testMineId}`);
    console.log(`Channel ID: ${channelId}\\n`);
    
    // Test different tile positions and types
    const testCases = [
        { x: 5, y: 3, type: 'floor' },
        { x: 10, y: 8, type: 'wall' },
        { x: 2, y: 15, type: 'floor' },
        { x: 7, y: 12, type: 'wall' },
        { x: 20, y: 5, type: 'floor' }
    ];
    
    testCases.forEach(({ x, y, type }, index) => {
        const theme = getBlendedTileTheme(testMineId, x, y, type, channelId, gachaServers);
        console.log(`Tile ${index + 1}: (${x}, ${y}) ${type} -> Theme: ${theme}`);
    });
    
    console.log('\\n=== PROGRESSION ANALYSIS ===');
    const progression = analyzeMineProgression(testMineId, gachaServers);
    if (progression) {
        console.log(`Mine: ${progression.mineEntry.name}`);
        console.log(`Level: ${progression.level} (Deep: ${progression.isDeepLevel})`);
        console.log(`Current tier: ${progression.currentTierTheme}`);
        console.log(`Next tier: ${progression.nextTierTheme || 'None'}`);
        console.log(`Blend percentage: ${calculateBlendingPercentage(progression)}%`);
    }
    
    console.log('\\n=== BLENDING PERCENTAGES BY LEVEL ===');
    // Test different mine levels in the coal progression
    const coalLevels = [
        '1',      // Coal Mines L0 - should be 0%
        '1001',   // Coal Mines L-1 - should be 5%
        '1002',   // Coal Mines L-2 - should be 25%
        '1003',   // Coal Mines L-3 - should be 45%
        '1004',   // Coal Mines L-4 - should be 65%
        '1005',   // Coal Mines L-5 - should be 90%
        '101',    // The Coal Pits L0 - should be 0%
    ];
    
    coalLevels.forEach(mineId => {
        const prog = analyzeMineProgression(mineId, gachaServers);
        if (prog) {
            const blendPercent = calculateBlendingPercentage(prog);
            console.log(`${prog.mineEntry.name.padEnd(35)} | Blend: ${blendPercent}%`);
        }
    });
}

// Run the demo
if (require.main === module) {
    try {
        demonstrateTilesetBlending();
    } catch (error) {
        console.error('Demo failed:', error);
    }
}

module.exports = { demonstrateTilesetBlending };
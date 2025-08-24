// test_deeper_conditions.js
// Test configurations for different deeper mine conditions

/**
 * Example configurations for gachaServers.json
 * Each mine uses a different unlock condition
 */

const testMineConfigurations = [
    // ========================================
    // LEVEL 1 MINES (Starting mines)
    // ========================================
    
    {
        "id": 1,
        "name": "⛏️ Coal Mines",
        "power": 1,
        "description": "Basic coal mining operation",
        "nextLevelConditionType": "wallsBroken",
        "conditionCost": 100,
        "nextLevelId": 101,
        "isDeeper": false
    },
    
    {
        "id": 2,
        "name": "⛏️ Copper Quarry",
        "power": 1,
        "description": "Surface copper extraction",
        "nextLevelConditionType": "persistentValue",
        "conditionCost": 5000,
        "nextLevelId": 102,
        "isDeeper": false
    },
    
    {
        "id": 3,
        "name": "⛏️ Iron Mines",
        "power": 2,
        "description": "Iron ore excavation",
        "nextLevelConditionType": "exitTile",  // ← Uses exit tile!
        "conditionCost": 1,
        "nextLevelId": 103,
        "isDeeper": false
    },
    
    // ========================================
    // DEEPER LEVEL MINES
    // ========================================
    
    {
        "id": 101,
        "name": "⛏️ Deep Coal Shafts",
        "power": 2,
        "description": "Deeper coal deposits",
        "nextLevelConditionType": "oresFound",
        "conditionCost": 500,
        "nextLevelId": 201,
        "isDeeper": true,
        "previousLevelId": 1
    },
    
    {
        "id": 102,
        "name": "⛏️ Copper Depths",
        "power": 2,
        "description": "Rich copper veins",
        "nextLevelConditionType": "treasuresFound",
        "conditionCost": 10,
        "nextLevelId": 202,
        "isDeeper": true,
        "previousLevelId": 2
    },
    
    {
        "id": 103,
        "name": "⛏️ Iron Stronghold",
        "power": 3,
        "description": "Ancient iron fortress",
        "nextLevelConditionType": "rareOresFound",
        "conditionCost": 50,
        "nextLevelId": 203,
        "isDeeper": true,
        "previousLevelId": 3
    }
];

/**
 * Testing function to verify condition types
 */
async function testConditionTypes(deeperMineChecker) {
    console.log("=== TESTING DEEPER MINE CONDITIONS ===\n");
    
    for (const config of testMineConfigurations) {
        const usesExitTile = deeperMineChecker.usesExitTileCondition(config.id);
        const conditionType = deeperMineChecker.getMineConditionType(config.id);
        
        console.log(`Mine: ${config.name} (ID: ${config.id})`);
        console.log(`  Condition Type: ${conditionType || 'NONE'}`);
        console.log(`  Uses Exit Tiles: ${usesExitTile ? 'YES ✅' : 'NO ❌'}`);
        console.log(`  Requirement: ${config.conditionCost} ${conditionType || 'N/A'}`);
        console.log(`  Is Deeper: ${config.isDeeper ? 'Yes' : 'No'}`);
        console.log('');
    }
}

/**
 * Test spawn chances for different mines
 */
async function testExitTileSpawning(deeperMineChecker, channelId) {
    console.log("=== TESTING EXIT TILE SPAWNING ===\n");
    
    // Create mock DB entries for different mine types
    const mockEntries = [
        {
            channelId: channelId,
            typeId: 1, // Coal - uses wallsBroken
            gameData: {
                map: { entranceX: 25, entranceY: 25 },
                stats: {}
            }
        },
        {
            channelId: channelId,
            typeId: 2, // Copper - uses persistentValue
            gameData: {
                map: { entranceX: 25, entranceY: 25 },
                stats: {}
            }
        },
        {
            channelId: channelId,
            typeId: 3, // Iron - uses exitTile
            gameData: {
                map: { entranceX: 25, entranceY: 25 },
                stats: {}
            }
        }
    ];
    
    for (const entry of mockEntries) {
        const mineConfig = deeperMineChecker.getMineConfig(entry.typeId);
        console.log(`Testing: ${mineConfig?.name || 'Unknown'}`);
        console.log(`  Condition: ${mineConfig?.nextLevelConditionType || 'None'}`);
        
        // Try to spawn exit tile 10 times
        let spawned = false;
        for (let i = 0; i < 10; i++) {
            const result = await deeperMineChecker.checkForExitTileSpawn(entry, 30, 30);
            if (result) {
                spawned = true;
                break;
            }
        }
        
        const expected = mineConfig?.nextLevelConditionType === 'exitTile';
        const correct = (spawned && expected) || (!spawned && !expected);
        
        console.log(`  Can Spawn Exit Tiles: ${expected ? 'YES' : 'NO'}`);
        console.log(`  Test Result: ${correct ? '✅ PASS' : '❌ FAIL'}`);
        console.log('');
    }
}

/**
 * Quick test for spawn rate (with temporary increased chance)
 */
async function testSpawnRate(deeperMineChecker, channelId) {
    console.log("=== TESTING SPAWN RATE (1/10,000) ===\n");
    
    // Mock entry for Iron Mines (uses exitTile)
    const mockEntry = {
        channelId: channelId,
        typeId: 3, // Iron - uses exitTile
        gameData: {
            map: { entranceX: 25, entranceY: 25 },
            stats: {}
        }
    };
    
    let spawnCount = 0;
    const attempts = 100000; // 100k attempts
    
    console.log(`Running ${attempts} wall breaks...`);
    
    for (let i = 0; i < attempts; i++) {
        const x = 25 + Math.floor(Math.random() * 20) + 5; // Random position 5-25 tiles from entrance
        const y = 25 + Math.floor(Math.random() * 20) + 5;
        
        const result = await deeperMineChecker.checkForExitTileSpawn(mockEntry, x, y);
        if (result) {
            spawnCount++;
            
            // Reset for next spawn
            mockEntry.gameData.stats.exitTileFound = false;
        }
    }
    
    const expectedRate = 1 / 10000;
    const actualRate = spawnCount / attempts;
    const expectedSpawns = attempts * expectedRate;
    
    console.log(`Expected spawns: ~${expectedSpawns}`);
    console.log(`Actual spawns: ${spawnCount}`);
    console.log(`Actual rate: ${(actualRate * 100).toFixed(4)}%`);
    console.log(`Expected rate: ${(expectedRate * 100).toFixed(4)}%`);
    console.log(`Variance: ${((actualRate - expectedRate) / expectedRate * 100).toFixed(2)}%`);
}

module.exports = {
    testMineConfigurations,
    testConditionTypes,
    testExitTileSpawning,
    testSpawnRate
};
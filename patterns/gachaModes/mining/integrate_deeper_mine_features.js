// integrate_deeper_mine_features.js
// Integration guide for the new deeper mine checker features (persistent value & exit tile)

const deeperMineChecker = require('../../mining/deeperMineChecker');

/**
 * INTEGRATION INSTRUCTIONS:
 * 
 * This file shows how to integrate the new deeper mine features into your mining system.
 * You need to add these code snippets to your main mining processing logic.
 */

// ============================================
// 1. WHEN A WALL IS BROKEN
// ============================================
// Add this to your wall breaking logic (wherever walls are destroyed and items are collected)

async function onWallBroken(channel, dbEntry, wallPosition, itemsCollected) {
    // Check for exit tile spawn (1/1000 chance)
    const exitTileSpawned = await deeperMineChecker.checkForExitTileSpawn(dbEntry);
    
    if (exitTileSpawned) {
        // Create the special exit tile item
        const exitTile = deeperMineChecker.createExitTileItem();
        
        // Add to the event log or display to players
        const exitTileMessage = `⚡ RARE DISCOVERY! An Exit Tile has appeared at (${wallPosition.x}, ${wallPosition.y})!`;
        
        // Mark the exit tile as found in the database
        await deeperMineChecker.markExitTileFound(dbEntry);
        
        // You might want to add a special notification
        await channel.send({
            content: '🚪 **EXIT TILE DISCOVERED!** Breaking this tile will unlock access to deeper mine levels!',
            ephemeral: false
        });
        
        return {
            exitTileFound: true,
            message: exitTileMessage,
            exitTile: exitTile
        };
    }
    
    return { exitTileFound: false };
}

// ============================================
// 2. WHEN ITEMS ARE COLLECTED (ADDED TO MINECART)
// ============================================
// Add this whenever items are added to the minecart to track persistent value

async function onItemsCollected(dbEntry, items, totalValue) {
    // Update the persistent lifetime value
    if (totalValue > 0) {
        await deeperMineChecker.updatePersistentRunValue(dbEntry, totalValue);
        
        // Optional: Get current lifetime value for display
        const lifetimeValue = deeperMineChecker.calculatePersistentRunValue(dbEntry);
        console.log(`[MINING] Lifetime value updated: ${lifetimeValue} (+${totalValue})`);
    }
}

// ============================================
// 3. WHEN ENTERING A NEW DEEPER MINE LEVEL
// ============================================
// Add this when a player successfully enters a deeper mine level

async function onEnterDeeperLevel(channel, dbEntry) {
    // Reset the exit tile status for the new level
    await deeperMineChecker.resetExitTileStatus(dbEntry);
    
    console.log(`[DEEPER MINE] Entered new level, exit tile status reset`);
}

// ============================================
// 4. EXAMPLE INTEGRATION IN YOUR MAIN MINING LOOP
// ============================================

async function processPlayerMiningAction(member, playerData, mapData, dbEntry, channel) {
    // ... existing code ...
    
    // When player breaks a wall
    if (targetTile.type === 'WALL') {
        // Existing wall breaking logic
        const minedResult = await mineFromWall(/* ... */);
        
        // Calculate total value of items mined
        let totalValue = 0;
        const itemsCollected = [];
        
        if (minedResult.item) {
            const itemValue = minedResult.item.value * minedResult.quantity;
            totalValue += itemValue;
            itemsCollected.push({
                item: minedResult.item,
                quantity: minedResult.quantity,
                value: itemValue
            });
        }
        
        // NEW: Check for exit tile spawn
        const exitTileResult = await onWallBroken(
            channel, 
            dbEntry, 
            { x: targetX, y: targetY },
            itemsCollected
        );
        
        if (exitTileResult.exitTileFound) {
            // Add special message to event log
            eventLogs.push(exitTileResult.message);
            
            // Optionally add the exit tile to minecart as a special item
            // This depends on your implementation
        }
        
        // NEW: Update persistent lifetime value
        if (totalValue > 0) {
            await onItemsCollected(dbEntry, itemsCollected, totalValue);
        }
        
        // Update stats (existing code)
        if (!dbEntry.gameData.stats) dbEntry.gameData.stats = {};
        dbEntry.gameData.stats.wallsBroken = (dbEntry.gameData.stats.wallsBroken || 0) + 1;
        dbEntry.gameData.stats.totalOreFound = (dbEntry.gameData.stats.totalOreFound || 0) + minedResult.quantity;
        
        // ... rest of existing wall breaking logic ...
    }
    
    // ... rest of mining logic ...
}

// ============================================
// 5. CONFIGURATION IN gachaServers.json
// ============================================
/*
To use these new condition types, update your mine configurations:

For persistent value condition:
{
    "id": 1,
    "name": "Coal Mine",
    "nextLevelConditionType": "persistentValue",
    "conditionCost": 50000,  // Total lifetime value needed
    ...
}

For exit tile condition:
{
    "id": 2,
    "name": "Iron Mine", 
    "nextLevelConditionType": "exitTile",
    "conditionCost": 1,  // Always 1 for exit tile
    ...
}
*/

// ============================================
// 6. DATABASE SCHEMA ADDITIONS
// ============================================
/*
The following fields are added to gameData.stats:
- lifetimeValue: number - Total accumulated value across all runs
- exitTileFound: boolean - Whether the exit tile has been found
- exitTileFoundAt: Date - When the exit tile was found
*/

module.exports = {
    onWallBroken,
    onItemsCollected,
    onEnterDeeperLevel,
    
    // Export for testing
    integrationExample: processPlayerMiningAction
};
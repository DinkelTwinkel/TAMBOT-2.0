// DEEPER MINE INTEGRATION PATCH
// Apply these changes to integrate the new persistent value & exit tile features

// ============================================
// FILE: patterns/gachaModes/mining/miningDatabase.js
// ============================================

// Add this import at the top of miningDatabase.js:
const deeperMineChecker = require('../mining/deeperMineChecker');

// MODIFICATION 1: Update the addItemToMinecart function
// Find the existing addItemToMinecart function and add persistent value tracking:

async function addItemToMinecart(dbEntry, playerId, itemId, amount) {
    const channelId = dbEntry.channelId;
    
    // Debug logging to verify items are being added
    if (Math.random() < 0.1) { // Log 10% of additions to avoid spam
        console.log(`[MINECART] Adding ${amount}x item ${itemId} for player ${playerId} to channel ${channelId}`);
    }
    
    // ===== NEW CODE START =====
    // Calculate value for persistent tracking
    const { miningItemPool, treasureItems } = require('./miningConstants_unified');
    const poolItem = miningItemPool.find(item => item.itemId === itemId) || 
                    treasureItems.find(item => item.itemId === itemId);
    
    if (poolItem && poolItem.value) {
        const itemValue = poolItem.value * amount;
        // Update persistent lifetime value
        await deeperMineChecker.updatePersistentRunValue(dbEntry, itemValue);
        console.log(`[DEEPER MINE] Added ${itemValue} to lifetime value`);
    }
    // ===== NEW CODE END =====
    
    try {
        await gachaVC.updateOne(
            { channelId: channelId },
            {
                $inc: {
                    [`gameData.minecart.items.${itemId}.quantity`]: amount,
                    [`gameData.minecart.items.${itemId}.contributors.${playerId}`]: amount,
                    [`gameData.minecart.contributors.${playerId}`]: amount,
                    'gameData.stats.totalOreFound': amount
                }
            }
        );
    } catch (error) {
        // ... existing error handling ...
    }
}

// ============================================
// FILE: patterns/gachaModes/mining_optimized_v5_performance.js
// ============================================

// MODIFICATION 2: Add exit tile checking when walls are broken
// In the main mining loop where walls are broken (processPlayerActionsEnhanced or similar):

// Find where walls are broken and stats.wallsBroken is incremented
// Add this code after a wall is broken:

// When a wall is broken (look for where wallsBroken stat is incremented)
if (targetTile.type === TILE_TYPES.WALL) {
    // ... existing wall breaking code ...
    
    // Increment wall broken stats
    wallsBroken++;
    if (!dbEntry.gameData.stats) dbEntry.gameData.stats = {};
    dbEntry.gameData.stats.wallsBroken = (dbEntry.gameData.stats.wallsBroken || 0) + 1;
    
    // ===== NEW CODE START =====
    // Check for exit tile spawn (1/1000 chance)
    const exitTileSpawned = await deeperMineChecker.checkForExitTileSpawn(dbEntry);
    
    if (exitTileSpawned) {
        // Create the special exit tile  
        const exitTile = deeperMineChecker.createExitTileItem();
        
        // Mark exit tile as found
        await deeperMineChecker.markExitTileFound(dbEntry);
        
        // Add to event log
        eventLogs.push(`⚡ LEGENDARY DISCOVERY! ${member.displayName} found an Exit Tile!`);
        
        // Send special notification
        await channel.send({
            content: `🚪 **EXIT TILE DISCOVERED by ${member.displayName}!**\nBreaking this tile has unlocked access to deeper mine levels!`,
            ephemeral: false
        });
        
        // Optionally add the exit tile as a special item to minecart
        // This gives it a visual presence in the minecart
        await addItemToMinecart(dbEntry, member.id, 'exit_tile_001', 1);
    }
    // ===== NEW CODE END =====
    
    // ... rest of wall breaking logic ...
}

// ============================================
// FILE: patterns/gachaModes/mining/miningEvents.js (if it handles deeper level transitions)
// ============================================

// MODIFICATION 3: Reset exit tile when entering deeper level
// When a player successfully enters a deeper mine level:

async function handleDeeperLevelTransition(channel, dbEntry, newLevelId) {
    // ... existing transition logic ...
    
    // ===== NEW CODE START =====
    // Reset exit tile status for the new level
    await deeperMineChecker.resetExitTileStatus(dbEntry);
    console.log(`[DEEPER MINE] Entered new level ${newLevelId}, exit tile status reset`);
    // ===== NEW CODE END =====
    
    // ... rest of transition logic ...
}

// ============================================
// TESTING THE INTEGRATION
// ============================================

// 1. Test persistent value tracking:
//    - Mine some items and check if lifetimeValue is being updated in the database
//    - Check gameData.stats.lifetimeValue in your MongoDB

// 2. Test exit tile spawning:
//    - Set up a test mine with "exitTile" condition type
//    - Break walls and watch for the 1/1000 chance spawn
//    - For testing, you can temporarily increase the spawn chance in deeperMineChecker.js

// 3. Test deeper mine button:
//    - The button should already appear when conditions are met (this was already integrated)
//    - Test with both "persistentValue" and "exitTile" condition types

// ============================================
// CONFIGURATION EXAMPLE
// ============================================

// In your gachaServers.json, configure mines like this:

/*
{
    "id": 1,
    "name": "⛏️ Coal Mines",
    "power": 1,
    "nextLevelConditionType": "persistentValue",
    "conditionCost": 10000,
    "nextLevelId": 2
},
{
    "id": 2,
    "name": "⛏️ Deep Coal Mines",
    "power": 2,
    "isDeeper": true,
    "nextLevelConditionType": "exitTile",
    "conditionCost": 1,
    "nextLevelId": 3
}
*/
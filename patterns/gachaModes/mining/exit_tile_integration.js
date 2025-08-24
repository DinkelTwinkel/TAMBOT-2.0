// exit_tile_integration.js
// Simple integration for exit tile system (1/10000 chance on wall break)

const deeperMineChecker = require('../../mining/deeperMineChecker');

/**
 * INTEGRATION EXAMPLE FOR WALL BREAKING
 * Add this to your wall breaking logic in mining_optimized_v5_performance.js
 */

async function handleWallBreak(member, dbEntry, channel, targetX, targetY, eventLogs) {
    // ... existing wall breaking code ...
    
    // INCREMENT WALLS BROKEN STAT
    if (!dbEntry.gameData.stats) dbEntry.gameData.stats = {};
    dbEntry.gameData.stats.wallsBroken = (dbEntry.gameData.stats.wallsBroken || 0) + 1;
    
    // CHECK FOR EXIT TILE SPAWN (1/10000 chance)
    const exitTileData = await deeperMineChecker.checkForExitTileSpawn(dbEntry, targetX, targetY);
    
    if (exitTileData) {
        // Exit tile spawned! Add discoverer info
        exitTileData.discoveredBy = member.id;
        
        // Mark it as found and save position to database
        await deeperMineChecker.markExitTileFound(dbEntry, exitTileData);
        
        // Add to event log for display
        eventLogs.push(`⚡ LEGENDARY DISCOVERY! ${member.displayName} found an EXIT TILE at (${targetX}, ${targetY})!`);
        
        // Send special notification to channel
        await channel.send({
            content: `🚪 **EXIT TILE DISCOVERED!**\n${member.displayName} has found the exit tile at position (${targetX}, ${targetY})!\nThis unlocks access to deeper mine levels!`,
            ephemeral: false
        });
        
        console.log(`[EXIT TILE] Found by ${member.displayName} at (${targetX}, ${targetY})`);
    }
    
    // ... rest of wall breaking logic ...
}

/**
 * VISUAL RENDERING INTEGRATION
 * Add this to your map rendering system to draw the exit tile
 */

function renderMapWithExitTile(mapData, dbEntry) {
    // Get exit tile data if it exists
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    
    if (exitTile && exitTile.active) {
        // Exit tile exists, render it on the map
        const visual = deeperMineChecker.createExitTileVisual(exitTile.x, exitTile.y);
        
        // Override the tile at that position with exit tile visual
        if (mapData.tiles[exitTile.y] && mapData.tiles[exitTile.y][exitTile.x]) {
            mapData.tiles[exitTile.y][exitTile.x] = {
                ...mapData.tiles[exitTile.y][exitTile.x],
                type: 'EXIT_TILE',
                symbol: visual.symbol,
                color: visual.color,
                glow: visual.glow,
                special: true
            };
        }
    }
    
    return mapData;
}

/**
 * CHECK IF PLAYER IS AT EXIT TILE
 * Use this to check if a player has reached the exit tile position
 */

function isPlayerAtExitTile(playerX, playerY, dbEntry) {
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    
    if (!exitTile || !exitTile.active) {
        return false;
    }
    
    return playerX === exitTile.x && playerY === exitTile.y;
}

/**
 * HANDLE DEEPER LEVEL TRANSITION
 * When player successfully enters a deeper level
 */

async function handleDeeperLevelTransition(channel, dbEntry, newLevelId) {
    // ... existing transition logic ...
    
    // Reset exit tile for the new level
    await deeperMineChecker.resetExitTileStatus(dbEntry);
    
    console.log(`[DEEPER LEVEL] Transitioned to level ${newLevelId}, exit tile reset`);
    
    // ... rest of transition logic ...
}

/**
 * FULL INTEGRATION EXAMPLE
 * This shows how it all fits together in your main mining loop
 */

async function processPlayerMiningAction(member, playerData, mapData, dbEntry, channel, eventLogs) {
    // ... existing mining logic ...
    
    const playerPos = mapData.playerPositions[member.id];
    const targetX = playerPos.x + directionX;
    const targetY = playerPos.y + directionY;
    const targetTile = mapData.tiles[targetY][targetX];
    
    if (targetTile.type === 'WALL') {
        // Wall breaking logic
        const minedResult = await mineFromWall(/* ... */);
        
        // Update stats
        if (!dbEntry.gameData.stats) dbEntry.gameData.stats = {};
        dbEntry.gameData.stats.wallsBroken = (dbEntry.gameData.stats.wallsBroken || 0) + 1;
        
        // ===== EXIT TILE CHECK =====
        const exitTileData = await deeperMineChecker.checkForExitTileSpawn(dbEntry, targetX, targetY);
        
        if (exitTileData) {
            exitTileData.discoveredBy = member.id;
            await deeperMineChecker.markExitTileFound(dbEntry, exitTileData);
            
            // Visual feedback
            eventLogs.push(`⚡ ${member.displayName} discovered an EXIT TILE!`);
            
            // Special notification
            await channel.send({
                content: `🚪 **EXIT TILE DISCOVERED at (${targetX}, ${targetY})!**\nThe path to deeper levels has been revealed!`,
                ephemeral: false
            });
            
            // The tile will now show as an exit tile on the map
            // The deeper mine button will be enabled when conditions are met
        }
        // ===== END EXIT TILE CHECK =====
        
        // Convert wall to floor
        targetTile.type = 'FLOOR';
        targetTile.discovered = true;
        
        // Add mined items to minecart
        await addItemToMinecart(dbEntry, member.id, minedResult.item.itemId, minedResult.quantity);
        
        eventLogs.push(`${member.displayName} broke a wall and found ${minedResult.quantity}x ${minedResult.item.name}`);
    }
    
    // Check if player reached the exit tile
    if (isPlayerAtExitTile(playerPos.x, playerPos.y, dbEntry)) {
        eventLogs.push(`${member.displayName} is standing on the EXIT TILE! Ready to go deeper!`);
    }
    
    // ... rest of mining logic ...
}

/**
 * TESTING THE SYSTEM
 * For testing, you can temporarily increase the spawn chance
 */

// In deeperMineChecker.js, change:
// const spawnChance = 1 / 10000;  // Normal rate
// To:
// const spawnChance = 1 / 10;     // Testing rate (1 in 10 for quick testing)

module.exports = {
    handleWallBreak,
    renderMapWithExitTile,
    isPlayerAtExitTile,
    handleDeeperLevelTransition,
    processPlayerMiningAction
};
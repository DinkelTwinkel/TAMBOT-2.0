# Deeper Mine System - Configuration & Testing Guide

## Quick Summary

The deeper mine system now has two unlock conditions:
1. **Persistent Value**: Lifetime accumulated value across all mining runs
2. **Exit Tile**: 1/10,000 chance to spawn when breaking any wall

## Exit Tile System (Simplified)

- **Spawn Rate**: 1 in 10,000 blocks broken
- **Storage**: Position stored in `gameData.exitTile` for custom visuals
- **Visual Data**: Contains x, y coordinates, discoverer, and timestamp
- **Reset**: Clears when entering a new deeper level

## Database Structure

```javascript
gameData: {
    // Stats for deeper mine conditions
    stats: {
        wallsBroken: number,
        totalOreFound: number,
        treasuresFound: number,
        lifetimeValue: number,        // NEW: Persistent total value
        exitTileFound: boolean,        // NEW: Exit tile status
        exitTileFoundAt: Date          // NEW: When found
    },
    
    // Exit tile position data for rendering
    exitTile: {                       // NEW: Exit tile visual data
        x: number,
        y: number,
        discoveredAt: timestamp,
        discoveredBy: playerId,
        active: boolean
    }
}
```

## Configuration Examples (gachaServers.json)

### Using Persistent Value Condition
```json
{
    "id": 1,
    "name": "⛏️ Coal Mines",
    "power": 1,
    "nextLevelConditionType": "persistentValue",
    "conditionCost": 50000,
    "nextLevelId": 2
}
```

### Using Exit Tile Condition
```json
{
    "id": 2,
    "name": "⛏️ Iron Mines",
    "power": 2,
    "nextLevelConditionType": "exitTile",
    "conditionCost": 1,
    "nextLevelId": 3
}
```

### Other Condition Types
```json
{
    "nextLevelConditionType": "wallsBroken",     // Break X walls
    "nextLevelConditionType": "oresFound",       // Find X ores
    "nextLevelConditionType": "treasuresFound",  // Find X treasures
    "nextLevelConditionType": "totalValue",      // Current minecart value
    "nextLevelConditionType": "rareOresFound",   // Find X rare+ ores
    "nextLevelConditionType": "fossilsFound"     // Find X fossils
}
```

## Testing the System

### 1. Test Exit Tile Spawning

For quick testing, temporarily increase the spawn rate in `deeperMineChecker.js`:

```javascript
// In checkForExitTileSpawn function:
const spawnChance = 1 / 10;  // Testing rate (instead of 1/10000)
```

### 2. Test Persistent Value

Mine some items and check the database:

```javascript
// Check current lifetime value in MongoDB
db.gachavcs.findOne({ channelId: "YOUR_CHANNEL_ID" }, { "gameData.stats.lifetimeValue": 1 })
```

### 3. Force Spawn Exit Tile (Debug)

```javascript
// Add this debug command to force spawn an exit tile
async function debugSpawnExitTile(channel, dbEntry, x, y) {
    const exitTileData = {
        x: x || 10,
        y: y || 10,
        discoveredAt: Date.now(),
        discoveredBy: "DEBUG"
    };
    
    await deeperMineChecker.markExitTileFound(dbEntry, exitTileData);
    console.log("[DEBUG] Exit tile spawned at", x, y);
}
```

## Visual Rendering Integration

The exit tile data is stored in `gameData.exitTile` and can be used for custom visuals:

```javascript
// In your map rendering code
const exitTile = deeperMineChecker.getExitTileData(dbEntry);
if (exitTile) {
    // Draw special tile at exitTile.x, exitTile.y
    // Use golden color (#FFD700) with pulsing animation
    drawSpecialTile(exitTile.x, exitTile.y, '🚪', '#FFD700');
}
```

## Integration Checklist

✅ **Already Done:**
- [x] Deeper mine checker module updated
- [x] Persistent value tracking in miningDatabase.js
- [x] Exit tile position storage system
- [x] Deeper mine button display in logEvent

❌ **Still Needed:**
- [ ] Add exit tile check to wall breaking logic in main mining loop
- [ ] Add visual rendering for exit tile on map
- [ ] Add notification when player stands on exit tile
- [ ] Handle deeper level transition and reset

## Quick Integration Code

Add this to your wall breaking logic:

```javascript
// After breaking a wall at (targetX, targetY)
const exitTileData = await deeperMineChecker.checkForExitTileSpawn(dbEntry, targetX, targetY);

if (exitTileData) {
    exitTileData.discoveredBy = member.id;
    await deeperMineChecker.markExitTileFound(dbEntry, exitTileData);
    
    eventLogs.push(`⚡ EXIT TILE discovered by ${member.displayName}!`);
    
    await channel.send({
        content: `🚪 **EXIT TILE FOUND at (${targetX}, ${targetY})!**`,
        ephemeral: false
    });
}
```

## Troubleshooting

### Exit tile not spawning?
- Check spawn rate (default 1/10000)
- Verify wall breaks are being counted
- Check if already found: `dbEntry.gameData.stats.exitTileFound`

### Persistent value not updating?
- Check if items have values in miningConstants_unified.js
- Verify addItemToMinecart is being called
- Check database: `gameData.stats.lifetimeValue`

### Deeper button not appearing?
- Check mine configuration has nextLevelConditionType
- Verify conditions are met with getProgress()
- Check if already in deeper mine: `mineConfig.isDeeper`

## Support Files

- **Main Module**: `patterns/mining/deeperMineChecker.js`
- **Integration Example**: `patterns/gachaModes/mining/exit_tile_integration.js`
- **Database Updates**: `patterns/gachaModes/mining/miningDatabase.js`
- **This Guide**: `patterns/gachaModes/mining/DEEPER_MINE_CONFIG.md`
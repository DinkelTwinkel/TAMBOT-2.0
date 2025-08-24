# Exit Tile System - Map Expansion Safe Version

## Problem Solved
The exit tile position is now stored **relative to the entrance** rather than just absolute coordinates. This means it won't break when the map expands or shifts.

## How It Works

### Position Storage
The exit tile now stores BOTH absolute and relative positions:

```javascript
gameData.exitTile = {
    // Absolute position (for current rendering)
    x: 25,
    y: 30,
    
    // Relative to entrance (stable across map changes)
    relativeX: 15,  // 15 tiles right of entrance
    relativeY: 10,  // 10 tiles down from entrance
    
    // Map size when found (to detect changes)
    mapWidth: 50,
    mapHeight: 50,
    
    // Metadata
    discoveredBy: "playerId",
    discoveredAt: timestamp,
    active: true
}
```

### Automatic Repositioning
When `getExitTileData()` is called, it:
1. Checks if the map has expanded (width/height changed)
2. If yes, recalculates position from relative coordinates
3. Ensures the new position is within map bounds
4. Returns the updated position

### Map Expansion Handling

When your map expands, call this function:

```javascript
const { updateExitTileAfterExpansion } = require('./deeperMineChecker');

// After map expansion
await updateExitTileAfterExpansion(dbEntry, oldMapBounds, newMapBounds);
```

## Integration with Map Expansion

```javascript
// In your map expansion code
async function expandMap(channel, dbEntry) {
    const oldMap = dbEntry.gameData.map;
    
    // Your expansion logic
    const newMap = {
        width: oldMap.width + 20,
        height: oldMap.height + 20,
        entranceX: oldMap.entranceX + 10,  // Entrance moved
        entranceY: oldMap.entranceY + 10,
        tiles: expandedTiles
    };
    
    // Update exit tile position
    await deeperMineChecker.updateExitTileAfterExpansion(
        dbEntry,
        {
            width: oldMap.width,
            height: oldMap.height,
            entranceX: oldMap.entranceX,
            entranceY: oldMap.entranceY
        },
        {
            width: newMap.width,
            height: newMap.height,
            entranceX: newMap.entranceX,
            entranceY: newMap.entranceY
        }
    );
    
    // Save new map
    dbEntry.gameData.map = newMap;
    await dbEntry.save();
}
```

## Rendering the Exit Tile

```javascript
// Always get fresh position (handles expansion automatically)
const exitTile = deeperMineChecker.getExitTileData(dbEntry);

if (exitTile && exitTile.active) {
    // Position is automatically adjusted if map expanded
    drawExitTile(exitTile.x, exitTile.y);
}
```

## Safety Features

1. **Entrance Distance Check**: Exit tiles won't spawn within 2 tiles of the entrance
2. **Bounds Checking**: Position is clamped to map boundaries after expansion
3. **Relative Storage**: Position relative to entrance is preserved
4. **Auto-Detection**: Map changes are detected automatically

## Example Scenarios

### Scenario 1: Map Expands East/South
- Original map: 50x50, entrance at (25, 25)
- Exit tile at: (35, 40), relative: (+10, +15)
- Map expands to: 70x70, entrance stays at (25, 25)
- Exit tile stays at: (35, 40) ✓

### Scenario 2: Map Expands All Directions
- Original map: 50x50, entrance at (25, 25)
- Exit tile at: (35, 40), relative: (+10, +15)
- Map expands to: 70x70, entrance moves to (35, 35)
- Exit tile moves to: (45, 50) - maintains relative position ✓

### Scenario 3: Exit Tile Out of Bounds
- Exit tile would be at: (80, 90)
- Map size: 70x70
- Exit tile clamped to: (69, 69) - stays within bounds ✓

## Testing

```javascript
// Test map expansion handling
async function testMapExpansion(channel, dbEntry) {
    // Force spawn exit tile for testing
    const exitData = {
        x: 30,
        y: 30,
        discoveredBy: "TEST",
        discoveredAt: Date.now()
    };
    
    await deeperMineChecker.markExitTileFound(dbEntry, exitData);
    console.log("Exit tile placed at (30, 30)");
    
    // Simulate map expansion
    const oldBounds = {
        width: 50, height: 50,
        entranceX: 25, entranceY: 25
    };
    
    const newBounds = {
        width: 100, height: 100,
        entranceX: 50, entranceY: 50  // Entrance moved
    };
    
    await deeperMineChecker.updateExitTileAfterExpansion(
        dbEntry, oldBounds, newBounds
    );
    
    // Check new position
    const exitTile = deeperMineChecker.getExitTileData(dbEntry);
    console.log("Exit tile now at:", exitTile.x, exitTile.y);
    // Should be at (55, 55) - maintained relative position
}
```

## Files Modified

1. **`deeperMineChecker.js`**:
   - Stores relative position to entrance
   - Auto-adjusts on map expansion
   - Validates position bounds

2. **`map_expansion_handler.js`** (NEW):
   - Helper functions for map expansion
   - Position validation
   - Integration examples

## Quick Reference

```javascript
// Check for exit tile spawn (unchanged)
const exitData = await deeperMineChecker.checkForExitTileSpawn(dbEntry, x, y);

// Mark as found (now stores relative position)
await deeperMineChecker.markExitTileFound(dbEntry, exitData);

// Get position (auto-adjusts for map changes)
const exitTile = deeperMineChecker.getExitTileData(dbEntry);

// After map expansion
await deeperMineChecker.updateExitTileAfterExpansion(dbEntry, oldBounds, newBounds);
```

The system is now **fully map-expansion safe**!
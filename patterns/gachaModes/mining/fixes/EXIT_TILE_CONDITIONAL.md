# Exit Tile System - Conditional Spawning

## Important Change: Exit Tiles Only Spawn When Needed

The exit tile system now **only spawns exit tiles if the mine's deeper level condition is set to "exitTile"**. This prevents unnecessary exit tiles from appearing in mines that use different unlock conditions.

## How It Works

### Automatic Condition Checking

When `checkForExitTileSpawn()` is called, it now:
1. **Checks the mine's configuration** for the current channel
2. **Verifies the condition type** is "exitTile"
3. **Only then** proceeds with the 1/10,000 spawn chance

### Configuration Example

Exit tiles will **ONLY** spawn in mines configured like this:

```json
{
    "id": 2,
    "name": "⛏️ Iron Mines",
    "power": 2,
    "nextLevelConditionType": "exitTile",  // ← MUST be "exitTile"
    "conditionCost": 1,
    "nextLevelId": 3
}
```

Exit tiles will **NOT** spawn in mines with other conditions:

```json
{
    "id": 1,
    "name": "⛏️ Coal Mines",
    "power": 1,
    "nextLevelConditionType": "persistentValue",  // ← Not "exitTile"
    "conditionCost": 50000,
    "nextLevelId": 2
}
```

## New Helper Functions

### Check if a mine uses exit tiles
```javascript
const usesExitTiles = deeperMineChecker.usesExitTileCondition(mineTypeId);
// Returns: true/false
```

### Get condition type for a mine
```javascript
const conditionType = deeperMineChecker.getMineConditionType(mineTypeId);
// Returns: "exitTile", "persistentValue", "wallsBroken", etc.
```

## Integration (Unchanged)

The integration remains the same - you still call the function on wall breaks:

```javascript
// This will now return null if the mine doesn't use exit tiles
const exitTileData = await deeperMineChecker.checkForExitTileSpawn(dbEntry, targetX, targetY);

if (exitTileData) {
    // Exit tile spawned (only happens if mine uses exitTile condition)
    exitTileData.discoveredBy = member.id;
    await deeperMineChecker.markExitTileFound(dbEntry, exitTileData);
    
    eventLogs.push(`⚡ EXIT TILE found by ${member.displayName}!`);
}
```

## Spawn Logic Summary

For an exit tile to spawn, ALL of these must be true:
1. ✅ Mine has `nextLevelConditionType: "exitTile"`
2. ✅ No exit tile already found
3. ✅ Wall is at least 2 tiles from entrance
4. ✅ Random roll succeeds (1/10,000 chance)

## Testing Different Conditions

### Test Setup for Exit Tile Mines
```json
{
    "id": 100,
    "name": "⛏️ Test Mine (Exit)",
    "nextLevelConditionType": "exitTile",
    "conditionCost": 1
}
```
Result: Exit tiles CAN spawn (1/10,000 chance)

### Test Setup for Value-Based Mines
```json
{
    "id": 101,
    "name": "⛏️ Test Mine (Value)",
    "nextLevelConditionType": "persistentValue",
    "conditionCost": 10000
}
```
Result: Exit tiles will NEVER spawn

### Test Setup for Wall-Based Mines
```json
{
    "id": 102,
    "name": "⛏️ Test Mine (Walls)",
    "nextLevelConditionType": "wallsBroken",
    "conditionCost": 500
}
```
Result: Exit tiles will NEVER spawn

## Debug Logging

When an exit tile spawns, you'll see:
```
[DEBUG-DEEPER] EXIT TILE SPAWNED! Roll: 0.00008 vs chance: 0.0001
[DEBUG-DEEPER] Exit tile location: (25, 30)
[DEBUG-DEEPER] Distance from entrance: 15
[DEBUG-DEEPER] Mine type: Iron Mines
```

When conditions aren't met, the function silently returns null.

## Benefits

1. **No Wasted Exit Tiles**: Exit tiles only appear where they're needed
2. **Clear Purpose**: Each mine has one specific unlock condition
3. **Better UX**: Players won't be confused by exit tiles that don't do anything
4. **Flexible System**: Different mines can use different unlock conditions

## Complete Condition Types

- `"exitTile"` - Find the rare exit tile (1/10,000 blocks)
- `"persistentValue"` - Accumulate lifetime value
- `"wallsBroken"` - Break X walls
- `"oresFound"` - Find X ores
- `"treasuresFound"` - Find X treasures
- `"totalValue"` - Current minecart value
- `"rareOresFound"` - Find X rare+ ores
- `"fossilsFound"` - Find X fossils

Each mine should use exactly ONE of these conditions.

## Migration Note

If you have existing mines without `nextLevelConditionType`, exit tiles won't spawn in them. This is intentional - only properly configured mines will have exit tiles.
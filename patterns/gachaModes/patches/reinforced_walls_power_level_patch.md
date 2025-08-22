# Reinforced Walls Power Level Patch

## Summary
This patch increases the generation of reinforced walls based on the server's power level configuration.

## Changes Made

### 1. miningConstants_unified.js
Added `reinforcedWallChance` to each power level configuration:
- Level 1: 5% chance (base)
- Level 2: 7% chance
- Level 3: 10% chance
- Level 4: 13% chance
- Level 5: 16% chance
- Level 6: 20% chance
- Level 7: 25% chance (maximum difficulty)

Added helper function:
```javascript
function getReinforcedWallChance(powerLevel) {
    const config = POWER_LEVEL_CONFIG[powerLevel] || POWER_LEVEL_CONFIG[1];
    return config.reinforcedWallChance || 0.05;
}
```

### 2. miningMap.js
Updated `generateTileType` function to accept power level:
```javascript
function generateTileType(channelId, x, y, powerLevel = 1) {
    // ... existing code ...
    const powerConfig = POWER_LEVEL_CONFIG[powerLevel] || POWER_LEVEL_CONFIG[1];
    const reinforcedWallChance = powerConfig.reinforcedWallChance || 0.05;
    
    // ... existing checks ...
    if (random < reinforcedWallChance) return TILE_TYPES.REINFORCED_WALL;
    // ... rest of function
}
```

Updated `initializeMap` to accept and use power level:
```javascript
function initializeMap(channelId, powerLevel = 1) {
    // ... when generating tiles:
    const tileType = generateTileType(channelId, x, y, powerLevel);
    // ...
}
```

Updated `expandMap` to accept and use power level:
```javascript
function expandMap(mapData, direction, channelId, powerLevel = 1) {
    // ... when generating new tiles:
    const tileType = generateTileType(channelId, x, y, powerLevel);
    // ...
}
```

Updated `checkMapExpansion` to pass power level to expandMap:
```javascript
const expandedMap = expandMap(mapData, expansionDirection, channelId, serverPowerLevel);
```

## Required Updates in mining_optimized_v5_performance.js

### Find and update all calls to initializeMap:
Look for lines like:
```javascript
dbEntry.gameData.map = initializeMap(channel.id);
```

Replace with:
```javascript
// Get the server power level first
const serverPowerLevel = dbEntry.serverPower || 1;
dbEntry.gameData.map = initializeMap(channel.id, serverPowerLevel);
```

### Common locations to check:
1. In the mining start function
2. When resetting the map
3. During game initialization
4. After breaks end

### Example pattern to search for:
```javascript
// Search for: initializeMap(
// Replace pattern: initializeMap(channelId, serverPowerLevel)
```

## Testing
After applying these changes:
1. Start a mining session in a high power level server (5-7)
2. Observe that reinforced walls appear more frequently
3. Check the map generation to confirm the percentages match expectations

## Impact
- Higher power level servers will have more challenging mining experiences
- Reinforced walls take 5 hits to break (vs 1 for normal walls)
- This increases the difficulty and time required for mining in higher tier servers
- Players will need better pickaxes and teamwork to efficiently mine in high-level servers

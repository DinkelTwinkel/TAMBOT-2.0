# Mining Rail System Documentation

## Overview
The Mining Rail System adds minecart rail pathfinding and visualization to the TAMBOT 2.0 mining game mode. Rails can be built between any two floor tiles using A* pathfinding algorithm for optimal routes.

## Files Created/Modified

### New Files
1. **`patterns/gachaModes/mining/railPathfinding.js`**
   - Core rail pathfinding logic using A* algorithm
   - Functions for building, clearing, and querying rails
   - Validates paths and handles edge cases

2. **`commands/debug/buildRails.js`**
   - Debug slash command for testing rail functionality
   - Three subcommands: build, clear, info

### Modified Files
1. **`patterns/generateMiningProcedural.js`**
   - Added `drawRails()` function for visual rendering
   - Updated tile drawing loop to render rails
   - Rails show as metallic tracks with wooden ties

## Usage

### Slash Commands
```
/debugrails build - Build rails from entrance to your current position
/debugrails clear - Remove all rails from the map
/debugrails info  - Show information about current rail network
```

### Programmatic API
```javascript
const { buildMinecartRails, clearAllRails, getRailPositions } = require('./patterns/gachaModes/mining/railPathfinding');

// Build rails between two points
const result = await buildMinecartRails(activeVC, startPos, endPos);
if (result.success) {
    activeVC.gameData.map = result.mapData;
    await activeVC.save();
}

// Clear all rails
const clearedMap = clearAllRails(mapData);

// Get all rail positions
const railPositions = getRailPositions(mapData);
```

## Visual Features

### Rail Appearance
- **Wooden Ties**: Brown railroad ties perpendicular to rail direction
- **Metal Rails**: Silver parallel tracks
- **Junctions**: Special junction plates at intersections
- **Adaptive Scaling**: Rails scale with tile size
- **Smart Connections**: Automatic straight/curved segments

### Connection Types
- Straight segments (horizontal/vertical)
- 90-degree curves
- T-junctions (3-way)
- Cross-junctions (4-way)

## Technical Details

### Pathfinding Algorithm
- Uses A* algorithm for optimal pathfinding
- Manhattan distance heuristic
- Only traverses floor tiles
- Handles impossible paths gracefully

### Data Storage
- Rails stored as `hasRail: true` on tile objects
- No additional database schema changes needed
- Lightweight boolean flag per tile

### Performance
- Efficient A* implementation with priority queue
- Rail rendering optimized for different tile sizes
- Minimal memory overhead

## Testing Workflow

1. Join a mining voice channel
2. Mine tunnels to create floor space
3. Use `/debugrails build` to create rails from entrance to your position
4. View the updated map with rails rendered
5. Use `/debugrails info` to see statistics
6. Use `/debugrails clear` to remove rails

## Customization

### Colors
Edit in `drawRails()` function:
```javascript
ctx.fillStyle = '#654321';   // Wood color for ties
ctx.strokeStyle = '#C0C0C0'; // Metal color for rails
```

### Rail Dimensions
Adjust multipliers:
```javascript
const railWidth = Math.max(2, tileSize * 0.15);  // Rail thickness
const railOffset = Math.max(3, tileSize * 0.12); // Gap between parallel rails
```

## Integration with Bot

Remember to register the slash command in your bot's main file:
```javascript
const buildRailsCommand = require('./commands/debug/buildRails');
// Add to commands collection
client.commands.set(buildRailsCommand.data.name, buildRailsCommand);
```

## Future Enhancements

Potential additions:
- Minecart movement along rails
- Rail switches for path selection
- Powered rails for speed boosts
- Rail stations at key locations
- Resource cost for building rails
- Rail durability system
- Automated minecart transport

## Troubleshooting

### Rails Not Appearing
- Ensure tiles have `hasRail: true` property
- Check that tiles are discovered or visible
- Verify map data is being saved to database

### Pathfinding Fails
- Confirm start/end positions are floor tiles
- Check for continuous floor path between points
- Verify map bounds are correct

### Visual Issues
- Rails only render on discovered tiles
- Ensure drawRails() is called after drawTile()
- Check tile size calculations
# Mining System - Modular Structure

The mining system has been refactored into smaller, more manageable modules for easier editing and maintenance.

## File Structure

### Core Files
- `mining_optimized_v3.js` - Main mining event handler (refactored from mining_optimized_v2.js)
- `generateMiningProcedural.js` - Enhanced map image generation with tent support

### Mining Modules (`./mining/`)

#### `miningConstants.js`
- All constants and configuration
- Tile types, item pools, map dimensions
- Easy to modify game balance

#### `miningUtils.js`
- Utility functions for mining operations
- RNG system, visibility calculations, item selection
- Pathfinding and movement logic

#### `miningDatabase.js`
- All database operations
- Atomic transactions, minecart management
- Mining summary generation

#### `miningMap.js`
- Map generation and management
- Tile generation, map expansion
- Player positioning logic

#### `miningEvents.js`
- **NEW**: Long break special events system
- Thief game, cave-in, treasure rush
- Break positioning with tent scattering

## Key Features Implemented

### ✅ 1. Player Displays as Tents During Breaks
- Players automatically switch to tent graphics during break periods
- Individual tents for single players
- Camp arrangements for multiple players on same tile
- Tent colors match player's Discord role colors

### ✅ 2. Scattered Tent Positioning
- Players scatter around entrance during breaks (not all on entrance tile)
- Density controlled to ~3-4 players per "zone"
- Scatter radius increases with player count
- Prevents overcrowding while maintaining camp feel

### ✅ 3. Modular Code Structure
- Easy to edit individual components
- Clear separation of concerns
- Reusable utility functions
- Better error handling and debugging

### ✅ 4. Enhanced Event System
- **Thief Game**: Players vote to catch the thief who stole coins
- **Cave-in Event**: Cooperative debris clearing
- **Treasure Rush**: First player finds hidden treasure
- Events trigger every 4th break (long breaks)
- Full event management with automatic cleanup

## How Break Positioning Works

### Normal Mining
```javascript
// All players at entrance
playerPositions[playerId] = {
    x: entranceX,
    y: entranceY
}
```

### During Breaks
```javascript
// Scattered as tents around entrance
playerPositions[playerId] = {
    x: scatteredX,
    y: scatteredY,
    isTent: true  // Triggers tent rendering
}
```

### Density Control
- Base radius: 2 tiles
- Max radius: `√(playerCount/3) + 2`
- Systematic fallback for crowded areas
- Prevents overlapping tent positions

## Usage in generateMiningProcedural.js

The image generator now:
1. Checks if it's a break period: `isBreakPeriod(dbEntry)`
2. Detects tent positions: `position.isTent`
3. Renders tents instead of avatars during breaks
4. Handles both individual tents and camps

## Event System API

### Starting Events
```javascript
const selectedEvent = pickLongBreakEvent();
const eventResult = await selectedEvent(channel, dbEntry);
```

### Event Functions
- `startThiefGame(channel, dbEntry)` - Voting-based thief catching
- `startCaveInEvent(channel, dbEntry)` - Cooperative mining challenge
- `startTreasureRushEvent(channel, dbEntry)` - Random treasure discovery

### Event Management
- `checkAndEndSpecialEvent()` - Automatic event cleanup
- `setSpecialEvent()` / `clearSpecialEvent()` - Event state management
- Built-in timer and reward systems

## Migration from mining_optimized_v2.js

To use the new system:
1. Replace imports in your voice channel handler
2. Point to `mining_optimized_v3.js` instead of `mining_optimized_v2.js`
3. No database changes required - fully backward compatible
4. All existing functionality preserved and enhanced

## Configuration

### Tent Display
- Modify tent colors in `drawTent()` function
- Adjust tent size scaling in `generateMiningProcedural.js`
- Control scatter density in `miningEvents.js`

### Event Weights
```javascript
const longBreakEvents = [
    { func: startThiefGame, weight: 40, name: 'Thief Game' },
    { func: startCaveInEvent, weight: 30, name: 'Cave-in' },
    { func: startTreasureRushEvent, weight: 30, name: 'Treasure Rush' }
];
```

### Break Timing
- Regular breaks: Every 25 minutes
- Long breaks: Every 4th break (2 hours)
- Special events: 10 minutes + 5 minute shop
- Regular breaks: 5 minute shop

## Testing

The modular structure makes testing individual components easy:

```javascript
// Test item selection
const { pickWeightedItem } = require('./mining/miningUtils');
const item = pickWeightedItem(3, TILE_TYPES.RARE_ORE);

// Test tent positioning
const { scatterPlayersForBreak } = require('./mining/miningEvents');
const positions = scatterPlayersForBreak(playerPositions, entranceX, entranceY, playerCount);
```

Each module exports its functions for easy unit testing and debugging.

# Mining Hazard System Documentation

## Overview
The mining hazard system dynamically generates and manages hazards for each mining voice channel roll. Hazards are determined based on the power level of the mining location with added randomness for variety.

## Components

### 1. Hazard Roller (`hazardRoller.js`)
- **Purpose**: Generates hazard data when a mining VC is rolled
- **Key Functions**:
  - `generateHazardData(basePowerLevel, seed)`: Main function to generate complete hazard data
  - `calculateHazardLevel(basePowerLevel, seed)`: Determines hazard level with variance
  - `rollHazards(hazardLevel, seed)`: Rolls specific hazards based on level
  - `formatHazardAnnouncement(hazardData, locationName)`: Creates chat announcement

### 2. Hazard Data Helper (`hazardDataHelper.js`)
- **Purpose**: Retrieve and manage hazard data during gameplay
- **Key Functions**:
  - `getHazardDataForChannel(channelId)`: Get hazard data for a VC
  - `shouldSpawnHazard(hazardData, hazardType)`: Check if hazard should spawn
  - `updateHazardDataForChannel(channelId, hazardData)`: Update hazard data

### 3. Map Integration (`hazardMapIntegration.js`)
- **Purpose**: Example implementation for map generation
- **Key Functions**:
  - `placeHazardsOnMap(map, channelId)`: Place hazards on the mining map
  - `triggerHazard(player, hazard, gameState)`: Handle hazard effects
  - `getHazardWarnings(channelId)`: Get warning messages

## How It Works

### When a Mining VC is Rolled:
1. System determines base power level from VC config (1-7)
2. Calculates actual hazard level with variance:
   - 15% chance: -1 level (safer)
   - 55% chance: same level
   - 25% chance: +1 level (more dangerous)
   - 5% chance: +2 levels (extreme danger)
3. Rolls for specific hazards based on level
4. Stores data in `activeVcs.gameData.hazardData`
5. Announces hazards in chat

### Hazard Types:
- **Portal Trap** (Level 1+): Teleports to random location
- **Bomb Trap** (Level 2+): Explodes walls, knocks out player
- **Toxic Fog** (Level 3+): Damages equipment durability
- **Wall Trap** (Level 4+): Converts floors to walls

### Data Structure:
```javascript
gameData: {
    hazardData: {
        hazardLevel: 3,           // 1-7
        levelInfo: {
            name: "Moderate",
            color: "#FFD700",
            emoji: "🟠"
        },
        hazards: [
            {
                type: "portal_trap",
                name: "Portal Trap",
                symbol: "⊕",
                color: "#9932CC",
                description: "Teleports to random location",
                intensity: 1.4,    // Multiplier for effects
                count: 2           // Number on map
            }
        ],
        seed: 123456,
        generatedAt: Date
    },
    miningMode: true,
    powerLevel: 3
}
```

## Integration Guide

### In Your Mining Script:

```javascript
const { getHazardDataForChannel } = require('./hazardDataHelper');
const { placeHazardsOnMap, triggerHazard } = require('./hazardMapIntegration');

// When generating the map
async function generateMiningMap(channelId) {
    // Your existing map generation code
    let map = createBaseMap();
    
    // Add hazards based on rolled data
    map = await placeHazardsOnMap(map, channelId);
    
    return map;
}

// When player steps on a tile
async function handlePlayerMove(player, x, y, channelId) {
    const tile = map[y][x];
    
    if (tile.hazard) {
        // Trigger the hazard
        gameState = await triggerHazard(player, tile.hazard, gameState);
        
        // Remove the hazard after triggering (optional)
        delete tile.hazard;
    }
}

// To display hazard warnings
async function showMapInfo(channel) {
    const hazardWarning = await getHazardWarnings(channel.id);
    await channel.send(hazardWarning);
}
```

## Customization

### Adjusting Hazard Frequency:
Modify spawn chances in `hazardRoller.js`:
```javascript
const baseRolls = Math.floor(hazardLevel / 2) + 1; // Adjust formula
```

### Adding New Hazard Types:
1. Add to `ENCOUNTER_TYPES` in `miningConstants.js`
2. Add configuration to `ENCOUNTER_CONFIG`
3. Add to appropriate power levels in `ENCOUNTER_SPAWN_CONFIG`
4. Implement effect in `triggerHazard()` function

### Modifying Variance:
Adjust percentages in `calculateHazardLevel()`:
```javascript
if (roll < 0.15) {        // 15% chance for -1 level
    variance = -1;
} else if (roll < 0.70) { // 55% chance for same level
    variance = 0;
// etc...
```

## Testing

Test hazard generation:
```javascript
const { generateHazardData } = require('./hazardRoller');

// Test different power levels
for (let power = 1; power <= 7; power++) {
    const data = generateHazardData(power);
    console.log(`Power ${power}: Level ${data.hazardLevel}, Hazards: ${data.hazards.length}`);
}
```

## Notes
- Hazard data persists for the lifetime of the VC
- Same seed produces consistent results (useful for debugging)
- Hazards are announced immediately after VC creation
- System automatically handles mining-type VCs only

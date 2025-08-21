# Unique/Legendary Item System Documentation

## Overview
The Unique Item System adds legendary items to your mining mini-game that only one player can own at any given time. These items provide powerful bonuses but require regular maintenance or they'll be lost.

## System Architecture

### Core Components

1. **MongoDB Schema** (`models/uniqueItems.js`)
   - Tracks ownership of unique items
   - Manages maintenance levels and requirements
   - Records activity tracking for maintenance
   - Stores item history and statistics

2. **Static Item Data** (`data/uniqueItemsSheet.js`)
   - Defines all unique items and their properties
   - Contains abilities, special effects, and lore
   - Configures maintenance requirements
   - Sets drop rates and power level requirements

3. **Item Finding System** (`patterns/uniqueItemFinding.js`)
   - Handles RNG for finding items
   - Manages item assignment to players
   - Tracks unowned items available in the pool
   - Processes both unique and regular item drops

4. **Maintenance System** (`patterns/uniqueItemMaintenance.js`)
   - Global 24-hour maintenance clock
   - Different maintenance types (coins, activities)
   - Activity tracking for maintenance requirements
   - Automatic item loss on maintenance failure

5. **Mining Integration** (`patterns/gachaModes/mining/uniqueItemIntegration.js`)
   - Connects unique items to mining gameplay
   - Processes item finds during mining
   - Applies unique item bonuses
   - Tracks player activities

6. **Player Stats Integration** (`patterns/calculatePlayerStat.js`)
   - Includes unique items in stat calculations
   - Scales stats based on maintenance level
   - Overrides regular items in same slots

## Features

### Unique Item Properties
- **One Owner Rule**: Each unique item can only be owned by one player at a time
- **Powerful Abilities**: Significantly stronger than regular items
- **Special Effects**: Unique gameplay modifiers (double ore, hazard resistance, etc.)
- **Maintenance Requirements**: Must be maintained or will be lost
- **Scaling Power**: Item effectiveness scales with maintenance level

### Maintenance Types
1. **Coins**: Pay currency to maintain the item
2. **Mining Activity**: Mine a certain number of blocks
3. **Voice Activity**: Spend time in voice channels
4. **Combat Activity**: Win battles/duels
5. **Social Activity**: Interact with other players

### Drop System
- Items can be found while:
  - Mining ore walls
  - Opening treasure chests
  - Exploring the mines
  - Triggering certain hazards
- Drop rates scale with:
  - Server power level
  - Player luck stat
  - Activity type (treasure = 3x chance)
  - Biome bonuses

## Configuration

### Adding New Unique Items

Edit `data/uniqueItemsSheet.js`:

```javascript
{
    id: 9, // Unique numerical ID
    name: "Your Item Name",
    type: "tool", // tool, equipment, or charm
    slot: "mining", // Equipment slot
    rarity: "legendary",
    description: "Short description",
    lore: "Backstory and lore",
    value: 50000,
    vendable: false,
    
    abilities: [
        { name: "mining", powerlevel: 30 },
        { name: "luck", powerlevel: 50 }
    ],
    
    maintenanceType: "coins",
    maintenanceCost: 5000,
    maintenanceDecayRate: 1,
    requiresMaintenance: true,
    maintenanceDescription: "Why maintenance is needed",
    
    specialEffects: [
        "Special effect description 1",
        "Special effect description 2"
    ],
    
    dropWeight: 1, // Lower = rarer
    minPowerLevel: 3, // Minimum power level to find
    preferredBiomes: ["biome1", "biome2"],
    
    baseDurability: 500,
    durabilityLossReduction: 0.5
}
```

### Adjusting Drop Rates

Edit `patterns/gachaModes/mining/miningConstants.js`:

```javascript
const ITEM_FINDING_CONFIG = {
    baseItemFindChance: 0.01, // Base 1% chance
    uniqueItemWeight: 0.05, // 5% of finds are unique
    // ... other settings
};
```

## Integration Steps

### 1. Initialize the System

In your main bot file or mining game initialization:

```javascript
const { initializeUniqueItems } = require('./patterns/uniqueItemFinding');
const { maintenanceClock } = require('./patterns/uniqueItemMaintenance');

// On bot startup
await initializeUniqueItems();
maintenanceClock.start();
```

### 2. Add to Mining Actions

When a player mines or finds treasure:

```javascript
const { processUniqueItemFinding } = require('./mining/uniqueItemIntegration');

// After successful mining action
const itemFind = await processUniqueItemFinding(
    member,
    'mining', // or 'treasure', 'exploration', etc.
    powerLevel,
    luckStat,
    currentBiome // optional
);

if (itemFind) {
    // Handle the found item
    eventLogs.push(itemFind.message);
}
```

### 3. Track Activities

Update activity tracking for maintenance:

```javascript
const { updateMiningActivity, updateVoiceActivity } = require('./mining/uniqueItemIntegration');

// When player mines blocks
await updateMiningActivity(playerId, blocksMined);

// When player joins/leaves voice
await updateVoiceActivity(playerId, minutesInVoice);
```

### 4. Apply Bonuses

Get and apply unique item bonuses:

```javascript
const { getUniqueItemBonuses } = require('./mining/uniqueItemIntegration');

// Get bonuses from equipped unique items
const uniqueBonuses = getUniqueItemBonuses(playerData.equippedItems);

// Apply bonuses
if (uniqueBonuses.doubleOreChance > 0 && Math.random() < uniqueBonuses.doubleOreChance) {
    quantity *= 2;
}
```

## Discord Commands

The system includes slash commands for players:

- `/unique inventory` - View owned unique items
- `/unique status` - Check maintenance status
- `/unique maintain <item_id>` - Perform maintenance
- `/unique global` - View global statistics
- `/unique info <item_id>` - Get detailed item information

## Maintenance Clock

The global maintenance clock runs every 24 hours and:
1. Reduces maintenance level by the item's decay rate
2. Removes ownership if maintenance reaches 0
3. Returns items to the available pool
4. Logs all maintenance events

## Database Collections

The system creates these MongoDB collections:
- `uniqueitems` - Tracks ownership and maintenance
- Updates to existing `playerinventories` for regular items
- Updates to existing `money` for coin-based maintenance

## Example: Blue Breeze

The system includes one pre-configured unique item:
- **Name**: Blue Breeze
- **Type**: Legendary Pickaxe
- **Stats**: +30 Mining, +50 Luck, +10 Speed
- **Maintenance**: 5000 coins per day
- **Special Effects**: 
  - Chance for double ore
  - Hazard damage reduction
  - Increased movement speed

## Best Practices

1. **Balance Power**: Unique items should be powerful but not game-breaking
2. **Maintenance Costs**: Scale with item power level
3. **Drop Rates**: Keep very low (< 0.5%) to maintain rarity
4. **Activity Requirements**: Should be achievable but require effort
5. **Special Effects**: Should enhance gameplay without breaking mechanics

## Troubleshooting

### Items Not Dropping
- Check power level requirements
- Verify initialization with `initializeUniqueItems()`
- Check if items are already owned
- Verify drop rates in config

### Maintenance Not Working
- Ensure maintenance clock is running
- Check activity tracking is being updated
- Verify maintenance type handlers
- Check player has sufficient resources

### Stats Not Applying
- Verify `calculatePlayerStat.js` includes unique items
- Check maintenance level (scales effectiveness)
- Ensure items are properly assigned to player
- Check for slot conflicts with regular items

## Future Enhancements

Potential additions to the system:
- Item trading between players
- Unique item crafting/upgrading
- Seasonal unique items
- Guild-owned unique items
- Item set bonuses
- Visual effects in Discord embeds
- Auction house for unique items
- Maintenance insurance system

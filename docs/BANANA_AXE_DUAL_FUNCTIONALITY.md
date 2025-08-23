# Banana Axe - Dual Tool/Consumable Item

## Overview
The Banana Axe (ID: 13) is a unique item that functions as both a **mining tool** and a **consumable item**. This creates interesting gameplay choices for players.

## Item Properties (from itemSheet.json)
```json
{
  "id": "13",
  "name": "Banana Axe",
  "type": "tool",              // Primary type: tool
  "slot": "mining",             // Can be equipped as mining tool
  "description": "A slippery axe made from a banana. Not very reliable.",
  "value": 15,
  "vendable": true,
  "abilities": [
    { "name": "mining", "powerlevel": 3 }  // Updated from 2 to 3
  ],
  "script": "consume",          // Can be consumed using /use
  "duration": 45,                // 45-minute buff when consumed
  "image": "banana_axe",
  "durability": 15              // Tool durability when used for mining
}
```

## How It Works

### 1. **Purchasing from Shop**
- When bought from a shop, the Banana Axe is treated as a **tool** (not immediately consumed)
- It gets added to the player's inventory like any other tool
- Players can equip it for mining with durability of 15 uses

### 2. **Using as a Tool**
- Can be equipped in the mining slot
- Provides Mining +3 power
- Has 15 durability for mining operations
- Works like any other pickaxe until durability runs out

### 3. **Using as a Consumable (/use command)**
- Players can choose to consume the Banana Axe using `/use`
- When consumed:
  - The tool is removed from inventory (1 quantity consumed)
  - Provides a **45-minute Mining +3 buff**
  - Shows special flavor text about eating the banana axe
  - The buff is tracked in the PlayerBuffs system
  - Cannot be recovered after consumption

## Strategic Considerations

Players must decide:
- **Keep it as a tool**: 15 uses of Mining +3 (permanent until durability depletes)
- **Consume it**: 45 minutes of Mining +3 buff (temporary but immediate)

## Technical Implementation

### Shop Handler Behavior
- Checks `item.type === 'consumable'` for immediate consumption
- Since Banana Axe is type "tool", it's added to inventory normally

### Consume Script Special Handling
```javascript
// Special check allows tools with consume script
if (item.type !== 'consumable' && item.id !== '13') {
    throw new Error('This item is not consumable!');
}
```

### Buff Application
- When consumed, uses the item's duration field (45 minutes)
- Duration is in minutes (matching the buff system)
- Applies buff through the existing `applyConsumeableBuff` system
- Buff effects are stored in PlayerBuffs collection
- Buffs refresh (don't stack) if consumed again while active

## Adding More Dual-Function Items

To create similar items:

1. **Set primary type** (tool, equipment, etc.) - determines shop behavior
2. **Add script field** - enables /use command functionality
3. **Update consume.js** - Add item ID to special cases or create new script
4. **Optional: Add duration** - For buff timing (or handle specially like Banana Axe)

## Example Use Cases

### Mining Session
```
Player buys Banana Axe → Equips for mining → Uses 10/15 durability → 
Encounters rare vein → Consumes axe for buff → Mines with +2 bonus for 2 minutes
```

### Emergency Boost
```
Player has Banana Axe equipped → Joins mining competition → 
Immediately consumes for temporary advantage → Sacrifices tool for 45-minute buff
```

## Future Enhancements

Consider adding:
- More dual-function items (Bread Hammer: tool/food)
- Partial consumption (eat half for 1-minute buff, keep degraded tool)
- Crafting recipes to combine tools with consumables
- Special achievements for consuming valuable tools

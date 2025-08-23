# Item Use System Documentation

## Overview
The Item Use System allows players to use consumable items, tools, and special items from their inventory through the `/use` command. Items with a `script` field in `itemSheet.json` can be used, triggering custom scripts for various effects.

## Components

### 1. `/use` Command (`commands/use.js`)
- Displays all usable items from the player's inventory
- Shows items in a paginated ephemeral embed (max 25 items per page)
- Includes item details: quantity, durability, abilities, duration
- Provides select menus for choosing items to use

### 2. Item Use Handler (`patterns/itemUseHandler.js`)
- Manages item usage interactions
- Loads and executes item scripts dynamically
- Provides context and helper functions to scripts
- Tracks performance statistics
- Handles errors gracefully

### 3. Item Use Scripts (`data/itemUseScripts/`)
Scripts that define what happens when specific items are used.

## How to Add a Usable Item

### Step 1: Add Item to itemSheet.json
```json
{
  "id": "unique_id",
  "name": "Item Name",
  "type": "consumable",
  "description": "Item description",
  "value": 100,
  "script": "scriptname",  // Required for usable items
  "duration": 60,          // Optional: effect duration in seconds
  "abilities": [            // Optional: item effects
    { "name": "mining", "powerlevel": 2 }
  ]
}
```

### Step 2: Create the Script
Create a file in `data/itemUseScripts/` named `scriptname.js`:

```javascript
// scriptname.js
module.exports = async function(context) {
    const { 
        interaction,      // Discord interaction
        member,          // Guild member
        channel,         // Channel where used
        guild,           // Guild object
        client,          // Discord client
        itemId,          // Item ID
        item,            // Item data from itemSheet
        ownedItem,       // Inventory item data
        userId,          // User ID
        user,            // Discord user
        consumeItem,     // Function to consume item
        sendEmbed,       // Function to send embed
        PlayerInventory, // Inventory model
        itemMap          // Map of all items
    } = context;

    // Your script logic here
    
    // Consume the item (removes from inventory)
    const remaining = await consumeItem(1);
    
    // Send success message
    await sendEmbed({
        title: 'Item Used!',
        description: `You used ${item.name}!`,
        color: 0x00FF00
    });
};
```

## Available Script Examples

### 1. **consume.js**
- For consumable items (food, drinks, potions)
- Applies temporary buffs/effects
- Shows effect duration and abilities

### 2. **repair.js**
- Repairs damaged tools
- Finds most damaged tool automatically
- Restores durability

### 3. **boost.js**
- Applies temporary stat boosts
- Tracks active boosts
- Sends expiration notifications
- Provides boost calculation utilities

### 4. **special.js**
- Handles unique item effects
- Examples: Mystery boxes, teleport scrolls, pet summons
- Can have item-specific behaviors

## Script Context Object

Every script receives a context object with:

| Property | Description |
|----------|-------------|
| `interaction` | The Discord interaction object |
| `member` | The guild member using the item |
| `channel` | The channel where the item is being used |
| `guild` | The guild object |
| `client` | The Discord client instance |
| `itemId` | The ID of the item being used |
| `item` | Complete item data from itemSheet.json |
| `ownedItem` | The item data from user's inventory |
| `userId` | The ID of the user |
| `user` | The Discord user object |
| `consumeItem(amount)` | Async function to consume items |
| `sendEmbed(embedData)` | Helper to send formatted embeds |
| `PlayerInventory` | Mongoose model for inventory |
| `itemMap` | Map of all items for quick lookup |

## Helper Functions

### consumeItem(amount)
Removes the specified amount of the item from the user's inventory.
```javascript
const remainingQuantity = await consumeItem(1);
```

### sendEmbed(embedData)
Sends a formatted embed message.
```javascript
await sendEmbed({
    title: 'Success!',
    description: 'Item used successfully',
    color: 0x00FF00,
    fields: [
        { name: 'Field', value: 'Value', inline: true }
    ],
    footer: { text: 'Footer text' }
});
```

## Error Handling

Scripts should throw errors for invalid conditions:
```javascript
if (!member.voice.channel) {
    throw new Error('You must be in a voice channel!');
}
```

The handler will catch and display errors to the user.

## Performance Monitoring

The ItemUseHandler tracks:
- Total uses
- Successful uses
- Failed uses
- Script errors

Access stats with:
```javascript
const stats = itemUseHandler.getStats();
```

## Integration with Bot

The ItemUseHandler is automatically initialized for each guild when the bot starts:

```javascript
// In index.js
const ItemUseHandler = require('./patterns/itemUseHandler');
const itemUseHandler = new ItemUseHandler(client, guild.id);
```

## Adding New Script Types

1. Create a new script file in `data/itemUseScripts/`
2. Add the script name to items in `itemSheet.json`
3. The handler will automatically load and execute the script

## Best Practices

1. **Always consume items** after successful use
2. **Validate conditions** before consuming items
3. **Provide clear feedback** to users
4. **Handle errors gracefully**
5. **Log important actions** for debugging
6. **Use transactions** for complex operations
7. **Cache scripts** for better performance

## Example Items with Scripts

### Energy Drink (Consumable)
```json
{
  "id": "42",
  "name": "Energy Drink",
  "type": "consumable",
  "script": "consume",
  "duration": 60,
  "abilities": [
    { "name": "speed", "powerlevel": 2 }
  ]
}
```

### Repair Kit (Tool)
```json
{
  "id": "repair_kit",
  "name": "Tool Repair Kit",
  "type": "consumable",
  "script": "repair",
  "value": 500
}
```

### Mystery Box (Special)
```json
{
  "id": "mystery_box",
  "name": "Mystery Box",
  "type": "special",
  "script": "special",
  "value": 1000
}
```

## Testing

1. Add a test item to `itemSheet.json` with a script
2. Give yourself the item using admin commands
3. Use `/use` command to test the script
4. Check console logs for errors
5. Verify inventory changes

## Troubleshooting

- **Script not found**: Ensure script filename matches the `script` field
- **Item not showing**: Verify item has `script` field in itemSheet.json
- **Script errors**: Check console logs and script syntax
- **Inventory not updating**: Ensure `consumeItem()` is called
- **Cache issues**: Clear script cache with `itemUseHandler.clearScriptCache()`

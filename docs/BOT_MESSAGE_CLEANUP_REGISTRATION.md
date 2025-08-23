# Bot Message Auto-Cleanup Registration

## Overview
All non-ephemeral bot messages are now registered with the `registerBotMessage` pattern for automatic cleanup. This helps keep channels clean by removing old bot messages after a specified time.

## How It Works

The `registerBotMessage` function accepts:
- `guildId` - The guild/server ID
- `channelId` - The channel ID where the message was sent
- `msgId` - The message ID to be cleaned up
- `expireMinutes` - Minutes until cleanup (default: 5)

## Files Updated

### 1. **Item Use Scripts** (`data/itemUseScripts/`)

#### consume.js
- Banana Axe flavor text message (5 min expiry)
- Banana Power buff activation message (5 min expiry)

#### special.js
- Pet dismissal notification (5 min expiry)
- Transformation end notification (5 min expiry)

#### boost.js
- Boost expiration notification (5 min expiry)
- Boost warning (10 seconds before expiry) (5 min expiry)

### 2. **Commands** (`commands/`)

#### leaderboard.js
- Main leaderboard embed with buttons (10 min expiry)

#### stats.js
- Player stats embed display (10 min expiry)

#### simpleInventory.js
- Inventory display embed (10 min expiry)

## Implementation Pattern

### For Regular Messages
```javascript
const msg = await channel.send({
    content: 'Message content',
    ephemeral: false
});
await registerBotMessage(guild.id, channel.id, msg.id, 5);
```

### For Interaction Replies
```javascript
const reply = await interaction.editReply({
    embeds: [embed],
    components: [row]
});
await registerBotMessage(interaction.guild.id, interaction.channel.id, reply.id, 10);
```

### For Delayed Messages (in setTimeout)
```javascript
setTimeout(async () => {
    try {
        const msg = await channel.send({
            content: 'Delayed message'
        });
        await registerBotMessage(guild.id, channel.id, msg.id, 5);
    } catch (error) {
        console.error(error);
    }
}, delay);
```

## Expiry Times Used

- **5 minutes**: Temporary notifications, buff messages, consumable effects
- **10 minutes**: Command outputs (leaderboard, stats, inventory)

## Benefits

1. **Automatic Cleanup**: Messages are automatically deleted after expiry
2. **Reduced Clutter**: Keeps channels clean from old bot messages
3. **Configurable**: Each message type can have different expiry times
4. **Error Handling**: Wrapped in try-catch blocks where needed

## Notes

- Ephemeral messages are NOT registered (they're already temporary)
- Error replies remain ephemeral and don't need registration
- The cleanup happens via the `botMessageCleaner` pattern that runs periodically
- Messages are stored in the `tidyMessages` collection in MongoDB

## Testing

To verify the system is working:
1. Use any of the updated commands
2. Check that messages appear
3. Wait for the expiry time
4. Confirm messages are automatically deleted

## Future Considerations

Consider adjusting expiry times based on:
- Message importance
- User activity patterns
- Channel type (busy vs quiet)
- Command frequency

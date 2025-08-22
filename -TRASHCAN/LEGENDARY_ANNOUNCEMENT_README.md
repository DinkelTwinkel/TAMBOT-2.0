# Legendary Item Announcement System - Documentation

## Overview
When a player finds a unique legendary item, the bot will now automatically announce it across ALL text channels in the Discord server, creating a dramatic server-wide celebration.

## Features Implemented

### 1. **Big Text Announcements**
- Uses Discord's markdown headers (`#`, `##`, `###`) for large, attention-grabbing text
- Customizable message templates
- Rich formatting with emojis and styling

### 2. **Server-Wide Broadcasting**
- Sends announcement to ALL text channels in the guild
- Smart channel filtering (skip admin/log channels)
- Permission checking to avoid errors
- Rate limit protection with delays

### 3. **Visual Effects**
- Automatic reaction adding (🎉 🌟 💎 🏆 ✨ 🔥)
- Optional rich embeds with gold color theme
- Message pinning for ultra-rare items

### 4. **Performance Optimizations**
- Sequential or parallel batch sending
- Configurable delays to prevent rate limiting
- Error handling and recovery
- Channel filtering to reduce spam

## Files Modified/Created

### Modified Files:
1. **`patterns/uniqueItemFinding.js`**
   - Added `systemAnnouncement` object to legendary item results
   - Included big text formatting in announcement messages
   - New functions: `sendLegendaryAnnouncement()` and `sendLegendaryAnnouncementWithEmbed()`

### New Files Created:
1. **`config/legendaryAnnouncementConfig.js`**
   - Central configuration for all announcement settings
   - Channel filtering rules
   - Message templates
   - Visual settings

2. **`patterns/optimizedLegendaryAnnouncement.js`**
   - Advanced announcement system with configuration support
   - Batch sending capabilities
   - Performance optimizations

3. **`patterns/legendaryImplementationExample.js`**
   - Complete examples for mining and gacha commands
   - Shows how to integrate the announcement system

4. **`patterns/legendaryIntegrationExample.js`**
   - Basic integration examples
   - Helper functions

## How to Use

### Basic Implementation:
```javascript
const { rollForItemFind, sendLegendaryAnnouncement } = require('./patterns/uniqueItemFinding');

// In your command handler:
const itemResult = await rollForItemFind(
    player.id,
    player.tag,
    powerLevel,
    luckStat,
    'mining',
    biome,
    interaction.guildId
);

if (itemResult && itemResult.type === 'unique') {
    // Send to all channels
    await sendLegendaryAnnouncement(
        client,  // Discord client
        interaction.guildId,
        itemResult,
        player.tag
    );
}
```

### Advanced Implementation with Config:
```javascript
const { sendOptimizedLegendaryAnnouncement } = require('./patterns/optimizedLegendaryAnnouncement');

// Use the optimized version with configuration
const results = await sendOptimizedLegendaryAnnouncement(
    client,
    interaction.guildId,
    itemResult,
    player.tag
);

console.log(`Announced to ${results.channelsSent} channels`);
```

## Configuration Options

Edit `config/legendaryAnnouncementConfig.js` to customize:

- **Channel Filters**: Skip specific channels (logs, admin, etc.)
- **Send Delay**: Milliseconds between channel sends (default: 100ms)
- **Max Channels**: Limit number of channels (0 = unlimited)
- **Reactions**: Which emojis to add and how many messages to react to
- **Message Templates**: Customize announcement text
- **Ultra-Rare Settings**: Special effects for the rarest items

## Message Format

The default announcement format:
```
# 🌟 LEGENDARY DISCOVERY! 🌟
## PlayerName has found the legendary **Item Name**!
### Item description here
*This item is one-of-a-kind and now belongs to PlayerName!*
```

## Performance Considerations

- **Rate Limits**: The system includes delays to avoid Discord rate limits
- **Channel Count**: For servers with many channels, consider using the optimized version
- **Reactions**: Limited to first 5 messages to avoid rate limits
- **Error Handling**: Continues even if some channels fail

## Testing

To test the system:
1. Trigger a legendary item find through mining/gacha
2. Check that announcements appear in all text channels
3. Verify reactions are added
4. Monitor console for any errors

## Troubleshooting

**Issue**: Announcements not sending
- Check bot has VIEW_CHANNEL and SEND_MESSAGES permissions
- Verify the item has `systemAnnouncement.enabled = true`

**Issue**: Rate limit errors
- Increase `sendDelay` in config (try 200-300ms)
- Reduce `maxReactionMessages`
- Use batch sending with smaller batch sizes

**Issue**: Too much spam
- Configure `skipChannelNames` to exclude more channels
- Set `maxChannels` to limit total announcements
- Use the compact message template

## Future Enhancements

Possible additions:
- Database logging of legendary finds
- Webhook support for external notifications
- Discord thread creation for discussion
- Temporary server-wide buffs when legendary found
- Leaderboard of legendary finders
- Custom announcements per item rarity tier

## Support

For issues or questions:
1. Check console logs for error messages
2. Verify configuration settings
3. Ensure bot permissions are correct
4. Test with a single channel first before server-wide

The legendary announcement system is now ready to create epic moments when players discover unique items!

# Mining Reset Utilities

Complete set of tools to reset and manage mining channel data in TAMBOT 2.0.

## Available Tools

### 1. Discord Slash Command (`/resetmining`)
**File:** `commands/resetmining.js`

Admin-only slash command to reset a mining channel through Discord.

**Usage:**
```
/resetmining channel:#voice-channel confirm:true
```

**Features:**
- Requires Administrator permissions
- Shows detailed reset log
- Displays previous data before deletion
- Safe with confirmation requirement

---

### 2. Direct Reset Script
**File:** `patterns/resetMiningData.js`

Core reset functionality that can be run from command line.

**Usage:**
```bash
node patterns/resetMiningData.js <channelId>
```

**Example:**
```bash
node patterns/resetMiningData.js 1234567890123456789
```

**What it clears:**
- Active instances and locks
- Map cache data
- Hazard data
- Rail system data
- Global caches (dbCache, efficiencyCache)
- Database entry
- Shadow clone data
- Health metrics

---

### 3. Quick Reset Utility
**File:** `patterns/quickResetMining.js`

Faster reset with shortcuts for frequently used channels.

**Setup:**
Edit the file to add your common channel IDs:
```javascript
const COMMON_CHANNELS = {
    'test': '1234567890123456789',  // Your test channel
    'main': '9876543210987654321',  // Your main channel
};
```

**Usage:**
```bash
# Using channel ID
node patterns/quickResetMining.js 1234567890123456789

# Using shortcut
node patterns/quickResetMining.js test
```

---

### 4. Batch Reset Utility
**File:** `patterns/batchResetMining.js`

Reset multiple channels at once with various filters.

**Usage:**
```bash
# Reset ALL mining channels
node patterns/batchResetMining.js --all

# Reset only stuck channels
node patterns/batchResetMining.js --stuck

# Reset channels currently in break
node patterns/batchResetMining.js --in-break

# Dry run (preview without resetting)
node patterns/batchResetMining.js --all --dry-run

# Reset specific channels
node patterns/batchResetMining.js 123456789 987654321
```

---

## What Gets Reset

When you reset a mining channel, the following data is cleared:

### 1. **Instance & Lock Data**
- Active process instances
- Concurrency locks
- Running intervals

### 2. **Cache Data**
- Map cache (mapCacheSystem)
- Database cache (dbCache)
- Efficiency cache
- Visibility calculator cache

### 3. **Game Data**
- Entire map and tile data
- Player positions
- Break information
- Cycle count
- Minecart contents

### 4. **System Data**
- Hazard locations
- Rail network
- Shadow clone data
- Health metrics

### 5. **Database Entry**
- Complete removal from gachaVC collection
- Next trigger times
- Shop refresh times

---

## When to Use Reset

### Recommended Use Cases:
✅ **Channel is stuck in break** - Break timer expired but still showing as in break
✅ **Map corruption** - Players can't move or map doesn't render
✅ **Testing/Development** - Need a clean slate for testing
✅ **Major bugs** - Game is unplayable due to corrupted data
✅ **Server migration** - Moving to new server/shard

### NOT Recommended:
❌ **Players want to restart** - They'll lose all progress
❌ **Minor bugs** - Try specific fixes first
❌ **Active mining session** - Will kick all players

---

## Safety Features

1. **Confirmation Required** - Discord command requires explicit confirmation
2. **Backup Info Displayed** - Shows current data before deletion
3. **Admin Only** - Discord command restricted to administrators
4. **Countdown Timer** - Batch operations have cancel window
5. **Detailed Logging** - All operations logged for debugging

---

## Troubleshooting

### Reset failed with "Instance locked"
Another process is using the channel. Wait a moment and try again.

### "No entry to delete"
Channel has no mining data. This is normal for unused channels.

### Warnings during reset
Non-critical warnings are normal. The reset will still complete.

### Players still see old data
Players may need to:
1. Leave and rejoin the voice channel
2. Wait for next update cycle (usually within 1 minute)
3. Use `/miningfix` command if available

---

## Emergency Reset

If normal reset fails, use this nuclear option:

```javascript
// In MongoDB shell or Compass
db.gachavcs.deleteOne({ channelId: "CHANNEL_ID_HERE" })
```

Then restart the bot to clear all caches.

---

## Development Notes

### Adding New Reset Steps

To add new systems to the reset process, edit `resetMiningData.js`:

```javascript
// Add your reset step
console.log('\n🔧 Clearing new system...');
try {
    await yourSystem.clear(channelId);
    results.success.push('New system cleared');
    console.log('   ✅ Done');
} catch (error) {
    results.warnings.push(`New system: ${error.message}`);
    console.log('   ⚠️ Warning:', error.message);
}
```

### Testing Resets

Always test resets on a development channel first:
```bash
node patterns/quickResetMining.js test --dry-run
```

---

## Support

For issues or questions about the reset utilities:
1. Check the console logs for detailed error messages
2. Verify MongoDB connection is working
3. Ensure you have proper permissions
4. Check that the channel ID is correct

Remember: **Resets are permanent!** Always backup important data before resetting production channels.

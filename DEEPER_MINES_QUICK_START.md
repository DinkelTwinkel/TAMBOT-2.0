# Deeper Mines Feature - Quick Start Guide

## What This Feature Does
Allows players to unlock "deeper" versions of mines after meeting certain conditions (breaking walls, finding ores, etc.). Deeper mines have higher power levels, better resources, and increased rewards.

## Installation in 5 Steps

### Step 1: Backup Your Files
```bash
# Make copies of these files before starting:
cp data/gachaServers.json data/gachaServers.backup.json
cp patterns/gachaModes/mining_optimized_v5_performance.js patterns/gachaModes/mining_optimized_v5_performance.backup.js
```

### Step 2: Add New Files
✅ **Already Done** - The following files have been created:
- `data/gachaServers.json` - Updated with deeper mine entries
- `patterns/mining/deeperMineChecker.js` - Condition checking module
- `patterns/digDeeperListener.js` - Button interaction handler

### Step 3: Modify Mining Script
Open `patterns/gachaModes/mining_optimized_v5_performance.js` and:

1. **Add import at the top** (around line 10-20):
```javascript
const deeperMineChecker = require('./mining/deeperMineChecker');
```

2. **Find the `logEvent` function** and look for this section:
```javascript
if (logEntry || shouldGenerateImage) {
    // ... embed creation code ...
```

Add this code after the embed is created but before it's sent:
```javascript
// Check for deeper mine conditions and add button
let components = [];
if (forceNew && !result.gameData?.breakInfo?.inBreak) {
    const deeperResult = await deeperMineChecker.checkAndAddDeeperMineButton(
        embed, 
        result, 
        channel.id
    );
    if (deeperResult.components && deeperResult.components.length > 0) {
        components = deeperResult.components;
    }
}
```

Then update all `channel.send()` calls to include components:
```javascript
await channel.send({ 
    embeds: [embed], 
    files: attachment ? [attachment] : [],
    components: components // Add this line
});
```

3. **Add stat tracking** - Find where walls are broken (search for `wallsBroken++`):
```javascript
wallsBroken++;
// Add this line:
deeperMineChecker.updateMiningStats(dbEntry, 'wallsBroken', 1);
```

4. **Track ore collection** - Find `mineFromTile` calls and add after:
```javascript
// Add these lines after mining an item:
deeperMineChecker.updateMiningStats(dbEntry, 'oresFound', quantity);
deeperMineChecker.updateMiningStats(dbEntry, 'totalValue', item.value * quantity);

// Track rare ores
if (item.tier === 'rare') {
    deeperMineChecker.updateMiningStats(dbEntry, 'rareOre', quantity);
} else if (item.tier === 'epic') {
    deeperMineChecker.updateMiningStats(dbEntry, 'epicOre', quantity);
} else if (item.tier === 'legendary' || item.tier === 'unique' || item.tier === 'mythic') {
    deeperMineChecker.updateMiningStats(dbEntry, 'legendaryOre', quantity);
}
```

5. **Track treasures** - Find `generateTreasure` calls and add:
```javascript
if (treasure) {
    deeperMineChecker.updateMiningStats(dbEntry, 'treasuresFound', 1);
    deeperMineChecker.updateMiningStats(dbEntry, 'totalValue', treasure.value);
    // ... rest of treasure code
}
```

6. **Initialize stats** - Find where game data is initialized:
```javascript
if (!dbEntry.gameData) {
    initializeGameData(dbEntry, channel.id);
    // Add this line:
    deeperMineChecker.initializeMiningStats(dbEntry);
    await dbEntry.save();
}
```

### Step 4: Update Your Bot's Main File
In your main bot file (e.g., `index.js` or `bot.js`):

```javascript
// Add this import at the top
const DigDeeperListener = require('./patterns/digDeeperListener');

// In your client.on('ready') event:
client.on('ready', () => {
    console.log(`${client.user.tag} is online!`);
    
    // Add this:
    const digDeeperListener = new DigDeeperListener(client);
    console.log('[DIG_DEEPER] Listener initialized and ready');
    client.digDeeperListener = digDeeperListener;
});
```

### Step 5: Restart Your Bot
```bash
# Stop your bot if running
# Start it again
node your-bot-file.js
```

## How It Works

### For Players:
1. Join a mining voice channel (e.g., Coal Mines)
2. Mine normally - walls broken, ores found, etc. are tracked
3. Check progress on the mining embed ("Deeper Level Progress")
4. When 100%, a green "Dig Deeper" button appears
5. Click the button while in the voice channel
6. Everyone is moved to the deeper mine with better rewards!

### Conditions by Mine Type:
- **Coal/Copper Mines**: Break 500 walls
- **Topaz/Iron**: Find 1000 ores
- **Diamond**: Find 50 treasures
- **Crystal**: Find 75 treasures
- **Emerald**: Break 750 walls
- **Ruby**: Mine 10,000 coins worth
- **Obsidian**: Break 1000 walls
- **Mythril**: Find 100 rare+ ores
- **Adamantite**: Break 1500 walls → Abyssal Depths
- **Fossil**: Find 50 fossils

## Quick Test
1. Join Coal Mines voice channel
2. Use admin command to set stats (if you have one)
3. Or wait for natural progression
4. Watch for the progress bar in the mining embed
5. Click "Dig Deeper" when available
6. Verify you're moved to "Coal Mines [ DEEPER ]"

## Troubleshooting Quick Fixes

**Button not appearing?**
- Check if mine has `deeperMineId` in gachaServers.json
- Verify you're not already in a deeper mine
- Make sure it's not during a break period

**Stats not tracking?**
- Verify the mining script modifications were applied
- Check that `deeperMineChecker.updateMiningStats()` is being called
- Look for errors in console

**Can't click button?**
- Must be in the same voice channel
- Can't click from outside the VC

**Bot crashes?**
- Check console for error messages
- Verify all files are in place
- Check Discord.js permissions

## Console Commands You'll See
```
[DIG_DEEPER] Listener initialized and ready
[DEEPER_MINE] Checking conditions for channel...
[DIG_DEEPER] Successfully created deeper mine...
[MINING] Mining statistics updated...
```

## Adjusting Difficulty
Edit `conditionCost` in `data/gachaServers.json`:
```json
{
    "id": "1",
    "name": "⛏️ Coal Mines",
    "conditionCost": 500,  // Change this number
}
```
- Lower = Easier to unlock
- Higher = Harder to unlock

## Files Created/Modified Summary
- ✅ `data/gachaServers.json` - Updated
- ✅ `patterns/mining/deeperMineChecker.js` - Created
- ✅ `patterns/digDeeperListener.js` - Created
- ⚠️ `patterns/gachaModes/mining_optimized_v5_performance.js` - Needs manual modification
- ⚠️ Your main bot file - Needs initialization code added

## Need Help?
1. Check `DEEPER_MINES_TROUBLESHOOTING.md` for detailed solutions
2. Review `DEEPER_MINES_TEST_CHECKLIST.md` for testing steps
3. Look at `patterns/mining/miningModifications.js` for example code

## Success Indicators
✅ Progress bar shows in mining embed
✅ "Dig Deeper" button appears at 100%
✅ Clicking button creates new channel
✅ Players are moved automatically
✅ Old channel is deleted
✅ New mine has "[ DEEPER ]" in name
✅ Better resources in deeper mine

That's it! The feature should now be working. Mine away and dig deeper! ⛏️💎
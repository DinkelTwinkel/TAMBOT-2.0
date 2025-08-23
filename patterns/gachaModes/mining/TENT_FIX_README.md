# Tent Display Fix Integration Guide

## Problem
Players are still being rendered as tents after the break period ends in the mining game mode. The `isTent` flag in player positions is not being properly cleared when transitioning from break to mining.

## Solution Files Created

1. **fix_tent_display.js** - Core fix functions
2. **patch_mining_tent_fix.js** - Enhanced endBreak function
3. **immediate_tent_hotfix.js** - Immediate cleanup script

## How to Apply the Fix

### Step 1: Immediate Fix (for currently stuck channels)
Run this command to immediately fix any channels with stuck tent displays:
```bash
node patterns/gachaModes/mining/immediate_tent_hotfix.js
```

Or call from your bot code:
```javascript
const { fixSpecificChannel } = require('./patterns/gachaModes/mining/immediate_tent_hotfix');
// Fix a specific channel
await fixSpecificChannel('YOUR_CHANNEL_ID');
```

### Step 2: Apply Permanent Fix

1. Open `mining_optimized_v5_performance.js`

2. Add this import at the top (around line 15 with other imports):
```javascript
const { clearTentFlags, verifyAndFixPlayerPositions } = require('./mining/fix_tent_display');
```

3. Replace the existing `endBreak` function (around line 2200) with the enhanced version from `patch_mining_tent_fix.js`

4. In the main module.exports function, add this check after the CRITICAL HOTFIX section (around line 2752):
```javascript
// Fix any stale tent flags if not in break
if (!isBreakPeriod(dbEntry)) {
    const fixed = await verifyAndFixPlayerPositions(channelId, mapCacheSystem, gachaVC);
    if (fixed) {
        console.log(`[MINING] Fixed stale tent flags for channel ${channelId}`);
        dbEntry = await getCachedDBEntry(channelId, true);
    }
}
```

### Step 3: Update scatterPlayersForBreak (Optional Enhancement)

If you want to improve the scatter function as well, replace the existing `scatterPlayersForBreak` function in `miningEvents.js` with the fixed version from `fix_tent_display.js`:

```javascript
const { scatterPlayersForBreakFixed } = require('./fix_tent_display');
// Use scatterPlayersForBreakFixed instead of scatterPlayersForBreak
```

## What the Fix Does

1. **clearTentFlags()** - Ensures all player positions have `isTent: false` when not in a break
2. **verifyAndFixPlayerPositions()** - Checks and fixes any stale tent flags in both cache and database
3. **Enhanced endBreak()** - Properly clears tent flags when ending breaks and ensures cache consistency
4. **immediate_tent_hotfix** - Provides immediate cleanup for stuck channels

## Testing

After applying the fix:
1. Start a mining session
2. Wait for a short break to occur (players should show as tents)
3. Wait for the break to end
4. Verify players are now shown as avatars, not tents
5. Check logs for `[TENT FIX]` or `[MINING] Fixed stale tent flags` messages

## Key Changes

- Ensures `isTent: false` is explicitly set when break ends
- Clears cache before database updates to prevent stale data
- Forces cache flush after updating positions
- Adds verification step to catch any missed tent flags
- Provides emergency cleanup for edge cases

## Monitoring

Look for these log messages to confirm the fix is working:
- `[MINING] Successfully updated database with cleaned positions`
- `[TENT FIX] Cleared tent flags for X players`
- `[MINING] Fixed stale tent flags for channel`
- `[MINING] Break ended successfully - tent flags cleared`

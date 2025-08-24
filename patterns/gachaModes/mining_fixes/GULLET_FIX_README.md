# ???'s Gullet Meat Items Fix

## The Problem
???'s Gullet (mine ID: 16) is supposed to drop special meat items (IDs 200-219) instead of regular ores, but it's currently dropping regular ores like Coal and Topaz.

## The Cause
The meat items ARE properly defined in:
- `itemSheet.json` - Has all 20 meat items (IDs 200-219)
- `miningConstants_unified.js` - Has the GULLET_ITEM_POOL with logic to use meat for gullet

**BUT** the main mining script (`mining_optimized_v5_performance.js`) is NOT passing the mine type ID to the item generation functions, so they don't know when to use meat items.

## The Solution

### Automatic Fix (Recommended)
Run this command in the `mining_fixes` directory:
```bash
node APPLY_GULLET_FIX.js
```

This will automatically patch `mining_optimized_v5_performance.js` with the necessary changes.

### Manual Fix
If the automatic fix doesn't work, manually edit `mining_optimized_v5_performance.js`:

1. **Add these lines after** `const serverPowerLevel = json?.power || 1;` (around line 1700):
```javascript
// Get mine type ID for special mine handling (e.g., gullet meat items)
const mineTypeId = dbEntry.typeId;

// Check if this is a deeper mine
const { isDeeperMine: checkDeeperMine } = require('./mining/miningConstants_unified');
const isDeeperMine = checkDeeperMine ? checkDeeperMine(mineTypeId) : false;

// Debug logging for special mines
if (mineTypeId === 16 || mineTypeId === '16') {
    console.log('[MINING] ???\'s Gullet detected - will generate meat items instead of ores');
}
```

2. **Update ALL calls to `mineFromTile`** to include the new parameters:
```javascript
// OLD:
const result = await mineFromTile(
    member,
    playerData?.stats?.mining || 0,
    playerData?.stats?.luck || 0,
    serverPowerLevel,
    tile.type,
    availableItems,
    efficiency
);

// NEW:
const result = await mineFromTile(
    member,
    playerData?.stats?.mining || 0,
    playerData?.stats?.luck || 0,
    serverPowerLevel,
    tile.type,
    availableItems,
    efficiency,
    isDeeperMine,      // ADD THIS
    mineTypeId         // ADD THIS
);
```

3. **Update ALL calls to `generateTreasure`**:
```javascript
// OLD:
const treasure = await generateTreasure(serverPowerLevel, efficiency);

// NEW:
const treasure = await generateTreasure(serverPowerLevel, efficiency, isDeeperMine, mineTypeId);
```

## Verification
After applying the fix and restarting your bot:

1. Run the verification script:
```bash
node verify_gullet_items.js
```

2. Join a ???'s Gullet voice channel and check the console for:
```
[MINING] ???'s Gullet detected - will generate meat items instead of ores
```

3. You should now get meat items like:
   - Gullet Flesh Scrap (common)
   - Sinew Strand (common)
   - Bile-Soaked Meat (uncommon)
   - Muscle Fiber Bundle (uncommon)
   - Marbled Organ Meat (rare)
   - Prime Stomach Lining (epic)
   - Heart of the Gullet (legendary - value: 5000!)
   - ...and 13 more meat items!

## Files Modified
- `mining_optimized_v5_performance.js` - Main mining script that needs the fix

## Files Already Correct
- `itemSheet.json` - Has all meat items defined (IDs 200-219) ✅
- `miningConstants_unified.js` - Has GULLET_ITEM_POOL and logic ✅
- `gachaServers.json` - Has ???'s Gullet defined (ID: 16) ✅

## Support
If you still have issues after applying this fix:
1. Make sure you restarted the bot
2. Check that the channel's `dbEntry.typeId` is set to 16
3. Verify the meat items exist in your itemSheet.json
4. Check console logs for any error messages

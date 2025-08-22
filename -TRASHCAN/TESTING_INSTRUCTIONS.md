# Unique Item Testing Setup Instructions

## Files Created:
1. `commands/debug_unique_roll.js` - Discord command for testing rolls
2. `test_unique_drops.js` - Standalone test script
3. `patterns/testing_config.js` - Testing configuration overrides

## How to Use:

### Method 1: Discord Debug Command
1. Edit `commands/debug_unique_roll.js` and replace `'YOUR_DISCORD_ID'` with your actual Discord user ID
2. Register the command with your bot
3. Use in Discord:
   ```
   !debugroll [power_level] [luck] [rolls] [options]
   
   Examples:
   !debugroll 5 50 10              # Roll 10 times at power 5, luck 50
   !debugroll 7 100 50 --unique    # Force 50 unique-only rolls
   !debugroll 3 10 1 --stats       # Show global stats and roll once
   !debugroll 5 20 10 --test       # Test mode (doesn't assign items)
   !debugroll 5 20 1 --reset 9     # Reset item ID 9 to unowned
   ```

### Method 2: Standalone Test Script
Run directly from command line:
```bash
# Run default test suite
node test_unique_drops.js

# Run custom test
node test_unique_drops.js [power_level] [luck] [rolls]
node test_unique_drops.js 5 50 1000
```

### Method 3: Integrate Testing Config
Add this to the top of `patterns/uniqueItemFinding.js`:

```javascript
// Add at the very top of the file
const {
    TESTING_MODE,
    getTestingFindChance,
    shouldRollUnique,
    logTestRoll,
    isTestUser
} = require('./testing_config');

// Then modify the rollForItemFind function (around line 35):
async function rollForItemFind(playerId, playerTag, powerLevel, luckStat, activityType = 'mining', biome = null, guildId = null) {
    try {
        // TESTING OVERRIDE
        if (TESTING_MODE && isTestUser(playerId, playerTag)) {
            console.log(`[TEST MODE] Rolling for ${playerTag} with boosted rates`);
        }
        
        // First check for conditional drops
        if (guildId && Math.random() < (TESTING_MODE ? 0.1 : 0.001)) { // Increased from 0.001 in test mode
            // ... existing conditional drop code ...
        }
        
        // Calculate if an item should be found
        const originalFindChance = calculateItemFindChance(powerLevel, luckStat, activityType);
        const findChance = getTestingFindChance(originalFindChance, playerId, playerTag);
        
        if (Math.random() > findChance) {
            logTestRoll('find_check', null, playerId, playerTag);
            return null; // No item found
        }
        
        // Determine if it should be unique or regular
        const isUnique = shouldRollUnique(ITEM_FINDING_CONFIG.uniqueItemWeight, playerId, playerTag);
        
        if (isUnique) {
            const uniqueItem = await rollForUniqueItem(playerId, playerTag, powerLevel, biome);
            logTestRoll('unique', uniqueItem, playerId, playerTag);
            if (uniqueItem) return uniqueItem;
        }
        
        // Fall back to regular item
        const regularItem = await rollForRegularItem(playerId, playerTag, powerLevel);
        logTestRoll('regular', regularItem, playerId, playerTag);
        return regularItem;
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error in item roll:', error);
        return null;
    }
}
```

## To Enable Testing Mode:

### Option 1: Edit testing_config.js
Change line 4:
```javascript
const TESTING_MODE = true; // Set to false for production
```

### Option 2: Set your Discord ID
Edit `patterns/testing_config.js`:
```javascript
TEST_USER_ID: '123456789012345678', // Your actual Discord ID
TEST_USER_TAG: 'YourName#1234',     // Your Discord tag
```

### Option 3: Use Presets
In your code or console:
```javascript
const testConfig = require('./patterns/testing_config');

// Use maximum drop rates
testConfig.applyPreset('maximum');

// Use moderate rates
testConfig.applyPreset('moderate');

// Or manually enable/disable
testConfig.enableTestMode();
testConfig.disableTestMode();
```

## Current Drop Rates (Production):
- Base find chance: ~0.1-1% (varies by power level and luck)
- Unique vs Regular: Unknown (ITEM_FINDING_CONFIG.uniqueItemWeight)
- Individual unique weights: 0.2-1.0 (very rare)

## Testing Drop Rates:
With `TESTING_MODE = true` and default config:
- Base find chance: 80%
- Unique vs Regular: 90% unique
- Unique weights: Multiplied by 50x

## Available Unique Items:
1. **Blue Breeze** (ID: 9) - Legendary pickaxe
2. **Midas' Burden** (ID: 10) - Conditional charm
3. **THE ONE PICK** (ID: 1) - Mythic (0% normal drop)
4. **Earthshaker** (ID: 2) - Area damage pickaxe
5. **Whisper of the Void** (ID: 3) - Sight tool
6. **Greed's Embrace** (ID: 4) - Loot multiplier
7. **Phoenix Feather** (ID: 5) - Auto-revive
8. **Shadowstep Boots** (ID: 6) - Speed boots
9. **Forgotten King Crown** (ID: 7) - Leadership
10. **Stormcaller Gauntlets** (ID: 8) - Chain mining

## Important Notes:
⚠️ **REMEMBER TO DISABLE TEST MODE BEFORE PRODUCTION!**
⚠️ Each unique item can only have ONE owner at a time
⚠️ Test rolls with `--test` flag don't actually assign items
⚠️ Some items (like THE ONE PICK) have 0% drop rate normally

## Troubleshooting:
If `calculateItemFindChance` is not found:
1. The function might be defined elsewhere
2. You may need to create it:
```javascript
function calculateItemFindChance(powerLevel, luckStat, activityType) {
    const baseFindChance = 0.001; // 0.1% base
    const powerBonus = powerLevel * 0.0002; // +0.02% per level
    const luckBonus = luckStat * 0.00005; // +0.005% per luck
    
    return Math.min(0.1, baseFindChance + powerBonus + luckBonus); // Max 10%
}
```

## Quick Test:
1. Set `TESTING_MODE = true` in testing_config.js
2. Add your Discord ID
3. Run: `node test_unique_drops.js 5 50 100`
4. Check console for results
5. Set `TESTING_MODE = false` when done!

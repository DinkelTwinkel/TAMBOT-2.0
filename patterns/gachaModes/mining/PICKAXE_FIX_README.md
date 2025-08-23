# PICKAXE BREAKING BUG FIX GUIDE

## Problem
Players are losing multiple pickaxes (sometimes 20+) in a single break event due to duplicate durability checks happening in multiple code paths.

## Root Cause
The `handlePickaxeDurability` function is being called multiple times for the same mining action:
1. Main mining action
2. Area damage effects
3. Chain mining effects
4. Special unique item effects

Each call independently reduces pickaxe quantity, causing massive losses.

## Solution Options

### Option 1: Quick Hotfix (Immediate)
Replace the import in `mining_optimized_v5_performance.js`:

**Change:**
```javascript
const { handlePickaxeDurability } = require('./mining/improvedDurabilityHandling');
```

**To:**
```javascript
const { handlePickaxeDurability } = require('./mining/pickaxe_hotfix');
```

This adds a 2-second cooldown between pickaxe breaks for each player, preventing rapid duplicate breaks.

### Option 2: Proper Fix (Recommended)
1. Add the durability manager import:
```javascript
const durabilityManager = require('./mining/durabilityManager');
```

2. At the start of the main mining event, add:
```javascript
// Reset durability tracking for new mining cycle
durabilityManager.forceReset();
```

3. Replace ALL calls to `handlePickaxeDurability` with:
```javascript
const durabilityResult = await durabilityManager.handleDurability(
    member.id,
    member.displayName,
    pickaxe,
    durabilityLoss,
    'mining' // or 'chain_mining', etc.
);
```

4. Remove duplicate durability checks for area damage and explosion effects (they're part of the same action).

### Option 3: Minimal Change
If you can't make large changes, at least add a flag to track if durability was already checked:

```javascript
let durabilityChecked = false;

// First durability check
if (!durabilityChecked) {
    const durabilityResult = await handlePickaxeDurability(...);
    durabilityChecked = true;
    // ... handle result
}

// Later in code - skip additional checks
if (!durabilityChecked) {
    // Only check if not already done
}
```

## Testing
After applying the fix:
1. Give a test player a pickaxe with low durability
2. Have them mine until it breaks
3. Verify only 1 pickaxe is lost, not multiple

## Files Created
- `durabilityManager.js` - Centralized durability management system
- `pickaxe_hotfix.js` - Quick hotfix with cooldown system
- `FIX_PICKAXE_BREAKING.patch` - Detailed patch instructions

## Implementation Priority
1. **URGENT**: Apply Option 1 (hotfix) immediately to stop players losing items
2. **SOON**: Implement Option 2 (proper fix) for a permanent solution
3. **VERIFY**: Test thoroughly to ensure the fix works

## Additional Notes
- The durability manager uses a tick-based system (1 second default)
- Different action types can still trigger durability separately if needed
- Area damage should NOT trigger additional durability loss
- Chain mining MAY trigger additional durability if it's a separate player action

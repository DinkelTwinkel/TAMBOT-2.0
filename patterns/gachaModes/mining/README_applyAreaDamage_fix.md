# applyAreaDamage Integer Fix

## Problem
The `applyAreaDamage` function in `uniqueItemBonuses.js` was inconsistently returning different types:
- Sometimes returning an object: `{ wallsBroken: 0, oreRewarded: [] }`
- Sometimes returning a number: `wallsBroken`

This inconsistency could lead to the `wallsBroken` stat corruption issue where non-integer values get concatenated.

## Solution

### Changes Made to `uniqueItemBonuses.js`

1. **Line 253**: Changed early return from object to integer
   ```javascript
   // Before: return { wallsBroken: 0, oreRewarded: [] };
   // After:  return 0; // Always return integer for wallsBroken
   ```

2. **Line 352**: Added integer parsing to ensure return value is always an integer
   ```javascript
   // Before: return wallsBroken;
   // After:  return parseInt(wallsBroken) || 0;
   ```

3. **JSDoc Update**: Updated the return type documentation from `@returns {Object}` to `@returns {number}`

### Additional Safety Files

1. **`patch_applyAreaDamage_safety.js`** - Provides:
   - `safeApplyAreaDamage()` - Wrapper that guarantees integer return
   - `ensureInteger()` - Helper to convert any value to integer

2. **`test_applyAreaDamage.js`** - Test file to verify the fix works

## Usage

### Normal Usage (After Fix)
```javascript
const { applyAreaDamage } = require('./uniqueItemBonuses');

// Now always returns an integer
const wallsBroken = await applyAreaDamage(
    position, mapData, areaDamageChance, 
    member, eventLogs, dbEntry, mineFromTile, miningParams
);

// Safe to use in calculations
stats.wallsBroken += wallsBroken; // Will always be numeric addition
```

### Extra Safe Usage
```javascript
const { safeApplyAreaDamage } = require('./patch_applyAreaDamage_safety');

// Guaranteed integer even if something unexpected happens
const wallsBroken = await safeApplyAreaDamage(
    position, mapData, areaDamageChance, 
    member, eventLogs, dbEntry, mineFromTile, miningParams
);
```

### When Processing Any Numeric Stat
```javascript
const { ensureInteger } = require('./patch_applyAreaDamage_safety');

// Ensure any value is an integer before adding to stats
stats.wallsBroken += ensureInteger(someValue);
```

## Testing

Run the test to verify the fix:
```bash
node test_applyAreaDamage.js
```

Expected output:
- All test cases should show "Is Integer: true"
- All test cases should show "✅ PASSED"

## Why This Matters

When `applyAreaDamage` returned an object instead of a number, code like this:
```javascript
wallsBroken += applyAreaDamage(...); 
```

Would result in string concatenation:
```javascript
// If wallsBroken was 950111 and applyAreaDamage returned an object
// Result: "950111[object Object]"
// Then if another number 63263 was added
// Result: "950111[object Object]63263"
```

Now with the fix, it will always be numeric addition:
```javascript
// wallsBroken: 950111 + 0 = 950111 (correct numeric addition)
```

## Integration with wallsBroken Fix

This fix works together with the `fix_wallsBroken_corruption.js` module:
1. This fix prevents NEW corruption from happening
2. The wallsBroken fix cleans up EXISTING corruption

## Verification Checklist

- [x] `applyAreaDamage` always returns an integer
- [x] JSDoc updated to reflect integer return type
- [x] Early return (no area damage) returns 0 instead of object
- [x] Final return uses `parseInt()` for safety
- [x] Test file confirms integer returns
- [x] Safety wrapper available for extra protection

## Related Files

- `uniqueItemBonuses.js` - Main file with the fix
- `patch_applyAreaDamage_safety.js` - Safety utilities
- `test_applyAreaDamage.js` - Test file
- `../mining_fixes/fix_wallsBroken_corruption.js` - Main stat corruption fix

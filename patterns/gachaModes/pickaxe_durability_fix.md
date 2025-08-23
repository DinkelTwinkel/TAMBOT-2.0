# Pickaxe Durability Fix Instructions

## The Problem
The pickaxe breaking mechanism is not properly resetting the durability to max when decrementing quantity. The main file is using its own implementation instead of the improved durability handler that already exists.

## The Solution
You need to integrate the `handlePickaxeDurability` function from `improvedDurabilityHandling.js` into your main mining file.

## Step 1: Import Added (Already Done)
```javascript
const { handlePickaxeDurability } = require('./mining/improvedDurabilityHandling');
```

## Step 2: Find and Replace the Pickaxe Breaking Logic

In the `processPlayerActionsEnhanced` function (around line 2500+), you need to find where the pickaxe breaking is handled. Look for code that looks similar to this pattern:

```javascript
// OLD CODE (BUGGY)
if (checkResult.shouldBreak) {
    // Some code that tries to update inventory manually
    // This is where the bug is - not properly resetting durability
}
```

And replace it with:

```javascript
// NEW CODE (FIXED)
if (checkResult.shouldBreak) {
    // Use the improved durability handler
    const durabilityResult = await handlePickaxeDurability(
        member.id,
        member.user.tag,
        bestPickaxe,
        checkResult.durabilityLoss
    );
    
    if (durabilityResult.broke) {
        eventLogs.push(`⚒️ ${member.displayName}'s ${bestPickaxe.name} broke!`);
        
        // If the pickaxe was completely removed, clear the bestPickaxe reference
        if (durabilityResult.removed) {
            bestPickaxe = null;
            isUniquePickaxe = false;
        }
    }
}
```

## Step 3: Handle Durability Updates When Not Breaking

For normal durability updates (when the pickaxe doesn't break), make sure to also use the handler:

```javascript
// When mining a wall but pickaxe doesn't break
if (bestPickaxe && !checkResult.shouldBreak && checkResult.durabilityLoss > 0) {
    await handlePickaxeDurability(
        member.id,
        member.user.tag,
        bestPickaxe,
        checkResult.durabilityLoss
    );
}
```

## What the Fix Does

The `handlePickaxeDurability` function properly:
1. Decrements durability when mining
2. When durability reaches 0:
   - If quantity > 1: Reduces quantity by 1 and **resets durability to max**
   - If quantity = 1: Removes the item from inventory
3. Saves the changes atomically to the database

## Testing the Fix

1. Give yourself a pickaxe with quantity > 1
2. Mine until it breaks
3. Check that:
   - Quantity decreased by 1
   - Durability is reset to maximum (not staying at 0)
   - The pickaxe continues to work properly

## Alternative: Use Atomic Updates

If you want even better performance, you can use the atomic version:
```javascript
const { handlePickaxeDurabilityAtomic } = require('./mining/improvedDurabilityHandling');

// Then use:
await handlePickaxeDurabilityAtomic(member.id, bestPickaxe.itemId, checkResult.durabilityLoss);
```

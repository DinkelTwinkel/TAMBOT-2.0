# Fix: Separate Dialogue for Buy vs Sell Failures

## The Problem
When a player tried to sell an item they didn't have, the shop would say something like:
> "You need more coins!"

This didn't make sense because the issue wasn't money - it was that they didn't have the item to sell.

## The Solution
Created a new dialogue type specifically for "no item to sell" scenarios that properly addresses the actual issue.

## Changes Made

### 1. **New Function: `generateNoItemDialogue()`**
Added to `aiShopDialogueGenerator.js`:
- Generates dialogue about not having the item
- Handles both "no item at all" and "not enough quantity"
- Each shopkeeper responds in their personality

### 2. **Updated `shopHandler.js`**
- Imported the new `generateNoItemDialogue` function
- Changed sell failure to use `'noitem'` dialogue type instead of `'poor'`
- Passes quantity attempted and quantity available for context

### 3. **Updated `generateShop.js`**
- Exported the new `generateNoItemDialogue` function
- Made it available for use in shopHandler

## Dialogue Examples

### Buy Failures (Too Poor)
**Grimsby Coalhand:**
> "No coin, no tools. The mines don't run on credit."

**Lady Crystalline:**
> "How embarrassing for you. Perhaps try the copper quarry instead."

**Big Martha:**
> "Sorry love, I can't give credit. Times are tough for everyone."

### Sell Failures (No Item)
**Grimsby Coalhand:**
> "You trying to sell me air? I don't see any pickaxes on you."

**Lady Crystalline:**
> "I don't deal in imaginary inventory, darling."

**Big Martha:**
> "Don't have any of those to sell, do you love?"

### Sell Failures (Not Enough)
**Grimsby Coalhand:**
> "You only got 3, not 10. Check your pockets again."

**Lady Crystalline:**
> "Mathematics isn't your strong suit, is it? You're short by 7."

**Big Martha:**
> "You've only got 3 of those, dear, not enough for what you're asking."

## Personality Differences

### Gruff (Grimsby)
- Buy fail: Mentions credit, harsh
- Sell fail: Sarcastic about "selling air"

### Ruthless (Lady Crystalline)
- Buy fail: Condescending, suggests going elsewhere
- Sell fail: Mocking about "imaginary inventory"

### Warm (Big Martha)
- Buy fail: Apologetic but firm
- Sell fail: Gentle correction with "dear" or "love"

## Testing

Run the test to see the different dialogue types:
```bash
cd "D:\CODE\TAMBOT 2.0\patterns"
node testFailureDialogues.js
```

## Technical Details

The `updateShopDescription()` method now handles 4 dialogue types:
1. `'purchase'` - Successful buy
2. `'sell'` - Successful sell
3. `'poor'` - Can't afford to buy
4. `'noitem'` - Don't have item to sell

When calling for sell failure:
```javascript
// Old (wrong):
updateShopDescription(message, fallback, shopInfo, 'poor', item, 0);

// New (correct):
updateShopDescription(message, fallback, shopInfo, 'noitem', item, quantity, available);
```

## Result

✅ **Buy failures** talk about money: "You need more coins"
✅ **Sell failures** talk about items: "You don't have that"
✅ **Each shopkeeper** maintains their personality
✅ **Context aware** - knows if you have none vs not enough

The shops now correctly identify why a transaction failed and respond appropriately!
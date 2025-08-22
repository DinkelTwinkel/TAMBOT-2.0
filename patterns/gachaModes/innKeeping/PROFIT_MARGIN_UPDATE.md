# Inn Keeper Profit Margin Update

## Change Summary
Inn profit margins have been increased from ~50% to **~95%** of the purchase price.

## What Changed

### Previous System (50% margin)
- **Cost Basis**: `item.value / 2` (50% of base value)
- **Example**: Item worth 100 coins
  - Cost: 50 coins
  - Sold for: 100 coins
  - Profit: 50 coins (50% margin)

### New System (95% margin)
- **Cost Basis**: `item.value * 0.05` (5% of base value)
- **Example**: Item worth 100 coins
  - Cost: 5 coins
  - Sold for: 100 coins
  - Profit: 95 coins (95% margin)

## Impact on Gameplay

### Higher Rewards
- Inn workers now earn significantly more per sale
- A single high-value sale can generate massive profits
- More incentive to work in inn channels

### Example Scenarios

**Small Item (20 coin value)**
- Old profit: ~10 coins per sale
- **New profit: ~19 coins per sale**

**Medium Item (100 coin value)**
- Old profit: ~50 coins per sale
- **New profit: ~95 coins per sale**

**Large Item (500 coin value)**
- Old profit: ~250 coins per sale
- **New profit: ~475 coins per sale**

**With Price Fluctuation (+50%)**
- 100 coin item sold for 150 coins
- Old profit: 100 coins (66.7% margin)
- **New profit: 145 coins (96.7% margin)**

## Distribution Impact

With 95% profit margins, workers in the inn will see much larger payouts every 10 minutes:

**Example: 5 sales of 100-coin items**
- Old system: ~250 coins to distribute
- **New system: ~475 coins to distribute**

If 3 workers are in the VC:
- Old payout: ~83 coins each
- **New payout: ~158 coins each**

## Economic Balance

The increased profit margins make inn keeping one of the most profitable activities:
- Encourages voice channel participation
- Rewards active inn workers generously
- Creates a strong cooperative economy
- Makes inn channels highly desirable locations

## Technical Details

### Files Modified
- `shopHandler.js`: Changed cost calculation from `item.value / 2` to `item.value * 0.05`
- `INN_SALES_README.md`: Updated documentation with new profit examples

### Calculation Formula
```javascript
// Old formula
const baseCost = Math.floor(item.value / 2);  // 50% of value
const profit = buyPrice - baseCost;

// New formula
const baseCost = Math.floor(item.value * 0.05);  // 5% of value
const profit = buyPrice - baseCost;  // ~95% profit margin
```

## Notes
- The change affects all inn channels immediately
- Past sales are not retroactively adjusted
- The sales log now shows much higher profit totals
- Console logs include profit margin percentages for transparency

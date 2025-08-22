# Inn Sales Log - Updated Format

## Overview
The Inn Sales Log has been redesigned to provide a cleaner, chronological view of all purchases.

## Key Changes

### Display Format
- Sales are now shown **chronologically** (oldest to newest)
- Each sale displayed as: `username bought item for price`
- All sales contained in a **code block** for clean formatting
- **Latest sale appears at the bottom** of the list

### When Log Posts
- **Only posts when a purchase is made** (not on inn opening)
- Updates existing log if found in last 2 messages
- Cleans up old logs in last 10 messages before posting new

### New Layout

#### Main Display (Code Block)
```
Alice bought Diamond Sword for 126c
Bob bought Health Potion for 21c
Charlie bought Iron Pickaxe for 84c
Diana bought Diamond Sword for 126c
```

#### Fields
- **📦 Item Tally**: Shows total quantity of each item sold
- **👥 Customers**: Shows customer list with purchase counts
- **💰 Total Profit**: Shows accumulated profit

#### Footer
- Shows total sales count
- Shows time until next distribution
- Example: `4 sales | Next distribution: 7m 32s`

## Example Sales Log

```
📋 Inn Sales Log

```
Alice bought Diamond Sword for 126c
Bob bought Health Potion for 21c
Charlie bought Iron Pickaxe for 84c
Diana bought Diamond Sword for 126c
Alice bought Health Potion for 21c
```

📦 Item Tally
Diamond Sword: 2x, Health Potion: 2x, Iron Pickaxe: 1x

👥 Customers
@Alice (2x), @Bob (1x), @Charlie (1x), @Diana (1x)

💰 Total Profit
**456** coins

[Footer: 5 sales | Next distribution: 4m 15s]
```

## Technical Details

### Price Calculation
When displaying the price customers paid:
```javascript
const customerPaid = Math.ceil(sale.profit / 0.95);
```
This reverse-calculates from the 95% profit margin to show actual price paid.

### Username Storage
- Usernames are now stored with each sale record
- Fallback to `User1`, `User2` etc. for old sales without names
- Latest sale always uses current Discord username

### Data Structure
```javascript
saleRecord = {
    itemId: 'item_id',
    profit: 145,
    buyer: 'discord_user_id',
    buyerName: 'Alice',  // NEW: stored username
    timestamp: Date
}
```

## Benefits

1. **Cleaner Display**: Code block provides consistent formatting
2. **Better Tracking**: See purchase order and patterns
3. **Less Spam**: Only posts when sales occur
4. **Clear Summary**: Item tally and customer list at bottom
5. **Compact Footer**: Essential info (count & timer) in one line

## When Sales Log Clears

After profit distribution (every 10 minutes):
```
📋 Inn Sales Log

```
Sales cleared after profit distribution.
Starting fresh!
```

[Footer: 0 sales | Next distribution: 10 minutes]
```

## Notes

- Sales log auto-deletes old versions to prevent duplicates
- Maximum 10 old logs cleaned up per update
- Updates in-place when possible (last 2 messages)
- Customer mentions (@user) only shown in summary, not in sales list

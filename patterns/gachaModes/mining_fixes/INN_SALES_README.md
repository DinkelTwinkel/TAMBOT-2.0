# Inn Keeper Sales Tracking System

## Overview
The Inn Keeper game mode now tracks all sales that occur in inn channels, recording profits and customer data for each transaction.

## Key Changes

### 1. **innKeeper.js**
- Added `gamemode: 'innkeeper'` identifier to gameData
- Initializes sales array to track all transactions
- Added automatic profit distribution every 10 minutes
- Distributes profits equally among VC members (excluding self-purchases)
- Posts Inn Working Summary embed showing earnings
- Clears sales data after each distribution
- Prevents mixing with other game modes in activeVCs
- No longer posts sales log on inn opening (only on purchases)

### 2. **shopHandler.js**
- Imports InnKeeperSales helper module
- Added `isInnChannel()` method to detect inn channels
- Added `recordInnSale()` method to calculate and store profit
- Records sales automatically after successful purchases (both consumables and regular items)

### 3. **innKeeperSales.js** (Helper Module)
Provides methods for managing sales data:
- `recordSale()` - Add a new sale record
- `getSales()` - Get all sales for an inn
- `getTotalProfit()` - Calculate total profit
- `getSalesByBuyer()` - Get purchases by specific customer
- `getTopBuyers()` - Get top customers by purchase count
- `clearSales()` - Reset sales data

## How It Works

### Sale Recording
When a purchase occurs in an inn channel:
1. Shop handler detects the inn channel via `gameData.gamemode === 'innkeeper'`
2. Calculates profit: `buyPrice - baseSellPrice`
3. Records sale with item ID, profit, buyer ID, and timestamp

### Profit Calculation
- **Revenue**: What customers pay (fluctuated buy price)
- **Cost**: Base cost = `item.value * 0.05` (5% of base value)
- **Profit**: Revenue - Cost
- **Profit Margin**: ~95% of sale price

### Example Profit Scenarios

**Example 1: Base Price Sale**
- Item base value: 100 coins
- Inn's cost: 5 coins (100 * 0.05)
- Customer pays: 100 coins (no fluctuation)
- **Profit: 95 coins (95% margin)**

**Example 2: High Price Sale**
- Item base value: 100 coins
- Inn's cost: 5 coins (100 * 0.05)
- Customer pays: 150 coins (50% price increase)
- **Profit: 145 coins (96.7% margin)**

**Example 3: Low Price Sale**
- Item base value: 100 coins
- Inn's cost: 5 coins (100 * 0.05)
- Customer pays: 80 coins (20% price decrease)
- **Profit: 75 coins (93.75% margin)**

### Profit Distribution (Every 10 Minutes)
The inn automatically distributes profits to workers every 10 minutes:

1. **Check Timer**: When inn triggers (every minute), it checks if 10 minutes have passed
2. **Get VC Members**: Identifies all non-bot users currently in the voice channel
3. **Calculate Distribution**: For each sale:
   - Excludes the buyer from receiving profit from their own purchase
   - Splits profit equally among remaining eligible members
4. **Award Coins**: Updates each member's currency balance
5. **Send Summary**: Posts an embed showing:
   - Total sales and profit
   - Individual earnings for each worker
   - Best sale of the period
6. **Clear Sales**: Resets the sales array for the next period
7. **Update Timer**: Records the distribution timestamp

**Example**: If Alice buys an item with 50 coin profit while Alice, Bob, and Charlie are in the VC:
- Bob gets 25 coins
- Charlie gets 25 coins  
- Alice gets 0 coins (can't profit from own purchase)

### Data Structure
```javascript
gameData: {
    gamemode: 'innkeeper',
    lastProfitDistribution: Date,  // Last time profits were distributed
    sales: [
        {
            itemId: 'item_id',
            profit: 150,        // Profit in coins
            buyer: 'user_id',   // Discord user ID
            buyerName: 'Alice', // Discord username (stored for display)
            timestamp: Date     // When sale occurred
        }
    ]
}
```

## Usage Examples

### Recording a Sale (Automatic)
Sales are recorded automatically when purchases happen in inn channels.

### Manual Commands (When Implemented)
```javascript
// Show inn statistics
const { showInnStats } = require('./patterns/gachaModes/innPurchaseHandler');
await showInnStats(channel);

// Show recent sales
const { showRecentSales } = require('./patterns/gachaModes/innPurchaseHandler');
await showRecentSales(channel, 10); // Show last 10 sales

// Get total profit programmatically
const InnKeeperSales = require('./patterns/gachaModes/innKeeperSales');
const totalProfit = await InnKeeperSales.getTotalProfit(channelId);
```

## Inn Sales Log (Updated Format)

Posts/updates only when purchases occur:

```
📋 Inn Sales Log

[Code Block]
Alice bought Diamond Sword for 126c
Bob bought Health Potion for 21c
Charlie bought Iron Pickaxe for 84c

📦 Item Tally
Diamond Sword: 1x, Health Potion: 1x, Iron Pickaxe: 1x

👥 Customers
@Alice (1x), @Bob (1x), @Charlie (1x)

💰 Total Profit
476 coins

[Footer: 3 sales | Next distribution: 7m 45s]
```

## Inn Working Summary

Every 10 minutes, profit distribution posts:

```
🏪 Inn Working Summary
Profits have been distributed to inn workers!

📊 Sales Report
Total Sales: 5
Total Profit: 475 coins

💰 Worker Earnings  
@User1 earned 158 coins
@User2 earned 158 coins
@User3 earned 159 coins

⭐ Best Sale
Item: diamond_sword | Profit: 145 coins
```

## Future Enhancements

### Possible Features
- Daily/weekly profit reports
- Customer loyalty rewards
- Best-selling items tracking
- Profit-based achievements
- Inn leaderboards
- Special events based on sales milestones

### Command Ideas
- `/inn stats` - Show inn statistics
- `/inn customers` - Show top customers
- `/inn sales` - Show recent sales
- `/inn profit` - Show profit breakdown
- `/inn achievements` - Show unlocked achievements

## Notes
- Sales are persistent in MongoDB via the activeVCs collection
- Each inn channel maintains its own independent sales history
- The system handles both single item and bulk purchases
- Profit calculations account for price fluctuations

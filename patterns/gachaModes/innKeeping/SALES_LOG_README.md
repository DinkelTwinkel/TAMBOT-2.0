# Inn Sales Log System - Complete Documentation

## Overview
The Inn Sales Log is a dynamic, real-time tracking system that displays all sales activity in inn channels. It automatically updates with each purchase and shows profit distribution countdown.

## Features

### 📋 **Real-Time Sales Log**
- Automatically posts when inn opens (before shop generation)
- Updates in-place (edits existing message if within last 2 messages)
- Shows comprehensive sales data

### 📊 **Information Displayed**
1. **Customer List** - All buyers with purchase counts
2. **Items Sold** - Quantity and profit per item type
3. **Total Profit** - Accumulated profit awaiting distribution
4. **Total Sales** - Number of transactions
5. **Distribution Timer** - Countdown to next profit distribution
6. **Latest Purchase** - Footer shows most recent transaction

## Implementation Details

### File Structure
```
patterns/gachaModes/
├── innKeeper.js                 # Main inn logic, posts sales log
└── innKeeping/
    ├── innKeeperSales.js        # Sales recording logic
    ├── innSalesLog.js           # Sales log display system
    └── innPurchaseHandler.js    # Purchase handling examples

patterns/
└── shopHandler.js               # Updates sales log on purchases
```

### Sales Log Lifecycle

#### 1. **Initial Post** (Inn Opens)
```javascript
// In innKeeper.js
await InnSalesLog.postOrUpdateSalesLog(channel, dbEntry);
```
- Checks last 2 messages for existing log to update
- If creating new log, deletes any old logs in last 10 messages
- Posts initial log showing "No sales yet"

#### 2. **Sale Occurs** (Customer Purchase)
```javascript
// In shopHandler.js
await this.recordInnSale(channel, item.id, buyPrice, sellPrice, buyer);
// This automatically updates the sales log footer
```
- Searches last 5 messages for log to update
- Updates log with new sale data and latest purchaser

#### 3. **Profit Distribution** (Every 10 Minutes)
```javascript
// In innKeeper.js
await distributeProfits(channel, dbEntry);
await InnSalesLog.clearSalesLog(channel);
```
- Distributes profits
- Clears log content or deletes old logs
- Resets for next period

## Sales Log Format

### No Sales Yet
```
📋 Inn Sales Log
*No sales yet. Waiting for customers...*

⏰ Next Profit Distribution
10 minutes
```

### Active Sales
```
📋 Inn Sales Log
**Customers Today:**
@User1 (3 purchases), @User2 (1 purchase), @User3 (2 purchases)

📦 Items Sold
**Diamond Sword**: 2x (240 profit)
**Health Potion**: 4x (80 profit)
**Iron Pickaxe**: 1x (45 profit)

💰 Total Profit        📊 Total Sales       ⏰ Distribution In
**365** coins         **7** transactions    4m 32s

💫 Latest: Health Potion purchased by User3#1234
```

### After Distribution
```
📋 Inn Sales Log
*Sales cleared after profit distribution. Starting fresh!*

⏰ Next Profit Distribution
10 minutes
```

## Key Methods

### InnSalesLog Class

#### `findExistingSalesLog(channel, limit = 2)`
- Searches last N messages for existing sales log
- Returns message object if found, null otherwise
- Default searches last 2 messages

#### `deleteOldSalesLogs(channel, limit = 10)`
- Deletes all sales logs found in last N messages
- Returns count of deleted messages
- Used to clean up outdated logs

#### `createSalesLogEmbed(dbEntry)`
- Generates the sales log embed from gameData
- Calculates all statistics and formats display

#### `postOrUpdateSalesLog(channel, dbEntry)`
- Main method to post new or update existing log
- Updates if found in last 2 messages
- Deletes old logs in last 10 messages before posting new

#### `updateWithLatestPurchase(channel, dbEntry, itemId, buyer)`
- Updates footer with latest purchase info
- Searches last 5 messages for log
- Called after each successful sale

#### `clearSalesLog(channel)`
- Resets log after profit distribution
- Searches last 5 messages for log
- Deletes old logs if none found to update

## Configuration

### Timer Settings
- **Profit Distribution**: Every 10 minutes
- **Update Frequency**: Real-time on each sale

### Message Search Ranges
- **Update Existing**: Checks last 2 messages
- **Delete Old Logs**: Cleans up last 10 messages
- **Find for Updates**: Searches last 5 messages
- **Clear After Distribution**: Searches last 5 messages

### Display Limits
- **Customer List**: All customers shown
- **Item List**: Sorted by quantity, limited to 1024 chars
- **Footer**: Shows only latest purchase

## Integration Points

### With Shop System
- Shop handler detects inn channels
- Records sales with profit calculation
- Updates sales log footer immediately

### With Profit Distribution
- Checks timer every minute
- Distributes profits to VC members
- Clears sales log after distribution

### With Voice Channel
- Only active VC members receive profits
- Buyers excluded from their own purchase profits
- Bots excluded from distributions

## Error Handling

- **Missing Log**: Creates new if not found in last 2 messages
- **Old Logs**: Automatically deletes outdated logs in last 10 messages
- **Failed Updates**: Logs errors but continues operation
- **Delete Failures**: Individual delete errors don't stop cleanup process
- **Invalid Data**: Handles missing sales array gracefully
- **Channel Issues**: Verifies channel exists before operations

## Performance Optimizations

- **Caching**: Item lookups use Map for O(1) access
- **Message Fetch**: Only fetches last 2 messages
- **Batch Updates**: Single embed edit per sale
- **Lean Queries**: Database queries use .lean() when possible

## Future Enhancements

### Potential Features
- Sales graphs/charts
- Best customer badges
- Item popularity trends
- Profit milestones
- Daily/weekly summaries
- Export sales reports
- Customer loyalty tracking
- Bulk purchase bonuses

## Usage Examples

### Manual Sales Log Update
```javascript
const InnSalesLog = require('./patterns/gachaModes/innKeeping/innSalesLog');
const dbEntry = await GachaVC.findOne({ channelId });
await InnSalesLog.postOrUpdateSalesLog(channel, dbEntry);
```

### Clean Up Old Logs
```javascript
// Delete all sales logs in last 20 messages
const deletedCount = await InnSalesLog.deleteOldSalesLogs(channel, 20);
console.log(`Cleaned up ${deletedCount} old sales logs`);
```

### Check Distribution Timer
```javascript
const timeRemaining = InnSalesLog.getTimeUntilDistribution(dbEntry);
console.log(`Distribution in: ${timeRemaining}`);
```

### Force Clear Sales Log
```javascript
await InnSalesLog.clearSalesLog(channel);
```

### Find Existing Log
```javascript
// Search last 10 messages for a sales log
const existingLog = await InnSalesLog.findExistingSalesLog(channel, 10);
if (existingLog) {
    console.log(`Found sales log: ${existingLog.id}`);
}
```

## Troubleshooting

### Log Not Updating
1. Check if log exists in last 2-5 messages
2. Verify gamemode is 'innkeeper'
3. Ensure sales array is being populated
4. Check console for error messages

### Multiple Logs Appearing
1. System automatically cleans up old logs
2. Deletes logs in last 10 messages when posting new
3. Check bot has delete permissions
4. Manual cleanup: `await InnSalesLog.deleteOldSalesLogs(channel, 20)`

### Timer Issues
1. Verify lastProfitDistribution timestamp
2. Check if sales array has entries
3. Ensure inn trigger runs every minute

### Display Problems
1. Verify embed permissions in channel
2. Check character limits aren't exceeded
3. Ensure item IDs match itemSheet.json

## Notes

- Sales persist in MongoDB through activeVCs collection
- Each inn maintains independent sales history
- Distribution only occurs with active sales
- System handles concurrent purchases gracefully
- Log updates are non-blocking operations

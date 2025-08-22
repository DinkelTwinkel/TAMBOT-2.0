# Shop Handler Database Optimizations

## Summary of Changes Made

### 1. **Projection Optimization**
- Only fetch the fields you actually need from database
- `GachaVC`: Only fetch `typeId` instead of entire document
- `Currency`: Only fetch `money`, `userId`, `usertag`
- `PlayerInventory`: Only fetch `items`, `playerId`, `playerTag`

### 2. **Lean Queries**
- Added `.lean()` to all read-only queries for better performance
- Lean documents are plain JavaScript objects (smaller memory footprint)

### 3. **Atomic Operations**
- Replaced document.save() with atomic updateOne operations
- Prevents race conditions and improves performance
- No need to fetch documents before updating

## Database Index Recommendations

Add these indexes to your MongoDB collections for better performance:

```javascript
// In your database setup or migration file:

// GachaVC Collection - Most important!
db.gachavcs.createIndex({ channelId: 1 }, { unique: true });

// Currency Collection
db.currencies.createIndex({ userId: 1 }, { unique: true });

// PlayerInventory Collection
db.playerinventories.createIndex({ playerId: 1 }, { unique: true });
db.playerinventories.createIndex({ "items.itemId": 1 }); // For item lookups

// If you query by guild often:
db.guildconfigs.createIndex({ guildId: 1 }, { unique: true });
```

## Performance Monitoring

The code now logs fetch times. Monitor these in your console:
- `[SHOP] Data fetch took Xms` - Should be under 100ms ideally
- If consistently over 200ms, check:
  1. Database connection latency
  2. Document sizes in GachaVC collection
  3. Missing indexes

## Additional Recommendations

### 1. **Consider Data Archival**
If GachaVC documents grow large over time:
```javascript
// Archive old data to a separate collection
const activeData = {
    channelId: vc.channelId,
    typeId: vc.typeId,
    // Only active/recent data
};

const archivedData = {
    channelId: vc.channelId,
    historicalData: vc.largeArrays,
    // Move large arrays here
};
```

### 2. **Connection Pooling**
Ensure your MongoDB connection uses proper pooling:
```javascript
mongoose.connect(uri, {
    maxPoolSize: 10,     // Adjust based on load
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
});
```

### 3. **Cache Warming**
Pre-load shop configs on bot startup:
```javascript
async function warmShopCache() {
    const activeChannels = await GachaVC.find({}, { channelId: 1, typeId: 1 }).lean();
    for (const vc of activeChannels) {
        await shopHandler.getCachedShopConfig(vc.channelId);
    }
    console.log(`[SHOP] Warmed cache for ${activeChannels.length} channels`);
}
```

### 4. **Batch Operations**
If multiple users buy/sell simultaneously, consider batching:
```javascript
// Instead of individual updates
const bulkOps = purchases.map(p => ({
    updateOne: {
        filter: { userId: p.userId },
        update: { $inc: { money: -p.cost } }
    }
}));
await Currency.bulkWrite(bulkOps);
```

## Expected Performance Improvements

With these optimizations:
- **GachaVC queries**: 50-90% faster (fetching only typeId)
- **Currency/Inventory queries**: 30-50% faster (projections + lean)
- **Updates**: 20-40% faster (atomic operations)
- **Memory usage**: 40-60% lower (lean documents)

## Testing the Improvements

1. Check current response times:
   ```
   [SHOP] Data fetch took 245ms  // Before
   ```

2. After optimizations:
   ```
   [SHOP] Data fetch took 45ms   // After
   ```

3. Monitor the cache hit rate:
   ```javascript
   const stats = shopHandler.getPerformanceStats();
   console.log(`Cache hit rate: ${stats.cacheHitRate}`);
   // Should be > 80% after warmup
   ```

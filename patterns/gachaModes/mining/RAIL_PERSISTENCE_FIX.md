# Rail Data Persistence Fix

## Problem
The rail data was not persisting because the mining system has its own caching mechanism and frequent map updates that were overwriting the rail data.

## Solution
The fix involves three main components:

### 1. Atomic Database Updates
Instead of using `activeVC.save()`, we now use MongoDB's `findOneAndUpdate` with atomic operations. This ensures that the rail data is written directly to the database without interference from other processes.

### 2. Cache Invalidation
The mining system caches database entries for performance. After updating rail data, we now:
- Clear the `dbCache` that stores channel data
- Clear the `efficiencyCache` that stores mining calculations
- Invalidate the `visibilityCalculator` cache

### 3. Rail Data Preservation
The mining system now:
- Stores rail positions before any map updates
- Restores rail data after map initialization or modifications
- Preserves rail data when tiles are updated

## Files Modified

### New Files
- `patterns/gachaModes/mining/railCacheFix.js` - Cache management and atomic updates

### Updated Files
1. `commands/buildRails.js`
   - Now uses `atomicRailUpdate()` instead of `activeVC.save()`
   - Clears mining cache after updates

2. `patterns/gachaModes/mining_optimized_v5_performance.js`
   - Exports caches globally for external clearing
   - Preserves rail positions before map updates
   - Restores rail positions after map modifications

## How It Works

### When Building Rails
1. Rails are built using A* pathfinding
2. Map data is updated with `hasRail: true` on tiles
3. `atomicRailUpdate()` writes directly to MongoDB
4. All caches are cleared to prevent stale data
5. Next mining event will see the updated rail data

### During Mining Events
1. Before any map updates, existing rail positions are stored
2. Map is updated/initialized as needed
3. Rail positions are restored to the updated map
4. This ensures rails persist through all mining operations

## Testing
1. Join a mining voice channel
2. Mine some tunnels to create floor space
3. Use `/debugrails build` to create rails
4. Wait for mining events to trigger (or trigger them manually)
5. Rails should remain visible on the map
6. Use `/debugrails info` to verify rail count

## Console Logs
Watch for these console messages to verify the fix is working:
- `[RAILS] Atomic update completed for channel {id}`
- `[RAILS] Cleared mining cache for channel {id}`
- `[MINING] Preserving {n} rail tiles`
- `[MINING] Restored {n} rail tiles after map update`

## Troubleshooting

### Rails Still Disappearing
1. Check that `railCacheFix.js` is properly imported
2. Verify atomic updates are being used (check console logs)
3. Ensure global caches are being exported
4. Check for any other processes modifying the map

### Performance Issues
The atomic updates and cache clearing add minimal overhead. If you notice performance issues:
1. Consider batching rail updates
2. Implement a debounce for cache clearing
3. Use the standard save method for non-critical updates

## Future Improvements
1. Implement a dedicated rail collection in MongoDB
2. Use MongoDB transactions for complex rail operations
3. Create a rail-specific caching layer
4. Add rail versioning to detect conflicts
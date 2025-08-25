# Migration Guide: Simple Hazard Scanner

## Overview
The new simple hazard scanner replaces the overly complex technical scanner with a clean, straightforward system that shows exactly what hazards are spawning on the map.

## Key Improvements
- **Clear Information**: Shows exactly what hazard types are active
- **Real-time Counts**: Displays how many of each hazard type exist
- **Mine-Specific**: Shows what hazards can spawn in the current mine
- **Simple Design**: Easy to understand and extend

## Files Changed

### New Files Created
1. `simpleHazardScanner.js` - The new simplified scanner
2. `testSimpleHazardScanner.js` - Test file to verify functionality

### Files to Update
1. `mining_optimized_v5_performance.js` - Main mining file needs integration

### Files to Keep (Still Needed)
1. `hazardEffects.js` - Still handles hazard triggering
2. `hazardStorage.js` - Still manages hazard data storage
3. `geologicalScanner.js` - Can keep for additional geological info if desired

### Files to Consider Removing (Optional)
1. `hazardScanner.js` - The old complex scanner (can archive it)
2. `hazardCodeReference.js` - Complex code system no longer needed
3. `hazardServerMapping.js` - Replaced by simpler mine config check

## Migration Steps

### Step 1: Add Import to Main Mining File
```javascript
// At the top of mining_optimized_v5_performance.js
const simpleHazardScanner = require('./mining/hazards/simpleHazardScanner');
```

### Step 2: Replace Geological Scan Call
Find this line:
```javascript
await performGeologicalScan(channel, dbEntry, serverPowerLevel, serverName);
```

Replace with:
```javascript
// Get hazards data
const hazardStorage = require('./mining/hazardStorage');
const hazardsData = await hazardStorage.getHazardsData(channel.id);

// Perform simple hazard scan
if (!dbEntry.gameData?.hazardScanDone) {
    await simpleHazardScanner.performSimpleHazardScan(
        channel,
        hazardsData,
        serverPowerLevel,
        serverName,
        mineTypeId
    );
    dbEntry.gameData.hazardScanDone = true;
    await dbEntry.save();
}
```

### Step 3: Add to Event Logs (Optional)
In your event logging system, add quick hazard summaries:
```javascript
// In processPlayerActions or similar
const hazardSummary = simpleHazardScanner.getQuickHazardSummary(hazardsData);
if (Math.random() < 0.1) { // Show 10% of the time
    eventLogs.push(`📡 ${hazardSummary}`);
}
```

### Step 4: Reset Scanner on Session End
When mining session ends or breaks start:
```javascript
// In startBreak() or endMiningSession()
dbEntry.gameData.hazardScanDone = false;
await dbEntry.save();
```

## What the Scanner Shows

### Example Output
```
⚠️ HAZARD SCAN - Diamond Mines
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Active Hazards: 8/10 total

🎯 Detected Hazard Types:
🌀 Portal Trap: 3 active
💣 Bomb Trap: 2 active  
☠️ Toxic Fog: 3 active

📋 This Mine Can Spawn:
🌀 Portal Trap

⚡ Danger Level:
Power Level 4
Spawn Rate: Moderate (15% chance)
```

## API Reference

### Main Functions
- `performSimpleHazardScan()` - Shows hazard scan in Discord
- `scanActiveHazards()` - Gets current hazard counts
- `getQuickHazardSummary()` - One-line summary for logs
- `getHazardAtPosition()` - Check specific tile for hazard
- `getAllowedHazards()` - What hazards can spawn in this mine

### Hazard Types
```javascript
HAZARD_TYPES = {
    PORTAL_TRAP: 'portal_trap',    // 🌀 Teleports randomly
    BOMB_TRAP: 'bomb_trap',        // 💣 Explodes area
    GREEN_FOG: 'green_fog',        // ☠️ Damages equipment
    WALL_TRAP: 'wall_trap',        // 🧱 Creates walls
    FIRE_BLAST: 'fire_blast'       // 🔥 Burns minecart items
}
```

## Testing
Run the test file to verify everything works:
```bash
node testSimpleHazardScanner.js
```

## Future Enhancements (Build Slowly)
1. **Phase 1** (Current): Show what hazards are spawning ✅
2. **Phase 2**: Add hazard warnings when players approach
3. **Phase 3**: Show hazard effects/damage in scan
4. **Phase 4**: Add hazard prediction based on patterns
5. **Phase 5**: Interactive hazard map overlay

## Benefits
- **Clarity**: Players instantly understand what dangers exist
- **Performance**: Lightweight scanning without complex calculations
- **Maintainable**: Simple code that's easy to modify
- **Extensible**: Easy to add new hazard types or features

## Troubleshooting

### If hazards aren't showing:
1. Check `hazardStorage.getHazardsData()` returns valid data
2. Verify mine has `hazardConfig` in gachaServers.json
3. Ensure hazards are spawning (check spawn rates)

### If scan shows wrong mine:
1. Verify `mineTypeId` is being passed correctly
2. Check `dbEntry.typeId` is set properly

### If counts are wrong:
1. Check if hazards are being triggered but not removed
2. Verify `hazardsData.hazards` Map is properly maintained

## Support
The simplified scanner is designed to be self-explanatory. If you need to add features, start small and build incrementally. The modular design makes it easy to add new functionality without breaking existing code.
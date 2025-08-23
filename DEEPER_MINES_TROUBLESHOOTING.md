# Deeper Mines Feature - Troubleshooting Guide

## Common Issues and Solutions

### 1. "Dig Deeper" Button Not Appearing

**Symptoms:**
- Progress shows 100% but no button
- Mining stats are being tracked but button never shows

**Possible Causes & Solutions:**

1. **Mine doesn't have deeper level configured**
   - Check `gachaServers.json` - does the mine have `deeperMineId` field?
   - Verify the deeper mine entry exists (e.g., id "101" for Coal Mines)

2. **Currently in a break period**
   - Button only appears during active mining
   - Wait for break to end

3. **Already in a deeper mine**
   - Check if mine name includes "[ DEEPER ]"
   - Deeper mines don't have further levels (except special cases)

4. **TypeId not set in database**
   ```javascript
   // Check in MongoDB or through console:
   const entry = await ActiveVCS.findOne({ channelId: 'CHANNEL_ID' });
   console.log('TypeId:', entry.typeId); // Should match gachaServers.json id
   ```

### 2. Stats Not Tracking

**Symptoms:**
- Breaking walls but counter stays at 0
- Progress bar not moving

**Solutions:**

1. **Verify modifications were applied**
   - Check that `deeperMineChecker.updateMiningStats()` calls exist in mining script
   - Ensure import statement is at the top of mining script

2. **Initialize missing stats**
   ```javascript
   // Run this to initialize stats for existing channel:
   const entry = await ActiveVCS.findOne({ channelId: 'CHANNEL_ID' });
   deeperMineChecker.initializeMiningStats(entry);
   entry.markModified('gameData');
   await entry.save();
   ```

3. **Check if stats are being saved**
   - Look for `markModified('gameData.miningStats')` calls
   - Verify database saves are happening

### 3. Button Click Errors

**Error: "You must be in the voice channel"**
- User must be in the same VC as the button
- Can't click from another channel or while disconnected

**Error: "Channel database entry not found"**
- Database may be out of sync
- Try restarting the bot
- Check if channel exists in ActiveVCS collection

**Error: "Deeper mine configuration not found"**
- Check `deeperMineId` points to valid entry
- Verify deeper mine exists in `gachaServers.json`

### 4. Channel Creation Failures

**Symptoms:**
- Button clicked but no new channel created
- Error messages about permissions

**Solutions:**

1. **Check bot permissions**
   ```javascript
   // Required permissions:
   - Manage Channels
   - Move Members
   - Connect
   - Speak
   - View Channel
   ```

2. **Category is full**
   - Discord categories have a 50 channel limit
   - Clean up unused channels
   - Create new category if needed

3. **Rate limiting**
   - Discord rate limits channel creation
   - Add delay between operations
   - Check for "processingChannels" Set blocking

### 5. Players Not Moving to New Channel

**Symptoms:**
- New channel created but players stay in old one
- Some players move, others don't

**Solutions:**

1. **Move Members permission**
   - Bot needs this permission in both channels
   - Check role hierarchy

2. **Players disconnected during transition**
   - Manual intervention required
   - Send invite link to new channel

3. **Timeout issues**
   ```javascript
   // Increase timeout if needed:
   for (const member of members) {
       try {
           await member.voice.setChannel(newChannel);
           await new Promise(r => setTimeout(r, 100)); // Add delay
       } catch (err) {
           console.error(`Failed to move ${member.id}:`, err);
       }
   }
   ```

### 6. Old Channel Not Deleting

**Symptoms:**
- Both old and new channels exist
- Old channel becomes orphaned

**Solutions:**

1. **Permission issue**
   - Bot needs Manage Channels permission
   - Check audit log for errors

2. **Timing issue**
   - Increase delay before deletion:
   ```javascript
   setTimeout(async () => {
       await channel.delete();
   }, 3000); // Increase from 1000ms to 3000ms
   ```

3. **Manual cleanup**
   ```javascript
   // Emergency cleanup script:
   const orphaned = guild.channels.cache.filter(ch => 
       ch.name.includes('⛏️') && ch.members.size === 0
   );
   for (const [id, channel] of orphaned) {
       await channel.delete();
       await ActiveVCS.deleteOne({ channelId: id });
   }
   ```

### 7. Mining Stats Wrong After Transition

**Symptoms:**
- Stats reset when entering deeper mine
- Progress lost after dig deeper

**Solutions:**

1. **Preserve stats in transition**
   ```javascript
   // In digDeeperListener.js, ensure:
   gameData: {
       ...dbEntry.gameData,  // Spreads existing data
       miningStats: {
           ...dbEntry.gameData.miningStats,  // Preserves stats
           deeperLevelReached: true,
           deeperLevelTime: Date.now()
       }
   }
   ```

2. **Database not saving**
   - Check `await newEntry.save()` is called
   - Verify no validation errors

### 8. Bot Crashes During Transition

**Symptoms:**
- Bot goes offline while creating deeper mine
- Leaves system in inconsistent state

**Recovery Steps:**

1. **Clean up partial state**
   ```javascript
   // On bot restart:
   const processing = await ActiveVCS.find({ 
       'gameData.transitioning': true 
   });
   for (const entry of processing) {
       // Clean up or complete transition
   }
   ```

2. **Add transaction flags**
   ```javascript
   // Before transition:
   dbEntry.gameData.transitioning = true;
   await dbEntry.save();
   
   // After successful transition:
   delete newEntry.gameData.transitioning;
   ```

### 9. Image Not Loading

**Symptoms:**
- Placeholder image shown instead of mine image
- Image attachment fails

**Solutions:**

1. **Create missing images**
   - Add images to `assets/gachaLocations/`
   - Name format: `coalMineDeep.png`, `topazMineDeep.png`, etc.

2. **Fallback chain**
   ```javascript
   // Order of image checking:
   1. deeperMine.image + '.png'
   2. currentMine.image + 'Deep.png'  
   3. currentMine.image + '.png'
   4. 'placeHolder.png'
   ```

### 10. Performance Issues

**Symptoms:**
- Lag when generating embeds
- Slow button response
- Database timeouts

**Solutions:**

1. **Cache optimization**
   ```javascript
   // Reuse cached data:
   const cached = mapCacheSystem.getCachedData(channelId);
   ```

2. **Reduce calculation frequency**
   - Only check conditions on fresh embeds
   - Cache progress calculations

3. **Database indexing**
   ```javascript
   // Add index on channelId:
   db.activevcs.createIndex({ channelId: 1 })
   ```

## Debug Commands

### Check Mining Stats
```javascript
// In bot console or eval command:
const deeperMineChecker = require('./patterns/mining/deeperMineChecker');
const entry = await ActiveVCS.findOne({ channelId: 'CHANNEL_ID' });
const config = deeperMineChecker.getMineConfig(entry.typeId);
const progress = deeperMineChecker.getProgress(entry, config);
console.log('Progress:', progress);
console.log('Stats:', entry.gameData.miningStats);
```

### Force Unlock Deeper Level
```javascript
// For testing only:
entry.gameData.miningStats.totalWallsBroken = 9999;
entry.markModified('gameData');
await entry.save();
```

### Reset All Stats
```javascript
// Clean slate:
await ActiveVCS.updateMany(
    {},
    { $unset: { 'gameData.miningStats': 1 } }
);
```

## Contact Support

If issues persist after trying these solutions:

1. Check console logs for error messages
2. Save the full error stack trace
3. Note the mine type and conditions
4. Document steps to reproduce
5. Check Discord.js and MongoDB versions

## Prevention Tips

1. **Test in development first**
   - Use a test server
   - Try all mine types
   - Simulate edge cases

2. **Monitor after deployment**
   - Watch console logs
   - Check database growth
   - Monitor Discord rate limits

3. **Regular maintenance**
   - Clean orphaned channels
   - Archive old mining stats
   - Update condition costs based on usage

4. **User communication**
   - Announce new feature
   - Provide instructions
   - Set expectations for requirements
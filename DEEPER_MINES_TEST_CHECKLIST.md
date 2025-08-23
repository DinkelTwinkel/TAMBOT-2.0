# Deeper Mines Feature - Testing Checklist

## Pre-Installation Checklist
- [ ] Backed up `data/gachaServers.json`
- [ ] Backed up `patterns/gachaModes/mining_optimized_v5_performance.js`
- [ ] Backed up database (if applicable)

## Installation Verification
- [ ] `data/gachaServers.json` updated with deeper mine entries
- [ ] `patterns/mining/deeperMineChecker.js` created
- [ ] `patterns/digDeeperListener.js` created
- [ ] Mining script modifications applied
- [ ] Bot initialization code added

## Functional Testing

### 1. Basic Mining Stats Tracking
- [ ] Join a mining voice channel
- [ ] Break walls - verify counter increases
- [ ] Collect ores - verify counter increases
- [ ] Find treasures - verify counter increases
- [ ] Check that stats persist across bot restarts

### 2. Progress Display
- [ ] Mining embed shows "Deeper Level Progress" field
- [ ] Progress bar updates correctly
- [ ] Percentage calculation is accurate
- [ ] Condition description matches mine type

### 3. Coal Mine Test (wallsBroken condition)
- [ ] Roll Coal Mines VC
- [ ] Break 500 walls
- [ ] Verify "Dig Deeper" button appears
- [ ] Button is green and clickable

### 4. Topaz Mine Test (oresFound condition)
- [ ] Roll Topaz Mine VC
- [ ] Collect 1000 ores
- [ ] Verify "Dig Deeper" button appears

### 5. Diamond Mine Test (treasuresFound condition)  
- [ ] Roll Diamond Mines VC
- [ ] Find 50 treasures
- [ ] Verify "Dig Deeper" button appears

### 6. Ruby Depths Test (totalValue condition)
- [ ] Roll Ruby Depths VC
- [ ] Mine 10000 coins worth of materials
- [ ] Verify "Dig Deeper" button appears

### 7. Mythril Sanctum Test (rareOresFound condition)
- [ ] Roll Mythril Sanctum VC
- [ ] Find 100 rare/epic/legendary ores combined
- [ ] Verify "Dig Deeper" button appears

### 8. Button Interaction Testing
- [ ] Click button while NOT in voice channel - should show error
- [ ] Click button while in voice channel - should work
- [ ] Verify all players are moved to new channel
- [ ] Verify old channel is deleted
- [ ] Verify minecart contents are preserved

### 9. Deeper Mine Verification
- [ ] New channel name includes "[ DEEPER ]"
- [ ] Power level is increased
- [ ] Hazard spawn rate is higher
- [ ] Resources are better quality
- [ ] Shop still works in deeper mine
- [ ] Mining events still trigger

### 10. Edge Cases
- [ ] Multiple people clicking button simultaneously
- [ ] Bot restart while in deeper mine
- [ ] Player disconnects during transition
- [ ] Category is full (can't create new channel)
- [ ] Missing permissions to move members
- [ ] Missing permissions to delete channels

### 11. Database Integrity
- [ ] Stats are saved correctly
- [ ] Deeper mine flag is set
- [ ] Parent mine reference is stored
- [ ] Minecart data is preserved
- [ ] Shop timers are maintained

### 12. Visual/UX Testing
- [ ] Progress bar displays correctly
- [ ] Button styling is appropriate
- [ ] Success messages are clear
- [ ] Error messages are helpful
- [ ] Welcome message in deeper mine is displayed
- [ ] Image fallback works if deep mine image missing

## Performance Testing
- [ ] No significant lag when checking conditions
- [ ] Button response time is acceptable
- [ ] Channel creation/deletion is smooth
- [ ] No memory leaks after extended use
- [ ] Database queries are efficient

## Error Recovery Testing
- [ ] Bot crashes during transition - can recover
- [ ] Database connection lost - handles gracefully
- [ ] Invalid mine configuration - doesn't break
- [ ] Missing deeper mine entry - shows error
- [ ] Circular deeper mine reference - prevented

## Console Monitoring
Check console for these log patterns:
- [ ] `[DEEPER_MINE] Listener initialized and ready`
- [ ] `[DEEPER_MINE] New deeper mine created:`
- [ ] `[DIG_DEEPER] Successfully created deeper mine`
- [ ] No error messages related to deeper mines

## Optional Admin Commands Testing
If implemented:
- [ ] `/miningstats` command shows correct data
- [ ] `/resetminingstats` properly resets stats
- [ ] Commands are admin-only

## Known Issues to Watch For
1. **Button not appearing**: Check typeId is set in database
2. **Stats not tracking**: Verify modifications were applied correctly
3. **Permission errors**: Bot needs Move Members and Manage Channels
4. **Image not found**: Create placeholder images or use fallback
5. **Multiple instances**: Prevent duplicate button clicks

## Rollback Plan
If issues occur:
1. Restore original `gachaServers.json`
2. Remove deeper mine modifications from mining script
3. Remove bot initialization code
4. Delete created deeper mine channels manually
5. Clear `miningStats` from database if needed

## Success Criteria
- [ ] All mine types can access deeper levels
- [ ] Conditions are tracked accurately
- [ ] Transitions are smooth and reliable
- [ ] No data loss during transitions
- [ ] Players understand the feature
- [ ] No performance degradation

## Notes for Specific Mines

### Special Cases
- **Adamantite Abyss**: Links to "Abyssal Adamantite Depths" (id: 18)
- **Fossil Excavation**: Requires tracking fossil-specific items
- **Power 10 Mines**: Already at max power, no deeper levels

### Condition Scaling Suggestions
Adjust `conditionCost` in `gachaServers.json` based on play testing:
- Too easy? Increase by 50-100%
- Too hard? Decrease by 25-50%
- Consider average session length
- Balance between mines of same tier

## Documentation Updates
- [ ] Update player guide with deeper mines info
- [ ] Add to feature list
- [ ] Document admin commands
- [ ] Create troubleshooting guide
- [ ] Update changelog

## Sign-off
- [ ] Feature tested by: ________________
- [ ] Date: ________________
- [ ] Version: ________________
- [ ] Approved for production: Yes / No
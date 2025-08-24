# Voice Tracking Integration for Unique Items

## Overview
The voice tracking system now automatically updates unique item maintenance tracking when users spend time in voice channels.

## How It Works

### 1. Main Voice Tracking (`statTracking.js`)
- Tracks all voice sessions for general statistics
- When voice time is updated, it automatically updates unique items tracking
- Converts seconds to minutes for unique items (since maintenance requires minutes)

### 2. Unique Items Integration (`uniqueItemMaintenance.js`)
- Receives voice minute updates from the main tracking system
- Updates `voiceMinutesThisCycle` for all unique items owned by the user
- Used for voice activity maintenance requirements

## Implementation in Your Bot

### Initialize the System
```javascript
// In your main bot file (e.g., index.js or bot.js)
const StatTracker = require('./patterns/statTracking');
const statTracker = new StatTracker();

// On bot ready
client.on('ready', async () => {
    // Initialize stat tracking
    await statTracker.initialize();
    
    // Start periodic updates for active voice sessions
    // This updates voice time every 5 minutes for users still in voice
    statTracker.startPeriodicUpdates(5); // Update every 5 minutes
    
    console.log('Voice tracking initialized with unique items integration');
});
```

### Track Voice State Updates
```javascript
// Voice state update handler
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = newState.member.user.id;
    const username = newState.member.user.username;
    const guildId = newState.guild.id;
    const guildName = newState.guild.name;

    // User joined a voice channel
    if (!oldState.channel && newState.channel) {
        await statTracker.startVoiceSession(
            userId,
            newState.channel.id,
            guildId,
            username,
            newState.channel.name,
            guildName
        );
    }
    
    // User left a voice channel
    else if (oldState.channel && !newState.channel) {
        const duration = await statTracker.endVoiceSession(userId);
        // Duration is automatically converted to minutes and updated for unique items
    }
    
    // User switched channels (handle as leave + join)
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        await statTracker.endVoiceSession(userId);
        await statTracker.startVoiceSession(
            userId,
            newState.channel.id,
            guildId,
            username,
            newState.channel.name,
            guildName
        );
    }
});
```

### Graceful Shutdown
```javascript
// Handle bot shutdown gracefully
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    
    // Stop periodic updates
    statTracker.stopPeriodicUpdates();
    
    // End all active voice sessions
    for (const [userId] of statTracker.voiceSessions) {
        await statTracker.endVoiceSession(userId);
    }
    
    process.exit(0);
});
```

## Features

### Automatic Voice Tracking for Unique Items
- Voice time is automatically tracked in minutes
- Updates happen when users leave voice or during periodic updates
- Crash-resistant: recovers active sessions on bot restart

### Periodic Updates (Every 5 Minutes)
- Updates voice time for users still in channels
- Ensures unique items get credit even during long voice sessions
- Prevents loss of tracking data if bot crashes

### Activity Types Supported
The system tracks these activities for unique items:
- **voice**: Minutes spent in voice channels (automatic)
- **mining**: Blocks mined (call `updateActivityTracking(userId, 'mining', blocks)`)
- **combat**: Combat wins (call `updateActivityTracking(userId, 'combat', 1)`)
- **social**: Social interactions (call `updateActivityTracking(userId, 'social', 1)`)
- **movement**: Tiles moved in mining (call `updateActivityTracking(userId, 'movement', tiles)`)

## Testing

### Check Voice Tracking
```javascript
// Command to check voice stats
if (command === 'voicestats') {
    const stats = await statTracker.getUserStats(userId, guildId);
    console.log(`Total voice hours: ${stats.totalVoiceHours}`);
}
```

### Check Unique Item Maintenance
```javascript
// Command to check maintenance status
const { checkMaintenanceStatus } = require('./patterns/uniqueItemMaintenance');

if (command === 'maintenance') {
    const statuses = await checkMaintenanceStatus(userId);
    for (const status of statuses) {
        if (status.maintenanceType === 'voice_activity') {
            console.log(`${status.name}: ${status.activityProgress.voice}/${status.maintenanceCost} minutes`);
        }
    }
}
```

## Troubleshooting

### Voice Time Not Updating
1. Check that `startPeriodicUpdates()` is called on bot startup
2. Verify MongoDB connection is active
3. Check console logs for error messages

### Unique Items Not Getting Voice Credit
1. Ensure the unique item has `requiresMaintenance: true` in the data sheet
2. Check that the maintenance type includes voice activity
3. Verify the user owns the unique item

### Recovery After Crash
The system automatically:
1. Recovers active voice sessions from database
2. Calculates time since last update
3. Credits users for time spent while bot was down

## Performance Considerations
- Periodic updates run every 5 minutes by default
- Each update queries active sessions and updates incrementally
- Unique items updates are wrapped in try-catch to prevent main tracking failures
- Database operations are optimized with proper indexing

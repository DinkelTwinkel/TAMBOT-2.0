# Inn Upgrade System Integration Guide

## Overview
The Inn Upgrade System allows players to expand their inns when reputation reaches 10 or above. This guide shows how to integrate the `innUpgradeListener.js` into your main bot.

## Integration Steps

### Step 1: Add to Main Bot File
In your main bot file (e.g., `index.js`), add this to your imports:

```javascript
const InnUpgradeListener = require('./patterns/innUpgradeListener');
```

### Step 2: Initialize in Ready Event
In your `client.on('ready')` event, add:

```javascript
client.on('ready', () => {
    console.log(`${client.user.tag} is online!`);
    
    // ... your other initialization code ...
    
    // Initialize the Inn Upgrade listener
    const innUpgradeListener = new InnUpgradeListener(client);
    console.log('[INN_UPGRADE] Listener initialized and ready');
    
    // Store reference for potential cleanup or debugging
    client.innUpgradeListener = innUpgradeListener;
    
    // ... rest of your ready event code ...
});
```

## How It Works

### Button Behavior
- **Red Button**: Appears when reputation < 10, shows error when clicked
- **Green Button**: Appears when reputation ≥ 10, allows expansion when clicked

### Expansion Process
1. Player clicks green expansion button
2. System checks reputation ≥ 10
3. Inn dimensions increase by +1 width and +1 height
4. Customer capacity recalculated (60% of new floor tiles)
5. Reputation resets to 5
6. Expansion confirmation sent

### Example Expansion
```
Miner's Inn: 10×7 → 11×8
- Floor tiles: 27 → 35
- Max customers: 16 → 21
- Reputation: 15 → 5
```

## Features
- ✅ Reputation-gated expansion (requires 10+ reputation)
- ✅ Dynamic inn sizing based on expansion level
- ✅ Customer capacity scales with inn size
- ✅ Break positioning shows players seated at tables
- ✅ Work log integration for break events
- ✅ Overnight customer wealth refresh system

## Files Modified
- `patterns/gachaModes/innKeeper_v4.js` - Added expansion button to work log
- `patterns/innUpgradeListener.js` - Global button listener
- `data/gachaServers.json` - Added `innDimensions` to inn configurations
- `patterns/gachaModes/imageProcessing/inn-layered-render.js` - Dynamic sizing support
- `patterns/gachaModes/innKeeping/customerManager.js` - Customer management system

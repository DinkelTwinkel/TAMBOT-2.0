# AI Dialogue System for Inn-Keeping Game

## Overview
This system generates dynamic, contextual dialogue for NPCs and players in your inn-keeping game using OpenAI's GPT API.

## Files Created/Modified

### New Files
- **`aiDialogueGenerator.js`** - Core AI dialogue generation module
- **`usageExamples.js`** - Complete usage examples and integration patterns  
- **`testAIDialogue.js`** - Test script to verify everything works
- **`AI_DIALOGUE_README.md`** - This documentation file

### Modified Files
- **`innSalesLog.js`** - Updated to use AI dialogue when available
- **`.env`** - Added OpenAI configuration options

## Installation

1. Install the OpenAI package:
```bash
cd "D:\CODE\TAMBOT 2.0"
npm install openai
```

2. Your `.env` file already has the OpenAI API key configured ✅

## Testing

Run the test script to verify everything works:
```bash
cd "D:\CODE\TAMBOT 2.0\patterns\gachaModes\innKeeping"
node testAIDialogue.js
```

## Features

### 🎭 Dynamic NPC Dialogue
- Each NPC generates unique dialogue based on:
  - Their personality and description
  - Budget level (low/medium/high)
  - Tipping behavior
  - Current mood
  - Time of day and weather
  - Recent events in the game world

### 👤 Player Dialogue
- Generates natural customer comments based on:
  - Player username
  - Item being purchased
  - Previous purchase history
  - Discord role (if available)

### 🎉 Special Event Dialogue
- **Rush Hour**: Hurried customers during busy times
- **Big Tipper**: Generous customers leaving large tips
- **Celebrations**: Happy customers celebrating events
- **Complaints**: Grumpy customers with issues

### 🌍 Dynamic World Context
- Weather changes affect dialogue
- Time of day influences customer behavior
- Recent events are referenced in conversations
- Seasonal changes update inn atmosphere

## Usage Examples

### Basic NPC Purchase
```javascript
// The AI dialogue is automatically generated when you update the sales log
await InnSalesLog.updateWithNPCPurchase(channel, dbEntry, npcSale);
```

### Player Purchase
```javascript
// AI dialogue for players is also automatic
await InnSalesLog.updateWithLatestPurchase(channel, dbEntry, itemId, buyer);
```

### Special Events
```javascript
// Generate event-specific dialogue
const dialogue = await InnSalesLog.generateEventDialogue('celebration', {
    occasion: "finding rare ore"
});
```

### Update World Context
```javascript
// Add recent events that NPCs will reference
InnSalesLog.aiDialogue.addRecentEvent("A dragon was spotted near the mines!");

// Update inn details
InnSalesLog.aiDialogue.updateInnDetails({
    currentWeather: "snowy",
    atmosphere: "Warm and festive for the winter festival"
});
```

## Customization

### Inn Details
Edit `aiDialogueGenerator.js` constructor to customize:
- Inn name and location
- Menu specialties
- Local events and rumors
- Atmosphere descriptions

### API Settings
In `.env` file:
- `OPENAI_MODEL`: Use "gpt-4" for better quality (higher cost)
- `OPENAI_MAX_TOKENS`: Adjust dialogue length (default: 60)
- `OPENAI_TEMPERATURE`: 0-1, higher = more creative (default: 0.9)

## Cost Management

### API Usage
- GPT-3.5-turbo: ~$0.002 per 1K tokens
- Each dialogue: ~100-200 tokens total
- Estimated: ~$0.0002-0.0004 per dialogue

### Built-in Fallbacks
- If API fails, uses existing dialogue arrays
- If no API key, uses original behavior
- Graceful degradation ensures game always works

## Troubleshooting

### AI Dialogue Not Working?
1. Check API key is valid in `.env`
2. Ensure `npm install openai` was run
3. Run test script: `node testAIDialogue.js`
4. Check console for error messages

### Dialogue Too Generic?
- Increase `OPENAI_TEMPERATURE` in `.env`
- Use GPT-4 model for better quality
- Add more specific events and context

### API Costs Too High?
- Implement usage limits (see `usageExamples.js`)
- Use AI only for important NPCs
- Cache common dialogues

## Example Output

**Gruff McGrufferson** (tired miner, low budget):
> "Blast this rain! At least the stew's hot enough to warm these old bones after that cave-in on level 3."

**Lady Goldworth** (wealthy, high budget):
> "The evening fog adds such... character to this establishment. Your finest vintage, if you would."

**Player "DragonSlayer99"**:
> "After battling goblins all day, this ale is exactly what I needed!"

## Future Enhancements

- [ ] Memory system for regular customers
- [ ] Dialogue chains for conversations
- [ ] Faction-specific dialogue
- [ ] Quest-related dialogue hints
- [ ] Multi-language support
- [ ] Voice-specific personality traits

## Support

If you need help:
1. Check the test output: `node testAIDialogue.js`
2. Review `usageExamples.js` for integration patterns
3. Ensure your OpenAI API key has credits
4. Check the console logs for specific errors

The system is designed to fail gracefully - even if AI is unavailable, your game will continue working with fallback dialogue!
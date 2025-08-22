# AI Shop Dialogue System

## Overview
This system adds AI-powered dialogue generation to your mining game shops, complete with named shopkeepers, unique personalities, and a 5% chance to mention the legendary "One Pick".

## What's Been Added

### 📁 **New Files:**
1. **`aiShopDialogueGenerator.js`** - Core AI shop dialogue module
2. **`testShopAI.js`** - Test script to verify shop AI works
3. **`shopHandlerExample.js`** - Examples of integrating with buy/sell handlers
4. **`SHOP_AI_README.md`** - This documentation

### 🔧 **Modified Files:**
1. **`shops.json`** - Added shopkeeper names, bios, and personalities to all 13 shops
2. **`generateShop.js`** - Integrated AI dialogue generation with fallbacks

## Features

### 🎭 **Named Shopkeepers**
Each shop now has a unique shopkeeper with:
- **Name**: Like "Grimsby Coalhand" or "Lady Crystalline Devere"
- **Bio**: Backstory explaining who they are
- **Personality**: Traits that influence their dialogue style

### Examples:
- **Grimsby Coalhand** (Coal Mine): Gruff veteran miner with 7 fingers
- **Lady Crystalline Devere** (Diamond Mine): Ruthless aristocrat with dark secrets
- **The Voidkeeper** (Adamantite Abyss): Mysterious entity from the depths
- **Big Martha Brewstone** (Miner's Inn): Tough but maternal tavern owner

### 💬 **Dynamic AI Dialogue**
- Shopkeepers generate unique dialogue based on:
  - Their personality and backstory
  - Time of day (morning/evening/night shifts)
  - Current "weather" in the mines
  - Recent events in the game world
  - Shop type and specialty

### ⛏️ **The One Pick Legend**
- **5% chance** for any shopkeeper to mention "The One Pick"
- Each shopkeeper has their own opinion:
  - **Believers**: Think it's real and powerful
  - **Skeptics**: Dismiss it as fairy tales
  - **Mysterious**: Know more than they let on
  - **Reverent**: Treat it as sacred/dangerous

### Example One Pick Mentions:
> "The One Pick? Bah! Just tales to keep apprentices dreaming instead of working."

> "The crystals show visions... a pickaxe that unmakes and remakes..."

> "Those who seek The One Pick rarely return to tell what they found..."

## Installation

The system is already integrated! Just make sure:
```bash
cd "D:\CODE\TAMBOT 2.0"
npm install openai  # If not already installed
```

## Testing

Run the test to see it in action:
```bash
cd patterns
node testShopAI.js
```

This will show:
- Different shopkeeper personalities
- AI-generated idle dialogue
- Purchase/sell responses
- The One Pick mentions
- Dynamic event reactions

## How It Works

### In Shop Generation
When `generateShop.js` creates a shop, it now:
1. Checks if AI is available
2. Generates contextual dialogue for the shopkeeper
3. Has a 5% chance to mention The One Pick
4. Falls back to original dialogue if AI fails
5. Shows the shopkeeper's name in the embed title
6. Adds their bio as an embed field

### In Buy/Sell Interactions
You can use the exported functions:
```javascript
const generateShop = require('./generateShop');

// When someone buys
const dialogue = await generateShop.generatePurchaseDialogue(shop, item, price, buyer);

// When someone sells
const dialogue = await generateShop.generateSellDialogue(shop, item, price);

// When someone is too poor
const dialogue = await generateShop.generatePoorDialogue(shop, item, shortBy);
```

## Shopkeeper Reference

| Shop | Shopkeeper | Personality | One Pick Stance |
|------|------------|-------------|-----------------|
| Coal Mine | Grimsby Coalhand | Gruff, practical | Skeptic |
| Topaz Mine | Aurelius Goldgleam | Optimistic, flamboyant | Believer |
| Diamond Mine | Lady Crystalline Devere | Ruthless, calculating | Skeptic |
| Emerald Cavern | Verdania Mosswhisper | Mystical, unhinged | Believer |
| Ruby Depths | Ignis Burnbrand | Hot-tempered, passionate | Reverent |
| Obsidian Forge | Shadowblade Vex | Brooding, philosophical | Mysterious |
| Mythril Sanctum | High Keeper Celestius | Pretentious, ethereal | Reverent |
| Adamantite Abyss | The Voidkeeper | Alien, cryptic | Mysterious |
| Copper Quarry | Chuck McGillian | Practical, friendly | Skeptic |
| Iron Stronghold | General Magnus | Disciplined, honorable | Skeptic |
| Crystal Grotto | Prisma the Seer | Dramatic, psychic | Believer |
| Fossil Museum | Prof. Ptolemy Dustborn | Academic, absent-minded | Skeptic |
| Miner's Inn | Big Martha Brewstone | Warm but tough | Variable |

## Customization

### Add World Events
```javascript
const aiDialogue = generateShop.getAIShopDialogue();
aiDialogue.addRecentEvent("Earthquake in the lower mines!");
```

### Change Context
```javascript
aiDialogue.updateWorldContext({
    currentWeather: "toxic gas leak",
    atmosphere: "evacuating miners"
});
```

### Force The One Pick Mention
```javascript
// Temporarily increase chance for special events
const originalRandom = Math.random;
Math.random = () => 0.01; // Force mention
// Generate dialogue
Math.random = originalRandom; // Restore
```

## The One Pick Lore

The mythical pickaxe appears in dialogue as:
- **Description**: "A mythical pickaxe wielded by the legendary Miner King"
- **Powers**: "Could crack through any material, even reality itself"
- **Location**: "Lost to time, hidden in depths no living soul has reached"
- **The Miner King**: Mysterious figure who transcended mortality

Different shopkeepers have different theories:
- Some think it's just marketing
- Others believe it's real but dangerous
- A few claim to have seen signs of it
- The deepest shopkeepers speak of it with fear/reverence

## Example Output

**Morning at the Coal Mine:**
> Grimsby Coalhand: "Another morning shift, another day of honest work - at least the coal doesn't talk back like these young miners."

**Evening at the Diamond Shop (with One Pick mention):**
> Lady Crystalline: "These diamonds are flawless, unlike the fairy tale of The One Pick that desperate miners cling to."

**Purchase at the Inn:**
> Big Martha: "That'll keep you warm in the tunnels, dearie - eat up before it gets cold!"

**Too Poor at the Abyss:**
> The Voidkeeper: "The void does not extend credit to those who cannot pay its price..."

## Performance

- Each dialogue generation costs ~$0.0003-0.0005
- Automatic fallbacks ensure shops work without API
- Responses cached in memory during runtime
- Fast generation (~1-2 seconds per dialogue)

## Troubleshooting

### Dialogue Not Generating?
1. Check `OPENAI_API_KEY` in `.env`
2. Run `node testShopAI.js` to test
3. Check console for error messages

### Want More One Pick Mentions?
- Edit the chance in `aiShopDialogueGenerator.js`
- Change `Math.random() < 0.05` to higher value
- Or trigger special events that force mentions

### Shopkeeper Too Generic?
- Increase temperature in `.env`
- Add more specific events to world context
- Enhance personality descriptions in `shops.json`

## Future Enhancements

- [ ] Shopkeeper relationships (rivalries, friendships)
- [ ] Memory of previous customers
- [ ] Dynamic pricing based on dialogue
- [ ] Quest hints in dialogue
- [ ] Seasonal personality changes
- [ ] Shop-specific events and sales

## Integration Complete! ✅

Your shops now have:
- **13 unique named shopkeepers** with personalities
- **AI-generated contextual dialogue**
- **5% chance for The One Pick lore**
- **Dynamic responses** to purchases/sales
- **Fallback system** ensuring reliability

The mining world feels more alive with shopkeepers who remember the legends, comment on the weather, and treat each customer according to their unique personality!
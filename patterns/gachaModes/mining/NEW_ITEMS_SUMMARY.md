# New Mining Equipment & Shop Updates

## ✅ **Items Added to itemSheet.json**

### 🔍 **Sight Equipment** (Increases vision range in mines)
- **ID 28**: Miner's Headlamp (+2 sight) - 45 coins
- **ID 29**: Crystal Lens Goggles (+4 sight) - 120 coins  
- **ID 30**: Eagle Eye Visor (+6 sight) - 350 coins
- **ID 31**: Oracle's Third Eye (+8 sight) - 800 coins

### 🍀 **Luck Equipment** (Increases chance for bonus items)
- **ID 32**: Lucky Charm Necklace (+1 luck) - 35 coins
- **ID 33**: Rabbit's Foot Keychain (+3 luck) - 85 coins
- **ID 34**: Four-Leaf Clover Pin (+5 luck) - 200 coins
- **ID 35**: Fortune's Blessing Ring (+7 luck) - 500 coins
- **ID 36**: Probability Manipulator (+10 luck) - 1,200 coins

### ⚡ **Speed Equipment** (Increases actions per mining cycle)
- **ID 37**: Swift Mining Boots (+1 speed) - 40 coins
- **ID 38**: Hermes' Sandals (+3 speed) - 150 coins
- **ID 39**: Lightning Runner Gear (+5 speed) - 300 coins
- **ID 40**: Time Dilation Device (+7 speed) - 750 coins
- **ID 41**: Quantum Tunneling Kit (+10 speed) - 1,500 coins

### 🧪 **Consumables** (Temporary stat boosts)
- **ID 42**: Energy Drink (+2 speed, 60s) - 15 coins
- **ID 43**: Luck Potion (+3 luck, 90s) - 25 coins
- **ID 44**: Vision Elixir (+3 sight, 75s) - 20 coins

### ⛏️ **Multi-Stat Pickaxes** (Combined abilities)
- **ID 45**: Miner's Multi-Tool (+6 mining, +2 speed) - 400 coins
- **ID 46**: Prospector's Dream Pickaxe (+8 mining, +4 luck, +2 sight) - 900 coins

### 💎 **New Ore**
- **ID 27**: Adamantite Ore (300 value) - Ultimate mining material

## ✅ **Shop Updates (shops.json)**

### Coal Mine Trading Desk (Shop 1)
- **Rotation increased**: 2 → 3 items
- **New items added**: Miner's Headlamp, Lucky Charm, Swift Boots, Energy Drink, Vision Elixir
- **Focus**: Basic sight/luck/speed gear for beginners

### Topaz Mine Trading Desk (Shop 2)  
- **Rotation increased**: 3 → 4 items
- **New items added**: Crystal Goggles, Rabbit's Foot, Four-Leaf Clover, Hermes' Sandals, Lightning Gear, Luck Potion, Multi-Tool
- **Focus**: Mid-tier equipment for serious miners

### Diamond Mine Trading Shop (Shop 3)
- **Rotation increased**: 3 → 4 items  
- **New items added**: Eagle Eye Visor, Oracle's Third Eye, Fortune's Ring, Probability Manipulator, Time Device, Quantum Kit, Prospector's Dream, Adamantite Ore
- **Focus**: Legendary end-game equipment

## ✅ **generateShopImage.js Enhancements**

### Image Fallback System
- **Smart fallback**: When item image files are missing, shows item name instead
- **Warning logging**: Console warns when images aren't found
- **Styled placeholders**: Gray background with white text, auto-sizing font
- **Word wrapping**: Long item names automatically wrap to multiple lines
- **Consistent sizing**: Placeholder boxes scale with shop display settings

## 🎮 **How Stats Work in Mining**

### 🔍 **Sight** 
- **Effect**: Increases team visibility radius
- **Formula**: `teamSightRadius = Math.floor(totalSight / playerCount) + 1`
- **Benefit**: See more ore veins, better pathfinding

### 🍀 **Luck**
- **Effect**: Bonus chance for extra items when mining
- **Formula**: `bonusChance = Math.min(0.6, luckStat * 0.08)`
- **Benefit**: Up to 60% chance for 1-3 bonus items

### ⚡ **Speed**
- **Effect**: Multiple actions per mining cycle
- **Formula**: `numActions = Math.floor(Math.random() * speedStat) + 1`
- **Limit**: Max 4 actions per cycle (MAX_SPEED_ACTIONS)
- **Benefit**: Mine faster, move more, find more items

## 📊 **Stat Balance**

| Tier | Sight | Luck | Speed | Price Range |
|------|-------|------|-------|-------------|
| Basic | 1-2 | 1-3 | 1-2 | 15-85 coins |
| Mid | 3-4 | 3-5 | 3-5 | 120-300 coins |
| High | 6-8 | 7-10 | 7-10 | 500-1,500 coins |

## 🛠️ **Deployment Notes**

1. **Backward Compatible**: All existing functionality preserved
2. **Automatic Integration**: New items will appear in shop rotations immediately
3. **Image Assets**: Place item images in `./assets/items/` folder
4. **Missing Images**: System gracefully handles missing image files
5. **Shop Balance**: Price fluctuations still apply to all new items

## 🎯 **Player Progression Path**

### Early Game (Coal Mine)
- Start with basic headlamp, charm, boots
- Learn the value of each stat type
- Build up currency for better gear

### Mid Game (Topaz Mine)  
- Upgrade to crystal goggles, rabbit's foot
- Try consumables for temporary boosts
- Experiment with multi-stat tools

### End Game (Diamond Mine)
- Acquire legendary sight/luck/speed gear
- Use Prospector's Dream pickaxe for ultimate mining
- Push the limits with quantum technology

The new equipment creates clear progression paths while giving players meaningful choices about which stats to prioritize for their mining strategy!

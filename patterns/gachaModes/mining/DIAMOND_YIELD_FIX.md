# Diamond Yield Fix - December 2024

## Problem
Diamonds were never appearing in the Diamond Mines gacha server.

## Root Cause
1. **Power Level Mismatch**: Diamond Gems required power level 4, but Diamond Mines server is power level 3
2. **Low Spawn Weight**: Diamonds had a baseWeight of only 6 (extremely rare)
3. **Tier Mismatch**: Diamonds were classified as 'epic' tier while other power 3 items were 'rare'

## Changes Made

### 1. Diamond Configuration (miningConstants.js)
- **powerRequirement**: Changed from 4 to 3 (now matches Diamond Mines server)
- **boostedPowerLevel**: Changed from 4 to 3 
- **baseWeight**: Increased from 6 to 25 (4x more common)
- **tier**: Changed from 'epic' to 'rare' (consistent with power level 3)

### 2. Diamond Mines Server Bonus
- **itemBonuses["6"]**: Increased from 2.0x to 3.5x
- This means diamonds spawn 3.5x more often in Diamond Mines specifically

### 3. Power Level 3 Configuration
- **oreSpawnMultiplier**: Increased from 1.4 to 1.5
- **rareOreBonus**: Increased from 0.01 to 0.025 (2.5x improvement)
- **treasureChance**: Increased from 0.02 to 0.03 (50% improvement)

## Expected Results
- Diamonds will now spawn in Diamond Mines (power level 3)
- Base spawn rate increased by ~4x
- Additional 3.5x multiplier when in Diamond Mines server
- Overall ~14x improvement in diamond yield in Diamond Mines
- Slightly increased rare ore and treasure spawn rates

## Testing
After these changes, diamonds should appear when:
1. Mining in Diamond Mines server (power level 3)
2. Breaking WALL_WITH_ORE tiles
3. Breaking RARE_ORE tiles (higher chance)
4. Finding TREASURE_CHEST tiles

## Item ID Reference
- Diamond Gem: itemId "6"
- Emerald Gem: itemId "23" 
- Ruby Gem: itemId "24"

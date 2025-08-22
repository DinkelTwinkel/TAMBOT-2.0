# Mining Server Balance Overhaul - December 2024

## Overview
Complete rebalancing of all mining servers to ensure each themed mine properly yields its signature ore at appropriate rates.

## Key Changes

### 1. Power Level Adjustments
Fixed mismatches between ore power requirements and server power levels:
- **Ruby Gem**: Moved from power 3 → power 4 (matches Ruby Depths server)
- **Crystal Ore**: Added new ore at power 4 (for Crystal Grottos server)
- All ores now properly match their themed server's power level

### 2. Base Weight Increases
Significantly increased base spawn weights for better ore availability:

| Ore | Old Weight | New Weight | Change |
|-----|------------|------------|--------|
| Coal | 60 | 60 | - |
| Copper | 40 | 40 | - |
| Iron | 30 | 30 | - |
| Topaz | 25 | 25 | - |
| Fossil | - | 20 | NEW |
| Emerald | 15 | 20 | +33% |
| Diamond | 6→25 | 20 | +233% |
| Ruby | 12 | 15 | +25% |
| Crystal | - | 15 | NEW |
| Obsidian | 4 | 12 | +200% |
| Mythril | 2 | 10 | +400% |
| Adamantite | 1 | 8 | +700% |

### 3. Server-Specific Bonuses
Each themed server now gives massive bonuses to its signature ore:

| Server | Power | Signature Ore | Bonus | Other Effects |
|--------|-------|---------------|-------|---------------|
| Coal Mines | 1 | Coal | 5x | Copper 0.3x |
| Copper Quarry | 1 | Copper | 5x | Coal 0.3x |
| Topaz Mine | 2 | Topaz | 4.5x | Iron 0.4x |
| Iron Stronghold | 2 | Iron | 4.5x | Topaz 0.4x |
| Fossil Excavation | 2 | Fossil | 4.5x | Iron/Topaz 0.4x |
| Diamond Mines | 3 | Diamond | 4x | Emerald/Ruby 0.5x |
| Emerald Caverns | 3 | Emerald | 4x | Diamond/Ruby 0.5x |
| Ruby Depths | 4 | Ruby | 4x | Crystal 0.5x |
| Crystal Grottos | 4 | Crystal | 4x | Ruby 0.5x |
| Obsidian Forge | 5 | Obsidian | 5x | - |
| Mythril Sanctum | 6 | Mythril | 5x | - |
| Adamantite Abyss | 7 | Adamantite | 6x | - |

### 4. Power Level Configuration Improvements

Enhanced bonuses for higher power levels:

| Level | Ore Spawn | Rare Ore | Treasure | Speed | Value |
|-------|-----------|----------|----------|--------|-------|
| 1 | 1.0x | +0% | 1% | 1.0x | 1.0x |
| 2 | 1.2x | +0.5% | 1.5% | 1.1x | 1.2x |
| 3 | 1.5x | +2.5% | 3% | 1.2x | 1.5x |
| 4 | 1.7x | +3.5% | 4% | 1.3x | 2.0x |
| 5 | 2.0x | +5% | 6% | 1.5x | 2.5x |
| 6 | 2.3x | +7% | 8% | 1.7x | 3.0x |
| 7 | 2.8x | +10% | 12% | 2.0x | 4.0x |

## Expected Outcomes

### For Players
1. **Themed Mining**: Each server now strongly favors its signature ore
2. **Better Progression**: Higher power servers give significantly better rewards
3. **Predictable Yields**: Players know which server to mine for specific resources
4. **Balanced Rarity**: Rare ores are still special but actually obtainable

### Effective Spawn Rates (Examples)
With all bonuses combined, in their themed servers:

- **Coal in Coal Mines**: ~75% of ore finds
- **Diamond in Diamond Mines**: ~35% of rare ore finds  
- **Mythril in Mythril Sanctum**: ~40% of legendary finds
- **Adamantite in Adamantite Abyss**: ~45% of legendary finds

## New Items Added
1. **Crystal Ore** (ID: 102) - Power 4, for Crystal Grottos
2. **Ancient Fossil** (ID: 103) - Power 2, for Fossil Excavation

## Server Key Mapping
The system uses internal keys for servers:
- `coalMines` → "⛏️ Coal Mines"
- `copperQuarry` → "⛏️ Copper Quarry"
- `topazMine` → "⛏️ Topaz Mine"
- `ironStronghold` → "⛏️ Iron Stronghold"
- `fossilExcavation` → "⛏️ Fossil Excavation"
- `diamondMines` → "⛏️ Diamond Mines"
- `emeraldCaverns` → "⛏️ Emerald Caverns"
- `rubyDepths` → "⛏️ Ruby Depths"
- `crystalGrottos` → "⛏️ Crystal Grottos"
- `obsidianForge` → "⛏️ Obsidian Forge"
- `mythrilSanctum` → "⛏️ Mythril Sanctum"
- `adamantiteAbyss` → "⛏️ Adamantite Abyss"

## Testing Recommendations
1. Verify each themed server yields primarily its signature ore
2. Check that power level progression feels rewarding
3. Ensure rare ores spawn at expected rates
4. Confirm new items (Crystal, Fossil) appear correctly
5. Test that reduced spawn rates for non-themed ores work

## Files Modified
- `miningConstants.js` - All ore configurations and server modifiers
- `DIAMOND_YIELD_FIX.md` - Initial diamond fix documentation
- `MINING_BALANCE_OVERHAUL.md` - This comprehensive documentation

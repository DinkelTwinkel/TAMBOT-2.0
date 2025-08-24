# Mine Image Generation Scripts

## Overview
This directory contains scripts to generate all the mine-themed images for TAMBOT 2.0's mining game mode.

## Files

### `generateAllMines.js`
The main generation module that creates all mine images including:
- **Base Mines**: coal, copper, topaz, iron, diamond, emerald, ruby, crystal, obsidian, mythril, adamantite, fossil
- **Deep Variations**: Enhanced versions with glow effects (e.g., coalMineDeep, topazMineDeep)
- **Ultra Variations**: Ultimate versions with special effects (e.g., coalMineUltra, topazMineUltra)
- **Special Mines**: Unique themed mines (gluttonyMine, rustyRelicMine, abyssalAdamantiteMine)

### `generateMissingImages.js`
Original script for generating base mine images (already complete).

## What Gets Generated

For each mine theme, the following images are created:

### Tiles (64x64 or 64x90 pixels):
- `floor` - 3 variations of floor tiles
- `wall` - 3 variations of wall tiles (taller for perspective)
- `entrance` - Special entrance/exit tile
- `wallOre` - 3 variations of walls with ore veins
- `rareOre` - 3 variations of walls with rare crystals
- `wallReinforced` - 3 variations of reinforced/metal walls

### Encounters (64x64 pixels):
- `portal_trap` - Teleportation hazard
- `bomb_trap` - Explosive hazard
- `toxic_fog` / `green_fog` - Poisonous gas hazard
- `wall_trap` - Pressure plate hazard
- `treasure_chest` - Standard treasure
- `rare_treasure` - Enhanced treasure

## Special Effects by Theme Level

### Base Mines
Standard pixel art style with theme-appropriate colors.

### Deep Mines (Level 2)
- Glow effects on ore veins
- Enhanced lighting
- More vibrant colors
- Energy patterns

### Ultra Mines (Level 3)
- `voidEffect` - Dark void particles and distortion
- `cosmicEffect` - Star fields and cosmic energy
- `lavaEffect` - Molten lava glow and heat waves
- `electricEffect` - Lightning bolts and sparks
- `lifeEffect` - Organic growth patterns
- `magneticEffect` - Magnetic field distortions
- `prismEffect` - Rainbow light refraction
- `infinityEffect` - Endless reflections
- `ancientEffect` - Time-worn textures
- `digestiveEffect` - Organic, pulsing textures
- `rustEffect` - Corroded metal patterns
- `abyssalEffect` - Deep void corruption

## Current Status

✅ **Already Generated:**
- All base mine tiles and encounters

❌ **Missing (will be generated):**
- All Deep variations (*MineDeep)
- All Ultra variations (*MineUltra)
- Special mines (gluttony, rusty relic, abyssal adamantite)

## Usage

From the TAMBOT 2.0 root directory, run:

```bash
# Using Node directly
node generateMineImages.js

# Or using the batch file (Windows)
generate-mine-images.bat
```

## Requirements

- Node.js
- `canvas` npm package (`npm install canvas`)
- Write permissions to `./assets/game/tiles/` and `./assets/game/encounters/`

## Image Naming Convention

Images follow this pattern:
```
{themeName}_{tileType}[_{variation}].png
```

Examples:
- `coalMine_floor.png` - Base coal mine floor (variation 1)
- `coalMine_floor_2.png` - Coal mine floor variation 2
- `coalMineDeep_wall.png` - Deep coal mine wall
- `diamondMineUltra_rareOre_3.png` - Ultra diamond mine rare ore variation 3

## Color Schemes

Each mine level has progressively more intense color schemes:

| Mine Type | Base | Deep | Ultra |
|-----------|------|------|-------|
| Coal | Dark gray | Darker with silver glow | Pure black with void |
| Topaz | Golden orange | Bright orange with glow | Solar yellow |
| Diamond | Light blue | White-blue | Pure white prism |
| Emerald | Green | Deep green glow | Bright green life |
| Ruby | Red-pink | Deep red | Volcanic red |
| Crystal | Pink-purple | Magenta | Pure magenta infinity |
| Obsidian | Dark slate | Navy-black | Void black |
| Mythril | Royal blue | Sky blue | Cosmic blue |
| Copper | Brown-orange | Copper glow | Electric orange |
| Iron | Gray | Dark gray | Black iron magnetic |
| Fossil | Tan-brown | Dark brown | Ancient brown |

## Notes

- Images are procedurally generated with pixel art style
- Each variation adds unique patterns (bricks, stones, rough texture)
- Special effects are theme-appropriate (void, lava, cosmic, etc.)
- All images maintain consistent sizing for game compatibility

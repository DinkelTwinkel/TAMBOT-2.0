# Mining Image Generation System

## Overview
The mining game now includes an automatic image generation system that creates missing tile and encounter images programmatically. When an image is not found, the system will:
1. Generate it programmatically based on the theme colors
2. Save it to the correct location
3. Use the saved version from then on

This ensures that the game always has images to display and only needs to generate them once.

## Directory Structure
```
./assets/game/
├── tiles/           # Tile images (floors, walls, ores, etc.)
│   ├── coalMine_floor.png
│   ├── coalMine_floor_2.png
│   ├── coalMine_floor_3.png
│   ├── coalMine_wall.png
│   └── ...
└── encounters/      # Encounter images (hazards, treasures)
    ├── coalMine_portal_trap.png
    ├── coalMine_treasure_chest.png
    └── ...
```

## Themes
Based on `gachaServers.json`, the following themes are supported:
- **coalMine** - Dark gray/black theme
- **copperMine** - Copper/bronze theme
- **topazMine** - Golden/orange theme
- **ironMine** - Silver/gray theme
- **diamondMine** - Light blue/crystal theme
- **emeraldMine** - Green theme
- **rubyMine** - Red/crimson theme
- **crystalMine** - Pink/purple theme
- **obsidianMine** - Dark gray/black volcanic theme
- **mythrilMine** - Blue/ethereal theme
- **adamantiteMine** - Purple/violet theme
- **fossilMine** - Brown/tan archaeological theme
- **generic** - Default brown theme (fallback)

## Image Types

### Tile Images (64x64 pixels)
- **floor** - 3 variations (stone pattern, cracks, dots)
- **wall** - 3 variations (bricks, rock face, rough)
- **entrance** - 1 variation (with EXIT marker)
- **wallOre** - 3 variations (different ore vein patterns)
- **rareOre** - 2 variations (crystal formations)
- **wallReinforced** - 2 variations (metal plates with rivets)

### Encounter Images (64x64 pixels)
- **portal_trap** - Swirling purple portal
- **bomb_trap** - Black bomb with lit fuse
- **toxic_fog** - Green fog cloud with skull
- **wall_trap** - Pressure plate mechanism
- **treasure_chest** - Golden chest with lock
- **rare_treasure** - Ornate chest with jewels and crown

## Usage

### Automatic Generation
Images are generated automatically when needed:
```javascript
// In mining-layered-render.js
const image = await loadTileImageVariation(TILE_TYPES.FLOOR, 'rubyMine', 0);
// If rubyMine_floor.png doesn't exist, it will be generated and saved
```

### Pre-Generate All Images
To generate all images at once (recommended for production):
```bash
node generateAllMiningImages.js
```

### Generate Specific Theme
```javascript
const { generateThemeImages } = require('./patterns/gachaModes/mining/imageProcessing/generateMissingImages');

// Generate all images for ruby mine theme
await generateThemeImages('rubyMine');
```

## Customization

### Adding Custom Images
Simply place your custom PNG images in the appropriate directories:
- Tiles: `./assets/game/tiles/[theme]_[tileType]_[variation].png`
- Encounters: `./assets/game/encounters/[theme]_[encounterType].png`

The system will use your custom images instead of generating them.

### Modifying Generation
Edit `generateMissingImages.js` to customize:
- Theme colors in `THEMES` object
- Tile patterns in generator functions
- Encounter designs in encounter generators

### Adding New Themes
1. Add theme to `MINE_THEMES` in `mining-layered-render.js`
2. Add theme configuration to `THEMES` in `generateMissingImages.js`
3. Update `gachaServers.json` image field to use the theme name

## Performance Benefits
- **One-time generation**: Images are only generated once, then cached
- **Reduced CPU usage**: No need for programmatic rendering every frame
- **Faster loading**: Pre-generated PNGs load faster than runtime rendering
- **Consistent appearance**: All tiles of the same type look identical

## File Naming Convention
- **Tiles**: `[theme]_[tileType]_[variation].png`
  - Example: `rubyMine_wall_2.png`
  - Variation 1 can omit the number: `rubyMine_wall.png`
  
- **Encounters**: `[theme]_[encounterType].png`
  - Example: `emeraldMine_treasure_chest.png`

## Integration with Game
The system automatically:
1. Checks if requested image exists
2. If not, generates it using theme colors
3. Saves to disk for future use
4. Returns the image for rendering

This ensures the game never fails due to missing images and maintains consistent visual quality.

## Troubleshooting
- **Images not generating**: Check write permissions for `./assets/game/` directories
- **Wrong colors**: Verify theme configuration in `generateMissingImages.js`
- **Missing variations**: Ensure variation numbers are within expected range (1-3 for most tiles)
- **Performance issues**: Run `generateAllMiningImages.js` to pre-generate all images

## Total Images
With 13 themes and all variations:
- **Tile images**: 13 themes × 14 variations = 182 images
- **Encounter images**: 13 themes × 6 types = 78 images
- **Total**: 260 images
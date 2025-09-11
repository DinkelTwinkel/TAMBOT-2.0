// generateInnImages.js - Auto-generate inn tile textures based on inn themes
const { createCanvas } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

// Inn theme configurations based on gachaServers.json
const INN_THEMES = {
    minerInn: { 
        name: "Miner's Inn", 
        wallColor: '#8B4513',       // Saddle brown (walls)
        floorColor: '#DEB887',      // Burlywood (floors - distinct from walls)
        secondaryColor: '#654321',   // Dark brown
        accentColor: '#A0522D',     // Sienna
        woodColor: '#CD853F',       // Peru (furniture)
        metalColor: '#696969',      // Dim gray
        frameColor: '#2F4F4F'       // Dark slate gray (window frames)
    },
    hunterLodge: { 
        name: "Hunter's Lodge", 
        wallColor: '#228B22',       // Forest green (walls)
        floorColor: '#8B4513',      // Saddle brown (floors - distinct from walls)
        secondaryColor: '#654321',   // Dark brown
        accentColor: '#CD853F',     // Peru
        woodColor: '#A0522D',       // Sienna (furniture)
        metalColor: '#2F4F4F',      // Dark slate gray
        frameColor: '#654321'       // Dark brown (window frames)
    },
    nobleRest: { 
        name: "Noble's Rest", 
        wallColor: '#DAA520',       // Goldenrod (walls)
        floorColor: '#8B4513',      // Saddle brown (floors - distinct from walls)
        secondaryColor: '#B8860B',   // Dark goldenrod
        accentColor: '#FFD700',     // Gold
        woodColor: '#CD853F',       // Peru (furniture)
        metalColor: '#C0C0C0',      // Silver
        frameColor: '#8B4513'       // Saddle brown (window frames)
    },
    generic: { 
        name: 'Generic Inn', 
        wallColor: '#8B4513',       // Saddle brown (walls)
        floorColor: '#DEB887',      // Burlywood (floors - distinct from walls)
        secondaryColor: '#654321',   // Dark brown
        accentColor: '#A0522D',     // Sienna
        woodColor: '#CD853F',       // Peru (furniture)
        metalColor: '#696969',      // Dim gray
        frameColor: '#2F4F4F'       // Dark slate gray (window frames)
    }
};

// Inn tile types to generate
const INN_TILE_TYPES = {
    floor: { variations: 3, generator: 'generateFloorTile', width: 64, height: 64 },
    wall: { variations: 3, generator: 'generateWallTile', width: 64, height: 90 },
    window: { variations: 2, generator: 'generateWindowTile', width: 64, height: 90 },
    windowSide: { variations: 1, generator: 'generateSideWindowTile', width: 64, height: 90 },
    door: { variations: 2, generator: 'generateDoorTile', width: 64, height: 90 },
    table: { variations: 3, generator: 'generateTableTile', width: 64, height: 64 },
    chair: { variations: 3, generator: 'generateChairTile', width: 64, height: 64 },
    decoration: { variations: 3, generator: 'generateDecorationTile', width: 64, height: 64 }
};

// Base directory for inn assets
const INN_TILE_DIR = './assets/game/inn';

/**
 * Ensure directory exists
 */
async function ensureDirectory(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
}

/**
 * Check if file exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Save canvas as PNG
 */
async function saveCanvasPNG(canvas, filePath) {
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(filePath, buffer);
    console.log(`Generated: ${filePath}`);
}

// ============= INN TILE GENERATORS =============

/**
 * Generate floor tile with wood plank texture
 */
function generateFloorTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = INN_THEMES[theme];
    
    // Base wood color (distinct from walls)
    ctx.fillStyle = themeConfig.floorColor;
    ctx.fillRect(0, 0, size, size);
    
    // Wood grain pattern
    const grainColor = themeConfig.woodColor;
    ctx.fillStyle = grainColor;
    
    if (variation === 1) {
        // Horizontal planks
        for (let y = 0; y < size; y += 16) {
            ctx.globalAlpha = 0.3;
            ctx.fillRect(0, y + 2, size, 2);
            ctx.fillRect(0, y + 12, size, 2);
        }
    } else if (variation === 2) {
        // Diagonal grain
        ctx.globalAlpha = 0.2;
        for (let i = 0; i < 8; i++) {
            ctx.fillRect(i * 8, 0, 2, size);
        }
    } else {
        // Vertical planks
        for (let x = 0; x < size; x += 21) {
            ctx.globalAlpha = 0.3;
            ctx.fillRect(x + 2, 0, 2, size);
            ctx.fillRect(x + 17, 0, 2, size);
        }
    }
    
    ctx.globalAlpha = 1.0;
}

/**
 * Generate wall tile with stone/brick texture, darker squares, and black top (65px like mining)
 */
function generateWallTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = INN_THEMES[theme];
    const blackTopHeight = 65; // Height of black top area (65px like mining system)
    const pixelSize = 4; // Pixel size for pixelated effect
    
    // Black top area (65 pixels like mining system)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, blackTopHeight);
    
    // Create pixelated base with slight color variation (like mining system)
    for (let x = 0; x < width; x += pixelSize) {
        for (let y = blackTopHeight; y < height; y += pixelSize) { // Start at 65 to leave top black
            // Add depth gradient effect
            const depthFactor = 1 - ((y - blackTopHeight) / (height - blackTopHeight)) * 0.3;
            const brightness = (0.85 + Math.random() * 0.15) * depthFactor;
            
            const baseColor = themeConfig.wallColor;
            const r = parseInt(baseColor.slice(1,3), 16);
            const g = parseInt(baseColor.slice(3,5), 16);
            const b = parseInt(baseColor.slice(5,7), 16);
            
            ctx.fillStyle = `rgb(${Math.floor(r * brightness)}, ${Math.floor(g * brightness)}, ${Math.floor(b * brightness)})`;
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }
    
    // Stone/brick pattern overlay (only below black top, like mining system)
    if (variation === 1) {
        // Classic brick pattern
        const brickHeight = 8;
        const brickWidth = 16;
        
        for (let y = blackTopHeight; y < height; y += brickHeight) {
            const rowOffset = ((y - blackTopHeight) / brickHeight) % 2 === 0 ? 0 : brickWidth/2;
            
            for (let x = -brickWidth; x < width + brickWidth; x += brickWidth) {
                const brickX = x + rowOffset;
                
                // Draw mortar lines (darker pixels)
                ctx.fillStyle = themeConfig.secondaryColor;
                ctx.globalAlpha = 0.6;
                
                // Horizontal mortar
                for (let px = Math.max(0, brickX); px < Math.min(width, brickX + brickWidth); px += pixelSize) {
                    ctx.fillRect(px, y, pixelSize, pixelSize/2);
                }
                
                // Vertical mortar
                if (brickX >= 0 && brickX < width) {
                    for (let py = y; py < Math.min(height, y + brickHeight); py += pixelSize) {
                        ctx.fillRect(brickX, py, pixelSize/2, pixelSize);
                    }
                }
            }
        }
    } else if (variation === 2) {
        // Stone blocks pattern
        const blockSize = 16;
        
        for (let blockY = blackTopHeight; blockY < height; blockY += blockSize) {
            for (let blockX = 0; blockX < width; blockX += blockSize) {
                // Add stone texture to each block
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = themeConfig.secondaryColor;
                
                // Random edge pixels for rough appearance
                for (let i = 0; i < 3; i++) {
                    const edgeX = blockX + Math.floor(Math.random() * blockSize/pixelSize) * pixelSize;
                    const edgeY = blockY + Math.floor(Math.random() * blockSize/pixelSize) * pixelSize;
                    
                    if (edgeX < width && edgeY < height) {
                        ctx.fillRect(edgeX, edgeY, pixelSize, pixelSize);
                    }
                }
            }
        }
    } else {
        // Checkered pattern (like mining variation 3)
        const tileSize = 8;
        for (let x = 0; x < width; x += tileSize) {
            for (let y = blackTopHeight; y < height; y += tileSize) {
                if ((x/tileSize + (y - blackTopHeight)/tileSize) % 2 === 0) {
                    ctx.globalAlpha = 0.15;
                    ctx.fillStyle = themeConfig.accentColor;
                    ctx.fillRect(x, y, tileSize, tileSize);
                }
            }
        }
    }
    
    ctx.globalAlpha = 1.0;
}

/**
 * Generate window tile (transparent except for frame only)
 */
function generateWindowTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const windowHeight = height / 2;
    const windowY = (height - windowHeight) / 2;
    const themeConfig = INN_THEMES[theme];
    
    // Start with completely transparent canvas
    ctx.clearRect(0, 0, width, height);
    
    // Only draw the window frame lines - no wall background
    ctx.strokeStyle = themeConfig.frameColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, windowY + 4, width - 8, windowHeight - 8);
    
    // Window cross frame
    ctx.lineWidth = 2;
    // Horizontal cross
    ctx.beginPath();
    ctx.moveTo(8, windowY + windowHeight / 2);
    ctx.lineTo(width - 8, windowY + windowHeight / 2);
    ctx.stroke();
    // Vertical cross
    ctx.beginPath();
    ctx.moveTo(width / 2, windowY + 8);
    ctx.lineTo(width / 2, windowY + windowHeight - 8);
    ctx.stroke();
}

/**
 * Generate side window tile (transparent except for frame lines)
 */
function generateSideWindowTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = INN_THEMES[theme];
    
    // Start with completely transparent canvas
    ctx.clearRect(0, 0, width, height);
    
    // Only draw the vertical frame lines - no wall background
    ctx.strokeStyle = themeConfig.frameColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
}

/**
 * Generate door tile (half height, transparent background)
 */
function generateDoorTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const doorHeight = height / 2;
    const doorY = (height - doorHeight) / 2;
    const themeConfig = INN_THEMES[theme];
    
    // Start with transparent background (no wall background)
    ctx.clearRect(0, 0, width, height);
    
    // Door frame
    ctx.fillStyle = themeConfig.secondaryColor;
    ctx.fillRect(4, doorY + 4, width - 8, doorHeight - 8);
    
    // Door panels
    ctx.fillStyle = themeConfig.woodColor;
    const panelWidth = width - 16;
    const panelHeight = (doorHeight - 16) / 2;
    ctx.fillRect(8, doorY + 8, panelWidth, panelHeight);
    ctx.fillRect(8, doorY + 12 + panelHeight, panelWidth, panelHeight);
    
    // Door handle
    ctx.fillStyle = themeConfig.metalColor;
    ctx.fillRect(width - 16, doorY + doorHeight / 2 - 2, 4, 4);
    
    // Panel outlines
    ctx.strokeStyle = themeConfig.secondaryColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(10, doorY + 10, panelWidth - 4, panelHeight - 4);
    ctx.strokeRect(10, doorY + 14 + panelHeight, panelWidth - 4, panelHeight - 4);
}

/**
 * Generate table tile
 */
function generateTableTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = INN_THEMES[theme];
    
    // Table top
    ctx.fillStyle = themeConfig.woodColor;
    ctx.fillRect(8, 8, size - 16, size - 16);
    
    // Table legs
    ctx.fillStyle = themeConfig.secondaryColor;
    const legSize = 4;
    ctx.fillRect(12, 12, legSize, size - 24);
    ctx.fillRect(size - 16, 12, legSize, size - 24);
    ctx.fillRect(12, size - 16, legSize, legSize);
    ctx.fillRect(size - 16, size - 16, legSize, legSize);
    
    // Table edge highlight
    ctx.strokeStyle = themeConfig.accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, size - 16, size - 16);
}

/**
 * Generate chair tile
 */
function generateChairTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = INN_THEMES[theme];
    
    // Chair seat
    ctx.fillStyle = themeConfig.woodColor;
    ctx.fillRect(12, 20, size - 24, size - 32);
    
    // Chair back
    ctx.fillRect(16, 8, size - 32, 12);
    
    // Chair legs
    ctx.fillStyle = themeConfig.secondaryColor;
    const legSize = 4;
    ctx.fillRect(16, size - 12, legSize, 8);
    ctx.fillRect(size - 20, size - 12, legSize, 8);
    ctx.fillRect(16, 8, legSize, size - 20);
    ctx.fillRect(size - 20, 8, legSize, size - 20);
    
    // Chair outline
    ctx.strokeStyle = themeConfig.accentColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 8, size - 24, size - 16);
}

/**
 * Generate decoration tile (plant, barrel, or bookshelf based on variation)
 */
function generateDecorationTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = INN_THEMES[theme];
    
    if (variation === 1) {
        // Plant in pot
        ctx.fillStyle = '#228B22'; // Forest green
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Pot
        ctx.fillStyle = themeConfig.secondaryColor;
        ctx.fillRect(size / 2 - 8, size - 16, 16, 12);
    } else if (variation === 2) {
        // Barrel
        ctx.fillStyle = themeConfig.woodColor;
        ctx.fillRect(16, 16, size - 32, size - 32);
        
        // Barrel bands
        ctx.fillStyle = themeConfig.metalColor;
        ctx.fillRect(16, 24, size - 32, 3);
        ctx.fillRect(16, size - 27, size - 32, 3);
        ctx.fillRect(16, size / 2 - 1, size - 32, 3);
    } else {
        // Bookshelf
        ctx.fillStyle = themeConfig.woodColor;
        ctx.fillRect(12, 12, size - 24, size - 24);
        
        // Shelves
        ctx.fillStyle = themeConfig.secondaryColor;
        for (let i = 0; i < 3; i++) {
            const y = 20 + i * 12;
            ctx.fillRect(14, y, size - 28, 2);
        }
        
        // Books
        ctx.fillStyle = themeConfig.accentColor;
        for (let i = 0; i < 6; i++) {
            const x = 16 + i * 6;
            const y = 22 + (i % 3) * 12;
            ctx.fillRect(x, y, 4, 8);
        }
    }
}

/**
 * Generate all tile variations for a specific theme
 */
async function generateThemeImages(themeName) {
    const theme = INN_THEMES[themeName] || INN_THEMES.generic;
    console.log(`[INN_GENERATOR] Generating images for theme: ${theme.name}`);
    
    await ensureDirectory(INN_TILE_DIR);
    
    let generatedCount = 0;
    
    for (const [tileType, config] of Object.entries(INN_TILE_TYPES)) {
        for (let variation = 1; variation <= config.variations; variation++) {
            const fileName = variation > 1 ? 
                `${themeName}_${tileType}_${variation}.png` : 
                `${themeName}_${tileType}.png`;
            const filePath = path.join(INN_TILE_DIR, fileName);
            
            // Skip if file already exists
            if (await fileExists(filePath)) {
                continue;
            }
            
            // Create canvas
            const canvas = createCanvas(config.width, config.height);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            
            // Clear canvas
            ctx.clearRect(0, 0, config.width, config.height);
            
            // Generate tile using appropriate generator
            const generator = generators[config.generator];
            if (generator) {
                generator(canvas, ctx, themeName, variation);
                await saveCanvasPNG(canvas, filePath);
                generatedCount++;
            } else {
                console.warn(`[INN_GENERATOR] No generator found for ${config.generator}`);
            }
        }
    }
    
    console.log(`[INN_GENERATOR] Generated ${generatedCount} images for theme ${themeName}`);
    return generatedCount;
}

/**
 * Generate all images for all inn themes
 */
async function generateAllInnImages() {
    console.log('[INN_GENERATOR] Starting generation of all inn images...');
    
    let totalGenerated = 0;
    
    for (const themeName of Object.keys(INN_THEMES)) {
        try {
            const count = await generateThemeImages(themeName);
            totalGenerated += count;
        } catch (error) {
            console.error(`[INN_GENERATOR] Error generating theme ${themeName}:`, error);
        }
    }
    
    console.log(`[INN_GENERATOR] Generation complete! Total images: ${totalGenerated}`);
    return totalGenerated;
}

/**
 * Get appropriate inn theme from gachaServers.json
 */
function getInnTheme(dbEntry) {
    const typeId = dbEntry?.typeId;
    if (!typeId) {
        console.log(`No typeId found in database entry, using generic inn theme`);
        return 'generic';
    }
    
    // Load gachaServers.json to get the image field
    const gachaServers = require('../../../data/gachaServers.json');
    const serverConfig = gachaServers.find(s => s.id === String(typeId));
    
    if (!serverConfig || serverConfig.type !== 'innkeeper') {
        console.log(`No inn config found for typeId ${typeId}, using generic theme`);
        return 'generic';
    }
    
    // Use the image field as the theme
    if (serverConfig.image) {
        console.log(`Using inn theme: ${serverConfig.image} for ${serverConfig.name}`);
        return serverConfig.image;
    }
    
    return 'generic';
}

// Generator function mapping
const generators = {
    generateFloorTile,
    generateWallTile,
    generateWindowTile,
    generateSideWindowTile,
    generateDoorTile,
    generateTableTile,
    generateChairTile,
    generateDecorationTile
};

module.exports = {
    generateThemeImages,
    generateAllInnImages,
    getInnTheme,
    INN_THEMES,
    INN_TILE_TYPES
};

// generateMissingImages.js - Auto-generate missing tile and encounter images
const { createCanvas } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

// Theme configurations based on gachaServers.json
const THEMES = {
    coalMine: { 
        name: 'Coal Mine', 
        primaryColor: '#2C2C2C', 
        secondaryColor: '#1A1A1A',
        accentColor: '#404040',
        oreColor: '#333333'
    },
    copperMine: { 
        name: 'Copper Mine', 
        primaryColor: '#B87333', 
        secondaryColor: '#8B4513',
        accentColor: '#CD7F32',
        oreColor: '#DA8A67'
    },
    topazMine: { 
        name: 'Topaz Mine', 
        primaryColor: '#FFB347', 
        secondaryColor: '#FFA500',
        accentColor: '#FFD700',
        oreColor: '#FFC125'
    },
    ironMine: { 
        name: 'Iron Mine', 
        primaryColor: '#708090', 
        secondaryColor: '#696969',
        accentColor: '#C0C0C0',
        oreColor: '#B0C4DE'
    },
    diamondMine: { 
        name: 'Diamond Mine', 
        primaryColor: '#B9F2FF', 
        secondaryColor: '#87CEEB',
        accentColor: '#E0FFFF',
        oreColor: '#F0FFFF'
    },
    emeraldMine: { 
        name: 'Emerald Mine', 
        primaryColor: '#50C878', 
        secondaryColor: '#3CB371',
        accentColor: '#00FF7F',
        oreColor: '#98FB98'
    },
    rubyMine: { 
        name: 'Ruby Mine', 
        primaryColor: '#E0115F', 
        secondaryColor: '#DC143C',
        accentColor: '#FF1493',
        oreColor: '#FF69B4'
    },
    crystalMine: { 
        name: 'Crystal Mine', 
        primaryColor: '#FF69B4', 
        secondaryColor: '#DA70D6',
        accentColor: '#DDA0DD',
        oreColor: '#F8BBD0'
    },
    obsidianMine: { 
        name: 'Obsidian Mine', 
        primaryColor: '#36454F', 
        secondaryColor: '#2F4F4F',
        accentColor: '#1C1C1C',
        oreColor: '#000000'
    },
    mythrilMine: { 
        name: 'Mythril Mine', 
        primaryColor: '#4169E1', 
        secondaryColor: '#4682B4',
        accentColor: '#6495ED',
        oreColor: '#87CEFA'
    },
    adamantiteMine: { 
        name: 'Adamantite Mine', 
        primaryColor: '#800080', 
        secondaryColor: '#4B0082',
        accentColor: '#9932CC',
        oreColor: '#DDA0DD'
    },
    fossilMine: { 
        name: 'Fossil Mine', 
        primaryColor: '#DEB887', 
        secondaryColor: '#D2691E',
        accentColor: '#F5DEB3',
        oreColor: '#FFE4B5'
    },
    generic: { 
        name: 'Generic Mine', 
        primaryColor: '#8B7355', 
        secondaryColor: '#6B5D54',
        accentColor: '#A0826D',
        oreColor: '#CD853F'
    }
};

// Tile types to generate
const TILE_TYPES = {
    floor: { variations: 3, generator: 'generateFloorTile', width: 64, height: 64 },
    wall: { variations: 3, generator: 'generateWallTile', width: 64, height: 90 },
    entrance: { variations: 1, generator: 'generateEntranceTile', width: 64, height: 64 },
    wallOre: { variations: 3, generator: 'generateWallOreTile', width: 64, height: 90 },
    rareOre: { variations: 3, generator: 'generateRareOreTile', width: 64, height: 90 },
    wallReinforced: { variations: 3, generator: 'generateReinforcedWallTile', width: 64, height: 90 }
};

// Encounter types to generate
const ENCOUNTER_TYPES = {
    portal_trap: { generator: 'generatePortalTrap' },
    bomb_trap: { generator: 'generateBombTrap' },
    toxic_fog: { generator: 'generateToxicFog' },
    wall_trap: { generator: 'generateWallTrap' },
    treasure_chest: { generator: 'generateTreasureChest' },
    rare_treasure: { generator: 'generateRareTreasure' }
};

// Base directories for assets
const TILE_DIR = './assets/game/tiles';
const ENCOUNTER_DIR = './assets/game/encounters';

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
    const buffer = await canvas.toBuffer('image/png');
    await fs.writeFile(filePath, buffer);
    console.log(`Generated: ${filePath}`);
}

// ============= TILE GENERATORS =============

/**
 * Generate floor tile with classic pixel art style
 */
function generateFloorTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = THEMES[theme];
    const pixelSize = 4; // Size of individual "pixels" for pixel art effect
    
    // Create pixel art base pattern
    for (let x = 0; x < size; x += pixelSize) {
        for (let y = 0; y < size; y += pixelSize) {
            // Add slight variation to base color for texture
            const brightness = 0.9 + Math.random() * 0.2;
            const baseColor = themeConfig.secondaryColor;
            const r = parseInt(baseColor.slice(1,3), 16);
            const g = parseInt(baseColor.slice(3,5), 16);
            const b = parseInt(baseColor.slice(5,7), 16);
            
            ctx.fillStyle = `rgb(${Math.min(255, r * brightness)}, ${Math.min(255, g * brightness)}, ${Math.min(255, b * brightness)})`;
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }
    
    // Add texture patterns based on variation
    if (variation === 1) {
        // Classic stone tile pattern
        ctx.fillStyle = themeConfig.primaryColor;
        
        // Draw tile seams
        for (let i = 0; i < 2; i++) {
            const offset = i * 32;
            // Horizontal seams
            for (let x = 0; x < size; x += pixelSize) {
                if (Math.random() > 0.3) {
                    ctx.globalAlpha = 0.3 + Math.random() * 0.2;
                    ctx.fillRect(x, offset - pixelSize/2, pixelSize, pixelSize);
                    ctx.fillRect(x, offset + pixelSize/2, pixelSize, pixelSize);
                }
            }
            // Vertical seams
            for (let y = 0; y < size; y += pixelSize) {
                if (Math.random() > 0.3) {
                    ctx.globalAlpha = 0.3 + Math.random() * 0.2;
                    ctx.fillRect(offset - pixelSize/2, y, pixelSize, pixelSize);
                    ctx.fillRect(offset + pixelSize/2, y, pixelSize, pixelSize);
                }
            }
        }
        
        // Add some worn spots
        ctx.globalAlpha = 0.2;
        for (let i = 0; i < 5; i++) {
            const x = Math.floor(Math.random() * (size/pixelSize)) * pixelSize;
            const y = Math.floor(Math.random() * (size/pixelSize)) * pixelSize;
            const w = pixelSize * (2 + Math.floor(Math.random() * 3));
            const h = pixelSize * (2 + Math.floor(Math.random() * 3));
            ctx.fillRect(x, y, w, h);
        }
    } else if (variation === 2) {
        // Cobblestone pattern
        ctx.fillStyle = themeConfig.primaryColor;
        const stoneSize = 16;
        
        for (let row = 0; row < size/stoneSize; row++) {
            for (let col = 0; col < size/stoneSize; col++) {
                const x = col * stoneSize + (row % 2 === 0 ? 0 : stoneSize/2);
                const y = row * stoneSize;
                
                if (x < size) {
                    // Stone outline
                    ctx.globalAlpha = 0.4;
                    ctx.strokeStyle = themeConfig.primaryColor;
                    ctx.lineWidth = pixelSize/2;
                    ctx.strokeRect(x, y, stoneSize - pixelSize/2, stoneSize - pixelSize/2);
                    
                    // Stone highlight
                    ctx.globalAlpha = 0.2;
                    ctx.fillStyle = themeConfig.accentColor;
                    ctx.fillRect(x + pixelSize, y + pixelSize, pixelSize * 2, pixelSize);
                }
            }
        }
    } else if (variation === 3) {
        // Checkered tile pattern
        const tileSize = 8;
        for (let x = 0; x < size; x += tileSize) {
            for (let y = 0; y < size; y += tileSize) {
                if ((x/tileSize + y/tileSize) % 2 === 0) {
                    ctx.globalAlpha = 0.15;
                    ctx.fillStyle = themeConfig.primaryColor;
                    ctx.fillRect(x, y, tileSize, tileSize);
                }
            }
        }
        
        // Add some dirt/debris pixels
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 20; i++) {
            const x = Math.floor(Math.random() * (size/pixelSize)) * pixelSize;
            const y = Math.floor(Math.random() * (size/pixelSize)) * pixelSize;
            ctx.fillStyle = Math.random() > 0.5 ? themeConfig.primaryColor : themeConfig.accentColor;
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }
    
    ctx.globalAlpha = 1.0;
    
    // Add subtle shading at edges
    const edgeGradient = ctx.createLinearGradient(0, 0, 0, size);
    edgeGradient.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
    edgeGradient.addColorStop(0.05, 'rgba(0, 0, 0, 0)');
    edgeGradient.addColorStop(0.95, 'rgba(0, 0, 0, 0)');
    edgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = edgeGradient;
    ctx.fillRect(0, 0, size, size);
    
    // Add pixelated border
    ctx.fillStyle = themeConfig.primaryColor;
    ctx.globalAlpha = 0.5;
    // Top and bottom borders
    for (let x = 0; x < size; x += pixelSize) {
        ctx.fillRect(x, 0, pixelSize, pixelSize/2);
        ctx.fillRect(x, size - pixelSize/2, pixelSize, pixelSize/2);
    }
    // Left and right borders
    for (let y = 0; y < size; y += pixelSize) {
        ctx.fillRect(0, y, pixelSize/2, pixelSize);
        ctx.fillRect(size - pixelSize/2, y, pixelSize/2, pixelSize);
    }
    ctx.globalAlpha = 1.0;
}

/**
 * Generate wall tile with classic pixel art style (64x90 - taller for perspective)
 */
function generateWallTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = THEMES[theme];
    const pixelSize = 4;
    
    // Create pixelated base with slight color variation
    for (let x = 0; x < width; x += pixelSize) {
        for (let y = 65; y < height; y += pixelSize) { // Start at 65 to leave top black
            // Add depth gradient effect
            const depthFactor = 1 - ((y - 65) / (height - 65)) * 0.3;
            const brightness = (0.85 + Math.random() * 0.15) * depthFactor;
            
            const baseColor = themeConfig.primaryColor;
            const r = parseInt(baseColor.slice(1,3), 16);
            const g = parseInt(baseColor.slice(3,5), 16);
            const b = parseInt(baseColor.slice(5,7), 16);
            
            ctx.fillStyle = `rgb(${Math.floor(r * brightness)}, ${Math.floor(g * brightness)}, ${Math.floor(b * brightness)})`;
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }
    
    // Add variation details with pixel art style
    if (variation === 1) {
        // Classic brick pattern
        const brickHeight = 8;
        const brickWidth = 16;
        
        for (let y = 65; y < height; y += brickHeight) {
            const rowOffset = ((y - 65) / brickHeight) % 2 === 0 ? 0 : brickWidth/2;
            
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
                
                // Add brick highlights
                ctx.globalAlpha = 0.15;
                ctx.fillStyle = themeConfig.accentColor;
                if (brickX + pixelSize < width && y + pixelSize < height) {
                    ctx.fillRect(brickX + pixelSize, y + pixelSize, pixelSize * 2, pixelSize);
                }
            }
        }
    } else if (variation === 2) {
        // Stone blocks pattern
        const blockSize = 16;
        
        for (let blockY = 65; blockY < height; blockY += blockSize) {
            for (let blockX = 0; blockX < width; blockX += blockSize) {
                // Add stone texture to each block
                const stoneBrightness = 0.8 + Math.random() * 0.2;
                
                // Create rough stone edges
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
                
                // Block outline
                ctx.globalAlpha = 0.4;
                ctx.strokeStyle = themeConfig.secondaryColor;
                ctx.lineWidth = pixelSize/2;
                ctx.strokeRect(blockX, blockY, blockSize, Math.min(blockSize, height - blockY));
            }
        }
        
        // Add some cracks
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000000';
        for (let i = 0; i < 3; i++) {
            const crackX = Math.floor(Math.random() * (width/pixelSize)) * pixelSize;
            const crackStartY = 65 + Math.floor(Math.random() * ((height-65)/pixelSize)) * pixelSize;
            
            // Draw vertical crack
            for (let y = crackStartY; y < Math.min(height, crackStartY + 20); y += pixelSize) {
                ctx.fillRect(crackX + Math.floor(Math.random() * 3 - 1) * pixelSize, y, pixelSize, pixelSize);
            }
        }
    } else if (variation === 3) {
        // Rough cave wall texture
        // Add random noise pixels for rough texture
        for (let i = 0; i < 100; i++) {
            const x = Math.floor(Math.random() * (width/pixelSize)) * pixelSize;
            const y = 65 + Math.floor(Math.random() * ((height-65)/pixelSize)) * pixelSize;
            
            const useSecondary = Math.random() > 0.5;
            ctx.fillStyle = useSecondary ? themeConfig.secondaryColor : themeConfig.accentColor;
            ctx.globalAlpha = 0.2 + Math.random() * 0.2;
            
            // Create small clusters of pixels
            const clusterSize = Math.floor(Math.random() * 3) + 1;
            for (let dx = 0; dx < clusterSize; dx++) {
                for (let dy = 0; dy < clusterSize; dy++) {
                    if (x + dx * pixelSize < width && y + dy * pixelSize < height) {
                        ctx.fillRect(x + dx * pixelSize, y + dy * pixelSize, pixelSize, pixelSize);
                    }
                }
            }
        }
        
        // Add some stalactite-like formations at top
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = themeConfig.secondaryColor;
        for (let i = 0; i < 5; i++) {
            const formX = Math.floor(Math.random() * (width/pixelSize)) * pixelSize;
            const formHeight = pixelSize * (2 + Math.floor(Math.random() * 4));
            
            for (let y = 65; y < 65 + formHeight; y += pixelSize) {
                const widthAtY = Math.max(pixelSize, formHeight - (y - 65));
                ctx.fillRect(formX - widthAtY/2, y, widthAtY, pixelSize);
            }
        }
    }
    
    ctx.globalAlpha = 1.0;
    
    // Add pixel art style lighting
    // Top highlight
    ctx.fillStyle = themeConfig.accentColor;
    ctx.globalAlpha = 0.3;
    for (let x = 0; x < width; x += pixelSize) {
        ctx.fillRect(x, 65, pixelSize, pixelSize);
    }
    
    // Side highlights for 3D effect
    for (let y = 65; y < height; y += pixelSize) {
        ctx.fillRect(0, y, pixelSize, pixelSize);
    }
    
    // Bottom and right shadows
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 0.4;
    for (let x = 0; x < width; x += pixelSize) {
        ctx.fillRect(x, height - pixelSize, pixelSize, pixelSize);
    }
    for (let y = 65; y < height; y += pixelSize) {
        ctx.fillRect(width - pixelSize, y, pixelSize, pixelSize);
    }
    
    ctx.globalAlpha = 1.0;
    
    // Add black rectangle at top (65 pixels) for depth
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, 65);
}

/**
 * Generate entrance tile
 */
function generateEntranceTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Base floor
    ctx.fillStyle = themeConfig.secondaryColor;
    ctx.fillRect(0, 0, size, size);
    
    // Add entrance marker
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(size/2, size/4);
    ctx.lineTo(size*3/4, size*3/4);
    ctx.lineTo(size/4, size*3/4);
    ctx.closePath();
    ctx.fill();
    
    // Add border
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, size-4, size-4);
    
    // Add "EXIT" text if size allows
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', size/2, size/2);
}

/**
 * Generate wall with ore tile (64x90)
 */
function generateWallOreTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = THEMES[theme];
    
    // First draw base wall
    generateWallTile(canvas, ctx, theme, 1);
    
    // Add ore veins
    ctx.strokeStyle = themeConfig.oreColor;
    ctx.fillStyle = themeConfig.oreColor;
    
    if (variation === 1) {
        // Large vein
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(10, 10);
        ctx.quadraticCurveTo(width/2, height/3, width-10, height-10);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(width/2, height/2, 8, 0, Math.PI * 2);
        ctx.fill();
    } else if (variation === 2) {
        // Multiple small veins
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * width, 0);
            ctx.lineTo(Math.random() * width, height);
            ctx.stroke();
        }
    } else if (variation === 3) {
        // Ore clusters
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(
                10 + Math.random() * (width - 20),
                10 + Math.random() * (height - 20),
                3 + Math.random() * 5,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }
    
    // Add sparkle effect
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 3; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1.0;
    
    // Add black rectangle at top (65 pixels)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, 65);
}

/**
 * Generate rare ore tile (64x90)
 */
function generateRareOreTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = THEMES[theme];
    
    // Base wall with special coloring
    const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height)/2);
    gradient.addColorStop(0, themeConfig.oreColor);
    gradient.addColorStop(0.5, themeConfig.accentColor);
    gradient.addColorStop(1, themeConfig.primaryColor);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Add crystal formations
    if (variation === 1) {
        // Large central crystal
        ctx.fillStyle = themeConfig.oreColor;
        ctx.beginPath();
        ctx.moveTo(width/2, 15);
        ctx.lineTo(width*3/4, height/2);
        ctx.lineTo(width/2, height-15);
        ctx.lineTo(width/4, height/2);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (variation === 2) {
        // Multiple small crystals
        for (let i = 0; i < 4; i++) {
            const x = 10 + Math.random() * (width - 20);
            const y = 10 + Math.random() * (height - 20);
            const w = 8 + Math.random() * 8;
            const h = 8 + Math.random() * 8;
            
            ctx.fillStyle = themeConfig.oreColor;
            ctx.beginPath();
            ctx.moveTo(x + w/2, y);
            ctx.lineTo(x + w, y + h/2);
            ctx.lineTo(x + w/2, y + h);
            ctx.lineTo(x, y + h/2);
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    } else if (variation === 3) {
        // Geode pattern - hollow center with crystals around edges
        ctx.fillStyle = themeConfig.secondaryColor;
        ctx.beginPath();
        ctx.arc(width/2, height/2, 20, 0, Math.PI * 2);
        ctx.fill();
        
        // Crystal ring
        const crystalCount = 8;
        for (let i = 0; i < crystalCount; i++) {
            const angle = (Math.PI * 2 / crystalCount) * i;
            const x = width/2 + Math.cos(angle) * 18;
            const y = height/2 + Math.sin(angle) * 18;
            
            ctx.fillStyle = themeConfig.oreColor;
            ctx.beginPath();
            ctx.moveTo(x, y - 4);
            ctx.lineTo(x + 3, y);
            ctx.lineTo(x, y + 4);
            ctx.lineTo(x - 3, y);
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }
    
    // Add sparkles
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 8; i++) {
        ctx.globalAlpha = Math.random() * 0.8 + 0.2;
        const x = Math.random() * width;
        const y = Math.random() * height;
        ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1.0;
    
    // Add black rectangle at top (65 pixels)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, 65);
}

/**
 * Generate reinforced wall tile (64x90)
 */
function generateReinforcedWallTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = THEMES[theme];
    
    // Base wall with metallic look
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#696969');
    gradient.addColorStop(0.3, themeConfig.primaryColor);
    gradient.addColorStop(0.7, '#2F2F2F');
    gradient.addColorStop(1, '#1C1C1C');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Add metal plates
    if (variation === 1) {
        // Large plates with rivets
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 8, width-16, height-16);
        
        // Rivets
        ctx.fillStyle = '#C0C0C0';
        const rivetPositions = [
            [12, 12], [width-12, 12],
            [12, height-12], [width-12, height-12]
        ];
        
        for (const [x, y] of rivetPositions) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#808080';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    } else if (variation === 2) {
        // Grid pattern
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        
        for (let x = 0; x < width; x += 16) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        for (let y = 0; y < height; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Add bolts at intersections
        ctx.fillStyle = '#808080';
        for (let x = 16; x < width; x += 16) {
            for (let y = 16; y < height; y += 16) {
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (variation === 3) {
        // Diamond plate pattern
        ctx.fillStyle = '#3C3C3C';
        const diamondSize = 12;
        
        for (let y = 0; y < height; y += diamondSize) {
            for (let x = 0; x < width; x += diamondSize * 2) {
                const offsetX = (y / diamondSize) % 2 === 0 ? 0 : diamondSize;
                
                ctx.beginPath();
                ctx.moveTo(x + offsetX + diamondSize, y);
                ctx.lineTo(x + offsetX + diamondSize * 2, y + diamondSize/2);
                ctx.lineTo(x + offsetX + diamondSize, y + diamondSize);
                ctx.lineTo(x + offsetX, y + diamondSize/2);
                ctx.closePath();
                ctx.fill();
                
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
        
        // Add warning stripes
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * 20);
            ctx.lineTo(20, i * 20 + 20);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(width - 20, i * 20);
            ctx.lineTo(width, i * 20 + 20);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }
    
    // Add black rectangle at top (65 pixels)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, 65);
}

// ============= ENCOUNTER GENERATORS =============

/**
 * Generate portal trap
 */
function generatePortalTrap(canvas, ctx, theme) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Clear background
    ctx.fillStyle = 'transparent';
    ctx.clearRect(0, 0, size, size);
    
    // Draw swirling portal
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, '#E6E6FA');
    gradient.addColorStop(0.3, '#9932CC');
    gradient.addColorStop(0.6, '#4B0082');
    gradient.addColorStop(1, 'rgba(75, 0, 130, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Add swirl effect
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const startAngle = (Math.PI * 2 / 3) * i;
        const endAngle = startAngle + Math.PI;
        ctx.arc(size/2, size/2, size/3 - i * 5, startAngle, endAngle);
        ctx.stroke();
    }
    
    ctx.globalAlpha = 1.0;
}

/**
 * Generate bomb trap
 */
function generateBombTrap(canvas, ctx, theme) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Clear background
    ctx.clearRect(0, 0, size, size);
    
    // Draw bomb body
    ctx.fillStyle = '#1C1C1C';
    ctx.beginPath();
    ctx.arc(size/2, size/2 + 5, size/3, 0, Math.PI * 2);
    ctx.fill();
    
    // Add highlight
    ctx.fillStyle = '#404040';
    ctx.beginPath();
    ctx.arc(size/2 - 5, size/2, size/8, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw fuse
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(size/2, size/2 - size/3 + 5);
    ctx.quadraticCurveTo(size/2 + 5, size/2 - size/3 - 5, size/2, size/2 - size/3 - 10);
    ctx.stroke();
    
    // Fuse spark
    const gradient = ctx.createRadialGradient(size/2, size/2 - size/3 - 10, 0, size/2, size/2 - size/3 - 10, 8);
    gradient.addColorStop(0, '#FFFF00');
    gradient.addColorStop(0.5, '#FF4500');
    gradient.addColorStop(1, 'rgba(255, 69, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size/2, size/2 - size/3 - 10, 8, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * Generate toxic fog
 */
function generateToxicFog(canvas, ctx, theme) {
    const size = 64;
    
    // Clear background
    ctx.clearRect(0, 0, size, size);
    
    // Draw fog clouds
    const fogGradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    fogGradient.addColorStop(0, 'rgba(0, 255, 0, 0.8)');
    fogGradient.addColorStop(0.5, 'rgba(0, 200, 0, 0.5)');
    fogGradient.addColorStop(1, 'rgba(0, 150, 0, 0)');
    
    ctx.fillStyle = fogGradient;
    
    // Multiple overlapping circles for cloud effect
    const cloudOffsets = [
        [0, 0, size/2.5],
        [-size/5, -size/6, size/3],
        [size/5, -size/6, size/3],
        [0, size/5, size/3]
    ];
    
    for (const [dx, dy, radius] of cloudOffsets) {
        ctx.beginPath();
        ctx.arc(size/2 + dx, size/2 + dy, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Add skull symbol
    ctx.fillStyle = '#001100';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☠', size/2, size/2);
}

/**
 * Generate wall trap
 */
function generateWallTrap(canvas, ctx, theme) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Clear background
    ctx.clearRect(0, 0, size, size);
    
    // Draw pressure plate frame
    ctx.fillStyle = '#654321';
    ctx.fillRect(8, 8, size-16, size-16);
    
    // Draw inner pressure plate
    const gradient = ctx.createLinearGradient(12, 12, size-12, size-12);
    gradient.addColorStop(0, '#8B4513');
    gradient.addColorStop(0.5, '#A0522D');
    gradient.addColorStop(1, '#6B4423');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(12, 12, size-24, size-24);
    
    // Add pressure lines (X pattern)
    ctx.strokeStyle = '#4A2C17';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(size-20, size-20);
    ctx.moveTo(size-20, 20);
    ctx.lineTo(20, size-20);
    ctx.stroke();
    
    // Add border
    ctx.strokeStyle = '#2F1F0F';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, size-16, size-16);
}

/**
 * Generate treasure chest
 */
function generateTreasureChest(canvas, ctx, theme) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Clear background
    ctx.clearRect(0, 0, size, size);
    
    // Draw chest base
    const gradient = ctx.createLinearGradient(10, 25, size-10, size-10);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(0.3, '#FFA500');
    gradient.addColorStop(0.7, '#FF8C00');
    gradient.addColorStop(1, '#B8860B');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(10, 25, size-20, size-35);
    
    // Draw chest lid
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.moveTo(8, 25);
    ctx.quadraticCurveTo(size/2, 10, size-8, 25);
    ctx.lineTo(size-10, 30);
    ctx.quadraticCurveTo(size/2, 15, 10, 30);
    ctx.closePath();
    ctx.fill();
    
    // Add metal bands
    ctx.fillStyle = '#696969';
    ctx.fillRect(8, 28, size-16, 3);
    ctx.fillRect(8, size-15, size-16, 3);
    
    // Draw lock
    ctx.fillStyle = '#2F4F4F';
    ctx.fillRect(size/2 - 5, 35, 10, 10);
    
    // Keyhole
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(size/2, 39, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(size/2 - 1, 39, 2, 4);
    
    // Add sparkles
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.8;
        const x = 10 + Math.random() * (size - 20);
        const y = 10 + Math.random() * (size - 20);
        
        ctx.beginPath();
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x + 1, y);
        ctx.lineTo(x, y + 2);
        ctx.lineTo(x - 1, y);
        ctx.closePath();
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;
}

/**
 * Generate rare treasure
 */
function generateRareTreasure(canvas, ctx, theme) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Clear background
    ctx.clearRect(0, 0, size, size);
    
    // Draw ornate chest base
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(0.3, '#FFA500');
    gradient.addColorStop(0.6, '#B8860B');
    gradient.addColorStop(1, '#8B4513');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(8, 22, size-16, size-32);
    
    // Draw ornate lid
    ctx.fillStyle = '#4B0082';
    ctx.beginPath();
    ctx.moveTo(6, 22);
    ctx.quadraticCurveTo(size/2, 5, size-6, 22);
    ctx.lineTo(size-8, 28);
    ctx.quadraticCurveTo(size/2, 11, 8, 28);
    ctx.closePath();
    ctx.fill();
    
    // Add jewels
    const jewelColors = ['#FF1493', '#00CED1', '#32CD32', '#FFD700'];
    const jewelPositions = [
        [size/2, 18],
        [size/4, 35],
        [size*3/4, 35],
        [size/2, 45]
    ];
    
    for (let i = 0; i < jewelPositions.length; i++) {
        const [x, y] = jewelPositions[i];
        
        // Jewel glow
        const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, 8);
        glowGradient.addColorStop(0, jewelColors[i]);
        glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Jewel
        ctx.fillStyle = jewelColors[i];
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 3, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 3, y);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
    
    // Crown on top
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(size/2 - 8, 12);
    ctx.lineTo(size/2 - 8, 8);
    ctx.lineTo(size/2 - 4, 10);
    ctx.lineTo(size/2, 6);
    ctx.lineTo(size/2 + 4, 10);
    ctx.lineTo(size/2 + 8, 8);
    ctx.lineTo(size/2 + 8, 12);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#B8860B';
    ctx.lineWidth = 1;
    ctx.stroke();
}

// ============= MAIN GENERATION FUNCTION =============

/**
 * Generate missing images for a specific theme
 */
async function generateThemeImages(theme) {
    await ensureDirectory(TILE_DIR);
    await ensureDirectory(ENCOUNTER_DIR);
    
    let generatedCount = 0;
    
    // Generate tile images
    for (const [tileType, config] of Object.entries(TILE_TYPES)) {
        for (let variation = 1; variation <= config.variations; variation++) {
            const fileName = variation > 1 ? 
                `${theme}_${tileType}_${variation}.png` : 
                `${theme}_${tileType}.png`;
            
            const filePath = path.join(TILE_DIR, fileName);
            
            if (await fileExists(filePath)) {
                console.log(`Exists: ${fileName}`);
                continue;
            }
            
            const canvas = createCanvas(config.width, config.height);
            const ctx = canvas.getContext('2d');
            
            // Call the appropriate generator function
            const generatorFunc = eval(config.generator);
            generatorFunc(canvas, ctx, theme, variation);
            
            await saveCanvasPNG(canvas, filePath);
            generatedCount++;
        }
    }
    
    // Generate encounter images
    for (const [encounterType, config] of Object.entries(ENCOUNTER_TYPES)) {
        const fileName = `${theme}_${encounterType}.png`;
        const filePath = path.join(ENCOUNTER_DIR, fileName);
        
        if (await fileExists(filePath)) {
            console.log(`Exists: ${fileName}`);
            continue;
        }
        
        const canvas = createCanvas(64, 64);
        const ctx = canvas.getContext('2d');
        
        // Call the appropriate generator function
        const generatorFunc = eval(config.generator);
        generatorFunc(canvas, ctx, theme);
        
        await saveCanvasPNG(canvas, filePath);
        generatedCount++;
    }
    
    return generatedCount;
}

/**
 * Generate all missing images for all themes
 */
async function generateAllMissingImages() {
    console.log('Starting missing image generation...\n');
    
    let totalGenerated = 0;
    
    for (const theme of Object.keys(THEMES)) {
        console.log(`\nProcessing theme: ${THEMES[theme].name} (${theme})`);
        console.log('=' .repeat(50));
        
        const count = await generateThemeImages(theme);
        totalGenerated += count;
        
        console.log(`Generated ${count} images for ${theme}`);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`Total images generated: ${totalGenerated}`);
    console.log('Image generation complete!');
}

// Run if called directly
if (require.main === module) {
    generateAllMissingImages().catch(console.error);
}

module.exports = {
    generateAllMissingImages,
    generateThemeImages,
    THEMES,
    TILE_TYPES,
    ENCOUNTER_TYPES
};
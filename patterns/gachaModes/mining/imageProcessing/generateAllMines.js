// generateAllMines.js - Generate all missing mine images including deep/ultra variations and special mines
const { createCanvas } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

// Extended theme configurations including deep and ultra variations
const THEMES = {
    // === BASE MINES ===
    coalMine: { 
        name: 'Coal Mine', 
        primaryColor: '#2C2C2C', 
        secondaryColor: '#1A1A1A',
        accentColor: '#404040',
        oreColor: '#333333'
    },
    coalMineDeep: { 
        name: 'Coal Pits (Deep)', 
        primaryColor: '#1C1C1C', 
        secondaryColor: '#0A0A0A',
        accentColor: '#2A2A2A',
        oreColor: '#222222',
        glowColor: '#404040'
    },
    coalMineUltra: { 
        name: 'Black Depths (Ultra)', 
        primaryColor: '#000000', 
        secondaryColor: '#080808',
        accentColor: '#1A1A1A',
        oreColor: '#111111',
        glowColor: '#666666',
        voidEffect: true
    },
    
    copperMine: { 
        name: 'Copper Mine', 
        primaryColor: '#B87333', 
        secondaryColor: '#8B4513',
        accentColor: '#CD7F32',
        oreColor: '#DA8A67'
    },
    copperMineDeep: { 
        name: 'Copper Well (Deep)', 
        primaryColor: '#CD7F32', 
        secondaryColor: '#A0522D',
        accentColor: '#DAA520',
        oreColor: '#FF8C00',
        glowColor: '#FFD700'
    },
    copperMineUltra: { 
        name: 'Copper Throne (Ultra)', 
        primaryColor: '#FF6600', 
        secondaryColor: '#FF4500',
        accentColor: '#FF8C00',
        oreColor: '#FFA500',
        glowColor: '#FFFF00',
        electricEffect: true
    },
    
    topazMine: { 
        name: 'Topaz Mine', 
        primaryColor: '#FFB347', 
        secondaryColor: '#FFA500',
        accentColor: '#FFD700',
        oreColor: '#FFC125'
    },
    topazMineDeep: { 
        name: 'Topaz Core (Deep)', 
        primaryColor: '#FFA500', 
        secondaryColor: '#FF8C00',
        accentColor: '#FFD700',
        oreColor: '#FFFF00',
        glowColor: '#FFFFFF'
    },
    topazMineUltra: { 
        name: 'Sun Under (Ultra)', 
        primaryColor: '#FFFF00', 
        secondaryColor: '#FFD700',
        accentColor: '#FFFFFF',
        oreColor: '#FFFFCC',
        glowColor: '#FFFFFF',
        solarEffect: true
    },
    
    ironMine: { 
        name: 'Iron Mine', 
        primaryColor: '#708090', 
        secondaryColor: '#696969',
        accentColor: '#C0C0C0',
        oreColor: '#B0C4DE'
    },
    ironMineDeep: { 
        name: 'Iron Fortress (Deep)', 
        primaryColor: '#414141', 
        secondaryColor: '#2F2F2F',
        accentColor: '#808080',
        oreColor: '#A9A9A9',
        glowColor: '#C0C0C0'
    },
    ironMineUltra: { 
        name: 'Black Iron (Ultra)', 
        primaryColor: '#2A2A2A', 
        secondaryColor: '#1A1A1A',
        accentColor: '#4A4A4A',
        oreColor: '#666666',
        glowColor: '#999999',
        magneticEffect: true
    },
    
    diamondMine: { 
        name: 'Diamond Mine', 
        primaryColor: '#B9F2FF', 
        secondaryColor: '#87CEEB',
        accentColor: '#E0FFFF',
        oreColor: '#F0FFFF'
    },
    diamondMineDeep: { 
        name: 'Diamond Throne (Deep)', 
        primaryColor: '#E0E0FF', 
        secondaryColor: '#C0C0FF',
        accentColor: '#F0F0FF',
        oreColor: '#FFFFFF',
        glowColor: '#FFFFFF'
    },
    diamondMineUltra: { 
        name: 'Diamond Crown (Ultra)', 
        primaryColor: '#FFFFFF', 
        secondaryColor: '#F0F0FF',
        accentColor: '#FFFFFF',
        oreColor: '#FFFFFF',
        glowColor: '#FFFFFF',
        prismEffect: true
    },
    
    emeraldMine: { 
        name: 'Emerald Mine', 
        primaryColor: '#50C878', 
        secondaryColor: '#3CB371',
        accentColor: '#00FF7F',
        oreColor: '#98FB98'
    },
    emeraldMineDeep: { 
        name: 'Emerald Sanctum (Deep)', 
        primaryColor: '#00A86B', 
        secondaryColor: '#008B45',
        accentColor: '#00FF00',
        oreColor: '#7FFF00',
        glowColor: '#00FF00'
    },
    emeraldMineUltra: { 
        name: 'World Tree (Ultra)', 
        primaryColor: '#00FF00', 
        secondaryColor: '#00CC00',
        accentColor: '#33FF33',
        oreColor: '#66FF66',
        glowColor: '#AAFFAA',
        lifeEffect: true
    },
    
    rubyMine: { 
        name: 'Ruby Mine', 
        primaryColor: '#E0115F', 
        secondaryColor: '#DC143C',
        accentColor: '#FF1493',
        oreColor: '#FF69B4'
    },
    rubyMineDeep: { 
        name: 'Ruby Tunnels (Deep)', 
        primaryColor: '#CC0033', 
        secondaryColor: '#990022',
        accentColor: '#FF0044',
        oreColor: '#FF3366',
        glowColor: '#FF6699'
    },
    rubyMineUltra: { 
        name: 'Volcanica (Ultra)', 
        primaryColor: '#FF0000', 
        secondaryColor: '#CC0000',
        accentColor: '#FF3333',
        oreColor: '#FF6666',
        glowColor: '#FFAAAA',
        lavaEffect: true
    },
    
    crystalMine: { 
        name: 'Crystal Mine', 
        primaryColor: '#FF69B4', 
        secondaryColor: '#DA70D6',
        accentColor: '#DDA0DD',
        oreColor: '#F8BBD0'
    },
    crystalMineDeep: { 
        name: 'Crystal Paradise (Deep)', 
        primaryColor: '#FF1493', 
        secondaryColor: '#C71585',
        accentColor: '#FF69B4',
        oreColor: '#FFB6C1',
        glowColor: '#FFC0CB'
    },
    crystalMineUltra: { 
        name: 'Crystal Eternity (Ultra)', 
        primaryColor: '#FF00FF', 
        secondaryColor: '#CC00CC',
        accentColor: '#FF33FF',
        oreColor: '#FF66FF',
        glowColor: '#FFAAFF',
        infinityEffect: true
    },
    
    obsidianMine: { 
        name: 'Obsidian Mine', 
        primaryColor: '#36454F', 
        secondaryColor: '#2F4F4F',
        accentColor: '#1C1C1C',
        oreColor: '#000000'
    },
    obsidianMineDeep: { 
        name: 'Obsidian Corridors (Deep)', 
        primaryColor: '#1A1A2E', 
        secondaryColor: '#0F0F1F',
        accentColor: '#2A2A3E',
        oreColor: '#000011',
        glowColor: '#333344'
    },
    obsidianMineUltra: { 
        name: 'Black Heart (Ultra)', 
        primaryColor: '#0A0A0A', 
        secondaryColor: '#000000',
        accentColor: '#1A1A1A',
        oreColor: '#050505',
        glowColor: '#222222',
        voidEffect: true
    },
    
    mythrilMine: { 
        name: 'Mythril Mine', 
        primaryColor: '#4169E1', 
        secondaryColor: '#4682B4',
        accentColor: '#6495ED',
        oreColor: '#87CEFA'
    },
    mythrilMineDeep: { 
        name: 'Mythril Rest (Deep)', 
        primaryColor: '#6495ED', 
        secondaryColor: '#4169E1',
        accentColor: '#87CEEB',
        oreColor: '#ADD8E6',
        glowColor: '#B0E0E6'
    },
    mythrilMineUltra: { 
        name: 'Blue Cosmos (Ultra)', 
        primaryColor: '#0000FF', 
        secondaryColor: '#0000CC',
        accentColor: '#3333FF',
        oreColor: '#6666FF',
        glowColor: '#9999FF',
        cosmicEffect: true
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
    fossilMineDeep: { 
        name: 'Fossil Vault (Deep)', 
        primaryColor: '#8B7355', 
        secondaryColor: '#6B5D54',
        accentColor: '#A0826D',
        oreColor: '#CD853F',
        glowColor: '#DEB887'
    },
    fossilMineUltra: { 
        name: 'The Origin (Ultra)', 
        primaryColor: '#654321', 
        secondaryColor: '#4A3A28',
        accentColor: '#7F6347',
        oreColor: '#8B7355',
        glowColor: '#A0826D',
        ancientEffect: true
    },
    
    // === SPECIAL MINES ===
    gluttonyMine: { 
        name: 'Gluttony Gullet', 
        primaryColor: '#8B0000', 
        secondaryColor: '#660000',
        accentColor: '#AA0000',
        oreColor: '#CC0000',
        glowColor: '#FF0000',
        digestiveEffect: true
    },
    
    rustyRelicMine: { 
        name: 'Rusty Relic Realm', 
        primaryColor: '#8B4513', 
        secondaryColor: '#6B3410',
        accentColor: '#A0522D',
        oreColor: '#CD853F',
        glowColor: '#DEB887',
        rustEffect: true
    },
    
    abyssalAdamantiteMine: { 
        name: 'Abyssal Adamantite', 
        primaryColor: '#000000', 
        secondaryColor: '#0A0014',
        accentColor: '#14001F',
        oreColor: '#1F0033',
        glowColor: '#330066',
        voidEffect: true,
        abyssalEffect: true
    },
    
    // === INNKEEPER THEMES (for completeness) ===
    minerInn: { 
        name: 'Miner Inn', 
        primaryColor: '#DEB887', 
        secondaryColor: '#D2691E',
        accentColor: '#F5DEB3',
        oreColor: '#FFE4B5'
    },
    
    hunterLodge: { 
        name: 'Hunter Lodge', 
        primaryColor: '#8B4513', 
        secondaryColor: '#6B3410',
        accentColor: '#A0522D',
        oreColor: '#CD853F'
    },
    
    nobleRest: { 
        name: 'Noble Rest', 
        primaryColor: '#FFD700', 
        secondaryColor: '#FFA500',
        accentColor: '#FFFF00',
        oreColor: '#FFFFCC'
    }
};

// Tile types to generate for mines
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
    green_fog: { generator: 'generateToxicFog' }, // Alias for toxic_fog
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

// ============= ENHANCED TILE GENERATORS =============

/**
 * Generate floor tile with theme-specific effects
 */
function generateFloorTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = THEMES[theme];
    const pixelSize = 4;
    
    // Base floor generation
    for (let x = 0; x < size; x += pixelSize) {
        for (let y = 0; y < size; y += pixelSize) {
            const brightness = 0.9 + Math.random() * 0.2;
            const baseColor = themeConfig.secondaryColor;
            const r = parseInt(baseColor.slice(1,3), 16);
            const g = parseInt(baseColor.slice(3,5), 16);
            const b = parseInt(baseColor.slice(5,7), 16);
            
            ctx.fillStyle = `rgb(${Math.min(255, r * brightness)}, ${Math.min(255, g * brightness)}, ${Math.min(255, b * brightness)})`;
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }
    
    // Add special effects for deep/ultra versions
    if (themeConfig.glowColor) {
        // Add glowing veins
        ctx.strokeStyle = themeConfig.glowColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * size, 0);
            ctx.quadraticCurveTo(
                size/2 + (Math.random() - 0.5) * size/2,
                size/2,
                Math.random() * size,
                size
            );
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }
    
    // Add pattern variations
    if (variation === 1) {
        // Stone tile pattern
        ctx.fillStyle = themeConfig.primaryColor;
        ctx.globalAlpha = 0.3;
        
        for (let i = 0; i < 2; i++) {
            const offset = i * 32;
            for (let x = 0; x < size; x += pixelSize) {
                if (Math.random() > 0.3) {
                    ctx.fillRect(x, offset, pixelSize, pixelSize);
                }
            }
            for (let y = 0; y < size; y += pixelSize) {
                if (Math.random() > 0.3) {
                    ctx.fillRect(offset, y, pixelSize, pixelSize);
                }
            }
        }
    } else if (variation === 2) {
        // Cobblestone pattern
        const stoneSize = 16;
        ctx.strokeStyle = themeConfig.primaryColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        
        for (let row = 0; row < size/stoneSize; row++) {
            for (let col = 0; col < size/stoneSize; col++) {
                const x = col * stoneSize + (row % 2 === 0 ? 0 : stoneSize/2);
                const y = row * stoneSize;
                
                if (x < size) {
                    ctx.strokeRect(x, y, stoneSize, stoneSize);
                }
            }
        }
    } else if (variation === 3) {
        // Checkered pattern
        const tileSize = 8;
        ctx.fillStyle = themeConfig.primaryColor;
        ctx.globalAlpha = 0.15;
        
        for (let x = 0; x < size; x += tileSize) {
            for (let y = 0; y < size; y += tileSize) {
                if ((x/tileSize + y/tileSize) % 2 === 0) {
                    ctx.fillRect(x, y, tileSize, tileSize);
                }
            }
        }
    }
    
    ctx.globalAlpha = 1.0;
    
    // Add special effects based on theme
    if (themeConfig.voidEffect) {
        // Add void particles
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
    }
    
    if (themeConfig.lavaEffect) {
        // Add lava glow
        ctx.fillStyle = 'rgba(255, 100, 0, 0.2)';
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const radius = 5 + Math.random() * 10;
            
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, 'rgba(255, 100, 0, 0.4)');
            gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
    }
    
    if (themeConfig.electricEffect) {
        // Add electric sparks
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        
        for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            let x = Math.random() * size;
            let y = Math.random() * size;
            ctx.moveTo(x, y);
            
            for (let j = 0; j < 5; j++) {
                x += (Math.random() - 0.5) * 20;
                y += (Math.random() - 0.5) * 20;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }
    
    // Add edge shading
    const edgeGradient = ctx.createLinearGradient(0, 0, 0, size);
    edgeGradient.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
    edgeGradient.addColorStop(0.05, 'rgba(0, 0, 0, 0)');
    edgeGradient.addColorStop(0.95, 'rgba(0, 0, 0, 0)');
    edgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = edgeGradient;
    ctx.fillRect(0, 0, size, size);
}

/**
 * Generate wall tile with theme-specific effects
 */
function generateWallTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = THEMES[theme];
    const pixelSize = 4;
    
    // Base wall generation
    for (let x = 0; x < width; x += pixelSize) {
        for (let y = 65; y < height; y += pixelSize) {
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
    
    // Add variation patterns
    if (variation === 1) {
        // Brick pattern
        const brickHeight = 8;
        const brickWidth = 16;
        
        ctx.fillStyle = themeConfig.secondaryColor;
        ctx.globalAlpha = 0.6;
        
        for (let y = 65; y < height; y += brickHeight) {
            const rowOffset = ((y - 65) / brickHeight) % 2 === 0 ? 0 : brickWidth/2;
            
            for (let x = -brickWidth; x < width + brickWidth; x += brickWidth) {
                const brickX = x + rowOffset;
                
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
        // Stone blocks
        const blockSize = 16;
        
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = themeConfig.secondaryColor;
        ctx.lineWidth = pixelSize/2;
        
        for (let blockY = 65; blockY < height; blockY += blockSize) {
            for (let blockX = 0; blockX < width; blockX += blockSize) {
                ctx.strokeRect(blockX, blockY, blockSize, Math.min(blockSize, height - blockY));
            }
        }
    } else if (variation === 3) {
        // Rough cave texture
        ctx.fillStyle = themeConfig.secondaryColor;
        ctx.globalAlpha = 0.3;
        
        for (let i = 0; i < 100; i++) {
            const x = Math.floor(Math.random() * (width/pixelSize)) * pixelSize;
            const y = 65 + Math.floor(Math.random() * ((height-65)/pixelSize)) * pixelSize;
            const clusterSize = Math.floor(Math.random() * 3) + 1;
            
            for (let dx = 0; dx < clusterSize; dx++) {
                for (let dy = 0; dy < clusterSize; dy++) {
                    if (x + dx * pixelSize < width && y + dy * pixelSize < height) {
                        ctx.fillRect(x + dx * pixelSize, y + dy * pixelSize, pixelSize, pixelSize);
                    }
                }
            }
        }
    }
    
    ctx.globalAlpha = 1.0;
    
    // Add special theme effects
    if (themeConfig.glowColor) {
        // Add glowing cracks
        ctx.strokeStyle = themeConfig.glowColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            let x = Math.random() * width;
            let y = 65;
            ctx.moveTo(x, y);
            
            while (y < height) {
                x += (Math.random() - 0.5) * 10;
                y += 5 + Math.random() * 5;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }
    
    if (themeConfig.cosmicEffect) {
        // Add star field effect
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < 20; i++) {
            ctx.globalAlpha = Math.random();
            const x = Math.random() * width;
            const y = 65 + Math.random() * (height - 65);
            ctx.fillRect(x, y, 1, 1);
        }
        ctx.globalAlpha = 1.0;
    }
    
    if (themeConfig.digestiveEffect) {
        // Add organic, pulsing texture
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * width;
            const y = 65 + Math.random() * (height - 65);
            const radius = 5 + Math.random() * 10;
            
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Add lighting effects
    ctx.fillStyle = themeConfig.accentColor;
    ctx.globalAlpha = 0.3;
    for (let x = 0; x < width; x += pixelSize) {
        ctx.fillRect(x, 65, pixelSize, pixelSize);
    }
    
    // Side highlights
    for (let y = 65; y < height; y += pixelSize) {
        ctx.fillRect(0, y, pixelSize, pixelSize);
    }
    
    // Shadows
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
 * Generate entrance tile with theme-specific styling
 */
function generateEntranceTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Base floor
    ctx.fillStyle = themeConfig.secondaryColor;
    ctx.fillRect(0, 0, size, size);
    
    // Determine entrance style based on theme
    if (themeConfig.voidEffect || themeConfig.abyssalEffect) {
        // Void portal entrance
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, '#000000');
        gradient.addColorStop(0.5, themeConfig.primaryColor);
        gradient.addColorStop(1, themeConfig.secondaryColor);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Portal swirl
        ctx.strokeStyle = themeConfig.glowColor || '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/3, 0, Math.PI * 1.5);
        ctx.stroke();
        
        ctx.globalAlpha = 1.0;
    } else if (themeConfig.lavaEffect) {
        // Lava entrance
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, '#FFFF00');
        gradient.addColorStop(0.3, '#FF6600');
        gradient.addColorStop(0.7, '#CC0000');
        gradient.addColorStop(1, themeConfig.secondaryColor);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        
        // Warning border
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, size-4, size-4);
    } else {
        // Standard entrance with arrow
        ctx.fillStyle = themeConfig.glowColor || '#FFD700';
        ctx.beginPath();
        ctx.moveTo(size/2, size/4);
        ctx.lineTo(size*3/4, size*3/4);
        ctx.lineTo(size/4, size*3/4);
        ctx.closePath();
        ctx.fill();
        
        // Border
        ctx.strokeStyle = themeConfig.glowColor || '#FFD700';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, size-4, size-4);
    }
    
    // Add text label if not too dark
    if (!themeConfig.voidEffect) {
        ctx.fillStyle = themeConfig.voidEffect ? '#FFFFFF' : '#000000';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('EXIT', size/2, size/2);
    }
}

/**
 * Generate wall with ore tile
 */
function generateWallOreTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = THEMES[theme];
    
    // First draw base wall
    generateWallTile(canvas, ctx, theme, 1);
    
    // Add ore veins with glow effect if available
    ctx.strokeStyle = themeConfig.oreColor;
    ctx.fillStyle = themeConfig.oreColor;
    
    // Add glow behind ore if theme has glow
    if (themeConfig.glowColor) {
        ctx.shadowColor = themeConfig.glowColor;
        ctx.shadowBlur = 10;
    }
    
    if (variation === 1) {
        // Large vein
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(10, 75);
        ctx.quadraticCurveTo(width/2, height/2, width-10, height-10);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(width/2, height/2 + 10, 8, 0, Math.PI * 2);
        ctx.fill();
    } else if (variation === 2) {
        // Multiple veins
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * width, 65);
            ctx.lineTo(Math.random() * width, height);
            ctx.stroke();
        }
    } else if (variation === 3) {
        // Ore clusters
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(
                10 + Math.random() * (width - 20),
                75 + Math.random() * (height - 85),
                3 + Math.random() * 5,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }
    
    ctx.shadowBlur = 0;
    
    // Add sparkles
    ctx.fillStyle = themeConfig.glowColor || '#FFFFFF';
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 5; i++) {
        const x = Math.random() * width;
        const y = 65 + Math.random() * (height - 65);
        ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1.0;
    
    // Re-add black rectangle at top
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, 65);
}

/**
 * Generate rare ore tile
 */
function generateRareOreTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = THEMES[theme];
    
    // Create special background
    const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height)/2);
    gradient.addColorStop(0, themeConfig.oreColor);
    gradient.addColorStop(0.5, themeConfig.accentColor);
    gradient.addColorStop(1, themeConfig.primaryColor);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 65, width, height - 65);
    
    // Add glow effect
    if (themeConfig.glowColor) {
        ctx.shadowColor = themeConfig.glowColor;
        ctx.shadowBlur = 15;
    }
    
    // Crystal formations
    if (variation === 1) {
        // Large central crystal
        ctx.fillStyle = themeConfig.oreColor;
        ctx.beginPath();
        ctx.moveTo(width/2, 70);
        ctx.lineTo(width*3/4, height/2);
        ctx.lineTo(width/2, height-5);
        ctx.lineTo(width/4, height/2);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = themeConfig.glowColor || '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (variation === 2) {
        // Multiple crystals
        for (let i = 0; i < 4; i++) {
            const x = 10 + Math.random() * (width - 20);
            const y = 70 + Math.random() * (height - 80);
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
            
            ctx.strokeStyle = themeConfig.glowColor || '#FFFFFF';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    } else if (variation === 3) {
        // Geode pattern
        ctx.fillStyle = themeConfig.secondaryColor;
        ctx.beginPath();
        ctx.arc(width/2, height/2 + 10, 20, 0, Math.PI * 2);
        ctx.fill();
        
        // Crystal ring
        const crystalCount = 8;
        for (let i = 0; i < crystalCount; i++) {
            const angle = (Math.PI * 2 / crystalCount) * i;
            const x = width/2 + Math.cos(angle) * 18;
            const y = height/2 + 10 + Math.sin(angle) * 18;
            
            ctx.fillStyle = themeConfig.oreColor;
            ctx.beginPath();
            ctx.moveTo(x, y - 4);
            ctx.lineTo(x + 3, y);
            ctx.lineTo(x, y + 4);
            ctx.lineTo(x - 3, y);
            ctx.closePath();
            ctx.fill();
        }
    }
    
    ctx.shadowBlur = 0;
    
    // Add intense sparkles
    ctx.fillStyle = themeConfig.glowColor || '#FFFFFF';
    for (let i = 0; i < 10; i++) {
        ctx.globalAlpha = Math.random() * 0.8 + 0.2;
        const x = Math.random() * width;
        const y = 65 + Math.random() * (height - 65);
        
        // Star-shaped sparkle
        ctx.beginPath();
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x + 1, y);
        ctx.lineTo(x, y + 2);
        ctx.lineTo(x - 1, y);
        ctx.closePath();
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;
    
    // Add black rectangle at top
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, 65);
}

/**
 * Generate reinforced wall tile
 */
function generateReinforcedWallTile(canvas, ctx, theme, variation) {
    const width = 64;
    const height = 90;
    const themeConfig = THEMES[theme];
    
    // Metallic gradient background
    const gradient = ctx.createLinearGradient(0, 65, 0, height);
    gradient.addColorStop(0, '#696969');
    gradient.addColorStop(0.3, themeConfig.primaryColor);
    gradient.addColorStop(0.7, '#2F2F2F');
    gradient.addColorStop(1, '#1C1C1C');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 65, width, height - 65);
    
    // Add theme-specific reinforcement
    if (themeConfig.glowColor) {
        // Energy-reinforced
        ctx.strokeStyle = themeConfig.glowColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        
        // Energy grid
        for (let x = 0; x < width; x += 16) {
            ctx.beginPath();
            ctx.moveTo(x, 65);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 65; y < height; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }
    
    // Pattern variations
    if (variation === 1) {
        // Large plates with rivets
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 73, width-16, height-78);
        
        // Rivets
        ctx.fillStyle = '#C0C0C0';
        const rivetPositions = [
            [12, 77], [width-12, 77],
            [12, height-5], [width-12, height-5]
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
            ctx.moveTo(x, 65);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        for (let y = 65; y < height; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    } else if (variation === 3) {
        // Diamond plate
        ctx.fillStyle = '#3C3C3C';
        const diamondSize = 12;
        
        for (let y = 65; y < height; y += diamondSize) {
            for (let x = 0; x < width; x += diamondSize * 2) {
                const offsetX = ((y - 65) / diamondSize) % 2 === 0 ? 0 : diamondSize;
                
                if (x + offsetX + diamondSize <= width) {
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
        }
    }
    
    // Add black rectangle at top
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
    
    ctx.clearRect(0, 0, size, size);
    
    // Create portal with theme colors
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    
    if (themeConfig.voidEffect) {
        gradient.addColorStop(0, '#000000');
        gradient.addColorStop(0.3, '#220044');
        gradient.addColorStop(0.6, '#440088');
        gradient.addColorStop(1, 'rgba(68, 0, 136, 0)');
    } else {
        gradient.addColorStop(0, '#E6E6FA');
        gradient.addColorStop(0.3, '#9932CC');
        gradient.addColorStop(0.6, '#4B0082');
        gradient.addColorStop(1, 'rgba(75, 0, 130, 0)');
    }
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Add swirl effect
    ctx.strokeStyle = themeConfig.glowColor || '#FFFFFF';
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
    
    // Fuse spark with theme color
    const sparkGradient = ctx.createRadialGradient(size/2, size/2 - size/3 - 10, 0, size/2, size/2 - size/3 - 10, 8);
    sparkGradient.addColorStop(0, themeConfig.glowColor || '#FFFF00');
    sparkGradient.addColorStop(0.5, themeConfig.oreColor || '#FF4500');
    sparkGradient.addColorStop(1, 'rgba(255, 69, 0, 0)');
    
    ctx.fillStyle = sparkGradient;
    ctx.beginPath();
    ctx.arc(size/2, size/2 - size/3 - 10, 8, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * Generate toxic fog
 */
function generateToxicFog(canvas, ctx, theme) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    ctx.clearRect(0, 0, size, size);
    
    // Theme-colored fog
    let fogColor = 'rgba(0, 255, 0, 0.8)';
    let fogColor2 = 'rgba(0, 200, 0, 0.5)';
    let fogColor3 = 'rgba(0, 150, 0, 0)';
    
    if (themeConfig.digestiveEffect) {
        fogColor = 'rgba(139, 0, 0, 0.8)';
        fogColor2 = 'rgba(100, 0, 0, 0.5)';
        fogColor3 = 'rgba(50, 0, 0, 0)';
    } else if (themeConfig.voidEffect) {
        fogColor = 'rgba(75, 0, 130, 0.8)';
        fogColor2 = 'rgba(50, 0, 100, 0.5)';
        fogColor3 = 'rgba(25, 0, 50, 0)';
    }
    
    const fogGradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    fogGradient.addColorStop(0, fogColor);
    fogGradient.addColorStop(0.5, fogColor2);
    fogGradient.addColorStop(1, fogColor3);
    
    ctx.fillStyle = fogGradient;
    
    // Multiple overlapping circles
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
    
    ctx.clearRect(0, 0, size, size);
    
    // Pressure plate with theme colors
    ctx.fillStyle = themeConfig.secondaryColor || '#654321';
    ctx.fillRect(8, 8, size-16, size-16);
    
    // Inner plate gradient
    const gradient = ctx.createLinearGradient(12, 12, size-12, size-12);
    gradient.addColorStop(0, themeConfig.primaryColor || '#8B4513');
    gradient.addColorStop(0.5, themeConfig.accentColor || '#A0522D');
    gradient.addColorStop(1, themeConfig.secondaryColor || '#6B4423');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(12, 12, size-24, size-24);
    
    // Add warning pattern
    if (themeConfig.glowColor) {
        ctx.strokeStyle = themeConfig.glowColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        
        // Warning lines
        for (let i = 0; i < 4; i++) {
            const offset = i * 8;
            ctx.beginPath();
            ctx.moveTo(12 + offset, 12);
            ctx.lineTo(12, 12 + offset);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(size - 12 - offset, 12);
            ctx.lineTo(size - 12, 12 + offset);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }
    
    // X pattern
    ctx.strokeStyle = '#4A2C17';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(size-20, size-20);
    ctx.moveTo(size-20, 20);
    ctx.lineTo(20, size-20);
    ctx.stroke();
    
    // Border
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
    
    ctx.clearRect(0, 0, size, size);
    
    // Chest base with theme-influenced colors
    const gradient = ctx.createLinearGradient(10, 25, size-10, size-10);
    
    if (themeConfig.glowColor) {
        gradient.addColorStop(0, themeConfig.glowColor);
        gradient.addColorStop(0.3, '#FFD700');
        gradient.addColorStop(0.7, '#FFA500');
        gradient.addColorStop(1, '#B8860B');
    } else {
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(0.3, '#FFA500');
        gradient.addColorStop(0.7, '#FF8C00');
        gradient.addColorStop(1, '#B8860B');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(10, 25, size-20, size-35);
    
    // Chest lid
    ctx.fillStyle = themeConfig.primaryColor || '#8B4513';
    ctx.beginPath();
    ctx.moveTo(8, 25);
    ctx.quadraticCurveTo(size/2, 10, size-8, 25);
    ctx.lineTo(size-10, 30);
    ctx.quadraticCurveTo(size/2, 15, 10, 30);
    ctx.closePath();
    ctx.fill();
    
    // Metal bands
    ctx.fillStyle = '#696969';
    ctx.fillRect(8, 28, size-16, 3);
    ctx.fillRect(8, size-15, size-16, 3);
    
    // Lock
    ctx.fillStyle = '#2F4F4F';
    ctx.fillRect(size/2 - 5, 35, 10, 10);
    
    // Keyhole
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(size/2, 39, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(size/2 - 1, 39, 2, 4);
    
    // Sparkles
    ctx.fillStyle = themeConfig.glowColor || '#FFFFFF';
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
    
    ctx.clearRect(0, 0, size, size);
    
    // Ornate chest with radial gradient
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    
    if (themeConfig.glowColor) {
        gradient.addColorStop(0, themeConfig.glowColor);
        gradient.addColorStop(0.3, '#FFD700');
        gradient.addColorStop(0.6, themeConfig.oreColor);
        gradient.addColorStop(1, themeConfig.primaryColor);
    } else {
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(0.3, '#FFA500');
        gradient.addColorStop(0.6, '#B8860B');
        gradient.addColorStop(1, '#8B4513');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(8, 22, size-16, size-32);
    
    // Ornate lid
    ctx.fillStyle = themeConfig.primaryColor || '#4B0082';
    ctx.beginPath();
    ctx.moveTo(6, 22);
    ctx.quadraticCurveTo(size/2, 5, size-6, 22);
    ctx.lineTo(size-8, 28);
    ctx.quadraticCurveTo(size/2, 11, 8, 28);
    ctx.closePath();
    ctx.fill();
    
    // Jewels with theme colors
    const jewelColors = themeConfig.cosmicEffect ? 
        ['#0000FF', '#00FFFF', '#FF00FF', '#FFFF00'] :
        themeConfig.lavaEffect ?
        ['#FF0000', '#FF6600', '#FFFF00', '#FF3300'] :
        ['#FF1493', '#00CED1', '#32CD32', '#FFD700'];
        
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
    ctx.fillStyle = themeConfig.glowColor || '#FFD700';
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
 * Generate images for a specific theme
 */
async function generateThemeImages(theme) {
    // Skip non-mine themes
    if (theme === 'minerInn' || theme === 'hunterLodge' || theme === 'nobleRest') {
        console.log(`Skipping non-mine theme: ${theme}`);
        return 0;
    }
    
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
                console.log(`  Exists: ${fileName}`);
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
            console.log(`  Exists: ${fileName}`);
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
    console.log('Starting complete mine image generation...\n');
    console.log('This will generate images for:');
    console.log('- Base mines (coalMine, topazMine, etc.)');
    console.log('- Deep variations (coalMineDeep, topazMineDeep, etc.)');
    console.log('- Ultra variations (coalMineUltra, topazMineUltra, etc.)');
    console.log('- Special mines (gluttonyMine, rustyRelicMine, abyssalAdamantiteMine)');
    console.log('\n' + '='.repeat(60) + '\n');
    
    let totalGenerated = 0;
    const startTime = Date.now();
    
    // Process all themes
    for (const theme of Object.keys(THEMES)) {
        const themeConfig = THEMES[theme];
        console.log(`\nProcessing: ${themeConfig.name} (${theme})`);
        console.log('-'.repeat(50));
        
        const count = await generateThemeImages(theme);
        totalGenerated += count;
        
        if (count > 0) {
            console.log(`  ✓ Generated ${count} new images`);
        } else {
            console.log(`  ✓ All images already exist`);
        }
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n✨ Generation Complete!`);
    console.log(`   Total images generated: ${totalGenerated}`);
    console.log(`   Time elapsed: ${elapsedTime} seconds`);
    console.log(`   All mine variations are now ready!`);
    console.log('\n' + '='.repeat(60));
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
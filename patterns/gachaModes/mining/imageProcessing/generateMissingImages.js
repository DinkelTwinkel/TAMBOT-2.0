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
    floor: { variations: 3, generator: 'generateFloorTile' },
    wall: { variations: 3, generator: 'generateWallTile' },
    entrance: { variations: 1, generator: 'generateEntranceTile' },
    wallOre: { variations: 3, generator: 'generateWallOreTile' },
    rareOre: { variations: 2, generator: 'generateRareOreTile' },
    wallReinforced: { variations: 2, generator: 'generateReinforcedWallTile' }
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
 * Generate floor tile
 */
function generateFloorTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Base floor color
    ctx.fillStyle = themeConfig.secondaryColor;
    ctx.fillRect(0, 0, size, size);
    
    // Add texture patterns based on variation
    if (variation === 1) {
        // Stone pattern
        ctx.fillStyle = themeConfig.primaryColor;
        for (let i = 0; i < 3; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const w = 10 + Math.random() * 20;
            const h = 10 + Math.random() * 20;
            ctx.globalAlpha = 0.3;
            ctx.fillRect(x, y, w, h);
        }
    } else if (variation === 2) {
        // Crack pattern
        ctx.strokeStyle = themeConfig.primaryColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.random() * size, 0);
        ctx.lineTo(Math.random() * size, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, Math.random() * size);
        ctx.lineTo(size, Math.random() * size);
        ctx.stroke();
    } else if (variation === 3) {
        // Dots pattern
        ctx.fillStyle = themeConfig.primaryColor;
        ctx.globalAlpha = 0.2;
        for (let x = 8; x < size; x += 16) {
            for (let y = 8; y < size; y += 16) {
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    ctx.globalAlpha = 1.0;
    
    // Add border
    ctx.strokeStyle = themeConfig.primaryColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, size, size);
}

/**
 * Generate wall tile
 */
function generateWallTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Base wall
    ctx.fillStyle = themeConfig.primaryColor;
    ctx.fillRect(0, 0, size, size);
    
    // Add depth/texture
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, themeConfig.accentColor);
    gradient.addColorStop(0.5, themeConfig.primaryColor);
    gradient.addColorStop(1, themeConfig.secondaryColor);
    
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1.0;
    
    // Add variation details
    if (variation === 1) {
        // Brick pattern
        ctx.strokeStyle = themeConfig.secondaryColor;
        ctx.lineWidth = 2;
        for (let y = 0; y < size; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(size, y);
            ctx.stroke();
        }
        for (let y = 0; y < size; y += 32) {
            for (let x = 0; x < size; x += 32) {
                ctx.beginPath();
                ctx.moveTo(x + (y % 32 === 0 ? 0 : 16), y);
                ctx.lineTo(x + (y % 32 === 0 ? 0 : 16), y + 16);
                ctx.stroke();
            }
        }
    } else if (variation === 2) {
        // Rock face
        ctx.fillStyle = themeConfig.secondaryColor;
        for (let i = 0; i < 5; i++) {
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(
                Math.random() * size,
                Math.random() * size,
                5 + Math.random() * 10,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    } else if (variation === 3) {
        // Rough texture
        for (let i = 0; i < 20; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? themeConfig.secondaryColor : themeConfig.accentColor;
            ctx.globalAlpha = 0.2;
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.fillRect(x, y, 3, 3);
        }
    }
    
    ctx.globalAlpha = 1.0;
    
    // Highlight edges
    ctx.strokeStyle = themeConfig.accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size);
    ctx.stroke();
    
    // Shadow edges
    ctx.strokeStyle = themeConfig.secondaryColor;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(size, size);
    ctx.moveTo(0, size);
    ctx.lineTo(size, size);
    ctx.stroke();
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
 * Generate wall with ore tile
 */
function generateWallOreTile(canvas, ctx, theme, variation) {
    const size = 64;
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
        ctx.quadraticCurveTo(size/2, size/3, size-10, size-10);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(size/2, size/2, 8, 0, Math.PI * 2);
        ctx.fill();
    } else if (variation === 2) {
        // Multiple small veins
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * size, 0);
            ctx.lineTo(Math.random() * size, size);
            ctx.stroke();
        }
    } else if (variation === 3) {
        // Ore clusters
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(
                10 + Math.random() * (size - 20),
                10 + Math.random() * (size - 20),
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
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1.0;
}

/**
 * Generate rare ore tile
 */
function generateRareOreTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Base wall with special coloring
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, themeConfig.oreColor);
    gradient.addColorStop(0.5, themeConfig.accentColor);
    gradient.addColorStop(1, themeConfig.primaryColor);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Add crystal formations
    if (variation === 1) {
        // Large central crystal
        ctx.fillStyle = themeConfig.oreColor;
        ctx.beginPath();
        ctx.moveTo(size/2, 10);
        ctx.lineTo(size*3/4, size/2);
        ctx.lineTo(size/2, size-10);
        ctx.lineTo(size/4, size/2);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        // Multiple small crystals
        for (let i = 0; i < 4; i++) {
            const x = 10 + Math.random() * (size - 20);
            const y = 10 + Math.random() * (size - 20);
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
    }
    
    // Add sparkles
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 8; i++) {
        ctx.globalAlpha = Math.random() * 0.8 + 0.2;
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1.0;
}

/**
 * Generate reinforced wall tile
 */
function generateReinforcedWallTile(canvas, ctx, theme, variation) {
    const size = 64;
    const themeConfig = THEMES[theme];
    
    // Base wall with metallic look
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#696969');
    gradient.addColorStop(0.3, themeConfig.primaryColor);
    gradient.addColorStop(0.7, '#2F2F2F');
    gradient.addColorStop(1, '#1C1C1C');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Add metal plates
    if (variation === 1) {
        // Large plates with rivets
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 8, size-16, size-16);
        
        // Rivets
        ctx.fillStyle = '#C0C0C0';
        const rivetPositions = [
            [12, 12], [size-12, 12],
            [12, size-12], [size-12, size-12]
        ];
        
        for (const [x, y] of rivetPositions) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#808080';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    } else {
        // Grid pattern
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        
        for (let x = 0; x < size; x += 16) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, size);
            ctx.stroke();
        }
        
        for (let y = 0; y < size; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(size, y);
            ctx.stroke();
        }
        
        // Add bolts at intersections
        ctx.fillStyle = '#808080';
        for (let x = 16; x < size; x += 16) {
            for (let y = 16; y < size; y += 16) {
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
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
            
            const canvas = createCanvas(64, 64);
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
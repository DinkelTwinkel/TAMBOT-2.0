/**
 * Fire Trap Image Generator
 * Generates static fire trap images for different themes and sizes
 */

const { createCanvas } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

// Theme configurations for fire traps
const FIRE_THEMES = {
    generic: {
        flameColors: ['#FFFFFF', '#FFFF99', '#FFD700', '#FFA500', '#FF6B35'],
        emberColor: '#FF4500',
        scorchColor: '#2B1810'
    },
    coalMine: {
        flameColors: ['#FFFFFF', '#FFFF99', '#FFD700', '#FF8C00', '#FF4500'],
        emberColor: '#DC143C',
        scorchColor: '#1A0A00'
    },
    diamondMine: {
        flameColors: ['#E0FFFF', '#B0E0E6', '#87CEEB', '#4682B4', '#1E90FF'],
        emberColor: '#4169E1',
        scorchColor: '#0A1A2A'
    },
    rubyMine: {
        flameColors: ['#FFFFFF', '#FFB6C1', '#FF69B4', '#DC143C', '#8B0000'],
        emberColor: '#B22222',
        scorchColor: '#2B0810'
    },
    emeraldMine: {
        flameColors: ['#F0FFF0', '#90EE90', '#32CD32', '#228B22', '#006400'],
        emberColor: '#2E8B57',
        scorchColor: '#0A2A0A'
    },
    obsidianMine: {
        flameColors: ['#E6E6FA', '#9370DB', '#8A2BE2', '#4B0082', '#310062'],
        emberColor: '#483D8B',
        scorchColor: '#1A0A2A'
    },
    mythrilMine: {
        flameColors: ['#FFFFFF', '#E6E6FA', '#B8B8FF', '#9999FF', '#7070FF'],
        emberColor: '#6495ED',
        scorchColor: '#1A1A3A'
    }
};

/**
 * Generate a single fire trap image
 * @param {number} size - Size of the image (width and height)
 * @param {Object} theme - Theme configuration
 * @param {number} frame - Animation frame (0-9) for variations
 * @returns {Canvas} - Canvas with the fire trap image
 */
function generateFireTrapImage(size, theme, frame = 0) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Clear canvas with transparency
    ctx.clearRect(0, 0, size, size);
    
    const centerX = size / 2;
    const centerY = size / 2;
    const fireSize = size * 0.8;
    
    // Draw scorch mark base
    const scorchGradient = ctx.createRadialGradient(
        centerX, centerY + fireSize * 0.35, 0,
        centerX, centerY + fireSize * 0.35, fireSize * 0.6
    );
    scorchGradient.addColorStop(0, theme.scorchColor + 'CC');
    scorchGradient.addColorStop(0.7, theme.scorchColor + '66');
    scorchGradient.addColorStop(1, theme.scorchColor + '00');
    
    ctx.fillStyle = scorchGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + fireSize * 0.35, fireSize * 0.5, fireSize * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw ember base
    const emberGradient = ctx.createRadialGradient(
        centerX, centerY + fireSize * 0.25, 0,
        centerX, centerY + fireSize * 0.25, fireSize * 0.4
    );
    emberGradient.addColorStop(0, theme.emberColor);
    emberGradient.addColorStop(0.5, theme.emberColor + 'AA');
    emberGradient.addColorStop(1, theme.emberColor + '00');
    
    ctx.fillStyle = emberGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + fireSize * 0.25, fireSize * 0.35, fireSize * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw multiple flame layers
    const flames = [
        { size: fireSize, offset: 0, alpha: 0.9 },
        { size: fireSize * 0.75, offset: -fireSize * 0.1, alpha: 0.7 },
        { size: fireSize * 0.5, offset: -fireSize * 0.2, alpha: 0.5 }
    ];
    
    flames.forEach((flame, index) => {
        ctx.save();
        ctx.globalAlpha = flame.alpha;
        
        // Add variation based on frame
        const waveOffset = Math.sin((frame + index) * 0.628) * fireSize * 0.03;
        const heightVariation = 1 + Math.sin((frame + index * 2) * 0.314) * 0.08;
        
        // Create flame gradient
        const flameGradient = ctx.createRadialGradient(
            centerX + waveOffset, centerY + flame.offset, 0,
            centerX + waveOffset, centerY + flame.offset, flame.size / 2
        );
        
        // Apply theme colors
        theme.flameColors.forEach((color, i) => {
            flameGradient.addColorStop(i / (theme.flameColors.length - 1), color);
        });
        
        // Draw flame shape
        ctx.fillStyle = flameGradient;
        ctx.beginPath();
        
        const flameHeight = flame.size * heightVariation * 0.7;
        const flameWidth = flame.size * 0.5;
        
        // Create flame path
        ctx.moveTo(centerX + waveOffset, centerY + flame.offset - flameHeight * 0.5);
        
        // Left curve
        ctx.quadraticCurveTo(
            centerX + waveOffset - flameWidth * 0.4, 
            centerY + flame.offset - flameHeight * 0.2,
            centerX + waveOffset - flameWidth * 0.3, 
            centerY + flame.offset + flameHeight * 0.1
        );
        
        // Bottom curve
        ctx.quadraticCurveTo(
            centerX + waveOffset - flameWidth * 0.2, 
            centerY + flame.offset + flameHeight * 0.3,
            centerX + waveOffset, 
            centerY + flame.offset + flameHeight * 0.35
        );
        
        // Right side
        ctx.quadraticCurveTo(
            centerX + waveOffset + flameWidth * 0.2, 
            centerY + flame.offset + flameHeight * 0.3,
            centerX + waveOffset + flameWidth * 0.3, 
            centerY + flame.offset + flameHeight * 0.1
        );
        
        // Right curve back to top
        ctx.quadraticCurveTo(
            centerX + waveOffset + flameWidth * 0.4, 
            centerY + flame.offset - flameHeight * 0.2,
            centerX + waveOffset, 
            centerY + flame.offset - flameHeight * 0.5
        );
        
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    });
    
    // Add spark particles
    if (size >= 64) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        
        for (let i = 0; i < 8; i++) {
            const sparkAngle = (frame + i) * 0.785; // Distribute sparks
            const sparkRadius = fireSize * 0.3 + Math.sin(sparkAngle) * fireSize * 0.1;
            const sparkX = centerX + Math.cos(sparkAngle) * sparkRadius * 0.5;
            const sparkY = centerY - fireSize * 0.1 + Math.sin(sparkAngle) * sparkRadius * 0.3;
            const sparkSize = Math.max(1, size * 0.02);
            
            // Use brightest color from theme
            ctx.fillStyle = theme.flameColors[1];
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    // Add heat glow overlay
    ctx.save();
    ctx.globalAlpha = 0.15;
    const glowGradient = ctx.createRadialGradient(
        centerX, centerY - fireSize * 0.1, 0,
        centerX, centerY - fireSize * 0.1, fireSize * 0.8
    );
    glowGradient.addColorStop(0, theme.flameColors[2]);
    glowGradient.addColorStop(0.5, theme.flameColors[3] + '80');
    glowGradient.addColorStop(1, theme.flameColors[4] + '00');
    
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY - fireSize * 0.1, fireSize * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    return canvas;
}

/**
 * Generate fire trap images for all themes and sizes
 * @param {string} outputDir - Directory to save the images
 */
async function generateAllFireTrapImages(outputDir = './assets/game/encounters') {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    // Sizes to generate
    const sizes = [32, 64, 128, 256];
    
    // Number of animation frames
    const frames = 3;
    
    console.log('Generating fire trap images...');
    
    for (const [themeName, themeConfig] of Object.entries(FIRE_THEMES)) {
        console.log(`  Generating theme: ${themeName}`);
        
        for (const size of sizes) {
            for (let frame = 0; frame < frames; frame++) {
                const canvas = generateFireTrapImage(size, themeConfig, frame);
                
                // Generate filename
                const filename = frame === 0 
                    ? `${themeName}_fire_blast_${size}.png`
                    : `${themeName}_fire_blast_${size}_frame${frame}.png`;
                
                const filePath = path.join(outputDir, filename);
                
                // Save the image
                const buffer = canvas.toBuffer('image/png');
                await fs.writeFile(filePath, buffer);
                
                console.log(`    Created: ${filename}`);
            }
        }
    }
    
    // Also generate the base fire_blast images without theme prefix for fallback
    console.log('  Generating generic fire_blast images...');
    for (const size of sizes) {
        for (let frame = 0; frame < frames; frame++) {
            const canvas = generateFireTrapImage(size, FIRE_THEMES.generic, frame);
            
            const filename = frame === 0 
                ? `fire_blast_${size}.png`
                : `fire_blast_${size}_frame${frame}.png`;
            
            const filePath = path.join(outputDir, filename);
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(filePath, buffer);
            
            console.log(`    Created: ${filename}`);
        }
    }
    
    console.log('Fire trap image generation complete!');
}

// Export functions
module.exports = {
    generateFireTrapImage,
    generateAllFireTrapImages,
    FIRE_THEMES
};

// Run if called directly
if (require.main === module) {
    generateAllFireTrapImages().catch(console.error);
}

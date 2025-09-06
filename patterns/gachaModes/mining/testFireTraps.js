/**
 * Test script for fire trap rendering
 * Run this to test fire trap generation and rendering
 */

const { createCanvas } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

// Import the fire trap generator
const { generateAllFireTrapImages } = require('./imageProcessing/generateFireTrapImages');

// Import the drawing function from the main renderer
const { drawFireTrap } = require('./imageProcessing/mining-layered-render');

/**
 * Test fire trap rendering directly
 */
async function testFireTrapRendering() {
    console.log('Testing fire trap rendering...\n');
    
    // Create test canvas
    const testSizes = [64, 128, 256];
    
    for (const size of testSizes) {
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        
        // Fill with dark background to see the fire better
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, size, size);
        
        // Test different animation frames
        for (let frame = 0; frame < 5; frame++) {
            // Clear for each frame
            ctx.fillStyle = '#1A1A1A';
            ctx.fillRect(0, 0, size, size);
            
            // Draw fire trap
            const centerX = size / 2;
            const centerY = size / 2;
            const tileSize = size * 0.9;
            
            // Call the draw function (note: this is a simplified test call)
            // In actual use, this would be called from the main renderer
            drawTestFireTrap(ctx, centerX, centerY, tileSize, true, true, frame * 10);
            
            // Save test image
            const outputPath = path.join(
                __dirname, 
                `test_fire_trap_${size}_frame${frame}.png`
            );
            
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(outputPath, buffer);
            
            console.log(`Created test image: ${outputPath}`);
        }
    }
    
    console.log('\nTest images created successfully!');
}

/**
 * Simplified fire trap drawing for testing
 */
function drawTestFireTrap(ctx, centerX, centerY, tileSize, isVisible, wasDiscovered, animationFrame = 0) {
    const fireSize = Math.max(tileSize * 0.8, 16);
    
    // Create multiple flame layers for depth
    const flames = [
        { size: fireSize, offset: 0, alpha: 0.9 },
        { size: fireSize * 0.8, offset: -fireSize * 0.1, alpha: 0.7 },
        { size: fireSize * 0.6, offset: -fireSize * 0.2, alpha: 0.5 }
    ];
    
    ctx.save();
    
    // Draw base embers/coals
    const emberGradient = ctx.createRadialGradient(
        centerX, centerY + fireSize * 0.3, 0,
        centerX, centerY + fireSize * 0.3, fireSize * 0.5
    );
    emberGradient.addColorStop(0, '#FF4500');
    emberGradient.addColorStop(0.5, '#8B0000');
    emberGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = emberGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + fireSize * 0.3, fireSize * 0.4, fireSize * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw flame layers
    flames.forEach((flame, index) => {
        ctx.save();
        ctx.globalAlpha = flame.alpha;
        
        // Animate flame with sine wave
        const waveOffset = Math.sin(animationFrame * 0.1 + index) * fireSize * 0.05;
        const heightVariation = 1 + Math.sin(animationFrame * 0.15 + index * 0.5) * 0.1;
        
        // Create flame gradient
        const flameGradient = ctx.createRadialGradient(
            centerX + waveOffset, centerY + flame.offset, 0,
            centerX + waveOffset, centerY + flame.offset, flame.size / 2
        );
        
        // Inner core - white hot
        flameGradient.addColorStop(0, '#FFFFFF');
        flameGradient.addColorStop(0.2, '#FFFF99');
        flameGradient.addColorStop(0.4, '#FFD700');
        flameGradient.addColorStop(0.6, '#FFA500');
        flameGradient.addColorStop(0.8, '#FF6B35');
        flameGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        
        // Draw flame shape using bezier curves
        ctx.fillStyle = flameGradient;
        ctx.beginPath();
        
        const flameHeight = flame.size * heightVariation;
        const flameWidth = flame.size * 0.6;
        
        // Flame path
        ctx.moveTo(centerX + waveOffset, centerY + flame.offset - flameHeight * 0.5);
        ctx.bezierCurveTo(
            centerX + waveOffset - flameWidth * 0.5, centerY + flame.offset - flameHeight * 0.3,
            centerX + waveOffset - flameWidth * 0.4, centerY + flame.offset + flameHeight * 0.2,
            centerX + waveOffset, centerY + flame.offset + flameHeight * 0.3
        );
        ctx.bezierCurveTo(
            centerX + waveOffset + flameWidth * 0.4, centerY + flame.offset + flameHeight * 0.2,
            centerX + waveOffset + flameWidth * 0.5, centerY + flame.offset - flameHeight * 0.3,
            centerX + waveOffset, centerY + flame.offset - flameHeight * 0.5
        );
        
        ctx.fill();
        ctx.restore();
    });
    
    // Add sparks
    ctx.save();
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 5; i++) {
        const sparkTime = (animationFrame * 0.02 + i * 0.4) % 1;
        const sparkY = centerY + fireSize * 0.3 - sparkTime * fireSize * 1.5;
        const sparkX = centerX + Math.sin(i * 2 + animationFrame * 0.05) * fireSize * 0.3;
        const sparkSize = Math.max(1, (1 - sparkTime) * tileSize * 0.05);
        
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    
    ctx.restore();
}

/**
 * Main test function
 */
async function runTests() {
    console.log('=== Fire Trap Test Suite ===\n');
    
    // Test 1: Generate static fire trap images
    console.log('Test 1: Generating static fire trap images...');
    try {
        await generateAllFireTrapImages('./test_fire_images');
        console.log('✅ Static image generation successful!\n');
    } catch (error) {
        console.error('❌ Static image generation failed:', error, '\n');
    }
    
    // Test 2: Test dynamic rendering
    console.log('Test 2: Testing dynamic fire trap rendering...');
    try {
        await testFireTrapRendering();
        console.log('✅ Dynamic rendering test successful!\n');
    } catch (error) {
        console.error('❌ Dynamic rendering test failed:', error, '\n');
    }
    
    console.log('=== All tests completed ===');
    console.log('\nCheck the following locations for generated images:');
    console.log('  - ./test_fire_images/ - Static fire trap images');
    console.log('  - ./test_fire_trap_*.png - Dynamic test renders');
}

// Run tests if called directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = {
    testFireTrapRendering,
    runTests
};

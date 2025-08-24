#!/usr/bin/env node

/**
 * Generate All Missing Mine Images
 * 
 * This script generates all missing mine images including:
 * - Base mine themes (coal, copper, topaz, iron, diamond, emerald, ruby, crystal, obsidian, mythril, adamantite, fossil)
 * - Deep variations (e.g., coalMineDeep, topazMineDeep)
 * - Ultra variations (e.g., coalMineUltra, topazMineUltra)
 * - Special mines (gluttonyMine, rustyRelicMine, abyssalAdamantiteMine)
 * 
 * Usage:
 *   node generateMineImages.js
 */

const path = require('path');
const fs = require('fs');

// Check if we're in the right directory
const currentDir = process.cwd();
const expectedPath = path.join('patterns', 'gachaModes', 'mining', 'imageProcessing');

if (!currentDir.includes('TAMBOT 2.0')) {
    console.error('❌ Error: This script must be run from the TAMBOT 2.0 directory');
    console.error('   Current directory:', currentDir);
    process.exit(1);
}

// Load the generation module
let generateModule;
try {
    const modulePath = path.join(__dirname, 'patterns', 'gachaModes', 'mining', 'imageProcessing', 'generateAllMines.js');
    
    // Check if the module exists
    if (!fs.existsSync(modulePath)) {
        console.error('❌ Error: generateAllMines.js not found at:', modulePath);
        console.error('   Make sure the generateAllMines.js file is in the correct location');
        process.exit(1);
    }
    
    generateModule = require(modulePath);
} catch (error) {
    console.error('❌ Error loading generation module:', error.message);
    process.exit(1);
}

// Display welcome message
console.log('\n' + '='.repeat(60));
console.log('       🛠️  TAMBOT 2.0 - Mine Image Generator  🛠️');
console.log('='.repeat(60));
console.log('\nThis tool will generate all missing mine images for your bot.');
console.log('Images will be created in:');
console.log('  • ./assets/game/tiles/');
console.log('  • ./assets/game/encounters/');
console.log('\n' + '='.repeat(60));

// Add a small delay for dramatic effect
setTimeout(async () => {
    console.log('\n🚀 Starting generation process...\n');
    
    try {
        // Run the generation
        await generateModule.generateAllMissingImages();
        
        console.log('\n✅ Success! All mine images have been generated.');
        console.log('   Your mining game modes are now ready to use!');
        
    } catch (error) {
        console.error('\n❌ Generation failed:', error);
        console.error('\nTroubleshooting tips:');
        console.error('1. Make sure you have the "canvas" package installed:');
        console.error('   npm install canvas');
        console.error('2. Check that the asset directories exist and are writable');
        console.error('3. Ensure you have enough disk space for the images');
        process.exit(1);
    }
}, 1000);

#!/usr/bin/env node

/**
 * Pre-generate all mining tile and encounter images
 * Run this script to generate all missing images at once
 * 
 * Usage: node generateAllMiningImages.js
 */

const { generateAllMissingImages } = require('../patterns/gachaModes/mining/imageProcessing/generateMissingImages');

console.log('='.repeat(60));
console.log(' MINING IMAGE GENERATOR');
console.log('='.repeat(60));
console.log('\nThis script will generate all missing tile and encounter images');
console.log('for the mining game mode based on themes from gachaServers.json\n');

console.log('Themes to generate:');
console.log('- Coal Mine, Copper Mine, Topaz Mine, Iron Mine');
console.log('- Diamond Mine, Emerald Mine, Ruby Mine, Crystal Mine');
console.log('- Obsidian Mine, Mythril Mine, Adamantite Mine, Fossil Mine');
console.log('- Generic (fallback)\n');

console.log('Image types:');
console.log('- Floor tiles (3 variations)');
console.log('- Wall tiles (3 variations with black top overlay)');
console.log('- Entrance tiles');
console.log('- Ore wall tiles (3 variations with black top overlay)');
console.log('- Rare ore tiles (3 variations with black top overlay)');
console.log('- Reinforced wall tiles (3 variations with black top overlay)');
console.log('- Portal traps, Bomb traps, Toxic fog');
console.log('- Wall traps, Treasure chests, Rare treasures\n');

console.log('Starting generation...\n');

generateAllMissingImages()
    .then(() => {
        console.log('\n' + '='.repeat(60));
        console.log(' IMAGE GENERATION COMPLETE!');
        console.log('='.repeat(60));
        console.log('\nAll images have been generated successfully.');
        console.log('They are saved in:');
        console.log('- ./assets/game/tiles/ (for tile images)');
        console.log('- ./assets/game/encounters/ (for encounter images)\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n' + '='.repeat(60));
        console.error(' ERROR DURING GENERATION');
        console.error('='.repeat(60));
        console.error('\nAn error occurred:', error);
        process.exit(1);
    });
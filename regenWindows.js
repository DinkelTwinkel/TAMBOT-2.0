const { generateThemeImages } = require('./patterns/gachaModes/imageProcessing/generateInnImages');

async function regenWindows() {
    console.log('🪟 Regenerating windows with wall-colored frames...');
    
    const themes = ['minerInn', 'hunterLodge', 'nobleRest', 'generic'];
    let total = 0;
    
    for (const theme of themes) {
        const count = await generateThemeImages(theme);
        total += count;
        console.log(`${theme}: ${count} images`);
    }
    
    console.log(`✅ Total: ${total} window textures regenerated`);
}

regenWindows().catch(console.error);


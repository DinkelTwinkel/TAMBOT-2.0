// Temporary file to find and fix the pickaxe breaking issue
// This searches for the pickaxe breaking section in the main file

const fs = require('fs').promises;

async function findPickaxeBreakingCode() {
    const filePath = 'D:\\CODE\\TAMBOT 2.0\\patterns\\gachaModes\\mining_optimized_v5_performance.js';
    const content = await fs.readFile(filePath, 'utf8');
    
    // Find the processPlayerActionsEnhanced function
    const functionStart = content.indexOf('async function processPlayerActionsEnhanced');
    if (functionStart === -1) {
        console.log('Function not found in expected format, searching alternative...');
        // Look for where it's defined differently
        const altSearch = content.indexOf('processPlayerActionsEnhanced');
        console.log('Found at position:', altSearch);
    }
    
    // Search for pickaxe breaking related code
    const patterns = [
        'bestPickaxe',
        'checkPickaxeBreak',
        'shouldBreak',
        'pickaxe.quantity',
        'pickaxe.currentDurability',
        'durabilityLoss'
    ];
    
    for (const pattern of patterns) {
        const index = content.indexOf(pattern, functionStart > 0 ? functionStart : 0);
        if (index !== -1) {
            // Get surrounding context (500 chars before and after)
            const start = Math.max(0, index - 500);
            const end = Math.min(content.length, index + 1500);
            const context = content.substring(start, end);
            
            console.log(`\n=== Found "${pattern}" at position ${index} ===`);
            console.log(context);
            console.log('=== End of context ===\n');
        }
    }
}

findPickaxeBreakingCode().catch(console.error);

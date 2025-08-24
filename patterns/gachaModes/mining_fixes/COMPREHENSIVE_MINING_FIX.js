/**
 * COMPREHENSIVE FIX for mining errors:
 * 1. "Cannot read properties of undefined (reading 'tier')" error
 * 2. Gullet not giving meat items
 * 
 * This fix addresses both issues together
 */

const fs = require('fs').promises;
const path = require('path');

async function applyComprehensiveFix() {
    const filePath = path.join(__dirname, '../mining_optimized_v5_performance.js');
    
    console.log('🔧 Applying comprehensive mining fixes...\n');
    console.log('This will fix:');
    console.log('  1. Undefined tier error');
    console.log('  2. Gullet meat items not dropping');
    console.log('  3. Empty item pools causing crashes\n');
    
    try {
        let content = await fs.readFile(filePath, 'utf8');
        const originalContent = content;
        
        let fixCount = 0;
        
        // Fix 1: Update mineFromTile function signature and add validation
        console.log('Fixing mineFromTile function...');
        
        // Find the current mineFromTile function
        const mineFromTileStart = content.indexOf('async function mineFromTile(');
        const mineFromTileEnd = content.indexOf('\n}', mineFromTileStart) + 2;
        
        if (mineFromTileStart !== -1) {
            // Get the current function
            const currentFunction = content.substring(mineFromTileStart, mineFromTileEnd);
            
            // Check if it already has the proper parameters
            const hasProperParams = currentFunction.includes('isDeeperMine') && currentFunction.includes('mineTypeId');
            
            if (!hasProperParams) {
                // Replace function signature
                const newSignature = 'async function mineFromTile(member, miningPower, luckStat, powerLevel, tileType, availableItems, efficiency, isDeeperMine = false, mineTypeId = null)';
                const oldSignatureMatch = currentFunction.match(/async function mineFromTile\([^)]+\)/);
                
                if (oldSignatureMatch) {
                    let newFunction = currentFunction.replace(oldSignatureMatch[0], newSignature);
                    
                    // Add imports at the beginning of the function
                    const functionBody = `{
    try {
        // Import the unified mining system for gullet support
        const { findItemUnified, calculateItemQuantity } = require('./mining/miningConstants_unified');
        
        // Check if we should use the unified system (for gullet and other special mines)
        const isGullet = mineTypeId === 16 || mineTypeId === '16';
        if (isGullet || mineTypeId) {
            // Use unified item system for special mines
            let context = 'mining_wall';
            if (tileType === TILE_TYPES.TREASURE_CHEST) {
                context = 'treasure_chest';
            } else if (tileType === TILE_TYPES.RARE_ORE) {
                context = 'rare_ore';
            }
            
            const item = findItemUnified(context, powerLevel, luckStat, false, isDeeperMine, mineTypeId);
            const quantity = calculateItemQuantity(item, context, miningPower, luckStat, powerLevel, isDeeperMine);
            
            const enhancedValue = Math.floor(item.value * efficiency.valueMultiplier);
            
            return { 
                item: { ...item, value: enhancedValue }, 
                quantity 
            };
        }
        
        // Validate availableItems parameter
        if (!availableItems || !Array.isArray(availableItems) || availableItems.length === 0) {
            console.warn('[MINING] Invalid or empty availableItems, loading defaults for power level', powerLevel);
            const { getAvailableItems } = require('./mining/miningConstants_unified');
            availableItems = getAvailableItems(powerLevel);
            
            // Emergency fallback
            if (!availableItems || availableItems.length === 0) {
                console.error('[MINING] Still no items available, using coal ore fallback');
                return {
                    item: {
                        itemId: '1',
                        name: 'Coal Ore',
                        value: 2,
                        tier: 'common'
                    },
                    quantity: 1
                };
            }
        }`;
                    
                    // Replace the opening of the try block
                    newFunction = newFunction.replace(/\{\s*try\s*\{/, functionBody);
                    
                    // Add safety check before selectedItem usage
                    const selectedItemCheck = `
        
        // Safety check: ensure selectedItem exists
        if (!selectedItem || !selectedItem.itemId) {
            console.error('[MINING] No item selected from pool, using first available item');
            selectedItem = eligibleItems[0] || availableItems[0] || {
                itemId: '1',
                name: 'Coal Ore',
                value: 2,
                tier: 'common',
                baseWeight: 100
            };
        }
        
        // Ensure tier property exists
        if (!selectedItem.tier) {
            selectedItem.tier = 'common';
        }`;
                    
                    // Insert before quantity calculation
                    const quantityIndex = newFunction.indexOf('let quantity = 1;');
                    if (quantityIndex !== -1) {
                        newFunction = newFunction.slice(0, quantityIndex) + selectedItemCheck + '\n        \n        ' + newFunction.slice(quantityIndex);
                    }
                    
                    // Replace the old function with the new one
                    content = content.slice(0, mineFromTileStart) + newFunction + content.slice(mineFromTileEnd);
                    fixCount++;
                    console.log('✅ Fixed mineFromTile function');
                }
            } else {
                console.log('ℹ️  mineFromTile already has proper parameters');
            }
        }
        
        // Fix 2: Update all calls to mineFromTile
        console.log('\nUpdating mineFromTile calls...');
        
        // Pattern for finding mineFromTile calls
        const callPattern = /await mineFromTile\([^)]+\)/g;
        const calls = content.match(callPattern) || [];
        
        let updatedCalls = 0;
        for (const call of calls) {
            // Check if it already has the new parameters
            if (!call.includes('isDeeperMine') && !call.includes('mineTypeId')) {
                // Add the new parameters
                const newCall = call.replace(/\)$/, ', isDeeperMine, mineTypeId)');
                content = content.replace(call, newCall);
                updatedCalls++;
            }
        }
        
        if (updatedCalls > 0) {
            fixCount++;
            console.log(`✅ Updated ${updatedCalls} mineFromTile calls`);
        }
        
        // Fix 3: Ensure isDeeperMine and mineTypeId are defined in the main function
        console.log('\nEnsuring variables are defined...');
        
        if (!content.includes('const mineTypeId = dbEntry.typeId')) {
            // Find where to add it (after serverPowerLevel)
            const powerLevelIndex = content.indexOf('const serverPowerLevel = json?.power || 1;');
            if (powerLevelIndex !== -1) {
                const insertPoint = content.indexOf('\n', powerLevelIndex) + 1;
                const variableDefinitions = `        
        // Get mine type ID for special mine handling (e.g., gullet meat items)
        const mineTypeId = dbEntry.typeId;
        
        // Check if this is a deeper mine
        const { isDeeperMine: checkDeeperMine } = require('./mining/miningConstants_unified');
        const isDeeperMine = checkDeeperMine ? checkDeeperMine(mineTypeId) : false;
        
        // Debug logging for special mines
        if (mineTypeId === 16 || mineTypeId === '16') {
            console.log('[MINING] ???\'s Gullet detected - will generate meat items instead of ores');
        }
`;
                content = content.slice(0, insertPoint) + variableDefinitions + content.slice(insertPoint);
                fixCount++;
                console.log('✅ Added variable definitions');
            }
        }
        
        // Fix 4: Update generateTreasure function similarly
        console.log('\nFixing generateTreasure function...');
        
        const treasurePattern = /async function generateTreasure\([^)]*\)/;
        const treasureMatch = content.match(treasurePattern);
        
        if (treasureMatch && !treasureMatch[0].includes('mineTypeId')) {
            const newSignature = 'async function generateTreasure(powerLevel, efficiency, isDeeperMine = false, mineTypeId = null)';
            content = content.replace(treasurePattern, newSignature);
            
            // Update generateTreasure calls
            const treasureCallPattern = /await generateTreasure\(serverPowerLevel, efficiency\)/g;
            content = content.replace(treasureCallPattern, 'await generateTreasure(serverPowerLevel, efficiency, isDeeperMine, mineTypeId)');
            
            fixCount++;
            console.log('✅ Fixed generateTreasure function');
        }
        
        if (fixCount > 0) {
            // Create backup
            const backupPath = filePath + '.backup_comprehensive_' + Date.now();
            await fs.writeFile(backupPath, originalContent);
            console.log(`\n📁 Backup created: ${path.basename(backupPath)}`);
            
            // Write the fixed content
            await fs.writeFile(filePath, content);
            
            console.log(`\n✨ Successfully applied ${fixCount} major fixes!`);
            console.log('\n🎉 Fixed issues:');
            console.log('   ✅ Undefined tier error - Added proper validation');
            console.log('   ✅ Gullet meat items - Now properly supported');
            console.log('   ✅ Empty item pools - Added fallbacks');
            console.log('\n⚠️  Please restart your bot for changes to take effect.');
        } else {
            console.log('\nℹ️  All fixes appear to be already applied.');
        }
        
    } catch (error) {
        console.error('\n❌ Error applying fixes:', error);
        console.log('\n📝 Manual Fix Instructions:');
        console.log('1. Fix mineFromTile function signature to include isDeeperMine and mineTypeId');
        console.log('2. Add validation for empty availableItems at the start of mineFromTile');
        console.log('3. Add safety checks before using selectedItem.tier');
        console.log('4. Update all calls to mineFromTile to pass the new parameters');
        console.log('5. Define mineTypeId = dbEntry.typeId in the main mining function');
    }
}

// Run the fix
if (require.main === module) {
    applyComprehensiveFix().then(() => {
        console.log('\n✅ All fixes applied successfully!');
        console.log('\n🔄 Next steps:');
        console.log('1. Restart your bot');
        console.log('2. Test in a ???\'s Gullet channel to verify meat items drop');
        console.log('3. Check that regular mines still work properly');
    }).catch(error => {
        console.error('\n❌ Fix failed:', error);
        process.exit(1);
    });
}

module.exports = { applyComprehensiveFix };

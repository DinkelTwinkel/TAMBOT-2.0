/**
 * FIX for "Cannot read properties of undefined (reading 'tier')" error
 * 
 * The error occurs in mineFromTile when selectedItem is undefined
 * This happens when availableItems is empty or filtering results in no eligible items
 */

const fs = require('fs').promises;
const path = require('path');

async function fixMineFromTileError() {
    const filePath = path.join(__dirname, '../mining_optimized_v5_performance.js');
    
    console.log('🔧 Applying mineFromTile undefined tier fix...\n');
    
    try {
        let content = await fs.readFile(filePath, 'utf8');
        const originalContent = content;
        
        let fixCount = 0;
        
        // Fix 1: Add safety check before accessing selectedItem.tier
        // Find the section with tier multipliers
        const tierCheckPattern = /if \(selectedItem\.tier === 'legendary'/g;
        
        if (tierCheckPattern.test(content)) {
            // Add safety check before the tier check
            const safetyCheck = `
        // Safety check: ensure selectedItem exists
        if (!selectedItem || !selectedItem.itemId) {
            console.error('[MINING] No item selected, using fallback');
            selectedItem = {
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
            
            // Insert before the cooldown check
            const cooldownCheckIndex = content.indexOf('// Check cooldown for legendary/unique items');
            if (cooldownCheckIndex !== -1) {
                content = content.slice(0, cooldownCheckIndex) + safetyCheck + '\n        \n        ' + content.slice(cooldownCheckIndex);
                fixCount++;
                console.log('✅ Added selectedItem safety check');
            }
        }
        
        // Fix 2: Add check after weightedItems mapping
        const weightedItemsPattern = /const weightedItems = eligibleItems\.map/;
        if (weightedItemsPattern.test(content)) {
            const afterWeightedItems = `
        
        // Safety check: ensure we have items to select from
        if (weightedItems.length === 0) {
            console.warn('[MINING] No weighted items available, using default coal ore');
            return {
                item: {
                    itemId: '1',
                    name: 'Coal Ore',
                    value: 2,
                    tier: 'common'
                },
                quantity: 1
            };
        }`;
            
            // Find where to insert
            const totalWeightIndex = content.indexOf('const totalWeight = weightedItems.reduce');
            if (totalWeightIndex !== -1) {
                content = content.slice(0, totalWeightIndex) + afterWeightedItems + '\n        \n        ' + content.slice(totalWeightIndex);
                fixCount++;
                console.log('✅ Added weightedItems empty check');
            }
        }
        
        // Fix 3: Ensure eligibleItems fallback works
        const eligibleFallbackPattern = /if \(eligibleItems\.length === 0\) \{\s*eligibleItems = availableItems;/;
        if (eligibleFallbackPattern.test(content)) {
            // Replace with better fallback
            content = content.replace(eligibleFallbackPattern, `if (eligibleItems.length === 0) {
            eligibleItems = availableItems;
            // If still empty, use emergency fallback
            if (eligibleItems.length === 0) {
                console.warn('[MINING] No available items, using emergency coal ore fallback');
                eligibleItems = [{
                    itemId: '1',
                    name: 'Coal Ore',
                    value: 2,
                    tier: 'common',
                    baseWeight: 100
                }];
            }`);
            fixCount++;
            console.log('✅ Improved eligibleItems fallback');
        }
        
        // Fix 4: Add validation for availableItems parameter
        const functionStartPattern = /async function mineFromTile\(member, miningPower, luckStat, powerLevel, tileType, availableItems, efficiency[^)]*\) \{/;
        if (functionStartPattern.test(content)) {
            const validationCode = `async function mineFromTile(member, miningPower, luckStat, powerLevel, tileType, availableItems, efficiency, isDeeperMine, mineTypeId) {
    try {
        // Validate availableItems parameter
        if (!availableItems || !Array.isArray(availableItems) || availableItems.length === 0) {
            console.warn('[MINING] Invalid or empty availableItems, using default items');
            const { getAvailableItems } = require('./mining/miningConstants_unified');
            availableItems = getAvailableItems(powerLevel);
            
            // If still empty, use emergency fallback
            if (!availableItems || availableItems.length === 0) {
                availableItems = [{
                    itemId: '1',
                    name: 'Coal Ore',
                    value: 2,
                    tier: 'common',
                    baseWeight: 100,
                    powerRequirement: 1
                }];
            }
        }`;
            
            content = content.replace(functionStartPattern, validationCode);
            fixCount++;
            console.log('✅ Added availableItems validation');
        }
        
        if (fixCount > 0) {
            // Create backup
            const backupPath = filePath + '.backup_tier_fix_' + Date.now();
            await fs.writeFile(backupPath, originalContent);
            console.log(`\n📁 Backup created: ${path.basename(backupPath)}`);
            
            // Write the fixed content
            await fs.writeFile(filePath, content);
            
            console.log(`\n✨ Successfully applied ${fixCount} fixes!`);
            console.log('\n⚠️  Please restart your bot for changes to take effect.');
            
            // Also make sure the gullet fix is applied
            console.log('\n📝 Note: This fix also ensures mineTypeId is properly handled.');
            console.log('   The function signature now includes isDeeperMine and mineTypeId parameters.');
        } else {
            console.log('\nℹ️  No changes needed - the fixes may already be applied.');
        }
        
    } catch (error) {
        console.error('\n❌ Error applying fix:', error);
        console.log('\n📝 Manual Fix Instructions:');
        console.log('1. Open mining_optimized_v5_performance.js');
        console.log('2. In the mineFromTile function, add these safety checks:');
        console.log('   - Check if availableItems is empty at the start');
        console.log('   - Check if weightedItems is empty after mapping');
        console.log('   - Check if selectedItem is undefined before using it');
        console.log('3. Add fallback items when arrays are empty');
    }
}

// Run the fix
if (require.main === module) {
    fixMineFromTileError().then(() => {
        console.log('\n✅ Fix application complete!');
    }).catch(error => {
        console.error('\n❌ Fix failed:', error);
        process.exit(1);
    });
}

module.exports = { fixMineFromTileError };

/**
 * SIMPLE FIX for ???'s Gullet not giving meat items
 * 
 * The meat items (IDs 200-219) are already defined in itemSheet.json
 * The GULLET_ITEM_POOL is already in miningConstants_unified.js
 * 
 * The ONLY problem is that mining_optimized_v5_performance.js doesn't pass
 * the mineTypeId to the mining functions.
 * 
 * Run this script to automatically apply the fix!
 */

const fs = require('fs').promises;
const path = require('path');

async function applyGulletFix() {
    const filePath = path.join(__dirname, '../mining_optimized_v5_performance.js');
    
    console.log('🔧 Applying ???\'s Gullet meat items fix...\n');
    
    try {
        // Read the file
        let content = await fs.readFile(filePath, 'utf8');
        const originalContent = content;
        
        let fixCount = 0;
        
        // Fix 1: Add isDeeperMine and mineTypeId variables after serverPowerLevel
        if (!content.includes('const mineTypeId = dbEntry.typeId')) {
            const powerLevelLine = 'const serverPowerLevel = json?.power || 1;';
            const powerLevelIndex = content.indexOf(powerLevelLine);
            
            if (powerLevelIndex !== -1) {
                const insertion = `
        
        // Get mine type ID for special mine handling (e.g., gullet meat items)
        const mineTypeId = dbEntry.typeId;
        
        // Check if this is a deeper mine
        const { isDeeperMine: checkDeeperMine } = require('./mining/miningConstants_unified');
        const isDeeperMine = checkDeeperMine ? checkDeeperMine(mineTypeId) : false;
        
        // Debug logging for special mines
        if (mineTypeId === 16 || mineTypeId === '16') {
            console.log('[MINING] ???\'s Gullet detected - will generate meat items instead of ores');
        }`;
                
                content = content.slice(0, powerLevelIndex + powerLevelLine.length) + 
                         insertion + 
                         content.slice(powerLevelIndex + powerLevelLine.length);
                fixCount++;
                console.log('✅ Added mineTypeId and isDeeperMine variables');
            }
        } else {
            console.log('ℹ️  mineTypeId variable already exists');
        }
        
        // Fix 2: Update main mineFromTile calls to include isDeeperMine and mineTypeId
        // Pattern: mineFromTile(member, stats.mining, stats.luck, serverPowerLevel, tile.type, availableItems, efficiency)
        const mineFromTileRegex = /mineFromTile\s*\(\s*member,\s*[^,]+,\s*[^,]+,\s*serverPowerLevel,\s*tile\.type,\s*availableItems,\s*efficiency\s*\)/g;
        
        let matches = content.match(mineFromTileRegex);
        if (matches) {
            matches.forEach(match => {
                if (!match.includes('isDeeperMine') && !match.includes('mineTypeId')) {
                    const newCall = match.replace(/\)$/, ', isDeeperMine, mineTypeId)');
                    content = content.replace(match, newCall);
                    fixCount++;
                    console.log('✅ Fixed mineFromTile call');
                }
            });
        }
        
        // Fix 3: Update shadow clone mineFromTile calls
        const shadowRegex = /mineFromTile\s*\(\s*\{[^}]+\},\s*[^,]+,\s*[^,]+,\s*serverPowerLevel,\s*tile\.type,\s*availableItems,\s*efficiency\s*\)/g;
        
        matches = content.match(shadowRegex);
        if (matches) {
            matches.forEach(match => {
                if (!match.includes('isDeeperMine') && !match.includes('mineTypeId')) {
                    const newCall = match.replace(/\)$/, ', isDeeperMine, mineTypeId)');
                    content = content.replace(match, newCall);
                    fixCount++;
                    console.log('✅ Fixed shadow clone mineFromTile call');
                }
            });
        }
        
        // Fix 4: Update generateTreasure calls
        const treasureRegex = /generateTreasure\s*\(\s*serverPowerLevel,\s*efficiency\s*\)/g;
        
        matches = content.match(treasureRegex);
        if (matches) {
            matches.forEach(match => {
                const newCall = match.replace(/\)$/, ', isDeeperMine, mineTypeId)');
                content = content.replace(match, newCall);
                fixCount++;
                console.log('✅ Fixed generateTreasure call');
            });
        }
        
        if (fixCount > 0) {
            // Create backup
            const backupPath = filePath + '.backup_' + Date.now();
            await fs.writeFile(backupPath, originalContent);
            console.log(`\n📁 Backup created: ${path.basename(backupPath)}`);
            
            // Write the fixed content
            await fs.writeFile(filePath, content);
            
            console.log(`\n✨ Successfully applied ${fixCount} fixes!`);
            console.log('\n🎉 ???\'s Gullet will now drop meat items:');
            console.log('   - Gullet Flesh Scrap');
            console.log('   - Sinew Strand');
            console.log('   - Bile-Soaked Meat');
            console.log('   - Heart of the Gullet');
            console.log('   - ...and 16 more meat items!');
            console.log('\n⚠️  Please restart your bot for changes to take effect.');
        } else {
            console.log('\nℹ️  No changes needed - the file may already be fixed.');
        }
        
    } catch (error) {
        console.error('\n❌ Error applying fix:', error);
        console.log('\n📝 Manual Fix Instructions:');
        console.log('1. Open mining_optimized_v5_performance.js');
        console.log('2. After the line: const serverPowerLevel = json?.power || 1;');
        console.log('   Add: const mineTypeId = dbEntry.typeId;');
        console.log('3. Find all calls to mineFromTile() and add two parameters at the end:');
        console.log('   Change: mineFromTile(..., efficiency)');
        console.log('   To: mineFromTile(..., efficiency, isDeeperMine, mineTypeId)');
        console.log('4. Find all calls to generateTreasure() and add two parameters:');
        console.log('   Change: generateTreasure(serverPowerLevel, efficiency)');
        console.log('   To: generateTreasure(serverPowerLevel, efficiency, isDeeperMine, mineTypeId)');
    }
}

// Run the fix
if (require.main === module) {
    applyGulletFix().then(() => {
        console.log('\n✅ Fix application complete!');
    }).catch(error => {
        console.error('\n❌ Fix failed:', error);
        process.exit(1);
    });
}

module.exports = { applyGulletFix };

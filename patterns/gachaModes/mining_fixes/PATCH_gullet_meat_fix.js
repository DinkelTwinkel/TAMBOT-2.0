// HOTFIX PATCH for ???'s Gullet meat items
// Apply this patch to mining_optimized_v5_performance.js

/**
 * Instructions to fix the gullet meat issue:
 * 
 * The problem is in mining_optimized_v5_performance.js around lines 2080-2100
 * where mineFromTile is called WITHOUT passing the mineTypeId parameter.
 * 
 * FIND these lines (around line 2084):
 * ```javascript
 * const result = await mineFromTile(
 *     member, 
 *     playerData?.stats?.mining || 0, 
 *     playerData?.stats?.luck || 0, 
 *     serverPowerLevel, 
 *     tile.type, 
 *     availableItems, 
 *     efficiency
 * );
 * ```
 * 
 * REPLACE with:
 * ```javascript
 * const result = await mineFromTile(
 *     member, 
 *     playerData?.stats?.mining || 0, 
 *     playerData?.stats?.luck || 0, 
 *     serverPowerLevel, 
 *     tile.type, 
 *     availableItems, 
 *     efficiency,
 *     isDeeperMine,           // Add this
 *     dbEntry.typeId          // Add this - CRITICAL for gullet!
 * );
 * ```
 * 
 * Also FIND (around line 2254 - shadow clone mining):
 * ```javascript
 * const cloneResult = await mineFromTile(
 *     { id: clone.ownerId, displayName: `${clone.ownerName}'s Shadow` },
 *     Math.floor(cloneMiningPower * 0.5),
 *     Math.floor(cloneLuck * 0.5), 
 *     serverPowerLevel,
 *     tile.type,
 *     availableItems,
 *     efficiency
 * );
 * ```
 * 
 * REPLACE with:
 * ```javascript
 * const cloneResult = await mineFromTile(
 *     { id: clone.ownerId, displayName: `${clone.ownerName}'s Shadow` },
 *     Math.floor(cloneMiningPower * 0.5),
 *     Math.floor(cloneLuck * 0.5), 
 *     serverPowerLevel,
 *     tile.type,
 *     availableItems,
 *     efficiency,
 *     isDeeperMine,           // Add this
 *     dbEntry.typeId          // Add this - CRITICAL for gullet!
 * );
 * ```
 * 
 * Also need to check if isDeeperMine is properly defined. Add this near the top of the main mining event function (around line 1700):
 * ```javascript
 * // Check if this is a deeper mine
 * const { isDeeperMine: checkDeeperMine } = require('./mining/miningConstants_unified');
 * const isDeeperMine = checkDeeperMine(dbEntry.typeId);
 * ```
 * 
 * Finally, update the treasure generation calls (search for generateTreasure):
 * 
 * FIND:
 * ```javascript
 * const treasure = await generateTreasure(serverPowerLevel, efficiency);
 * ```
 * 
 * REPLACE with:
 * ```javascript
 * const treasure = await generateTreasure(serverPowerLevel, efficiency, isDeeperMine, dbEntry.typeId);
 * ```
 */

// Quick automated patch function (run this in a Node.js script)
const fs = require('fs').promises;
const path = require('path');

async function applyGulletPatch() {
    const filePath = path.join(__dirname, '../mining_optimized_v5_performance.js');
    
    try {
        let content = await fs.readFile(filePath, 'utf8');
        
        // Count how many fixes we need to apply
        let fixCount = 0;
        
        // Fix 1: Main mineFromTile call
        const mainMineRegex = /const result = await mineFromTile\(\s*member,\s*playerData\?\?\.stats\?\?\.mining \|\| 0,\s*playerData\?\?\.stats\?\?\.luck \|\| 0,\s*serverPowerLevel,\s*tile\.type,\s*availableItems,\s*efficiency\s*\)/g;
        
        if (mainMineRegex.test(content)) {
            content = content.replace(mainMineRegex, 
                `const result = await mineFromTile(
                    member,
                    playerData?.stats?.mining || 0,
                    playerData?.stats?.luck || 0,
                    serverPowerLevel,
                    tile.type,
                    availableItems,
                    efficiency,
                    isDeeperMine,
                    dbEntry.typeId
                )`);
            fixCount++;
            console.log('✓ Fixed main mineFromTile call');
        }
        
        // Fix 2: Shadow clone mineFromTile call
        const shadowMineRegex = /const cloneResult = await mineFromTile\([^)]+\)/g;
        const shadowMineMatches = content.match(shadowMineRegex);
        
        if (shadowMineMatches) {
            shadowMineMatches.forEach(match => {
                if (!match.includes('dbEntry.typeId')) {
                    const newMatch = match.replace(/\)$/, ', isDeeperMine, dbEntry.typeId)');
                    content = content.replace(match, newMatch);
                    fixCount++;
                    console.log('✓ Fixed shadow clone mineFromTile call');
                }
            });
        }
        
        // Fix 3: Add isDeeperMine check if not present
        if (!content.includes('const isDeeperMine = ')) {
            // Find a good place to add it (after power level detection)
            const powerLevelRegex = /const serverPowerLevel = json\?\?\.power \|\| 1;/;
            if (powerLevelRegex.test(content)) {
                content = content.replace(powerLevelRegex, 
                    `const serverPowerLevel = json?.power || 1;
        
        // Check if this is a deeper mine
        const { isDeeperMine: checkDeeperMine } = require('./mining/miningConstants_unified');
        const isDeeperMine = checkDeeperMine(dbEntry.typeId);`);
                fixCount++;
                console.log('✓ Added isDeeperMine check');
            }
        }
        
        // Fix 4: Update generateTreasure calls
        const treasureRegex = /const treasure = await generateTreasure\(serverPowerLevel, efficiency\)/g;
        if (treasureRegex.test(content)) {
            content = content.replace(treasureRegex, 
                'const treasure = await generateTreasure(serverPowerLevel, efficiency, isDeeperMine, dbEntry.typeId)');
            fixCount++;
            console.log('✓ Fixed generateTreasure calls');
        }
        
        if (fixCount > 0) {
            // Backup original file
            await fs.writeFile(filePath + '.backup', await fs.readFile(filePath, 'utf8'));
            console.log('✓ Created backup file');
            
            // Write patched file
            await fs.writeFile(filePath, content);
            console.log(`✅ Successfully applied ${fixCount} fixes to mining_optimized_v5_performance.js`);
            console.log('⚠️  Please restart your bot for changes to take effect');
        } else {
            console.log('ℹ️  No fixes needed - file may already be patched');
        }
        
    } catch (error) {
        console.error('❌ Error applying patch:', error);
        console.log('\nPlease apply the fixes manually as described in the comments above.');
    }
}

// Export for use
module.exports = {
    applyGulletPatch
};

// Run if called directly
if (require.main === module) {
    applyGulletPatch().catch(console.error);
}

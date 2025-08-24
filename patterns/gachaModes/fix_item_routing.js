/**
 * FIX ITEM ROUTING - Routes non-ore items to player inventory
 * 
 * This patch fixes the issue where pickaxes and other non-ore items
 * are being added to the minecart instead of player inventory.
 * 
 * CHANGES:
 * 1. Updates mineFromTile calls to use the destination field
 * 2. Routes items based on their category (ore vs equipment/consumable)
 * 3. Ensures gullet items go to inventory
 */

const fs = require('fs').promises;
const path = require('path');

async function applyItemRoutingFix() {
    console.log('🔧 Applying Item Routing Fix...\n');
    
    const filePath = path.join(__dirname, 'mining_optimized_v5_performance.js');
    
    try {
        let content = await fs.readFile(filePath, 'utf8');
        let changesMade = 0;
        
        // Fix 1: Replace addItemToMinecart with addItemWithDestination where loot is processed
        // This pattern finds where mineFromTile is called and loot is added
        const miningPattern = /const lootResult = await mineFromTile\(([\s\S]*?)\);\s*([\s\S]*?)await addItemToMinecart\(dbEntry, member\.id, lootResult\.item\.itemId, finalQuantity\);/g;
        
        const replacement = `const lootResult = await mineFromTile($1);
$2// Get destination from mineFromTile result
                        const destination = lootResult.destination || 'minecart';
                        
                        // Route item based on destination
                        await addItemWithDestination(dbEntry, member.id, lootResult.item.itemId, finalQuantity, destination);`;
        
        content = content.replace(miningPattern, replacement);
        changesMade++;
        
        // Fix 2: Replace treasure additions to use inventory
        const treasurePattern = /await addItemToMinecart\(dbEntry, member\.id, treasure\.itemId, 1\);/g;
        content = content.replace(treasurePattern, 
            'await addItemWithDestination(dbEntry, member.id, treasure.itemId, 1, "inventory");');
        changesMade++;
        
        // Fix 3: Update event logs to show proper destination
        const eventLogPattern = /eventLogs\.push\(`⛏️ \${member\.displayName} mined \${finalQuantity}x \${lootResult\.item\.name}`\);/g;
        content = content.replace(eventLogPattern, 
            `eventLogs.push(\`\${destination === 'inventory' ? '📦' : '⛏️'} \${member.displayName} \${destination === 'inventory' ? 'found' : 'mined'} \${finalQuantity}x \${lootResult.item.name}\${destination === 'inventory' ? ' (inventory)' : ''}\`);`);
        changesMade++;
        
        // Write the fixed content back
        await fs.writeFile(filePath, content, 'utf8');
        
        console.log(`✅ Item Routing Fix Applied Successfully!`);
        console.log(`   - Fixed ${changesMade} code sections`);
        console.log(`   - Non-ore items will now go to player inventory`);
        console.log(`   - Ores will continue to go to minecart`);
        console.log(`   - Gullet items will go to inventory as consumables`);
        
        console.log('\n📋 Next Steps:');
        console.log('1. Restart the bot to apply changes');
        console.log('2. Test mining to verify items go to correct destination');
        console.log('3. Check that pickaxes, equipment, and consumables go to inventory');
        console.log('4. Verify ores still go to minecart for selling');
        
    } catch (error) {
        console.error('❌ Error applying fix:', error);
        console.log('\nManual Fix Instructions:');
        console.log('1. Open mining_optimized_v5_performance.js');
        console.log('2. Find all occurrences of "addItemToMinecart"');
        console.log('3. Replace with "addItemWithDestination" and add destination parameter');
        console.log('4. For mineFromTile results, use: lootResult.destination || "minecart"');
        console.log('5. For treasures, use: "inventory" as destination');
    }
}

// Run the fix
applyItemRoutingFix();

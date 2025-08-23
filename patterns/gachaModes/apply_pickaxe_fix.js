// apply_pickaxe_fix.js - Applies the pickaxe durability fix to the mining file

const fs = require('fs').promises;
const path = require('path');

async function applyPickaxeFix() {
    const filePath = path.join(__dirname, 'mining_optimized_v5_performance.js');
    
    try {
        console.log('📖 Reading mining file...');
        let content = await fs.readFile(filePath, 'utf8');
        const originalContent = content;
        
        // Check if the fix is already applied
        if (content.includes('handlePickaxeDurability')) {
            console.log('✅ The improved durability handler is already imported!');
        } else {
            console.error('❌ The handlePickaxeDurability import is missing!');
            console.log('Please ensure this line is at the top of the file:');
            console.log("const { handlePickaxeDurability } = require('./mining/improvedDurabilityHandling');");
            return;
        }
        
        // Find the processPlayerActionsEnhanced function
        console.log('\n🔍 Searching for processPlayerActionsEnhanced function...');
        
        // Since the function is at the end of the file, let's search from the end
        const lastPart = content.substring(content.length - 50000); // Last 50KB of file
        
        // Look for the pickaxe handling section
        const pickaxePatterns = [
            'bestPickaxe',
            'checkPickaxeBreak',
            'pickaxe.quantity',
            'inventory.items'
        ];
        
        let foundSection = false;
        for (const pattern of pickaxePatterns) {
            if (lastPart.includes(pattern)) {
                console.log(`✓ Found ${pattern} in function`);
                foundSection = true;
            }
        }
        
        if (!foundSection) {
            console.error('❌ Could not find pickaxe handling section');
            console.log('\n📝 Manual Fix Instructions:');
            console.log('1. Open mining_optimized_v5_performance.js');
            console.log('2. Find the processPlayerActionsEnhanced function (it\'s at the end)');
            console.log('3. Look for where pickaxe breaking is handled');
            console.log('4. Replace it with the code from pickaxe_fix_example.js');
            return;
        }
        
        // Create the fixed pickaxe handling code
        const fixedPickaxeCode = `
    // FIXED PICKAXE DURABILITY HANDLING
    // When breaking a tile, check pickaxe durability
    if (bestPickaxe && targetTile) {
        const tileHardness = targetTile.hardness || 1;
        const checkResult = checkPickaxeBreak(bestPickaxe, tileHardness);
        
        if (checkResult.durabilityLoss > 0) {
            // Use the improved durability handler that properly resets durability
            const durabilityResult = await handlePickaxeDurability(
                member.id,
                member.user?.tag || member.displayName,
                bestPickaxe,
                checkResult.durabilityLoss
            );
            
            if (durabilityResult.broke) {
                // Pickaxe broke!
                eventLogs.push(\`⚒️ \${member.displayName}'s \${bestPickaxe.name} broke!\`);
                
                if (durabilityResult.removed) {
                    // Pickaxe was completely removed from inventory
                    bestPickaxe = null;
                    isUniquePickaxe = false;
                    
                    // Try to find another pickaxe in inventory
                    for (const [key, item] of Object.entries(playerData?.inventory || {})) {
                        if (item.itemId && (item.type === 'pickaxe' || item.category === 'pickaxe' || 
                            (item.stats && item.stats.mining))) {
                            if (!bestPickaxe || (item.stats?.mining || 0) > (bestPickaxe.stats?.mining || 0)) {
                                bestPickaxe = item;
                                isUniquePickaxe = item.tier === 'unique' || item.tier === 'legendary';
                            }
                        }
                    }
                    
                    if (bestPickaxe) {
                        eventLogs.push(\`⚒️ \${member.displayName} switched to \${bestPickaxe.name}\`);
                    }
                } else {
                    // Pickaxe quantity was reduced but still exists
                    // Durability has been reset to max by handlePickaxeDurability
                    console.log(\`[DURABILITY] \${bestPickaxe.name} broke but has \${durabilityResult.newQuantity} remaining\`);
                }
            }
        }
    }`;
        
        // Create backup
        const backupPath = filePath + '.backup_' + Date.now();
        console.log('\n💾 Creating backup...');
        await fs.writeFile(backupPath, originalContent);
        console.log(`✓ Backup saved to: ${path.basename(backupPath)}`);
        
        // Provide instructions since we can't automatically replace the exact section
        console.log('\n' + '='.repeat(60));
        console.log('📋 FIX INSTRUCTIONS:');
        console.log('='.repeat(60));
        console.log('\n1. The handlePickaxeDurability import is confirmed ✅');
        console.log('\n2. Now you need to find and replace the pickaxe breaking logic.');
        console.log('   In the processPlayerActionsEnhanced function, look for code that:');
        console.log('   - Checks if (checkResult.shouldBreak)');
        console.log('   - Manually decrements pickaxe.quantity');
        console.log('   - Updates inventory items');
        console.log('\n3. Replace that entire section with this code:');
        console.log('-'.repeat(60));
        console.log(fixedPickaxeCode);
        console.log('-'.repeat(60));
        console.log('\n4. The key changes:');
        console.log('   ✓ Uses handlePickaxeDurability() instead of manual inventory updates');
        console.log('   ✓ Automatically resets durability when quantity > 1');
        console.log('   ✓ Properly removes item when quantity reaches 0');
        console.log('   ✓ Handles switching to next pickaxe if available');
        
        // Also save the fix code to a separate file for easy copying
        const fixCodePath = path.join(__dirname, 'pickaxe_fix_code.js');
        await fs.writeFile(fixCodePath, fixedPickaxeCode);
        console.log(`\n💡 The fix code has been saved to: ${path.basename(fixCodePath)}`);
        console.log('   You can copy it from there!');
        
        console.log('\n✨ Once you apply this fix, the pickaxe breaking bug will be resolved!');
        
    } catch (error) {
        console.error('❌ Error applying fix:', error.message);
    }
}

// Run the fix
applyPickaxeFix();

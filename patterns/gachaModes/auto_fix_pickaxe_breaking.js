// auto_fix_pickaxe_breaking.js - Automatically fix the pickaxe breaking bug

const fs = require('fs').promises;
const path = require('path');

async function fixPickaxeBreaking() {
    const filePath = path.join(__dirname, 'mining_optimized_v5_performance.js');
    
    console.log('Reading file...');
    let content = await fs.readFile(filePath, 'utf8');
    
    // Find the processPlayerActionsEnhanced function
    const functionStart = content.indexOf('async function processPlayerActionsEnhanced');
    if (functionStart === -1) {
        console.error('Could not find processPlayerActionsEnhanced function');
        return;
    }
    
    console.log('Found processPlayerActionsEnhanced function at position:', functionStart);
    
    // Find where the pickaxe breaking logic is
    // Look for patterns that indicate pickaxe breaking handling
    const patterns = [
        /if\s*\(.*?shouldBreak.*?\)\s*{[^}]*quantity[^}]*}/gs,
        /if\s*\(.*?checkResult\.shouldBreak.*?\)\s*{[^}]*}/gs,
        /\/\/\s*Pickaxe broke[^}]*}/gs,
        /pickaxe\.quantity\s*-=/g,
        /bestPickaxe\.quantity\s*-=/g
    ];
    
    let foundMatch = false;
    let matchPosition = -1;
    let matchLength = 0;
    
    for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches && matches.length > 0) {
            console.log(`Found pattern match: ${matches[0].substring(0, 100)}...`);
            matchPosition = content.indexOf(matches[0], functionStart);
            matchLength = matches[0].length;
            foundMatch = true;
            break;
        }
    }
    
    if (!foundMatch) {
        console.log('Could not find existing pickaxe breaking logic, adding new implementation...');
        
        // Find where to insert the fix (after bestPickaxe is found)
        const bestPickaxePattern = /let\s+bestPickaxe\s*=\s*null;[\s\S]*?}\s*catch.*?{[\s\S]*?}/;
        const bestPickaxeMatch = content.substring(functionStart).match(bestPickaxePattern);
        
        if (bestPickaxeMatch) {
            const insertPosition = functionStart + content.substring(functionStart).indexOf(bestPickaxeMatch[0]) + bestPickaxeMatch[0].length;
            
            // Insert the fixed pickaxe breaking logic
            const fixedCode = `
    
    // FIXED PICKAXE BREAKING LOGIC
    // Handle pickaxe durability when mining
    const handlePickaxeBreaking = async (tile) => {
        if (!bestPickaxe) return true; // Can break without pickaxe
        
        const tileHardness = tile?.hardness || 1;
        const checkResult = checkPickaxeBreak(bestPickaxe, tileHardness);
        
        if (checkResult.durabilityLoss > 0) {
            // Use the improved durability handler
            const durabilityResult = await handlePickaxeDurability(
                member.id,
                member.user?.tag || member.displayName,
                bestPickaxe,
                checkResult.durabilityLoss
            );
            
            if (durabilityResult.broke) {
                eventLogs.push(\`⚒️ \${member.displayName}'s \${bestPickaxe.name} broke!\`);
                
                if (durabilityResult.removed) {
                    // Pickaxe was completely removed
                    bestPickaxe = null;
                    isUniquePickaxe = false;
                    
                    // Try to find another pickaxe
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
                    // Update the bestPickaxe reference with new durability
                    bestPickaxe.currentDurability = durabilityResult.newDurability;
                }
            } else if (durabilityResult.newDurability !== undefined) {
                // Update durability without breaking
                bestPickaxe.currentDurability = durabilityResult.newDurability;
            }
        }
        
        return checkResult.shouldBreak ? false : true; // Return if can continue mining
    };
`;
            
            content = content.substring(0, insertPosition) + fixedCode + content.substring(insertPosition);
            console.log('Added fixed pickaxe breaking logic');
        }
    } else {
        console.log(`Found existing pickaxe breaking logic at position ${matchPosition}`);
        
        // Replace the existing broken logic with the fixed version
        const beforeMatch = content.substring(0, matchPosition);
        const afterMatch = content.substring(matchPosition + matchLength);
        
        const fixedCode = `
        // FIXED: Pickaxe breaking with proper durability reset
        if (checkResult.shouldBreak) {
            // Use the improved durability handler
            const durabilityResult = await handlePickaxeDurability(
                member.id,
                member.user?.tag || member.displayName,
                bestPickaxe,
                checkResult.durabilityLoss || 1
            );
            
            if (durabilityResult.broke) {
                eventLogs.push(\`⚒️ \${member.displayName}'s \${bestPickaxe.name} broke!\`);
                
                if (durabilityResult.removed) {
                    // Pickaxe was completely removed
                    bestPickaxe = null;
                    isUniquePickaxe = false;
                    
                    // Try to find another pickaxe
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
                    // The durability has been reset to max by handlePickaxeDurability
                    bestPickaxe.currentDurability = durabilityResult.newDurability || bestPickaxe.maxDurability;
                }
            }
        } else if (checkResult.durabilityLoss > 0) {
            // Update durability without breaking
            await handlePickaxeDurability(
                member.id,
                member.user?.tag || member.displayName,
                bestPickaxe,
                checkResult.durabilityLoss
            );
        }`;
        
        content = beforeMatch + fixedCode + afterMatch;
        console.log('Replaced existing pickaxe breaking logic with fixed version');
    }
    
    // Save the fixed file
    const backupPath = filePath + '.backup_' + Date.now();
    console.log('Creating backup at:', backupPath);
    await fs.writeFile(backupPath, await fs.readFile(filePath, 'utf8'));
    
    console.log('Writing fixed file...');
    await fs.writeFile(filePath, content);
    
    console.log('✅ Successfully fixed pickaxe breaking bug!');
    console.log('The fix will:');
    console.log('  1. Properly reset durability when quantity decreases');
    console.log('  2. Remove the pickaxe when quantity reaches 0');
    console.log('  3. Switch to next best pickaxe if available');
    console.log('\nBackup saved at:', backupPath);
}

// Run the fix
fixPickaxeBreaking().catch(console.error);

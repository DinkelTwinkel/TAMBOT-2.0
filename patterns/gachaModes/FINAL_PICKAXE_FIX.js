// PICKAXE BREAKING FIX - Complete Solution
// Copy this code to replace the broken pickaxe handling in processPlayerActionsEnhanced

// =============================================================================
// STEP 1: Ensure this import is at the top of mining_optimized_v5_performance.js
// =============================================================================
const { handlePickaxeDurability } = require('./mining/improvedDurabilityHandling');

// =============================================================================
// STEP 2: In processPlayerActionsEnhanced function, find where pickaxe breaking
//         is currently handled (look for checkPickaxeBreak or shouldBreak)
// =============================================================================

// REPLACE THE OLD BROKEN CODE WITH THIS:

// Check pickaxe durability when breaking tiles
if (canBreak && bestPickaxe && targetTile) {
    const tileHardness = targetTile.hardness || 1;
    const checkResult = checkPickaxeBreak(bestPickaxe, tileHardness);
    
    // Handle durability loss
    if (checkResult.durabilityLoss > 0) {
        // Use the improved durability handler that properly manages quantity and durability
        // NOTE: Voice channel members don't have user.tag, so we create a tag format
        const playerTag = member.user?.tag || `${member.displayName}#0000`;
        const durabilityResult = await handlePickaxeDurability(
            member.id,
            playerTag,
            bestPickaxe,
            checkResult.durabilityLoss
        );
        
        if (durabilityResult.broke) {
            // Pickaxe broke!
            eventLogs.push(`⚒️ ${member.displayName}'s ${bestPickaxe.name} broke!`);
            
            if (durabilityResult.removed) {
                // Pickaxe was completely removed (quantity was 1)
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
                    eventLogs.push(`⚒️ ${member.displayName} switched to ${bestPickaxe.name}`);
                } else {
                    eventLogs.push(`⚒️ ${member.displayName} has no more pickaxes!`);
                }
            } else {
                // Pickaxe quantity was reduced but still exists
                // The handlePickaxeDurability function has already:
                // 1. Decreased quantity by 1
                // 2. Reset durability to maximum
                // 3. Saved to database
                
                // Update our local reference
                if (durabilityResult.newDurability !== undefined) {
                    bestPickaxe.currentDurability = durabilityResult.newDurability;
                }
                if (durabilityResult.newQuantity !== undefined) {
                    bestPickaxe.quantity = durabilityResult.newQuantity;
                }
                
                console.log(`[PICKAXE] ${bestPickaxe.name} broke but ${durabilityResult.newQuantity} remaining with full durability`);
            }
        } else {
            // Pickaxe didn't break, just update durability
            if (durabilityResult.newDurability !== undefined) {
                bestPickaxe.currentDurability = durabilityResult.newDurability;
            }
        }
    }
}

// =============================================================================
// IMPORTANT: Remove any old code that:
// =============================================================================
// ❌ Manually updates pickaxe.quantity--
// ❌ Manually sets pickaxe.currentDurability = 0
// ❌ Uses transaction.queueInventoryUpdate for pickaxe updates
// ❌ Directly modifies playerData.inventory for pickaxes

// The handlePickaxeDurability function handles ALL of this automatically!

// =============================================================================
// What this fix does:
// =============================================================================
// ✅ When a pickaxe breaks and quantity > 1:
//    - Reduces quantity by 1
//    - RESETS durability to maximum (fixes the bug!)
//    - Saves changes to database atomically
//
// ✅ When a pickaxe breaks and quantity = 1:
//    - Removes the pickaxe from inventory
//    - Automatically switches to next best pickaxe if available
//
// ✅ When a pickaxe takes damage but doesn't break:
//    - Updates durability correctly
//    - Saves to database

// =============================================================================
// Testing Instructions:
// =============================================================================
// 1. Give yourself a pickaxe with quantity > 1
// 2. Mine until it breaks
// 3. Check that:
//    - Quantity decreased by 1
//    - Durability is at MAXIMUM (not 0)
//    - You can continue mining with the pickaxe

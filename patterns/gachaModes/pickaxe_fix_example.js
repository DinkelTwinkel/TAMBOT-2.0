// PICKAXE DURABILITY FIX - Add this to processPlayerActionsEnhanced function
// This is a complete example of how the pickaxe handling should look

// In processPlayerActionsEnhanced function, replace the pickaxe breaking section with:

async function processPlayerActionsEnhanced(member, playerData, mapData, teamVisibleTiles, powerLevel, availableItems, availableTreasures, efficiency, serverModifiers, transaction, eventLogs, dbEntry, hazardsData) {
    // ... existing code ...
    
    // Find best pickaxe (existing code)
    let bestPickaxe = null;
    let isUniquePickaxe = false;
    try {
        for (const [key, item] of Object.entries(playerData?.inventory || {})) {
            if (item.itemId && (item.type === 'pickaxe' || item.category === 'pickaxe' || 
                (item.stats && item.stats.mining))) {
                if (!bestPickaxe || (item.stats?.mining || 0) > (bestPickaxe.stats?.mining || 0)) {
                    bestPickaxe = item;
                    isUniquePickaxe = item.tier === 'unique' || item.tier === 'legendary';
                }
            }
        }
    } catch (error) {
        console.error(`[MINING] Error finding pickaxe for ${member.displayName}:`, error);
    }
    
    // ... existing movement and mining code ...
    
    // When breaking a wall/mining:
    if (canBreak) {
        // Check pickaxe durability
        if (bestPickaxe) {
            const tileHardness = targetTile.hardness || 1;
            const checkResult = checkPickaxeBreak(bestPickaxe, tileHardness);
            
            // FIXED CODE - Use the improved durability handler
            if (checkResult.durabilityLoss > 0) {
                const durabilityResult = await handlePickaxeDurability(
                    member.id,
                    member.user.tag,
                    bestPickaxe,
                    checkResult.durabilityLoss
                );
                
                if (durabilityResult.broke) {
                    // Pickaxe broke!
                    eventLogs.push(`⚒️ ${member.displayName}'s ${bestPickaxe.name} broke!`);
                    
                    // Check if we need to find a new pickaxe
                    if (durabilityResult.removed) {
                        // Pickaxe was completely removed, find next best
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
                            eventLogs.push(`⚒️ ${member.displayName} switched to ${bestPickaxe.name}`);
                        }
                    } else {
                        // Pickaxe quantity was reduced but still exists
                        // The durability has been reset to max by handlePickaxeDurability
                        eventLogs.push(`⚒️ ${member.displayName} has ${durabilityResult.newQuantity} ${bestPickaxe.name}(s) left`);
                    }
                }
                
                // Update the bestPickaxe reference with new durability if not removed
                if (!durabilityResult.removed && durabilityResult.newDurability !== undefined) {
                    bestPickaxe.currentDurability = durabilityResult.newDurability;
                }
            }
        }
        
        // Continue with mining logic...
        // Mine the tile, add items to inventory, etc.
    }
    
    // ... rest of the function ...
}

// IMPORTANT NOTES:
// 1. The handlePickaxeDurability function automatically:
//    - Updates the database
//    - Handles quantity decrements
//    - Resets durability to max when quantity > 1
//    - Removes the item when quantity reaches 0
// 
// 2. You don't need to manually update the inventory in the database
//    The handlePickaxeDurability function does this for you
//
// 3. The function returns:
//    - success: whether the operation succeeded
//    - broke: whether the pickaxe broke
//    - removed: whether the item was removed from inventory
//    - newQuantity: the new quantity (if reduced)
//    - newDurability: the new durability value

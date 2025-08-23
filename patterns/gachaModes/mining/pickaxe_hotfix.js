// pickaxe_hotfix.js - Emergency hotfix for duplicate pickaxe breaking
// This is a quick fix that can be applied immediately

const PlayerInventory = require('../../../models/inventory');

// Track recent pickaxe breaks to prevent duplicates
const recentBreaks = new Map();
const BREAK_COOLDOWN = 2000; // 2 seconds cooldown between breaks

/**
 * Emergency wrapper for handlePickaxeDurability to prevent duplicate breaks
 */
async function safeHandlePickaxeDurability(playerId, playerTag, pickaxe, durabilityLoss) {
    const now = Date.now();
    const lastBreak = recentBreaks.get(playerId) || 0;
    
    // Check if this player had a pickaxe break recently
    if (now - lastBreak < BREAK_COOLDOWN) {
        console.log(`[HOTFIX] Prevented duplicate pickaxe break for ${playerTag} (cooldown active)`);
        return {
            success: true,
            broke: false,
            skipped: true,
            reason: 'Break cooldown active'
        };
    }
    
    // Get current inventory to check actual pickaxe quantity
    try {
        const inventory = await PlayerInventory.findOne({ playerId });
        if (!inventory) {
            console.error('[HOTFIX] No inventory found for player');
            return { success: false, broke: false };
        }
        
        const pickaxeId = pickaxe.itemId || pickaxe.id;
        const currentItem = inventory.items.find(item => 
            (item.itemId?.toString() === pickaxeId?.toString()) || 
            (item.id?.toString() === pickaxeId?.toString())
        );
        
        if (!currentItem) {
            console.log('[HOTFIX] Pickaxe not found in inventory');
            return { success: false, broke: false };
        }
        
        // Calculate new durability
        const currentDurability = currentItem.currentDurability || 100;
        const newDurability = currentDurability - durabilityLoss;
        
        // Only process if pickaxe would actually break
        if (newDurability <= 0) {
            // Set the cooldown BEFORE processing the break
            recentBreaks.set(playerId, now);
            
            console.log(`[HOTFIX] Processing legitimate pickaxe break for ${playerTag}`);
            
            // Call the original function
            const { handlePickaxeDurability } = require('./improvedDurabilityHandling');
            const result = await handlePickaxeDurability(playerId, playerTag, pickaxe, durabilityLoss);
            
            // Clean up old entries from the map
            for (const [pid, time] of recentBreaks.entries()) {
                if (now - time > 60000) { // Remove entries older than 1 minute
                    recentBreaks.delete(pid);
                }
            }
            
            return result;
        } else {
            // Just update durability without breaking
            const { handlePickaxeDurability } = require('./improvedDurabilityHandling');
            return await handlePickaxeDurability(playerId, playerTag, pickaxe, durabilityLoss);
        }
        
    } catch (error) {
        console.error('[HOTFIX] Error in safe durability handler:', error);
        return { success: false, broke: false, error };
    }
}

// Override the module export
module.exports = {
    handlePickaxeDurability: safeHandlePickaxeDurability,
    // Keep other exports if they exist
    handlePickaxeDurabilityAtomic: require('./improvedDurabilityHandling').handlePickaxeDurabilityAtomic,
    getPickaxeDurability: require('./improvedDurabilityHandling').getPickaxeDurability
};

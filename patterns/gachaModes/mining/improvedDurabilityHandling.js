// improvedDurabilityHandling.js - Fixed durability system for mining
const PlayerInventory = require('../../../models/inventory');
const itemSheet = require('../../../data/itemSheet.json');

/**
 * Handle pickaxe durability reduction and breaking atomically
 * When durability reaches 0:
 * - If quantity > 1: reduce quantity by 1 and reset durability to max
 * - If quantity = 1: remove the item from inventory
 */
async function handlePickaxeDurability(playerId, playerTag, pickaxe, durabilityLoss) {
    console.log(`[DURABILITY] Processing durability for ${pickaxe.name} (ID: ${pickaxe.itemId})`);
    console.log(`[DURABILITY] Current durability: ${pickaxe.currentDurability}, Loss: ${durabilityLoss}`);
    
    const pickaxeId = pickaxe.itemId || pickaxe.id;
    if (!pickaxeId) {
        console.error('[DURABILITY] No pickaxe ID found');
        return { success: false, broke: false };
    }
    
    try {
        // Get the current inventory
        const inventory = await PlayerInventory.findOne({ playerId });
        if (!inventory) {
            console.error('[DURABILITY] No inventory found for player');
            return { success: false, broke: false };
        }
        
        // Find the item in inventory
        const itemIndex = inventory.items.findIndex(item => 
            (item.itemId?.toString() === pickaxeId.toString()) || 
            (item.id?.toString() === pickaxeId.toString())
        );
        
        if (itemIndex === -1) {
            console.error('[DURABILITY] Pickaxe not found in inventory');
            return { success: false, broke: false };
        }
        
        const currentItem = inventory.items[itemIndex];
        const currentDurability = currentItem.currentDurability || 100;
        const newDurability = currentDurability - durabilityLoss;
        
        // Get max durability from itemSheet
        const itemData = itemSheet.find(it => String(it.id) === String(pickaxeId));
        const maxDurability = itemData?.durability || 100;
        
        console.log(`[DURABILITY] New durability would be: ${newDurability}`);
        
        if (newDurability <= 0) {
            // Pickaxe broke!
            console.log(`[DURABILITY] Pickaxe broke! Current quantity: ${currentItem.quantity}`);
            
            if (currentItem.quantity > 1) {
                // Reduce quantity and reset durability
                inventory.items[itemIndex].quantity -= 1;
                inventory.items[itemIndex].currentDurability = maxDurability;
                
                console.log(`[DURABILITY] Reduced quantity to ${inventory.items[itemIndex].quantity}, reset durability to ${maxDurability}`);
            } else {
                // Remove the item entirely
                inventory.items.splice(itemIndex, 1);
                console.log(`[DURABILITY] Removed pickaxe from inventory (quantity was 1)`);
            }
            
            // Mark as modified and save
            inventory.markModified('items');
            await inventory.save();
            
            return { success: true, broke: true, newDurability: 0 };
        } else {
            // Just update durability
            inventory.items[itemIndex].currentDurability = newDurability;
            
            // Mark as modified and save
            inventory.markModified('items');
            await inventory.save();
            
            console.log(`[DURABILITY] Updated durability to ${newDurability}`);
            return { success: true, broke: false, newDurability };
        }
    } catch (error) {
        console.error('[DURABILITY] Error handling pickaxe durability:', error);
        return { success: false, broke: false, error };
    }
}

/**
 * Alternative atomic update using MongoDB operations
 * This is more efficient but more complex
 */
async function handlePickaxeDurabilityAtomic(playerId, pickaxeId, durabilityLoss) {
    try {
        // First, get the current state
        const inventory = await PlayerInventory.findOne(
            { 
                playerId,
                $or: [
                    { 'items.itemId': pickaxeId },
                    { 'items.id': pickaxeId }
                ]
            }
        );
        
        if (!inventory) {
            console.log('[DURABILITY] No inventory with this pickaxe found');
            return { success: false, broke: false };
        }
        
        // Find the item
        const item = inventory.items.find(item => 
            (item.itemId?.toString() === pickaxeId.toString()) || 
            (item.id?.toString() === pickaxeId.toString())
        );
        
        if (!item) {
            console.log('[DURABILITY] Pickaxe not found in inventory');
            return { success: false, broke: false };
        }
        
        const currentDurability = item.currentDurability || 100;
        const newDurability = currentDurability - durabilityLoss;
        const quantity = item.quantity || 1;
        
        // Get max durability from itemSheet
        const itemData = itemSheet.find(it => String(it.id) === String(pickaxeId));
        const maxDurability = itemData?.durability || 100;
        
        // Determine the field name used
        const idField = item.itemId ? 'itemId' : 'id';
        
        if (newDurability <= 0) {
            // Pickaxe broke
            if (quantity > 1) {
                // Reduce quantity and reset durability
                const result = await PlayerInventory.findOneAndUpdate(
                    { 
                        playerId,
                        [`items.${idField}`]: pickaxeId
                    },
                    {
                        $inc: { 'items.$.quantity': -1 },
                        $set: { 'items.$.currentDurability': maxDurability }
                    },
                    { new: true }
                );
                
                if (result) {
                    console.log(`[DURABILITY] Pickaxe broke! Reduced quantity and reset durability`);
                    return { success: true, broke: true, newQuantity: quantity - 1, newDurability: maxDurability };
                }
            } else {
                // Remove the item entirely
                const pullQuery = {};
                pullQuery[idField] = pickaxeId;
                
                const result = await PlayerInventory.findOneAndUpdate(
                    { playerId },
                    { $pull: { items: pullQuery } },
                    { new: true }
                );
                
                if (result) {
                    console.log(`[DURABILITY] Pickaxe broke and was removed (quantity was 1)`);
                    return { success: true, broke: true, removed: true };
                }
            }
        } else {
            // Just update durability
            const result = await PlayerInventory.findOneAndUpdate(
                { 
                    playerId,
                    [`items.${idField}`]: pickaxeId
                },
                {
                    $set: { 'items.$.currentDurability': newDurability }
                },
                { new: true }
            );
            
            if (result) {
                console.log(`[DURABILITY] Updated durability to ${newDurability}`);
                return { success: true, broke: false, newDurability };
            }
        }
        
        return { success: false, broke: false };
    } catch (error) {
        console.error('[DURABILITY] Error in atomic update:', error);
        return { success: false, broke: false, error };
    }
}

/**
 * Get current durability info for a pickaxe
 */
async function getPickaxeDurability(playerId, pickaxeId) {
    try {
        const inventory = await PlayerInventory.findOne({ playerId });
        if (!inventory) return null;
        
        const item = inventory.items.find(item => 
            (item.itemId?.toString() === pickaxeId.toString()) || 
            (item.id?.toString() === pickaxeId.toString())
        );
        
        if (!item) return null;
        
        const itemData = itemSheet.find(it => String(it.id) === String(pickaxeId));
        const maxDurability = itemData?.durability || 100;
        
        return {
            currentDurability: item.currentDurability || maxDurability,
            maxDurability,
            quantity: item.quantity || 1,
            name: itemData?.name || 'Unknown'
        };
    } catch (error) {
        console.error('[DURABILITY] Error getting durability:', error);
        return null;
    }
}

module.exports = {
    handlePickaxeDurability,
    handlePickaxeDurabilityAtomic,
    getPickaxeDurability
};

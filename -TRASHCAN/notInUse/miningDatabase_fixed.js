// Fixed breakPickaxe function with better debugging
async function breakPickaxe(playerId, playerTag, pickaxe) {
    console.log('=== BREAKPICKAXE DEBUG ===');
    console.log('Player ID:', playerId);
    console.log('Player Tag:', playerTag);
    console.log('Pickaxe object:', JSON.stringify(pickaxe, null, 2));
    
    // Get the pickaxe ID - check multiple possible field names
    const pickaxeId = pickaxe.id || pickaxe.itemId || pickaxe._id;
    
    if (!pickaxeId) {
        console.error('ERROR: No pickaxe ID found in pickaxe object');
        console.error('Available fields:', Object.keys(pickaxe));
        return false;
    }
    
    console.log('Using pickaxe ID:', pickaxeId);
    
    try {
        // First, check if the item exists in the inventory
        const inventory = await PlayerInventory.findOne({ playerId });
        
        if (!inventory) {
            console.error(`ERROR: No inventory found for player ${playerId}`);
            return false;
        }
        
        console.log('Current inventory items:', inventory.items.map(item => ({
            itemId: item.itemId,
            quantity: item.quantity
        })));
        
        // Find the specific item
        const itemIndex = inventory.items.findIndex(item => 
            item.itemId === pickaxeId || 
            item.itemId === String(pickaxeId) || 
            String(item.itemId) === String(pickaxeId)
        );
        
        if (itemIndex === -1) {
            console.error(`ERROR: Pickaxe ${pickaxeId} not found in inventory`);
            console.error('Looking for:', pickaxeId);
            console.error('Available item IDs:', inventory.items.map(i => i.itemId));
            return false;
        }
        
        const currentQuantity = inventory.items[itemIndex].quantity;
        console.log(`Found pickaxe at index ${itemIndex} with quantity ${currentQuantity}`);
        
        let result;
        
        if (currentQuantity > 1) {
            // Decrement quantity
            console.log('Decrementing quantity...');
            result = await PlayerInventory.findOneAndUpdate(
                { 
                    playerId,
                    'items.itemId': pickaxeId
                },
                { 
                    $inc: { 'items.$.quantity': -1 } 
                },
                { new: true }
            );
            
            if (result) {
                console.log(`SUCCESS: Decremented ${pickaxe.name || 'pickaxe'} quantity to ${currentQuantity - 1}`);
                return true;
            }
        } else {
            // Remove the item entirely
            console.log('Removing item entirely (quantity was 1)...');
            result = await PlayerInventory.findOneAndUpdate(
                { playerId },
                { 
                    $pull: { 
                        items: { 
                            itemId: pickaxeId 
                        } 
                    } 
                },
                { new: true }
            );
            
            if (result) {
                console.log(`SUCCESS: Removed ${pickaxe.name || 'pickaxe'} from inventory`);
                return true;
            }
        }
        
        // If we get here, something went wrong
        console.error('ERROR: Update operation failed');
        console.error('Result:', result);
        return false;
        
    } catch (error) {
        console.error(`ERROR: Exception in breakPickaxe for player ${playerId}:`, error);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// Also fix the executePlayerInventoryOps to properly await the breakPickaxe
async function executePlayerInventoryOps(ops) {
    try {
        // Process all additions for this player
        for (const addition of ops.additions) {
            await this.addItemAtomic(ops.playerId, ops.playerTag, addition.itemId, addition.quantity);
        }
        
        // Process all removals (pickaxe breaks) for this player
        for (const removal of ops.removals) {
            const result = await breakPickaxe(ops.playerId, ops.playerTag, removal);
            if (!result) {
                console.error(`Failed to break pickaxe for player ${ops.playerId}`);
            }
        }
    } catch (error) {
        console.error(`Error in inventory operations for player ${ops.playerId}:`, error);
    }
}

module.exports = { breakPickaxe, executePlayerInventoryOps };

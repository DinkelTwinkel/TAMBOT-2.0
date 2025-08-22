// FIXED breakPickaxe function - replace the existing one in miningDatabase.js

async function breakPickaxe(playerId, playerTag, pickaxe) {
    console.log('Attempting to break pickaxe:', pickaxe.name, 'for player:', playerId);
    
    // Get the pickaxe ID and ensure it's a string (MongoDB stores itemId as String)
    const rawPickaxeId = pickaxe.id || pickaxe.itemId || pickaxe._id;
    
    if (!rawPickaxeId) {
        console.error('No pickaxe ID found in:', pickaxe);
        console.error('Available fields:', Object.keys(pickaxe));
        return false;
    }
    
    // CRITICAL FIX: Convert to string to match MongoDB schema
    const pickaxeId = String(rawPickaxeId);
    console.log(`Using pickaxe ID: "${pickaxeId}" (type: ${typeof pickaxeId})`);
    
    try {
        // First, check if the player has an inventory at all
        const playerInventory = await PlayerInventory.findOne({ playerId });
        
        if (!playerInventory) {
            console.error(`No inventory found for player ${playerId}`);
            return false;
        }
        
        // Find the specific item in the inventory
        const itemIndex = playerInventory.items.findIndex(item => 
            item.itemId === pickaxeId
        );
        
        if (itemIndex === -1) {
            console.error(`Pickaxe ${pickaxeId} not found in inventory`);
            console.log('Current inventory items:', playerInventory.items.map(i => ({
                itemId: i.itemId,
                quantity: i.quantity
            })));
            return false;
        }
        
        const currentQuantity = playerInventory.items[itemIndex].quantity;
        console.log(`Found pickaxe at index ${itemIndex} with quantity ${currentQuantity}`);
        
        let result;
        
        if (currentQuantity > 1) {
            // Decrement quantity by 1
            result = await PlayerInventory.findOneAndUpdate(
                { 
                    playerId,
                    'items.itemId': pickaxeId,
                    'items.quantity': { $gt: 1 }
                },
                { 
                    $inc: { 'items.$.quantity': -1 } 
                },
                { 
                    new: true,
                    runValidators: true
                }
            );
            
            if (result) {
                const updatedItem = result.items.find(i => i.itemId === pickaxeId);
                console.log(`✅ Successfully decremented ${pickaxe.name} quantity from ${currentQuantity} to ${updatedItem?.quantity || currentQuantity - 1}`);
                return true;
            } else {
                console.error('Failed to decrement quantity - query matched but update failed');
            }
        } else {
            // Quantity is 1, remove the item entirely
            console.log('Quantity is 1, removing item entirely...');
            
            result = await PlayerInventory.findOneAndUpdate(
                { playerId },
                { 
                    $pull: { 
                        items: { 
                            itemId: pickaxeId 
                        } 
                    } 
                },
                { 
                    new: true,
                    runValidators: true
                }
            );
            
            if (result) {
                // Verify the item was actually removed
                const stillExists = result.items.some(i => i.itemId === pickaxeId);
                if (!stillExists) {
                    console.log(`✅ Successfully removed ${pickaxe.name} from ${playerTag}'s inventory`);
                    return true;
                } else {
                    console.error('Update executed but item still exists in inventory');
                    return false;
                }
            } else {
                console.error('Failed to remove item - update query failed');
            }
        }
        
        // If we reach here, something went wrong
        console.error('Update operation failed unexpectedly');
        return false;
        
    } catch (error) {
        console.error(`Error breaking pickaxe for player ${playerId}:`, error.message);
        console.error('Stack trace:', error.stack);
        
        // Log the actual error type for better debugging
        if (error.name === 'ValidationError') {
            console.error('Validation error details:', error.errors);
        } else if (error.name === 'CastError') {
            console.error('Type casting error - check data types');
        }
        
        return false;
    }
}

// Also ensure the transaction properly awaits the result
class DatabaseTransactionFix {
    // ... other methods remain the same ...
    
    async executePlayerInventoryOps(ops) {
        try {
            // Process all additions for this player
            for (const addition of ops.additions) {
                await this.addItemAtomic(ops.playerId, ops.playerTag, addition.itemId, addition.quantity);
            }
            
            // Process all removals (pickaxe breaks) for this player - FIXED to properly await
            for (const removal of ops.removals) {
                const success = await breakPickaxe(ops.playerId, ops.playerTag, removal);
                if (!success) {
                    console.error(`⚠️ Failed to break pickaxe for player ${ops.playerId}:`, removal.name || 'unknown');
                    // Continue with other removals even if one fails
                }
            }
        } catch (error) {
            console.error(`Error in inventory operations for player ${ops.playerId}:`, error);
        }
    }
}

module.exports = { breakPickaxe };

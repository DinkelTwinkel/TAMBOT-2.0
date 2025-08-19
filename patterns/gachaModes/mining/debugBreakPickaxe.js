// Debug test for breakPickaxe function
const PlayerInventory = require('../../../models/inventory');

async function debugBreakPickaxe(playerId, pickaxeId) {
    console.log('\n=== DEBUGGING BREAKPICKAXE ISSUE ===\n');
    
    try {
        // Step 1: Check if inventory exists
        console.log('Step 1: Checking if inventory exists for player:', playerId);
        const inventory = await PlayerInventory.findOne({ playerId });
        
        if (!inventory) {
            console.log('❌ No inventory found for this player');
            return;
        }
        
        console.log('✅ Inventory found');
        console.log('Total items in inventory:', inventory.items.length);
        
        // Step 2: List all items
        console.log('\nStep 2: Current inventory items:');
        inventory.items.forEach((item, index) => {
            console.log(`  [${index}] ItemId: "${item.itemId}" (type: ${typeof item.itemId}), Quantity: ${item.quantity}`);
        });
        
        // Step 3: Check for pickaxe
        console.log('\nStep 3: Looking for pickaxe with ID:', pickaxeId, '(type:', typeof pickaxeId, ')');
        
        // Try different matching strategies
        const exactMatch = inventory.items.find(item => item.itemId === pickaxeId);
        const stringMatch = inventory.items.find(item => String(item.itemId) === String(pickaxeId));
        const looseMatch = inventory.items.find(item => item.itemId == pickaxeId);
        
        if (exactMatch) {
            console.log('✅ Found exact match:', exactMatch);
        } else if (stringMatch) {
            console.log('⚠️ Found string match (type mismatch):', stringMatch);
            console.log('   DB itemId type:', typeof stringMatch.itemId);
            console.log('   Search ID type:', typeof pickaxeId);
        } else if (looseMatch) {
            console.log('⚠️ Found loose match (== but not ===):', looseMatch);
        } else {
            console.log('❌ No match found');
        }
        
        // Step 4: Test the actual MongoDB query
        console.log('\nStep 4: Testing MongoDB query...');
        
        // Test the exact query used in breakPickaxe
        const testQuery = await PlayerInventory.findOne({
            playerId,
            'items.itemId': pickaxeId
        });
        
        if (testQuery) {
            console.log('✅ MongoDB query successful');
        } else {
            console.log('❌ MongoDB query failed - item not found with this query');
            
            // Try alternative queries
            console.log('\nTrying alternative queries:');
            
            // Try with string conversion
            const stringQuery = await PlayerInventory.findOne({
                playerId,
                'items.itemId': String(pickaxeId)
            });
            
            if (stringQuery) {
                console.log('✅ String conversion query worked');
            } else {
                console.log('❌ String conversion query failed');
            }
        }
        
        // Step 5: Suggest fix
        console.log('\n=== SUGGESTED FIX ===');
        if (!exactMatch && stringMatch) {
            console.log('The issue is a type mismatch. The pickaxe ID needs to be converted to match the database type.');
            console.log('Fix: Convert pickaxeId to', typeof stringMatch.itemId, 'before querying');
        } else if (!exactMatch && !stringMatch && !looseMatch) {
            console.log('The pickaxe ID does not exist in the inventory.');
            console.log('Possible issues:');
            console.log('  1. The pickaxe was already removed');
            console.log('  2. The pickaxe ID is incorrect');
            console.log('  3. The pickaxe was never added to inventory');
        }
        
    } catch (error) {
        console.error('Error during debug:', error);
    }
}

// Export for testing
module.exports = { debugBreakPickaxe };

// If running directly, you can test with command line args
if (require.main === module) {
    const [,, playerId, pickaxeId] = process.argv;
    if (playerId && pickaxeId) {
        debugBreakPickaxe(playerId, pickaxeId).then(() => process.exit(0));
    } else {
        console.log('Usage: node debugBreakPickaxe.js <playerId> <pickaxeId>');
    }
}

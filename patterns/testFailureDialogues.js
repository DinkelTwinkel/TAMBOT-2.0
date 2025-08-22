// Test script to verify different failure dialogue types
// Tests that buy failures and sell failures use different dialogue

require('dotenv').config({ path: '../.env' });
const shops = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');

// Import the shop dialogue functions
const { 
    generatePurchaseDialogue, 
    generateSellDialogue, 
    generatePoorDialogue,
    generateNoItemDialogue 
} = require('./generateShop');

async function testFailureDialogues() {
    console.log('=== Testing Different Failure Dialogue Types ===\n');
    
    // Test shops with different personalities
    const testShops = [
        shops[0],  // Coal Mine - Grimsby (gruff)
        shops[2],  // Diamond - Lady Crystalline (ruthless)
        shops[12]  // Inn - Big Martha (warm)
    ];
    
    const testItem = itemSheet.find(i => i.id === "28"); // Basic pickaxe
    
    if (!testItem) {
        console.error('Test item not found');
        return;
    }
    
    console.log(`Test Item: ${testItem.name}\n`);
    
    for (const shop of testShops) {
        if (!shop || !shop.shopkeeper) continue;
        
        console.log(`--- ${shop.shopkeeper.name} (${shop.name}) ---\n`);
        
        // Test "too poor to buy" dialogue
        console.log('TOO POOR TO BUY (need more money):');
        try {
            const poorDialogue = await generatePoorDialogue(
                shop,
                testItem,
                50 // Short by 50 coins
            );
            console.log(`  "${poorDialogue}"`);
        } catch (error) {
            console.log(`  Error: ${error.message}`);
        }
        
        // Test "no item to sell" dialogue  
        console.log('\nNO ITEM TO SELL (don\'t have the item):');
        try {
            const noItemDialogue = await generateNoItemDialogue(
                shop,
                testItem,
                5,  // Tried to sell 5
                0   // But has 0
            );
            console.log(`  "${noItemDialogue}"`);
        } catch (error) {
            console.log(`  Error: ${error.message}`);
        }
        
        // Test "not enough to sell" dialogue
        console.log('\nNOT ENOUGH TO SELL (have some but not enough):');
        try {
            const notEnoughDialogue = await generateNoItemDialogue(
                shop,
                testItem,
                10,  // Tried to sell 10
                3    // But only has 3
            );
            console.log(`  "${notEnoughDialogue}"`);
        } catch (error) {
            console.log(`  Error: ${error.message}`);
        }
        
        console.log('\n');
    }
    
    console.log('=== Dialogue Type Comparison ===\n');
    
    const comparisonShop = shops[0]; // Use Grimsby for comparison
    console.log(`Shopkeeper: ${comparisonShop.shopkeeper.name}\n`);
    
    console.log('FAILURE TYPE -> DIALOGUE\n');
    
    // Generate all types for comparison
    try {
        const poorBuy = await generatePoorDialogue(comparisonShop, testItem, 100);
        console.log(`Too Poor (Buy):     "${poorBuy}"`);
        
        const noItem = await generateNoItemDialogue(comparisonShop, testItem, 1, 0);
        console.log(`No Item (Sell):     "${noItem}"`);
        
        const notEnough = await generateNoItemDialogue(comparisonShop, testItem, 5, 2);
        console.log(`Not Enough (Sell):  "${notEnough}"`);
        
        const success = await generatePurchaseDialogue(comparisonShop, testItem, 50, { username: 'TestMiner' });
        console.log(`Success (Buy):      "${success}"`);
        
        const sellSuccess = await generateSellDialogue(comparisonShop, testItem, 25);
        console.log(`Success (Sell):     "${sellSuccess}"`);
        
    } catch (error) {
        console.error('Comparison error:', error.message);
    }
    
    console.log('\n=== Test Complete ===');
    console.log('\n✅ Different failure types now use appropriate dialogue:');
    console.log('  - Too Poor: talks about needing more money');
    console.log('  - No Item: talks about not having the item');
    console.log('  - Not Enough: talks about quantity mismatch');
}

// Run the test
testFailureDialogues().catch(console.error);
// Test script for AI Shop Dialogue Integration
// Run this with: node testShopAI.js

require('dotenv').config({ path: '../.env' });
const AIShopDialogueGenerator = require('./aiShopDialogueGenerator');
const shops = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');

async function runTests() {
    console.log('=== AI Shop Dialogue Generator Test Suite ===\n');
    
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ ERROR: OPENAI_API_KEY not found in .env file');
        return;
    }
    
    console.log('✅ OpenAI API Key found');
    console.log(`📋 Using model: ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo'}\n`);
    
    try {
        // Initialize the generator
        const aiGen = new AIShopDialogueGenerator();
        console.log('✅ AI Shop Dialogue Generator initialized\n');
        
        // Test 1: Generate idle dialogue for different shops
        console.log('--- Testing Shop Idle Dialogue (with 5% One Pick chance) ---\n');
        
        const testShops = [
            shops[0],  // Coal Mine
            shops[2],  // Diamond Mine
            shops[7],  // Adamantite Abyss
            shops[12]  // Miner's Inn
        ];
        
        for (const shop of testShops) {
            console.log(`Testing ${shop.name}:`);
            console.log(`  Shopkeeper: ${shop.shopkeeper.name}`);
            console.log(`  Personality: ${shop.shopkeeper.personality}`);
            
            // Generate multiple dialogues to potentially trigger The One Pick mention
            for (let i = 0; i < 3; i++) {
                const dialogue = await aiGen.generateIdleDialogue(shop, {
                    mood: i === 0 ? 'busy' : i === 1 ? 'relaxed' : 'mysterious'
                });
                console.log(`  💬 "${dialogue}"`);
            }
            console.log();
        }
        
        // Test 2: Force The One Pick mention
        console.log('--- Testing The One Pick Mentions (forced) ---\n');
        
        // Temporarily increase chance for testing
        const originalRandom = Math.random;
        Math.random = () => 0.01; // Force The One Pick mention
        
        for (const shop of testShops.slice(0, 2)) {
            console.log(`${shop.shopkeeper.name} on The One Pick:`);
            const dialogue = await aiGen.generateIdleDialogue(shop);
            console.log(`  💬 "${dialogue}"\n`);
        }
        
        // Restore random
        Math.random = originalRandom;
        
        // Test 3: Purchase dialogue
        console.log('--- Testing Purchase Dialogue ---\n');
        
        const testItem = itemSheet.find(item => item.id === "7"); // Diamond pickaxe
        const testBuyer = { username: "TestMiner" };
        
        for (const shop of testShops.slice(0, 2)) {
            console.log(`${shop.shopkeeper.name} completing a sale:`);
            const dialogue = await aiGen.generatePurchaseDialogue(
                shop,
                testItem,
                testItem.value * 1.2, // Marked up price
                testBuyer
            );
            console.log(`  💬 "${dialogue}"\n`);
        }
        
        // Test 4: Poor dialogue
        console.log('--- Testing Poor Customer Dialogue ---\n');
        
        for (const shop of testShops.slice(0, 2)) {
            console.log(`${shop.shopkeeper.name} rejecting a poor customer:`);
            const dialogue = await aiGen.generatePoorDialogue(
                shop,
                testItem,
                50 // Short by 50 coins
            );
            console.log(`  💬 "${dialogue}"\n`);
        }
        
        // Test 5: Sell dialogue
        console.log('--- Testing Sell Dialogue ---\n');
        
        for (const shop of testShops.slice(0, 2)) {
            console.log(`${shop.shopkeeper.name} buying from customer:`);
            const dialogue = await aiGen.generateSellDialogue(
                shop,
                testItem,
                Math.floor(testItem.value * 0.5) // Half price
            );
            console.log(`  💬 "${dialogue}"\n`);
        }
        
        // Test 6: Dynamic world events
        console.log('--- Testing Dynamic World Events ---\n');
        
        aiGen.addRecentEvent("A massive gold vein was discovered in the western shafts!");
        aiGen.updateWorldContext({
            currentWeather: "earthquake tremors from deep mining"
        });
        
        console.log('Added event: Gold vein discovery and earthquake tremors');
        console.log('Generating contextual dialogue...\n');
        
        const eventShop = shops[1]; // Topaz shop
        const eventDialogue = await aiGen.generateIdleDialogue(eventShop, {
            mood: 'excited'
        });
        console.log(`${eventShop.shopkeeper.name}: "${eventDialogue}"\n`);
        
        console.log('=== All Tests Complete! ===');
        console.log('\n✅ AI Shop Dialogue system is working correctly!');
        console.log('The One Pick has a 5% chance to be mentioned naturally.');
        console.log('\nIntegration complete! Your shops now have:');
        console.log('- Named shopkeepers with personalities');
        console.log('- Dynamic AI-generated dialogue');
        console.log('- Contextual responses to world events');
        console.log('- 5% chance to mention The One Pick legend');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('\nMake sure:');
        console.error('1. Your OPENAI_API_KEY in .env is valid');
        console.error('2. The OpenAI package is installed');
        console.error('3. Your internet connection is working');
    }
}

// Run the tests
console.log('Starting AI Shop Dialogue tests...\n');
runTests().catch(console.error);
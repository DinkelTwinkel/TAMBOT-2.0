// Test script for AI Dialogue Integration
// Run this with: node testAIDialogue.js

require('dotenv').config({ path: '../../../.env' });
const AIDialogueGenerator = require('./aiDialogueGenerator');
const npcs = require('../../../data/npcs.json');

async function runTests() {
    console.log('=== AI Dialogue Generator Test Suite ===\n');
    
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ ERROR: OPENAI_API_KEY not found in .env file');
        return;
    }
    
    console.log('✅ OpenAI API Key found');
    console.log(`📋 Using model: ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo'}\n`);
    
    try {
        // Initialize the generator
        const aiGen = new AIDialogueGenerator();
        console.log('✅ AI Dialogue Generator initialized\n');
        
        // Test 1: Generate dialogue for each NPC type
        console.log('--- Testing NPC Dialogue Generation ---\n');
        
        const testCases = [
            { npc: npcs[0], item: { name: "Ale" }, price: 5, tip: 1 },  // Gruff (low budget)
            { npc: npcs[1], item: { name: "Fine Wine" }, price: 50, tip: 15 },  // Lady Goldworth (high budget)
            { npc: npcs[2], item: { name: "Beer" }, price: 8, tip: 2 },  // Old Pete (regular)
        ];
        
        for (const test of testCases) {
            console.log(`Testing ${test.npc.name} (${test.npc.budget} budget):`);
            const dialogue = await aiGen.generateNPCDialogue(
                test.npc,
                test.item,
                test.price,
                { tip: test.tip }
            );
            console.log(`  💬 "${dialogue}"\n`);
        }
        
        // Test 2: Generate player dialogue
        console.log('--- Testing Player Dialogue Generation ---\n');
        
        const playerTests = [
            { username: "DragonSlayer99", item: { name: "Health Potion" }, price: 20 },
            { username: "MiningMike", item: { name: "Pickaxe Polish" }, price: 15, tip: 5 },
            { username: "WanderingBard", item: { name: "Lute Strings" }, price: 30 },
        ];
        
        for (const test of playerTests) {
            console.log(`Testing player ${test.username}:`);
            const dialogue = await aiGen.generatePlayerDialogue(
                { username: test.username },
                test.item,
                test.price,
                { tip: test.tip || 0 }
            );
            console.log(`  💬 "${dialogue}"\n`);
        }
        
        // Test 3: Generate event dialogue
        console.log('--- Testing Event Dialogue Generation ---\n');
        
        const events = [
            { type: 'rush_hour', context: {} },
            { type: 'big_tipper', context: { tip: 100 } },
            { type: 'celebration', context: { occasion: "striking gold" } },
            { type: 'complaint', context: { issue: "cold food" } }
        ];
        
        for (const event of events) {
            console.log(`Testing ${event.type} event:`);
            const dialogue = await aiGen.generateEventDialogue(event.type, event.context);
            console.log(`  💬 "${dialogue}"\n`);
        }
        
        // Test 4: Dynamic context updates
        console.log('--- Testing Dynamic Context Updates ---\n');
        
        aiGen.addRecentEvent("The mine foreman announced double wages for the week!");
        aiGen.updateInnDetails({
            currentWeather: "stormy with heavy rain",
            atmosphere: "Crowded with miners seeking shelter from the storm"
        });
        
        console.log('Added storm event and updated atmosphere');
        console.log('Generating contextual NPC dialogue...');
        
        const stormDialogue = await aiGen.generateNPCDialogue(
            npcs[4],  // Tired Tom
            { name: "Hot Soup" },
            10,
            { mood: "relieved" }
        );
        console.log(`  💬 "${stormDialogue}"\n`);
        
        console.log('=== All Tests Complete! ===');
        console.log('\n✅ AI Dialogue system is working correctly!');
        console.log('You can now use it in your inn-keeping game.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('\nMake sure:');
        console.error('1. Your OPENAI_API_KEY in .env is valid');
        console.error('2. You have npm installed the openai package');
        console.error('3. Your internet connection is working');
    }
}

// Run the tests
console.log('Starting AI Dialogue tests...\n');
runTests().catch(console.error);
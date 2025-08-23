// Usage Examples for AI Dialogue Integration
// This file shows how to use the AI dialogue system in your inn-keeping game

const InnSalesLog = require('./innSalesLog');
const npcs = require('../../../data/npcs.json');
const itemSheet = require('../../../data/itemSheet.json');

// Example 1: Processing an NPC purchase with AI dialogue
async function handleNPCPurchase(channel, dbEntry) {
    // Select a random NPC
    const npc = npcs[Math.floor(Math.random() * npcs.length)];
    
    // Select an item they might buy
    const consumables = itemSheet.filter(item => 
        item.type === 'consumable' && 
        npc.preferences.includes(item.subtype || item.type)
    );
    const item = consumables[Math.floor(Math.random() * consumables.length)];
    
    // Calculate price based on NPC budget
    let price = item.value || 10;
    if (npc.budget === 'low') price = Math.ceil(price * 0.8);
    if (npc.budget === 'high') price = Math.ceil(price * 1.2);
    
    // Calculate tip
    const tip = Math.floor(price * npc.tipModifier * 0.1);
    
    // Create sale record
    const sale = {
        itemId: item.id,
        buyer: npc.id,
        buyerName: npc.name,
        price: price,
        tip: tip,
        profit: Math.floor(price * 0.95),
        isNPC: true,
        npcData: npc,
        timestamp: new Date()
    };
    
    // Add to database
    if (!dbEntry.gameData) dbEntry.gameData = {};
    if (!dbEntry.gameData.sales) dbEntry.gameData.sales = [];
    dbEntry.gameData.sales.push(sale);
    
    // Update the sales log (AI dialogue will be generated automatically)
    await InnSalesLog.updateWithNPCPurchase(channel, dbEntry, sale);
    
    console.log(`NPC ${npc.name} purchased ${item.name} - AI dialogue generated!`);
}

// Example 2: Processing a player purchase with AI dialogue
async function handlePlayerPurchase(channel, dbEntry, player, item) {
    const price = item.value || 10;
    const tip = Math.random() > 0.7 ? Math.floor(price * 0.2) : 0;
    
    // Create sale record
    const sale = {
        itemId: item.id,
        buyer: player.id,
        buyerName: player.username,
        price: price,
        tip: tip,
        profit: Math.floor(price * 0.95),
        isNPC: false,
        timestamp: new Date()
    };
    
    // Add to database
    if (!dbEntry.gameData) dbEntry.gameData = {};
    if (!dbEntry.gameData.sales) dbEntry.gameData.sales = [];
    dbEntry.gameData.sales.push(sale);
    
    // Update the sales log with latest purchase info
    await InnSalesLog.updateWithLatestPurchase(channel, dbEntry, item.id, player);
    
    console.log(`Player ${player.username} purchased ${item.name} - AI dialogue generated!`);
}

// Example 3: Generating special event dialogue
async function handleSpecialEvent(channel, eventType, context = {}) {
    const dialogue = await InnSalesLog.generateEventDialogue(eventType, context);
    
    if (dialogue) {
        // Send as a message or add to an embed
        await channel.send(`💬 *${dialogue}*`);
    }
}

// Example 4: Updating world context based on game events
function updateWorldEvents(gameState) {
    const aiDialogue = InnSalesLog.aiDialogue;
    
    if (!aiDialogue) {
        console.log('AI Dialogue not initialized');
        return;
    }
    
    // Add dynamic events based on game state
    if (gameState.mineCollapse) {
        aiDialogue.addRecentEvent("A section of the eastern mine collapsed this morning");
    }
    
    if (gameState.festivalActive) {
        aiDialogue.updateInnDetails({
            atmosphere: "Festive and crowded with celebration decorations",
            specialties: ["Festival Ale", "Celebration Cake", "Lucky Charms"]
        });
    }
    
    if (gameState.currentSeason === 'winter') {
        aiDialogue.updateInnDetails({
            currentWeather: "snowy and bitterly cold",
            atmosphere: "Warm and cozy with a roaring fireplace"
        });
    }
}

// Example 5: Complete integration in a command
async function innSellCommand(interaction, dbEntry) {
    const channel = interaction.channel;
    const user = interaction.user;
    
    // Initialize AI if not already done
    if (!InnSalesLog.aiDialogue) {
        InnSalesLog.initializeAI();
    }
    
    // Simulate time of day effects
    const hour = new Date().getHours();
    let eventType = null;
    
    if (hour >= 17 && hour <= 19) {
        eventType = 'rush_hour';
    }
    
    // Roll for NPC or player customer
    const isNPCCustomer = Math.random() > 0.5;
    
    if (isNPCCustomer) {
        await handleNPCPurchase(channel, dbEntry);
    } else {
        // Simulate another player buying
        const item = itemSheet[Math.floor(Math.random() * itemSheet.length)];
        await handlePlayerPurchase(channel, dbEntry, user, item);
    }
    
    // Chance for special event dialogue
    if (eventType) {
        await handleSpecialEvent(channel, eventType);
    }
    
    // Save to database (implement your save logic)
    // await saveToDatabase(dbEntry);
}

// Example 6: Testing the AI dialogue directly
async function testAIDialogue() {
    const aiGen = InnSalesLog.aiDialogue;
    
    if (!aiGen || !aiGen.isAvailable()) {
        console.log('AI Dialogue generator not available. Check your OPENAI_API_KEY in .env');
        return;
    }
    
    // Test NPC dialogue
    const testNPC = npcs[0]; // Gruff McGrufferson
    const testItem = { name: "Hearty Stew", value: 15 };
    
    console.log('Testing NPC Dialogue Generation...');
    const npcDialogue = await aiGen.generateNPCDialogue(
        testNPC,
        testItem,
        15,
        { tip: 2, mood: 'tired' }
    );
    console.log(`${testNPC.name}: "${npcDialogue}"`);
    
    // Test Player dialogue
    console.log('\nTesting Player Dialogue Generation...');
    const playerDialogue = await aiGen.generatePlayerDialogue(
        { username: "TestPlayer" },
        testItem,
        15,
        { previousPurchases: 3 }
    );
    console.log(`TestPlayer: "${playerDialogue}"`);
    
    // Test Event dialogue
    console.log('\nTesting Event Dialogue Generation...');
    const eventDialogue = await aiGen.generateEventDialogue('celebration', {
        occasion: "finding a rare gem"
    });
    console.log(`Event: "${eventDialogue}"`);
}

// Export functions for use in other files
module.exports = {
    handleNPCPurchase,
    handlePlayerPurchase,
    handleSpecialEvent,
    updateWorldEvents,
    innSellCommand,
    testAIDialogue
};

// If running this file directly, test the AI
if (require.main === module) {
    console.log('Running AI Dialogue Tests...\n');
    testAIDialogue().catch(console.error);
}
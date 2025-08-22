// Shop Handler Integration Example
// This shows how to use AI dialogue in buy/sell handlers

const generateShop = require('./generateShop');
const shops = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');

/**
 * Example: Handle shop purchase with AI dialogue
 * This would be called when a user selects an item from the buy menu
 */
async function handleShopPurchase(interaction, shopId, itemId, userBalance) {
    // Get shop info
    const shop = shops.find(s => s.id === shopId);
    if (!shop) {
        return interaction.reply('Shop not found!');
    }
    
    // Get item info
    const item = itemSheet.find(i => i.id === itemId);
    if (!item) {
        return interaction.reply('Item not found!');
    }
    
    // Get fluctuated price (you'd get this from your existing system)
    const price = await calculateItemPrice(item, interaction.guild.id, shop.priceChangeFactor);
    
    // Check if user can afford it
    if (userBalance < price) {
        // Generate "too poor" dialogue using AI
        const poorDialogue = await generateShop.generatePoorDialogue(
            shop,
            item,
            price - userBalance // How much they're short
        );
        
        // Reply with shopkeeper's response
        return interaction.reply({
            content: `**${shop.shopkeeper?.name || 'Shopkeeper'}:** "${poorDialogue}"`,
            ephemeral: true
        });
    }
    
    // Process the purchase (your existing logic)
    // ... deduct balance, add item to inventory, etc ...
    
    // Generate success dialogue using AI
    const successDialogue = await generateShop.generatePurchaseDialogue(
        shop,
        item,
        price,
        { 
            username: interaction.user.username,
            id: interaction.user.id 
        }
    );
    
    // Reply with purchase confirmation
    return interaction.reply({
        embeds: [{
            title: '✅ Purchase Successful!',
            description: `You bought **${item.name}** for **${price} coins**`,
            fields: [
                {
                    name: shop.shopkeeper?.name || 'Shopkeeper',
                    value: `*"${successDialogue}"*`
                }
            ],
            color: 0x00FF00,
            thumbnail: {
                url: interaction.user.displayAvatarURL()
            }
        }]
    });
}

/**
 * Example: Handle shop sell with AI dialogue
 * This would be called when a user selects an item from the sell menu
 */
async function handleShopSell(interaction, shopId, itemId, userInventory) {
    // Get shop info
    const shop = shops.find(s => s.id === shopId);
    if (!shop) {
        return interaction.reply('Shop not found!');
    }
    
    // Get item info
    const item = itemSheet.find(i => i.id === itemId);
    if (!item) {
        return interaction.reply('Item not found!');
    }
    
    // Check if user has the item
    if (!userInventory.includes(itemId)) {
        return interaction.reply({
            content: `You don't have any ${item.name} to sell!`,
            ephemeral: true
        });
    }
    
    // Calculate sell price (typically 50% of buy price)
    const sellPrice = Math.floor(item.value * 0.5);
    
    // Process the sale (your existing logic)
    // ... remove item from inventory, add coins, etc ...
    
    // Generate sell dialogue using AI
    const sellDialogue = await generateShop.generateSellDialogue(
        shop,
        item,
        sellPrice
    );
    
    // Reply with sale confirmation
    return interaction.reply({
        embeds: [{
            title: '💰 Sale Complete!',
            description: `You sold **${item.name}** for **${sellPrice} coins**`,
            fields: [
                {
                    name: shop.shopkeeper?.name || 'Shopkeeper',
                    value: `*"${sellDialogue}"*`
                }
            ],
            color: 0xFFD700,
            thumbnail: {
                url: interaction.user.displayAvatarURL()
            }
        }]
    });
}

/**
 * Example: Special event dialogue
 * This could trigger randomly or during special conditions
 */
async function handleSpecialShopEvent(channel, shopId, eventType) {
    const shop = shops.find(s => s.id === shopId);
    if (!shop) return;
    
    // Get AI dialogue generator
    const aiDialogue = generateShop.getAIShopDialogue();
    if (!aiDialogue) return;
    
    let specialDialogue;
    
    switch(eventType) {
        case 'the_one_pick_rumor':
            // Force a One Pick mention
            const originalRandom = Math.random;
            Math.random = () => 0.01; // Force mention
            specialDialogue = await aiDialogue.generateIdleDialogue(shop, {
                mood: 'mysterious'
            });
            Math.random = originalRandom;
            break;
            
        case 'busy_hour':
            specialDialogue = await aiDialogue.generateIdleDialogue(shop, {
                mood: 'stressed'
            });
            break;
            
        case 'closing_time':
            specialDialogue = await aiDialogue.generateIdleDialogue(shop, {
                mood: 'tired'
            });
            break;
            
        default:
            specialDialogue = await aiDialogue.generateIdleDialogue(shop);
    }
    
    // Send special event message
    await channel.send({
        embeds: [{
            author: {
                name: shop.shopkeeper?.name || 'Shopkeeper',
                icon_url: `https://via.placeholder.com/50` // You could add shopkeeper avatars
            },
            description: `*${specialDialogue}*`,
            color: 0x8B4513,
            footer: {
                text: shop.name
            }
        }]
    });
}

/**
 * Example: Update world events that affect shop dialogue
 */
function updateShopWorldEvents(eventType, details) {
    const aiDialogue = generateShop.getAIShopDialogue();
    if (!aiDialogue) return;
    
    switch(eventType) {
        case 'mine_discovery':
            aiDialogue.addRecentEvent(`${details.mineral} discovered in ${details.location}!`);
            break;
            
        case 'accident':
            aiDialogue.addRecentEvent(`Mining accident in ${details.location} - ${details.casualties} injured`);
            break;
            
        case 'festival':
            aiDialogue.updateWorldContext({
                atmosphere: 'festive and celebratory',
                currentWeather: 'perfect festival weather'
            });
            break;
            
        case 'the_one_pick_sighting':
            // Special event - someone claims to have seen The One Pick
            aiDialogue.addRecentEvent("A miner swears they saw The One Pick deep in the forgotten shafts!");
            break;
    }
}

// Helper function to calculate item price (placeholder)
async function calculateItemPrice(item, guildId, priceChangeFactor) {
    // This would use your existing price fluctuation system
    const basePrice = item.value || 10;
    // Add your fluctuation logic here
    return basePrice;
}

// Export the handlers
module.exports = {
    handleShopPurchase,
    handleShopSell,
    handleSpecialShopEvent,
    updateShopWorldEvents
};

// Example usage in a Discord command/interaction handler:
/*
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    
    // Handle shop buy menu
    if (interaction.customId.startsWith('shop_buy_select_')) {
        const shopId = 1; // Get from your system
        const itemId = interaction.values[0];
        const userBalance = 100; // Get from your database
        
        await handleShopPurchase(interaction, shopId, itemId, userBalance);
    }
    
    // Handle shop sell menu
    if (interaction.customId.startsWith('shop_sell_select_')) {
        const shopId = 1; // Get from your system
        const itemId = interaction.values[0];
        const userInventory = ['1', '2', '3']; // Get from your database
        
        await handleShopSell(interaction, shopId, itemId, userInventory);
    }
});

// Example: Trigger special events
setInterval(async () => {
    // 1% chance every minute to have a One Pick rumor in active shops
    if (Math.random() < 0.01) {
        const activeChannel = getActiveShopChannel(); // Your logic
        if (activeChannel) {
            await handleSpecialShopEvent(activeChannel, 1, 'the_one_pick_rumor');
        }
    }
}, 60000);
*/
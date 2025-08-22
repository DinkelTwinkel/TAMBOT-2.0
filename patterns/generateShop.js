// Updated generateShop.js - Added price fluctuation system with global guild config seeding and AI dialogue
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const GachaVC = require('../models/activevcs');
const GuildConfig = require('../models/GuildConfig');
const gachaData = require('../data/gachaServers.json');
const shopData = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');
const registerBotMessage = require('./registerBotMessage');
const generateShopImage = require('./generateShopImage');
const path = require('path');
const fs = require('fs');
const AIShopDialogueGenerator = require('./aiShopDialogueGenerator');

// Initialize AI dialogue generator
let aiShopDialogue = null;
try {
    aiShopDialogue = new AIShopDialogueGenerator();
    if (aiShopDialogue.isAvailable()) {
        console.log('[GenerateShop] AI shop dialogue generator initialized');
    } else {
        console.log('[GenerateShop] AI shop dialogue not configured (no API key)');
        aiShopDialogue = null;
    }
} catch (error) {
    console.error('[GenerateShop] Failed to initialize AI shop dialogue:', error.message);
    aiShopDialogue = null;
}

function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

// New function to calculate fluctuated price using global guild config seed
function calculateFluctuatedPrice(basePrice, guildConfigUpdatedAt, itemId, priceChangeFactor) {
    // Convert updatedAt to a usable seed format (days since epoch)
    const daysSinceEpoch = Math.floor(guildConfigUpdatedAt.getTime() / (1000 * 60 * 60 * 24));
    
    // Use guild config date + item ID as seed for consistent price fluctuation
    const seed = daysSinceEpoch + parseInt(itemId || 0);
    const randomValue = seededRandom(seed);
    
    // Convert to range of -priceChangeFactor to +priceChangeFactor
    const fluctuation = (randomValue - 0.5) * 2 * priceChangeFactor;
    
    // Apply fluctuation (1.0 = no change, 1.1 = 10% increase, 0.9 = 10% decrease)
    const multiplier = 1 + fluctuation;
    
    // Ensure minimum price of 1
    return Math.max(1, Math.floor(basePrice * multiplier));
}

// Function to get fluctuated prices for all items in the shop using guild config
async function getShopPrices(itemIds, guildId, priceChangeFactor) {
    const prices = {};
    
    // Get guild config for seeding
    const guildConfig = await GuildConfig.findOne({ guildId });
    if (!guildConfig) {
        console.warn(`No guild config found for guild ${guildId}, using fallback seeding`);
        // Fallback to current date if no guild config
        const fallbackDate = new Date();
        itemIds.forEach(itemId => {
            const item = itemSheet.find(i => i.id === String(itemId));
            if (item) {
                prices[itemId] = {
                    buy: calculateFluctuatedPrice(item.value, fallbackDate, itemId, priceChangeFactor),
                    sell: Math.floor(calculateFluctuatedPrice(item.value, fallbackDate, itemId, priceChangeFactor) / 2)
                };
            }
        });
        return prices;
    }
    
    itemIds.forEach(itemId => {
        const item = itemSheet.find(i => i.id === String(itemId));
        if (item) {
            prices[itemId] = {
                buy: calculateFluctuatedPrice(item.value, guildConfig.updatedAt, itemId, priceChangeFactor),
                sell: Math.floor(calculateFluctuatedPrice(item.value, guildConfig.updatedAt, itemId, priceChangeFactor) / 2)
            };
        }
    });
    
    return prices;
}

/**
 * Validates that item IDs exist in the itemSheet
 * @param {Array} itemIds - Array of item IDs to validate
 * @returns {Array} - Array of valid item IDs
 */
function validateItemIds(itemIds) {
    return itemIds.filter(id => {
        const exists = itemSheet.some(item => item.id === String(id));
        if (!exists) {
            console.warn(`⚠️ Shop references non-existent item ID: ${id}`);
        }
        return exists;
    });
}

async function generateShop(channel, closingTime = 20) {
    // Default to coalMineShop as fallback
    const DEFAULT_SHOP_ID = 'coalMineShop';
    
    const matchingVC = await GachaVC.findOne({ channelId: channel.id }).lean();
    if (!matchingVC) return channel.send('⚘ Not an active Gacha VC channel!');

    // Try to find the shop info, fallback to coalMineShop if not found
    let shopInfo = shopData.find(s => s.id === gachaData.find(g => g.id === matchingVC.typeId)?.shop);
    if (!shopInfo) {
        console.warn(`⚠️ No shop data found for VC type ${matchingVC.typeId}, defaulting to ${DEFAULT_SHOP_ID}`);
        shopInfo = shopData.find(s => s.id === DEFAULT_SHOP_ID);
        if (!shopInfo) {
            return channel.send('⚠️ No shop data found and default shop is missing!');
        }
    }
    
    const now = Date.now();
    if (new Date(matchingVC.nextShopRefresh).getTime() < now) matchingVC.nextShopRefresh = new Date(now + 25 * 60 * 1000);

    // Validate static items and item pool to ensure they exist in itemSheet
    const validStaticItems = validateItemIds(shopInfo.staticItems);
    const validItemPool = validateItemIds(shopInfo.itemPool);
    
    let buyPool = [...validStaticItems];
    const amount = shopInfo.rotationalAmount || validItemPool.length;
    let availableItems = validItemPool.filter(id => !buyPool.includes(id));
    
    // Keep item rotation seeded by nextShopRefresh
    let seed = matchingVC.nextShopRefresh.getTime();

    for (let i = 0; i < amount && availableItems.length > 0; i++) {
        const index = Math.floor(seededRandom(seed++) * availableItems.length);
        buyPool.push(availableItems[index]);
        availableItems.splice(index, 1);
    }

    // Calculate fluctuated prices using guild config for all valid items
    const allShopItems = Array.from(new Set([...validStaticItems, ...validItemPool]));
    const fluctuatedPrices = await getShopPrices(allShopItems, channel.guild.id, shopInfo.priceChangeFactor);

    // Prepare shop context for AI dialogue
    const rotationalItems = buyPool.filter(id => !validStaticItems.includes(id));
    const shopContext = {
        staticItems: validStaticItems.map(id => {
            const item = itemSheet.find(i => i.id === String(id));
            return item ? {
                id: id,
                name: item.name,
                currentPrice: fluctuatedPrices[id]?.buy || item.value,
                basePrice: item.value,
                priceStatus: getPriceStatus(fluctuatedPrices[id]?.buy, item.value)
            } : null;
        }).filter(Boolean),
        rotationalItems: rotationalItems.map(id => {
            const item = itemSheet.find(i => i.id === String(id));
            return item ? {
                id: id,
                name: item.name,
                currentPrice: fluctuatedPrices[id]?.buy || item.value,
                basePrice: item.value,
                priceStatus: getPriceStatus(fluctuatedPrices[id]?.buy, item.value)
            } : null;
        }).filter(Boolean),
        overallPriceStatus: getOverallPriceStatus(buyPool, fluctuatedPrices, itemSheet)
    };

    // Generate AI dialogue or use fallback
    let pickShopDescription;
    if (aiShopDialogue && aiShopDialogue.isAvailable()) {
        try {
            // Generate contextual dialogue with shop inventory awareness
            pickShopDescription = await aiShopDialogue.generateIdleDialogue(shopInfo, {
                mood: getShopkeeperMood(shopInfo),
                playerClass: 'miner', // You can make this dynamic based on user roles
                shopContext: shopContext
            });
            console.log(`[GenerateShop] Generated AI dialogue for ${shopInfo.shopkeeper?.name || shopInfo.name}`);
        } catch (err) {
            console.log('[GenerateShop] AI dialogue generation failed, using fallback');
            pickShopDescription = shopInfo.idleDialogue[Math.floor(shopInfo.idleDialogue.length * Math.random())];
        }
    } else {
        // Fallback to existing dialogue
        pickShopDescription = shopInfo.idleDialogue[Math.floor(shopInfo.idleDialogue.length * Math.random())];
    }
    
    // Create buyPool with fluctuated prices for image generation
    const buyPoolWithPrices = buyPool
        .map(itemId => {
            const item = itemSheet.find(i => i.id === String(itemId));
            if (!item) {
                console.warn(`Item with ID ${itemId} not found in itemSheet for image generation`);
                return null;
            }
            return {
                itemId: itemId,
                price: fluctuatedPrices[itemId]?.buy || item.value || 0
            };
        })
        .filter(item => item !== null); // Remove any null entries
    
    // Generate shop image with fallback to coalMineShop if generation fails
    let imageBuffer;
    try {
        imageBuffer = await generateShopImage(shopInfo, buyPoolWithPrices);
    } catch (error) {
        console.error(`Failed to generate shop image for ${shopInfo.id}, falling back to coalMineShop:`, error);
        // Try to use coalMineShop as fallback
        const fallbackShop = shopData.find(s => s.id === 'coalMineShop');
        if (fallbackShop) {
            try {
                // Use the same items but with coalMineShop's visual assets
                imageBuffer = await generateShopImage(fallbackShop, buyPoolWithPrices);
                console.log('Successfully generated fallback shop image using coalMineShop assets');
            } catch (fallbackError) {
                console.error('Failed to generate fallback shop image:', fallbackError);
                // If even the fallback fails, create a simple placeholder
                return channel.send('⚠️ Unable to generate shop image. Please try again later.');
            }
        } else {
            return channel.send('⚠️ Unable to generate shop image and fallback shop not found.');
        }
    }
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'shop.png' });

    const nextRefreshTime = new Date(matchingVC.nextShopRefresh).getTime();
    let diffMs = nextRefreshTime - now;
    if (diffMs < 0) diffMs = 0;

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);

    let refreshText;
    if (diffHours > 0) {
        refreshText = `    ✧      ✧   shop refreshing ${diffHours}h ${diffMinutes % 60}m    ✧      ✧`;
    } else {
        refreshText = `    ✧      ✧   shop refreshing in ${diffMinutes}m    ✧      ✧`;
    }

    // Load shopkeeper thumbnail with fallback to coalMineShop
    let thumbAttachment;
    const shopkeeperPath = `./assets/shops/${path.basename(shopInfo.image)}_shopKeeper.gif`;
    const fallbackShopkeeperPath = './assets/shops/coalMineShop_shopKeeper.gif';
    
    try {
        // Check if the shopkeeper image exists
        if (fs.existsSync(shopkeeperPath)) {
            thumbAttachment = new AttachmentBuilder(shopkeeperPath, { name: 'thumb.gif' });
        } else {
            console.warn(`Shopkeeper image not found: ${shopkeeperPath}, using coalMineShop fallback`);
            if (fs.existsSync(fallbackShopkeeperPath)) {
                thumbAttachment = new AttachmentBuilder(fallbackShopkeeperPath, { name: 'thumb.gif' });
            } else {
                // If even the fallback doesn't exist, proceed without thumbnail
                console.error('Fallback shopkeeper image also not found');
                thumbAttachment = null;
            }
        }
    } catch (error) {
        console.error('Error loading shopkeeper image:', error);
        // Try fallback
        try {
            if (fs.existsSync(fallbackShopkeeperPath)) {
                thumbAttachment = new AttachmentBuilder(fallbackShopkeeperPath, { name: 'thumb.gif' });
            } else {
                thumbAttachment = null;
            }
        } catch (fallbackError) {
            console.error('Error loading fallback shopkeeper image:', fallbackError);
            thumbAttachment = null;
        }
    }

    // Include shopkeeper name if available
    // const shopTitle = shopInfo.shopkeeper?.name ? 
    //     `${shopInfo.name} - ${shopInfo.shopkeeper.name}` : 
    //     shopInfo.name;

    const shopTitle = shopInfo.name;

    const embed = new EmbedBuilder()
        .setTitle(shopTitle)
        .setColor('Gold')
        .setDescription('```' + formatDescription(pickShopDescription) + '```')
        .setImage('attachment://shop.png')
        .setFooter({ text: refreshText })
        .setThumbnail(thumbAttachment ? 'attachment://thumb.gif' : null);
    
    // Add shopkeeper bio as a field if available
    if (shopInfo.shopkeeper?.bio) {
        embed.addFields({
            name: '\n\n',
            value: `*${shopInfo.shopkeeper.bio}*`,
            inline: false
        });
    }

    // Check last 3 messages for existing shop message with same title
    const recentMessages = await channel.messages.fetch({ limit: 3 });
    let existingShopMessage = null;
    
    for (const [, msg] of recentMessages) {
        if (msg.embeds.length > 0 && msg.embeds[0].title === embed.data.title) {
            existingShopMessage = msg;
            break;
        }
    }

    let shopMessage;
    
    if (existingShopMessage) {
        // Edit the existing message
        // Edit with available attachments
        const files = [attachment];
        if (thumbAttachment) files.push(thumbAttachment);
        
        shopMessage = await existingShopMessage.edit({ 
            embeds: [embed], 
            files: files,
            attachments: [] // Clear old attachments
        });
        console.log(`✏️ Edited existing shop message in channel ${channel.id}`);
    } else {
        // Create new message if no existing one found in last 3 messages
        // Send with available attachments
        const files = [attachment];
        if (thumbAttachment) files.push(thumbAttachment);
        
        shopMessage = await channel.send({ embeds: [embed], files: files });
        console.log(`✅ Created new shop message in channel ${channel.id}`);
    }

    //registerBotMessage(shopMessage.guild.id, shopMessage.channel.id, shopMessage.id, 50);

    // Create buy menu with fluctuated prices
    const buyMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`shop_buy_select_${shopMessage.id}`)
            .setPlaceholder('Select an item to buy')
            .addOptions(
                buyPool
                    .map(id => {
                        const item = itemSheet.find(i => i.id === String(id));
                        if (!item) {
                            console.warn(`Item with ID ${id} not found in itemSheet`);
                            return null;
                        }
                        
                        const fluctuatedPrice = fluctuatedPrices[id];
                        if (!fluctuatedPrice) {
                            console.warn(`No price found for item ${id}`);
                            return null;
                        }

                        // Build stat line from all abilities
                        let statLine = '';
                        if (Array.isArray(item.abilities) && item.abilities.length > 0) {
                            const abilityStrings = item.abilities
                                .filter(a => a.powerlevel && a.powerlevel > 0)
                                .map(a => `+${a.powerlevel} ${a.name}`);
                            
                            if (abilityStrings.length > 0) {
                                statLine = abilityStrings.join(', ');
                            }
                        }

                        // Show price change indicator
                        const originalPrice = item.value;
                        const currentPrice = fluctuatedPrice.buy;
                        let priceIndicator = '';
                        
                        if (currentPrice > originalPrice) {
                            priceIndicator = ' ▲';
                        } else if (currentPrice < originalPrice) {
                            priceIndicator = ' ▼';
                        }

                        const descriptionText = `${item.description}${statLine ? ` | ${statLine}` : ''}`;

                        return {
                            label: `${item.name} [${currentPrice}c${priceIndicator}]`,
                            description: descriptionText.slice(0, 100),
                            value: String(item.id)
                        };
                    })
                    .filter(option => option !== null) // Remove any null entries
            )
    );

    // Create sell menu with fluctuated prices (using validated item lists)
    const sellItemIds = Array.from(new Set([...validStaticItems, ...validItemPool]));
    const sellOptions = sellItemIds
        .map(itemId => {
            const item = itemSheet.find(i => i.id === String(itemId));
            if (!item) {
                console.warn(`Item with ID ${itemId} not found in itemSheet for sell menu`);
                return null;
            }
            
            const fluctuatedPrice = fluctuatedPrices[itemId];
            if (!fluctuatedPrice) {
                console.warn(`No price found for item ${itemId} in sell menu`);
                return null;
            }
            
            return {
                label: item.name,
                description: `Sell price: ${fluctuatedPrice.sell}c`,
                value: String(itemId),
            };
        })
        .filter(option => option !== null); // Remove any null entries

    const sellMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`shop_sell_select_${shopMessage.id}`)
            .setPlaceholder('Select an item to sell')
            .addOptions(sellOptions)
    );

    // Edit the shop message to add the menus
    await shopMessage.edit({ components: [buyMenu, sellMenu] });

    console.log(`✅ Shop ${existingShopMessage ? 'updated' : 'generated'} for channel ${channel.id} with message ID ${shopMessage.id}`);
    
    setTimeout(async () => {
        await closeShop(shopMessage);
    }, 20 * 60 * 1000);

    return shopMessage;
}

const formatDescription = (str) => {
    if (!str) return '';
    str = str.toString().trim();
    
    // Check if it's an action (starts with * or ~ or -)
    const isAction = str.startsWith('*') || str.startsWith('~') || str.startsWith('-');
    
    if (isAction) {
        // For actions, remove surrounding asterisks but keep the content as-is
        if (str.startsWith('*') && str.endsWith('*')) {
            return str.slice(1, -1);
        }
        return str; // Return action as-is
    }
    
    // For dialogue, remove existing quotes first to avoid doubles
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        str = str.slice(1, -1);
    }
    
    // Add quotes for spoken dialogue
    return `"${str}"`;
};

/**
 * Deletes the shop message when the break ends.
 * @param {Message} shopMessage - The Message object returned by generateShop()
 */
async function closeShop(shopMessage) {
    if (!shopMessage) return;

    try {
        await shopMessage.delete();
        console.log(`🗑️ Shop message deleted in #${shopMessage.channel.name}`);
    } catch (error) {
        if (error.code === 10008) {
            // Unknown Message (already deleted or invalid)
            console.warn('⚠️ Tried to delete shop message, but it no longer exists.');
        } else {
            console.error('Error deleting shop message:', error);
        }
    }
}

/**
 * Determine if a price is high, low, or normal
 * @param {number} currentPrice - Current fluctuated price
 * @param {number} basePrice - Base price from item sheet
 * @returns {string} - 'high', 'low', or 'normal'
 */
function getPriceStatus(currentPrice, basePrice) {
    if (!currentPrice || !basePrice) return 'normal';
    const ratio = currentPrice / basePrice;
    if (ratio > 1.1) return 'high';
    if (ratio < 0.9) return 'low';
    return 'normal';
}

/**
 * Get overall price status for the shop
 * @param {Array} buyPool - Items currently for sale
 * @param {Object} fluctuatedPrices - Current prices
 * @param {Array} itemSheet - Item data
 * @returns {string} - Overall price trend
 */
function getOverallPriceStatus(buyPool, fluctuatedPrices, itemSheet) {
    let highCount = 0;
    let lowCount = 0;
    let totalItems = 0;
    
    buyPool.forEach(id => {
        const item = itemSheet.find(i => i.id === String(id));
        if (item && fluctuatedPrices[id]) {
            const status = getPriceStatus(fluctuatedPrices[id].buy, item.value);
            if (status === 'high') highCount++;
            if (status === 'low') lowCount++;
            totalItems++;
        }
    });
    
    if (totalItems === 0) return 'normal';
    
    const highRatio = highCount / totalItems;
    const lowRatio = lowCount / totalItems;
    
    if (highRatio > 0.5) return 'mostly high';
    if (lowRatio > 0.5) return 'mostly low';
    if (highRatio > 0.3 && lowRatio > 0.3) return 'mixed';
    return 'normal';
}

/**
 * Helper function to determine shopkeeper mood based on various factors
 * @param {Object} shopInfo - Shop information
 * @returns {string} - Mood string
 */
function getShopkeeperMood(shopInfo) {
    const hour = new Date().getHours();
    const moods = [];
    
    // Time-based moods
    if (hour < 6) moods.push('tired', 'grumpy');
    else if (hour < 12) moods.push('energetic', 'welcoming');
    else if (hour < 17) moods.push('busy', 'focused');
    else if (hour < 21) moods.push('relaxed', 'chatty');
    else moods.push('tired', 'closing-soon');
    
    // Shop-based moods
    if (shopInfo.name.includes('Inn')) moods.push('friendly', 'hospitable');
    if (shopInfo.name.includes('Abyss')) moods.push('ominous', 'cryptic');
    if (shopInfo.name.includes('Diamond')) moods.push('superior', 'calculating');
    if (shopInfo.name.includes('Copper')) moods.push('practical', 'no-nonsense');
    
    return moods[Math.floor(Math.random() * moods.length)];
}

/**
 * Get AI dialogue generator instance
 * @returns {AIShopDialogueGenerator|null} - AI dialogue generator or null
 */
function getAIShopDialogue() {
    return aiShopDialogue;
}

/**
 * Generate purchase dialogue using AI
 * @param {Object} shop - Shop data
 * @param {Object} item - Item being purchased
 * @param {number} price - Purchase price
 * @param {Object} buyer - Buyer information
 * @param {number} quantity - Number of items purchased
 * @returns {Promise<string>} - Generated dialogue or fallback
 */
async function generatePurchaseDialogue(shop, item, price, buyer, quantity = 1, playerContext = null) {
    if (!aiShopDialogue || !aiShopDialogue.isAvailable()) {
        return shop.successBuy?.[0] || "A pleasure doing business!";
    }
    
    try {
        return await aiShopDialogue.generatePurchaseDialogue(shop, item, price, buyer, quantity, playerContext);
    } catch (error) {
        console.error('[GenerateShop] Purchase dialogue generation failed:', error);
        return shop.successBuy?.[0] || "A pleasure doing business!";
    }
}

/**
 * Generate sell dialogue using AI
 * @param {Object} shop - Shop data
 * @param {Object} item - Item being sold
 * @param {number} price - Sell price
 * @param {number} quantity - Number of items being sold
 * @returns {Promise<string>} - Generated dialogue or fallback
 */
async function generateSellDialogue(shop, item, price, quantity = 1, playerContext = null, seller = null) {
    if (!aiShopDialogue || !aiShopDialogue.isAvailable()) {
        return shop.successSell?.[0] || "I'll take that off your hands.";
    }
    
    try {
        return await aiShopDialogue.generateSellDialogue(shop, item, price, quantity, playerContext, seller);
    } catch (error) {
        console.error('[GenerateShop] Sell dialogue generation failed:', error);
        return shop.successSell?.[0] || "I'll take that off your hands.";
    }
}

/**
 * Generate poor dialogue using AI
 * @param {Object} shop - Shop data
 * @param {Object} item - Item attempted to purchase
 * @param {number} shortBy - How much money they're short
 * @returns {Promise<string>} - Generated dialogue or fallback
 */
async function generatePoorDialogue(shop, item, shortBy) {
    if (!aiShopDialogue || !aiShopDialogue.isAvailable()) {
        return shop.failureTooPoor?.[0] || "You need more coins!";
    }
    
    try {
        return await aiShopDialogue.generatePoorDialogue(shop, item, shortBy);
    } catch (error) {
        console.error('[GenerateShop] Poor dialogue generation failed:', error);
        return shop.failureTooPoor?.[0] || "You need more coins!";
    }
}

/**
 * Generate no item dialogue using AI
 * @param {Object} shop - Shop data
 * @param {Object} item - Item attempted to sell
 * @param {number} quantity - Quantity they tried to sell
 * @param {number} available - How many they actually have
 * @returns {Promise<string>} - Generated dialogue or fallback
 */
async function generateNoItemDialogue(shop, item, quantity, available) {
    if (!aiShopDialogue || !aiShopDialogue.isAvailable()) {
        if (available === 0) {
            return shop.failureOther?.[0] || "You don't seem to have that item.";
        }
        return shop.failureOther?.[0] || `You only have ${available} of those.`;
    }
    
    try {
        return await aiShopDialogue.generateNoItemDialogue(shop, item, quantity, available);
    } catch (error) {
        console.error('[GenerateShop] No item dialogue generation failed:', error);
        if (available === 0) {
            return shop.failureOther?.[0] || "You don't seem to have that item.";
        }
        return shop.failureOther?.[0] || `You only have ${available} of those.`;
    }
}

// Export the main function and all helpers
module.exports = generateShop;
module.exports.calculateFluctuatedPrice = calculateFluctuatedPrice;
module.exports.getShopPrices = getShopPrices;
module.exports.getAIShopDialogue = getAIShopDialogue;
module.exports.generatePurchaseDialogue = generatePurchaseDialogue;
module.exports.generateSellDialogue = generateSellDialogue;
module.exports.generatePoorDialogue = generatePoorDialogue;
module.exports.generateNoItemDialogue = generateNoItemDialogue;
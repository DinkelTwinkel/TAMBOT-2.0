// Updated generateShop.js - Added price fluctuation system with global guild config seeding
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const GachaVC = require('../models/activevcs');
const GuildConfig = require('../models/GuildConfig');
const gachaData = require('../data/gachaServers.json');
const shopData = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');
const registerBotMessage = require('./registerBotMessage');
const generateShopImage = require('./generateShopImage');
const path = require('path');

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
    
    const matchingVC = await GachaVC.findOne({ channelId: channel.id }).lean();
    if (!matchingVC) return channel.send('⚘ Not an active Gacha VC channel!');

    const shopInfo = shopData.find(s => s.id === gachaData.find(g => g.id === matchingVC.typeId)?.shop);
    if (!shopInfo) return channel.send('⚠️ No shop data found for this VC!');
    
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

    const pickShopDescription = shopInfo.idleDialogue[Math.floor(shopInfo.idleDialogue.length * Math.random())];
    
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
    
    const imageBuffer = await generateShopImage(shopInfo, buyPoolWithPrices);
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

    const thumbAttachment = new AttachmentBuilder(`./assets/shops/${path.basename(shopInfo.image)}_shopKeeper.gif`, { name: 'thumb.gif' });

    const embed = new EmbedBuilder()
        .setTitle(`${shopInfo.name}`)
        .setColor('Gold')
        .setDescription('```' + formatDescription(pickShopDescription) + '```')
        .setImage('attachment://shop.png')
        .setFooter({ text: refreshText })
        .setThumbnail('attachment://thumb.gif');

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
        shopMessage = await existingShopMessage.edit({ 
            embeds: [embed], 
            files: [attachment, thumbAttachment],
            attachments: [] // Clear old attachments
        });
        console.log(`✏️ Edited existing shop message in channel ${channel.id}`);
    } else {
        // Create new message if no existing one found in last 3 messages
        shopMessage = await channel.send({ embeds: [embed], files: [attachment, thumbAttachment] });
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
    str = str.toString();
    // Remove surrounding * if present
    if (str.startsWith('*') && str.endsWith('*')) {
        return str.slice(1, -1);
    }
    return `"${str}"`; // wrap in quotes otherwise
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

// Export the price calculation functions for use in shopHandler
module.exports = generateShop;
module.exports.calculateFluctuatedPrice = calculateFluctuatedPrice;
module.exports.getShopPrices = getShopPrices;
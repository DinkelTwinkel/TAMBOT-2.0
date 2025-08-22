// shopHandler.js - Centralized shop interaction handler with guild config price fluctuation and AI dialogue
// FIXED VERSION - Resolves Discord interaction timeout issues
// This version shows modals immediately to prevent "Unknown interaction" errors

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Currency = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const GachaVC = require('../models/activevcs');
const GuildConfig = require('../models/GuildConfig');
const gachaData = require('../data/gachaServers.json');
const shopData = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');
const { calculateFluctuatedPrice, getShopPrices, generatePurchaseDialogue, generateSellDialogue, generatePoorDialogue, generateNoItemDialogue } = require('./generateShop');
const InnPurchaseHandler = require('./gachaModes/innKeeping/innPurchaseHandler');

// Performance optimization: Cache for shop prices (TTL: 5 minutes)
const priceCache = new Map();
const PRICE_CACHE_TTL = 5 * 60 * 1000;

// Cache for shop configurations (TTL: 10 minutes)
const shopConfigCache = new Map();
const SHOP_CONFIG_CACHE_TTL = 10 * 60 * 1000;

// Item lookup optimization - create a Map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

class ShopHandler {
    constructor(client, guildId) {
        this.client = client;
        this.guildId = guildId;
        
        // Create a unique listener name for this guild
        this.listenerName = `shopHandler_${guildId}`;
        
        // Remove any existing listeners for this guild before setting up new ones
        this.removeExistingListeners();
        
        // Setup new listeners
        this.setupListeners();
        
        // Store the handler reference on the client to track it
        if (!this.client.shopHandlers) {
            this.client.shopHandlers = new Map();
        }
        this.client.shopHandlers.set(guildId, this);
        
        // Performance monitoring
        this.performanceStats = {
            totalInteractions: 0,
            failedInteractions: 0,
            avgResponseTime: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    removeExistingListeners() {
        // Get all existing listeners for interactionCreate
        const listeners = this.client.listeners('interactionCreate');
        
        // Remove listeners that match our naming pattern for this guild
        listeners.forEach(listener => {
            if (listener.shopHandlerGuildId === this.guildId) {
                this.client.removeListener('interactionCreate', listener);
            }
        });
    }

    setupListeners() {
        // Create a named function so we can track it
        const interactionHandler = async (interaction) => {
            if (interaction.guild.id !== this.guildId) return;
            if (!interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

            const startTime = Date.now();
            this.performanceStats.totalInteractions++;

            try {
                // Handle shop select menus
                if (interaction.isStringSelectMenu() && 
                    (interaction.customId.startsWith('shop_buy_select_') || interaction.customId.startsWith('shop_sell_select_'))) {
                    await this.handleShopSelectMenu(interaction);
                }

                // Handle modal submissions for buy/sell
                if (interaction.isModalSubmit() && 
                    (interaction.customId.includes('buy_modal_') || interaction.customId.includes('sell_modal_'))) {
                    await this.handleModalSubmit(interaction);
                }
                
                // Update performance metrics
                const responseTime = Date.now() - startTime;
                this.performanceStats.avgResponseTime = 
                    (this.performanceStats.avgResponseTime * (this.performanceStats.totalInteractions - 1) + responseTime) / 
                    this.performanceStats.totalInteractions;
                
                // Log slow interactions
                if (responseTime > 1000) {
                    console.warn(`[SHOP] Slow interaction: ${responseTime}ms for ${interaction.customId}`);
                }
                    
            } catch (error) {
                console.error('[SHOP] Interaction error:', error);
                this.performanceStats.failedInteractions++;
                
                // Try to respond with error if not already responded
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '⚘ An error occurred processing your request.', ephemeral: true });
                    } else if (interaction.deferred) {
                        await interaction.editReply({ content: '⚘ An error occurred processing your request.' });
                    }
                } catch (e) {
                    console.error('[SHOP] Failed to send error message:', e);
                }
            }
        };
        
        // Tag the handler with the guild ID so we can identify it later
        interactionHandler.shopHandlerGuildId = this.guildId;
        
        // Add the listener
        this.client.on('interactionCreate', interactionHandler);
    }

    // Add a cleanup method to remove listeners when needed
    cleanup() {
        this.removeExistingListeners();
        if (this.client.shopHandlers) {
            this.client.shopHandlers.delete(this.guildId);
        }
        // Clear caches
        this.clearCaches();
    }
    
    clearCaches() {
        priceCache.clear();
        shopConfigCache.clear();
        console.log(`[SHOP] Cleared caches for guild ${this.guildId}`);
    }

    // Optimized helper function with caching
    async getShopFluctuatedPrices(channelId, guildId) {
        const cacheKey = `${channelId}_${guildId}`;
        const cached = priceCache.get(cacheKey);
        
        // Check cache first
        if (cached && (Date.now() - cached.timestamp) < PRICE_CACHE_TTL) {
            this.performanceStats.cacheHits++;
            return cached.prices;
        }
        
        this.performanceStats.cacheMisses++;
        
        // Get shop configuration (also cached)
        const shopInfo = await this.getCachedShopConfig(channelId);
        if (!shopInfo) return null;

        const allShopItems = Array.from(new Set([...shopInfo.staticItems, ...shopInfo.itemPool]));
        const prices = await getShopPrices(allShopItems, guildId, shopInfo.priceChangeFactor);
        
        // Cache the prices
        priceCache.set(cacheKey, {
            prices,
            timestamp: Date.now()
        });
        
        // Clean old cache entries if cache is getting large
        if (priceCache.size > 50) {
            const now = Date.now();
            for (const [key, value] of priceCache.entries()) {
                if (now - value.timestamp > PRICE_CACHE_TTL) {
                    priceCache.delete(key);
                }
            }
        }
        
        return prices;
    }
    
    async getCachedShopConfig(channelId) {
        // Check cache first
        const cached = shopConfigCache.get(channelId);
        if (cached && (Date.now() - cached.timestamp) < SHOP_CONFIG_CACHE_TTL) {
            return cached.data;
        }
        
        // OPTIMIZATION: Only fetch the typeId field we need, not the entire document
        const matchingVC = await GachaVC.findOne(
            { channelId },
            { typeId: 1, _id: 0 }  // Only fetch typeId, exclude _id
        ).lean();
        
        if (!matchingVC) return null;
        
        const gachaInfo = gachaData.find(g => g.id === matchingVC.typeId);
        if (!gachaInfo) return null;
        
        const shopInfo = shopData.find(s => s.id === gachaInfo.shop);
        
        // Cache it
        if (shopInfo) {
            shopConfigCache.set(channelId, {
                data: shopInfo,
                timestamp: Date.now()
            });
        }
        
        return shopInfo;
    }

    async handleShopSelectMenu(interaction) {
        const selectedItemId = interaction.values[0];
        const item = itemMap.get(selectedItemId); // O(1) lookup
        const userId = interaction.user.id;
        const channelId = interaction.channel.id;
        
        // Extract shop message ID from custom ID
        const shopMessageId = interaction.customId.split('_').pop();

        if (!item) {
            await interaction.deferUpdate();
            return interaction.followUp({ content: '⚘ Item not found', ephemeral: true });
        }

        // Handle consumables - defer immediately and process
        if (item.type === 'consumable' && interaction.customId.startsWith('shop_buy_select')) {
            // Defer immediately for consumables
            await interaction.deferUpdate();
            
            // Now do the heavy processing for consumables
            await this.processConsumablePurchase(interaction, item, userId, channelId, shopMessageId);
            return;
        }

        // For non-consumables (buy or sell), show modal IMMEDIATELY
        // This prevents the timeout issue
        if (interaction.customId.startsWith('shop_buy_select')) {
            // Create buy modal with minimal information
            const modal = new ModalBuilder()
                .setCustomId(`buy_modal_${item.id}_${userId}_${shopMessageId}_${channelId}`)
                .setTitle(`Buy ${item.name}`)
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('quantity')
                            .setLabel(`Enter quantity to purchase`)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder(`How many ${item.name} would you like to buy?`)
                            .setMaxLength(10)
                    )
                );

            // Show modal immediately - this acts as the response
            await interaction.showModal(modal);
            
        } else if (interaction.customId.startsWith('shop_sell_select')) {
            // Create sell modal with minimal information
            const modal = new ModalBuilder()
                .setCustomId(`sell_modal_${item.id}_${userId}_${shopMessageId}_${channelId}`)
                .setTitle(`Sell ${item.name}`)
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('quantity')
                            .setLabel(`Enter quantity to sell`)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder(`How many ${item.name} would you like to sell?`)
                            .setMaxLength(10)
                    )
                );

            // Show modal immediately - this acts as the response
            await interaction.showModal(modal);
        }
    }

    async processConsumablePurchase(interaction, item, userId, channelId, shopMessageId) {
        const guildId = interaction.guild.id;
        
        // Fetch all necessary data
        const [fluctuatedPrices, userDataResult, shopInfo] = await Promise.all([
            this.getShopFluctuatedPrices(channelId, guildId),
            Promise.all([
                // Only fetch the fields we need
                Currency.findOne(
                    { userId },
                    { money: 1, userId: 1, usertag: 1 }
                ).lean(),
                PlayerInventory.findOne(
                    { playerId: userId },
                    { items: 1, playerId: 1, playerTag: 1 }
                ).lean()
            ]),
            this.getCachedShopConfig(channelId)
        ]);
        
        const [userCurrency, userInv] = userDataResult;

        if (!fluctuatedPrices || !fluctuatedPrices[item.id]) {
            return interaction.followUp({ content: '⚘ Could not get current prices', ephemeral: true });
        }

        const currency = userCurrency || { userId, money: 0 };
        const currentBuyPrice = fluctuatedPrices[item.id].buy;
        const totalCost = currentBuyPrice;
        
        if (currency.money < totalCost) {
            const shortBy = totalCost - currency.money;
            await this.updateShopDescription(interaction.message, shopInfo?.failureTooPoor, shopInfo, 'poor', item, shortBy);
            return interaction.followUp({ 
                content: `⚘ You need ${totalCost} coins but only have ${currency.money}.`, 
                ephemeral: true 
            });
        }

        // Use atomic operation for better performance and consistency
        await Currency.updateOne(
            { userId },
            { 
                $inc: { money: -totalCost },
                $setOnInsert: { usertag: interaction.user.tag }
            },
            { upsert: true }
        );

        // Apply buff and get detailed information
        const applyConsumableBuff = require('./applyConsumeableBuff');
        const buffResult = await applyConsumableBuff(userId, item);

        // Format buff effects for display
        const buffEffects = [];
        for (const [statName, powerLevel] of buffResult.effects) {
            const statDisplay = this.formatStatName(statName);
            buffEffects.push(`${statDisplay} +${powerLevel}`);
        }

        // Calculate remaining time
        const remainingMs = buffResult.expiresAt.getTime() - Date.now();
        const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));

        // Create response message
        let responseMessage = `${interaction.member} ✅ **Used ${item.name}!**\n`;
        
        if (buffResult.refreshed) {
            responseMessage += `🔄 **Buff Refreshed:** ${buffEffects.join(', ')}\n`;
            responseMessage += `⏰ **Duration Extended:** ${remainingMinutes} minutes remaining`;
        } else {
            responseMessage += `⚡ **Buff Applied:** ${buffEffects.join(', ')}\n`;
            responseMessage += `⏰ **Duration:** ${remainingMinutes} minutes`;
        }

        // Add a description of what the stats do
        const statDescriptions = [];
        for (const [statName] of buffResult.effects) {
            const description = this.getStatDescription(statName);
            if (description) statDescriptions.push(description);
        }
        
        if (statDescriptions.length > 0) {
            responseMessage += `\n💡 *${statDescriptions.join(', ')}*`;
        }
        
        // Add remaining balance
        responseMessage += `\n💰 **Balance:** ${currency.money - totalCost} coins`;

        // Process inn sale if applicable
        const innResult = await InnPurchaseHandler.processInnSale({
            channel: interaction.channel,
            itemId: item.id,
            salePrice: currentBuyPrice,
            costBasis: InnPurchaseHandler.calculateCostBasis(item.value),
            buyer: interaction.user
        });
        
        await interaction.followUp({
            content: responseMessage,
            ephemeral: true  // Always private
        });
        
        // Send public announcement for non-inn sales
        if (!innResult.isInn) {
            await interaction.channel.send({
                content: `✨ ${interaction.user} used **${item.name}** for **${currentBuyPrice}c**`
            });
        }
        
        await this.updateShopDescription(interaction.message, shopInfo?.successBuy, shopInfo, 'purchase', item, currentBuyPrice, interaction.user, 1); // quantity = 1 for consumables
    }

    async handleModalSubmit(interaction) {
        // CRITICAL: Defer reply immediately - NO async operations before this!
        // All shop interactions are private
        await interaction.deferReply({ ephemeral: true });
        
        const customIdParts = interaction.customId.split('_');
        const action = customIdParts[0]; // 'buy' or 'sell'
        const itemId = customIdParts[2];
        const userId = customIdParts[3];
        const shopMessageId = customIdParts[4];
        const channelId = customIdParts[5]; // Added channel ID to the modal custom ID

        // Verify the user is the one who initiated the modal
        if (interaction.user.id !== userId) {
            return interaction.editReply({ content: '⚘ This modal is not for you.', ephemeral: true });
        }

        const item = itemMap.get(itemId); // O(1) lookup
        if (!item) {
            return interaction.editReply({ content: '⚘ Item not found', ephemeral: true });
        }

        const quantity = Number(interaction.fields.getTextInputValue('quantity'));
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
            await this.updateShopDescription(interaction.message, null, 'failure');
            return interaction.editReply({ content: '⚘ Invalid quantity. Please enter a positive whole number.' });
        }

        // NOW fetch all the heavy data after modal submission
        const startTime = Date.now();
        const [fluctuatedPrices, userCurrency, userInv, shopInfo] = await Promise.all([
            this.getShopFluctuatedPrices(channelId || interaction.channel.id, interaction.guild.id),
            // Use projection to only fetch needed fields
            Currency.findOne(
                { userId },
                { money: 1, userId: 1, usertag: 1 }
            ).lean(),
            PlayerInventory.findOne(
                { playerId: userId },
                { items: 1, playerId: 1, playerTag: 1 }
            ).lean(),
            this.getCachedShopConfig(channelId || interaction.channel.id)
        ]);
        
        console.log(`[SHOP] Data fetch took ${Date.now() - startTime}ms`);

        if (!fluctuatedPrices || !fluctuatedPrices[itemId]) {
            return interaction.editReply({ content: '⚘ Could not get current prices. Please try again.' });
        }

        // Handle lean documents - they're plain objects, not Mongoose documents
        const currency = userCurrency || { userId, usertag: interaction.user.tag, money: 0 };
        const inventory = userInv || { playerId: userId, playerTag: interaction.user.tag, items: [] };

        if (action === 'buy') {
            await this.handleBuyModal(interaction, item, quantity, currency, inventory, shopInfo, fluctuatedPrices[itemId]);
        } else if (action === 'sell') {
            await this.handleSellModal(interaction, item, quantity, currency, inventory, shopInfo, fluctuatedPrices[itemId]);
        }
    }

    async handleBuyModal(interaction, item, quantity, userCurrency, userInv, shopInfo, fluctuatedPrice) {
        const userId = interaction.user.id;  // Get userId from interaction
        const currentBuyPrice = fluctuatedPrice.buy;
        const totalCost = quantity * currentBuyPrice;
        
        if (userCurrency.money < totalCost) {
            const shortBy = totalCost - userCurrency.money;
            await this.updateShopDescription(interaction.message, shopInfo?.failureTooPoor, shopInfo, 'poor', item, shortBy);
            const priceIndicator = currentBuyPrice > item.value ? ' ▲' : currentBuyPrice < item.value ? ' ▼' : '';
            return interaction.editReply({ 
                content: `⚘ You need **${totalCost}** coins but only have **${userCurrency.money}**.\n` +
                         `Current price: ${currentBuyPrice}c${priceIndicator} per item (Base: ${item.value}c)`
            });
        }

        // Use atomic operations for database updates
        try {
            // Create or update currency atomically
            await Currency.updateOne(
                { userId: userId },  // Use the userId from customIdParts
                { 
                    $inc: { money: -totalCost },
                    $setOnInsert: { usertag: interaction.user.tag }
                },
                { upsert: true }
            );

            // Prepare inventory update
            const existing = userInv.items.find(it => it.itemId === item.id);
            let inventoryUpdate;
            
            if (existing) {
                // Increment existing item quantity
                inventoryUpdate = {
                    $inc: { "items.$[elem].quantity": quantity }
                };
            } else {
                // Add new item
                const newItem = { itemId: item.id, quantity };
                if (item.durability) {
                    newItem.currentDurability = item.durability;
                }
                inventoryUpdate = {
                    $push: { items: newItem }
                };
            }
            
            // Update inventory atomically
            await PlayerInventory.updateOne(
                { playerId: userId },
                {
                    ...inventoryUpdate,
                    $setOnInsert: { playerTag: interaction.user.tag }
                },
                {
                    upsert: true,
                    arrayFilters: existing ? [{ "elem.itemId": item.id }] : undefined
                }
            );

            const priceIndicator = currentBuyPrice > item.value ? ' ▲' : currentBuyPrice < item.value ? ' ▼' : '';
            
            // Create enhanced response message
            let responseMessage = `${interaction.member} ✅ Purchased ${quantity} x **${item.name}** for ${totalCost} coins! (${currentBuyPrice}c${priceIndicator} each)`;
            
            // Add stat information for equipment
            if (item.abilities && item.abilities.length > 0) {
                const statEffects = [];
                for (const ability of item.abilities) {
                    const statDisplay = this.formatStatName(ability.name);
                    statEffects.push(`${statDisplay} +${ability.powerlevel}`);
                }
                responseMessage += `\n⚡ **Stats:** ${statEffects.join(', ')}`;
                
                // Add durability info if available
                if (item.durability) {
                    responseMessage += ` | 🔧 Durability: ${item.durability}`;
                }
            }
            
            // Add remaining balance
            responseMessage += `\n💰 **Balance:** ${userCurrency.money - totalCost} coins`;
            
            // Process inn sale if applicable
            const innResult = await InnPurchaseHandler.processInnSale({
                channel: interaction.channel,
                itemId: item.id,
                salePrice: currentBuyPrice * quantity,  // Total revenue from sale
                costBasis: InnPurchaseHandler.calculateCostBasis(item.value, quantity),
                buyer: interaction.user
            });
            
            // Add tip info if it was an inn sale
            if (innResult.isInn && innResult.tipData && innResult.tipData.amount > 0) {
                responseMessage += `\n${InnPurchaseHandler.formatTipMessage(innResult.tipData)}`;
            }
            
            await interaction.editReply({ 
                content: responseMessage
            });
            
            // Send public announcement for non-inn sales
            if (!innResult.isInn) {
                const publicMessage = quantity === 1 
                    ? `🛒 ${interaction.user} bought **${item.name}** for **${totalCost}c**`
                    : `🛒 ${interaction.user} bought **${quantity}x ${item.name}** for **${totalCost}c**`;
                
                await interaction.channel.send({ content: publicMessage });
            }
            
            await this.updateShopDescription(interaction.message, shopInfo?.successBuy, shopInfo, 'purchase', item, currentBuyPrice * quantity, interaction.user, quantity);
        } catch (error) {
            console.error('[SHOP] Error processing purchase:', error);
            
            // Rollback money if inventory save failed
            await Currency.updateOne(
                { userId: userId },
                { $inc: { money: totalCost } }
            );
            
            await interaction.editReply({ 
                content: '⚘ An error occurred processing your purchase. Your money has been refunded.'
            });
        }
    }

    async handleSellModal(interaction, item, quantity, userCurrency, userInv, shopInfo, fluctuatedPrice) {
        const userId = interaction.user.id;  // Get userId from interaction
        const currentSellPrice = fluctuatedPrice.sell;
        const ownedItem = userInv.items.find(it => it.itemId === item.id);
        const maxQty = ownedItem?.quantity || 0;

        if (quantity > maxQty) {
            await this.updateShopDescription(interaction.message, shopInfo?.failureOther, shopInfo, 'noitem', item, quantity, maxQty);
            const priceIndicator = currentSellPrice > Math.floor(item.value / 2) ? ' ▲' : currentSellPrice < Math.floor(item.value / 2) ? ' ▼' : '';
            return interaction.editReply({ 
                content: `⚘ You only have **${maxQty}** x ${item.name} to sell.\n` +
                         `Current sell price: ${currentSellPrice}c${priceIndicator} per item (Base: ${Math.floor(item.value / 2)}c)`
            });
        }

        try {
            // Update inventory atomically
            const newQuantity = ownedItem.quantity - quantity;
            
            if (newQuantity <= 0) {
                // Remove item completely
                await PlayerInventory.updateOne(
                    { playerId: userId },
                    { $pull: { items: { itemId: item.id } } }
                );
            } else {
                // Decrement quantity
                await PlayerInventory.updateOne(
                    { playerId: userId, "items.itemId": item.id },
                    { $inc: { "items.$.quantity": -quantity } }
                );
            }

            // Add money using atomic operation
            const totalSell = currentSellPrice * quantity;
            await Currency.updateOne(
                { userId: userId },
                { 
                    $inc: { money: totalSell },
                    $setOnInsert: { usertag: interaction.user.tag }
                },
                { upsert: true }
            );

            const originalSellPrice = Math.floor(item.value / 2);
            const priceIndicator = currentSellPrice > originalSellPrice ? ' ▲' : currentSellPrice < originalSellPrice ? ' ▼' : '';

            await interaction.editReply({ 
                content: `${interaction.member}💰 Sold ${quantity} x ${item.name} for ${totalSell} coins! (${currentSellPrice}c${priceIndicator} each) | Balance: ${userCurrency.money + totalSell}c`
            });
            
            // Check if it's an inn channel
            const isInn = await InnPurchaseHandler.isInnChannel(interaction.channel.id);
            
            // Send public announcement for non-inn sales
            if (!isInn) {
                const publicMessage = quantity === 1
                    ? `💰 ${interaction.user} sold **${item.name}** for **${totalSell}c**`
                    : `💰 ${interaction.user} sold **${quantity}x ${item.name}** for **${totalSell}c**`;
                
                await interaction.channel.send({ content: publicMessage });
            }
            
            await this.updateShopDescription(interaction.message, shopInfo?.successSell, shopInfo, 'sell', item, currentSellPrice * quantity, null, quantity);
        } catch (error) {
            console.error('[SHOP] Error processing sale:', error);
            await interaction.editReply({ 
                content: '⚘ An error occurred processing your sale.'
            });
        }
    }

    async updateShopDescription(shopMessage, descriptions, shopInfo = null, dialogueType = null, item = null, price = null, buyer = null, quantity = 1) {
        try {
            let newDescription;
            
            // Try to generate AI dialogue if shopInfo is provided
            if (shopInfo && dialogueType) {
                try {
                    if (dialogueType === 'purchase' && item && price) {
                        newDescription = await generatePurchaseDialogue(shopInfo, item, price, buyer, quantity);
                        console.log(`[SHOP] Generated AI purchase dialogue for ${shopInfo.shopkeeper?.name}`);
                    } else if (dialogueType === 'sell' && item && price) {
                        newDescription = await generateSellDialogue(shopInfo, item, price, quantity);
                        console.log(`[SHOP] Generated AI sell dialogue for ${shopInfo.shopkeeper?.name}`);
                    } else if (dialogueType === 'poor' && item) {
                        const shortBy = price || 0;
                        newDescription = await generatePoorDialogue(shopInfo, item, shortBy);
                        console.log(`[SHOP] Generated AI poor dialogue for ${shopInfo.shopkeeper?.name}`);
                    } else if (dialogueType === 'noitem' && item) {
                        // price = quantity attempted, buyer = quantity available for noitem
                        const quantity = price || 1;
                        const available = buyer || 0;
                        newDescription = await generateNoItemDialogue(shopInfo, item, quantity, available);
                        console.log(`[SHOP] Generated AI no item dialogue for ${shopInfo.shopkeeper?.name}`);
                    }
                } catch (aiError) {
                    console.log('[SHOP] AI dialogue generation failed, using fallback');
                }
            }
            
            // Fallback to provided descriptions if AI failed or not available
            if (!newDescription && descriptions && Array.isArray(descriptions) && descriptions.length > 0) {
                newDescription = descriptions[Math.floor(Math.random() * descriptions.length)];
            }
            
            if (!newDescription) {
                return; // No dialogue to update
            }
            
            if (!shopMessage?.embeds?.length) {
                console.warn("[SHOP] No embeds found in shopMessage");
                return;
            }

            // Get the first embed and clone it
            const existingEmbed = EmbedBuilder.from(shopMessage.embeds[0]);
            
            // Update the description with formatting
            existingEmbed.setDescription('```' + this.formatDescription(newDescription) + '```')
            .setImage('attachment://shop.png')
            .setThumbnail('attachment://thumb.gif');

            // Edit the message
            await shopMessage.edit({ embeds: [existingEmbed] });
        } catch (error) {
            console.error('[SHOP] Error updating shop description:', error);
        }
    }

    formatDescription(str) {
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
    }

    // Helper method to format stat names for display
    formatStatName(statName) {
        const statDisplayNames = {
            'mining': '⛏️ Mining',
            'sight': '🔍 Sight', 
            'luck': '🍀 Luck',
            'speed': '⚡ Speed'
        };
        return statDisplayNames[statName] || statName;
    }

    // Helper method to explain what each stat does
    getStatDescription(statName) {
        const statDescriptions = {
            'mining': 'Increases mining power and ore yield',
            'sight': 'Expands vision range to spot ore veins',
            'luck': 'Boosts chance for bonus items when mining',
            'speed': 'Enables multiple actions per mining cycle'
        };
        return statDescriptions[statName];
    }
    
    // Performance monitoring methods
    getPerformanceStats() {
        const cacheHitRate = this.performanceStats.cacheHits + this.performanceStats.cacheMisses > 0
            ? (this.performanceStats.cacheHits / (this.performanceStats.cacheHits + this.performanceStats.cacheMisses) * 100).toFixed(2)
            : 0;
            
        return {
            ...this.performanceStats,
            cacheHitRate: `${cacheHitRate}%`,
            avgResponseTimeMs: this.performanceStats.avgResponseTime.toFixed(2),
            failureRate: this.performanceStats.totalInteractions > 0 
                ? `${(this.performanceStats.failedInteractions / this.performanceStats.totalInteractions * 100).toFixed(2)}%`
                : '0%'
        };
    }
    
    // Log performance stats periodically
    startPerformanceMonitoring(intervalMs = 300000) { // Default 5 minutes
        setInterval(() => {
            const stats = this.getPerformanceStats();
            console.log(`[SHOP] Performance Stats for Guild ${this.guildId}:`, stats);
            
            // Alert if failure rate is high
            if (this.performanceStats.failedInteractions > 0 && 
                (this.performanceStats.failedInteractions / this.performanceStats.totalInteractions) > 0.1) {
                console.warn(`[SHOP] High failure rate detected for guild ${this.guildId}!`);
            }
        }, intervalMs);
    }
}

module.exports = ShopHandler;
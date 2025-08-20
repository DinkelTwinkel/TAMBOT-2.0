// shopHandler.js - Centralized shop interaction handler with guild config price fluctuation
// BACKUP YOUR ORIGINAL FILE BEFORE REPLACING
// This version includes all performance optimizations

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Currency = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const GachaVC = require('../models/activevcs');
const GuildConfig = require('../models/GuildConfig');
const gachaData = require('../data/gachaServers.json');
const shopData = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');
const { calculateFluctuatedPrice, getShopPrices } = require('./generateShop');

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
        
        // Fetch with lean() for better performance
        const matchingVC = await GachaVC.findOne({ channelId }).lean();
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
        // CRITICAL FIX: Defer immediately to prevent timeout
        // Handle consumables differently since they don't need a modal
        const selectedItemId = interaction.values[0];
        const item = itemMap.get(selectedItemId); // O(1) lookup
        
        if (item && item.type === 'consumable' && interaction.customId.startsWith('shop_buy_select')) {
            // Defer for consumables since we're processing immediately
            await interaction.deferUpdate();
        } else {
            // For non-consumables, we'll show a modal which acts as the response
            // So we don't defer here to avoid double-responding
        }
        
        const userId = interaction.user.id;
        const channelId = interaction.channel.id;
        const guildId = interaction.guild.id;
        
        // Extract shop message ID from custom ID
        const shopMessageId = interaction.customId.split('_').pop();

        if (!item) {
            if (!interaction.deferred) await interaction.deferUpdate();
            return interaction.followUp({ content: '⚘ Item not found', ephemeral: true });
        }

        // OPTIMIZATION: Parallel data fetching
        const [fluctuatedPrices, userDataResult, shopInfo] = await Promise.all([
            this.getShopFluctuatedPrices(channelId, guildId),
            // Fetch both user currency and inventory in parallel
            Promise.all([
                Currency.findOne({ userId }).lean(),
                PlayerInventory.findOne({ playerId: userId }).lean()
            ]),
            this.getCachedShopConfig(channelId)
        ]);
        
        const [userCurrency, userInv] = userDataResult;

        if (!fluctuatedPrices || !fluctuatedPrices[selectedItemId]) {
            if (!interaction.deferred) await interaction.deferUpdate();
            return interaction.followUp({ content: '⚘ Could not get current prices', ephemeral: true });
        }

        // Create default objects if not found
        const currency = userCurrency || { userId, money: 0 };
        const inventory = userInv || { playerId: userId, items: [] };

        if (interaction.customId.startsWith('shop_buy_select')) {
            await this.handleBuyInteraction(interaction, item, currency, inventory, shopInfo, shopMessageId, fluctuatedPrices[selectedItemId]);
        } else if (interaction.customId.startsWith('shop_sell_select')) {
            await this.handleSellInteraction(interaction, item, currency, inventory, shopInfo, shopMessageId, fluctuatedPrices[selectedItemId]);
        }
    }

    async handleBuyInteraction(interaction, item, userCurrency, userInv, shopInfo, shopMessageId, fluctuatedPrice) {
        const userId = interaction.user.id;
        const currentBuyPrice = fluctuatedPrice.buy;

        // Handle consumables - buy 1 immediately
        if (item.type === 'consumable') {
            const totalCost = currentBuyPrice;
            
            if (userCurrency.money < totalCost) {
                await this.updateShopDescription(interaction.message, shopInfo?.failureTooPoor);
                return interaction.followUp({ 
                    content: `⚘ You need ${totalCost} coins but only have ${userCurrency.money}.`, 
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
            responseMessage += `\n💰 **Balance:** ${userCurrency.money - totalCost} coins`;

            await interaction.followUp({
                content: responseMessage,
                ephemeral: false
            });
            
            await this.updateShopDescription(interaction.message, shopInfo?.successBuy);
            return;
        }

        // Handle non-consumables - show modal for quantity
        const priceIndicator = currentBuyPrice > item.value ? ' ▲' : currentBuyPrice < item.value ? ' ▼' : '';
        
        // Create a shorter label that fits within Discord's 45 character limit
        const shortLabel = `Qty? ${currentBuyPrice}c${priceIndicator} | Bal: ${userCurrency.money}c`;
        
        // If still too long, truncate further
        const finalLabel = shortLabel.length > 45 ? 
            `Qty? ${currentBuyPrice}c${priceIndicator}` : 
            shortLabel;
        
        const modal = new ModalBuilder()
            .setCustomId(`buy_modal_${item.id}_${userId}_${shopMessageId}`)
            .setTitle(`Buy ${item.name}`)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('quantity')
                        .setLabel(finalLabel)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder(`Enter quantity. Cost: ${currentBuyPrice}c${priceIndicator} each`)
                )
            );

        // ShowModal acts as the response (no need to defer since modal is the response)
        await interaction.showModal(modal);
    }

    async handleSellInteraction(interaction, item, userCurrency, userInv, shopInfo, shopMessageId, fluctuatedPrice) {
        const userId = interaction.user.id;
        const currentSellPrice = fluctuatedPrice.sell;
        const ownedItem = userInv.items.find(it => it.itemId === item.id);
        const maxQty = ownedItem?.quantity || 0;

        if (maxQty === 0) {
            await interaction.deferUpdate();
            return interaction.followUp({ 
                content: `⚘ You don't own any ${item.name} to sell.`, 
                ephemeral: true 
            });
        }

        const priceIndicator = currentSellPrice > Math.floor(item.value / 2) ? ' ▲' : currentSellPrice < Math.floor(item.value / 2) ? ' ▼' : '';

        // Create a shorter label that fits within Discord's 45 character limit
        const shortLabel = `Sell? ${currentSellPrice}c${priceIndicator} | Have ${maxQty}`;
        
        // If still too long, truncate further
        const finalLabel = shortLabel.length > 45 ? 
            `Sell? ${currentSellPrice}c${priceIndicator}` : 
            shortLabel;

        const modal = new ModalBuilder()
            .setCustomId(`sell_modal_${item.id}_${userId}_${shopMessageId}`)
            .setTitle(`Sell ${item.name}`)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('quantity')
                        .setLabel(finalLabel)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder(`Max: ${maxQty}. Price: ${currentSellPrice}c${priceIndicator} each`)
                )
            );

        // ShowModal acts as the response
        await interaction.showModal(modal);
    }

    async handleModalSubmit(interaction) {
        // CRITICAL FIX: Defer reply immediately for modal submissions
        await interaction.deferReply({ ephemeral: false });
        
        const customIdParts = interaction.customId.split('_');
        const action = customIdParts[0]; // 'buy' or 'sell'
        const itemId = customIdParts[2];
        const userId = customIdParts[3];
        const shopMessageId = customIdParts[4];

        // Verify the user is the one who initiated the modal
        if (interaction.user.id !== userId) {
            return interaction.editReply({ content: '⚘ This modal is not for you.', ephemeral: true });
        }

        const item = itemMap.get(itemId); // O(1) lookup
        if (!item) {
            return interaction.editReply({ content: '⚘ Item not found', ephemeral: true });
        }

        const quantity = Number(interaction.fields.getTextInputValue('quantity'));
        if (isNaN(quantity) || quantity <= 0) {
            await this.updateShopDescription(interaction.message, null, 'failure');
            return interaction.editReply({ content: '⚘ Invalid quantity.' });
        }

        // OPTIMIZATION: Parallel fetch all needed data
        const [fluctuatedPrices, userCurrency, userInv, shopInfo] = await Promise.all([
            this.getShopFluctuatedPrices(interaction.channel.id, interaction.guild.id),
            Currency.findOne({ userId }),
            PlayerInventory.findOne({ playerId: userId }),
            this.getCachedShopConfig(interaction.channel.id)
        ]);

        if (!fluctuatedPrices || !fluctuatedPrices[itemId]) {
            return interaction.editReply({ content: '⚘ Could not get current prices' });
        }

        // Ensure documents exist (create if needed)
        const currency = userCurrency || new Currency({ userId, usertag: interaction.user.tag, money: 0 });
        const inventory = userInv || new PlayerInventory({ playerId: userId, playerTag: interaction.user.tag, items: [] });

        if (action === 'buy') {
            await this.handleBuyModal(interaction, item, quantity, currency, inventory, shopInfo, fluctuatedPrices[itemId]);
        } else if (action === 'sell') {
            await this.handleSellModal(interaction, item, quantity, currency, inventory, shopInfo, fluctuatedPrices[itemId]);
        }
    }

    async handleBuyModal(interaction, item, quantity, userCurrency, userInv, shopInfo, fluctuatedPrice) {
        const currentBuyPrice = fluctuatedPrice.buy;
        const totalCost = quantity * currentBuyPrice;
        
        if (userCurrency.money < totalCost) {
            await this.updateShopDescription(interaction.message, shopInfo?.failureTooPoor);
            return interaction.editReply({ 
                content: `⚘ You need ${totalCost} coins but only have ${userCurrency.money}.`
            });
        }

        // Use a transaction or atomic operation to prevent duplicate processing
        try {
            // If userCurrency is a new document, save it first
            if (userCurrency.isNew) {
                await userCurrency.save();
            }
            
            // Use atomic operation for money update
            await Currency.updateOne(
                { userId: userCurrency.userId },
                { $inc: { money: -totalCost } }
            );

            // Add items to inventory
            const existing = userInv.items.find(it => it.itemId === item.id);
            if (existing) {
                existing.quantity += quantity;
            } else {
                const newItem = { itemId: item.id, quantity };
                
                // Add currentDurability if the item has durability
                if (item.durability) {
                    newItem.currentDurability = item.durability;
                }
                
                userInv.items.push(newItem);
            }
            
            // Save inventory
            if (userInv.isNew) {
                await userInv.save();
            } else {
                userInv.markModified('items');
                await userInv.save();
            }

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
            
            await interaction.editReply({ 
                content: responseMessage
            });
            
            await this.updateShopDescription(interaction.message, shopInfo?.successBuy);
        } catch (error) {
            console.error('[SHOP] Error processing purchase:', error);
            
            // Rollback money if inventory save failed
            await Currency.updateOne(
                { userId: userCurrency.userId },
                { $inc: { money: totalCost } }
            );
            
            await interaction.editReply({ 
                content: '⚘ An error occurred processing your purchase. Your money has been refunded.'
            });
        }
    }

    async handleSellModal(interaction, item, quantity, userCurrency, userInv, shopInfo, fluctuatedPrice) {
        const currentSellPrice = fluctuatedPrice.sell;
        const ownedItem = userInv.items.find(it => it.itemId === item.id);
        const maxQty = ownedItem?.quantity || 0;

        if (quantity > maxQty) {
            await this.updateShopDescription(interaction.message, shopInfo?.failureOther);
            return interaction.editReply({ 
                content: `⚘ Invalid quantity. You can sell between 1 and ${maxQty}.`
            });
        }

        try {
            // Remove items from inventory
            if (ownedItem) {
                ownedItem.quantity -= quantity;
                if (ownedItem.quantity <= 0) {
                    userInv.items = userInv.items.filter(it => it.itemId !== item.id);
                }
                userInv.markModified('items');
                await userInv.save();
            }

            // Add money using atomic operation
            const totalSell = currentSellPrice * quantity;
            await Currency.updateOne(
                { userId: userCurrency.userId },
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
            
            await this.updateShopDescription(interaction.message, shopInfo?.successSell);
        } catch (error) {
            console.error('[SHOP] Error processing sale:', error);
            await interaction.editReply({ 
                content: '⚘ An error occurred processing your sale.'
            });
        }
    }

    async updateShopDescription(shopMessage, descriptions) {
        if (!descriptions || !Array.isArray(descriptions) || descriptions.length === 0) {
            return; // Skip update if no descriptions provided
        }

        try {
            const newDescription = descriptions[Math.floor(Math.random() * descriptions.length)];
            
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
        str = str.toString();
        // Remove surrounding * if present
        if (str.startsWith('*') && str.endsWith('*')) {
            return str.slice(1, -1);
        }
        return `"${str}"`; // wrap in quotes otherwise
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
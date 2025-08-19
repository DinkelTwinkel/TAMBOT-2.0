// shopHandler.js - Centralized shop interaction handler with guild config price fluctuation
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Currency = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const GachaVC = require('../models/activevcs');
const GuildConfig = require('../models/GuildConfig');
const gachaData = require('../data/gachaServers.json');
const shopData = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');
const { calculateFluctuatedPrice, getShopPrices } = require('./generateShop');

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
    }

    // Helper function to get current shop prices using guild config
    async getShopFluctuatedPrices(channelId, guildId) {
        const matchingVC = await GachaVC.findOne({ channelId }).lean();
        if (!matchingVC) return null;

        const shopInfo = shopData.find(s => s.id === gachaData.find(g => g.id === matchingVC.typeId)?.shop);
        if (!shopInfo) return null;

        const allShopItems = Array.from(new Set([...shopInfo.staticItems, ...shopInfo.itemPool]));
        return getShopPrices(allShopItems, guildId, shopInfo.priceChangeFactor);
    }

    async handleShopSelectMenu(interaction) {
        const userId = interaction.user.id;
        const channelId = interaction.channel.id;
        const guildId = interaction.guild.id;
        const selectedItemId = interaction.values[0];
        
        // Extract shop message ID from custom ID
        const shopMessageId = interaction.customId.split('_').pop();

        const item = itemSheet.find(it => it.id === selectedItemId);
        if (!item) {
            return interaction.reply({ content: '⚘ Item not found', ephemeral: true });
        }

        // Get fluctuated prices using guild config
        const fluctuatedPrices = await this.getShopFluctuatedPrices(channelId, guildId);
        if (!fluctuatedPrices || !fluctuatedPrices[selectedItemId]) {
            return interaction.reply({ content: '⚘ Could not get current prices', ephemeral: true });
        }

        // Get user currency and inventory
        let userCurrency = await Currency.findOne({ userId }) || new Currency({ userId, money: 0 });
        let userInv = await PlayerInventory.findOne({ playerId: userId }) || new PlayerInventory({ playerId: userId, items: [] });

        // Get shop info for description updates
        const matchingVC = await GachaVC.findOne({ channelId }).lean();
        const shopInfo = shopData.find(s => s.id === gachaData.find(g => g.id === matchingVC?.typeId)?.shop);

        if (interaction.customId.startsWith('shop_buy_select')) {
            await this.handleBuyInteraction(interaction, item, userCurrency, userInv, shopInfo, shopMessageId, fluctuatedPrices[selectedItemId]);
        } else if (interaction.customId.startsWith('shop_sell_select')) {
            await this.handleSellInteraction(interaction, item, userCurrency, userInv, shopInfo, shopMessageId, fluctuatedPrices[selectedItemId]);
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
                return interaction.reply({ 
                    content: `⚘ You need ${totalCost} coins but only have ${userCurrency.money}.`, 
                    ephemeral: true 
                });
            }

            // Deduct cost
            userCurrency.money -= totalCost;
            await userCurrency.save();

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
            responseMessage += `\n💰 **Balance:** ${userCurrency.money} coins`;

            await interaction.reply({
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

        await interaction.showModal(modal);
    }

    async handleSellInteraction(interaction, item, userCurrency, userInv, shopInfo, shopMessageId, fluctuatedPrice) {
        const userId = interaction.user.id;
        const currentSellPrice = fluctuatedPrice.sell;
        const ownedItem = userInv.items.find(it => it.itemId === item.id);
        const maxQty = ownedItem?.quantity || 0;

        if (maxQty === 0) {
            return interaction.reply({ 
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

        await interaction.showModal(modal);
    }

    async handleModalSubmit(interaction) {
        const customIdParts = interaction.customId.split('_');
        const action = customIdParts[0]; // 'buy' or 'sell'
        const itemId = customIdParts[2];
        const userId = customIdParts[3];
        const shopMessageId = customIdParts[4];

        // Verify the user is the one who initiated the modal
        if (interaction.user.id !== userId) {
            return interaction.reply({ content: '⚘ This modal is not for you.', ephemeral: true });
        }

        const item = itemSheet.find(it => it.id === itemId);
        if (!item) {
            return interaction.reply({ content: '⚘ Item not found', ephemeral: true });
        }

        const quantity = Number(interaction.fields.getTextInputValue('quantity'));
        if (isNaN(quantity) || quantity <= 0) {
            await this.updateShopDescription(interaction.message, null, 'failure');
            return interaction.reply({ content: '⚘ Invalid quantity.', ephemeral: true });
        }

        // Get fluctuated prices using guild config
        const fluctuatedPrices = await this.getShopFluctuatedPrices(interaction.channel.id, interaction.guild.id);
        if (!fluctuatedPrices || !fluctuatedPrices[itemId]) {
            return interaction.reply({ content: '⚘ Could not get current prices', ephemeral: true });
        }

        // console.log (interaction);
        // Get user data
        let userCurrency = await Currency.findOne({ userId }) || new Currency({ userId, money: 0 });
        let userInv = await PlayerInventory.findOne({ playerId: userId }) || new PlayerInventory({ playerId: userId, playerTag: interaction.member.user.tag, items: [] });

        // Get shop info for description updates
        const channelId = interaction.channel.id;
        const matchingVC = await GachaVC.findOne({ channelId }).lean();
        const shopInfo = shopData.find(s => s.id === gachaData.find(g => g.id === matchingVC?.typeId)?.shop);

        if (action === 'buy') {
            await this.handleBuyModal(interaction, item, quantity, userCurrency, userInv, shopInfo, fluctuatedPrices[itemId]);
        } else if (action === 'sell') {
            await this.handleSellModal(interaction, item, quantity, userCurrency, userInv, shopInfo, fluctuatedPrices[itemId]);
        }
    }

    async handleBuyModal(interaction, item, quantity, userCurrency, userInv, shopInfo, fluctuatedPrice) {
        const currentBuyPrice = fluctuatedPrice.buy;
        const totalCost = quantity * currentBuyPrice;
        
        if (userCurrency.money < totalCost) {
            await this.updateShopDescription(interaction.message, shopInfo?.failureTooPoor);
            return interaction.reply({ 
                content: `⚘ You need ${totalCost} coins but only have ${userCurrency.money}.`, 
                ephemeral: true 
            });
        }

        // Use a transaction or atomic operation to prevent duplicate processing
        try {
            // Deduct money
            userCurrency.money -= totalCost;
            await userCurrency.save();

            // Add items to inventory with duplicate prevention
            const existing = userInv.items.find(it => it.itemId === item.id);
            if (existing) {
                existing.quantity += quantity;
            } else {
                userInv.items.push({ itemId: item.id, quantity });
            }
            
            // Mark as modified to ensure save
            userInv.markModified('items');
            await userInv.save();

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
            responseMessage += `\n💰 **Balance:** ${userCurrency.money} coins`;
            
            await interaction.reply({ 
                content: responseMessage, 
                ephemeral: false 
            });
            
            await this.updateShopDescription(interaction.message, shopInfo?.successBuy);
        } catch (error) {
            console.error('Error processing purchase:', error);
            // Rollback money if inventory save failed
            userCurrency.money += totalCost;
            await userCurrency.save();
            
            await interaction.reply({ 
                content: '⚘ An error occurred processing your purchase. Your money has been refunded.', 
                ephemeral: true 
            });
        }
    }

    async handleSellModal(interaction, item, quantity, userCurrency, userInv, shopInfo, fluctuatedPrice) {
        const currentSellPrice = fluctuatedPrice.sell;
        const ownedItem = userInv.items.find(it => it.itemId === item.id);
        const maxQty = ownedItem?.quantity || 0;

        if (quantity > maxQty) {
            await this.updateShopDescription(interaction.message, shopInfo?.failureOther);
            return interaction.reply({ 
                content: `⚘ Invalid quantity. You can sell between 1 and ${maxQty}.`, 
                ephemeral: true 
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

            // Add money using fluctuated sell price
            const totalSell = currentSellPrice * quantity;
            userCurrency.money += totalSell;
            await userCurrency.save();

            const originalSellPrice = Math.floor(item.value / 2);
            const priceIndicator = currentSellPrice > originalSellPrice ? ' ▲' : currentSellPrice < originalSellPrice ? ' ▼' : '';

            await interaction.reply({ 
                content: `${interaction.member}💰 Sold ${quantity} x ${item.name} for ${totalSell} coins! (${currentSellPrice}c${priceIndicator} each) | Balance: ${userCurrency.money}c`, 
                ephemeral: false 
            });
            
            await this.updateShopDescription(interaction.message, shopInfo?.successSell);
        } catch (error) {
            console.error('Error processing sale:', error);
            await interaction.reply({ 
                content: '⚘ An error occurred processing your sale.', 
                ephemeral: true 
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
                console.warn("No embeds found in shopMessage");
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
            console.error('Error updating shop description:', error);
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
}

module.exports = ShopHandler;
// shopHandler.js - Centralized shop interaction handler
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Currency = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const GachaVC = require('../models/activevcs');
const gachaData = require('../data/gachaServers.json');
const shopData = require('../data/shops.json');
const itemSheet = require('../data/itemSheet.json');
const path = require('path');

class ShopHandler {
    constructor(client, allowedGuildId) {
        this.client = client;
        this.allowedGuildId = allowedGuildId; // the guild we want to listen for
        this.setupListeners();
    }


    setupListeners() {
        this.client.on('interactionCreate', async (interaction) => {
            // Only handle interactions from the allowed guild
            if (!interaction.guild || interaction.guild.id !== this.allowedGuildId) return;

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
        });
    }


    async handleShopSelectMenu(interaction) {
        const userId = interaction.user.id;
        const channelId = interaction.channel.id;
        const selectedItemId = interaction.values[0];
        
        // Extract shop message ID from custom ID
        const shopMessageId = interaction.customId.split('_').pop();

        const item = itemSheet.find(it => it.id === selectedItemId);
        if (!item) {
            return interaction.reply({ content: '❌ Item not found', ephemeral: true });
        }

        // Get user currency and inventory
        let userCurrency = await Currency.findOne({ userId }) || new Currency({ userId, money: 0 });
        let userInv = await PlayerInventory.findOne({ playerId: userId }) || new PlayerInventory({ playerId: userId, items: [] });

        // Get shop info for description updates
        const matchingVC = await GachaVC.findOne({ channelId }).lean();
        const shopInfo = shopData.find(s => s.id === gachaData.find(g => g.id === matchingVC?.typeId)?.shop);

        if (interaction.customId.startsWith('shop_buy_select')) {
            await this.handleBuyInteraction(interaction, item, userCurrency, userInv, shopInfo, shopMessageId);
        } else if (interaction.customId.startsWith('shop_sell_select')) {
            await this.handleSellInteraction(interaction, item, userCurrency, userInv, shopInfo, shopMessageId);
        }
    }

    async handleBuyInteraction(interaction, item, userCurrency, userInv, shopInfo, shopMessageId) {
        const userId = interaction.user.id;

        // Handle consumables - buy 1 immediately
        if (item.type === 'consumable') {
            const totalCost = item.value;
            
            if (userCurrency.money < totalCost) {
                await this.updateShopDescription(interaction.message, shopInfo?.failureTooPoor);
                return interaction.reply({ 
                    content: `❌ You need ${totalCost} coins but only have ${userCurrency.money}.`, 
                    ephemeral: true 
                });
            }

            // Deduct cost
            userCurrency.money -= totalCost;
            await userCurrency.save();

            // Apply buff
            const applyConsumableBuff = require('./applyConsumeableBuff');
            await applyConsumableBuff(userId, item);

            await interaction.reply({
                content: `${interaction.member} ✅ Used ${item.name}! Buff applied for ${item.duration} minutes.`,
                ephemeral: false
            });
            
            await this.updateShopDescription(interaction.message, shopInfo?.successBuy);
            return;
        }

        // Handle non-consumables - show modal for quantity
        const modal = new ModalBuilder()
            .setCustomId(`buy_modal_${item.id}_${userId}_${shopMessageId}`)
            .setTitle(`Buy ${item.name}`)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('quantity')
                        .setLabel(`How many? Cost: ${item.value} each | Your balance: ${userCurrency.money}`)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('Enter quantity')
                )
            );

        await interaction.showModal(modal);
    }

    async handleSellInteraction(interaction, item, userCurrency, userInv, shopInfo, shopMessageId) {
        const userId = interaction.user.id;
        const ownedItem = userInv.items.find(it => it.itemId === item.id);
        const maxQty = ownedItem?.quantity || 0;

        if (maxQty === 0) {
            return interaction.reply({ 
                content: `❌ You don't own any ${item.name} to sell.`, 
                ephemeral: true 
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`sell_modal_${item.id}_${userId}_${shopMessageId}`)
            .setTitle(`Sell ${item.name}`)
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('quantity')
                        .setLabel(`How many to sell? You have ${maxQty}`)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder(`Max: ${maxQty}`)
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
            return interaction.reply({ content: '❌ This modal is not for you.', ephemeral: true });
        }

        const item = itemSheet.find(it => it.id === itemId);
        if (!item) {
            return interaction.reply({ content: '❌ Item not found', ephemeral: true });
        }

        const quantity = Number(interaction.fields.getTextInputValue('quantity'));
        if (isNaN(quantity) || quantity <= 0) {
            await this.updateShopDescription(interaction.message, null, 'failure');
            return interaction.reply({ content: '❌ Invalid quantity.', ephemeral: true });
        }

        // Get user data
        let userCurrency = await Currency.findOne({ userId }) || new Currency({ userId, money: 0 });
        let userInv = await PlayerInventory.findOne({ playerId: userId }) || new PlayerInventory({ playerId: userId, items: [] });

        // Get shop info for description updates
        const channelId = interaction.channel.id;
        const matchingVC = await GachaVC.findOne({ channelId }).lean();
        const shopInfo = shopData.find(s => s.id === gachaData.find(g => g.id === matchingVC?.typeId)?.shop);

        if (action === 'buy') {
            await this.handleBuyModal(interaction, item, quantity, userCurrency, userInv, shopInfo);
        } else if (action === 'sell') {
            await this.handleSellModal(interaction, item, quantity, userCurrency, userInv, shopInfo);
        }
    }

    async handleBuyModal(interaction, item, quantity, userCurrency, userInv, shopInfo) {
        const totalCost = quantity * item.value;
        
        if (userCurrency.money < totalCost) {
            await this.updateShopDescription(interaction.message, shopInfo?.failureTooPoor);
            return interaction.reply({ 
                content: `❌ You need ${totalCost} coins but only have ${userCurrency.money}.`, 
                ephemeral: true 
            });
        }

        // Deduct money
        userCurrency.money -= totalCost;
        await userCurrency.save();

        // Add items to inventory
        const existing = userInv.items.find(it => it.itemId === item.id);
        if (existing) {
            existing.quantity += quantity;
        } else {
            userInv.items.push({ itemId: item.id, quantity });
        }
        await userInv.save();

        await interaction.reply({ 
            content: `${interaction.member} ✅ Purchased ${quantity} x ${item.name} for ${totalCost} coins!`, 
            ephemeral: false 
        });
        
        await this.updateShopDescription(interaction.message, shopInfo?.successBuy);
    }

    async handleSellModal(interaction, item, quantity, userCurrency, userInv, shopInfo) {
        const ownedItem = userInv.items.find(it => it.itemId === item.id);
        const maxQty = ownedItem?.quantity || 0;

        if (quantity > maxQty) {
            await this.updateShopDescription(interaction.message, shopInfo?.failureOther);
            return interaction.reply({ 
                content: `❌ Invalid quantity. You can sell between 1 and ${maxQty}.`, 
                ephemeral: true 
            });
        }

        // Remove items from inventory
        if (ownedItem) {
            ownedItem.quantity -= quantity;
            if (ownedItem.quantity <= 0) {
                userInv.items = userInv.items.filter(it => it.itemId !== item.id);
            }
            await userInv.save();
        }

        // Add money
        const totalSell = Math.floor(item.value / 2) * quantity;
        userCurrency.money += totalSell;
        await userCurrency.save();

        await interaction.reply({ 
            content: `${interaction.member} 💰 Sold ${quantity} x ${item.name} for ${totalSell} coins! Your new balance: ${userCurrency.money}`, 
            ephemeral: false 
        });
        
        await this.updateShopDescription(interaction.message, shopInfo?.successSell);
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

            // Keep existing attachments
            const attachments = shopMessage.attachments;
            const files = [];
            
            // Re-create attachment files from existing message
            if (attachments.size > 0) {
                for (const [, attachment] of attachments) {
                    if (attachment.name === 'shop.png') {
                        existingEmbed.setImage('attachment://shop.png');
                        // Note: We can't re-upload the same file, so we'll leave the image as is
                    }
                    if (attachment.name === 'thumb.gif') {
                        existingEmbed.setThumbnail('attachment://thumb.gif');
                    }
                }
            }

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
}

module.exports = ShopHandler;
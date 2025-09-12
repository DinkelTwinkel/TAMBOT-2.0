// sellMarketListener.js - Handles player-to-player marketplace interactions
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
const Currency = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const ActiveShop = require('../models/activeShop');
const itemSheet = require('../data/itemSheet.json');
const { generateMarketplaceImage } = require('./generateMarketplaceImage');
const path = require('path');
const fs = require('fs');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

// Purchase locks to prevent concurrent purchases of the same shop
const purchaseLocks = new Map(); // messageId -> { locked: boolean, timestamp: number }

class SellMarketListener {
    constructor(client, guildId) {
        this.client = client;
        this.guildId = guildId;
        
        // Create a unique listener name for this guild
        this.listenerName = `sellMarketListener_${guildId}`;
        
        // Remove any existing listeners for this guild before setting up new ones
        this.removeExistingListeners();
        
        // Setup new listeners
        this.setupListeners();
        
        // Store the handler reference on the client to track it
        if (!this.client.sellMarketListeners) {
            this.client.sellMarketListeners = new Map();
        }
        this.client.sellMarketListeners.set(guildId, this);
    }

    removeExistingListeners() {
        // Get all existing listeners for interactionCreate
        const listeners = this.client.listeners('interactionCreate');
        
        // Remove listeners that match our naming pattern for this guild
        listeners.forEach(listener => {
            if (listener.sellMarketListenerGuildId === this.guildId) {
                this.client.removeListener('interactionCreate', listener);
            }
        });
    }

    setupListeners() {
        // Create a named function so we can track it
        const interactionHandler = async (interaction) => {
            if (interaction.guild.id !== this.guildId) return;

            try {
                // Handle modal submissions for selling items
                if (interaction.isModalSubmit() && interaction.customId.startsWith('player_market_sale_modal_')) {
                    await this.handleSellModalSubmit(interaction);
                }

                // Handle marketplace button interactions
                if (interaction.isButton()) {
                    if (interaction.customId.startsWith('marketplace_buy_')) {
                        await this.handleBuyButton(interaction);
                    } else if (interaction.customId.startsWith('marketplace_haggle_')) {
                        await this.handleHaggleButton(interaction);
                    } else if (interaction.customId.startsWith('marketplace_close_')) {
                        await this.handleCloseShopButton(interaction);
                    }
                }
            } catch (error) {
                console.error(`[SellMarketListener] Error in guild ${this.guildId}:`, error);
                
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ An error occurred while processing your request.',
                            ephemeral: true
                        });
                    } else if (interaction.deferred) {
                        await interaction.editReply({
                            content: '❌ An error occurred while processing your request.'
                        });
                    }
                } catch (replyError) {
                    console.error(`[SellMarketListener] Failed to send error reply:`, replyError);
                }
            }
        };

        // Mark the function with our guild ID for tracking
        interactionHandler.sellMarketListenerGuildId = this.guildId;
        
        // Add the listener
        this.client.on('interactionCreate', interactionHandler);
    }

    async handleSellModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const [, , , , itemId, sellerId, timestamp] = interaction.customId.split('_');
        const quantity = parseInt(interaction.fields.getTextInputValue('quantity'));
        const pricePerItem = parseInt(interaction.fields.getTextInputValue('price'));

        // Validation
        if (interaction.user.id !== sellerId) {
            return interaction.editReply({
                content: '❌ You can only sell your own items.',
                ephemeral: true
            });
        }

        if (isNaN(quantity) || quantity <= 0) {
            return interaction.editReply({
                content: '❌ Please enter a valid quantity.',
                ephemeral: true
            });
        }

        if (isNaN(pricePerItem) || pricePerItem <= 0) {
            return interaction.editReply({
                content: '❌ Please enter a valid price per item.',
                ephemeral: true
            });
        }

        const itemData = itemMap.get(itemId);
        if (!itemData) {
            return interaction.editReply({
                content: '❌ Item not found.',
                ephemeral: true
            });
        }

        // Check if user has enough items
        const sellerInv = await PlayerInventory.findOne({ playerId: sellerId });
        if (!sellerInv) {
            return interaction.editReply({
                content: '❌ You have no inventory.',
                ephemeral: true
            });
        }

        const invItem = sellerInv.items.find(item => item.itemId === itemId);
        if (!invItem || invItem.quantity < quantity) {
            return interaction.editReply({
                content: `❌ You don't have enough ${itemData.name}. You have ${invItem?.quantity || 0}, but tried to sell ${quantity}.`,
                ephemeral: true
            });
        }

        // Check if seller already has this item for sale
        const existingShop = await ActiveShop.findOne({
            shopOwnerId: sellerId,
            itemId: itemId,
            guildId: interaction.guild.id,
            isActive: true
        });

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            if (existingShop) {
                // Delete the old shop message and add to existing stock
                try {
                    const channel = await interaction.guild.channels.fetch(existingShop.channelId);
                    const message = await channel.messages.fetch(existingShop.messageId);
                    await message.delete();
                } catch (deleteError) {
                    console.warn('Could not delete existing shop message:', deleteError);
                }

                // Update existing shop with new total quantity
                existingShop.quantity += quantity;
                existingShop.pricePerItem = pricePerItem; // Use new price
                existingShop.channelId = interaction.channel.id; // Update channel if moved
                await existingShop.save({ session });
            }

            // Deduct items from seller's inventory
            invItem.quantity -= quantity;
            if (invItem.quantity === 0) {
                sellerInv.items = sellerInv.items.filter(item => item.itemId !== itemId);
            }
            await sellerInv.save({ session });

            // Create shop embed and post it
            const shopEmbed = await this.createShopEmbed(itemData, existingShop?.quantity || quantity, pricePerItem, interaction.user, interaction.member);
            const shopButtons = this.createShopButtons(itemId, sellerId);

            // Generate the marketplace image (with quantity back in image)
            const marketplaceImageBuffer = await generateMarketplaceImage(
                itemData, 
                existingShop?.quantity || quantity, 
                pricePerItem, 
                interaction.user,
                interaction.member
            );
            
            const marketplaceAttachment = new AttachmentBuilder(marketplaceImageBuffer, { 
                name: 'marketplace.gif' 
            });

            const shopMessage = await interaction.channel.send({
                embeds: [shopEmbed],
                components: [shopButtons],
                files: [marketplaceAttachment]
            });

            // Create or update ActiveShop record
            if (existingShop) {
                existingShop.messageId = shopMessage.id;
                await existingShop.save({ session });
            } else {
                const newShop = new ActiveShop({
                    messageId: shopMessage.id,
                    guildId: interaction.guild.id,
                    channelId: interaction.channel.id,
                    itemId: itemId,
                    quantity: quantity,
                    pricePerItem: pricePerItem,
                    shopOwnerId: sellerId
                });
                await newShop.save({ session });
            }

            await session.commitTransaction();
            session.endSession();

            await interaction.editReply({
                content: `✅ Successfully listed **${quantity}x ${itemData.name}** for **${pricePerItem} coins each**!`,
                ephemeral: true
            });

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error('Error creating shop:', error);
            return interaction.editReply({
                content: '❌ Failed to create shop listing.',
                ephemeral: true
            });
        }
    }

    async handleBuyButton(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const [, , itemId, sellerId] = interaction.customId.split('_');
        const buyerId = interaction.user.id;
        const messageId = interaction.message.id;

        // Check for concurrent purchase lock
        if (this.isPurchaseLocked(messageId)) {
            return interaction.editReply({
                content: '⏳ Another purchase is in progress for this item. Please try again in a moment.',
                ephemeral: true
            });
        }

        // Acquire purchase lock
        this.acquirePurchaseLock(messageId);

        // Check if buyer is trying to buy from themselves
        if (buyerId === sellerId) {
            return interaction.editReply({
                content: '❌ You cannot buy from your own shop.',
                ephemeral: true
            });
        }

        // Find the active shop for validation
        const shop = await ActiveShop.findOne({
            messageId: interaction.message.id,
            guildId: interaction.guild.id,
            isActive: true
        });

        if (!shop || shop.quantity <= 0) {
            this.releasePurchaseLock(messageId);
            return interaction.editReply({
                content: '❌ This shop is no longer active or out of stock.',
                ephemeral: true
            });
        }

        const itemData = itemMap.get(itemId);
        if (!itemData) {
            return interaction.editReply({
                content: '❌ Item not found.',
                ephemeral: true
            });
        }

        // Check buyer's affordability
        const buyerProfile = await Currency.findOne({ userId: buyerId });
        if (!buyerProfile || buyerProfile.money < shop.pricePerItem) {
            this.releasePurchaseLock(messageId);
            return interaction.editReply({
                content: `❌ You need ${shop.pricePerItem} coins but only have ${buyerProfile?.money || 0} coins.`,
                ephemeral: true
            });
        }

        // Attempt atomic purchase
        const purchaseResult = await ActiveShop.atomicPurchase(messageId, 'player', buyerId);
        
        if (!purchaseResult.success) {
            this.releasePurchaseLock(messageId);
            
            if (purchaseResult.reason === 'unavailable') {
                return interaction.editReply({
                    content: '❌ This item was just purchased by someone else!',
                    ephemeral: true
                });
            } else {
                return interaction.editReply({
                    content: '❌ Failed to process purchase. Please try again.',
                    ephemeral: true
                });
            }
        }

        const updatedShop = purchaseResult.shop;
        const soldOut = purchaseResult.soldOut;

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Transfer money
            buyerProfile.money -= updatedShop.pricePerItem;
            await buyerProfile.save({ session });

            let sellerProfile = await Currency.findOne({ userId: sellerId }).session(session);
            if (!sellerProfile) {
                sellerProfile = new Currency({ userId: sellerId, money: 0 });
            }
            sellerProfile.money += updatedShop.pricePerItem;
            await sellerProfile.save({ session });

            // Give item to buyer
            let buyerInv = await PlayerInventory.findOne({ playerId: buyerId }).session(session);
            if (!buyerInv) {
                buyerInv = new PlayerInventory({ playerId: buyerId, items: [] });
            }

            const existingItem = buyerInv.items.find(item => item.itemId === itemId);
            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                buyerInv.items.push({
                    itemId: itemId,
                    quantity: 1,
                    currentDurability: itemData.durability || null
                });
            }
            await buyerInv.save({ session });

            await session.commitTransaction();
            session.endSession();

            // Send transaction log - create thread only if not already in thread/voice channel
            let logChannel = interaction.channel;
            
            // Check if we're already in a thread or voice channel's text chat
            const isThread = interaction.channel.isThread();
            const isVoiceChannelText = interaction.channel.parent && interaction.channel.parent.type === 2; // Voice channel
            
            if (!isThread && !isVoiceChannelText) {
                // Create thread only if we're in a regular text channel
                logChannel = await interaction.message.startThread({
                    name: `Sale: ${itemData.name}`,
                    autoArchiveDuration: 60 // 1 hour
                });
            }

            await logChannel.send({
                content: `🎉 **Sale Completed!**\n\n**Buyer:** <@${buyerId}>\n**Item:** ${itemData.name}\n**Price:** ${shop.pricePerItem} coins\n**Seller:** <@${sellerId}>`
            });

            // Check if shop is now empty
            if (soldOut) {
                await this.closeShop(interaction.message, updatedShop);
                await interaction.editReply({
                    content: `✅ You successfully bought **${itemData.name}** for **${updatedShop.pricePerItem} coins**!\n🏪 The shop has sold out and closed.`,
                    ephemeral: true
                });
            } else {
                // Update embed and regenerate image with new quantity
                const seller = await interaction.guild.members.fetch(sellerId);
                const updatedEmbed = await this.createShopEmbed(itemData, updatedShop.quantity, updatedShop.pricePerItem, seller.user, seller);
                const shopButtons = this.createShopButtons(itemId, sellerId);
                
                // Regenerate image with updated quantity
                const updatedMarketplaceImageBuffer = await generateMarketplaceImage(
                    itemData, 
                    updatedShop.quantity, 
                    updatedShop.pricePerItem, 
                    seller.user,
                    seller
                );
                
                const updatedMarketplaceAttachment = new AttachmentBuilder(updatedMarketplaceImageBuffer, { 
                    name: 'marketplace.gif' 
                });
                
                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: [shopButtons],
                    files: [updatedMarketplaceAttachment]
                });

                await interaction.editReply({
                    content: `✅ You successfully bought **${itemData.name}** for **${updatedShop.pricePerItem} coins**!`,
                    ephemeral: true
                });
            }

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error('Error processing purchase:', error);
            return interaction.editReply({
                content: '❌ Failed to process purchase.',
                ephemeral: true
            });
        } finally {
            // Always release the purchase lock
            this.releasePurchaseLock(messageId);
        }
    }

    async handleHaggleButton(interaction) {
        const [, , itemId, sellerId] = interaction.customId.split('_');
        const buyerId = interaction.user.id;

        // Check if buyer is trying to haggle with themselves
        if (buyerId === sellerId) {
            return interaction.reply({
                content: '❌ You cannot haggle with yourself.',
                ephemeral: true
            });
        }

        // Check if we're already in a thread or voice channel's text chat
        const isThread = interaction.channel.isThread();
        const isVoiceChannelText = interaction.channel.parent && interaction.channel.parent.type === 2; // Voice channel
        
        let haggleChannel = interaction.channel;
        let responseMessage = '';
        
        if (!isThread && !isVoiceChannelText) {
            // Create thread only if we're in a regular text channel
            const existingThread = interaction.message.thread;
            
            if (existingThread) {
                haggleChannel = existingThread;
            } else {
                const itemData = itemMap.get(itemId);
                haggleChannel = await interaction.message.startThread({
                    name: `Haggle: ${itemData?.name || 'Item'}`,
                    autoArchiveDuration: 1440 // 24 hours
                });
            }
            responseMessage = `💬 Started a haggle thread! Check ${haggleChannel} to negotiate.`;
        } else {
            // We're already in a thread or voice channel text, use current channel
            responseMessage = `💬 Haggle started in this channel!`;
        }

        await haggleChannel.send(`💬 <@${buyerId}> wants to haggle about the price! <@${sellerId}>, they're interested in your item.`);

        await interaction.reply({
            content: responseMessage,
            ephemeral: true
        });
    }

    async handleCloseShopButton(interaction) {
        const [, , itemId, sellerId] = interaction.customId.split('_');

        // Check if the person clicking is the shop owner
        if (interaction.user.id !== sellerId) {
            return interaction.reply({
                content: '❌ Only the shop owner can close this shop.',
                ephemeral: true
            });
        }

        // Find the active shop
        const shop = await ActiveShop.findOne({
            messageId: interaction.message.id,
            guildId: interaction.guild.id,
            isActive: true
        });

        if (!shop) {
            return interaction.reply({
                content: '❌ This shop is no longer active.',
                ephemeral: true
            });
        }

        const itemData = itemMap.get(itemId);
        if (!itemData) {
            return interaction.reply({
                content: '❌ Item not found.',
                ephemeral: true
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Return items to seller's inventory
            let sellerInv = await PlayerInventory.findOne({ playerId: sellerId }).session(session);
            if (!sellerInv) {
                sellerInv = new PlayerInventory({ playerId: sellerId, items: [] });
            }

            const existingItem = sellerInv.items.find(item => item.itemId === itemId);
            if (existingItem) {
                existingItem.quantity += shop.quantity;
            } else {
                sellerInv.items.push({
                    itemId: itemId,
                    quantity: shop.quantity,
                    currentDurability: itemData.durability || null
                });
            }
            await sellerInv.save({ session });

            // Mark shop as inactive
            shop.isActive = false;
            await shop.save({ session });

            await session.commitTransaction();
            session.endSession();

            // Update the message to show shop is closed
            await this.closeShop(interaction.message, shop);

            await interaction.reply({
                content: `✅ Shop closed! **${shop.quantity}x ${itemData.name}** returned to your inventory.`,
                ephemeral: true
            });

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error('Error closing shop:', error);
            return interaction.reply({
                content: '❌ Failed to close shop.',
                ephemeral: true
            });
        }
    }

    async createShopEmbed(itemData, quantity, pricePerItem, seller, guildMember = null) {
        // Get user's role color
        let roleColor = 0x2ecc71; // Default green
        if (guildMember && guildMember.displayHexColor && guildMember.displayHexColor !== '#000000') {
            roleColor = guildMember.displayHexColor;
        }
        
        // Format item type for title
        const itemType = this.formatTypeName(itemData.type);
        
        const embed = new EmbedBuilder()
            .setTitle(`${itemType} for Sale`)
            .setColor(roleColor)
            .addFields(
                { name: itemData.name, value: `\`\`\`${itemData.description}\`\`\``, inline: true },
                { name: '👤 Seller', value: `<@${seller.id}>`, inline: true },
                { name: '💰 Price', value: `**${pricePerItem}** coins each\n**${quantity}** available`, inline: true }
            )
            .setImage('attachment://marketplace.gif') // Use the custom marketplace GIF
            .setTimestamp()
            .setFooter({ text: 'Marketplace • Click buttons to interact' });

        return embed;
    }

    createShopButtons(itemId, sellerId) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`marketplace_buy_${itemId}_${sellerId}`)
                .setLabel('Buy')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💰'),
            new ButtonBuilder()
                .setCustomId(`marketplace_haggle_${itemId}_${sellerId}`)
                .setLabel('Haggle')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💬'),
            new ButtonBuilder()
                .setCustomId(`marketplace_close_${itemId}_${sellerId}`)
                .setLabel('Close Shop')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚫')
        );
    }

    async closeShop(message, shop) {
        const itemData = itemMap.get(shop.itemId);
        const closedEmbed = new EmbedBuilder()
            .setTitle('🚫 Shop Closed')
            .setColor(0x95a5a6)
            .setDescription(`This shop for **${itemData?.name || 'Unknown Item'}** is now closed.`)
            .setTimestamp()
            .setFooter({ text: 'Marketplace • Shop Closed' });

        await message.edit({
            embeds: [closedEmbed],
            components: [],
            files: [], // Remove image attachment
            attachments: [] // Clear all attachments
        });
    }

    async getItemImage(itemData) {
        if (!itemData.image) return [];

        const imagePath = path.join(__dirname, '..', 'assets', 'items', `${itemData.image}.png`);
        
        try {
            if (fs.existsSync(imagePath)) {
                return [{
                    attachment: imagePath,
                    name: `${itemData.image}.png`
                }];
            }
        } catch (error) {
            console.warn('Could not load item image:', error);
        }
        
        return [];
    }

    // Purchase lock management methods
    isPurchaseLocked(messageId) {
        const lock = purchaseLocks.get(messageId);
        if (!lock) return false;
        
        // Check if lock is expired (30 seconds timeout)
        if (Date.now() - lock.timestamp > 30000) {
            purchaseLocks.delete(messageId);
            return false;
        }
        
        return lock.locked;
    }

    acquirePurchaseLock(messageId) {
        purchaseLocks.set(messageId, {
            locked: true,
            timestamp: Date.now()
        });
        console.log(`[MARKETPLACE_LOCK] 🔒 Acquired purchase lock for message ${messageId}`);
    }

    releasePurchaseLock(messageId) {
        purchaseLocks.delete(messageId);
        console.log(`[MARKETPLACE_LOCK] 🔓 Released purchase lock for message ${messageId}`);
    }

    formatTypeName(type) {
        const names = {
            'mineLoot': 'Ore',
            'tool': 'Pickaxe',
            'consumable': 'Food',
            'equipment': 'Equipment',
            'charm': 'Charm',
            'material': 'Material',
            'quest': 'Quest Item',
            'special': 'Special Item'
        };
        return names[type] || type.charAt(0).toUpperCase() + type.slice(1);
    }

    cleanup() {
        // Remove all listeners for this guild
        this.removeExistingListeners();
        console.log(`[SellMarketListener] Cleaned up listeners for guild ${this.guildId}`);
    }
}

module.exports = SellMarketListener;

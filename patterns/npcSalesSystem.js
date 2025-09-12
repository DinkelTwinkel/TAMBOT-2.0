// npcSalesSystem.js - NPCs automatically purchase items from player marketplace
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
const ActiveShop = require('../models/activeShop');
const Currency = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const itemSheet = require('../data/itemSheet.json');
const npcsData = require('../data/npcs.json');
const { getShopPrices, calculateFluctuatedPrice } = require('./generateShop');
const GuildConfig = require('../models/GuildConfig');
const { generateMarketplaceImage } = require('./generateMarketplaceImage');
const getPlayerStats = require('./calculatePlayerStat');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

class NPCSalesSystem {
    constructor(client) {
        this.client = client;
        this.isRunning = false;
        this.interval = null;
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('[NPC_SALES] Starting NPC sales system...');
        
        // Check for sales every 2-5 minutes (random interval)
        this.scheduleNextCheck();
    }

    scheduleNextCheck() {
        if (!this.isRunning) return;
        
        // Random interval between 2-5 minutes
        const interval = (2 + Math.random() * 3) * 60 * 1000;
        
        this.interval = setTimeout(async () => {
            try {
                await this.checkForPurchases();
            } catch (error) {
                console.error('[NPC_SALES] Error during purchase check:', error);
            }
            
            // Schedule next check
            this.scheduleNextCheck();
        }, interval);
    }

    async checkForPurchases() {
        try {
            console.log('[NPC_SALES] Checking for potential NPC purchases...');
            
            // Get all active shops
            const activeShops = await ActiveShop.find({ isActive: true }).lean();
            
            if (activeShops.length === 0) {
                console.log('[NPC_SALES] No active shops found');
                return;
            }

            console.log(`[NPC_SALES] Found ${activeShops.length} active shops`);

            // Process each shop with 30% chance
            for (const shop of activeShops) {
                if (Math.random() < 0.3) { // 30% chance to attempt purchase
                    await this.attemptNPCPurchase(shop);
                }
            }
        } catch (error) {
            console.error('[NPC_SALES] Error checking for purchases:', error);
        }
    }

    async attemptNPCPurchase(shop) {
        try {
            const itemData = itemMap.get(shop.itemId);
            if (!itemData) {
                console.warn(`[NPC_SALES] Item ${shop.itemId} not found in itemSheet`);
                return;
            }

            // Get market value for this item using proper fluctuation calculation
            let marketValue = itemData.value; // Fallback to base value
            
            try {
                // Get guild config for proper market value calculation
                const guildConfig = await GuildConfig.findOne({ guildId: shop.guildId });
                if (guildConfig) {
                    // Use standard price change factor (0.1 = 10% fluctuation)
                    marketValue = calculateFluctuatedPrice(itemData.value, guildConfig.updatedAt, shop.itemId, 0.1);
                } else {
                    console.warn(`[NPC_SALES] No guild config found for guild ${shop.guildId}, using base value`);
                }
            } catch (marketError) {
                console.warn('[NPC_SALES] Error calculating market value:', marketError);
            }
            
            // Calculate price ratio (shop price vs market value)
            const priceRatio = shop.pricePerItem / marketValue;
            
            // NPCs won't buy if price is more than 20% above market value
            if (priceRatio > 1.2) {
                console.log(`[NPC_SALES] Price too high for NPCs: ${shop.pricePerItem}c vs market ${marketValue}c (${(priceRatio * 100).toFixed(1)}%)`);
                return;
            }

            // Calculate purchase chance based on price ratio
            let purchaseChance;
            if (priceRatio <= 0.1) { // Nearly free
                purchaseChance = 0.95; // 95% chance
            } else if (priceRatio <= 0.5) { // 50% of market value
                purchaseChance = 0.8; // 80% chance
            } else if (priceRatio <= 0.8) { // 80% of market value
                purchaseChance = 0.6; // 60% chance
            } else if (priceRatio <= 1.0) { // At market value
                purchaseChance = 0.4; // 40% chance
            } else { // Above market value (up to 120%)
                purchaseChance = 0.2 - (priceRatio - 1.0) * 0.5; // Decreasing chance
            }

            // Get seller's luck stat to boost chance
            try {
                const sellerStats = await getPlayerStats(shop.shopOwnerId);
                const luckBonus = (sellerStats?.stats?.luck || 0) * 0.01; // 1% per luck point
                purchaseChance += luckBonus;
                
                if (luckBonus > 0) {
                    console.log(`[NPC_SALES] Seller luck bonus: +${(luckBonus * 100).toFixed(1)}% (${sellerStats.stats.luck} luck)`);
                }
            } catch (statsError) {
                console.warn('[NPC_SALES] Could not get seller stats:', statsError);
            }

            // Cap at 95% chance
            purchaseChance = Math.min(0.95, purchaseChance);

            console.log(`[NPC_SALES] Purchase chance for ${itemData.name}: ${(purchaseChance * 100).toFixed(1)}% (price ratio: ${(priceRatio * 100).toFixed(1)}%)`);

            // Roll for purchase
            if (Math.random() > purchaseChance) {
                console.log(`[NPC_SALES] NPC decided not to buy ${itemData.name}`);
                return;
            }

            // Select random NPC
            const npc = this.selectRandomNPC(itemData);
            if (!npc) {
                console.log('[NPC_SALES] No suitable NPC found');
                return;
            }

            // Execute the purchase
            await this.executePurchase(shop, itemData, npc);

        } catch (error) {
            console.error(`[NPC_SALES] Error attempting purchase for shop ${shop._id}:`, error);
        }
    }

    selectRandomNPC(itemData) {
        // Filter NPCs that might be interested in this item type
        const interestedNPCs = npcsData.filter(npc => {
            // Check if NPC has preferences that match this item
            if (npc.preferences && npc.preferences.includes(itemData.type)) {
                return true;
            }
            
            // Generic NPCs can buy anything
            if (!npc.preferences || npc.preferences.length === 0) {
                return true;
            }
            
            return false;
        });

        if (interestedNPCs.length === 0) {
            return npcsData[Math.floor(Math.random() * npcsData.length)]; // Fallback to any NPC
        }

        return interestedNPCs[Math.floor(Math.random() * interestedNPCs.length)];
    }

    async executePurchase(shop, itemData, npc) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Get the shop document for updating
            const shopDoc = await ActiveShop.findById(shop._id).session(session);
            if (!shopDoc || !shopDoc.isActive || shopDoc.quantity <= 0) {
                await session.abortTransaction();
                session.endSession();
                return;
            }

            // Transfer money to seller
            let sellerProfile = await Currency.findOne({ userId: shop.shopOwnerId }).session(session);
            if (!sellerProfile) {
                sellerProfile = new Currency({ userId: shop.shopOwnerId, money: 0 });
            }
            sellerProfile.money += shop.pricePerItem;
            await sellerProfile.save({ session });

            // Reduce shop quantity
            shopDoc.quantity -= 1;
            
            if (shopDoc.quantity === 0) {
                shopDoc.isActive = false;
            }
            
            await shopDoc.save({ session });

            await session.commitTransaction();
            session.endSession();

            // Update the shop message
            await this.updateShopMessage(shop, shopDoc, itemData, npc);

            console.log(`[NPC_SALES] ${npc.name} bought ${itemData.name} for ${shop.pricePerItem}c`);

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error('[NPC_SALES] Error executing purchase:', error);
        }
    }

    async updateShopMessage(shop, shopDoc, itemData, npc) {
        try {
            // Get the guild and channel
            const guild = await this.client.guilds.fetch(shop.guildId);
            const channel = await guild.channels.fetch(shop.channelId);
            const message = await channel.messages.fetch(shop.messageId);

            // Check if we're in a thread or voice channel's text chat
            const isThread = channel.isThread();
            const isVoiceChannelText = channel.parent && channel.parent.type === 2;
            
            let logChannel = channel;
            
            if (!isThread && !isVoiceChannelText) {
                // Try to find existing thread or create one
                const existingThread = message.thread;
                if (existingThread) {
                    logChannel = existingThread;
                } else {
                    logChannel = await message.startThread({
                        name: `Sale: ${itemData.name}`,
                        autoArchiveDuration: 60
                    });
                }
            }

            // Send purchase message
            await logChannel.send({
                content: `🤖 **NPC Purchase!**\n\n**Buyer:** ${npc.name}\n**Item:** ${itemData.name}\n**Price:** ${shop.pricePerItem} coins\n**Seller:** <@${shop.shopOwnerId}>\n\n*"${npc.dialogue[Math.floor(Math.random() * npc.dialogue.length)]}"*`
            });

            if (shopDoc.quantity === 0) {
                // Shop sold out - close it
                const closedEmbed = new EmbedBuilder()
                    .setTitle('🚫 Shop Closed')
                    .setColor(0x95a5a6)
                    .setDescription(`This shop for **${itemData.name}** is now closed.`)
                    .setTimestamp()
                    .setFooter({ text: 'Marketplace • Shop Closed' });

                await message.edit({
                    embeds: [closedEmbed],
                    components: [],
                    files: [],
                    attachments: []
                });
            } else {
                // Update shop with new quantity
                const seller = await guild.members.fetch(shop.shopOwnerId);
                
                // Create updated embed
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(`${this.formatTypeName(itemData.type)} for Sale`)
                    .setColor(seller.displayHexColor || 0x2ecc71)
                    .addFields(
                        { name: itemData.name, value: `\`\`\`${itemData.description}\`\`\``, inline: true },
                        { name: '👤 Seller', value: `<@${shop.shopOwnerId}>`, inline: true },
                        { name: '💰 Price', value: `**${shop.pricePerItem}** coins each\n**${shopDoc.quantity}** available`, inline: true }
                    )
                    .setImage('attachment://marketplace.gif')
                    .setTimestamp()
                    .setFooter({ text: 'Marketplace • Click buttons to interact' });

                // Generate updated image
                const updatedImageBuffer = await generateMarketplaceImage(
                    itemData,
                    shopDoc.quantity,
                    shop.pricePerItem,
                    seller.user,
                    seller
                );

                const updatedAttachment = new AttachmentBuilder(updatedImageBuffer, {
                    name: 'marketplace.gif'
                });

                // Create shop buttons
                const shopButtons = new (require('discord.js').ActionRowBuilder)().addComponents(
                    new (require('discord.js').ButtonBuilder)()
                        .setCustomId(`marketplace_buy_${shop.itemId}_${shop.shopOwnerId}`)
                        .setLabel('Buy')
                        .setStyle(require('discord.js').ButtonStyle.Success)
                        .setEmoji('💰'),
                    new (require('discord.js').ButtonBuilder)()
                        .setCustomId(`marketplace_haggle_${shop.itemId}_${shop.shopOwnerId}`)
                        .setLabel('Haggle')
                        .setStyle(require('discord.js').ButtonStyle.Primary)
                        .setEmoji('💬'),
                    new (require('discord.js').ButtonBuilder)()
                        .setCustomId(`marketplace_close_${shop.itemId}_${shop.shopOwnerId}`)
                        .setLabel('Close Shop')
                        .setStyle(require('discord.js').ButtonStyle.Danger)
                        .setEmoji('🚫')
                );

                await message.edit({
                    embeds: [updatedEmbed],
                    components: [shopButtons],
                    files: [updatedAttachment]
                });
            }

        } catch (updateError) {
            console.error('[NPC_SALES] Error updating shop message:', updateError);
        }
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

    stop() {
        this.isRunning = false;
        if (this.interval) {
            clearTimeout(this.interval);
            this.interval = null;
        }
        console.log('[NPC_SALES] Stopped NPC sales system');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            nextCheck: this.interval ? 'Scheduled' : 'None'
        };
    }
}

module.exports = NPCSalesSystem;

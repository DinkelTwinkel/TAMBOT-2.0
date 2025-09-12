// npcSalesSystem.js - NPCs automatically purchase items from player marketplace
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
const ActiveShop = require('../models/activeShop');
const Currency = require('../models/currency');
const PlayerInventory = require('../models/inventory');
const itemSheet = require('../data/itemSheet.json');
const npcsData = require('../data/npcs.json');
const { getShopPrices, calculateFluctuatedPrice, getAIShopDialogue } = require('./generateShop');
const GuildConfig = require('../models/GuildConfig');
const { generateMarketplaceImage } = require('./generateMarketplaceImage');
const registerBotMessage = require('./registerBotMessage');
const getPlayerStats = require('./calculatePlayerStat');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

// Import purchase locks from sellMarketListener (shared between systems)
// We'll use the same lock system to prevent conflicts between NPCs and players

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
        
        // Check for sales every 5-10 minutes
        this.scheduleNextCheck();
    }

    scheduleNextCheck() {
        if (!this.isRunning) return;
        
        // Random interval between 5-10 minutes
        const interval = (5 + Math.random() * 5) * 60 * 1000;
        console.log(`[NPC_SALES] Next check scheduled in ${(interval/60000).toFixed(1)} minutes`);
        
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
            console.log('[NPC_SALES] 🔍 Checking for potential NPC purchases...');
            
            // Get all active shops (only from main channels, not threads or voice channels)
            const allActiveShops = await ActiveShop.find({ isActive: true }).lean();
            
            // Filter out shops in threads or voice channel text chats
            const activeShops = [];
            for (const shop of allActiveShops) {
                try {
                    const guild = await this.client.guilds.fetch(shop.guildId);
                    const channel = await guild.channels.fetch(shop.channelId);
                    
                    // Only consider shops in main text channels (not threads or voice channel text)
                    const isMainChannel = !channel.isThread() && channel.type === 0;
                    
                    if (isMainChannel) {
                        activeShops.push(shop);
                    } else {
                        console.log(`[NPC_SALES] 🚫 Skipping shop in ${channel.isThread() ? 'thread' : 'voice channel'}: ${channel.name}`);
                    }
                } catch (channelError) {
                    console.warn(`[NPC_SALES] Could not fetch channel ${shop.channelId}:`, channelError.message);
                }
            }
            
            if (activeShops.length === 0) {
                console.log('[NPC_SALES] ❌ No active shops found');
                return;
            }

            console.log(`[NPC_SALES] 🏪 Found ${activeShops.length} active shops:`);
            
            // Debug: List all shops
            for (const shop of activeShops) {
                const itemData = itemMap.get(shop.itemId);
                console.log(`[NPC_SALES] 📦 Shop: ${itemData?.name || 'Unknown'} x${shop.quantity} @ ${shop.pricePerItem}c (Owner: ${shop.shopOwnerId})`);
            }

            // Process each shop with 30% chance
            let purchaseAttempts = 0;
            for (const shop of activeShops) {
                const rollResult = Math.random();
                const willAttempt = rollResult < 0.3;
                console.log(`[NPC_SALES] 🎲 Shop ${shop._id}: Roll ${(rollResult * 100).toFixed(1)}% - ${willAttempt ? 'ATTEMPTING' : 'SKIPPING'} purchase`);
                
                if (willAttempt) {
                    purchaseAttempts++;
                    await this.attemptNPCPurchase(shop);
                }
            }
            
            console.log(`[NPC_SALES] ✅ Completed check: ${purchaseAttempts}/${activeShops.length} shops attempted`);
        } catch (error) {
            console.error('[NPC_SALES] ❌ Error checking for purchases:', error);
        }
    }

    async attemptNPCPurchase(shop) {
        try {
            console.log(`[NPC_SALES] 🛒 Attempting purchase for shop ${shop._id}`);
            
            const itemData = itemMap.get(shop.itemId);
            if (!itemData) {
                console.warn(`[NPC_SALES] ❌ Item ${shop.itemId} not found in itemSheet`);
                return;
            }

            console.log(`[NPC_SALES] 📦 Item: ${itemData.name} (Base value: ${itemData.value}c)`);

            // Get market value for this item using proper fluctuation calculation
            let marketValue = itemData.value; // Fallback to base value
            
            try {
                // Get guild config for proper market value calculation
                const guildConfig = await GuildConfig.findOne({ guildId: shop.guildId });
                if (guildConfig) {
                    // Use standard price change factor (0.1 = 10% fluctuation)
                    marketValue = calculateFluctuatedPrice(itemData.value, guildConfig.updatedAt, shop.itemId, 0.1);
                    console.log(`[NPC_SALES] 💰 Market value calculated: ${marketValue}c (base: ${itemData.value}c)`);
                } else {
                    console.warn(`[NPC_SALES] ⚠️ No guild config found for guild ${shop.guildId}, using base value`);
                }
            } catch (marketError) {
                console.warn('[NPC_SALES] ⚠️ Error calculating market value:', marketError);
            }
            
            // Calculate price ratio (shop price vs market value)
            const priceRatio = shop.pricePerItem / marketValue;
            console.log(`[NPC_SALES] 📊 Price analysis: Shop ${shop.pricePerItem}c vs Market ${marketValue}c = ${(priceRatio * 100).toFixed(1)}% of market value`);
            
            // NPCs won't buy if price is more than 20% above market value
            if (priceRatio > 1.2) {
                console.log(`[NPC_SALES] ❌ Price too high for NPCs: ${shop.pricePerItem}c vs market ${marketValue}c (${(priceRatio * 100).toFixed(1)}%)`);
                
                // Generate dialogue for expensive items and post in thread
                await this.postExpensiveItemDialogue(shop, itemData, priceRatio, marketValue);
                return;
            }

            // Calculate purchase chance based on price ratio
            let purchaseChance;
            let priceCategory;
            
            if (priceRatio <= 0.1) { // Nearly free
                purchaseChance = 0.95;
                priceCategory = 'Nearly Free';
            } else if (priceRatio <= 0.5) { // 50% of market value
                purchaseChance = 0.8;
                priceCategory = 'Great Deal';
            } else if (priceRatio <= 0.8) { // 80% of market value
                purchaseChance = 0.6;
                priceCategory = 'Good Deal';
            } else if (priceRatio <= 1.0) { // At market value
                purchaseChance = 0.4;
                priceCategory = 'Fair Price';
            } else { // Above market value (up to 120%)
                purchaseChance = 0.2 - (priceRatio - 1.0) * 0.5;
                priceCategory = 'Overpriced';
            }

            console.log(`[NPC_SALES] 💡 Price category: ${priceCategory} (Base chance: ${(purchaseChance * 100).toFixed(1)}%)`);

            // Get seller's luck stat to boost chance
            let luckBonus = 0;
            try {
                const sellerStats = await getPlayerStats(shop.shopOwnerId);
                luckBonus = (sellerStats?.stats?.luck || 0) * 0.01; // 1% per luck point
                purchaseChance += luckBonus;
                
                if (luckBonus > 0) {
                    console.log(`[NPC_SALES] 🍀 Seller luck bonus: +${(luckBonus * 100).toFixed(1)}% (${sellerStats.stats.luck} luck points)`);
                }
            } catch (statsError) {
                console.warn('[NPC_SALES] ⚠️ Could not get seller stats:', statsError);
            }

            // Cap at 95% chance
            purchaseChance = Math.min(0.95, purchaseChance);

            console.log(`[NPC_SALES] 🎯 Final purchase chance: ${(purchaseChance * 100).toFixed(1)}% (${priceCategory} + ${(luckBonus * 100).toFixed(1)}% luck)`);

            // Roll for purchase
            const purchaseRoll = Math.random();
            const willPurchase = purchaseRoll < purchaseChance;
            console.log(`[NPC_SALES] 🎲 Purchase roll: ${(purchaseRoll * 100).toFixed(1)}% - ${willPurchase ? '✅ BUYING' : '❌ PASSING'}`);
            
            if (!willPurchase) {
                return;
            }

            // Select random NPC
            const npc = this.selectRandomNPC(itemData);
            if (!npc) {
                console.log('[NPC_SALES] ❌ No suitable NPC found');
                return;
            }

            console.log(`[NPC_SALES] 🤖 Selected NPC: ${npc.name} (preferences: ${npc.preferences?.join(', ') || 'none'})`);

            // Execute the purchase
            console.log(`[NPC_SALES] 💳 Executing purchase...`);
            await this.executePurchase(shop, itemData, npc, marketValue);

        } catch (error) {
            console.error(`[NPC_SALES] Error attempting purchase for shop ${shop._id}:`, error);
        }
    }

    selectRandomNPC(itemData) {
        console.log(`[NPC_SALES] 🔍 Looking for NPCs interested in ${itemData.type} items...`);
        
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

        console.log(`[NPC_SALES] 👥 Found ${interestedNPCs.length} interested NPCs out of ${npcsData.length} total`);

        if (interestedNPCs.length === 0) {
            console.log(`[NPC_SALES] 🎲 No specific preferences match, selecting random NPC`);
            return npcsData[Math.floor(Math.random() * npcsData.length)]; // Fallback to any NPC
        }

        const selectedNPC = interestedNPCs[Math.floor(Math.random() * interestedNPCs.length)];
        console.log(`[NPC_SALES] ✅ Selected ${selectedNPC.name} from ${interestedNPCs.length} interested NPCs`);
        return selectedNPC;
    }

    async executePurchase(shop, itemData, npc, marketValue) {
        try {
            console.log(`[NPC_SALES] 🔒 Attempting atomic purchase for message ${shop.messageId}`);
            
            // Attempt atomic purchase
            const purchaseResult = await ActiveShop.atomicPurchase(shop.messageId, 'npc', npc.id);
            
            if (!purchaseResult.success) {
                console.log(`[NPC_SALES] ❌ Atomic purchase failed: ${purchaseResult.reason}`);
                if (purchaseResult.reason === 'unavailable') {
                    console.log(`[NPC_SALES] 🏃 Item was purchased by someone else (race condition avoided)`);
                }
                return;
            }

            const updatedShop = purchaseResult.shop;
            const soldOut = purchaseResult.soldOut;
            
            console.log(`[NPC_SALES] ✅ Atomic purchase successful - ${updatedShop.quantity} items remaining`);

            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                // Transfer money to seller
                let sellerProfile = await Currency.findOne({ userId: shop.shopOwnerId }).session(session);
                if (!sellerProfile) {
                    sellerProfile = new Currency({ userId: shop.shopOwnerId, money: 0 });
                }
                sellerProfile.money += shop.pricePerItem;
                await sellerProfile.save({ session });

                await session.commitTransaction();
                session.endSession();

                // Update the shop message
                await this.updateShopMessage(shop, updatedShop, itemData, npc, soldOut, marketValue);

                console.log(`[NPC_SALES] 🎉 ${npc.name} successfully bought ${itemData.name} for ${shop.pricePerItem}c`);

            } catch (error) {
                await session.abortTransaction();
                session.endSession();
                console.error('[NPC_SALES] ❌ Error processing payment:', error);
            }

        } catch (error) {
            console.error('[NPC_SALES] ❌ Error executing purchase:', error);
        }
    }

    async updateShopMessage(shop, shopDoc, itemData, npc, soldOut = false, marketValue = null) {
        try {
            // Get the guild and channel
            const guild = await this.client.guilds.fetch(shop.guildId);
            const channel = await guild.channels.fetch(shop.channelId);
            const message = await channel.messages.fetch(shop.messageId);

            // Check channel type and thread capability
            const isThread = channel.isThread();
            const isVoiceChannelText = channel.parent && channel.parent.type === 2;
            const canCreateThreads = channel.type === 0 || channel.type === 5; // Text or announcement channel
            
            let logChannel = channel;
            
            console.log(`[NPC_SALES] 📍 Channel info: isThread=${isThread}, isVoiceText=${isVoiceChannelText}, canCreateThreads=${canCreateThreads}, type=${channel.type}`);
            
            if (!isThread && !isVoiceChannelText && canCreateThreads) {
                // Try to find existing thread or create one (only in text channels)
                const existingThread = message.thread;
                if (existingThread) {
                    logChannel = existingThread;
                    console.log(`[NPC_SALES] 🧵 Using existing thread: ${existingThread.name}`);
                } else {
                    try {
                        logChannel = await message.startThread({
                            name: `Sale: ${itemData.name}`,
                            autoArchiveDuration: 60
                        });
                        console.log(`[NPC_SALES] 🧵 Created new thread: ${logChannel.name}`);
                    } catch (threadError) {
                        console.warn(`[NPC_SALES] ⚠️ Could not create thread, using main channel:`, threadError.message);
                        logChannel = channel;
                    }
                }
            } else {
                console.log(`[NPC_SALES] 💬 Using current channel for NPC purchase message`);
            }

            // Generate AI dialogue for the NPC purchase
            const npcDialogue = await this.generateNPCPurchaseDialogue(npc, itemData, shop.pricePerItem, marketValue || itemData.value);
            
            // Send purchase message
            await logChannel.send({
                content: `🤖 **NPC Purchase!**\n\n**Buyer:** ${npc.name}\n**Item:** ${itemData.name}\n**Price:** ${shop.pricePerItem} coins\n**Seller:** <@${shop.shopOwnerId}>\n\n*"${npcDialogue}"*`
            });

            if (soldOut) {
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

                // Register the closed shop message for deletion in 5 hours
                try {
                    await registerBotMessage(guild.id, channel.id, message.id, 300); // 300 minutes = 5 hours
                    console.log(`[NPC_SALES] Registered closed shop message for deletion in 5 hours`);
                } catch (registerError) {
                    console.error('[NPC_SALES] Error registering closed shop for deletion:', registerError);
                }
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

    async postExpensiveItemDialogue(shop, itemData, priceRatio, marketValue) {
        try {
            // Get the guild and channel
            const guild = await this.client.guilds.fetch(shop.guildId);
            const channel = await guild.channels.fetch(shop.channelId);
            const message = await channel.messages.fetch(shop.messageId);

            // Check if message has a thread, if not create one
            let dialogueChannel = message.thread;
            
            if (!dialogueChannel) {
                try {
                    dialogueChannel = await message.startThread({
                        name: `💰 ${itemData.name} Shop`,
                        autoArchiveDuration: 1440 // 24 hours
                    });
                } catch (threadError) {
                    console.warn('[NPC_SALES] Could not create thread for expensive item dialogue:', threadError.message);
                    return; // Skip dialogue if can't create thread
                }
            }

            // Select a random NPC to comment
            const npc = this.selectRandomNPC(itemData);
            if (!npc) return;

            // Generate dialogue about expensive price
            const overpricePercentage = Math.round((priceRatio - 1) * 100);
            const savings = shop.pricePerItem - marketValue;
            
            const expensiveDialogues = [
                `${overpricePercentage}% over market value? That's a bit steep for my taste.`,
                `I could get this for ${marketValue}c elsewhere. ${savings}c markup is too much.`,
                `Interesting item, but ${shop.pricePerItem}c is way above the ${marketValue}c market rate.`,
                `I'll pass on this one. ${overpricePercentage}% markup is beyond my budget.`,
                `Good quality, but ${shop.pricePerItem}c vs ${marketValue}c market price? I'll wait for a better deal.`
            ];

            const selectedDialogue = expensiveDialogues[Math.floor(Math.random() * expensiveDialogues.length)];

            await dialogueChannel.send({
                content: `💭 **${npc.name}** *looks at the ${itemData.name}*\n\n*"${selectedDialogue}"*`
            });

            console.log(`[NPC_SALES] 💭 ${npc.name} commented on expensive ${itemData.name}`);

        } catch (error) {
            console.error('[NPC_SALES] Error posting expensive item dialogue:', error);
        }
    }

    async generateNPCPurchaseDialogue(npc, itemData, pricePaid, marketValue) {
        try {
            const aiShopDialogue = getAIShopDialogue();
            
            if (!aiShopDialogue || !aiShopDialogue.isAvailable()) {
                // Use fallback dialogue from NPC data
                return npc.dialogue[Math.floor(Math.random() * npc.dialogue.length)];
            }

            // Calculate if this was a good deal for context
            const priceRatio = pricePaid / marketValue;
            let dealQuality;
            if (priceRatio <= 0.5) dealQuality = 'excellent';
            else if (priceRatio <= 0.8) dealQuality = 'good';
            else if (priceRatio <= 1.0) dealQuality = 'fair';
            else dealQuality = 'expensive';

            // Create NPC context for AI
            const npcContext = {
                name: npc.name,
                personality: npc.aiPersonality || npc.description,
                preferences: npc.preferences || [],
                wealth: npc.wealth || 3,
                budget: npc.budget || 'medium',
                dealQuality: dealQuality,
                pricePaid: pricePaid,
                marketValue: marketValue,
                itemType: itemData.type,
                itemName: itemData.name,
                savings: marketValue - pricePaid
            };

            // Generate AI dialogue using the existing shop dialogue system
            // We'll create a mock shop object for the AI to work with
            const mockShop = {
                name: 'Player Marketplace',
                shopkeeper: {
                    name: npc.name,
                    personality: npc.aiPersonality || npc.description
                },
                successBuy: npc.dialogue // Fallback dialogue
            };

            const mockBuyer = {
                username: npc.name,
                displayName: npc.name,
                id: npc.id
            };

            // Generate contextual purchase dialogue
            const aiDialogue = await aiShopDialogue.generatePurchaseDialogue(
                mockShop, 
                itemData, 
                pricePaid, 
                mockBuyer, 
                1, 
                npcContext
            );

            console.log(`[NPC_SALES] 🤖 Generated AI dialogue for ${npc.name}`);
            return aiDialogue;

        } catch (error) {
            console.error('[NPC_SALES] AI dialogue generation failed:', error);
            // Fallback to static dialogue
            return npc.dialogue[Math.floor(Math.random() * npc.dialogue.length)];
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

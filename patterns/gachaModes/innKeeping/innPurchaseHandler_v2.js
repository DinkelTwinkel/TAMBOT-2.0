// innKeeping/innPurchaseHandler_v2.js
// Enhanced with atomic operations and concurrency protection

const { EmbedBuilder } = require('discord.js');
const Money = require('../../../models/currency');
const ActiveVCs = require('../../../models/activevcs');
const InnConfig = require('./innConfig');
const gachaServers = require('../../../data/gachaServers.json');
const shops = require('../../../data/shops.json');
const itemSheet = require('../../../data/itemSheet.json');
const InnAIManager = require('./innAIManager');

class InnPurchaseHandler {
    constructor() {
        this.config = InnConfig;
        this.aiManager = new InnAIManager();
        this.purchaseLocks = new Map();
        this.recentPurchases = new Map(); // For duplicate prevention
    }

    /**
     * Generate unique purchase ID for idempotency
     */
    generatePurchaseId(userId, itemId, timestamp) {
        return `purchase-${userId}-${itemId}-${timestamp}-${Math.random()}`;
    }

    /**
     * Check for duplicate purchases (prevent double-buying)
     */
    isDuplicatePurchase(userId, itemId) {
        const key = `${userId}-${itemId}`;
        const lastPurchase = this.recentPurchases.get(key);
        
        if (lastPurchase && Date.now() - lastPurchase < 3000) { // 3 second cooldown
            return true;
        }
        
        this.recentPurchases.set(key, Date.now());
        
        // Clean old entries
        for (const [k, time] of this.recentPurchases.entries()) {
            if (Date.now() - time > 60000) { // Remove entries older than 1 minute
                this.recentPurchases.delete(k);
            }
        }
        
        return false;
    }

    /**
     * Handle purchase with full concurrency protection
     */
    async handlePurchase(member, itemName, channel, dbEntry) {
        const userId = member.id;
        const channelId = dbEntry.channelId;
        
        // Check for duplicate purchase attempts
        if (this.isDuplicatePurchase(userId, itemName)) {
            console.log(`[InnPurchase] Duplicate purchase attempt blocked for ${member.user.username}`);
            return {
                success: false,
                message: 'Please wait a moment before purchasing again.'
            };
        }
        
        try {
            // Acquire user-specific purchase lock
            const lockKey = `${userId}-${channelId}`;
            if (this.purchaseLocks.has(lockKey)) {
                return {
                    success: false,
                    message: 'Purchase already in progress. Please wait.'
                };
            }
            
            this.purchaseLocks.set(lockKey, Date.now());
            
            // Find item
            const item = await this.findItemAtomic(itemName, dbEntry);
            if (!item) {
                return {
                    success: false,
                    message: `Item "${itemName}" not found in this shop.`
                };
            }
            
            // Generate purchase ID for idempotency
            const purchaseId = this.generatePurchaseId(userId, item.id, Date.now());
            
            // Process purchase atomically
            const result = await this.processPurchaseAtomic(
                member,
                item,
                channel,
                channelId,
                purchaseId,
                dbEntry
            );
            
            return result;
            
        } catch (error) {
            console.error('[InnPurchase] Error handling purchase:', error);
            return {
                success: false,
                message: 'An error occurred processing your purchase.'
            };
        } finally {
            // Release lock
            const lockKey = `${userId}-${channelId}`;
            this.purchaseLocks.delete(lockKey);
        }
    }

    /**
     * Find item atomically from shop inventory
     */
    async findItemAtomic(itemName, dbEntry) {
        // Get server and shop info
        const serverData = gachaServers.find(s => s.id === String(dbEntry.typeId));
        if (!serverData) return null;
        
        const shopData = shops.find(s => s.id === serverData.shop);
        if (!shopData) return null;
        
        // Search in static items
        const allItems = [...shopData.staticItems];
        
        // Find matching item
        const searchTerm = itemName.toLowerCase();
        for (const itemId of allItems) {
            const item = itemSheet.find(i => String(i.id) === String(itemId));
            if (item && item.name.toLowerCase().includes(searchTerm)) {
                return item;
            }
        }
        
        return null;
    }

    /**
     * Process purchase with atomic operations
     */
    async processPurchaseAtomic(member, item, channel, channelId, purchaseId, dbEntry) {
        const userId = member.id;
        const itemPrice = item.value;
        
        // Start transaction-like process
        try {
            // Step 1: Check and deduct user balance atomically
            const userBalance = await Money.findOne({ userId: userId });
            if (!userBalance || userBalance.money < itemPrice) {
                return {
                    success: false,
                    message: `Insufficient funds! You need ${itemPrice} coins but only have ${userBalance?.money || 0}.`
                };
            }
            
            // Atomic balance deduction with check
            const balanceUpdated = await Money.findOneAndUpdate(
                {
                    userId: userId,
                    money: { $gte: itemPrice }
                },
                {
                    $inc: { money: -itemPrice },
                    $push: {
                        purchaseHistory: {
                            purchaseId: purchaseId,
                            itemId: item.id,
                            itemName: item.name,
                            price: itemPrice,
                            timestamp: new Date()
                        }
                    }
                },
                {
                    new: true
                }
            );
            
            if (!balanceUpdated) {
                return {
                    success: false,
                    message: 'Purchase failed - insufficient funds or balance changed.'
                };
            }
            
            // Step 2: Calculate profits and tips
            const profitData = this.calculateProfits(item, itemPrice, member, channel);
            
            // Step 3: Record sale atomically with duplicate check
            const saleData = {
                purchaseId: purchaseId,
                itemId: item.id,
                itemName: item.name,
                buyer: userId,
                buyerName: member.user.username,
                price: itemPrice,
                profit: profitData.profit,
                tip: profitData.tip,
                timestamp: new Date(),
                isNPC: false
            };
            
            // Add sale to inn records atomically
            const saleRecorded = await ActiveVCs.findOneAndUpdate(
                {
                    channelId: channelId,
                    'gameData.sales.purchaseId': { $ne: purchaseId }
                },
                {
                    $push: { 'gameData.sales': saleData },
                    $set: { 'gameData.lastActivity': new Date() },
                    $inc: { 'gameData.totalUserPurchases': 1 }
                }
            );
            
            if (!saleRecorded) {
                // Rollback: Refund user if sale recording failed
                await this.rollbackPurchase(userId, itemPrice, purchaseId);
                return {
                    success: false,
                    message: 'Purchase failed - could not record sale. Your money has been refunded.'
                };
            }
            
            // Step 4: Handle consumable effects
            if (item.type === 'consumable' || item.subtype === 'food' || item.subtype === 'drink') {
                await this.applyConsumableEffects(member, item, channel);
            }
            
            // Step 5: Generate and send purchase confirmation
            const embed = await this.createPurchaseEmbed(
                member,
                item,
                itemPrice,
                profitData,
                balanceUpdated.money
            );
            
            await channel.send({ embeds: [embed] });
            
            console.log(`[InnPurchase] ${member.user.username} purchased ${item.name} for ${itemPrice}c (Profit: ${profitData.profit}c, Tip: ${profitData.tip}c)`);
            
            return {
                success: true,
                item: item,
                price: itemPrice,
                profit: profitData.profit,
                tip: profitData.tip,
                newBalance: balanceUpdated.money
            };
            
        } catch (error) {
            console.error('[InnPurchase] Error in atomic purchase process:', error);
            
            // Attempt rollback
            await this.rollbackPurchase(userId, itemPrice, purchaseId);
            
            return {
                success: false,
                message: 'Purchase failed due to an error. Your money has been refunded if deducted.'
            };
        }
    }

    /**
     * Rollback purchase in case of failure
     */
    async rollbackPurchase(userId, amount, purchaseId) {
        try {
            // Refund money and remove purchase from history
            await Money.findOneAndUpdate(
                {
                    userId: userId,
                    'purchaseHistory.purchaseId': purchaseId
                },
                {
                    $inc: { money: amount },
                    $pull: { purchaseHistory: { purchaseId: purchaseId } }
                }
            );
            
            console.log(`[InnPurchase] Rolled back purchase ${purchaseId} for user ${userId}`);
        } catch (error) {
            console.error('[InnPurchase] Error during rollback:', error);
        }
    }

    /**
     * Calculate profits and tips
     */
    calculateProfits(item, salePrice, member, channel) {
        // Base profit calculation
        const costBasis = Math.floor(item.value * this.config.ECONOMY.COST_BASIS_MULTIPLIER);
        const baseProfit = salePrice - costBasis;
        
        // Calculate tip based on various factors
        let tipMultiplier = 1.0;
        
        // Voice channel activity bonus
        const voiceChannel = channel.guild.channels.cache.get(channel.id);
        if (voiceChannel && voiceChannel.isVoiceBased()) {
            const membersInVC = voiceChannel.members.filter(m => !m.user.bot).size;
            if (membersInVC > 2) {
                tipMultiplier += 0.1 * Math.log(membersInVC);
            }
        }
        
        // Random generosity
        if (Math.random() < 0.2) { // 20% chance of generous tip
            tipMultiplier += 0.5;
        }
        
        const tip = Math.floor(salePrice * this.config.ECONOMY.TIPS.BASE_PERCENTAGE * tipMultiplier);
        
        return {
            profit: baseProfit,
            tip: tip,
            tipMultiplier: tipMultiplier
        };
    }

    /**
     * Apply consumable effects (placeholder for future implementation)
     */
    async applyConsumableEffects(member, item, channel) {
        // This would apply any stat boosts or effects from consumables
        // For now, just log
        console.log(`[InnPurchase] Applied consumable effects for ${item.name} to ${member.user.username}`);
    }

    /**
     * Create purchase confirmation embed
     */
    async createPurchaseEmbed(member, item, price, profitData, newBalance) {
        const embed = new EmbedBuilder()
            .setTitle('🛍️ Purchase Complete!')
            .setColor(this.config.DISPLAY.COLORS.SUCCESS_GREEN)
            .setDescription(`${member.user.username} purchased **${item.name}**`)
            .addFields(
                { name: 'Price', value: `${price} coins`, inline: true },
                { name: 'Your Balance', value: `${newBalance} coins`, inline: true }
            )
            .setTimestamp();
        
        // Add tip information if applicable
        if (profitData.tip > 0) {
            embed.addFields({
                name: 'Tip Left',
                value: `${profitData.tip} coins (Thank you!)`,
                inline: true
            });
        }
        
        // Add item description if available
        if (item.description) {
            embed.addFields({
                name: 'Item Description',
                value: item.description,
                inline: false
            });
        }
        
        // Try to generate AI flavor text
        try {
            const flavorText = await this.aiManager.generatePurchaseDialogue(
                member.user.username,
                item,
                profitData.tip > 0
            );
            
            if (flavorText) {
                embed.setFooter({ text: flavorText });
            }
        } catch (error) {
            // Silent fail for AI generation
        }
        
        return embed;
    }

    /**
     * Handle bulk purchases with concurrency protection
     */
    async handleBulkPurchase(member, items, channel, dbEntry) {
        const results = [];
        const userId = member.id;
        const channelId = dbEntry.channelId;
        
        // Generate bulk purchase ID
        const bulkId = `bulk-${userId}-${Date.now()}`;
        
        // Check total cost first
        let totalCost = 0;
        const validItems = [];
        
        for (const itemName of items) {
            const item = await this.findItemAtomic(itemName, dbEntry);
            if (item) {
                totalCost += item.value;
                validItems.push(item);
            }
        }
        
        // Check if user can afford bulk purchase
        const userBalance = await Money.findOne({ userId: userId });
        if (!userBalance || userBalance.money < totalCost) {
            return {
                success: false,
                message: `Insufficient funds for bulk purchase! Need ${totalCost} coins, have ${userBalance?.money || 0}.`
            };
        }
        
        // Process each item in the bulk purchase
        for (const item of validItems) {
            const result = await this.handlePurchase(member, item.name, channel, dbEntry);
            results.push({
                item: item.name,
                ...result
            });
        }
        
        return {
            success: true,
            bulkId: bulkId,
            results: results,
            totalCost: totalCost
        };
    }

    /**
     * Get purchase statistics for a user
     */
    async getUserPurchaseStats(userId, channelId) {
        try {
            // Get user's purchase history from Money collection
            const userData = await Money.findOne(
                { userId: userId },
                { purchaseHistory: 1 }
            );
            
            if (!userData || !userData.purchaseHistory) {
                return {
                    totalPurchases: 0,
                    totalSpent: 0,
                    favoriteItem: null,
                    lastPurchase: null
                };
            }
            
            // Calculate statistics
            const purchases = userData.purchaseHistory;
            const totalSpent = purchases.reduce((sum, p) => sum + p.price, 0);
            
            // Find favorite item
            const itemCounts = {};
            purchases.forEach(p => {
                itemCounts[p.itemName] = (itemCounts[p.itemName] || 0) + 1;
            });
            
            const favoriteItem = Object.entries(itemCounts)
                .sort((a, b) => b[1] - a[1])[0];
            
            return {
                totalPurchases: purchases.length,
                totalSpent: totalSpent,
                favoriteItem: favoriteItem ? favoriteItem[0] : null,
                favoriteCount: favoriteItem ? favoriteItem[1] : 0,
                lastPurchase: purchases[purchases.length - 1],
                averagePurchase: Math.floor(totalSpent / purchases.length)
            };
            
        } catch (error) {
            console.error('[InnPurchase] Error getting purchase stats:', error);
            return null;
        }
    }

    /**
     * Clean up old locks (maintenance function)
     */
    cleanupOldLocks() {
        const now = Date.now();
        const timeout = 60000; // 1 minute timeout
        
        for (const [key, timestamp] of this.purchaseLocks.entries()) {
            if (now - timestamp > timeout) {
                this.purchaseLocks.delete(key);
                console.log(`[InnPurchase] Cleaned up stale lock: ${key}`);
            }
        }
        
        // Also clean purchase history
        for (const [key, timestamp] of this.recentPurchases.entries()) {
            if (now - timestamp > 300000) { // 5 minutes
                this.recentPurchases.delete(key);
            }
        }
    }
}

module.exports = InnPurchaseHandler;

// innKeeping/innPurchaseHandler_v2.js
// Enhanced with atomic operations and concurrency protection

const { EmbedBuilder } = require('discord.js');
const Money = require('../../../models/currency');
const ActiveVCs = require('../../../models/activevcs');
const InnConfig = require('./innConfig');
const gachaServers = require('../../../data/gachaServers.json');
const shops = require('../../../data/shops.json');
const itemSheet = require('../../../data/itemSheet.json');
const InnAIManager = require('./innAIManagerIntegrated');

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
        
        // Combine static items with current rotational items from database
        const allItems = [...shopData.staticItems];
        
        // Add rotational items if they exist in the database
        if (dbEntry.gameData?.currentRotationalItems && Array.isArray(dbEntry.gameData.currentRotationalItems)) {
            allItems.push(...dbEntry.gameData.currentRotationalItems);
        }
        
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
                buyerName: member.displayName || member.user.username,  // Use nickname if available
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
            
            // Try to send the message, but don't fail the purchase if it doesn't work
            try {
                await channel.send({ embeds: [embed] });
            } catch (messageError) {
                console.error('[InnPurchase] Failed to send purchase message (purchase still successful):', messageError);
                // Purchase was successful, just couldn't send the log
            }
            
            const displayName = member.displayName || member.user.username;
            console.log(`[InnPurchase] ${displayName} purchased ${item.name} for ${itemPrice}c (Profit: ${profitData.profit}c, Tip: ${profitData.tip}c)`);
            
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
        const displayName = member.displayName || member.user.username;
        const embed = new EmbedBuilder()
            .setTitle('🛍️ Purchase Complete!')
            .setColor(this.config.DISPLAY.COLORS.SUCCESS_GREEN)
            .setDescription(`${displayName} purchased **${item.name}**`)
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
            const displayName = member.displayName || member.user.username;
            const flavorText = await this.aiManager.generatePurchaseDialogue(
                displayName,
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

    // ===== BACKWARD COMPATIBILITY METHODS =====
    // These methods are for compatibility with shopHandler.js

    /**
     * Calculate cost basis for an item (35% of base value for ~65% profit margin)
     * @param {number} baseValue - Base value of the item
     * @param {number} quantity - Quantity being sold (default 1)
     * @returns {number} - Total cost basis
     */
    calculateCostBasis(baseValue, quantity = 1) {
        return Math.floor(baseValue * this.config.ECONOMY.COST_BASIS_MULTIPLIER * quantity);
    }

    /**
     * Check if a channel is an inn channel
     * @param {string} channelId - The channel ID to check
     * @returns {Promise<boolean>} - True if inn channel
     */
    async isInnChannel(channelId) {
        try {
            const vcEntry = await ActiveVCs.findOne({ channelId }).lean();
            if (!vcEntry || !vcEntry.gameData) return false;
            return vcEntry.gameData.gamemode === 'innkeeper';
        } catch (error) {
            console.error('[InnPurchase] Error checking inn channel:', error);
            return false;
        }
    }

    /**
     * Calculate tip based on buyer's luck stat
     * @param {string} buyerId - The Discord ID of the buyer
     * @param {number} salePrice - The base sale price
     * @returns {Promise<Object>} - Tip data with amount and percentage
     */
    async calculateTip(buyerId, salePrice) {
        try {
            // Import here to avoid circular dependency
            const getPlayerStats = require('../../calculatePlayerStat');
            const playerData = await getPlayerStats(buyerId);
            const luckStat = playerData.stats.luck || 0;
            
            // Base tip range is 10-100% but can go higher with luck
            const randomFactor = Math.random();
            const luckBonus = Math.pow(luckStat / 50, 1.5); // Exponential scaling
            
            // Calculate final tip percentage (10% minimum, uncapped maximum)
            let tipPercentage = 10 + (randomFactor * 90 * (1 + luckBonus));
            
            // Very lucky players can get massive tips
            if (luckStat > 100 && Math.random() < 0.1) {
                tipPercentage *= (1 + luckStat / 100);
            }
            
            const tipAmount = Math.floor(salePrice * (tipPercentage / 100));
            
            return {
                amount: tipAmount,
                percentage: Math.round(tipPercentage),
                luckStat: luckStat
            };
        } catch (error) {
            console.error('[InnPurchase] Error calculating tip:', error);
            // Default 10% tip if error
            return {
                amount: Math.floor(salePrice * 0.1),
                percentage: 10,
                luckStat: 0
            };
        }
    }

    /**
     * Process and record an inn sale with tip calculation
     * @param {Object} saleData - Object containing sale information
     * @param {Object} saleData.channel - Discord channel object
     * @param {string} saleData.itemId - Item ID being sold
     * @param {number} saleData.salePrice - Total sale price
     * @param {number} saleData.costBasis - Cost basis for profit calculation
     * @param {Object} saleData.buyer - Discord user object of the buyer
     * @returns {Promise<Object>} - Tip data and success status
     */
    async processInnSale(saleData) {
        try {
            const { channel, itemId, salePrice, costBasis, buyer } = saleData;
            
            // First check if this is actually an inn channel
            const isInn = await this.isInnChannel(channel.id);
            if (!isInn) {
                return { 
                    success: false, 
                    isInn: false,
                    message: 'Not an inn channel' 
                };
            }
            
            // Calculate tip based on buyer's luck stat
            const tipData = await this.calculateTip(buyer.id, salePrice);
            
            // Calculate profit (revenue minus cost basis)
            const profit = salePrice - costBasis;
            // For backward compatibility - try to get display name if buyer is a member object
            const buyerName = buyer.displayName || buyer.username || buyer.tag || 'Unknown';
            
            // Record sale in the database
            const purchaseId = this.generatePurchaseId(buyer.id, itemId, Date.now());
            const saleRecorded = await ActiveVCs.findOneAndUpdate(
                { channelId: channel.id },
                {
                    $push: { 
                        'gameData.sales': {
                            purchaseId: purchaseId,
                            itemId: itemId,
                            buyer: buyer.id,
                            buyerName: buyerName,
                            price: salePrice,
                            profit: profit,
                            tip: tipData.amount,
                            timestamp: new Date()
                        }
                    },
                    $set: { 'gameData.lastActivity': new Date() },
                    $inc: { 'gameData.totalUserPurchases': 1 }
                }
            );
            
            if (!saleRecorded) {
                console.error('[InnPurchase] Failed to record sale');
                return { 
                    success: false, 
                    isInn: true,
                    message: 'Failed to record sale' 
                };
            }
            
            console.log(`[InnPurchase] Recorded sale - Item: ${itemId}, Revenue: ${salePrice}, Cost: ${costBasis}, Profit: ${profit} (${(profit/salePrice*100).toFixed(1)}% margin), Tip: ${tipData.amount} (${tipData.percentage}%), Buyer: ${buyerName} (${buyer.id})`);
            
            return {
                success: true,
                isInn: true,
                tipData: tipData,
                profit: profit,
                totalRevenue: salePrice + tipData.amount
            };
        } catch (error) {
            console.error('[InnPurchase] Error processing inn sale:', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * Format a tip message for display
     * @param {Object} tipData - Tip data from calculateTip
     * @returns {string} - Formatted message string
     */
    formatTipMessage(tipData) {
        if (!tipData || tipData.amount <= 0) return '';
        
        // Add flavor text based on tip percentage
        let flavorText = '';
        if (tipData.percentage >= 200) {
            flavorText = '🤑 LEGENDARY tip!';
        } else if (tipData.percentage >= 100) {
            flavorText = '💎 Extremely generous!';
        } else if (tipData.percentage >= 75) {
            flavorText = '✨ Very generous!';
        } else if (tipData.percentage >= 50) {
            flavorText = '😊 Generous!';
        } else if (tipData.percentage >= 25) {
            flavorText = '👍 Nice!';
        } else {
            flavorText = '';
        }
        
        return `💝 **Tip Added:** ${tipData.amount} coins (${tipData.percentage}%) ${flavorText}`.trim();
    }
}

module.exports = InnPurchaseHandler;

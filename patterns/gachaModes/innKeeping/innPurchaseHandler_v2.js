// innKeeping/innPurchaseHandler_v2.js
// Centralized purchase handling for inn sales

const InnKeeperSales = require('./innKeeperSales');
const InnConfig = require('./innConfig');
const InnAIManager = require('./innAIManager');
const getPlayerStats = require('../../calculatePlayerStat');
const ActiveVCs = require('../../../models/activevcs');

class InnPurchaseHandler {
    constructor() {
        this.config = InnConfig;
        this.aiManager = new InnAIManager();
    }

    /**
     * Check if a channel is an inn channel
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
     * Process an inn sale from a player
     */
    async processInnSale(saleData) {
        try {
            const { channel, itemId, salePrice, costBasis, buyer, quantity = 1 } = saleData;
            
            // Verify this is an inn channel
            const isInn = await this.isInnChannel(channel.id);
            if (!isInn) {
                return { 
                    success: false, 
                    isInn: false,
                    message: 'Not an inn channel' 
                };
            }
            
            // Get the database entry
            const dbEntry = await ActiveVCs.findOne({ channelId: channel.id });
            if (!dbEntry) {
                return {
                    success: false,
                    isInn: true,
                    message: 'No active VC entry found'
                };
            }
            
            // Calculate tip
            const tipData = await this.calculateTip(buyer.id, salePrice);
            
            // Calculate profit
            const profit = salePrice - costBasis;
            const buyerName = buyer.username || buyer.tag || 'Unknown';
            
            // Create sale record
            const saleRecord = {
                itemId,
                profit,
                buyer: buyer.id,
                buyerName,
                price: salePrice,
                tip: tipData.amount,
                timestamp: new Date(),
                isNPC: false,
                quantity
            };
            
            // Add to gameData sales
            if (!dbEntry.gameData.sales) {
                dbEntry.gameData.sales = [];
            }
            dbEntry.gameData.sales.push(saleRecord);
            
            // Update last activity
            dbEntry.gameData.lastActivity = new Date();
            
            // Save to database
            dbEntry.markModified('gameData');
            await dbEntry.save();
            
            console.log(`[InnPurchase] Recorded player sale - Item: ${itemId}, Qty: ${quantity}, ` +
                       `Revenue: ${salePrice}, Profit: ${profit}, Tip: ${tipData.amount}, Buyer: ${buyerName}`);
            
            return {
                success: true,
                isInn: true,
                tipData,
                profit,
                totalRevenue: salePrice + tipData.amount,
                saleRecord
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
     * Calculate tip based on buyer's luck stat
     */
    async calculateTip(buyerId, salePrice) {
        try {
            const playerData = await getPlayerStats(buyerId);
            const luckStat = playerData.stats.luck || 0;
            
            const tipConfig = this.config.ECONOMY.TIPS.PLAYER_LUCK_SCALING;
            
            // Calculate tip percentage based on luck
            const randomFactor = Math.random();
            const luckBonus = Math.pow(luckStat / 50, tipConfig.LUCK_EXPONENT);
            
            // Calculate final tip percentage
            let tipPercentage = tipConfig.BASE_MIN + (randomFactor * (tipConfig.BASE_MAX - tipConfig.BASE_MIN) * (1 + luckBonus));
            
            // Massive tips for very lucky players
            if (luckStat > tipConfig.MASSIVE_TIP_THRESHOLD && Math.random() < tipConfig.MASSIVE_TIP_CHANCE) {
                tipPercentage *= (1 + luckStat / 100);
            }
            
            const tipAmount = Math.floor(salePrice * (tipPercentage / 100));
            
            return {
                amount: tipAmount,
                percentage: Math.round(tipPercentage),
                luckStat
            };
            
        } catch (error) {
            console.error('[InnPurchase] Error calculating tip:', error);
            // Default 10% tip on error
            return {
                amount: Math.floor(salePrice * 0.1),
                percentage: 10,
                luckStat: 0
            };
        }
    }

    /**
     * Calculate cost basis for an item
     */
    calculateCostBasis(baseValue, quantity = 1) {
        return Math.floor(baseValue * this.config.ECONOMY.COST_BASIS_MULTIPLIER * quantity);
    }

    /**
     * Format tip message for display
     */
    formatTipMessage(tipData) {
        if (!tipData || tipData.amount <= 0) return '';
        
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
        }
        
        return `💝 **Tip Added:** ${tipData.amount} coins (${tipData.percentage}%) ${flavorText}`.trim();
    }

    /**
     * Handle bulk purchase (multiple items)
     */
    async processBulkPurchase(channel, purchases, buyer) {
        const results = [];
        let totalTips = 0;
        let totalProfit = 0;
        
        for (const purchase of purchases) {
            const result = await this.processInnSale({
                channel,
                itemId: purchase.itemId,
                salePrice: purchase.salePrice,
                costBasis: purchase.costBasis,
                buyer,
                quantity: purchase.quantity
            });
            
            if (result.success) {
                totalTips += result.tipData.amount;
                totalProfit += result.profit;
            }
            
            results.push(result);
        }
        
        return {
            results,
            totalTips,
            totalProfit,
            success: results.every(r => r.success)
        };
    }
}

module.exports = InnPurchaseHandler;

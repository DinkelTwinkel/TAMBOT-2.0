// Inn Purchase Handler - Handles inn-specific purchase logic including tips
const InnKeeperSales = require('./innKeeperSales');
const InnEventLog = require('./innEventLog');
const getPlayerStats = require('../../calculatePlayerStat');
const ActiveVCs = require('../../../models/activevcs');

class InnPurchaseHandler {
    /**
     * Calculate tip based on buyer's luck stat
     * @param {string} buyerId - The Discord ID of the buyer
     * @param {number} salePrice - The base sale price
     * @returns {Promise<Object>} - Tip data with amount and percentage
     */
    static async calculateTip(buyerId, salePrice) {
        try {
            const playerData = await getPlayerStats(buyerId);
            const luckStat = playerData.stats.luck || 0;
            
            // Base tip range is 10-100% but can go higher with luck
            // Higher luck = higher chance of bigger tips
            // Luck 0 = mostly 10-20% tips
            // Luck 100 = can get 100%+ tips more often
            // Luck 200+ = can get massive tips (200%+)
            
            // Calculate tip percentage based on luck
            const randomFactor = Math.random();
            const luckBonus = Math.pow(luckStat / 50, 1.5); // Exponential scaling
            
            // Calculate final tip percentage (10% minimum, uncapped maximum)
            let tipPercentage = 10 + (randomFactor * 90 * (1 + luckBonus));
            
            // Very lucky players can get massive tips
            if (luckStat > 100 && Math.random() < 0.1) {
                tipPercentage *= (1 + luckStat / 100); // Double or more for very lucky players
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
     * Check if a channel is an inn channel
     * @param {string} channelId - The channel ID to check
     * @returns {Promise<boolean>} - True if inn channel
     */
    static async isInnChannel(channelId) {
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
     * Process and record an inn sale with tip calculation
     * @param {Object} saleData - Object containing sale information
     * @param {Object} saleData.channel - Discord channel object
     * @param {string} saleData.itemId - Item ID being sold
     * @param {number} saleData.salePrice - Total sale price (can be for multiple items)
     * @param {number} saleData.costBasis - Cost basis for profit calculation
     * @param {Object} saleData.buyer - Discord user object of the buyer
     * @returns {Promise<Object>} - Tip data and success status
     */
    static async processInnSale(saleData) {
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
            const buyerName = buyer.username || buyer.tag || 'Unknown';
            
            // Record sale with tip
            const recorded = await InnKeeperSales.recordSale(
                channel.id, 
                itemId, 
                profit, 
                buyer.id, 
                buyerName,
                salePrice,  // actual sale price
                tipData.amount  // tip amount
            );
            
            if (!recorded) {
                console.error('[InnPurchase] Failed to record sale');
                return { 
                    success: false, 
                    isInn: true,
                    message: 'Failed to record sale' 
                };
            }
            
            console.log(`[InnPurchase] Recorded sale - Item: ${itemId}, Revenue: ${salePrice}, Cost: ${costBasis}, Profit: ${profit} (${(profit/salePrice*100).toFixed(1)}% margin), Tip: ${tipData.amount} (${tipData.percentage}%), Buyer: ${buyerName} (${buyer.id})`);
            
            // Update the event log with the latest purchase
            const dbEntry = await ActiveVCs.findOne({ channelId: channel.id });
            if (dbEntry) {
                await InnEventLog.postOrUpdateEventLog(channel, dbEntry);
            }
            
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
    static formatTipMessage(tipData) {
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

    /**
     * Calculate cost basis for an item (35% of base value for ~65% profit margin)
     * @param {number} baseValue - Base value of the item
     * @param {number} quantity - Quantity being sold
     * @returns {number} - Total cost basis
     */
    static calculateCostBasis(baseValue, quantity = 1) {
        const InnConfig = require('../innKeeping/innConfig');
        return Math.floor(baseValue * InnConfig.ECONOMY.COST_BASIS_MULTIPLIER * quantity);
    }
}

module.exports = InnPurchaseHandler;

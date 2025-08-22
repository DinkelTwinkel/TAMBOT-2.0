// Helper functions for managing Inn Keeper sales data
const ActiveVCs = require('../../../models/activevcs');

class InnKeeperSales {
    /**
     * Add a new sale to the inn keeper's records
     * @param {string} channelId - The channel ID of the inn
     * @param {string} itemId - The ID of the item sold
     * @param {number} profit - The profit from the sale
     * @param {string} buyerId - The Discord ID of the buyer
     * @param {string} buyerName - Optional username of the buyer
     * @param {number} price - The actual sale price
     * @param {number} tip - The tip amount
     * @returns {Promise<boolean>} - Success status
     */
    static async recordSale(channelId, itemId, profit, buyerId, buyerName = null, price = 0, tip = 0) {
        try {
            const dbEntry = await ActiveVCs.findOne({ channelId: channelId });
            
            if (!dbEntry) {
                console.error(`[InnKeeperSales] No active VC found for channel ${channelId}`);
                return false;
            }

            // Verify this is an inn channel
            if (!dbEntry.gameData || dbEntry.gameData.gamemode !== 'innkeeper') {
                console.error(`[InnKeeperSales] Channel ${channelId} is not an inn keeper channel`);
                return false;
            }

            // Initialize gameData if needed
            if (!dbEntry.gameData) {
                dbEntry.gameData = { sales: [] };
            } else if (!dbEntry.gameData.sales) {
                dbEntry.gameData.sales = [];
            }

            // Add the sale
            const saleRecord = {
                itemId: itemId,
                profit: profit,
                buyer: buyerId,
                price: price,
                tip: tip,
                timestamp: new Date()
            };
            
            // Include buyer name if provided
            if (buyerName) {
                saleRecord.buyerName = buyerName;
            }
            
            dbEntry.gameData.sales.push(saleRecord);

            // Mark as modified and save
            dbEntry.markModified('gameData');
            await dbEntry.save();

            console.log(`[InnKeeperSales] Recorded sale: Item ${itemId} sold to ${buyerId} for ${profit} profit (tip: ${tip})`);
            return true;
        } catch (error) {
            console.error('[InnKeeperSales] Error recording sale:', error);
            return false;
        }
    }

    /**
     * Get total sales for an inn
     * @param {string} channelId - The channel ID of the inn
     * @returns {Promise<Array>} - Array of sales
     */
    static async getSales(channelId) {
        try {
            const dbEntry = await ActiveVCs.findOne({ channelId: channelId });
            
            if (!dbEntry || !dbEntry.gameData || !dbEntry.gameData.sales) {
                return [];
            }

            return dbEntry.gameData.sales;
        } catch (error) {
            console.error('[InnKeeperSales] Error getting sales:', error);
            return [];
        }
    }

    /**
     * Get total profit for an inn
     * @param {string} channelId - The channel ID of the inn
     * @returns {Promise<number>} - Total profit
     */
    static async getTotalProfit(channelId) {
        try {
            const sales = await this.getSales(channelId);
            return sales.reduce((total, sale) => total + (sale.profit || 0), 0);
        } catch (error) {
            console.error('[InnKeeperSales] Error calculating total profit:', error);
            return 0;
        }
    }

    /**
     * Get sales by a specific buyer
     * @param {string} channelId - The channel ID of the inn
     * @param {string} buyerId - The Discord ID of the buyer
     * @returns {Promise<Array>} - Array of sales by this buyer
     */
    static async getSalesByBuyer(channelId, buyerId) {
        try {
            const sales = await this.getSales(channelId);
            return sales.filter(sale => sale.buyer === buyerId);
        } catch (error) {
            console.error('[InnKeeperSales] Error getting sales by buyer:', error);
            return [];
        }
    }

    /**
     * Get top buyers by number of purchases
     * @param {string} channelId - The channel ID of the inn
     * @param {number} limit - Number of top buyers to return
     * @returns {Promise<Array>} - Array of {buyerId, purchaseCount, totalSpent}
     */
    static async getTopBuyers(channelId, limit = 10) {
        try {
            const sales = await this.getSales(channelId);
            
            // Group sales by buyer
            const buyerStats = {};
            sales.forEach(sale => {
                if (!buyerStats[sale.buyer]) {
                    buyerStats[sale.buyer] = {
                        buyerId: sale.buyer,
                        purchaseCount: 0,
                        totalSpent: 0
                    };
                }
                buyerStats[sale.buyer].purchaseCount++;
                buyerStats[sale.buyer].totalSpent += (sale.profit || 0);
            });

            // Convert to array and sort by purchase count
            const topBuyers = Object.values(buyerStats)
                .sort((a, b) => b.purchaseCount - a.purchaseCount)
                .slice(0, limit);

            return topBuyers;
        } catch (error) {
            console.error('[InnKeeperSales] Error getting top buyers:', error);
            return [];
        }
    }

    /**
     * Clear all sales data for an inn (use with caution!)
     * @param {string} channelId - The channel ID of the inn
     * @returns {Promise<boolean>} - Success status
     */
    static async clearSales(channelId) {
        try {
            const dbEntry = await ActiveVCs.findOne({ channelId: channelId });
            
            if (!dbEntry) {
                return false;
            }

            if (!dbEntry.gameData) {
                dbEntry.gameData = {};
            }
            
            dbEntry.gameData.sales = [];
            dbEntry.markModified('gameData');
            await dbEntry.save();

            console.log(`[InnKeeperSales] Cleared all sales for channel ${channelId}`);
            return true;
        } catch (error) {
            console.error('[InnKeeperSales] Error clearing sales:', error);
            return false;
        }
    }
}

module.exports = InnKeeperSales;

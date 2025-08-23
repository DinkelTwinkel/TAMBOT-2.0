// FINAL FALLBACK FIX
// If you're still getting errors, replace the import in mining_optimized_v5_performance.js with this inline version

// Around line 111, replace:
// const { getMinecartSummaryFresh } = require('./mining_fixes/fix_minecart_display_simple');

// With this inline function:
async function getMinecartSummaryFresh(channelId) {
    try {
        const gachaVC = require('../../models/activevcs');
        const dbEntry = await gachaVC.findOne({ channelId }).lean();
        
        if (!dbEntry?.gameData?.minecart) {
            return {
                totalValue: 0,
                itemCount: 0,
                contributorCount: 0,
                summary: 'No items yet'
            };
        }
        
        const minecart = dbEntry.gameData.minecart;
        let totalValue = 0;
        let itemCount = 0;
        
        const items = minecart.items || {};
        const contributors = minecart.contributors || {};
        
        for (const [itemId, itemData] of Object.entries(items)) {
            let quantity = typeof itemData === 'number' ? itemData : (itemData?.quantity || 0);
            if (quantity > 0) {
                itemCount += quantity;
                // Try to find item value if pools are available
                try {
                    const { miningItemPool, treasureItems } = require('./mining/miningConstants_unified');
                    const item = miningItemPool.find(i => i.itemId === itemId) || 
                               treasureItems.find(i => i.itemId === itemId);
                    if (item) {
                        totalValue += item.value * quantity;
                    }
                } catch (e) {
                    // Pools not available, continue without value
                }
            }
        }
        
        const contributorCount = Object.keys(contributors).length;
        
        let summary = 'No items yet';
        if (itemCount > 0) {
            summary = `${itemCount} items`;
            if (totalValue > 0) {
                summary += ` worth ${totalValue} coins`;
            }
            if (contributorCount > 0) {
                summary += ` (${contributorCount} contributor${contributorCount !== 1 ? 's' : ''})`;
            }
        }
        
        return { totalValue, itemCount, contributorCount, summary };
        
    } catch (error) {
        console.error(`[MINECART] Error getting summary:`, error);
        return {
            totalValue: 0,
            itemCount: 0,
            contributorCount: 0,
            summary: 'No items yet'
        };
    }
}

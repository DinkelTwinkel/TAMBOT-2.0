// COMPLETE MINECART DISPLAY FIX
// Apply this single change to fix the minecart display issue

// In mining_optimized_v5_performance.js, make these 2 simple changes:

// ==================================
// CHANGE 1: Add this import at the top (after other requires)
// ==================================
const { getMinecartSummaryFresh } = require('./mining_fixes/fix_minecart_display');

// ==================================
// CHANGE 2: In logEvent function (around line 1143), replace this line:
// ==================================
// OLD LINE:
// const minecartSummary = getMinecartSummary(result);

// NEW LINE:
// const minecartSummary = await getMinecartSummaryFresh(channel.id);

// That's it! The minecart will now always show the correct, latest totals.

// ==================================
// OPTIONAL: Enhanced getMinecartSummary for miningUtils.js
// ==================================
// If you also want to improve the existing function, replace getMinecartSummary in miningUtils.js with:

function getMinecartSummary(dbEntry) {
    try {
        const minecart = dbEntry?.gameData?.minecart || { items: {}, contributors: {} };
        
        if (!minecart.items) minecart.items = {};
        if (!minecart.contributors) minecart.contributors = {};
        
        let totalValue = 0;
        let itemCount = 0;
        
        for (const [itemId, itemData] of Object.entries(minecart.items)) {
            // Handle both formats: direct number or object with quantity
            let quantity = typeof itemData === 'number' ? itemData : (itemData?.quantity || 0);
            
            if (quantity > 0) {
                itemCount += quantity;
                const item = miningItemPool.find(i => i.itemId === itemId) || 
                           treasureItems.find(i => i.itemId === itemId);
                if (item) {
                    totalValue += item.value * quantity;
                }
            }
        }
        
        const contributorCount = Object.keys(minecart.contributors).length;
        
        let summary = 'No items yet';
        if (itemCount > 0) {
            summary = `${itemCount} items worth ${totalValue} coins`;
            if (contributorCount > 0) {
                summary += ` (${contributorCount} contributor${contributorCount !== 1 ? 's' : ''})`;
            }
        }
        
        return { totalValue, itemCount, contributorCount, summary };
    } catch (error) {
        console.error('[MINECART] Error:', error);
        return { totalValue: 0, itemCount: 0, contributorCount: 0, summary: 'No items yet' };
    }
}

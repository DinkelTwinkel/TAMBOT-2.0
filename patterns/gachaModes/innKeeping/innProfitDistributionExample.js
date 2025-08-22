// Test file to demonstrate the Inn Keeper Profit Distribution System
// This shows how the profit distribution works every 10 minutes

/**
 * PROFIT DISTRIBUTION EXAMPLE
 * 
 * Scenario: 4 members in the voice channel (Alice, Bob, Charlie, Diana)
 * Sales in the last 10 minutes:
 * 
 * Sale 1: Alice buys Sword for 100 coins (profit: 50 coins)
 *   - Distribution: Bob, Charlie, Diana each get 16 coins (50/3 = 16.66, rounded down)
 * 
 * Sale 2: Bob buys Potion for 30 coins (profit: 15 coins)
 *   - Distribution: Alice, Charlie, Diana each get 5 coins (15/3 = 5)
 * 
 * Sale 3: External user buys Shield for 200 coins (profit: 100 coins)
 *   - Distribution: Alice, Bob, Charlie, Diana each get 25 coins (100/4 = 25)
 * 
 * FINAL EARNINGS:
 * - Alice: 5 + 25 = 30 coins (didn't get profit from her own purchase)
 * - Bob: 16 + 25 = 41 coins (didn't get profit from his own purchase)
 * - Charlie: 16 + 5 + 25 = 46 coins
 * - Diana: 16 + 5 + 25 = 46 coins
 * 
 * Total distributed: 163 coins (some coins lost to rounding)
 */

// Sample code showing the distribution logic
function distributeProfitExample() {
    // Sample sales data
    const sales = [
        { itemId: 'sword', profit: 50, buyer: 'alice_id' },
        { itemId: 'potion', profit: 15, buyer: 'bob_id' },
        { itemId: 'shield', profit: 100, buyer: 'external_id' }
    ];
    
    // Members in voice channel
    const membersInVC = ['alice_id', 'bob_id', 'charlie_id', 'diana_id'];
    
    // Initialize earnings
    const earnings = {};
    membersInVC.forEach(id => earnings[id] = 0);
    
    // Distribute each sale's profit
    for (const sale of sales) {
        // Exclude the buyer from receiving profit from their own purchase
        const eligibleMembers = membersInVC.filter(id => id !== sale.buyer);
        
        if (eligibleMembers.length > 0) {
            const profitPerMember = Math.floor(sale.profit / eligibleMembers.length);
            
            eligibleMembers.forEach(memberId => {
                earnings[memberId] += profitPerMember;
            });
            
            console.log(`Sale of ${sale.itemId}: ${sale.profit} profit split among ${eligibleMembers.length} members (${profitPerMember} each)`);
        }
    }
    
    // Display final earnings
    console.log('\nFinal Earnings:');
    for (const [member, amount] of Object.entries(earnings)) {
        console.log(`${member}: ${amount} coins`);
    }
    
    return earnings;
}

/**
 * PROFIT DISTRIBUTION TIMELINE
 * 
 * Time 0:00 - Inn opens, no sales yet
 * Time 0:05 - First customer buys item (profit recorded)
 * Time 0:08 - Second customer buys item (profit recorded)
 * Time 0:10 - DISTRIBUTION EVENT:
 *   1. Check all sales in gameData.sales
 *   2. Calculate total profit
 *   3. Get current VC members
 *   4. Split profit (excluding self-purchases)
 *   5. Award coins to each member
 *   6. Post Inn Working Summary embed
 *   7. Clear sales array
 *   8. Update lastProfitDistribution timestamp
 * 
 * Time 0:15 - New customer buys item (starts new period)
 * Time 0:20 - DISTRIBUTION EVENT (repeats process)
 */

/**
 * INN WORKING SUMMARY EMBED EXAMPLE
 * 
 * Title: 🏪 Inn Working Summary
 * Description: Profits have been distributed to inn workers!
 * 
 * 📊 Sales Report
 * Total Sales: 3
 * Total Profit: 165 coins
 * 
 * 💰 Worker Earnings
 * @Charlie earned 46 coins
 * @Diana earned 46 coins
 * @Bob earned 41 coins
 * @Alice earned 30 coins
 * 
 * ⭐ Best Sale
 * Item: shield | Profit: 100 coins
 */

module.exports = {
    distributeProfitExample
};

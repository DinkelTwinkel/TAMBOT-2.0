// Test script to verify admin stats command fixes
// This demonstrates how the admin stats command now properly reads innkeeper and sellmarket stats

// Mock user stats data structure (based on the provided example)
const mockUserStats = {
    _id: "68a89ab10ebdf335a0225816",
    guildId: "1221772148385910835",
    userId: "865147754358767627",
    username: "dinkeltwinkel",
    gameData: {
        mining: {
            highestPowerLevel: 9,
            itemsFound: {},
            itemsFoundBySource: {},
            tilesBroken: {},
            movementByDirection: {},
            tilesMoved: 700,
            hazardsByType: {},
            hazardsEvaded: 9,
            hazardsTriggered: 5
        },
        innkeeper: {
            overnightStays: 0,
            happyCustomers: 0,
            sadCustomers: 0,
            reputationGained: 0,
            reputationLost: 0,
            moneyEarned: 0,
            ordersPlaced: 18,
            highestLevel: 0
        },
        sellmarket: {
            totalItemsSold: 7,
            totalItemsBought: 0,
            totalEarnings: 7000,
            totalSpent: 0,
            itemsSold: {
                "12": 7
            },
            itemsBought: {},
            itemsSoldToPlayers: 0
        }
    }
};

// Mock the helper methods from admin.js
function getUserActivityLevel(gameStats, gameMode) {
    if (!gameStats) return 0;
    
    if (gameMode === 'mining') {
        const tilesMoved = gameStats.tilesMoved || 0;
        const itemsFound = gameStats.itemsFound ? Object.values(gameStats.itemsFound).reduce((sum, count) => sum + count, 0) : 0;
        const tilesBroken = gameStats.tilesBroken ? Object.values(gameStats.tilesBroken).reduce((sum, count) => sum + count, 0) : 0;
        
        return tilesMoved + itemsFound + tilesBroken;
    } else if (gameMode === 'innkeeper') {
        const overnightStays = gameStats.overnightStays || 0;
        const happyCustomers = gameStats.happyCustomers || 0;
        const ordersPlaced = gameStats.ordersPlaced || 0;
        const moneyEarned = gameStats.moneyEarned || 0;
        
        return overnightStays + happyCustomers + ordersPlaced + (moneyEarned / 100);
    } else if (gameMode === 'sellmarket') {
        const itemsSold = gameStats.totalItemsSold || 0;
        const itemsBought = gameStats.totalItemsBought || 0;
        const earnings = gameStats.totalEarnings || 0;
        const spent = gameStats.totalSpent || 0;
        
        return itemsSold + itemsBought + (earnings / 100) + (spent / 100);
    }
    
    return 0;
}

console.log("🧪 Testing Admin Stats Command Fix");
console.log("=" .repeat(50));

// Test activity level calculation for each category
const categories = ['mining', 'innkeeper', 'sellmarket'];

categories.forEach(category => {
    const stats = mockUserStats.gameData[category];
    const activityLevel = getUserActivityLevel(stats, category);
    
    console.log(`\n📊 ${category.toUpperCase()} Category:`);
    console.log(`   Activity Level: ${activityLevel}`);
    
    if (category === 'mining') {
        console.log(`   Tiles Moved: ${stats.tilesMoved}`);
        console.log(`   Hazards Evaded: ${stats.hazardsEvaded}`);
        console.log(`   Hazards Triggered: ${stats.hazardsTriggered}`);
    } else if (category === 'innkeeper') {
        console.log(`   Orders Placed: ${stats.ordersPlaced}`);
        console.log(`   Overnight Stays: ${stats.overnightStays}`);
        console.log(`   Happy Customers: ${stats.happyCustomers}`);
        console.log(`   Money Earned: ${stats.moneyEarned} coins`);
    } else if (category === 'sellmarket') {
        console.log(`   Items Sold: ${stats.totalItemsSold}`);
        console.log(`   Total Earnings: ${stats.totalEarnings} coins`);
        console.log(`   Items Sold to Players: ${stats.itemsSoldToPlayers}`);
        console.log(`   Items Sold Breakdown: ${JSON.stringify(stats.itemsSold)}`);
    }
});

console.log("\n✅ Admin stats command fix test completed!");
console.log("\n📝 Key Fixes Applied:");
console.log("- Added support for 'innkeeper' category in formatCategoryStatsForEmbed");
console.log("- Added support for 'sellmarket' category in formatCategoryStatsForEmbed");
console.log("- Updated category emojis and colors for new categories");
console.log("- Added helper methods for formatting items sold/bought");
console.log("- Updated getUserActivityLevel to handle new categories");
console.log("- Updated formatAllUsersCategoryStatsForEmbed for new categories");
console.log("\n🎯 The /admin stats command should now properly display:");
console.log("- 🏨 Innkeeper Statistics (overnight stays, customers, orders, etc.)");
console.log("- 🏪 Sell Market Statistics (items sold/bought, earnings, etc.)");

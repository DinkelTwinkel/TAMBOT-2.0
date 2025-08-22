// Standalone test script for unique item rolling
// Run with: node test_unique_drops.js

const path = require('path');

// Mock Discord.js objects for testing
const mockMember = {
    id: 'test_user_123',
    user: {
        tag: 'TestUser#1234'
    },
    displayName: 'TestUser'
};

// Import the rolling functions
const { 
    rollForItemFind,
    initializeUniqueItems
} = require('./patterns/uniqueItemFinding');

const { 
    UNIQUE_ITEMS,
    getAvailableUniqueItems,
    calculateUniqueItemDropWeights
} = require('./data/uniqueItemsSheet');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};

async function testUniqueDrops() {
    console.log(colors.cyan + colors.bright + '\n🎲 UNIQUE ITEM DROP TESTING SUITE 🎲' + colors.reset);
    console.log('=' .repeat(50));
    
    // Test parameters
    const testConfigs = [
        { powerLevel: 1, luckStat: 0, rolls: 100, name: 'Low Level, No Luck' },
        { powerLevel: 3, luckStat: 10, rolls: 100, name: 'Mid Level, Some Luck' },
        { powerLevel: 5, luckStat: 50, rolls: 100, name: 'High Level, High Luck' },
        { powerLevel: 7, luckStat: 100, rolls: 100, name: 'Max Level, Max Luck' }
    ];
    
    // Initialize unique items in database
    console.log(colors.yellow + '\n📦 Initializing unique items database...' + colors.reset);
    await initializeUniqueItems();
    console.log(colors.green + '✅ Database initialized\n' + colors.reset);
    
    // Run tests for each configuration
    for (const config of testConfigs) {
        console.log(colors.blue + colors.bright + `\n🔧 Test: ${config.name}` + colors.reset);
        console.log(`   Power Level: ${config.powerLevel}`);
        console.log(`   Luck Stat: ${config.luckStat}`);
        console.log(`   Rolls: ${config.rolls}`);
        console.log('-'.repeat(40));
        
        // Show available items at this power level
        const availableItems = getAvailableUniqueItems(config.powerLevel);
        console.log(colors.cyan + `\n📋 Available Unique Items (${availableItems.length}):` + colors.reset);
        
        // Calculate drop weights
        const weights = calculateUniqueItemDropWeights(config.powerLevel);
        const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
        
        for (const w of weights) {
            const percentage = ((w.weight / totalWeight) * 100).toFixed(2);
            const bar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2));
            console.log(`   ${w.item.name.padEnd(25)} [${bar}] ${percentage}%`);
        }
        
        // Perform rolls
        const results = {
            unique: {},
            regular: {},
            nothing: 0,
            total: config.rolls
        };
        
        console.log(colors.yellow + `\n🎰 Rolling ${config.rolls} times...` + colors.reset);
        
        for (let i = 0; i < config.rolls; i++) {
            // Create unique test IDs for each roll to avoid ownership conflicts
            const testMember = {
                ...mockMember,
                id: `test_user_${Date.now()}_${i}`,
                user: {
                    ...mockMember.user,
                    tag: `TestUser_${i}#1234`
                }
            };
            
            const result = await rollForItemFind(
                testMember.id,
                testMember.user.tag,
                config.powerLevel,
                config.luckStat,
                'mining',
                null,
                'test_guild_123'
            );
            
            if (!result) {
                results.nothing++;
            } else if (result.type === 'unique') {
                results.unique[result.item.name] = (results.unique[result.item.name] || 0) + 1;
            } else {
                results.regular[result.item.name] = (results.regular[result.item.name] || 0) + 1;
            }
            
            // Progress indicator
            if ((i + 1) % 10 === 0) {
                process.stdout.write(`\r   Progress: ${i + 1}/${config.rolls} (${Math.floor((i + 1) / config.rolls * 100)}%)`);
            }
        }
        
        console.log('\r   ' + colors.green + `✅ Completed ${config.rolls} rolls` + colors.reset);
        
        // Display results
        console.log(colors.magenta + '\n📊 Results:' + colors.reset);
        
        const uniqueCount = Object.values(results.unique).reduce((a, b) => a + b, 0);
        const regularCount = Object.values(results.regular).reduce((a, b) => a + b, 0);
        
        console.log(`   No drops: ${results.nothing} (${(results.nothing / config.rolls * 100).toFixed(2)}%)`);
        console.log(`   Regular items: ${regularCount} (${(regularCount / config.rolls * 100).toFixed(2)}%)`);
        console.log(`   Unique items: ${uniqueCount} (${(uniqueCount / config.rolls * 100).toFixed(2)}%)`);
        
        if (uniqueCount > 0) {
            console.log(colors.yellow + '\n   🌟 Unique Items Found:' + colors.reset);
            const sortedUniques = Object.entries(results.unique)
                .sort((a, b) => b[1] - a[1]);
            
            for (const [name, count] of sortedUniques) {
                const item = UNIQUE_ITEMS.find(i => i.name === name);
                const dropRate = (count / config.rolls * 100).toFixed(3);
                console.log(`      ${colors.bright}${name}${colors.reset}: ${count}x (${dropRate}%) - Weight: ${item.dropWeight}`);
            }
        }
        
        if (Object.keys(results.regular).length > 0) {
            console.log(colors.blue + '\n   📦 Regular Items (Top 5):' + colors.reset);
            const sortedRegular = Object.entries(results.regular)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            
            for (const [name, count] of sortedRegular) {
                console.log(`      ${name}: ${count}x`);
            }
        }
        
        console.log('\n' + '='.repeat(50));
    }
    
    // Final statistics
    console.log(colors.cyan + colors.bright + '\n📈 TESTING COMPLETE' + colors.reset);
    console.log('Review the results above to verify drop rates are working as expected.');
    console.log('\nTo increase drop rates for testing, modify:');
    console.log('1. dropWeight values in uniqueItemsSheet.js');
    console.log('2. The random check thresholds in uniqueItemFinding.js');
    console.log('3. ITEM_FINDING_CONFIG values if they exist\n');
}

// Handle async errors
testUniqueDrops().catch(error => {
    console.error(colors.red + '❌ Test failed with error:' + colors.reset, error);
    process.exit(1);
});

// Add command line argument parsing for custom tests
if (process.argv.length > 2) {
    const customPowerLevel = parseInt(process.argv[2]);
    const customLuck = parseInt(process.argv[3]) || 10;
    const customRolls = parseInt(process.argv[4]) || 100;
    
    console.log(colors.yellow + `\n🎯 Running custom test: Power ${customPowerLevel}, Luck ${customLuck}, Rolls ${customRolls}` + colors.reset);
    
    // You can add custom test logic here
}

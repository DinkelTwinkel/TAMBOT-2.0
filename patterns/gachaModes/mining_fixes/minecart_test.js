// Minecart Testing & Verification Tool
// Use this to test and verify minecart functionality

const gachaVC = require('../../../models/activevcs');
const mapCacheSystem = require('../mining/cache/mapCacheSystem');
const { miningItemPool, treasureItems } = require('../mining/miningConstants_unified');
const { getMinecartSummaryFresh } = require('./fix_minecart_display');

class MinecartTester {
    constructor() {
        this.testResults = [];
    }
    
    // Test 1: Check minecart structure
    async testMinecartStructure(channelId) {
        console.log('\n📦 TEST 1: Minecart Structure Check');
        console.log('=' .repeat(40));
        
        try {
            const dbEntry = await gachaVC.findOne({ channelId });
            
            if (!dbEntry) {
                console.log('❌ No database entry found');
                return false;
            }
            
            const checks = {
                'gameData exists': !!dbEntry.gameData,
                'minecart exists': !!dbEntry.gameData?.minecart,
                'items object exists': !!dbEntry.gameData?.minecart?.items,
                'contributors object exists': !!dbEntry.gameData?.minecart?.contributors,
                'items is object': typeof dbEntry.gameData?.minecart?.items === 'object',
                'contributors is object': typeof dbEntry.gameData?.minecart?.contributors === 'object'
            };
            
            let allPassed = true;
            for (const [check, passed] of Object.entries(checks)) {
                console.log(`  ${passed ? '✅' : '❌'} ${check}`);
                if (!passed) allPassed = false;
            }
            
            return allPassed;
            
        } catch (error) {
            console.error('❌ Error:', error.message);
            return false;
        }
    }
    
    // Test 2: Add test items and verify
    async testAddItems(channelId) {
        console.log('\n🎯 TEST 2: Add Items to Minecart');
        console.log('=' .repeat(40));
        
        try {
            // Get initial state
            const initialSummary = await getMinecartSummaryFresh(channelId);
            console.log(`Initial state: ${initialSummary.summary}`);
            
            // Add test items
            const testItems = [
                { itemId: 'copper_ore', amount: 5, playerId: 'test_player_1' },
                { itemId: 'iron_ore', amount: 3, playerId: 'test_player_1' },
                { itemId: 'gold_ore', amount: 2, playerId: 'test_player_2' }
            ];
            
            for (const item of testItems) {
                console.log(`\nAdding ${item.amount}x ${item.itemId} for ${item.playerId}...`);
                
                // Simulate the actual addItemToMinecart function
                await gachaVC.updateOne(
                    { channelId },
                    {
                        $inc: {
                            [`gameData.minecart.items.${item.itemId}.quantity`]: item.amount,
                            [`gameData.minecart.items.${item.itemId}.contributors.${item.playerId}`]: item.amount,
                            [`gameData.minecart.contributors.${item.playerId}`]: item.amount
                        }
                    }
                );
                
                // Get fresh summary after each addition
                const newSummary = await getMinecartSummaryFresh(channelId);
                console.log(`  New state: ${newSummary.summary}`);
            }
            
            // Final verification
            const finalSummary = await getMinecartSummaryFresh(channelId);
            console.log(`\n📊 Final Summary: ${finalSummary.summary}`);
            
            // Verify the counts
            const expectedItems = 10; // 5 + 3 + 2
            const expectedContributors = 2; // test_player_1 and test_player_2
            
            console.log(`\n✅ Verification:`);
            console.log(`  Items: ${finalSummary.itemCount} (expected: ${expectedItems})`);
            console.log(`  Contributors: ${finalSummary.contributorCount} (expected: ${expectedContributors})`);
            console.log(`  Total Value: ${finalSummary.totalValue} coins`);
            
            return finalSummary.itemCount === expectedItems && 
                   finalSummary.contributorCount === expectedContributors;
            
        } catch (error) {
            console.error('❌ Error:', error.message);
            return false;
        }
    }
    
    // Test 3: Cache vs Database consistency
    async testCacheConsistency(channelId) {
        console.log('\n🔄 TEST 3: Cache vs Database Consistency');
        console.log('=' .repeat(40));
        
        try {
            // Get data from database
            const dbEntry = await gachaVC.findOne({ channelId }).lean();
            const dbMinecart = dbEntry?.gameData?.minecart || { items: {}, contributors: {} };
            
            // Get data from cache
            const cachedData = mapCacheSystem.getCachedData(channelId);
            const cacheMinecart = cachedData?.minecart || { items: {}, contributors: {} };
            
            // Compare
            console.log('\n📊 Database Minecart:');
            console.log(`  Items: ${Object.keys(dbMinecart.items).length} types`);
            console.log(`  Contributors: ${Object.keys(dbMinecart.contributors).length} players`);
            
            console.log('\n💾 Cached Minecart:');
            console.log(`  Items: ${Object.keys(cacheMinecart.items).length} types`);
            console.log(`  Contributors: ${Object.keys(cacheMinecart.contributors).length} players`);
            
            // Check if they match
            const itemsMatch = JSON.stringify(dbMinecart.items) === JSON.stringify(cacheMinecart.items);
            const contributorsMatch = JSON.stringify(dbMinecart.contributors) === JSON.stringify(cacheMinecart.contributors);
            
            console.log('\n🔍 Consistency Check:');
            console.log(`  ${itemsMatch ? '✅' : '❌'} Items match`);
            console.log(`  ${contributorsMatch ? '✅' : '❌'} Contributors match`);
            
            if (!itemsMatch || !contributorsMatch) {
                console.log('\n⚠️ Mismatch detected! Forcing cache refresh...');
                mapCacheSystem.clearChannel(channelId);
                await mapCacheSystem.initialize(channelId, true);
                console.log('✅ Cache refreshed');
            }
            
            return itemsMatch && contributorsMatch;
            
        } catch (error) {
            console.error('❌ Error:', error.message);
            return false;
        }
    }
    
    // Test 4: Display accuracy
    async testDisplayAccuracy(channelId) {
        console.log('\n📺 TEST 4: Display Accuracy Test');
        console.log('=' .repeat(40));
        
        try {
            // Get the actual database values
            const dbEntry = await gachaVC.findOne({ channelId }).lean();
            const minecart = dbEntry?.gameData?.minecart || { items: {}, contributors: {} };
            
            // Manually calculate expected values
            let expectedValue = 0;
            let expectedCount = 0;
            
            for (const [itemId, itemData] of Object.entries(minecart.items)) {
                let quantity = typeof itemData === 'number' ? itemData : (itemData?.quantity || 0);
                
                if (quantity > 0) {
                    expectedCount += quantity;
                    
                    // Find item in pools
                    const itemInfo = miningItemPool.find(i => i.itemId === itemId) || 
                                   treasureItems.find(i => i.itemId === itemId);
                    
                    if (itemInfo) {
                        expectedValue += itemInfo.value * quantity;
                        console.log(`  ${itemId}: ${quantity} x ${itemInfo.value} = ${itemInfo.value * quantity} coins`);
                    }
                }
            }
            
            // Get the summary using our function
            const summary = await getMinecartSummaryFresh(channelId);
            
            console.log('\n📊 Comparison:');
            console.log(`  Expected: ${expectedCount} items worth ${expectedValue} coins`);
            console.log(`  Displayed: ${summary.summary}`);
            
            const countsMatch = summary.itemCount === expectedCount;
            const valuesMatch = summary.totalValue === expectedValue;
            
            console.log('\n✅ Accuracy Check:');
            console.log(`  ${countsMatch ? '✅' : '❌'} Item count accurate`);
            console.log(`  ${valuesMatch ? '✅' : '❌'} Value calculation accurate`);
            
            return countsMatch && valuesMatch;
            
        } catch (error) {
            console.error('❌ Error:', error.message);
            return false;
        }
    }
    
    // Run all tests
    async runAllTests(channelId) {
        console.log('\n🚀 MINECART COMPREHENSIVE TEST SUITE');
        console.log('=' .repeat(50));
        console.log(`Channel ID: ${channelId}`);
        console.log('=' .repeat(50));
        
        const results = {
            structure: await this.testMinecartStructure(channelId),
            addItems: await this.testAddItems(channelId),
            consistency: await this.testCacheConsistency(channelId),
            accuracy: await this.testDisplayAccuracy(channelId)
        };
        
        console.log('\n' + '=' .repeat(50));
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('=' .repeat(50));
        
        let passedTests = 0;
        const totalTests = Object.keys(results).length;
        
        for (const [test, passed] of Object.entries(results)) {
            console.log(`  ${passed ? '✅' : '❌'} ${test}`);
            if (passed) passedTests++;
        }
        
        console.log('\n' + '=' .repeat(50));
        console.log(`Overall: ${passedTests}/${totalTests} tests passed`);
        
        if (passedTests === totalTests) {
            console.log('🎉 All tests passed! Minecart is working correctly.');
        } else {
            console.log('⚠️ Some tests failed. Check the details above.');
        }
        
        return results;
    }
    
    // Fix minecart issues
    async fixMinecart(channelId) {
        console.log('\n🔧 FIXING MINECART ISSUES');
        console.log('=' .repeat(40));
        
        try {
            // Step 1: Ensure structure exists
            console.log('1. Ensuring minecart structure...');
            await gachaVC.updateOne(
                { channelId },
                {
                    $set: {
                        'gameData.minecart': { items: {}, contributors: {} }
                    }
                },
                { upsert: true }
            );
            
            // Step 2: Clear and refresh cache
            console.log('2. Clearing and refreshing cache...');
            mapCacheSystem.clearChannel(channelId);
            await mapCacheSystem.initialize(channelId, true);
            
            // Step 3: Verify the fix
            console.log('3. Verifying fix...');
            const summary = await getMinecartSummaryFresh(channelId);
            console.log(`   Current state: ${summary.summary}`);
            
            console.log('\n✅ Minecart fixed!');
            return true;
            
        } catch (error) {
            console.error('❌ Error fixing minecart:', error);
            return false;
        }
    }
}

// CLI interface
if (require.main === module) {
    const command = process.argv[2];
    const channelId = process.argv[3];
    
    const tester = new MinecartTester();
    
    (async () => {
        if (!channelId) {
            console.log('Minecart Testing Tool');
            console.log('====================');
            console.log('Usage:');
            console.log('  node minecart_test.js test <channelId>    - Run all tests');
            console.log('  node minecart_test.js fix <channelId>     - Fix minecart issues');
            console.log('  node minecart_test.js check <channelId>   - Quick check');
            process.exit(1);
        }
        
        switch (command) {
            case 'test':
                await tester.runAllTests(channelId);
                break;
                
            case 'fix':
                await tester.fixMinecart(channelId);
                break;
                
            case 'check':
                const summary = await getMinecartSummaryFresh(channelId);
                console.log(`\nMinecart for channel ${channelId}:`);
                console.log(`  ${summary.summary}`);
                break;
                
            default:
                console.log('Unknown command. Use test, fix, or check.');
        }
        
        process.exit(0);
    })();
}

module.exports = MinecartTester;

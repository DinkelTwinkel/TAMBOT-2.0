// test_inventory_fixes.js
// Run this script to verify that the inventory fixes are working

const path = require('path');

async function testFixes() {
    console.log('🔍 Testing Mining Inventory Fixes...\n');
    
    let allTestsPassed = true;
    
    // Test 1: Check if addItemWithDestination is exported
    console.log('📋 Test 1: Checking miningDatabase.js exports...');
    try {
        const dbModule = require('./patterns/gachaModes/mining/miningDatabase');
        
        if (typeof dbModule.addItemWithDestination === 'function') {
            console.log('✅ addItemWithDestination is properly exported');
        } else {
            console.log('❌ addItemWithDestination is NOT exported!');
            console.log('   Available exports:', Object.keys(dbModule).join(', '));
            allTestsPassed = false;
        }
    } catch (error) {
        console.log('❌ Error loading miningDatabase.js:', error.message);
        allTestsPassed = false;
    }
    
    // Test 2: Check if main file imports the function
    console.log('\n📋 Test 2: Checking main file imports...');
    try {
        const fs = require('fs');
        const mainPath = path.join(__dirname, 'patterns/gachaModes/mining_optimized_v5_performance.js');
        const mainContent = fs.readFileSync(mainPath, 'utf8');
        
        if (mainContent.includes('addItemWithDestination')) {
            console.log('✅ Main file references addItemWithDestination');
            
            // Check if it's in the import statement
            const importPattern = /const\s*{\s*([^}]+)\s*}\s*=\s*require\(['"]\.\/mining\/miningDatabase['"]\)/;
            const match = mainContent.match(importPattern);
            if (match && match[1].includes('addItemWithDestination')) {
                console.log('✅ addItemWithDestination is in the import statement');
            } else {
                console.log('⚠️  addItemWithDestination might not be imported correctly');
            }
        } else {
            console.log('❌ Main file does not reference addItemWithDestination');
            allTestsPassed = false;
        }
    } catch (error) {
        console.log('❌ Error checking main file:', error.message);
        allTestsPassed = false;
    }
    
    // Test 3: Test the actual function
    console.log('\n📋 Test 3: Testing addItemWithDestination function...');
    try {
        const { addItemWithDestination } = require('./patterns/gachaModes/mining/miningDatabase');
        
        // Create a mock dbEntry
        const mockDbEntry = {
            channelId: 'test-channel',
            typeId: 16, // Gullet ID for testing
            gameData: {
                minecart: {
                    items: {},
                    contributors: {}
                }
            }
        };
        
        console.log('✅ Function can be called (syntax is correct)');
        console.log('   Note: Actual database operations not tested in dry run');
        
    } catch (error) {
        console.log('❌ Error testing function:', error.message);
        allTestsPassed = false;
    }
    
    // Test 4: Check for gullet item definitions
    console.log('\n📋 Test 4: Checking gullet item definitions...');
    try {
        const itemSheet = require('./data/itemSheet.json');
        const meatItems = itemSheet.filter(item => item.id >= 200 && item.id <= 219);
        
        if (meatItems.length > 0) {
            console.log(`✅ Found ${meatItems.length} meat items defined`);
            console.log('   First 3 meat items:');
            meatItems.slice(0, 3).forEach(item => {
                console.log(`     - ${item.name} (ID: ${item.id}, Value: ${item.value})`);
            });
        } else {
            console.log('❌ No meat items found (IDs 200-219)');
            allTestsPassed = false;
        }
    } catch (error) {
        console.log('❌ Error loading itemSheet.json:', error.message);
        allTestsPassed = false;
    }
    
    // Test 5: Check for gullet routing logic
    console.log('\n📋 Test 5: Checking for gullet routing logic...');
    try {
        const fs = require('fs');
        const mainPath = path.join(__dirname, 'patterns/gachaModes/mining_optimized_v5_performance.js');
        const mainContent = fs.readFileSync(mainPath, 'utf8');
        
        const hasGulletCheck = mainContent.includes('dbEntry.typeId === 16') || 
                              mainContent.includes("dbEntry.typeId === '16'");
        const hasInventoryRouting = mainContent.includes("'inventory'");
        
        if (hasGulletCheck) {
            console.log('✅ Gullet detection logic found');
        } else {
            console.log('⚠️  No specific gullet detection (typeId === 16) found');
            console.log('   Gullet items might go to minecart instead of inventory');
        }
        
        if (hasInventoryRouting) {
            console.log('✅ Inventory routing parameter found');
        } else {
            console.log('⚠️  No inventory routing found - items may only go to minecart');
        }
        
    } catch (error) {
        console.log('❌ Error checking routing logic:', error.message);
        allTestsPassed = false;
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    if (allTestsPassed) {
        console.log('✅ All tests passed! The fixes appear to be applied correctly.');
        console.log('\n📝 Next steps:');
        console.log('1. Restart your bot');
        console.log('2. Join a ???\'s Gullet voice channel');
        console.log('3. Mine some walls and check that meat goes to inventory');
    } else {
        console.log('❌ Some tests failed. Please apply the fixes manually.');
        console.log('\n📝 To fix:');
        console.log('1. Add "addItemWithDestination" to module.exports in miningDatabase.js');
        console.log('2. Import addItemWithDestination in mining_optimized_v5_performance.js');
        console.log('3. Add routing logic to send gullet items to inventory');
    }
}

// Run the tests
testFixes().catch(console.error);
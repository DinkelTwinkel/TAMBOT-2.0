/**
 * Test script to verify ???'s Gullet meat items work correctly
 * Run this AFTER applying the fix to verify everything is working
 */

const path = require('path');

// Test if the items are properly configured
console.log('========================================');
console.log('???\'s GULLET MEAT ITEMS VERIFICATION');
console.log('========================================\n');

try {
    // Load itemSheet to verify meat items exist
    const itemSheet = require('../../../../data/itemSheet.json');
    
    // Find all meat items (IDs 200-219)
    const meatItems = itemSheet.filter(item => {
        const id = parseInt(item.id);
        return id >= 200 && id <= 219;
    });
    
    console.log(`✅ Found ${meatItems.length} meat items in itemSheet.json:\n`);
    
    meatItems.forEach(item => {
        const icon = item.value >= 100 ? '💎' : item.value >= 50 ? '🥩' : '🍖';
        console.log(`  ${icon} [${item.id}] ${item.name} - Value: ${item.value}`);
    });
    
    // Test if miningConstants has the proper logic
    console.log('\n----------------------------------------');
    console.log('Testing Mining Constants Integration...');
    console.log('----------------------------------------\n');
    
    const miningConstants = require('../miningConstants_unified');
    
    // Check if GULLET_ITEM_POOL exists
    if (miningConstants.GULLET_ITEM_POOL) {
        console.log(`✅ GULLET_ITEM_POOL is defined with ${miningConstants.GULLET_ITEM_POOL.meats.length} meat items`);
    } else {
        console.log('❌ GULLET_ITEM_POOL is not defined in miningConstants_unified.js');
    }
    
    // Test the findItemUnified function
    if (miningConstants.findItemUnified) {
        console.log('\n🧪 Testing item generation for ???\'s Gullet (id: 16)...\n');
        
        // Simulate mining in the gullet
        const gulletId = 16;
        const testRuns = 10;
        const results = {};
        
        for (let i = 0; i < testRuns; i++) {
            const item = miningConstants.findItemUnified('mining_wall', 5, 0, false, false, gulletId);
            results[item.name] = (results[item.name] || 0) + 1;
        }
        
        console.log(`Results from ${testRuns} mining attempts in gullet:`);
        Object.entries(results).forEach(([name, count]) => {
            console.log(`  ${count}x ${name}`);
        });
        
        // Test normal mine for comparison
        console.log('\n📊 Comparison with normal mine (Coal Mine, id: 1):\n');
        
        const normalResults = {};
        for (let i = 0; i < testRuns; i++) {
            const item = miningConstants.findItemUnified('mining_wall', 5, 0, false, false, 1);
            normalResults[item.name] = (normalResults[item.name] || 0) + 1;
        }
        
        console.log(`Results from ${testRuns} mining attempts in normal mine:`);
        Object.entries(normalResults).forEach(([name, count]) => {
            console.log(`  ${count}x ${name}`);
        });
        
        // Verify gullet gives meat, normal gives ore
        const gulletGivesMeat = Object.keys(results).some(name => 
            meatItems.some(meat => meat.name === name)
        );
        const normalGivesOre = !Object.keys(normalResults).some(name => 
            meatItems.some(meat => meat.name === name)
        );
        
        console.log('\n========================================');
        console.log('VERIFICATION RESULTS');
        console.log('========================================\n');
        
        if (gulletGivesMeat && normalGivesOre) {
            console.log('✅ SUCCESS! ???\'s Gullet correctly generates meat items!');
            console.log('✅ Normal mines correctly generate ore items!');
            console.log('\n🎉 The fix is working properly!');
        } else {
            console.log('⚠️  WARNING: The fix may not be working correctly.');
            if (!gulletGivesMeat) {
                console.log('   - Gullet is not generating meat items');
            }
            if (!normalGivesOre) {
                console.log('   - Normal mines are generating meat items (should be ore)');
            }
            console.log('\n📝 Make sure you:');
            console.log('   1. Applied the fix to mining_optimized_v5_performance.js');
            console.log('   2. Restarted your bot');
            console.log('   3. The dbEntry.typeId is properly set to 16 for gullet channels');
        }
    } else {
        console.log('❌ findItemUnified function not found in miningConstants_unified.js');
    }
    
} catch (error) {
    console.error('❌ Error during verification:', error);
    console.log('\n📝 Make sure:');
    console.log('   - You\'re running this from the correct directory');
    console.log('   - All required files exist');
    console.log('   - The fix has been applied');
}

console.log('\n========================================');
console.log('TEST COMPLETE');
console.log('========================================');

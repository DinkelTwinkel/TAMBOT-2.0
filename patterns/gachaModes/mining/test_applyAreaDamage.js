// test_applyAreaDamage.js
// Test file to verify applyAreaDamage always returns integers

const { applyAreaDamage } = require('./uniqueItemBonuses');
const { safeApplyAreaDamage, ensureInteger } = require('./patch_applyAreaDamage_safety');

async function testApplyAreaDamage() {
    console.log('========================================');
    console.log('Testing applyAreaDamage Integer Return');
    console.log('========================================\n');
    
    // Mock data for testing
    const mockPosition = { x: 5, y: 5 };
    const mockMapData = {
        width: 10,
        height: 10,
        tiles: Array(10).fill(null).map(() => Array(10).fill({ type: 0, discovered: false }))
    };
    const mockMember = { 
        id: '123', 
        displayName: 'TestPlayer' 
    };
    const mockEventLogs = [];
    
    const testCases = [
        { 
            name: 'No area damage chance', 
            areaDamageChance: 0,
            expected: 0 
        },
        { 
            name: 'Low area damage chance (likely miss)', 
            areaDamageChance: 0.01,
            expected: 0 
        },
        { 
            name: 'High area damage chance (no walls to break)', 
            areaDamageChance: 1.0,
            expected: 0 
        }
    ];
    
    console.log('Running test cases...\n');
    
    for (const testCase of testCases) {
        console.log(`Test: ${testCase.name}`);
        console.log(`  Area Damage Chance: ${testCase.areaDamageChance}`);
        
        try {
            // Test direct function
            const result = await applyAreaDamage(
                mockPosition,
                mockMapData,
                testCase.areaDamageChance,
                mockMember,
                mockEventLogs
            );
            
            console.log(`  Direct Result: ${result}`);
            console.log(`  Is Integer: ${Number.isInteger(result)}`);
            console.log(`  Type: ${typeof result}`);
            
            // Test safe wrapper
            const safeResult = await safeApplyAreaDamage(
                mockPosition,
                mockMapData,
                testCase.areaDamageChance,
                mockMember,
                mockEventLogs
            );
            
            console.log(`  Safe Result: ${safeResult}`);
            console.log(`  Is Integer: ${Number.isInteger(safeResult)}`);
            
            // Validate
            if (!Number.isInteger(result)) {
                console.error(`  ❌ FAILED: Direct result is not an integer!`);
            } else if (result !== testCase.expected && testCase.areaDamageChance === 0) {
                console.error(`  ❌ FAILED: Expected ${testCase.expected}, got ${result}`);
            } else {
                console.log(`  ✅ PASSED`);
            }
            
        } catch (error) {
            console.error(`  ❌ ERROR: ${error.message}`);
        }
        
        console.log('');
    }
    
    // Test ensureInteger helper
    console.log('Testing ensureInteger helper...');
    const integerTests = [
        { input: 5, expected: 5 },
        { input: 5.7, expected: 5 },
        { input: "10", expected: 10 },
        { input: "10.5", expected: 10 },
        { input: null, expected: 0 },
        { input: undefined, expected: 0 },
        { input: {}, expected: 0 },
        { input: [5], expected: 0 }
    ];
    
    for (const test of integerTests) {
        const result = ensureInteger(test.input, 'test');
        const passed = result === test.expected;
        console.log(`  Input: ${JSON.stringify(test.input)} -> ${result} ${passed ? '✅' : '❌'}`);
    }
    
    console.log('\n========================================');
    console.log('Test Complete');
    console.log('========================================');
}

// Run tests if executed directly
if (require.main === module) {
    testApplyAreaDamage().catch(console.error);
}

module.exports = { testApplyAreaDamage };

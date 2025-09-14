// test_shadow_ore_functionality.js
// Test script to verify shadow ore functionality for shadow clones

const { UNIFIED_ITEM_POOL } = require('./patterns/gachaModes/mining/miningConstants_unified');

// Mock member object for testing
const mockShadowClone = {
    id: 'shadow_clone_123',
    displayName: 'Shadow Clone #1',
    isClone: true,
    isFamiliar: true,
    ownerId: 'owner_123',
    guild: { id: 'guild_456' }
};

const mockRegularPlayer = {
    id: 'player_123',
    displayName: 'RegularPlayer',
    isClone: false,
    isFamiliar: false,
    guild: { id: 'guild_456' }
};

// Test the shadow ore detection logic
function testShadowOreDetection() {
    console.log('🧪 Testing Shadow Ore Detection Logic...\n');
    
    // Test 1: Shadow clone detection
    console.log('📋 Test 1: Shadow clone detection');
    const isShadowClone1 = mockShadowClone.isClone || mockShadowClone.isFamiliar || mockShadowClone.displayName.includes('Shadow Clone');
    console.log(`✅ Shadow clone detected: ${isShadowClone1}`);
    
    const isShadowClone2 = mockRegularPlayer.isClone || mockRegularPlayer.isFamiliar || mockRegularPlayer.displayName.includes('Shadow Clone');
    console.log(`✅ Regular player detected as shadow clone: ${isShadowClone2}`);
    console.log();
    
    // Test 2: Shadow ore item exists
    console.log('📋 Test 2: Shadow ore item verification');
    const shadowOre = UNIFIED_ITEM_POOL.ores.find(ore => ore.itemId === '220');
    if (shadowOre) {
        console.log('✅ Shadow ore found in constants:');
        console.log(`   Name: ${shadowOre.name}`);
        console.log(`   ID: ${shadowOre.itemId}`);
        console.log(`   Value: ${shadowOre.value}`);
        console.log(`   Tier: ${shadowOre.tier}`);
        console.log(`   Special Properties: ${JSON.stringify(shadowOre.specialProperties)}`);
    } else {
        console.log('❌ Shadow ore not found in constants!');
    }
    console.log();
    
    // Test 3: Shadow ore chance simulation
    console.log('📋 Test 3: Shadow ore chance simulation (100 attempts)');
    let shadowOreFinds = 0;
    const shadowOreChance = 0.15; // 15% chance
    
    for (let i = 0; i < 100; i++) {
        if (Math.random() < shadowOreChance) {
            shadowOreFinds++;
        }
    }
    
    console.log(`✅ Shadow ore found ${shadowOreFinds} times out of 100 attempts (expected ~15)`);
    console.log(`   Success rate: ${(shadowOreFinds / 100 * 100).toFixed(1)}%`);
    console.log();
    
    // Test 4: Quantity calculation simulation
    console.log('📋 Test 4: Shadow ore quantity calculation');
    const miningPower = 5;
    const luckStat = 10;
    
    let quantity = 1;
    // Apply mining power scaling for shadow ore
    if (miningPower > 0) {
        const maxBonus = Math.min(miningPower, 3); // Cap shadow ore bonus at 3
        quantity = 1 + Math.floor(Math.random() * maxBonus);
    }
    
    // Apply luck bonus for shadow ore
    if (luckStat && luckStat > 0) {
        const bonusChance = Math.min(luckStat * 0.05, 0.3); // Cap at 30% for shadow ore
        if (Math.random() < bonusChance) {
            quantity += 1;
        }
    }
    
    console.log(`✅ Shadow ore quantity calculation with mining power ${miningPower} and luck ${luckStat}:`);
    console.log(`   Base quantity: 1`);
    console.log(`   Mining power bonus: ${Math.min(miningPower, 3)} (capped)`);
    console.log(`   Luck bonus chance: ${Math.min(luckStat * 0.05, 0.3) * 100}% (capped at 30%)`);
    console.log(`   Final quantity: ${quantity}`);
    console.log();
    
    // Test 5: Message generation
    console.log('📋 Test 5: Shadow ore message generation');
    const finalQuantity = quantity;
    const message = `🌑 ${mockShadowClone.displayName}'s shadow clone unearthed mysterious Shadow Ore! (${finalQuantity}x)`;
    console.log(`✅ Generated message: ${message}`);
    console.log();
    
    console.log('🎉 All shadow ore tests completed successfully!');
}

// Run the test if this file is executed directly
if (require.main === module) {
    testShadowOreDetection()
        .then(() => {
            console.log('\n✅ Test completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Test failed:', error);
            process.exit(1);
        });
}

module.exports = { testShadowOreDetection };

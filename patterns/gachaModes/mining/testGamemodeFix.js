// testGamemodeFix.js - Test script to verify gamemode fixes are working

const gachaVC = require('../../../models/activevcs');

async function testGamemodeFix() {
    console.log('\n====== GAMEMODE FIX TEST SUITE ======\n');
    
    try {
        // Test 1: Check for channels missing gamemode
        console.log('[TEST 1] Checking for channels with missing gamemode field...');
        const missingGamemode = await gachaVC.find({
            'gameData': { $exists: true },
            'gameData.gamemode': { $exists: false }
        });
        
        if (missingGamemode.length > 0) {
            console.log(`❌ FAIL: Found ${missingGamemode.length} channels without gamemode field`);
            console.log('   Affected channels:', missingGamemode.map(c => c.channelId).join(', '));
        } else {
            console.log('✅ PASS: All channels have gamemode field');
        }
        
        // Test 2: Check for channels with mining gamemode
        console.log('\n[TEST 2] Checking channels with mining gamemode...');
        const miningChannels = await gachaVC.find({
            'gameData.gamemode': 'mining'
        });
        console.log(`ℹ️  Found ${miningChannels.length} channels with mining gamemode`);
        
        // Test 3: Validate minecart structure
        console.log('\n[TEST 3] Validating minecart structure...');
        let structureErrors = 0;
        
        for (const channel of miningChannels) {
            const errors = [];
            
            if (!channel.gameData.minecart) {
                errors.push('missing minecart');
            } else {
                if (!channel.gameData.minecart.items) {
                    errors.push('missing minecart.items');
                }
                if (!channel.gameData.minecart.contributors) {
                    errors.push('missing minecart.contributors');
                }
            }
            
            if (!channel.gameData.stats) {
                errors.push('missing stats');
            }
            
            if (errors.length > 0) {
                structureErrors++;
                console.log(`   ❌ Channel ${channel.channelId}: ${errors.join(', ')}`);
            }
        }
        
        if (structureErrors === 0) {
            console.log('✅ PASS: All mining channels have proper structure');
        } else {
            console.log(`❌ FAIL: ${structureErrors} channels have structure issues`);
        }
        
        // Test 4: Check a specific channel (if provided)
        const testChannelId = process.argv[2];
        if (testChannelId) {
            console.log(`\n[TEST 4] Checking specific channel: ${testChannelId}`);
            const channel = await gachaVC.findOne({ channelId: testChannelId });
            
            if (!channel) {
                console.log('❌ Channel not found');
            } else if (!channel.gameData) {
                console.log('❌ Channel has no gameData');
            } else {
                console.log('Channel data structure:');
                console.log(`  gamemode: ${channel.gameData.gamemode || 'MISSING'}`);
                console.log(`  minecart: ${channel.gameData.minecart ? 'exists' : 'MISSING'}`);
                console.log(`    - items: ${channel.gameData.minecart?.items ? 'exists' : 'MISSING'}`);
                console.log(`    - contributors: ${channel.gameData.minecart?.contributors ? 'exists' : 'MISSING'}`);
                console.log(`  stats: ${channel.gameData.stats ? 'exists' : 'MISSING'}`);
                
                // Show minecart contents if any
                if (channel.gameData.minecart?.items) {
                    const itemCount = Object.keys(channel.gameData.minecart.items).length;
                    if (itemCount > 0) {
                        console.log(`  Minecart has ${itemCount} item types`);
                    }
                }
            }
        }
        
        // Summary
        console.log('\n====== TEST SUMMARY ======');
        const totalChannels = await gachaVC.countDocuments({ 'gameData': { $exists: true } });
        const validChannels = await gachaVC.countDocuments({
            'gameData.gamemode': 'mining',
            'gameData.minecart': { $exists: true },
            'gameData.stats': { $exists: true }
        });
        
        console.log(`Total channels with gameData: ${totalChannels}`);
        console.log(`Valid mining channels: ${validChannels}`);
        console.log(`Channels needing fixes: ${totalChannels - validChannels}`);
        
        if (totalChannels === validChannels) {
            console.log('\n✅ All tests passed! Mining system is ready.');
        } else {
            console.log('\n⚠️  Some channels need fixes. Run fixMissingGamemode.js to repair them.');
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
    }
}

// Run the test
if (require.main === module) {
    console.log('Running gamemode fix tests...');
    console.log('Usage: node testGamemodeFix.js [optional-channel-id]');
    
    testGamemodeFix()
        .then(() => {
            console.log('\nTests completed.');
            process.exit(0);
        })
        .catch(error => {
            console.error('Test suite error:', error);
            process.exit(1);
        });
}

module.exports = { testGamemodeFix };

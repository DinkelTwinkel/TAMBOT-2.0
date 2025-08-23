// testMiningFix.js - Quick test to check for stuck mining channels
// Run this to see if any channels need repair

const { repairAll, getStatus } = require('./patterns/gachaModes/mining/fixStuckBreaks');
const gachaVC = require('./models/activevcs');

async function checkAllMiningChannels() {
    console.log('========================================');
    console.log('Mining Channel Health Check');
    console.log('========================================\n');
    
    try {
        // Find all mining channels
        const miningChannels = await gachaVC.find({
            'gameData.gamemode': 'mining'
        }).select('channelId gameData nextShopRefresh');
        
        console.log(`Found ${miningChannels.length} mining channels\n`);
        
        let stuckCount = 0;
        let healthyCount = 0;
        
        for (const entry of miningChannels) {
            const status = await getStatus(entry.channelId);
            
            if (status.isStuck) {
                stuckCount++;
                console.log(`❌ STUCK: Channel ${entry.channelId}`);
                
                if (status.breakDetails) {
                    if (status.breakDetails.minutesOverdue > 0) {
                        console.log(`   - Break overdue by ${status.breakDetails.minutesOverdue} minutes`);
                    }
                }
            } else {
                healthyCount++;
                console.log(`✅ OK: Channel ${entry.channelId}`);
            }
        }
        
        console.log('\n========================================');
        console.log('Summary:');
        console.log(`✅ Healthy channels: ${healthyCount}`);
        console.log(`❌ Stuck channels: ${stuckCount}`);
        console.log('========================================\n');
        
        if (stuckCount > 0) {
            console.log('Would you like to repair all stuck channels?');
            console.log('Run: node testMiningFix.js repair');
        }
        
    } catch (error) {
        console.error('Error during health check:', error);
    }
    
    process.exit(0);
}

async function repairStuckChannels() {
    console.log('========================================');
    console.log('Starting Mining Channel Repair');
    console.log('========================================\n');
    
    const result = await repairAll();
    
    console.log('\n========================================');
    console.log('Repair Complete:');
    console.log(result.message);
    console.log(`✅ Repaired: ${result.repaired.length} channels`);
    console.log(`❌ Failed: ${result.failed.length} channels`);
    console.log('========================================');
    
    process.exit(result.success ? 0 : 1);
}

// Check command line arguments
const args = process.argv.slice(2);

if (args.includes('repair')) {
    repairStuckChannels();
} else {
    checkAllMiningChannels();
}

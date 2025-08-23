// forceMiningCycle.js - Force a mining cycle for testing
// Use this to test if mining is working after repairs

const gachaVC = require('./models/activevcs');

async function forceMiningCycle(channelId) {
    try {
        console.log(`Forcing mining cycle for channel ${channelId}...`);
        
        // Update the nextTrigger to now
        const result = await gachaVC.updateOne(
            { channelId },
            { 
                $set: { 
                    nextTrigger: new Date(Date.now() - 1000) // Set to past to trigger immediately
                }
            }
        );
        
        if (result.modifiedCount > 0) {
            console.log(`✅ Successfully set nextTrigger to past for channel ${channelId}`);
            console.log('Mining should trigger on the next cycle (within 5 seconds)');
        } else {
            console.log(`❌ No channel found with ID ${channelId}`);
        }
        
    } catch (error) {
        console.error('Error forcing mining cycle:', error);
    }
    
    process.exit(0);
}

// Check command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage: node forceMiningCycle.js <channelId>');
    console.log('Example: node forceMiningCycle.js 1234567890123456');
    process.exit(1);
}

const channelId = args[0];
forceMiningCycle(channelId);

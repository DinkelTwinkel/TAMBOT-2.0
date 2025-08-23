// quickResetMining.js - Quick utility to reset mining without confirmation
// For development/debugging use

const resetMining = require('./resetMiningData');

// Configuration - Add your frequently used channel IDs here
const COMMON_CHANNELS = {
    'test': '1234567890123456789',  // Replace with your test channel ID
    'main': '9876543210987654321',  // Replace with your main channel ID
    // Add more as needed
};

async function quickReset() {
    console.log('\n🚀 QUICK MINING RESET UTILITY');
    console.log('================================\n');
    
    // Get channel ID from command line or use default
    let channelId = process.argv[2];
    
    // Check if it's a shortcut name
    if (COMMON_CHANNELS[channelId]) {
        console.log(`Using shortcut: ${channelId} -> ${COMMON_CHANNELS[channelId]}`);
        channelId = COMMON_CHANNELS[channelId];
    }
    
    if (!channelId) {
        console.log('Available shortcuts:');
        for (const [name, id] of Object.entries(COMMON_CHANNELS)) {
            console.log(`  ${name}: ${id}`);
        }
        console.log('\nUsage:');
        console.log('  node quickResetMining.js <channelId>');
        console.log('  node quickResetMining.js <shortcut>');
        console.log('\nExamples:');
        console.log('  node quickResetMining.js 1234567890123456789');
        console.log('  node quickResetMining.js test');
        process.exit(1);
    }
    
    console.log(`Resetting channel: ${channelId}`);
    console.log('Starting in 3 seconds... (Ctrl+C to cancel)');
    
    // Give a brief moment to cancel
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
        const results = await resetMining.resetChannel(channelId);
        
        if (results.errors.length > 0) {
            console.log('\n⚠️ Reset completed with errors');
            process.exit(1);
        } else {
            console.log('\n✅ Reset successful!');
            process.exit(0);
        }
    } catch (error) {
        console.error('\n❌ Reset failed:', error.message);
        process.exit(1);
    }
}

// Run immediately
quickReset();

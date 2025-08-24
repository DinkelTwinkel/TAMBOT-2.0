// Test file to verify voice tracking with unique items integration
const { tracker } = require('./trackingIntegration');
const { checkMaintenanceStatus } = require('./patterns/uniqueItemMaintenance');

async function testVoiceTracking() {
    console.log('\n🧪 Testing Voice Tracking Integration\n');
    console.log('=' .repeat(50));
    
    // Check if periodic updates are running
    if (tracker.periodicUpdateInterval) {
        console.log('✅ Periodic updates are ACTIVE');
        console.log('   Update interval: Every 5 minutes');
    } else {
        console.log('❌ Periodic updates are NOT running');
        console.log('   Make sure the bot has been initialized');
    }
    
    // Check active voice sessions
    console.log('\n📊 Active Voice Sessions:');
    if (tracker.voiceSessions.size > 0) {
        for (const [userId, session] of tracker.voiceSessions) {
            const duration = Math.floor((new Date() - session.joinTime) / 1000);
            const minutes = Math.floor(duration / 60);
            console.log(`   User ${session.username || userId}:`);
            console.log(`   - Channel: ${session.channelName}`);
            console.log(`   - Duration: ${minutes} minutes`);
            
            // Check if this user has unique items
            try {
                const maintenanceStatus = await checkMaintenanceStatus(userId);
                if (maintenanceStatus.length > 0) {
                    console.log(`   - Unique Items: ${maintenanceStatus.length}`);
                    for (const item of maintenanceStatus) {
                        if (item.maintenanceType === 'voice_activity') {
                            console.log(`     * ${item.name}: ${item.activityProgress.voice}/${item.maintenanceCost} minutes`);
                        }
                    }
                }
            } catch (err) {
                // User might not have unique items
            }
        }
    } else {
        console.log('   No active voice sessions');
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('💡 Voice tracking will update unique items every 5 minutes');
    console.log('💡 Users will get credit for voice time automatically');
}

// Run the test
testVoiceTracking().catch(console.error);

// You can also export this for use in commands
module.exports = { testVoiceTracking };
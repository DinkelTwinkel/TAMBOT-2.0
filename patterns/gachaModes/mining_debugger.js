// Debug utility for mining concurrency issues
// Run this to check the current state of the mining system

const { concurrencyManager, messageQueue } = require('./mining_concurrency_fix');

class MiningDebugger {
    static logCurrentState() {
        console.log('\n=== MINING SYSTEM DEBUG INFO ===');
        const debugInfo = concurrencyManager.getDebugInfo();
        
        console.log('\n📍 LOCKS:');
        if (debugInfo.lockedChannels.length > 0) {
            console.log(`  Active locks: ${debugInfo.lockedChannels.join(', ')}`);
            
            // Show detailed lock info
            for (const [channelId, lock] of concurrencyManager.locks) {
                const age = Date.now() - lock.acquiredAt;
                console.log(`    Channel ${channelId}: locked for ${Math.floor(age/1000)}s`);
            }
        } else {
            console.log('  No active locks');
        }
        
        console.log('\n⏰ INTERVALS:');
        if (debugInfo.activeIntervals.length > 0) {
            console.log(`  Active intervals: ${debugInfo.activeIntervals.join(', ')}`);
        } else {
            console.log('  No active intervals');
        }
        
        console.log('\n💬 MESSAGE QUEUE:');
        if (messageQueue.recentMessages.size > 0) {
            console.log(`  Channels with recent messages: ${messageQueue.recentMessages.size}`);
            for (const [channelId, messages] of messageQueue.recentMessages) {
                console.log(`    Channel ${channelId}: ${messages.size} unique messages`);
            }
        } else {
            console.log('  No recent messages in queue');
        }
        
        console.log('\n================================\n');
    }
    
    static testConcurrency(channelId) {
        console.log(`\n🧪 Testing concurrency for channel ${channelId}...`);
        
        // Test lock acquisition
        console.log('1. Testing lock acquisition...');
        const canAcquire1 = !concurrencyManager.isLocked(channelId);
        console.log(`   Can acquire lock: ${canAcquire1}`);
        
        if (canAcquire1) {
            concurrencyManager.acquireLock(channelId);
            console.log('   Lock acquired');
            
            const canAcquire2 = !concurrencyManager.isLocked(channelId);
            console.log(`   Can acquire again: ${canAcquire2} (should be false)`);
            
            concurrencyManager.releaseLock(channelId);
            console.log('   Lock released');
            
            const canAcquire3 = !concurrencyManager.isLocked(channelId);
            console.log(`   Can acquire after release: ${canAcquire3} (should be true)`);
        }
        
        // Test interval management
        console.log('\n2. Testing interval management...');
        let testCounter = 0;
        concurrencyManager.setInterval(channelId, 'test', () => {
            testCounter++;
        }, 1000);
        console.log('   Interval set');
        
        setTimeout(() => {
            console.log(`   Interval fired ${testCounter} times`);
            concurrencyManager.clearInterval(channelId, 'test');
            console.log('   Interval cleared');
        }, 3500);
        
        // Test message deduplication
        console.log('\n3. Testing message deduplication...');
        const testMessage = 'Test break announcement';
        const isDupe1 = messageQueue.isDuplicate(channelId, testMessage, 'test');
        console.log(`   First message is duplicate: ${isDupe1} (should be false)`);
        
        const isDupe2 = messageQueue.isDuplicate(channelId, testMessage, 'test');
        console.log(`   Second identical message is duplicate: ${isDupe2} (should be true)`);
        
        const isDupe3 = messageQueue.isDuplicate(channelId, 'Different message', 'test');
        console.log(`   Different message is duplicate: ${isDupe3} (should be false)`);
        
        setTimeout(() => {
            const isDupe4 = messageQueue.isDuplicate(channelId, testMessage, 'test');
            console.log(`   Same message after 3.5s: ${isDupe4} (should be false)`);
        }, 3500);
    }
    
    static clearChannel(channelId) {
        console.log(`\n🧹 Clearing all state for channel ${channelId}...`);
        
        // Release lock if held
        if (concurrencyManager.isLocked(channelId)) {
            concurrencyManager.releaseLock(channelId);
            console.log('  Lock released');
        }
        
        // Clear all intervals
        concurrencyManager.clearAllIntervalsForChannel(channelId);
        console.log('  Intervals cleared');
        
        // Clear message queue
        messageQueue.clearChannel(channelId);
        console.log('  Message queue cleared');
        
        console.log('✅ Channel state cleared\n');
    }
    
    static monitorChannel(channelId, duration = 30000) {
        console.log(`\n📊 Monitoring channel ${channelId} for ${duration/1000} seconds...`);
        
        const events = [];
        const originalAcquire = concurrencyManager.acquireLock;
        const originalRelease = concurrencyManager.releaseLock;
        const originalIsDupe = messageQueue.isDuplicate;
        
        // Monkey-patch to monitor activity
        concurrencyManager.acquireLock = async function(id, timeout) {
            if (id === channelId) {
                events.push({ time: Date.now(), type: 'LOCK_ACQUIRE' });
            }
            return originalAcquire.call(this, id, timeout);
        };
        
        concurrencyManager.releaseLock = function(id) {
            if (id === channelId) {
                events.push({ time: Date.now(), type: 'LOCK_RELEASE' });
            }
            return originalRelease.call(this, id);
        };
        
        messageQueue.isDuplicate = function(id, content, type) {
            if (id === channelId) {
                const result = originalIsDupe.call(this, id, content, type);
                events.push({ 
                    time: Date.now(), 
                    type: 'MESSAGE_CHECK',
                    isDupe: result,
                    content: content.substring(0, 50)
                });
                return result;
            }
            return originalIsDupe.call(this, id, content, type);
        };
        
        // Report after duration
        setTimeout(() => {
            // Restore original functions
            concurrencyManager.acquireLock = originalAcquire;
            concurrencyManager.releaseLock = originalRelease;
            messageQueue.isDuplicate = originalIsDupe;
            
            console.log('\n📈 Monitoring Report:');
            console.log(`Total events: ${events.length}`);
            
            const lockAcquires = events.filter(e => e.type === 'LOCK_ACQUIRE').length;
            const lockReleases = events.filter(e => e.type === 'LOCK_RELEASE').length;
            const messageChecks = events.filter(e => e.type === 'MESSAGE_CHECK').length;
            const duplicates = events.filter(e => e.type === 'MESSAGE_CHECK' && e.isDupe).length;
            
            console.log(`  Lock acquires: ${lockAcquires}`);
            console.log(`  Lock releases: ${lockReleases}`);
            console.log(`  Message checks: ${messageChecks}`);
            console.log(`  Duplicates prevented: ${duplicates}`);
            
            if (lockAcquires !== lockReleases) {
                console.log(`  ⚠️ WARNING: Lock count mismatch!`);
            }
            
            if (duplicates > 0) {
                console.log(`  ✅ Successfully prevented ${duplicates} duplicate messages`);
            }
            
            // Show timeline
            console.log('\n📅 Event Timeline:');
            const startTime = events[0]?.time || Date.now();
            events.slice(0, 10).forEach(event => {
                const relTime = ((event.time - startTime) / 1000).toFixed(1);
                let detail = event.type;
                if (event.type === 'MESSAGE_CHECK') {
                    detail += event.isDupe ? ' (DUPLICATE)' : ' (NEW)';
                    detail += ` - "${event.content}..."`;
                }
                console.log(`  +${relTime}s: ${detail}`);
            });
            
            if (events.length > 10) {
                console.log(`  ... and ${events.length - 10} more events`);
            }
        }, duration);
    }
}

// Export for use
module.exports = MiningDebugger;

// If run directly, show current state
if (require.main === module) {
    MiningDebugger.logCurrentState();
    
    // Optional: Run a test
    // MiningDebugger.testConcurrency('test-channel-123');
    
    // Optional: Monitor a specific channel
    // MiningDebugger.monitorChannel('your-channel-id', 30000);
}

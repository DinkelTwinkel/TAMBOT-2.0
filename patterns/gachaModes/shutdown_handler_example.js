// Add this to your bot's main file (e.g., index.js or bot.js)
// to properly handle cleanup on shutdown

const miningSystem = require('./patterns/gachaModes/mining_optimized_v5_performance');

// Graceful shutdown handler
process.on('SIGINT', async () => {
    console.log('\n[BOT] Shutting down gracefully...');
    
    // Clean up mining system
    if (miningSystem.cleanupAllChannels) {
        miningSystem.cleanupAllChannels();
    }
    
    // Add any other cleanup here (database connections, etc.)
    
    // Give a moment for cleanup to complete
    setTimeout(() => {
        console.log('[BOT] Shutdown complete');
        process.exit(0);
    }, 1000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('[BOT] Uncaught Exception:', error);
    
    // Clean up mining system even on crash
    if (miningSystem.cleanupAllChannels) {
        try {
            miningSystem.cleanupAllChannels();
        } catch (cleanupError) {
            console.error('[BOT] Error during cleanup:', cleanupError);
        }
    }
    
    // Exit after cleanup attempt
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('[BOT] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Optional: Periodic cleanup (every hour) to prevent any buildup
setInterval(() => {
    console.log('[BOT] Running periodic mining system maintenance...');
    
    // Get debug info before cleanup
    const { concurrencyManager } = require('./patterns/gachaModes/mining_concurrency_fix');
    const debugInfo = concurrencyManager.getDebugInfo();
    
    if (debugInfo.lockCount > 0 || debugInfo.intervalCount > 0) {
        console.log(`[BOT] Found ${debugInfo.lockCount} locks and ${debugInfo.intervalCount} intervals`);
        
        // Check for stale locks (older than 5 minutes)
        const now = Date.now();
        for (const [channelId, lock] of concurrencyManager.locks) {
            if (now - lock.acquiredAt > 5 * 60 * 1000) {
                console.log(`[BOT] Clearing stale lock for channel ${channelId}`);
                concurrencyManager.releaseLock(channelId);
            }
        }
    }
}, 60 * 60 * 1000); // Every hour

console.log('[BOT] Mining concurrency protection enabled');

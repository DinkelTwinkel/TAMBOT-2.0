// Concurrency control for mining system
const activeChannels = new Map(); // Track channels currently being processed
const eventIntervals = new Map(); // Track active intervals per channel

class ConcurrencyManager {
    constructor() {
        this.locks = new Map();
        this.intervals = new Map();
    }
    
    // Acquire a lock for a channel
    async acquireLock(channelId, timeout = 5000) {
        const startTime = Date.now();
        
        while (this.locks.has(channelId)) {
            if (Date.now() - startTime > timeout) {
                console.log(`[MINING] Lock timeout for channel ${channelId} - forcing unlock`);
                this.locks.delete(channelId);
                break;
            }
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        this.locks.set(channelId, {
            acquiredAt: Date.now(),
            stack: new Error().stack // For debugging
        });
        
        return true;
    }
    
    // Release a lock for a channel
    releaseLock(channelId) {
        this.locks.delete(channelId);
    }
    
    // Check if a channel is locked
    isLocked(channelId) {
        // Clean up old locks (older than 10 seconds)
        const now = Date.now();
        for (const [id, lock] of this.locks) {
            if (now - lock.acquiredAt > 10000) {
                console.log(`[MINING] Cleaning up stale lock for channel ${id}`);
                this.locks.delete(id);
            }
        }
        
        return this.locks.has(channelId);
    }
    
    // Manage intervals to prevent duplicates
    setInterval(channelId, key, callback, delay) {
        const intervalKey = `${channelId}_${key}`;
        
        // Clear any existing interval with the same key
        this.clearInterval(channelId, key);
        
        const intervalId = setInterval(callback, delay);
        this.intervals.set(intervalKey, intervalId);
        
        return intervalId;
    }
    
    clearInterval(channelId, key) {
        const intervalKey = `${channelId}_${key}`;
        const intervalId = this.intervals.get(intervalKey);
        
        if (intervalId) {
            clearInterval(intervalId);
            this.intervals.delete(intervalKey);
        }
    }
    
    clearAllIntervalsForChannel(channelId) {
        for (const [key, intervalId] of this.intervals) {
            if (key.startsWith(`${channelId}_`)) {
                clearInterval(intervalId);
                this.intervals.delete(key);
            }
        }
    }
    
    // Get debug info
    getDebugInfo() {
        return {
            lockedChannels: Array.from(this.locks.keys()),
            activeIntervals: Array.from(this.intervals.keys()),
            lockCount: this.locks.size,
            intervalCount: this.intervals.size
        };
    }
}

// Create a singleton instance
const concurrencyManager = new ConcurrencyManager();

// Message queue to prevent duplicate messages
class MessageQueue {
    constructor() {
        this.recentMessages = new Map(); // channelId -> Set of recent message hashes
        this.MESSAGE_DEDUP_WINDOW = 3000; // 3 seconds
    }
    
    // Generate a hash for a message to detect duplicates
    hashMessage(channelId, content, type = 'log') {
        // Create a simple hash from content
        const str = `${type}_${content}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `${channelId}_${hash}`;
    }
    
    // Check if a message was recently sent
    isDuplicate(channelId, content, type = 'log') {
        const hash = this.hashMessage(channelId, content, type);
        const channelMessages = this.recentMessages.get(channelId) || new Set();
        
        // Check if this exact message was sent recently
        if (channelMessages.has(hash)) {
            console.log(`[MINING] Duplicate message prevented for channel ${channelId}: ${content.substring(0, 50)}...`);
            return true;
        }
        
        // Add to recent messages
        channelMessages.add(hash);
        this.recentMessages.set(channelId, channelMessages);
        
        // Clean up after dedup window
        setTimeout(() => {
            const messages = this.recentMessages.get(channelId);
            if (messages) {
                messages.delete(hash);
                if (messages.size === 0) {
                    this.recentMessages.delete(channelId);
                }
            }
        }, this.MESSAGE_DEDUP_WINDOW);
        
        return false;
    }
    
    // Clear all messages for a channel
    clearChannel(channelId) {
        this.recentMessages.delete(channelId);
    }
}

const messageQueue = new MessageQueue();

// Export for use in main mining file
module.exports = {
    concurrencyManager,
    messageQueue,
    ConcurrencyManager,
    MessageQueue
};

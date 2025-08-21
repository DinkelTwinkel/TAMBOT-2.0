// instance-manager.js - Singleton Pattern for Mining Instances
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class MiningInstanceManager extends EventEmitter {
    constructor() {
        super();
        this.activeInstances = new Map(); // channelId -> { pid, startTime, intervalIds }
        this.lockFilePath = path.join(__dirname, '.mining-locks');
        this.processId = process.pid;
        
        // Ensure lock directory exists
        if (!fs.existsSync(this.lockFilePath)) {
            fs.mkdirSync(this.lockFilePath, { recursive: true });
        }
        
        // Clean up stale locks on startup
        this.cleanupStaleLocks();
        
        // Handle process termination
        process.on('SIGINT', () => this.cleanup());
        process.on('SIGTERM', () => this.cleanup());
        process.on('exit', () => this.cleanup());
        
        // Periodic cleanup of dead instances
        this.startCleanupInterval();
    }
    
    // File-based locking for cross-process safety
    acquireProcessLock(channelId) {
        const lockFile = path.join(this.lockFilePath, `${channelId}.lock`);
        
        try {
            // Check if lock exists and is valid
            if (fs.existsSync(lockFile)) {
                const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
                
                // Check if the process that owns the lock is still alive
                if (this.isProcessAlive(lockData.pid)) {
                    // Check if lock is stale (older than 5 minutes)
                    const lockAge = Date.now() - lockData.timestamp;
                    if (lockAge < 5 * 60 * 1000) {
                        console.log(`[INSTANCE] Channel ${channelId} is locked by PID ${lockData.pid}`);
                        return false;
                    }
                    
                    // Lock is stale, kill the old process if possible
                    console.warn(`[INSTANCE] Stale lock detected for channel ${channelId}, attempting to kill PID ${lockData.pid}`);
                    this.killProcess(lockData.pid);
                }
                
                // Remove the old lock
                fs.unlinkSync(lockFile);
            }
            
            // Create new lock
            fs.writeFileSync(lockFile, JSON.stringify({
                pid: this.processId,
                channelId: channelId,
                timestamp: Date.now(),
                hostname: require('os').hostname()
            }));
            
            return true;
        } catch (error) {
            console.error(`[INSTANCE] Error acquiring process lock for ${channelId}:`, error);
            return false;
        }
    }
    
    releaseProcessLock(channelId) {
        const lockFile = path.join(this.lockFilePath, `${channelId}.lock`);
        
        try {
            if (fs.existsSync(lockFile)) {
                const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
                
                // Only remove if we own the lock
                if (lockData.pid === this.processId) {
                    fs.unlinkSync(lockFile);
                    console.log(`[INSTANCE] Released process lock for channel ${channelId}`);
                }
            }
        } catch (error) {
            console.error(`[INSTANCE] Error releasing process lock for ${channelId}:`, error);
        }
    }
    
    // Register a new mining instance
    registerInstance(channelId, intervalIds = []) {
        // First check for process-level lock
        if (!this.acquireProcessLock(channelId)) {
            console.warn(`[INSTANCE] Cannot register instance for ${channelId} - locked by another process`);
            return false;
        }
        
        // Kill any existing instance for this channel
        this.killInstance(channelId);
        
        // Register new instance
        this.activeInstances.set(channelId, {
            pid: this.processId,
            startTime: Date.now(),
            intervalIds: new Set(intervalIds),
            lastActivity: Date.now()
        });
        
        console.log(`[INSTANCE] Registered new instance for channel ${channelId}`);
        this.emit('instanceRegistered', channelId);
        return true;
    }
    
    // Add interval to existing instance
    addInterval(channelId, intervalId) {
        const instance = this.activeInstances.get(channelId);
        if (instance) {
            instance.intervalIds.add(intervalId);
            instance.lastActivity = Date.now();
        }
    }
    
    // Remove interval from instance
    removeInterval(channelId, intervalId) {
        const instance = this.activeInstances.get(channelId);
        if (instance) {
            instance.intervalIds.delete(intervalId);
            clearInterval(intervalId);
        }
    }
    
    // Kill a specific instance
    killInstance(channelId, force = false) {
        const instance = this.activeInstances.get(channelId);
        
        if (instance) {
            console.log(`[INSTANCE] Killing instance for channel ${channelId}`);
            
            // Clear all intervals
            for (const intervalId of instance.intervalIds) {
                clearInterval(intervalId);
            }
            
            // Remove from active instances
            this.activeInstances.delete(channelId);
            
            // Release process lock
            this.releaseProcessLock(channelId);
            
            this.emit('instanceKilled', channelId);
            return true;
        }
        
        // Even if no instance in memory, try to clean up lock file
        if (force) {
            this.releaseProcessLock(channelId);
        }
        
        return false;
    }
    
    // Kill all instances for cleanup
    killAllInstances() {
        console.log(`[INSTANCE] Killing all ${this.activeInstances.size} active instances`);
        
        for (const [channelId] of this.activeInstances) {
            this.killInstance(channelId);
        }
    }
    
    // Check if an instance is active
    hasActiveInstance(channelId) {
        // Check both in-memory and file lock
        if (this.activeInstances.has(channelId)) {
            return true;
        }
        
        const lockFile = path.join(this.lockFilePath, `${channelId}.lock`);
        if (fs.existsSync(lockFile)) {
            try {
                const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
                return this.isProcessAlive(lockData.pid);
            } catch (error) {
                return false;
            }
        }
        
        return false;
    }
    
    // Get instance info
    getInstanceInfo(channelId) {
        return this.activeInstances.get(channelId);
    }
    
    // Get all active instances
    getAllInstances() {
        return Array.from(this.activeInstances.entries()).map(([channelId, instance]) => ({
            channelId,
            ...instance,
            intervalCount: instance.intervalIds.size,
            runtime: Date.now() - instance.startTime
        }));
    }
    
    // Check if a process is alive
    isProcessAlive(pid) {
        try {
            // Send signal 0 to check if process exists
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // Kill a process
    killProcess(pid) {
        try {
            process.kill(pid, 'SIGTERM');
            console.log(`[INSTANCE] Sent SIGTERM to PID ${pid}`);
            
            // Give it time to gracefully shutdown
            setTimeout(() => {
                if (this.isProcessAlive(pid)) {
                    process.kill(pid, 'SIGKILL');
                    console.log(`[INSTANCE] Sent SIGKILL to PID ${pid}`);
                }
            }, 5000);
        } catch (error) {
            console.error(`[INSTANCE] Error killing PID ${pid}:`, error);
        }
    }
    
    // Clean up stale lock files
    cleanupStaleLocks() {
        try {
            const files = fs.readdirSync(this.lockFilePath);
            
            for (const file of files) {
                if (file.endsWith('.lock')) {
                    const lockFile = path.join(this.lockFilePath, file);
                    
                    try {
                        const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
                        
                        // Remove locks from dead processes or stale locks (older than 10 minutes)
                        const isStale = Date.now() - lockData.timestamp > 10 * 60 * 1000;
                        const isDead = !this.isProcessAlive(lockData.pid);
                        
                        if (isStale || isDead) {
                            fs.unlinkSync(lockFile);
                            console.log(`[INSTANCE] Cleaned up stale lock: ${file}`);
                        }
                    } catch (error) {
                        // Invalid lock file, remove it
                        fs.unlinkSync(lockFile);
                    }
                }
            }
        } catch (error) {
            console.error('[INSTANCE] Error cleaning up stale locks:', error);
        }
    }
    
    // Start periodic cleanup
    startCleanupInterval() {
        // Clean up every minute
        this.cleanupIntervalId = setInterval(() => {
            // Clean up stale locks
            this.cleanupStaleLocks();
            
            // Clean up inactive instances (no activity for 5 minutes)
            const now = Date.now();
            const staleThreshold = 5 * 60 * 1000;
            
            for (const [channelId, instance] of this.activeInstances) {
                if (now - instance.lastActivity > staleThreshold) {
                    console.warn(`[INSTANCE] Cleaning up inactive instance for channel ${channelId}`);
                    this.killInstance(channelId);
                }
            }
        }, 60000);
    }
    
    // Cleanup on shutdown
    cleanup() {
        console.log('[INSTANCE] Cleaning up before shutdown...');
        
        // Stop cleanup interval
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
        }
        
        // Kill all instances
        this.killAllInstances();
        
        // Remove all our lock files
        try {
            const files = fs.readdirSync(this.lockFilePath);
            for (const file of files) {
                if (file.endsWith('.lock')) {
                    const lockFile = path.join(this.lockFilePath, file);
                    const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
                    
                    if (lockData.pid === this.processId) {
                        fs.unlinkSync(lockFile);
                    }
                }
            }
        } catch (error) {
            console.error('[INSTANCE] Error during cleanup:', error);
        }
    }
    
    // Force kill all instances for a channel across all processes
    forceKillChannel(channelId) {
        console.log(`[INSTANCE] Force killing all instances for channel ${channelId}`);
        
        // Kill local instance
        this.killInstance(channelId, true);
        
        // Check for lock file from other processes
        const lockFile = path.join(this.lockFilePath, `${channelId}.lock`);
        if (fs.existsSync(lockFile)) {
            try {
                const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
                
                // Try to kill the other process
                if (lockData.pid !== this.processId) {
                    this.killProcess(lockData.pid);
                }
                
                // Remove the lock file
                fs.unlinkSync(lockFile);
            } catch (error) {
                console.error(`[INSTANCE] Error force killing channel ${channelId}:`, error);
            }
        }
    }
    
    // Get diagnostic information
    getDiagnostics() {
        const instances = this.getAllInstances();
        const locks = [];
        
        try {
            const files = fs.readdirSync(this.lockFilePath);
            for (const file of files) {
                if (file.endsWith('.lock')) {
                    const lockFile = path.join(this.lockFilePath, file);
                    const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
                    locks.push({
                        ...lockData,
                        age: Date.now() - lockData.timestamp,
                        alive: this.isProcessAlive(lockData.pid),
                        isOurs: lockData.pid === this.processId
                    });
                }
            }
        } catch (error) {
            console.error('[INSTANCE] Error getting diagnostics:', error);
        }
        
        return {
            currentPid: this.processId,
            activeInstances: instances,
            lockFiles: locks,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };
    }
}

// Export singleton
module.exports = new MiningInstanceManager();
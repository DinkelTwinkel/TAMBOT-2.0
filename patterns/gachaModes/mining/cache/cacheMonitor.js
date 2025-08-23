// cacheMonitor.js - Monitor and debug cache performance
const mapCacheSystem = require('./mapCacheSystem');

class CacheMonitor {
    constructor() {
        this.startTime = Date.now();
        this.operationLog = [];
        this.maxLogSize = 100;
    }
    
    /**
     * Log an operation for debugging
     */
    logOperation(type, channelId, details = {}) {
        const entry = {
            timestamp: Date.now(),
            type,
            channelId,
            details,
            cacheSize: mapCacheSystem.getStats().cacheSize
        };
        
        this.operationLog.push(entry);
        
        // Keep log size manageable
        if (this.operationLog.length > this.maxLogSize) {
            this.operationLog.shift();
        }
    }
    
    /**
     * Get performance report
     */
    getPerformanceReport() {
        const stats = mapCacheSystem.getStats();
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const avgOpsPerSecond = (stats.hits + stats.misses) / uptime || 0;
        
        return {
            uptime: `${Math.floor(uptime / 60)} minutes`,
            cacheSize: stats.cacheSize,
            hitRate: `${(stats.hitRate * 100).toFixed(2)}%`,
            totalHits: stats.hits,
            totalMisses: stats.misses,
            pendingWrites: stats.pendingWrites,
            completedWrites: stats.writes,
            errors: stats.errors,
            avgOpsPerSecond: avgOpsPerSecond.toFixed(2),
            memoryUsage: this.getMemoryUsage()
        };
    }
    
    /**
     * Get memory usage estimate
     */
    getMemoryUsage() {
        const used = process.memoryUsage();
        const stats = mapCacheSystem.getStats();
        
        // Rough estimate: ~50KB per channel
        const estimatedCacheSize = stats.cacheSize * 50 * 1024;
        
        return {
            total: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
            cacheEstimate: `${Math.round(estimatedCacheSize / 1024 / 1024)}MB`,
            perChannel: `${Math.round(estimatedCacheSize / stats.cacheSize / 1024)}KB`
        };
    }
    
    /**
     * Performance comparison test
     */
    async comparePerformance(channelId) {
        const gachaVC = require('../../../../models/activevcs');
        
        // Test DB read
        const dbStart = Date.now();
        await gachaVC.findOne({ channelId });
        const dbTime = Date.now() - dbStart;
        
        // Test cache read
        const cacheStart = Date.now();
        mapCacheSystem.getCachedData(channelId);
        const cacheTime = Date.now() - cacheStart;
        
        return {
            dbReadTime: `${dbTime}ms`,
            cacheReadTime: `${cacheTime}ms`,
            speedup: `${(dbTime / cacheTime).toFixed(0)}x faster`
        };
    }
    
    /**
     * Health check
     */
    healthCheck() {
        const stats = mapCacheSystem.getStats();
        const issues = [];
        
        if (stats.hitRate < 0.8) {
            issues.push(`Low hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
        }
        
        if (stats.errors > 10) {
            issues.push(`High error count: ${stats.errors}`);
        }
        
        if (stats.pendingWrites > 100) {
            issues.push(`Large write queue: ${stats.pendingWrites}`);
        }
        
        const memory = this.getMemoryUsage();
        const memMB = parseInt(memory.total);
        if (memMB > 500) {
            issues.push(`High memory usage: ${memory.total}`);
        }
        
        return {
            healthy: issues.length === 0,
            issues
        };
    }
    
    /**
     * Print formatted report to console
     */
    printReport() {
        const report = this.getPerformanceReport();
        const health = this.healthCheck();
        
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║        CACHE PERFORMANCE REPORT        ║');
        console.log('╠════════════════════════════════════════╣');
        console.log(`║ Uptime:          ${report.uptime.padEnd(22)} ║`);
        console.log(`║ Cache Size:      ${String(report.cacheSize).padEnd(22)} ║`);
        console.log(`║ Hit Rate:        ${report.hitRate.padEnd(22)} ║`);
        console.log(`║ Ops/Second:      ${report.avgOpsPerSecond.padEnd(22)} ║`);
        console.log(`║ Pending Writes:  ${String(report.pendingWrites).padEnd(22)} ║`);
        console.log(`║ Memory (Total):  ${report.memoryUsage.total.padEnd(22)} ║`);
        console.log(`║ Memory (Cache):  ${report.memoryUsage.cacheEstimate.padEnd(22)} ║`);
        console.log('╠════════════════════════════════════════╣');
        console.log(`║ Status: ${health.healthy ? '✅ HEALTHY'.padEnd(31) : '⚠️  ISSUES DETECTED'.padEnd(31)} ║`);
        if (!health.healthy) {
            health.issues.forEach(issue => {
                console.log(`║ - ${issue.padEnd(37)} ║`);
            });
        }
        console.log('╚════════════════════════════════════════╝\n');
    }
}

// Create singleton
const monitor = new CacheMonitor();

// Auto-monitoring (optional - comment out if not needed)
if (process.env.CACHE_MONITORING === 'true') {
    // Print report every 5 minutes
    setInterval(() => {
        monitor.printReport();
    }, 5 * 60 * 1000);
    
    // Log cache operations
    const originalGet = mapCacheSystem.getCachedData;
    mapCacheSystem.getCachedData = function(channelId) {
        monitor.logOperation('read', channelId);
        return originalGet.call(this, channelId);
    };
    
    const originalUpdate = mapCacheSystem.updateMultiple;
    mapCacheSystem.updateMultiple = function(channelId, updates) {
        monitor.logOperation('write', channelId, { fields: Object.keys(updates) });
        return originalUpdate.call(this, channelId, updates);
    };
}

module.exports = monitor;
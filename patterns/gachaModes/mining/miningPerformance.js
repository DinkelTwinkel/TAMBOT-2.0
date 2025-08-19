// miningPerformance.js - Performance optimizations for mining system

const gachaVC = require('../../../models/activevcs');

// Batch database operations cache
class BatchDatabaseOperations {
    constructor() {
        this.pendingUpdates = new Map();
        this.updateTimer = null;
        this.maxBatchSize = 10;
        this.batchDelay = 100; // ms
    }

    queueUpdate(channelId, updates) {
        if (!this.pendingUpdates.has(channelId)) {
            this.pendingUpdates.set(channelId, {});
        }
        
        const pending = this.pendingUpdates.get(channelId);
        Object.assign(pending, updates);
        
        if (!this.updateTimer) {
            this.updateTimer = setTimeout(() => this.flush(), this.batchDelay);
        }
        
        if (this.pendingUpdates.size >= this.maxBatchSize) {
            this.flush();
        }
    }

    async flush() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        
        if (this.pendingUpdates.size === 0) return;
        
        const updates = Array.from(this.pendingUpdates.entries());
        this.pendingUpdates.clear();
        
        // Execute all updates in parallel
        await Promise.all(updates.map(([channelId, update]) => 
            gachaVC.updateOne({ channelId }, { $set: update })
        ));
    }
}

// Cache player stats with TTL
class PlayerStatsCache {
    constructor() {
        this.cache = new Map();
        this.ttl = 5 * 60 * 1000; // 5 minutes
    }

    async get(playerId, forceRefresh = false) {
        const now = Date.now();
        const cached = this.cache.get(playerId);
        
        if (!forceRefresh && cached && (now - cached.timestamp) < this.ttl) {
            return cached.data;
        }
        
        // Only fetch if not cached or expired
        const stats = await this.fetchPlayerStats(playerId);
        this.cache.set(playerId, { data: stats, timestamp: now });
        return stats;
    }

    async getMultiple(playerIds) {
        const results = new Map();
        const toFetch = [];
        const now = Date.now();
        
        // Check cache first
        for (const id of playerIds) {
            const cached = this.cache.get(id);
            if (cached && (now - cached.timestamp) < this.ttl) {
                results.set(id, cached.data);
            } else {
                toFetch.push(id);
            }
        }
        
        // Fetch missing stats in parallel
        if (toFetch.length > 0) {
            const fetchPromises = toFetch.map(id => 
                this.fetchPlayerStats(id).then(stats => {
                    this.cache.set(id, { data: stats, timestamp: now });
                    results.set(id, stats);
                })
            );
            await Promise.all(fetchPromises);
        }
        
        return results;
    }

    async fetchPlayerStats(playerId) {
        // Import here to avoid circular dependency
        const getPlayerStats = require('../../calculatePlayerStat');
        return await getPlayerStats(playerId);
    }

    clear() {
        this.cache.clear();
    }

    invalidate(playerId) {
        this.cache.delete(playerId);
    }
}

// Optimized visibility calculation with caching
class VisibilityCalculator {
    constructor() {
        this.cache = new Map();
        this.cacheKey = null;
    }

    calculateTeamVisibility(playerPositions, teamSightRadius, tiles) {
        // Create cache key from positions
        const posKey = JSON.stringify(playerPositions) + teamSightRadius;
        
        // Return cached result if positions haven't changed
        if (this.cacheKey === posKey) {
            return this.cache.get(posKey);
        }
        
        const visible = new Set();
        
        // Optimized visibility calculation
        if (teamSightRadius <= 1) {
            // Fast path for small radius
            for (const position of Object.values(playerPositions)) {
                if (!position) continue;
                
                const { x, y } = position;
                // Add tile and immediate neighbors
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (ny >= 0 && ny < tiles.length && nx >= 0 && nx < tiles[0].length) {
                            visible.add(`${nx},${ny}`);
                        }
                    }
                }
            }
        } else {
            // Use optimized ray casting for larger radius
            const positions = Object.values(playerPositions).filter(p => p);
            
            for (const { x: px, y: py } of positions) {
                visible.add(`${px},${py}`);
                
                // Reduce ray count for better performance
                const rayCount = Math.min(32, teamSightRadius * 4); // Reduced from 64
                
                for (let i = 0; i < rayCount; i++) {
                    const angle = (i * 360) / rayCount;
                    const radians = (angle * Math.PI) / 180;
                    const dx = Math.cos(radians);
                    const dy = Math.sin(radians);
                    
                    for (let dist = 1; dist <= teamSightRadius; dist++) {
                        const checkX = Math.round(px + dx * dist);
                        const checkY = Math.round(py + dy * dist);
                        
                        if (checkY < 0 || checkY >= tiles.length || 
                            checkX < 0 || checkX >= tiles[0].length) {
                            break;
                        }
                        
                        visible.add(`${checkX},${checkY}`);
                        
                        const tile = tiles[checkY]?.[checkX];
                        if (tile?.type === 'wall' || tile?.type === 'wall_ore' || tile?.type === 'reinforced') {
                            break; // Stop ray at walls
                        }
                    }
                }
            }
        }
        
        // Cache the result
        this.cacheKey = posKey;
        this.cache.clear(); // Clear old cache
        this.cache.set(posKey, visible);
        
        return visible;
    }

    invalidate() {
        this.cacheKey = null;
        this.cache.clear();
    }
}

// Message update throttling
class MessageThrottler {
    constructor() {
        this.pendingUpdates = new Map();
        this.updateTimers = new Map();
        this.updateDelay = 500; // ms
    }

    async scheduleUpdate(channel, updateFn) {
        const channelId = channel.id;
        
        // Cancel existing timer
        if (this.updateTimers.has(channelId)) {
            clearTimeout(this.updateTimers.get(channelId));
        }
        
        // Store the update function
        this.pendingUpdates.set(channelId, updateFn);
        
        // Schedule new update
        const timer = setTimeout(async () => {
            const fn = this.pendingUpdates.get(channelId);
            if (fn) {
                await fn();
                this.pendingUpdates.delete(channelId);
            }
            this.updateTimers.delete(channelId);
        }, this.updateDelay);
        
        this.updateTimers.set(channelId, timer);
    }

    async forceUpdate(channelId) {
        if (this.updateTimers.has(channelId)) {
            clearTimeout(this.updateTimers.get(channelId));
            this.updateTimers.delete(channelId);
        }
        
        const fn = this.pendingUpdates.get(channelId);
        if (fn) {
            await fn();
            this.pendingUpdates.delete(channelId);
        }
    }

    clear() {
        for (const timer of this.updateTimers.values()) {
            clearTimeout(timer);
        }
        this.updateTimers.clear();
        this.pendingUpdates.clear();
    }
}

// Event batching for log messages
class EventBatcher {
    constructor() {
        this.events = [];
        this.timer = null;
        this.maxBatchSize = 10;
        this.batchDelay = 200; // ms
    }

    addEvent(event) {
        this.events.push(event);
        
        if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), this.batchDelay);
        }
        
        if (this.events.length >= this.maxBatchSize) {
            this.flush();
        }
    }

    flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        
        if (this.events.length === 0) return null;
        
        const combined = this.events.join(' | ');
        this.events = [];
        return combined;
    }

    getEvents() {
        return this.events;
    }
}

// Singleton instances
const batchDB = new BatchDatabaseOperations();
const playerStatsCache = new PlayerStatsCache();
const visibilityCalculator = new VisibilityCalculator();
const messageThrottler = new MessageThrottler();
const eventBatcher = new EventBatcher();

module.exports = {
    batchDB,
    playerStatsCache,
    visibilityCalculator,
    messageThrottler,
    eventBatcher,
    BatchDatabaseOperations,
    PlayerStatsCache,
    VisibilityCalculator,
    MessageThrottler,
    EventBatcher
};

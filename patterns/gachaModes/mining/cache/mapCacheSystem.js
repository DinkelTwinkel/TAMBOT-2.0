// mapCacheSystem.js - Local Map Data Cache with Async DB Persistence
const gachaVC = require('../../../../models/activevcs');

class MapCacheSystem {
    constructor() {
        // Primary map cache - stores complete map data per channel
        this.mapCache = new Map();
        
        // Track initialization status
        this.initialized = new Map();
        
        // Pending DB writes queue
        this.pendingWrites = new Map();
        
        // Write interval (flush to DB every 30 seconds)
        this.WRITE_INTERVAL = 30000;
        
        // Cache stats for monitoring
        this.stats = {
            hits: 0,
            misses: 0,
            writes: 0,
            errors: 0
        };
        
        // Start the async write processor
        this.startWriteProcessor();
    }
    
    /**
     * Initialize cache for a channel by loading from DB once
     */
    async initialize(channelId, forceReload = false) {
        try {
            // Check if already initialized and not forcing reload
            if (!forceReload && this.initialized.get(channelId)) {
                this.stats.hits++;
                return this.mapCache.get(channelId);
            }
            
            console.log(`[MAP_CACHE] Initializing cache for channel ${channelId}...`);
            
            // Fetch from DB once
            const dbEntry = await gachaVC.findOne({ channelId });
            
            if (!dbEntry || !dbEntry.gameData) {
                console.log(`[MAP_CACHE] No game data found for channel ${channelId}`);
                this.stats.misses++;
                return null;
            }
            
            // Extract all relevant data we need to cache
            const cachedData = {
                map: dbEntry.gameData.map || null,
                minecart: dbEntry.gameData.minecart || { items: {}, contributors: {} },
                breakInfo: dbEntry.gameData.breakInfo || null,
                specialEvent: dbEntry.gameData.specialEvent || null,
                cycleCount: dbEntry.gameData.cycleCount || 0,
                stats: dbEntry.gameData.stats || {},
                hazardRollDone: dbEntry.gameData.hazardRollDone || false,
                dangerLevel: dbEntry.gameData.dangerLevel || 1,
                hazardSeed: dbEntry.gameData.hazardSeed || null,
                disabledPlayers: dbEntry.gameData.disabledPlayers || {},
                gamemode: dbEntry.gameData.gamemode || 'mining',
                breakJustEnded: dbEntry.gameData.breakJustEnded || null,
                lastUpdated: Date.now(),
                channelId: channelId,
                nextShopRefresh: dbEntry.nextShopRefresh,
                nextTrigger: dbEntry.nextTrigger
            };
            
            // Store in cache
            this.mapCache.set(channelId, cachedData);
            this.initialized.set(channelId, true);
            
            console.log(`[MAP_CACHE] Successfully cached data for channel ${channelId}`);
            this.stats.hits++;
            
            return cachedData;
            
        } catch (error) {
            console.error(`[MAP_CACHE] Error initializing cache for ${channelId}:`, error);
            this.stats.errors++;
            return null;
        }
    }
    
    /**
     * Get map data from cache (never hits DB after initialization)
     */
    getMapData(channelId) {
        const cached = this.mapCache.get(channelId);
        if (cached) {
            this.stats.hits++;
            return cached.map;
        }
        this.stats.misses++;
        return null;
    }
    
    /**
     * Get complete cached data for a channel
     */
    getCachedData(channelId) {
        const cached = this.mapCache.get(channelId);
        if (cached) {
            this.stats.hits++;
            return cached;
        }
        this.stats.misses++;
        return null;
    }
    
    /**
     * Update map data in cache and queue for DB write
     */
    updateMapData(channelId, mapData) {
        const cached = this.mapCache.get(channelId);
        if (!cached) {
            console.warn(`[MAP_CACHE] No cache found for channel ${channelId}, creating new entry`);
            this.mapCache.set(channelId, {
                map: mapData,
                lastUpdated: Date.now(),
                channelId: channelId
            });
        } else {
            cached.map = mapData;
            cached.lastUpdated = Date.now();
        }
        
        // Queue for async DB write
        this.queueWrite(channelId, { 'gameData.map': mapData });
    }
    
    /**
     * Update any cached field and queue for DB write
     */
    updateField(channelId, field, value) {
        const cached = this.mapCache.get(channelId);
        if (!cached) {
            console.warn(`[MAP_CACHE] No cache found for channel ${channelId}`);
            return false;
        }
        
        // Update local cache
        if (field.includes('.')) {
            // Handle nested fields
            const parts = field.split('.');
            let target = cached;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!target[parts[i]]) {
                    target[parts[i]] = {};
                }
                target = target[parts[i]];
            }
            target[parts[parts.length - 1]] = value;
        } else {
            cached[field] = value;
        }
        
        cached.lastUpdated = Date.now();
        
        // Queue for DB write with gameData prefix if needed
        const dbField = field.startsWith('gameData.') ? field : `gameData.${field}`;
        this.queueWrite(channelId, { [dbField]: value });
        
        return true;
    }
    
    /**
     * Batch update multiple fields
     */
    updateMultiple(channelId, updates) {
        const cached = this.mapCache.get(channelId);
        if (!cached) {
            console.warn(`[MAP_CACHE] No cache found for channel ${channelId}`);
            return false;
        }
        
        const dbUpdates = {};
        
        for (const [field, value] of Object.entries(updates)) {
            // Update local cache
            if (field.includes('.')) {
                const parts = field.split('.');
                let target = cached;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!target[parts[i]]) {
                        target[parts[i]] = {};
                    }
                    target = target[parts[i]];
                }
                target[parts[parts.length - 1]] = value;
            } else {
                cached[field] = value;
            }
            
            // Prepare DB update
            const dbField = field.startsWith('gameData.') ? field : `gameData.${field}`;
            dbUpdates[dbField] = value;
        }
        
        cached.lastUpdated = Date.now();
        
        // Queue all updates for DB write
        this.queueWrite(channelId, dbUpdates);
        
        return true;
    }
    
    /**
     * Queue updates for async DB write
     */
    queueWrite(channelId, updates) {
        const pending = this.pendingWrites.get(channelId) || {};
        
        // Merge updates
        for (const [key, value] of Object.entries(updates)) {
            pending[key] = value;
        }
        
        this.pendingWrites.set(channelId, pending);
    }
    
    /**
     * Process pending writes to DB (runs async in background)
     */
    async processPendingWrites() {
        if (this.pendingWrites.size === 0) return;
        
        const writes = Array.from(this.pendingWrites.entries());
        this.pendingWrites.clear();
        
        // Process all writes in parallel without blocking
        const promises = writes.map(async ([channelId, updates]) => {
            try {
                await gachaVC.updateOne(
                    { channelId },
                    { $set: updates },
                    { upsert: false }
                );
                this.stats.writes++;
            } catch (error) {
                console.error(`[MAP_CACHE] Failed to write to DB for ${channelId}:`, error);
                this.stats.errors++;
                
                // Re-queue failed writes
                this.queueWrite(channelId, updates);
            }
        });
        
        // Fire and forget - don't await
        Promise.all(promises).catch(err => {
            console.error('[MAP_CACHE] Batch write error:', err);
        });
    }
    
    /**
     * Start the background write processor
     */
    startWriteProcessor() {
        setInterval(() => {
            this.processPendingWrites();
        }, this.WRITE_INTERVAL);
        
        // Also process on exit
        process.on('beforeExit', () => {
            this.forceFlush();
        });
        
        process.on('SIGINT', () => {
            this.forceFlush();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            this.forceFlush();
            process.exit(0);
        });
    }
    
    /**
     * Force flush all pending writes (blocking)
     */
    async forceFlush() {
        if (this.pendingWrites.size === 0) return;
        
        console.log(`[MAP_CACHE] Force flushing ${this.pendingWrites.size} pending writes...`);
        
        const writes = Array.from(this.pendingWrites.entries());
        this.pendingWrites.clear();
        
        try {
            await Promise.all(writes.map(async ([channelId, updates]) => {
                await gachaVC.updateOne(
                    { channelId },
                    { $set: updates },
                    { upsert: false }
                );
            }));
            
            console.log('[MAP_CACHE] Force flush completed');
            this.stats.writes += writes.length;
        } catch (error) {
            console.error('[MAP_CACHE] Force flush failed:', error);
            this.stats.errors++;
        }
    }
    
    /**
     * Clear cache for a specific channel
     */
    clearChannel(channelId) {
        this.mapCache.delete(channelId);
        this.initialized.delete(channelId);
        this.pendingWrites.delete(channelId);
        console.log(`[MAP_CACHE] Cleared cache for channel ${channelId}`);
    }
    
    /**
     * Clear all caches
     */
    clearAll() {
        const size = this.mapCache.size;
        this.mapCache.clear();
        this.initialized.clear();
        this.pendingWrites.clear();
        console.log(`[MAP_CACHE] Cleared all caches (${size} channels)`);
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.mapCache.size,
            pendingWrites: this.pendingWrites.size,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }
    
    /**
     * Preload cache for all active mining channels
     */
    async preloadAll() {
        try {
            console.log('[MAP_CACHE] Preloading all active mining channels...');
            
            const activeChannels = await gachaVC.find({
                'gameData.gamemode': 'mining',
                'gameData.map': { $exists: true }
            }).select('channelId gameData nextShopRefresh nextTrigger');
            
            console.log(`[MAP_CACHE] Found ${activeChannels.length} active mining channels`);
            
            let loaded = 0;
            for (const entry of activeChannels) {
                try {
                    const cachedData = {
                        map: entry.gameData.map,
                        minecart: entry.gameData.minecart || { items: {}, contributors: {} },
                        breakInfo: entry.gameData.breakInfo || null,
                        specialEvent: entry.gameData.specialEvent || null,
                        cycleCount: entry.gameData.cycleCount || 0,
                        stats: entry.gameData.stats || {},
                        hazardRollDone: entry.gameData.hazardRollDone || false,
                        dangerLevel: entry.gameData.dangerLevel || 1,
                        hazardSeed: entry.gameData.hazardSeed || null,
                        disabledPlayers: entry.gameData.disabledPlayers || {},
                        gamemode: entry.gameData.gamemode || 'mining',
                        breakJustEnded: entry.gameData.breakJustEnded || null,
                        lastUpdated: Date.now(),
                        channelId: entry.channelId,
                        nextShopRefresh: entry.nextShopRefresh,
                        nextTrigger: entry.nextTrigger
                    };
                    
                    this.mapCache.set(entry.channelId, cachedData);
                    this.initialized.set(entry.channelId, true);
                    loaded++;
                } catch (err) {
                    console.error(`[MAP_CACHE] Failed to preload channel ${entry.channelId}:`, err);
                }
            }
            
            console.log(`[MAP_CACHE] Successfully preloaded ${loaded} channels`);
            return loaded;
            
        } catch (error) {
            console.error('[MAP_CACHE] Preload failed:', error);
            return 0;
        }
    }
    
    /**
     * Helper to check if channel is cached
     */
    isCached(channelId) {
        return this.initialized.get(channelId) === true;
    }
    
    /**
     * Get minecart data from cache
     */
    getMinecarts(channelId) {
        const cached = this.mapCache.get(channelId);
        return cached ? cached.minecart : { items: {}, contributors: {} };
    }
    
    /**
     * Update minecart data
     */
    updateMinecart(channelId, playerId, itemId, quantity) {
        const cached = this.mapCache.get(channelId);
        if (!cached) return false;
        
        if (!cached.minecart) cached.minecart = { items: {}, contributors: {} };
        if (!cached.minecart.items) cached.minecart.items = {};
        if (!cached.minecart.contributors) cached.minecart.contributors = {};
        
        // Update items
        if (!cached.minecart.items[itemId]) {
            cached.minecart.items[itemId] = { quantity: 0, contributors: {} };
        }
        cached.minecart.items[itemId].quantity += quantity;
        
        // Update item contributors
        if (!cached.minecart.items[itemId].contributors[playerId]) {
            cached.minecart.items[itemId].contributors[playerId] = 0;
        }
        cached.minecart.items[itemId].contributors[playerId] += quantity;
        
        // Update global contributors
        cached.minecart.contributors[playerId] = (cached.minecart.contributors[playerId] || 0) + quantity;
        
        cached.lastUpdated = Date.now();
        
        // Queue for DB write
        this.queueWrite(channelId, {
            [`gameData.minecart.items.${itemId}.quantity`]: cached.minecart.items[itemId].quantity,
            [`gameData.minecart.items.${itemId}.contributors.${playerId}`]: cached.minecart.items[itemId].contributors[playerId],
            [`gameData.minecart.contributors.${playerId}`]: cached.minecart.contributors[playerId]
        });
        
        return true;
    }
    
    /**
     * Delete a field from cache and DB
     */
    deleteField(channelId, field) {
        const cached = this.mapCache.get(channelId);
        if (!cached) return false;
        
        // Delete from local cache
        if (field.includes('.')) {
            const parts = field.split('.');
            let target = cached;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!target[parts[i]]) return false;
                target = target[parts[i]];
            }
            delete target[parts[parts.length - 1]];
        } else {
            delete cached[field];
        }
        
        cached.lastUpdated = Date.now();
        
        // Queue for DB deletion
        const dbField = field.startsWith('gameData.') ? field : `gameData.${field}`;
        this.queueDelete(channelId, dbField);
        
        return true;
    }
    
    /**
     * Queue field deletion for DB
     */
    queueDelete(channelId, field) {
        // Store as special marker for deletion
        const pending = this.pendingWrites.get(channelId) || {};
        pending[`__delete_${field}`] = true;
        this.pendingWrites.set(channelId, pending);
    }
}

// Export singleton instance
const mapCacheSystem = new MapCacheSystem();

// Auto-preload on module load (async, non-blocking)
setTimeout(() => {
    mapCacheSystem.preloadAll().then(count => {
        console.log(`[MAP_CACHE] Auto-preload completed: ${count} channels`);
    }).catch(err => {
        console.error('[MAP_CACHE] Auto-preload failed:', err);
    });
}, 5000); // Wait 5 seconds after bot startup

module.exports = mapCacheSystem;
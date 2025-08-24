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
            
            // Fetch from DB once using lean() for plain JavaScript object
            const dbEntry = await gachaVC.findOne({ channelId }).lean();
            
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
        
        // Merge updates while checking for path conflicts
        for (const [key, value] of Object.entries(updates)) {
            // Check if this update conflicts with existing pending updates
            const conflictingKeys = [];
            
            for (const existingKey of Object.keys(pending)) {
                // Skip delete markers
                if (existingKey.startsWith('__delete_')) continue;
                
                // Check if one path is a parent of the other
                if (this.isPathConflict(key, existingKey)) {
                    conflictingKeys.push(existingKey);
                }
            }
            
            // Remove conflicting keys (prefer the more specific update)
            for (const conflictKey of conflictingKeys) {
                // If the new key is more specific (longer), remove the broader one
                // If the existing key is more specific, skip adding the new one
                if (key.length > conflictKey.length) {
                    delete pending[conflictKey];
                } else if (key.length < conflictKey.length) {
                    // Don't add this update, the existing one is more specific
                    continue;
                }
            }
            
            pending[key] = value;
        }
        
        this.pendingWrites.set(channelId, pending);
    }
    
    /**
     * Check if two paths conflict (one is parent of the other)
     */
    isPathConflict(path1, path2) {
        // Check if path1 is a parent of path2 or vice versa
        const parts1 = path1.split('.');
        const parts2 = path2.split('.');
        
        const minLength = Math.min(parts1.length, parts2.length);
        
        // Check if the shorter path is a prefix of the longer one
        for (let i = 0; i < minLength; i++) {
            if (parts1[i] !== parts2[i]) {
                return false;
            }
        }
        
        // If we got here, one is a parent of the other
        return parts1.length !== parts2.length;
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
                // Final conflict check before writing
                const cleanedUpdates = this.cleanConflictingPaths(updates);
                
                // Separate regular updates from deletes
                const setUpdates = {};
                const unsetUpdates = {};
                
                for (const [key, value] of Object.entries(cleanedUpdates)) {
                    if (key.startsWith('__delete_')) {
                        const fieldPath = key.replace('__delete_', '');
                        unsetUpdates[fieldPath] = "";
                    } else {
                        setUpdates[key] = value;
                    }
                }
                
                // Build the update operation
                const updateOp = {};
                if (Object.keys(setUpdates).length > 0) {
                    updateOp.$set = setUpdates;
                }
                if (Object.keys(unsetUpdates).length > 0) {
                    updateOp.$unset = unsetUpdates;
                }
                
                if (Object.keys(updateOp).length > 0) {
                    await gachaVC.updateOne(
                        { channelId },
                        updateOp,
                        { upsert: false }
                    );
                    this.stats.writes++;
                }
            } catch (error) {
                console.error(`[MAP_CACHE] Failed to write to DB for ${channelId}:`, error);
                this.stats.errors++;
                
                // Log the specific updates that failed for debugging
                if (error.code === 40) {
                    console.error('[MAP_CACHE] Conflict error with updates:', Object.keys(updates));
                }
                
                // Don't re-queue on conflict errors as they'll keep failing
                if (error.code !== 40) {
                    // Re-queue failed writes for non-conflict errors
                    this.queueWrite(channelId, updates);
                }
            }
        });
        
        // Fire and forget - don't await
        Promise.all(promises).catch(err => {
            console.error('[MAP_CACHE] Batch write error:', err);
        });
    }
    
    /**
     * Clean conflicting paths from an update object
     */
    cleanConflictingPaths(updates) {
        const cleaned = {};
        const paths = Object.keys(updates);
        
        // First, remove exact duplicates (shouldn't happen but just in case)
        const uniquePaths = [...new Set(paths)];
        
        // Group paths by their root and check for conflicts
        const pathGroups = {};
        
        for (const path of uniquePaths) {
            // Skip delete markers for now, handle them separately
            if (path.startsWith('__delete_')) {
                cleaned[path] = updates[path];
                continue;
            }
            
            // Get the root of the path (e.g., 'gameData.map' from 'gameData.map.field')
            const parts = path.split('.');
            let root = parts[0];
            if (parts.length > 1 && parts[0] === 'gameData') {
                root = `${parts[0]}.${parts[1]}`;
            }
            
            if (!pathGroups[root]) {
                pathGroups[root] = [];
            }
            pathGroups[root].push(path);
        }
        
        // Process each group to resolve conflicts
        for (const [root, groupPaths] of Object.entries(pathGroups)) {
            if (groupPaths.length === 1) {
                // No conflict in this group
                cleaned[groupPaths[0]] = updates[groupPaths[0]];
            } else {
                // Sort paths by specificity (more dots = more specific)
                groupPaths.sort((a, b) => {
                    const aDepth = a.split('.').length;
                    const bDepth = b.split('.').length;
                    return bDepth - aDepth; // Most specific first
                });
                
                // Check for parent-child conflicts
                const toKeep = [];
                for (const path of groupPaths) {
                    let hasParentConflict = false;
                    
                    for (const otherPath of groupPaths) {
                        if (path !== otherPath && this.isPathConflict(path, otherPath)) {
                            // If this path is less specific (parent), skip it
                            if (path.split('.').length < otherPath.split('.').length) {
                                hasParentConflict = true;
                                console.log(`[MAP_CACHE] Removing parent path '${path}' in favor of child '${otherPath}'`);
                                break;
                            }
                        }
                    }
                    
                    if (!hasParentConflict) {
                        toKeep.push(path);
                    }
                }
                
                // Add the paths we're keeping
                for (const path of toKeep) {
                    cleaned[path] = updates[path];
                }
                
                // Log if we removed any paths
                if (toKeep.length < groupPaths.length) {
                    console.log(`[MAP_CACHE] Resolved conflicts in ${root}: kept ${toKeep.length} of ${groupPaths.length} paths`);
                }
            }
        }
        
        // Log the cleaning results for debugging
        if (Object.keys(updates).length !== Object.keys(cleaned).length) {
            console.log(`[MAP_CACHE] Cleaned updates: ${Object.keys(updates).length} -> ${Object.keys(cleaned).length} paths`);
            console.log('[MAP_CACHE] Removed paths:', Object.keys(updates).filter(k => !cleaned.hasOwnProperty(k)));
        }
        
        return cleaned;
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
        
        let successCount = 0;
        let errorCount = 0;
        
        // Process each write individually to better handle errors
        const results = await Promise.allSettled(writes.map(async ([channelId, updates]) => {
            try {
                // Log original updates for debugging
                if (Object.keys(updates).length > 10) {
                    console.log(`[MAP_CACHE] Channel ${channelId} has ${Object.keys(updates).length} pending updates`);
                }
                
                // Clean conflicting paths before writing
                const cleanedUpdates = this.cleanConflictingPaths(updates);
                
                // Separate regular updates from deletes
                const setUpdates = {};
                const unsetUpdates = {};
                
                for (const [key, value] of Object.entries(cleanedUpdates)) {
                    if (key.startsWith('__delete_')) {
                        const fieldPath = key.replace('__delete_', '');
                        unsetUpdates[fieldPath] = "";
                    } else {
                        setUpdates[key] = value;
                    }
                }
                
                // Build the update operation
                const updateOp = {};
                if (Object.keys(setUpdates).length > 0) {
                    updateOp.$set = setUpdates;
                }
                if (Object.keys(unsetUpdates).length > 0) {
                    updateOp.$unset = unsetUpdates;
                }
                
                if (Object.keys(updateOp).length > 0) {
                    // Log complex updates for debugging
                    if (Object.keys(setUpdates).length > 5) {
                        console.log(`[MAP_CACHE] Large update for ${channelId}: ${Object.keys(setUpdates).length} set operations`);
                    }
                    
                    await gachaVC.updateOne(
                        { channelId },
                        updateOp,
                        { upsert: false }
                    );
                    successCount++;
                }
            } catch (error) {
                errorCount++;
                
                // Detailed error logging
                if (error.code === 40) {
                    console.error(`[MAP_CACHE] Conflict error for channel ${channelId}:`);
                    console.error(`  Error message: ${error.errmsg}`);
                    console.error(`  Update paths attempted:`, Object.keys(updates));
                    
                    // Try to identify the specific conflicting path from the error message
                    const conflictMatch = error.errmsg.match(/at '([^']+)'/);
                    if (conflictMatch) {
                        const conflictPath = conflictMatch[1];
                        console.error(`  Conflicting path: ${conflictPath}`);
                        
                        // Find all updates related to this path
                        const relatedPaths = Object.keys(updates).filter(path => 
                            path.startsWith(conflictPath) || conflictPath.startsWith(path.replace('__delete_', ''))
                        );
                        console.error(`  Related paths in update:`, relatedPaths);
                    }
                } else {
                    console.error(`[MAP_CACHE] Failed to flush channel ${channelId}:`, error.message);
                }
                
                throw error; // Re-throw to be caught by allSettled
            }
        }));
        
        // Log summary
        const failedWrites = results.filter(r => r.status === 'rejected');
        
        if (failedWrites.length > 0) {
            console.error(`[MAP_CACHE] Force flush completed with errors: ${successCount} succeeded, ${errorCount} failed`);
            this.stats.errors += errorCount;
        } else {
            console.log(`[MAP_CACHE] Force flush completed successfully: ${successCount} writes`);
        }
        
        this.stats.writes += successCount;
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
            }).select('channelId gameData nextShopRefresh nextTrigger').lean();
            
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
    
    /**
     * Diagnostic method to inspect pending writes and identify conflicts
     */
    inspectPendingWrites(channelId = null) {
        console.log('\n[MAP_CACHE] === PENDING WRITES INSPECTION ==="');
        
        if (channelId) {
            // Inspect specific channel
            const pending = this.pendingWrites.get(channelId);
            if (!pending) {
                console.log(`No pending writes for channel ${channelId}`);
                return;
            }
            
            console.log(`Channel ${channelId}: ${Object.keys(pending).length} pending updates`);
            this.analyzePendingUpdates(pending);
        } else {
            // Inspect all channels
            if (this.pendingWrites.size === 0) {
                console.log('No pending writes in queue');
                return;
            }
            
            for (const [channelId, pending] of this.pendingWrites.entries()) {
                console.log(`\nChannel ${channelId}: ${Object.keys(pending).length} pending updates`);
                this.analyzePendingUpdates(pending);
            }
        }
        
        console.log('\n=== END INSPECTION ===\n');
    }
    
    /**
     * Analyze pending updates for conflicts
     */
    analyzePendingUpdates(updates) {
        const paths = Object.keys(updates);
        const conflicts = [];
        
        // Group by root path
        const groups = {};
        for (const path of paths) {
            const root = path.split('.').slice(0, 2).join('.');
            if (!groups[root]) groups[root] = [];
            groups[root].push(path);
        }
        
        // Check each group for conflicts
        for (const [root, groupPaths] of Object.entries(groups)) {
            if (groupPaths.length > 1) {
                // Check for parent-child conflicts
                for (let i = 0; i < groupPaths.length; i++) {
                    for (let j = i + 1; j < groupPaths.length; j++) {
                        if (this.isPathConflict(groupPaths[i], groupPaths[j])) {
                            conflicts.push([groupPaths[i], groupPaths[j]]);
                        }
                    }
                }
            }
        }
        
        // Report findings
        console.log(`  Paths by root:`);
        for (const [root, groupPaths] of Object.entries(groups)) {
            console.log(`    ${root}: ${groupPaths.length} updates`);
            if (groupPaths.length <= 5) {
                groupPaths.forEach(p => console.log(`      - ${p}`));
            } else {
                console.log(`      - [${groupPaths.length} paths, showing first 5]`);
                groupPaths.slice(0, 5).forEach(p => console.log(`      - ${p}`));
            }
        }
        
        if (conflicts.length > 0) {
            console.log(`  ⚠️  Found ${conflicts.length} conflicts:`);
            conflicts.forEach(([path1, path2]) => {
                console.log(`    - "${path1}" conflicts with "${path2}"`);
            });
        } else {
            console.log(`  ✅ No conflicts detected`);
        }
    }
    
    /**
     * Manually clear pending writes for a channel (use with caution)
     */
    clearPendingWrites(channelId = null) {
        if (channelId) {
            if (this.pendingWrites.has(channelId)) {
                this.pendingWrites.delete(channelId);
                console.log(`[MAP_CACHE] Cleared pending writes for channel ${channelId}`);
            }
        } else {
            const count = this.pendingWrites.size;
            this.pendingWrites.clear();
            console.log(`[MAP_CACHE] Cleared all pending writes (${count} channels)`);
        }
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
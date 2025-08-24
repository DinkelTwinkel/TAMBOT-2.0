// UnifiedDialoguePool.js
// Unified dialogue pooling system for both Inn and Shop AI dialogue
// Handles persistent storage and intelligent reuse to minimize API costs

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class UnifiedDialoguePool {
    constructor(dataPath = './data/dialoguePool') {
        this.dataPath = dataPath;
        this.pools = {
            // Inn-specific pools
            inn: {
                npc: new Map(),
                player: new Map(),
                barFight: new Map(),
                events: new Map(),
                rumors: new Map(),
                innkeeperComments: new Map()
            },
            // Shop-specific pools
            shop: {
                idle: new Map(),
                purchase: new Map(),
                sell: new Map(),
                poor: new Map(),
                noItem: new Map()
            }
        };
        
        // Unified configuration
        this.config = {
            generationProbability: {
                0: 1.0,    // Always generate when pool is empty
                10: 0.8,   // 80% chance with <10 items
                25: 0.5,   // 50% chance with <25 items
                50: 0.2,   // 20% chance with <50 items
                100: 0.1,  // 10% chance with <100 items
                200: 0.05, // 5% chance with <200 items
                500: 0.02  // 2% chance with 500+ items
            },
            minVarietyBuffer: 10,
            recentUsageWindow: 20,
            autoSaveThreshold: 5,
            maxPoolSize: 1000,
            // Cost tracking
            apiCostPerCall: 0.0003
        };
        
        this.pendingWrites = 0;
        this.recentlyUsed = new Map();
        this.stats = {
            inn: {
                totalGenerated: 0,
                totalReused: 0,
                apiCallsSaved: 0,
                costSaved: 0
            },
            shop: {
                totalGenerated: 0,
                totalReused: 0,
                apiCallsSaved: 0,
                costSaved: 0
            },
            total: {
                totalGenerated: 0,
                totalReused: 0,
                apiCallsSaved: 0,
                costSaved: 0
            }
        };
        
        this.initialized = false;
    }
    
    /**
     * Initialize the pool system
     */
    async initialize() {
        if (this.initialized) return;
        
        try {
            // Ensure data directories exist
            await fs.mkdir(this.dataPath, { recursive: true });
            await fs.mkdir(path.join(this.dataPath, 'inn'), { recursive: true });
            await fs.mkdir(path.join(this.dataPath, 'shop'), { recursive: true });
            
            // Load existing pools
            await this.loadAllPools();
            
            // Load stats
            await this.loadStats();
            
            this.initialized = true;
            console.log('[UnifiedPool] Initialized with pools:', this.getPoolSummary());
            
        } catch (error) {
            console.error('[UnifiedPool] Initialization error:', error);
            this.initialized = true; // Continue anyway
        }
    }
    
    /**
     * Get dialogue with intelligent pooling (main entry point)
     */
    async getDialogue(system, category, contextKey, generateFunction, contextData = {}) {
        await this.ensureInitialized();
        
        // Validate system
        if (!['inn', 'shop'].includes(system)) {
            throw new Error(`Invalid system: ${system}. Must be 'inn' or 'shop'`);
        }
        
        // Create a hash key for this specific context
        const hashKey = this.createContextHash(contextKey, contextData);
        
        // Check if we should generate new or use existing
        const shouldGenerate = this.shouldGenerateNew(system, category, hashKey);
        
        if (!shouldGenerate) {
            // Try to get from pool
            const pooledDialogue = this.getFromPool(system, category, hashKey);
            if (pooledDialogue) {
                this.updateStats(system, 'reused');
                console.log(`[UnifiedPool] Reused ${system}/${category} dialogue (${this.getContextPoolSize(system, category, hashKey)} available)`);
                return pooledDialogue;
            }
        }
        
        // Generate new dialogue
        try {
            const newDialogue = await generateFunction();
            if (newDialogue) {
                await this.addToPool(system, category, hashKey, newDialogue, contextData);
                this.updateStats(system, 'generated');
                console.log(`[UnifiedPool] Generated new ${system}/${category} dialogue (pool: ${this.getContextPoolSize(system, category, hashKey)})`);
                return newDialogue;
            }
        } catch (error) {
            console.error(`[UnifiedPool] Generation failed for ${system}/${category}:`, error);
            
            // Fallback to any available dialogue from pool
            const fallback = this.getFromPool(system, category, hashKey, true);
            if (fallback) {
                this.updateStats(system, 'reused');
                return fallback;
            }
        }
        
        return null;
    }
    
    /**
     * Determine if we should generate new dialogue
     */
    shouldGenerateNew(system, category, contextKey) {
        const pool = this.pools[system]?.[category];
        if (!pool) return true;
        
        const contextPool = pool.get(contextKey);
        const contextSize = contextPool ? contextPool.length : 0;
        
        // Always generate if context pool is empty
        if (contextSize === 0) return true;
        
        // Find the appropriate probability threshold
        let probability = 1.0;
        for (const [threshold, prob] of Object.entries(this.config.generationProbability)) {
            if (contextSize >= parseInt(threshold)) {
                probability = prob;
            }
        }
        
        // Add boost if we haven't generated recently for this context
        const lastGenerated = this.getLastGeneratedTime(system, category, contextKey);
        const hoursSinceGeneration = (Date.now() - lastGenerated) / (1000 * 60 * 60);
        if (hoursSinceGeneration > 24) {
            probability = Math.min(1.0, probability * 2); // Double chance after 24 hours
        }
        
        return Math.random() < probability;
    }
    
    /**
     * Add dialogue to pool
     */
    async addToPool(system, category, contextKey, dialogue, metadata = {}) {
        if (!this.pools[system]) {
            this.pools[system] = {};
        }
        if (!this.pools[system][category]) {
            this.pools[system][category] = new Map();
        }
        
        const categoryPool = this.pools[system][category];
        if (!categoryPool.has(contextKey)) {
            categoryPool.set(contextKey, []);
        }
        
        const contextPool = categoryPool.get(contextKey);
        
        // Create entry with metadata
        const entry = {
            id: crypto.randomBytes(8).toString('hex'),
            dialogue: dialogue,
            contextKey: contextKey,
            metadata: {
                ...metadata,
                createdAt: Date.now(),
                usageCount: 0,
                lastUsed: null,
                quality: metadata.quality || 'standard',
                system: system,
                category: category
            }
        };
        
        // Add to pool
        contextPool.push(entry);
        
        // Trim if exceeding max size
        if (contextPool.length > this.config.maxPoolSize) {
            contextPool.sort((a, b) => (a.metadata.lastUsed || 0) - (b.metadata.lastUsed || 0));
            contextPool.splice(0, contextPool.length - this.config.maxPoolSize);
        }
        
        // Auto-save if threshold reached
        this.pendingWrites++;
        if (this.pendingWrites >= this.config.autoSaveThreshold) {
            await this.savePool(system, category);
            this.pendingWrites = 0;
        }
        
        return entry.id;
    }
    
    /**
     * Get dialogue from pool with variety management
     */
    getFromPool(system, category, contextKey, forceFallback = false) {
        const pool = this.pools[system]?.[category];
        if (!pool) return null;
        
        let contextPool = pool.get(contextKey);
        
        // If no exact context match and forcing fallback, try similar contexts
        if (!contextPool && forceFallback) {
            const similarKeys = Array.from(pool.keys()).filter(key => 
                this.calculateContextSimilarity(contextKey, key) > 0.5
            );
            
            if (similarKeys.length > 0) {
                const bestKey = similarKeys[0];
                contextPool = pool.get(bestKey);
            }
        }
        
        if (!contextPool || contextPool.length === 0) return null;
        
        // Get recently used for this context
        const recentKey = `${system}-${category}-${contextKey}`;
        const recentlyUsed = this.recentlyUsed.get(recentKey) || [];
        
        // Filter out recently used dialogue
        const available = contextPool.filter(entry => 
            !recentlyUsed.includes(entry.id)
        );
        
        // If all have been used recently, use the least recently used
        const candidates = available.length > 0 ? available : contextPool;
        
        // Weight selection by quality and usage
        const selected = this.weightedSelection(candidates);
        
        if (selected) {
            // Update usage tracking
            selected.metadata.usageCount++;
            selected.metadata.lastUsed = Date.now();
            
            // Track as recently used
            recentlyUsed.push(selected.id);
            if (recentlyUsed.length > this.config.recentUsageWindow) {
                recentlyUsed.shift();
            }
            this.recentlyUsed.set(recentKey, recentlyUsed);
            
            return selected.dialogue;
        }
        
        return null;
    }
    
    /**
     * Weighted selection based on quality and usage
     */
    weightedSelection(candidates) {
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        
        const weights = candidates.map(entry => {
            let weight = 1.0;
            
            // Prefer less used dialogue
            weight *= Math.max(0.1, 1 - (entry.metadata.usageCount * 0.1));
            
            // Prefer quality dialogue
            if (entry.metadata.quality === 'excellent') weight *= 2;
            if (entry.metadata.quality === 'poor') weight *= 0.5;
            
            // Slight preference for newer content
            const age = Date.now() - entry.metadata.createdAt;
            const ageDays = age / (1000 * 60 * 60 * 24);
            weight *= Math.max(0.5, 1 - (ageDays / 365));
            
            return weight;
        });
        
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < candidates.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return candidates[i];
            }
        }
        
        return candidates[0];
    }
    
    /**
     * Create context hash for categorization
     */
    createContextHash(contextKey, contextData) {
        const normalizedData = {
            key: contextKey,
            mood: contextData.mood || 'neutral',
            wealth: contextData.wealth ? Math.floor(contextData.wealth / 3) : 'unknown',
            innType: contextData.innType || contextData.shopType || 'default',
            eventType: contextData.eventType || 'none',
            shopkeeper: contextData.shopkeeper || 'unknown'
        };
        
        return crypto.createHash('md5')
            .update(JSON.stringify(normalizedData))
            .digest('hex')
            .substring(0, 12);
    }
    
    /**
     * Calculate similarity between context keys
     */
    calculateContextSimilarity(key1, key2) {
        if (key1 === key2) return 1.0;
        
        let commonPrefix = 0;
        for (let i = 0; i < Math.min(key1.length, key2.length); i++) {
            if (key1[i] === key2[i]) commonPrefix++;
            else break;
        }
        
        return commonPrefix / Math.max(key1.length, key2.length);
    }
    
    /**
     * Update statistics
     */
    updateStats(system, action) {
        const increment = action === 'generated' ? 'totalGenerated' : 'totalReused';
        
        // Update system-specific stats
        this.stats[system][increment]++;
        
        // Update API calls saved and cost for reuse
        if (action === 'reused') {
            this.stats[system].apiCallsSaved++;
            this.stats[system].costSaved += this.config.apiCostPerCall;
        }
        
        // Update total stats
        this.stats.total[increment]++;
        if (action === 'reused') {
            this.stats.total.apiCallsSaved++;
            this.stats.total.costSaved += this.config.apiCostPerCall;
        }
    }
    
    /**
     * Get pool summary
     */
    getPoolSummary() {
        const summary = {
            inn: {},
            shop: {},
            total: { contexts: 0, dialogues: 0 }
        };
        
        // Count inn pools
        for (const [category, pool] of Object.entries(this.pools.inn)) {
            let totalDialogue = 0;
            for (const contextPool of pool.values()) {
                totalDialogue += contextPool.length;
            }
            summary.inn[category] = {
                contexts: pool.size,
                dialogues: totalDialogue
            };
            summary.total.contexts += pool.size;
            summary.total.dialogues += totalDialogue;
        }
        
        // Count shop pools
        for (const [category, pool] of Object.entries(this.pools.shop)) {
            let totalDialogue = 0;
            for (const contextPool of pool.values()) {
                totalDialogue += contextPool.length;
            }
            summary.shop[category] = {
                contexts: pool.size,
                dialogues: totalDialogue
            };
            summary.total.contexts += pool.size;
            summary.total.dialogues += totalDialogue;
        }
        
        return summary;
    }
    
    /**
     * Get context pool size
     */
    getContextPoolSize(system, category, contextKey) {
        const pool = this.pools[system]?.[category];
        if (!pool) return 0;
        const contextPool = pool.get(contextKey);
        return contextPool ? contextPool.length : 0;
    }
    
    /**
     * Get last generated time
     */
    getLastGeneratedTime(system, category, contextKey) {
        const pool = this.pools[system]?.[category];
        if (!pool) return 0;
        
        const contextPool = pool.get(contextKey);
        if (!contextPool || contextPool.length === 0) return 0;
        
        let mostRecent = 0;
        for (const entry of contextPool) {
            if (entry.metadata.createdAt > mostRecent) {
                mostRecent = entry.metadata.createdAt;
            }
        }
        
        return mostRecent;
    }
    
    /**
     * Save pool to disk
     */
    async savePool(system, category) {
        const pool = this.pools[system]?.[category];
        if (!pool || pool.size === 0) return;
        
        const filePath = path.join(this.dataPath, system, `${category}_pool.json`);
        
        try {
            const data = {
                system: system,
                category: category,
                version: '1.0',
                savedAt: Date.now(),
                pools: {}
            };
            
            for (const [contextKey, contextPool] of pool.entries()) {
                data.pools[contextKey] = contextPool;
            }
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`[UnifiedPool] Saved ${system}/${category} pool (${pool.size} contexts)`);
            
        } catch (error) {
            console.error(`[UnifiedPool] Failed to save ${system}/${category} pool:`, error);
        }
    }
    
    /**
     * Load pool from disk
     */
    async loadPool(system, category) {
        const filePath = path.join(this.dataPath, system, `${category}_pool.json`);
        
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(data);
            
            if (!this.pools[system]) {
                this.pools[system] = {};
            }
            if (!this.pools[system][category]) {
                this.pools[system][category] = new Map();
            }
            
            for (const [contextKey, contextPool] of Object.entries(parsed.pools)) {
                this.pools[system][category].set(contextKey, contextPool);
            }
            
            console.log(`[UnifiedPool] Loaded ${system}/${category} pool (${this.pools[system][category].size} contexts)`);
            
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`[UnifiedPool] Failed to load ${system}/${category} pool:`, error);
            }
        }
    }
    
    /**
     * Load all pools
     */
    async loadAllPools() {
        // Load inn pools
        for (const category of Object.keys(this.pools.inn)) {
            await this.loadPool('inn', category);
        }
        
        // Load shop pools
        for (const category of Object.keys(this.pools.shop)) {
            await this.loadPool('shop', category);
        }
    }
    
    /**
     * Save all pools
     */
    async saveAllPools() {
        // Save inn pools
        for (const category of Object.keys(this.pools.inn)) {
            await this.savePool('inn', category);
        }
        
        // Save shop pools
        for (const category of Object.keys(this.pools.shop)) {
            await this.savePool('shop', category);
        }
        
        await this.saveStats();
    }
    
    /**
     * Save statistics
     */
    async saveStats() {
        const filePath = path.join(this.dataPath, 'stats.json');
        
        try {
            const data = {
                ...this.stats,
                poolSummary: this.getPoolSummary(),
                savedAt: Date.now()
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            
        } catch (error) {
            console.error('[UnifiedPool] Failed to save stats:', error);
        }
    }
    
    /**
     * Load statistics
     */
    async loadStats() {
        const filePath = path.join(this.dataPath, 'stats.json');
        
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(data);
            
            // Merge loaded stats with current structure
            if (parsed.inn) this.stats.inn = { ...this.stats.inn, ...parsed.inn };
            if (parsed.shop) this.stats.shop = { ...this.stats.shop, ...parsed.shop };
            if (parsed.total) this.stats.total = { ...this.stats.total, ...parsed.total };
            
            console.log('[UnifiedPool] Loaded stats:', {
                inn: `${this.stats.inn.totalGenerated} generated, ${this.stats.inn.totalReused} reused`,
                shop: `${this.stats.shop.totalGenerated} generated, ${this.stats.shop.totalReused} reused`,
                totalSaved: `$${this.stats.total.costSaved.toFixed(2)}`
            });
            
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('[UnifiedPool] Failed to load stats:', error);
            }
        }
    }
    
    /**
     * Ensure initialized
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    
    /**
     * Get statistics report
     */
    getStatsReport() {
        const summary = this.getPoolSummary();
        
        return {
            inn: {
                ...this.stats.inn,
                pools: summary.inn,
                reuseRate: this.calculateReuseRate(this.stats.inn),
                efficiency: this.calculateEfficiency(this.stats.inn)
            },
            shop: {
                ...this.stats.shop,
                pools: summary.shop,
                reuseRate: this.calculateReuseRate(this.stats.shop),
                efficiency: this.calculateEfficiency(this.stats.shop)
            },
            total: {
                ...this.stats.total,
                totalDialogues: summary.total.dialogues,
                totalContexts: summary.total.contexts,
                reuseRate: this.calculateReuseRate(this.stats.total),
                efficiency: this.calculateEfficiency(this.stats.total),
                monthlySavings: this.estimateMonthlySavings()
            }
        };
    }
    
    /**
     * Calculate reuse rate
     */
    calculateReuseRate(stats) {
        const total = stats.totalGenerated + stats.totalReused;
        if (total === 0) return '0%';
        return `${(stats.totalReused / total * 100).toFixed(1)}%`;
    }
    
    /**
     * Calculate efficiency
     */
    calculateEfficiency(stats) {
        if (stats.totalGenerated === 0) return 'N/A';
        return `${(stats.apiCallsSaved / stats.totalGenerated).toFixed(1)}x reduction`;
    }
    
    /**
     * Estimate monthly savings
     */
    estimateMonthlySavings() {
        const dailyRate = this.stats.total.costSaved / Math.max(1, this.getDaysSinceFirstUse());
        return `$${(dailyRate * 30).toFixed(2)}`;
    }
    
    /**
     * Get days since first use
     */
    getDaysSinceFirstUse() {
        // This would ideally track the first usage date
        // For now, estimate based on total dialogues
        const estimatedDailyUsage = 100;
        const totalUsage = this.stats.total.totalGenerated + this.stats.total.totalReused;
        return Math.max(1, totalUsage / estimatedDailyUsage);
    }
    
    /**
     * Export pool for backup
     */
    async exportPool(outputPath) {
        const exportData = {
            version: '1.0',
            exportedAt: Date.now(),
            stats: this.stats,
            pools: {
                inn: {},
                shop: {}
            }
        };
        
        // Export inn pools
        for (const [category, pool] of Object.entries(this.pools.inn)) {
            exportData.pools.inn[category] = {};
            for (const [contextKey, contextPool] of pool.entries()) {
                exportData.pools.inn[category][contextKey] = contextPool;
            }
        }
        
        // Export shop pools
        for (const [category, pool] of Object.entries(this.pools.shop)) {
            exportData.pools.shop[category] = {};
            for (const [contextKey, contextPool] of pool.entries()) {
                exportData.pools.shop[category][contextKey] = contextPool;
            }
        }
        
        await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
        console.log(`[UnifiedPool] Exported to ${outputPath}`);
    }
    
    /**
     * Import pool from backup
     */
    async importPool(inputPath) {
        try {
            const data = await fs.readFile(inputPath, 'utf8');
            const parsed = JSON.parse(data);
            
            // Merge stats
            if (parsed.stats) {
                // Add to existing stats rather than replacing
                ['inn', 'shop', 'total'].forEach(system => {
                    if (parsed.stats[system]) {
                        this.stats[system].totalGenerated += parsed.stats[system].totalGenerated || 0;
                        this.stats[system].totalReused += parsed.stats[system].totalReused || 0;
                        this.stats[system].apiCallsSaved += parsed.stats[system].apiCallsSaved || 0;
                        this.stats[system].costSaved += parsed.stats[system].costSaved || 0;
                    }
                });
            }
            
            // Merge pools
            if (parsed.pools) {
                // Merge inn pools
                if (parsed.pools.inn) {
                    for (const [category, poolData] of Object.entries(parsed.pools.inn)) {
                        if (!this.pools.inn[category]) {
                            this.pools.inn[category] = new Map();
                        }
                        
                        for (const [contextKey, contextPool] of Object.entries(poolData)) {
                            const existing = this.pools.inn[category].get(contextKey) || [];
                            const merged = [...existing, ...contextPool];
                            
                            // Remove duplicates based on dialogue text
                            const unique = merged.filter((entry, index, self) =>
                                index === self.findIndex(e => e.dialogue === entry.dialogue)
                            );
                            
                            this.pools.inn[category].set(contextKey, unique);
                        }
                    }
                }
                
                // Merge shop pools
                if (parsed.pools.shop) {
                    for (const [category, poolData] of Object.entries(parsed.pools.shop)) {
                        if (!this.pools.shop[category]) {
                            this.pools.shop[category] = new Map();
                        }
                        
                        for (const [contextKey, contextPool] of Object.entries(poolData)) {
                            const existing = this.pools.shop[category].get(contextKey) || [];
                            const merged = [...existing, ...contextPool];
                            
                            // Remove duplicates
                            const unique = merged.filter((entry, index, self) =>
                                index === self.findIndex(e => e.dialogue === entry.dialogue)
                            );
                            
                            this.pools.shop[category].set(contextKey, unique);
                        }
                    }
                }
            }
            
            await this.saveAllPools();
            console.log(`[UnifiedPool] Imported from ${inputPath}`);
            
        } catch (error) {
            console.error('[UnifiedPool] Import failed:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new UnifiedDialoguePool();
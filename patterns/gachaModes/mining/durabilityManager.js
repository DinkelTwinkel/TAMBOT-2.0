// durabilityManager.js - Centralized durability management to prevent duplicate breaks
const { handlePickaxeDurability } = require('./improvedDurabilityHandling');

class DurabilityManager {
    constructor() {
        // Track which players have already had durability checked this tick
        this.processedThisTick = new Set();
        // Track the last tick time to reset the processed set
        this.lastTickTime = 0;
        // Tick duration in milliseconds (adjust as needed)
        this.tickDuration = 1000; // 1 second
    }

    /**
     * Reset the tracking if we're in a new tick
     */
    resetIfNewTick() {
        const currentTime = Date.now();
        if (currentTime - this.lastTickTime >= this.tickDuration) {
            this.processedThisTick.clear();
            this.lastTickTime = currentTime;
            console.log(`[DURABILITY MANAGER] New tick - cleared processed players`);
        }
    }

    /**
     * Check if durability should be processed for a player
     * @param {string} playerId - The player's ID
     * @param {string} actionType - Type of action (e.g., 'mining', 'area_damage', 'chain_mining')
     * @returns {boolean} - Whether durability should be processed
     */
    shouldProcessDurability(playerId, actionType = 'mining') {
        this.resetIfNewTick();
        
        const key = `${playerId}_${actionType}`;
        
        // Check if this player+action combo has already been processed
        if (this.processedThisTick.has(key)) {
            console.log(`[DURABILITY MANAGER] Skipping duplicate durability check for ${playerId} (${actionType})`);
            return false;
        }
        
        return true;
    }

    /**
     * Mark a player's durability as processed for this tick
     * @param {string} playerId - The player's ID
     * @param {string} actionType - Type of action
     */
    markAsProcessed(playerId, actionType = 'mining') {
        const key = `${playerId}_${actionType}`;
        this.processedThisTick.add(key);
        console.log(`[DURABILITY MANAGER] Marked ${playerId} as processed for ${actionType}`);
    }

    /**
     * Handle pickaxe durability with duplicate prevention
     * @param {string} playerId - The player's ID
     * @param {string} playerTag - The player's tag/name
     * @param {Object} pickaxe - The pickaxe object
     * @param {number} durabilityLoss - Amount of durability to lose
     * @param {string} actionType - Type of action causing durability loss
     * @returns {Object} - Result of durability handling
     */
    async handleDurability(playerId, playerTag, pickaxe, durabilityLoss, actionType = 'mining') {
        // Check if we should process this durability loss
        if (!this.shouldProcessDurability(playerId, actionType)) {
            return {
                success: true,
                broke: false,
                skipped: true,
                reason: 'Already processed this tick'
            };
        }

        // Mark as processed before actually processing to prevent race conditions
        this.markAsProcessed(playerId, actionType);

        try {
            // Call the actual durability handling function
            const result = await handlePickaxeDurability(playerId, playerTag, pickaxe, durabilityLoss);
            
            // Log the result for debugging
            if (result.broke) {
                console.log(`[DURABILITY MANAGER] Pickaxe broke for ${playerTag} during ${actionType}`);
            }
            
            return result;
        } catch (error) {
            console.error(`[DURABILITY MANAGER] Error handling durability for ${playerId}:`, error);
            // On error, remove from processed set so it can be retried
            this.processedThisTick.delete(`${playerId}_${actionType}`);
            throw error;
        }
    }

    /**
     * Force reset the tracking (useful for testing or manual resets)
     */
    forceReset() {
        this.processedThisTick.clear();
        this.lastTickTime = 0;
        console.log(`[DURABILITY MANAGER] Force reset completed`);
    }

    /**
     * Get debug information
     */
    getDebugInfo() {
        return {
            processedCount: this.processedThisTick.size,
            processedPlayers: Array.from(this.processedThisTick),
            lastTickTime: new Date(this.lastTickTime).toISOString(),
            tickDuration: this.tickDuration
        };
    }
}

// Create a singleton instance
const durabilityManager = new DurabilityManager();

module.exports = durabilityManager;

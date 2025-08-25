// patch_wallsBroken_safety.js
// Import this at the top of mining_optimized_v5_performance.js to ensure safe wallsBroken operations

const { ensureNumeric, safeIncrementWallsBroken } = require('./mining_fixes/fix_wallsBroken_corruption');

/**
 * Patch the global scope to intercept wallsBroken updates
 * Add this after your imports in the main mining file
 */
function installWallsBrokenSafetyPatch() {
    console.log('[WALLSBROKEN PATCH] Installing safety patches...');
    
    // Create a proxy for safe stat updates
    const originalUpdateOne = require('../../models/activevcs').updateOne;
    
    // Override updateOne to ensure numeric operations on stats
    require('../../models/activevcs').updateOne = async function(filter, update, options) {
        // Check if we're updating stats
        if (update && update.$set) {
            // Fix wallsBroken if present
            if (update.$set['gameData.stats.wallsBroken'] !== undefined) {
                const originalValue = update.$set['gameData.stats.wallsBroken'];
                update.$set['gameData.stats.wallsBroken'] = ensureNumeric(originalValue, 0);
                
                if (originalValue !== update.$set['gameData.stats.wallsBroken']) {
                    console.warn(`[WALLSBROKEN PATCH] Corrected non-numeric value: ${originalValue} -> ${update.$set['gameData.stats.wallsBroken']}`);
                }
            }
            
            // Fix other stats too
            if (update.$set['gameData.stats.totalOreFound'] !== undefined) {
                update.$set['gameData.stats.totalOreFound'] = ensureNumeric(update.$set['gameData.stats.totalOreFound'], 0);
            }
            if (update.$set['gameData.stats.treasuresFound'] !== undefined) {
                update.$set['gameData.stats.treasuresFound'] = ensureNumeric(update.$set['gameData.stats.treasuresFound'], 0);
            }
            
            // Fix the entire stats object if it's being set
            if (update.$set['gameData.stats'] && typeof update.$set['gameData.stats'] === 'object') {
                const stats = update.$set['gameData.stats'];
                update.$set['gameData.stats'] = {
                    ...stats,
                    wallsBroken: ensureNumeric(stats.wallsBroken, 0),
                    totalOreFound: ensureNumeric(stats.totalOreFound, 0),
                    treasuresFound: ensureNumeric(stats.treasuresFound, 0),
                    lifetimeValue: stats.lifetimeValue || 0,
                    lifetimeRareOres: ensureNumeric(stats.lifetimeRareOres, 0),
                    exitTileFound: stats.exitTileFound === true,
                    exitTileFoundAt: stats.exitTileFoundAt
                };
            }
        }
        
        // Check $inc operations too
        if (update && update.$inc) {
            if (update.$inc['gameData.stats.wallsBroken'] !== undefined) {
                const originalInc = update.$inc['gameData.stats.wallsBroken'];
                update.$inc['gameData.stats.wallsBroken'] = ensureNumeric(originalInc, 0);
                
                if (originalInc !== update.$inc['gameData.stats.wallsBroken']) {
                    console.warn(`[WALLSBROKEN PATCH] Corrected non-numeric increment: ${originalInc} -> ${update.$inc['gameData.stats.wallsBroken']}`);
                }
            }
        }
        
        // Call the original function
        return originalUpdateOne.call(this, filter, update, options);
    };
    
    console.log('[WALLSBROKEN PATCH] Safety patches installed successfully');
}

/**
 * Helper function to safely update wallsBroken in a transaction or batch
 */
function safeWallsBrokenUpdate(currentValue, increment) {
    const safeCurrentValue = ensureNumeric(currentValue, 0);
    const safeIncrement = ensureNumeric(increment, 0);
    return safeCurrentValue + safeIncrement;
}

module.exports = {
    installWallsBrokenSafetyPatch,
    safeWallsBrokenUpdate,
    ensureNumeric
};

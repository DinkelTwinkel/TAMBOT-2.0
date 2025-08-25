// patch_applyAreaDamage_safety.js
// Safety patch to ensure applyAreaDamage always returns an integer

/**
 * Safe wrapper for applyAreaDamage that guarantees integer return
 * Use this if you want extra safety when calling applyAreaDamage
 */
async function safeApplyAreaDamage(...args) {
    const uniqueItemBonuses = require('./uniqueItemBonuses');
    
    try {
        const result = await uniqueItemBonuses.applyAreaDamage(...args);
        
        // Ensure we always return an integer
        if (typeof result === 'number') {
            return parseInt(result) || 0;
        }
        
        // If somehow we got an object (shouldn't happen with the fix)
        if (typeof result === 'object' && result !== null) {
            console.warn('[AREA DAMAGE] Unexpected object return, extracting wallsBroken');
            return parseInt(result.wallsBroken) || 0;
        }
        
        // Fallback to 0
        console.warn('[AREA DAMAGE] Unexpected return type:', typeof result);
        return 0;
        
    } catch (error) {
        console.error('[AREA DAMAGE] Error in applyAreaDamage:', error);
        return 0; // Always return 0 on error
    }
}

/**
 * Validates that a value is an integer
 * @param {*} value - Value to validate
 * @param {string} context - Context for logging
 * @returns {number} Integer value
 */
function ensureInteger(value, context = 'wallsBroken') {
    if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
    }
    
    if (typeof value === 'number') {
        console.warn(`[${context}] Converting float to integer:`, value);
        return Math.floor(value);
    }
    
    if (typeof value === 'string') {
        const parsed = parseInt(value);
        if (!isNaN(parsed)) {
            console.warn(`[${context}] Parsed string to integer:`, value, '->', parsed);
            return parsed;
        }
    }
    
    console.error(`[${context}] Could not convert to integer:`, value);
    return 0;
}

module.exports = {
    safeApplyAreaDamage,
    ensureInteger
};

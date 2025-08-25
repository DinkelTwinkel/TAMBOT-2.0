// fix_wallsBroken_stat.js
// Fixes the wallsBroken stat corruption issue where objects get concatenated as strings

const gachaVC = require('../../../models/activevcs');

/**
 * Fix corrupted wallsBroken stats in the database
 * Corrupted values look like: "950111[object Object]63263"
 */
async function fixCorruptedWallsBrokenStats() {
    try {
        console.log('[FIX] Scanning for corrupted wallsBroken stats...');
        
        // Find all documents with gameData.stats.wallsBroken
        const documents = await gachaVC.find({ 
            'gameData.stats.wallsBroken': { $exists: true } 
        });
        
        let fixedCount = 0;
        
        for (const doc of documents) {
            const wallsBroken = doc.gameData?.stats?.wallsBroken;
            
            if (wallsBroken === undefined || wallsBroken === null) continue;
            
            // Check if the value is corrupted (contains non-numeric characters except for decimals)
            const wallsBrokenStr = String(wallsBroken);
            
            // Check for [object Object] or other corruption patterns
            if (wallsBrokenStr.includes('[object') || 
                wallsBrokenStr.includes('NaN') ||
                !/^\d+(\.\d+)?$/.test(wallsBrokenStr)) {
                
                console.log(`[FIX] Found corrupted wallsBroken for channel ${doc.channelId}: "${wallsBrokenStr}"`);
                
                // Try to extract numbers from the corrupted string
                const numbers = wallsBrokenStr.match(/\d+/g);
                
                let fixedValue = 0;
                if (numbers && numbers.length > 0) {
                    // Sum all extracted numbers (this is a best guess)
                    fixedValue = numbers.reduce((sum, num) => sum + parseInt(num), 0);
                    console.log(`[FIX] Extracted numbers: ${numbers.join(', ')} -> Total: ${fixedValue}`);
                } else {
                    // If no numbers found, reset to 0
                    fixedValue = 0;
                    console.log(`[FIX] No numbers found, resetting to 0`);
                }
                
                // Update the document with the fixed value
                await gachaVC.updateOne(
                    { channelId: doc.channelId },
                    { $set: { 'gameData.stats.wallsBroken': fixedValue } }
                );
                
                console.log(`[FIX] Fixed wallsBroken for channel ${doc.channelId}: ${wallsBrokenStr} -> ${fixedValue}`);
                fixedCount++;
            }
            // Also check if it's a string that should be a number
            else if (typeof wallsBroken === 'string' && /^\d+$/.test(wallsBroken)) {
                const numericValue = parseInt(wallsBroken);
                
                await gachaVC.updateOne(
                    { channelId: doc.channelId },
                    { $set: { 'gameData.stats.wallsBroken': numericValue } }
                );
                
                console.log(`[FIX] Converted string to number for channel ${doc.channelId}: "${wallsBroken}" -> ${numericValue}`);
                fixedCount++;
            }
        }
        
        console.log(`[FIX] Completed. Fixed ${fixedCount} corrupted wallsBroken stats.`);
        return fixedCount;
        
    } catch (error) {
        console.error('[FIX] Error fixing wallsBroken stats:', error);
        return 0;
    }
}

/**
 * Safe increment function for wallsBroken stat
 * Ensures numeric addition instead of string concatenation
 */
async function safeIncrementWallsBroken(channelId, increment = 1) {
    try {
        // Ensure increment is a number
        const numericIncrement = parseInt(increment) || 0;
        
        if (numericIncrement <= 0) return;
        
        // Use MongoDB's $inc operator for atomic numeric increment
        const result = await gachaVC.updateOne(
            { channelId: channelId },
            { 
                $inc: { 'gameData.stats.wallsBroken': numericIncrement }
            }
        );
        
        if (!result.acknowledged) {
            console.error(`[SAFE INCREMENT] Failed to increment wallsBroken for channel ${channelId}`);
            
            // Fallback: Get current value, ensure it's numeric, then set
            const doc = await gachaVC.findOne({ channelId });
            if (doc?.gameData?.stats) {
                const currentValue = parseInt(doc.gameData.stats.wallsBroken) || 0;
                const newValue = currentValue + numericIncrement;
                
                await gachaVC.updateOne(
                    { channelId },
                    { $set: { 'gameData.stats.wallsBroken': newValue } }
                );
                
                console.log(`[SAFE INCREMENT] Fallback increment successful: ${currentValue} -> ${newValue}`);
            }
        }
        
    } catch (error) {
        console.error(`[SAFE INCREMENT] Error incrementing wallsBroken for channel ${channelId}:`, error);
    }
}

/**
 * Validate and fix wallsBroken before using it
 * @param {*} value - The potentially corrupted value
 * @returns {number} - A valid numeric value
 */
function validateWallsBroken(value) {
    // If undefined or null, return 0
    if (value === undefined || value === null) return 0;
    
    // If already a valid number, return it
    if (typeof value === 'number' && !isNaN(value)) {
        return Math.floor(value); // Ensure it's an integer
    }
    
    // Convert to string and try to extract numbers
    const valueStr = String(value);
    
    // If it's a simple numeric string, parse it
    if (/^\d+$/.test(valueStr)) {
        return parseInt(valueStr);
    }
    
    // If corrupted (contains [object Object] or other patterns)
    if (valueStr.includes('[object') || valueStr.includes('NaN')) {
        console.warn(`[VALIDATE] Corrupted wallsBroken value detected: "${valueStr}"`);
        
        // Try to extract numbers
        const numbers = valueStr.match(/\d+/g);
        if (numbers && numbers.length > 0) {
            // Take the first number as the most likely correct value
            // (950111 in "950111[object Object]63263")
            return parseInt(numbers[0]);
        }
    }
    
    // Default to 0 if we can't determine a valid value
    console.warn(`[VALIDATE] Could not validate wallsBroken value: "${value}", defaulting to 0`);
    return 0;
}

/**
 * Patch the existing code to use safe operations
 * This should be called when the bot starts
 */
function patchWallsBrokenOperations() {
    console.log('[PATCH] Patching wallsBroken operations for safety...');
    
    // Export the safe functions to be used by other modules
    global.safeIncrementWallsBroken = safeIncrementWallsBroken;
    global.validateWallsBroken = validateWallsBroken;
    
    console.log('[PATCH] WallsBroken safety patches applied');
}

module.exports = {
    fixCorruptedWallsBrokenStats,
    safeIncrementWallsBroken,
    validateWallsBroken,
    patchWallsBrokenOperations
};

// Auto-run fix when module is loaded (optional - comment out if you want manual control)
// fixCorruptedWallsBrokenStats().catch(console.error);

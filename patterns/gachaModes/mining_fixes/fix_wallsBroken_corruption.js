// fix_wallsBroken_corruption.js
// Fixes the wallsBroken stat corruption issue where objects/strings get concatenated

const gachaVC = require('../../../models/activevcs');

/**
 * Fix all corrupted wallsBroken stats in the database
 */
async function fixAllCorruptedWallsBroken() {
    try {
        console.log('[WALLSBROKEN FIX] Starting scan for corrupted wallsBroken stats...');
        
        // Find all documents with gameData.stats
        const documents = await gachaVC.find({ 
            'gameData.stats': { $exists: true } 
        });
        
        let fixedCount = 0;
        let corruptedChannels = [];
        
        for (const doc of documents) {
            const stats = doc.gameData?.stats;
            if (!stats) continue;
            
            const wallsBroken = stats.wallsBroken;
            const channelId = doc.channelId;
            
            // Check if wallsBroken is corrupted
            if (wallsBroken !== undefined && wallsBroken !== null) {
                const wallsBrokenStr = String(wallsBroken);
                
                // Check for corruption patterns
                if (wallsBrokenStr.includes('[object') || 
                    wallsBrokenStr.includes('NaN') ||
                    typeof wallsBroken === 'string' ||
                    !Number.isInteger(wallsBroken)) {
                    
                    console.log(`[WALLSBROKEN FIX] Found corrupted value for channel ${channelId}: "${wallsBrokenStr}"`);
                    corruptedChannels.push(channelId);
                    
                    // Extract numbers from the corrupted string
                    let fixedValue = 0;
                    
                    // Try to extract the first number (usually the correct value)
                    const numbers = wallsBrokenStr.match(/\d+/g);
                    if (numbers && numbers.length > 0) {
                        // Take the first number as it's usually the original value
                        fixedValue = parseInt(numbers[0]) || 0;
                        console.log(`[WALLSBROKEN FIX] Extracted value: ${fixedValue} from "${wallsBrokenStr}"`);
                    }
                    
                    // Update with fixed value - ensure all stats are properly typed
                    await gachaVC.updateOne(
                        { channelId: channelId },
                        { 
                            $set: { 
                                'gameData.stats.wallsBroken': fixedValue,
                                'gameData.stats.totalOreFound': parseInt(stats.totalOreFound) || 0,
                                'gameData.stats.treasuresFound': parseInt(stats.treasuresFound) || 0
                            } 
                        }
                    );
                    
                    console.log(`[WALLSBROKEN FIX] Fixed channel ${channelId}: ${wallsBrokenStr} -> ${fixedValue}`);
                    fixedCount++;
                }
            }
        }
        
        console.log(`[WALLSBROKEN FIX] Scan complete. Fixed ${fixedCount} corrupted values.`);
        if (corruptedChannels.length > 0) {
            console.log(`[WALLSBROKEN FIX] Affected channels: ${corruptedChannels.join(', ')}`);
        }
        
        return { fixedCount, corruptedChannels };
        
    } catch (error) {
        console.error('[WALLSBROKEN FIX] Error during fix operation:', error);
        return { fixedCount: 0, corruptedChannels: [] };
    }
}

/**
 * Safe increment function that ensures numeric addition
 */
async function safeIncrementWallsBroken(channelId, amount = 1) {
    try {
        // Ensure amount is a number
        const incrementAmount = parseInt(amount) || 0;
        
        if (incrementAmount <= 0) return true;
        
        // Use MongoDB's $inc operator for atomic numeric increment
        const result = await gachaVC.updateOne(
            { channelId: channelId },
            { 
                $inc: { 'gameData.stats.wallsBroken': incrementAmount }
            }
        );
        
        if (result.modifiedCount > 0) {
            console.log(`[WALLSBROKEN] Safely incremented by ${incrementAmount} for channel ${channelId}`);
            return true;
        }
        
        // Fallback: manually ensure numeric addition
        const doc = await gachaVC.findOne({ channelId });
        if (doc?.gameData?.stats) {
            const currentValue = parseInt(doc.gameData.stats.wallsBroken) || 0;
            const newValue = currentValue + incrementAmount;
            
            await gachaVC.updateOne(
                { channelId },
                { 
                    $set: { 
                        'gameData.stats.wallsBroken': newValue 
                    } 
                }
            );
            
            console.log(`[WALLSBROKEN] Fallback increment: ${currentValue} -> ${newValue}`);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error(`[WALLSBROKEN] Error in safe increment for channel ${channelId}:`, error);
        return false;
    }
}

/**
 * Ensure a value is numeric (for use in calculations)
 */
function ensureNumeric(value, defaultValue = 0) {
    if (value === undefined || value === null) return defaultValue;
    
    // If it's already a valid number, return it
    if (typeof value === 'number' && !isNaN(value)) {
        return Math.floor(value);
    }
    
    // Try to parse as integer
    const parsed = parseInt(value);
    if (!isNaN(parsed)) {
        return parsed;
    }
    
    // If string, try to extract first number
    if (typeof value === 'string') {
        const numbers = value.match(/\d+/);
        if (numbers && numbers.length > 0) {
            return parseInt(numbers[0]) || defaultValue;
        }
    }
    
    return defaultValue;
}

/**
 * Validate all stats are numeric before saving
 */
function validateStats(stats) {
    return {
        totalOreFound: ensureNumeric(stats?.totalOreFound, 0),
        wallsBroken: ensureNumeric(stats?.wallsBroken, 0),
        treasuresFound: ensureNumeric(stats?.treasuresFound, 0),
        lifetimeValue: ensureNumeric(stats?.lifetimeValue, 0),
        lifetimeRareOres: ensureNumeric(stats?.lifetimeRareOres, 0),
        exitTileFound: stats?.exitTileFound === true,
        exitTileFoundAt: stats?.exitTileFoundAt
    };
}

// Export functions
module.exports = {
    fixAllCorruptedWallsBroken,
    safeIncrementWallsBroken,
    ensureNumeric,
    validateStats
};

// Auto-run fix when module loads (optional)
if (require.main === module) {
    console.log('[WALLSBROKEN FIX] Running standalone fix...');
    fixAllCorruptedWallsBroken()
        .then(result => {
            console.log('[WALLSBROKEN FIX] Fix completed:', result);
            process.exit(0);
        })
        .catch(error => {
            console.error('[WALLSBROKEN FIX] Fix failed:', error);
            process.exit(1);
        });
}

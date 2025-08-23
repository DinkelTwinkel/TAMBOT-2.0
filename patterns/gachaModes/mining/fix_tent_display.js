// fix_tent_display.js - Fix for players still showing as tents after break ends

/**
 * Clear tent flags from all player positions
 * This ensures players are rendered normally after breaks end
 */
function clearTentFlags(playerPositions) {
    const cleanedPositions = {};
    
    for (const [playerId, position] of Object.entries(playerPositions || {})) {
        cleanedPositions[playerId] = {
            x: position.x,
            y: position.y,
            isTent: false,  // CRITICAL: Always set to false when break ends
            hidden: false,
            disabled: position.disabled || false,
            stuck: position.stuck || false,
            trapped: position.trapped || false
        };
    }
    
    return cleanedPositions;
}

/**
 * Enhanced scatterPlayersForBreak that properly sets tent flags
 */
function scatterPlayersForBreakFixed(currentPositions, gatherX, gatherY, playerCount, mapData) {
    const scatteredPositions = {};
    const radius = Math.min(3, Math.floor(Math.sqrt(playerCount)));
    
    let playerIndex = 0;
    for (const [playerId, currentPos] of Object.entries(currentPositions)) {
        // Calculate scattered position around gather point
        const angle = (playerIndex * 2 * Math.PI) / playerCount;
        const distance = Math.floor(Math.random() * radius) + 1;
        
        let tentX = gatherX + Math.round(Math.cos(angle) * distance);
        let tentY = gatherY + Math.round(Math.sin(angle) * distance);
        
        // Ensure tent position is valid
        tentX = Math.max(0, Math.min(mapData.width - 1, tentX));
        tentY = Math.max(0, Math.min(mapData.height - 1, tentY));
        
        // Ensure it's on a floor tile
        if (mapData.tiles[tentY] && mapData.tiles[tentY][tentX]) {
            const tile = mapData.tiles[tentY][tentX];
            if (tile.type !== 'floor' && tile.type !== 'entrance') {
                // If not a floor, use gather point instead
                tentX = gatherX;
                tentY = gatherY;
            }
        }
        
        scatteredPositions[playerId] = {
            x: tentX,
            y: tentY,
            isTent: true,  // Set tent flag during break
            hidden: false,
            disabled: currentPos.disabled || false,
            stuck: currentPos.stuck || false,
            trapped: currentPos.trapped || false
        };
        
        playerIndex++;
    }
    
    return scatteredPositions;
}

/**
 * Verify and fix player positions to ensure no stale tent flags
 */
async function verifyAndFixPlayerPositions(channelId, mapCacheSystem, gachaVC) {
    try {
        // Get current cached data
        const cached = mapCacheSystem.getCachedData(channelId);
        if (!cached || !cached.map || !cached.map.playerPositions) {
            console.log(`[TENT FIX] No cached positions to fix for ${channelId}`);
            return false;
        }
        
        // Check if we're in a break
        const inBreak = cached.breakInfo?.inBreak || false;
        
        // If not in break, clear all tent flags
        if (!inBreak) {
            const cleanedPositions = clearTentFlags(cached.map.playerPositions);
            
            // Update cache
            mapCacheSystem.updateMultiple(channelId, {
                'map.playerPositions': cleanedPositions
            });
            
            // Also update database directly to ensure consistency
            await gachaVC.updateOne(
                { channelId },
                { 
                    $set: { 
                        'gameData.map.playerPositions': cleanedPositions 
                    }
                }
            );
            
            console.log(`[TENT FIX] Cleared tent flags for ${Object.keys(cleanedPositions).length} players in channel ${channelId}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`[TENT FIX] Error fixing player positions:`, error);
        return false;
    }
}

module.exports = {
    clearTentFlags,
    scatterPlayersForBreakFixed,
    verifyAndFixPlayerPositions
};

// immediate_tent_hotfix.js - Run this to immediately fix channels stuck with tent display

const gachaVC = require('../../../models/activevcs');
const mapCacheSystem = require('./cache/mapCacheSystem');

/**
 * Immediate hotfix to clear all tent flags from all active mining channels
 * Run this script manually when players are stuck showing as tents
 */
async function clearAllTentFlags() {
    try {
        console.log('[TENT HOTFIX] Starting immediate tent flag cleanup...');
        
        // Find all channels with mining gamemode
        const miningChannels = await gachaVC.find({ 
            'gameData.gamemode': 'mining',
            'gameData.map.playerPositions': { $exists: true }
        });
        
        console.log(`[TENT HOTFIX] Found ${miningChannels.length} mining channels to check`);
        
        let fixedCount = 0;
        
        for (const channel of miningChannels) {
            const channelId = channel.channelId;
            const playerPositions = channel.gameData?.map?.playerPositions;
            
            if (!playerPositions) continue;
            
            // Check if we're NOT in a break
            const inBreak = channel.gameData?.breakInfo?.inBreak || false;
            
            if (inBreak) {
                console.log(`[TENT HOTFIX] Channel ${channelId} is in break, skipping`);
                continue;
            }
            
            // Check if any players have tent flags
            let hasTentFlags = false;
            for (const position of Object.values(playerPositions)) {
                if (position.isTent) {
                    hasTentFlags = true;
                    break;
                }
            }
            
            if (!hasTentFlags) {
                console.log(`[TENT HOTFIX] Channel ${channelId} has no tent flags, skipping`);
                continue;
            }
            
            // Clear tent flags
            const cleanedPositions = {};
            for (const [playerId, position] of Object.entries(playerPositions)) {
                cleanedPositions[playerId] = {
                    x: position.x || 0,
                    y: position.y || 0,
                    isTent: false,  // CLEAR THE FLAG
                    hidden: false,
                    disabled: position.disabled || false,
                    stuck: position.stuck || false,
                    trapped: position.trapped || false
                };
            }
            
            // Update database
            await gachaVC.updateOne(
                { channelId },
                { 
                    $set: { 
                        'gameData.map.playerPositions': cleanedPositions 
                    }
                }
            );
            
            // Clear cache for this channel
            mapCacheSystem.clearChannel(channelId);
            
            console.log(`[TENT HOTFIX] Fixed ${Object.keys(cleanedPositions).length} player positions in channel ${channelId}`);
            fixedCount++;
        }
        
        console.log(`[TENT HOTFIX] Completed! Fixed ${fixedCount} channels`);
        return fixedCount;
        
    } catch (error) {
        console.error('[TENT HOTFIX] Error during cleanup:', error);
        throw error;
    }
}

/**
 * Fix a specific channel
 */
async function fixSpecificChannel(channelId) {
    try {
        console.log(`[TENT HOTFIX] Fixing channel ${channelId}...`);
        
        const channel = await gachaVC.findOne({ channelId });
        
        if (!channel) {
            console.log(`[TENT HOTFIX] Channel ${channelId} not found`);
            return false;
        }
        
        if (channel.gameData?.gamemode !== 'mining') {
            console.log(`[TENT HOTFIX] Channel ${channelId} is not in mining mode`);
            return false;
        }
        
        const playerPositions = channel.gameData?.map?.playerPositions;
        if (!playerPositions) {
            console.log(`[TENT HOTFIX] Channel ${channelId} has no player positions`);
            return false;
        }
        
        // Check if in break
        if (channel.gameData?.breakInfo?.inBreak) {
            console.log(`[TENT HOTFIX] Channel ${channelId} is currently in break - tent display is correct`);
            return false;
        }
        
        // Clear tent flags
        const cleanedPositions = {};
        let hadTentFlags = false;
        
        for (const [playerId, position] of Object.entries(playerPositions)) {
            if (position.isTent) hadTentFlags = true;
            
            cleanedPositions[playerId] = {
                x: position.x || 0,
                y: position.y || 0,
                isTent: false,  // CLEAR THE FLAG
                hidden: false,
                disabled: position.disabled || false,
                stuck: position.stuck || false,
                trapped: position.trapped || false
            };
        }
        
        if (!hadTentFlags) {
            console.log(`[TENT HOTFIX] Channel ${channelId} had no tent flags to fix`);
            return false;
        }
        
        // Update database
        await gachaVC.updateOne(
            { channelId },
            { 
                $set: { 
                    'gameData.map.playerPositions': cleanedPositions 
                }
            }
        );
        
        // Clear cache
        mapCacheSystem.clearChannel(channelId);
        
        console.log(`[TENT HOTFIX] Successfully fixed ${Object.keys(cleanedPositions).length} player positions in channel ${channelId}`);
        return true;
        
    } catch (error) {
        console.error(`[TENT HOTFIX] Error fixing channel ${channelId}:`, error);
        return false;
    }
}

// Export functions
module.exports = {
    clearAllTentFlags,
    fixSpecificChannel
};

// If run directly, execute the hotfix
if (require.main === module) {
    console.log('[TENT HOTFIX] Running immediate tent flag cleanup...');
    clearAllTentFlags()
        .then(count => {
            console.log(`[TENT HOTFIX] Successfully fixed ${count} channels`);
            process.exit(0);
        })
        .catch(error => {
            console.error('[TENT HOTFIX] Failed:', error);
            process.exit(1);
        });
}

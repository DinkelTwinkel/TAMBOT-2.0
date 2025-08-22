// fixMissingGamemode.js - Migration script to fix all channels with missing gamemode field
// Run this once to fix all existing channels

const gachaVC = require('../../../models/activevcs');

async function fixExistingChannels() {
    try {
        console.log('[MIGRATION] Starting gamemode field migration...');
        
        // Find all channels with gameData but missing gamemode
        const channelsToFix = await gachaVC.find({
            'gameData': { $exists: true },
            'gameData.gamemode': { $exists: false }
        });
        
        console.log(`[MIGRATION] Found ${channelsToFix.length} channels missing gamemode field`);
        
        let fixedCount = 0;
        let errorCount = 0;
        
        for (const channel of channelsToFix) {
            try {
                // Add the gamemode field
                channel.gameData.gamemode = 'mining';
                
                // Ensure other required fields exist
                if (!channel.gameData.minecart) {
                    channel.gameData.minecart = { items: {}, contributors: {} };
                }
                if (!channel.gameData.minecart.items) {
                    channel.gameData.minecart.items = {};
                }
                if (!channel.gameData.minecart.contributors) {
                    channel.gameData.minecart.contributors = {};
                }
                if (!channel.gameData.stats) {
                    channel.gameData.stats = {
                        totalOreFound: 0,
                        wallsBroken: 0,
                        treasuresFound: 0
                    };
                }
                
                channel.markModified('gameData');
                await channel.save();
                
                console.log(`[MIGRATION] ✓ Fixed channel ${channel.channelId}`);
                fixedCount++;
            } catch (error) {
                console.error(`[MIGRATION] ✗ Error fixing channel ${channel.channelId}:`, error.message);
                errorCount++;
            }
        }
        
        console.log('[MIGRATION] =====================================');
        console.log(`[MIGRATION] Migration complete!`);
        console.log(`[MIGRATION] Successfully fixed: ${fixedCount} channels`);
        console.log(`[MIGRATION] Failed to fix: ${errorCount} channels`);
        console.log('[MIGRATION] =====================================');
        
        // Also check for channels that might have corrupt data
        const allChannelsWithGameData = await gachaVC.find({
            'gameData': { $exists: true }
        });
        
        let validCount = 0;
        let invalidCount = 0;
        
        for (const channel of allChannelsWithGameData) {
            if (channel.gameData.gamemode === 'mining' && 
                channel.gameData.minecart && 
                channel.gameData.minecart.items &&
                channel.gameData.minecart.contributors) {
                validCount++;
            } else {
                invalidCount++;
                console.log(`[VALIDATION] Channel ${channel.channelId} may still have issues:`, {
                    hasGamemode: !!channel.gameData.gamemode,
                    gamemode: channel.gameData.gamemode,
                    hasMinecart: !!channel.gameData.minecart,
                    hasItems: !!(channel.gameData.minecart?.items),
                    hasContributors: !!(channel.gameData.minecart?.contributors)
                });
            }
        }
        
        console.log('[VALIDATION] =====================================');
        console.log(`[VALIDATION] Total channels with gameData: ${allChannelsWithGameData.length}`);
        console.log(`[VALIDATION] Valid channels: ${validCount}`);
        console.log(`[VALIDATION] Potentially invalid channels: ${invalidCount}`);
        console.log('[VALIDATION] =====================================');
        
        return { fixed: fixedCount, errors: errorCount, valid: validCount, invalid: invalidCount };
    } catch (error) {
        console.error('[MIGRATION] Fatal error during migration:', error);
        return { fixed: 0, errors: 0, valid: 0, invalid: 0 };
    }
}

// Auto-run if this script is executed directly
if (require.main === module) {
    console.log('[MIGRATION] Running migration script directly...');
    
    // You might need to adjust this path based on your database connection setup
    const mongoose = require('mongoose');
    
    // Check if already connected
    if (mongoose.connection.readyState === 0) {
        console.log('[MIGRATION] Connecting to database...');
        // Add your database connection here if needed
        // mongoose.connect('your-connection-string');
    }
    
    fixExistingChannels()
        .then(result => {
            console.log('[MIGRATION] Script completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('[MIGRATION] Script failed:', error);
            process.exit(1);
        });
}

module.exports = { fixExistingChannels };

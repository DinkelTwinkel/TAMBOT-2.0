// miningStartupCheck.js - Add this to your bot's startup sequence
// This ensures all mining channels have proper gamemode fields

const { fixExistingChannels } = require('./fixMissingGamemode');
const gachaVC = require('../../../models/activevcs');

async function checkAndFixMiningData() {
    console.log('[MINING STARTUP] Checking mining data integrity...');
    
    try {
        // Quick check for issues
        const missingGamemode = await gachaVC.countDocuments({
            'gameData': { $exists: true },
            'gameData.gamemode': { $exists: false }
        });
        
        if (missingGamemode > 0) {
            console.log(`[MINING STARTUP] Found ${missingGamemode} channels with missing gamemode field`);
            console.log('[MINING STARTUP] Running automatic fix...');
            
            const result = await fixExistingChannels();
            
            if (result.fixed > 0) {
                console.log(`[MINING STARTUP] Successfully fixed ${result.fixed} channels`);
            }
            if (result.errors > 0) {
                console.warn(`[MINING STARTUP] Failed to fix ${result.errors} channels - manual intervention may be needed`);
            }
        } else {
            console.log('[MINING STARTUP] ✓ All mining channels have proper gamemode field');
        }
        
        // Additional validation
        const totalMiningChannels = await gachaVC.countDocuments({
            'gameData.gamemode': 'mining'
        });
        
        console.log(`[MINING STARTUP] Total active mining channels: ${totalMiningChannels}`);
        console.log('[MINING STARTUP] Mining system ready!');
        
        return true;
    } catch (error) {
        console.error('[MINING STARTUP] Error during startup check:', error);
        // Don't crash the bot, just log the error
        return false;
    }
}

// Export for use in bot startup
module.exports = { checkAndFixMiningData };

// Example usage in your main bot file:
/*
// In your bot's ready event or startup sequence:
const { checkAndFixMiningData } = require('./patterns/gachaModes/mining/miningStartupCheck');

client.once('ready', async () => {
    console.log('Bot is ready!');
    
    // Run mining data integrity check
    await checkAndFixMiningData();
    
    // Continue with other startup tasks...
});
*/

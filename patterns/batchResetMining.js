// batchResetMining.js - Reset multiple mining channels at once
// Useful for maintenance or testing

const mongoose = require('mongoose');
require('dotenv').config();
const { resetChannel } = require('./resetMiningData');
const gachaVC = require('../models/activevcs');

async function batchReset(options = {}) {
    const {
        resetAll = false,           // Reset ALL mining channels
        channelIds = [],            // Specific channel IDs to reset
        onlyStuck = false,          // Only reset channels that appear stuck
        onlyInBreak = false,        // Only reset channels currently in break
        dryRun = false             // Show what would be reset without doing it
    } = options;
    
    console.log('\n' + '='.repeat(60));
    console.log('BATCH MINING RESET');
    console.log('='.repeat(60));
    
    try {
        // Connect to MongoDB if needed
        if (mongoose.connection.readyState !== 1) {
            console.log('📡 Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tambot');
            console.log('✅ Connected to MongoDB\n');
        }
        
        // Find channels to reset
        let channelsToReset = [];
        
        if (resetAll) {
            console.log('🔍 Finding all mining channels...');
            const allChannels = await gachaVC.find({ 'gameData.gamemode': 'mining' });
            channelsToReset = allChannels.map(ch => ({
                id: ch.channelId,
                inBreak: ch.gameData?.breakInfo?.inBreak || false,
                cycleCount: ch.gameData?.cycleCount || 0,
                lastActivity: ch.gameData?.lastActivity || null
            }));
            console.log(`Found ${channelsToReset.length} mining channels`);
            
        } else if (channelIds.length > 0) {
            console.log(`🔍 Checking ${channelIds.length} specified channels...`);
            for (const id of channelIds) {
                const channel = await gachaVC.findOne({ channelId: id });
                if (channel && channel.gameData?.gamemode === 'mining') {
                    channelsToReset.push({
                        id: channel.channelId,
                        inBreak: channel.gameData?.breakInfo?.inBreak || false,
                        cycleCount: channel.gameData?.cycleCount || 0,
                        lastActivity: channel.gameData?.lastActivity || null
                    });
                }
            }
            console.log(`Found ${channelsToReset.length} valid mining channels`);
            
        } else if (onlyStuck) {
            console.log('🔍 Finding stuck channels...');
            const now = Date.now();
            const stuckThreshold = 2 * 60 * 60 * 1000; // 2 hours
            
            const allChannels = await gachaVC.find({ 'gameData.gamemode': 'mining' });
            for (const channel of allChannels) {
                // Check if channel appears stuck
                const isStuck = 
                    // In break for too long
                    (channel.gameData?.breakInfo?.inBreak && 
                     channel.gameData?.breakInfo?.breakEndTime && 
                     now > channel.gameData.breakInfo.breakEndTime + stuckThreshold) ||
                    // Next trigger is way in the past
                    (channel.nextTrigger && 
                     now > new Date(channel.nextTrigger).getTime() + stuckThreshold);
                
                if (isStuck) {
                    channelsToReset.push({
                        id: channel.channelId,
                        inBreak: channel.gameData?.breakInfo?.inBreak || false,
                        cycleCount: channel.gameData?.cycleCount || 0,
                        reason: 'Appears stuck'
                    });
                }
            }
            console.log(`Found ${channelsToReset.length} stuck channels`);
            
        } else if (onlyInBreak) {
            console.log('🔍 Finding channels in break...');
            const channelsInBreak = await gachaVC.find({ 
                'gameData.gamemode': 'mining',
                'gameData.breakInfo.inBreak': true 
            });
            channelsToReset = channelsInBreak.map(ch => ({
                id: ch.channelId,
                inBreak: true,
                cycleCount: ch.gameData?.cycleCount || 0,
                breakType: ch.gameData?.breakInfo?.isLongBreak ? 'LONG' : 'SHORT'
            }));
            console.log(`Found ${channelsToReset.length} channels in break`);
        }
        
        if (channelsToReset.length === 0) {
            console.log('\n✅ No channels to reset');
            return { resetCount: 0 };
        }
        
        // Display what will be reset
        console.log('\n📋 Channels to reset:');
        for (const ch of channelsToReset) {
            console.log(`   - ${ch.id} (Cycle: ${ch.cycleCount}, Break: ${ch.inBreak ? 'Yes' : 'No'}${ch.reason ? ', ' + ch.reason : ''})`);
        }
        
        if (dryRun) {
            console.log('\n🔍 DRY RUN - No changes made');
            return { resetCount: channelsToReset.length, dryRun: true };
        }
        
        // Confirm if many channels
        if (channelsToReset.length > 5) {
            console.log(`\n⚠️ About to reset ${channelsToReset.length} channels!`);
            console.log('Starting in 5 seconds... (Ctrl+C to cancel)');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        // Perform resets
        console.log('\n🔄 Starting batch reset...\n');
        const results = {
            success: [],
            failed: []
        };
        
        for (const [index, channel] of channelsToReset.entries()) {
            console.log(`[${index + 1}/${channelsToReset.length}] Resetting ${channel.id}...`);
            try {
                await resetChannel(channel.id);
                results.success.push(channel.id);
                console.log(`   ✅ Success\n`);
            } catch (error) {
                results.failed.push({ id: channel.id, error: error.message });
                console.log(`   ❌ Failed: ${error.message}\n`);
            }
            
            // Small delay between resets to avoid overwhelming the system
            if (index < channelsToReset.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Summary
        console.log('='.repeat(60));
        console.log('BATCH RESET COMPLETE');
        console.log('='.repeat(60));
        console.log(`\n✅ Successful: ${results.success.length}`);
        console.log(`❌ Failed: ${results.failed.length}`);
        
        if (results.failed.length > 0) {
            console.log('\nFailed channels:');
            for (const fail of results.failed) {
                console.log(`   - ${fail.id}: ${fail.error}`);
            }
        }
        
        return results;
        
    } catch (error) {
        console.error('\n❌ Batch reset failed:', error);
        throw error;
    }
}

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse arguments
    if (args.includes('--all')) {
        options.resetAll = true;
    }
    if (args.includes('--stuck')) {
        options.onlyStuck = true;
    }
    if (args.includes('--in-break')) {
        options.onlyInBreak = true;
    }
    if (args.includes('--dry-run')) {
        options.dryRun = true;
    }
    
    // Get channel IDs if provided
    const channelIds = args.filter(arg => !arg.startsWith('--'));
    if (channelIds.length > 0) {
        options.channelIds = channelIds;
    }
    
    // Show help if no options
    if (!options.resetAll && !options.onlyStuck && !options.onlyInBreak && (!options.channelIds || options.channelIds.length === 0)) {
        console.log('Batch Mining Reset Utility');
        console.log('==========================\n');
        console.log('Usage:');
        console.log('  node batchResetMining.js [options] [channelIds...]');
        console.log('\nOptions:');
        console.log('  --all         Reset ALL mining channels');
        console.log('  --stuck       Reset only stuck channels');
        console.log('  --in-break    Reset only channels in break');
        console.log('  --dry-run     Show what would be reset without doing it');
        console.log('\nExamples:');
        console.log('  node batchResetMining.js --stuck');
        console.log('  node batchResetMining.js --all --dry-run');
        console.log('  node batchResetMining.js 123456789 987654321');
        process.exit(0);
    }
    
    // Run batch reset
    batchReset(options)
        .then(results => {
            console.log('\n✨ Done!');
            process.exit(results.failed?.length > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { batchReset };

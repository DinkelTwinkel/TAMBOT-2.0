// listMiningChannels.js - List all active mining channels with their status

const mongoose = require('mongoose');
require('dotenv').config();
const gachaVC = require('../models/activevcs');

async function listMiningChannels(options = {}) {
    const {
        showDetails = false,
        filterByStatus = null, // 'mining', 'break', 'stuck'
        sortBy = 'cycle'       // 'cycle', 'value', 'players', 'activity'
    } = options;
    
    console.log('\n' + '='.repeat(70));
    console.log('ACTIVE MINING CHANNELS');
    console.log('='.repeat(70) + '\n');
    
    try {
        // Connect to MongoDB if needed
        if (mongoose.connection.readyState !== 1) {
            console.log('📡 Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tambot');
            console.log('✅ Connected\n');
        }
        
        // Find all mining channels
        const channels = await gachaVC.find({ 'gameData.gamemode': 'mining' });
        
        if (channels.length === 0) {
            console.log('No active mining channels found.');
            return [];
        }
        
        console.log(`Found ${channels.length} mining channel(s)\n`);
        
        // Process channel data
        const now = Date.now();
        const channelData = [];
        
        for (const ch of channels) {
            const data = {
                id: ch.channelId,
                cycle: ch.gameData?.cycleCount || 0,
                inBreak: ch.gameData?.breakInfo?.inBreak || false,
                breakType: ch.gameData?.breakInfo?.isLongBreak ? 'LONG' : 'SHORT',
                status: 'active',
                minecartValue: 0,
                minecartItems: 0,
                playerCount: 0,
                issues: []
            };
            
            // Calculate minecart value
            if (ch.gameData?.minecart?.items) {
                for (const [itemId, item] of Object.entries(ch.gameData.minecart.items)) {
                    data.minecartValue += (item.value || 0) * (item.quantity || 0);
                    data.minecartItems++;
                }
            }
            
            // Count players
            if (ch.gameData?.map?.playerPositions) {
                data.playerCount = Object.keys(ch.gameData.map.playerPositions).length;
            }
            
            // Check status
            if (data.inBreak) {
                const breakEnd = ch.gameData?.breakInfo?.breakEndTime;
                if (breakEnd && now > breakEnd) {
                    data.status = 'stuck';
                    data.issues.push('Break expired');
                } else {
                    data.status = 'break';
                }
            } else {
                const nextTrigger = ch.nextTrigger ? new Date(ch.nextTrigger).getTime() : 0;
                if (nextTrigger && now > nextTrigger + 3600000) { // 1 hour overdue
                    data.status = 'stuck';
                    data.issues.push('Trigger overdue');
                } else {
                    data.status = 'mining';
                }
            }
            
            // Add timing info
            if (ch.nextShopRefresh) {
                const timeUntil = new Date(ch.nextShopRefresh).getTime() - now;
                data.nextBreakIn = Math.max(0, Math.floor(timeUntil / 60000)); // minutes
            }
            
            channelData.push(data);
        }
        
        // Filter if requested
        let filtered = channelData;
        if (filterByStatus) {
            filtered = channelData.filter(ch => ch.status === filterByStatus);
        }
        
        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'value':
                    return b.minecartValue - a.minecartValue;
                case 'players':
                    return b.playerCount - a.playerCount;
                case 'activity':
                    return (a.nextBreakIn || 999) - (b.nextBreakIn || 999);
                case 'cycle':
                default:
                    return b.cycle - a.cycle;
            }
        });
        
        // Display results
        const statusEmoji = {
            mining: '⛏️',
            break: '⛺',
            stuck: '❌'
        };
        
        // Summary table header
        console.log('Status | Channel ID           | Cycle | Players | Minecart Value | Next Break');
        console.log('-------|---------------------|-------|---------|----------------|------------');
        
        for (const ch of filtered) {
            const status = `${statusEmoji[ch.status]} ${ch.status.padEnd(6)}`;
            const channelId = ch.id.padEnd(19);
            const cycle = ch.cycle.toString().padEnd(5);
            const players = ch.playerCount.toString().padEnd(7);
            const value = ch.minecartValue.toString().padEnd(14);
            const nextBreak = ch.status === 'mining' && ch.nextBreakIn !== undefined
                ? `${ch.nextBreakIn} min`
                : ch.status === 'break' 
                ? `In ${ch.breakType} break`
                : 'N/A';
            
            console.log(`${status} | ${channelId} | ${cycle} | ${players} | ${value} | ${nextBreak}`);
            
            if (showDetails && ch.issues.length > 0) {
                console.log(`       └─ Issues: ${ch.issues.join(', ')}`);
            }
        }
        
        // Statistics
        console.log('\n' + '-'.repeat(70));
        console.log('STATISTICS:');
        
        const stats = {
            total: filtered.length,
            mining: filtered.filter(ch => ch.status === 'mining').length,
            inBreak: filtered.filter(ch => ch.status === 'break').length,
            stuck: filtered.filter(ch => ch.status === 'stuck').length,
            totalValue: filtered.reduce((sum, ch) => sum + ch.minecartValue, 0),
            totalPlayers: filtered.reduce((sum, ch) => sum + ch.playerCount, 0)
        };
        
        console.log(`  Total Channels: ${stats.total}`);
        console.log(`  Currently Mining: ${stats.mining}`);
        console.log(`  In Break: ${stats.inBreak}`);
        console.log(`  Stuck/Issues: ${stats.stuck}`);
        console.log(`  Total Minecart Value: ${stats.totalValue.toLocaleString()} coins`);
        console.log(`  Total Players: ${stats.totalPlayers}`);
        
        if (stats.stuck > 0) {
            console.log('\n⚠️ WARNING: ' + stats.stuck + ' channel(s) appear to be stuck');
            console.log('   Run diagnostics: node diagnoseMining.js <channelId>');
            console.log('   Or batch reset stuck: node batchResetMining.js --stuck');
        }
        
        return filtered;
        
    } catch (error) {
        console.error('\n❌ Error listing channels:', error);
        throw error;
    }
}

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse arguments
    if (args.includes('--details')) {
        options.showDetails = true;
    }
    
    // Filter options
    if (args.includes('--mining')) {
        options.filterByStatus = 'mining';
    } else if (args.includes('--break')) {
        options.filterByStatus = 'break';
    } else if (args.includes('--stuck')) {
        options.filterByStatus = 'stuck';
    }
    
    // Sort options
    if (args.includes('--sort-value')) {
        options.sortBy = 'value';
    } else if (args.includes('--sort-players')) {
        options.sortBy = 'players';
    } else if (args.includes('--sort-activity')) {
        options.sortBy = 'activity';
    }
    
    // Show help
    if (args.includes('--help') || args.includes('-h')) {
        console.log('List Mining Channels Utility');
        console.log('============================\n');
        console.log('Usage: node listMiningChannels.js [options]');
        console.log('\nFilter Options:');
        console.log('  --mining      Show only actively mining channels');
        console.log('  --break       Show only channels in break');
        console.log('  --stuck       Show only stuck/problematic channels');
        console.log('\nSort Options:');
        console.log('  --sort-value     Sort by minecart value (highest first)');
        console.log('  --sort-players   Sort by player count (highest first)');
        console.log('  --sort-activity  Sort by next break time (soonest first)');
        console.log('\nOther Options:');
        console.log('  --details     Show additional details and issues');
        console.log('  --help        Show this help message');
        console.log('\nExamples:');
        console.log('  node listMiningChannels.js');
        console.log('  node listMiningChannels.js --stuck --details');
        console.log('  node listMiningChannels.js --mining --sort-value');
        process.exit(0);
    }
    
    // Run listing
    listMiningChannels(options)
        .then(() => {
            console.log('\n✨ Done');
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { listMiningChannels };

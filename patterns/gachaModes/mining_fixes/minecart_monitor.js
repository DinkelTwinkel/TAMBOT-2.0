#!/usr/bin/env node

// Real-time Minecart Monitor
// Shows live updates to minecart as items are added

const gachaVC = require('../../../models/activevcs');
const { getMinecartSummaryFresh } = require('./fix_minecart_display');

async function monitorMinecart(channelId, intervalMs = 5000) {
    console.clear();
    console.log('🛒 MINECART REAL-TIME MONITOR');
    console.log('=' .repeat(50));
    console.log(`Channel: ${channelId}`);
    console.log(`Refresh: Every ${intervalMs / 1000} seconds`);
    console.log('Press Ctrl+C to stop');
    console.log('=' .repeat(50));
    
    let lastItemCount = 0;
    let lastValue = 0;
    let updateCount = 0;
    
    const monitor = async () => {
        try {
            const summary = await getMinecartSummaryFresh(channelId);
            const timestamp = new Date().toLocaleTimeString();
            
            // Check if values changed
            const itemsChanged = summary.itemCount !== lastItemCount;
            const valueChanged = summary.totalValue !== lastValue;
            
            if (itemsChanged || valueChanged) {
                updateCount++;
                
                // Show change indicators
                const itemDiff = summary.itemCount - lastItemCount;
                const valueDiff = summary.totalValue - lastValue;
                
                console.log(`\n[${timestamp}] UPDATE #${updateCount}`);
                console.log('  ' + summary.summary);
                
                if (itemDiff > 0) {
                    console.log(`  📈 +${itemDiff} items (was ${lastItemCount})`);
                }
                if (valueDiff > 0) {
                    console.log(`  💰 +${valueDiff} coins (was ${lastValue})`);
                }
                
                lastItemCount = summary.itemCount;
                lastValue = summary.totalValue;
                
                // Get detailed breakdown
                const dbEntry = await gachaVC.findOne({ channelId }).lean();
                if (dbEntry?.gameData?.minecart?.items) {
                    const items = dbEntry.gameData.minecart.items;
                    const topItems = Object.entries(items)
                        .filter(([, data]) => (data.quantity || data) > 0)
                        .sort((a, b) => (b[1].quantity || b[1]) - (a[1].quantity || a[1]))
                        .slice(0, 5);
                    
                    if (topItems.length > 0) {
                        console.log('  📦 Top items:');
                        for (const [itemId, data] of topItems) {
                            const qty = data.quantity || data;
                            console.log(`     - ${itemId}: ${qty}`);
                        }
                    }
                }
            } else {
                // No changes, just show a dot to indicate monitoring is active
                process.stdout.write('.');
            }
            
        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
        }
    };
    
    // Initial check
    await monitor();
    
    // Set up interval
    const interval = setInterval(monitor, intervalMs);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('\n\n👋 Monitor stopped');
        console.log(`Final: ${lastItemCount} items worth ${lastValue} coins`);
        console.log(`Total updates observed: ${updateCount}`);
        process.exit(0);
    });
}

// CLI
const channelId = process.argv[2];
const refreshRate = parseInt(process.argv[3]) || 5000;

if (!channelId) {
    console.log('Minecart Live Monitor');
    console.log('====================');
    console.log('Usage: node minecart_monitor.js <channelId> [refresh_ms]');
    console.log('Example: node minecart_monitor.js 123456789 3000');
    process.exit(1);
}

monitorMinecart(channelId, refreshRate);

// Mining System Test & Diagnostic Tool
// Run this to check the health of your mining system and apply fixes

const { Client, GatewayIntentBits } = require('discord.js');
const gachaVC = require('../../../models/activevcs');
const mapCacheSystem = require('../mining/cache/mapCacheSystem');
const miningFixes = require('./fix_mining_bugs');

class MiningDiagnostics {
    constructor() {
        this.issues = [];
        this.fixes = [];
        this.stats = {
            channelsChecked: 0,
            issuesFound: 0,
            fixesApplied: 0,
            errors: 0
        };
    }
    
    async runDiagnostics(channelId = null) {
        console.log('🔍 Starting Mining System Diagnostics...\n');
        
        try {
            // If specific channel provided, check only that
            if (channelId) {
                await this.checkChannel(channelId);
            } else {
                // Check all active mining channels
                const activeMines = await gachaVC.find({ 
                    'gameData.gamemode': 'mining' 
                }).limit(50);
                
                console.log(`Found ${activeMines.length} active mining channels\n`);
                
                for (const mine of activeMines) {
                    await this.checkChannel(mine.channelId);
                }
            }
            
            this.printReport();
            
        } catch (error) {
            console.error('❌ Diagnostic error:', error);
            this.stats.errors++;
        }
    }
    
    async checkChannel(channelId) {
        console.log(`\n📍 Checking channel: ${channelId}`);
        this.stats.channelsChecked++;
        
        try {
            const dbEntry = await gachaVC.findOne({ channelId });
            if (!dbEntry) {
                console.log('  ⚠️ No database entry found');
                return;
            }
            
            const channelIssues = [];
            const now = Date.now();
            
            // Check 1: Minecart structure
            if (!dbEntry.gameData?.minecart?.items) {
                channelIssues.push({
                    type: 'MINECART_MISSING',
                    severity: 'HIGH',
                    description: 'Minecart structure is missing or corrupted'
                });
            } else {
                const itemCount = Object.keys(dbEntry.gameData.minecart.items).length;
                console.log(`  ✅ Minecart OK (${itemCount} item types)`);
            }
            
            // Check 2: Break state
            if (dbEntry.gameData?.breakInfo) {
                const breakInfo = dbEntry.gameData.breakInfo;
                console.log(`  🛑 In break: ${breakInfo.isLongBreak ? 'LONG' : 'SHORT'}`);
                
                if (breakInfo.breakEndTime) {
                    const timeLeft = breakInfo.breakEndTime - now;
                    if (timeLeft < 0) {
                        channelIssues.push({
                            type: 'EXPIRED_BREAK',
                            severity: 'HIGH',
                            description: `Break expired ${Math.abs(Math.floor(timeLeft / 60000))} minutes ago`
                        });
                    } else {
                        console.log(`  ⏱️ Break ends in ${Math.floor(timeLeft / 60000)} minutes`);
                    }
                }
            } else {
                console.log(`  ⛏️ Currently mining`);
            }
            
            // Check 3: Timer consistency
            if (dbEntry.nextShopRefresh) {
                const shopTime = new Date(dbEntry.nextShopRefresh).getTime();
                const timeTillShop = shopTime - now;
                
                if (timeTillShop < 0 && !dbEntry.gameData?.breakInfo?.inBreak) {
                    channelIssues.push({
                        type: 'TIMER_MISMATCH',
                        severity: 'MEDIUM',
                        description: `Shop timer expired ${Math.abs(Math.floor(timeTillShop / 60000))} minutes ago but not in break`
                    });
                } else if (timeTillShop > 0) {
                    console.log(`  ⏰ Next break in ${Math.floor(timeTillShop / 60000)} minutes`);
                }
            }
            
            // Check 4: Player positions
            const positions = dbEntry.gameData?.map?.playerPositions || {};
            const positionCount = Object.keys(positions).length;
            let stuckCount = 0;
            
            for (const [playerId, pos] of Object.entries(positions)) {
                if (pos.stuck || pos.trapped) {
                    stuckCount++;
                }
            }
            
            console.log(`  👥 ${positionCount} players${stuckCount > 0 ? ` (${stuckCount} stuck)` : ''}`);
            
            if (stuckCount > 0) {
                channelIssues.push({
                    type: 'STUCK_PLAYERS',
                    severity: 'LOW',
                    description: `${stuckCount} players are stuck`
                });
            }
            
            // Check 5: Cache sync
            const cached = mapCacheSystem.getCachedData(channelId);
            if (cached) {
                const cacheBreak = cached.breakInfo?.inBreak;
                const dbBreak = dbEntry.gameData?.breakInfo?.inBreak;
                
                if (cacheBreak !== dbBreak) {
                    channelIssues.push({
                        type: 'CACHE_MISMATCH',
                        severity: 'MEDIUM',
                        description: `Cache says break=${cacheBreak}, DB says break=${dbBreak}`
                    });
                }
            }
            
            // Record issues
            if (channelIssues.length > 0) {
                this.issues.push({ channelId, issues: channelIssues });
                this.stats.issuesFound += channelIssues.length;
                
                console.log(`  ❌ Found ${channelIssues.length} issues:`);
                for (const issue of channelIssues) {
                    console.log(`     - [${issue.severity}] ${issue.type}: ${issue.description}`);
                }
            } else {
                console.log(`  ✅ No issues found`);
            }
            
        } catch (error) {
            console.error(`  ❌ Error checking channel: ${error.message}`);
            this.stats.errors++;
        }
    }
    
    async applyFixes(channelId = null) {
        console.log('\n🔧 Applying fixes...\n');
        
        const channelsToFix = channelId 
            ? [channelId] 
            : this.issues.map(i => i.channelId);
        
        for (const channel of channelsToFix) {
            console.log(`Fixing channel: ${channel}`);
            
            try {
                const dbEntry = await gachaVC.findOne({ channelId: channel });
                if (!dbEntry) continue;
                
                let fixesApplied = 0;
                
                // Apply hotfixes
                const issues = this.issues.find(i => i.channelId === channel)?.issues || [];
                
                for (const issue of issues) {
                    if (issue.severity === 'HIGH') {
                        switch (issue.type) {
                            case 'MINECART_MISSING':
                                await miningFixes.quickFixMinecart(dbEntry, channel);
                                console.log('  ✅ Fixed minecart structure');
                                fixesApplied++;
                                break;
                                
                            case 'EXPIRED_BREAK':
                                await miningFixes.quickFixBreak(gachaVC, mapCacheSystem, channel);
                                console.log('  ✅ Cleared expired break');
                                fixesApplied++;
                                break;
                        }
                    }
                }
                
                if (issues.some(i => i.type === 'CACHE_MISMATCH')) {
                    await miningFixes.quickSyncCache(mapCacheSystem, gachaVC, channel);
                    console.log('  ✅ Synchronized cache');
                    fixesApplied++;
                }
                
                this.stats.fixesApplied += fixesApplied;
                this.fixes.push({ channelId: channel, fixesApplied });
                
                if (fixesApplied > 0) {
                    console.log(`  Applied ${fixesApplied} fixes`);
                }
                
            } catch (error) {
                console.error(`  ❌ Error applying fixes: ${error.message}`);
                this.stats.errors++;
            }
        }
    }
    
    printReport() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 DIAGNOSTIC REPORT');
        console.log('='.repeat(50));
        console.log(`Channels checked: ${this.stats.channelsChecked}`);
        console.log(`Total issues found: ${this.stats.issuesFound}`);
        console.log(`Fixes applied: ${this.stats.fixesApplied}`);
        console.log(`Errors encountered: ${this.stats.errors}`);
        
        if (this.issues.length > 0) {
            console.log('\n⚠️ Channels with issues:');
            for (const channel of this.issues) {
                const highSeverity = channel.issues.filter(i => i.severity === 'HIGH').length;
                const mediumSeverity = channel.issues.filter(i => i.severity === 'MEDIUM').length;
                const lowSeverity = channel.issues.filter(i => i.severity === 'LOW').length;
                
                console.log(`  ${channel.channelId}: HIGH:${highSeverity} MED:${mediumSeverity} LOW:${lowSeverity}`);
            }
        }
        
        console.log('\n' + '='.repeat(50));
    }
    
    async monitorChannel(channelId, intervalMs = 30000) {
        console.log(`\n📡 Starting monitor for channel ${channelId}`);
        console.log('Press Ctrl+C to stop monitoring\n');
        
        const monitor = async () => {
            const timestamp = new Date().toLocaleTimeString();
            console.log(`\n[${timestamp}] Checking...`);
            
            const dbEntry = await gachaVC.findOne({ channelId });
            if (!dbEntry) {
                console.log('  ❌ Channel not found');
                return;
            }
            
            const now = Date.now();
            const breakInfo = dbEntry.gameData?.breakInfo;
            const minecart = dbEntry.gameData?.minecart;
            
            console.log(`  Status: ${breakInfo?.inBreak ? 'BREAK' : 'MINING'}`);
            
            if (breakInfo?.breakEndTime) {
                const timeLeft = breakInfo.breakEndTime - now;
                console.log(`  Break ends: ${timeLeft > 0 ? `${Math.floor(timeLeft / 60000)}m` : 'EXPIRED'}`);
            }
            
            if (minecart?.items) {
                const itemCount = Object.values(minecart.items).reduce((a, b) => a + b, 0);
                console.log(`  Minecart: ${itemCount} items`);
            }
            
            const issues = miningFixes.detectMiningIssues(dbEntry, { 
                members: new Map(),
                id: channelId 
            });
            
            if (issues.length > 0) {
                console.log(`  ⚠️ Issues detected: ${issues.map(i => i.type).join(', ')}`);
            } else {
                console.log(`  ✅ Healthy`);
            }
        };
        
        // Initial check
        await monitor();
        
        // Set up interval
        const interval = setInterval(monitor, intervalMs);
        
        // Handle cleanup
        process.on('SIGINT', () => {
            console.log('\n\n👋 Stopping monitor...');
            clearInterval(interval);
            process.exit(0);
        });
    }
}

// CLI Usage
if (require.main === module) {
    const diagnostics = new MiningDiagnostics();
    const args = process.argv.slice(2);
    const command = args[0];
    const channelId = args[1];
    
    (async () => {
        switch (command) {
            case 'check':
                await diagnostics.runDiagnostics(channelId);
                break;
                
            case 'fix':
                await diagnostics.runDiagnostics(channelId);
                await diagnostics.applyFixes(channelId);
                break;
                
            case 'monitor':
                if (!channelId) {
                    console.log('❌ Please provide a channel ID to monitor');
                    process.exit(1);
                }
                await diagnostics.monitorChannel(channelId);
                break;
                
            default:
                console.log('Mining Diagnostics Tool');
                console.log('======================');
                console.log('Usage:');
                console.log('  node mining_diagnostics.js check [channelId]    - Check for issues');
                console.log('  node mining_diagnostics.js fix [channelId]      - Check and fix issues');
                console.log('  node mining_diagnostics.js monitor <channelId>  - Monitor a channel');
                break;
        }
        
        if (command !== 'monitor') {
            process.exit(0);
        }
    })();
}

module.exports = MiningDiagnostics;

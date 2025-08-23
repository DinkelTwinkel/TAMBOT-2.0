// autoIntegrate.js - Automatically integrate cache system into existing mining file
const fs = require('fs').promises;
const path = require('path');

const MINING_FILE = path.join(__dirname, '../../mining_optimized_v5_performance.js');
const BACKUP_FILE = path.join(__dirname, '../../mining_optimized_v5_performance.backup.js');

async function integrateCache() {
    console.log('🔧 Starting automatic cache integration...\n');
    
    try {
        // Step 1: Create backup
        console.log('📋 Creating backup of original file...');
        const originalContent = await fs.readFile(MINING_FILE, 'utf8');
        await fs.writeFile(BACKUP_FILE, originalContent);
        console.log('✅ Backup created: mining_optimized_v5_performance.backup.js\n');
        
        // Step 2: Add import statement
        console.log('📝 Adding cache import...');
        let modifiedContent = originalContent;
        
        // Add import after other requires
        const importLine = "const mapCacheSystem = require('./mining/cache/mapCacheSystem');";
        if (!modifiedContent.includes('mapCacheSystem')) {
            const insertPoint = modifiedContent.indexOf("const gachaVC = require('../../models/activevcs');");
            if (insertPoint !== -1) {
                const nextLine = modifiedContent.indexOf('\n', insertPoint) + 1;
                modifiedContent = modifiedContent.slice(0, nextLine) + importLine + '\n' + modifiedContent.slice(nextLine);
                console.log('✅ Cache import added\n');
            }
        } else {
            console.log('⏭️ Cache import already exists\n');
        }
        
        // Step 3: Replace getCachedDBEntry function
        console.log('📝 Replacing getCachedDBEntry function...');
        const newGetCachedDBEntry = `
// Enhanced error-safe database fetch with cache system
async function getCachedDBEntry(channelId, forceRefresh = false, retryCount = 0) {
    try {
        // Initialize cache if not already done
        if (!mapCacheSystem.isCached(channelId) || forceRefresh) {
            await mapCacheSystem.initialize(channelId, forceRefresh);
        }
        
        // Get cached data (instant, from memory)
        const cached = mapCacheSystem.getCachedData(channelId);
        
        if (!cached) {
            // Fallback to direct DB read if cache fails
            console.error(\`[MINING] Cache miss for channel \${channelId}, falling back to DB\`);
            const entry = await gachaVC.findOne({ channelId });
            if (entry) {
                await mapCacheSystem.initialize(channelId, true);
            }
            return entry;
        }
        
        // Return cached data formatted like DB entry
        return {
            channelId: channelId,
            gameData: cached,
            nextShopRefresh: cached.nextShopRefresh,
            nextTrigger: cached.nextTrigger,
            save: async function() {
                const updates = {};
                for (const [key, value] of Object.entries(this.gameData)) {
                    if (key !== 'lastUpdated' && key !== 'channelId') {
                        updates[key] = value;
                    }
                }
                return mapCacheSystem.updateMultiple(channelId, updates);
            },
            markModified: function() {}
        };
        
    } catch (error) {
        console.error(\`[MINING] Error fetching cached entry for channel \${channelId}:\`, error);
        if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return getCachedDBEntry(channelId, forceRefresh, retryCount + 1);
        }
        return null;
    }
}`;
        
        // Find and replace the function
        const funcStart = modifiedContent.indexOf('async function getCachedDBEntry');
        if (funcStart !== -1) {
            // Find the end of the function (count braces)
            let braceCount = 0;
            let inFunction = false;
            let funcEnd = funcStart;
            
            for (let i = funcStart; i < modifiedContent.length; i++) {
                if (modifiedContent[i] === '{') {
                    braceCount++;
                    inFunction = true;
                } else if (modifiedContent[i] === '}') {
                    braceCount--;
                    if (inFunction && braceCount === 0) {
                        funcEnd = i + 1;
                        break;
                    }
                }
            }
            
            modifiedContent = modifiedContent.slice(0, funcStart) + newGetCachedDBEntry + modifiedContent.slice(funcEnd);
            console.log('✅ getCachedDBEntry function replaced\n');
        }
        
        // Step 4: Add cache initialization in main function
        console.log('📝 Adding cache initialization to main function...');
        const mainFuncPattern = /module\.exports\s*=\s*async\s*\(channel,\s*dbEntry,\s*json,\s*client\)\s*=>\s*{/;
        const mainFuncMatch = modifiedContent.match(mainFuncPattern);
        
        if (mainFuncMatch) {
            const insertPoint = mainFuncMatch.index + mainFuncMatch[0].length;
            const cacheInit = `
    const channelId = channel.id;
    const processingStartTime = Date.now();
    
    // Initialize cache for this channel if not already done
    if (!mapCacheSystem.isCached(channelId)) {
        console.log(\`[MINING] Initializing cache for new channel \${channelId}\`);
        await mapCacheSystem.initialize(channelId);
    }
`;
            
            // Check if not already added
            if (!modifiedContent.includes('mapCacheSystem.isCached')) {
                modifiedContent = modifiedContent.slice(0, insertPoint) + cacheInit + modifiedContent.slice(insertPoint);
                console.log('✅ Cache initialization added to main function\n');
            }
        }
        
        // Step 5: Replace batchDB.queueUpdate calls
        console.log('📝 Replacing batchDB.queueUpdate calls...');
        let replacements = 0;
        
        // Replace pattern: batchDB.queueUpdate(channel.id, { 'gameData.X': Y })
        // with: mapCacheSystem.updateMultiple(channel.id, { 'X': Y })
        modifiedContent = modifiedContent.replace(
            /batchDB\.queueUpdate\(([^,]+),\s*{\s*['"`]gameData\.([^'"`]+)['"`]:\s*([^}]+)}\)/g,
            (match, channelVar, field, value) => {
                replacements++;
                return `mapCacheSystem.updateMultiple(${channelVar}, { '${field}': ${value}})`;
            }
        );
        
        console.log(`✅ Replaced ${replacements} batchDB.queueUpdate calls\n`);
        
        // Step 6: Add graceful shutdown handler
        console.log('📝 Adding graceful shutdown handler...');
        if (!modifiedContent.includes("process.on('SIGINT'")) {
            const shutdownHandler = `
// Graceful shutdown - save cache before exit
process.on('SIGINT', async () => {
    console.log('[MINING] Saving cache before shutdown...');
    await mapCacheSystem.forceFlush();
    process.exit(0);
});
`;
            modifiedContent += shutdownHandler;
            console.log('✅ Graceful shutdown handler added\n');
        }
        
        // Step 7: Add exports
        console.log('📝 Adding cache exports...');
        if (!modifiedContent.includes('module.exports.mapCacheSystem')) {
            const exports = `
// Cache system exports
module.exports.mapCacheSystem = mapCacheSystem;
module.exports.cacheCommands = {
    forceSave: async () => {
        await mapCacheSystem.forceFlush();
        console.log('[CACHE] Force save completed');
    },
    getStats: () => mapCacheSystem.getStats(),
    clearChannel: (channelId) => mapCacheSystem.clearChannel(channelId),
    preloadAll: async () => await mapCacheSystem.preloadAll()
};
`;
            modifiedContent += exports;
            console.log('✅ Cache exports added\n');
        }
        
        // Step 8: Save modified file
        console.log('💾 Saving modified file...');
        await fs.writeFile(MINING_FILE, modifiedContent);
        console.log('✅ File saved successfully!\n');
        
        // Summary
        console.log('=' .repeat(50));
        console.log('✨ INTEGRATION COMPLETE! ✨');
        console.log('=' .repeat(50));
        console.log('\nNext steps:');
        console.log('1. Review the changes in mining_optimized_v5_performance.js');
        console.log('2. Test the cache system: node mining/cache/testCache.js');
        console.log('3. Start your bot and monitor performance');
        console.log('\nBackup saved as: mining_optimized_v5_performance.backup.js');
        console.log('\nTo revert changes: rename the backup file back to the original name');
        
    } catch (error) {
        console.error('❌ Integration failed:', error);
        console.log('\nTrying to restore backup...');
        try {
            const backup = await fs.readFile(BACKUP_FILE, 'utf8');
            await fs.writeFile(MINING_FILE, backup);
            console.log('✅ Original file restored from backup');
        } catch (restoreError) {
            console.error('❌ Could not restore backup:', restoreError);
        }
    }
}

// Manual integration helper functions
async function revertChanges() {
    try {
        console.log('🔄 Reverting to backup...');
        const backup = await fs.readFile(BACKUP_FILE, 'utf8');
        await fs.writeFile(MINING_FILE, backup);
        console.log('✅ Successfully reverted to backup');
    } catch (error) {
        console.error('❌ Could not revert:', error);
    }
}

async function validateIntegration() {
    try {
        console.log('🔍 Validating integration...');
        const content = await fs.readFile(MINING_FILE, 'utf8');
        
        const checks = [
            { name: 'Cache import', pattern: /mapCacheSystem/ },
            { name: 'Cache initialization', pattern: /mapCacheSystem\.isCached/ },
            { name: 'Modified getCachedDBEntry', pattern: /mapCacheSystem\.getCachedData/ },
            { name: 'Graceful shutdown', pattern: /mapCacheSystem\.forceFlush/ }
        ];
        
        let allPassed = true;
        for (const check of checks) {
            if (check.pattern.test(content)) {
                console.log(`✅ ${check.name}: Found`);
            } else {
                console.log(`❌ ${check.name}: Not found`);
                allPassed = false;
            }
        }
        
        if (allPassed) {
            console.log('\n✅ All integration checks passed!');
        } else {
            console.log('\n⚠️ Some integration checks failed. Please review manually.');
        }
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
    }
}

// Command line interface
const command = process.argv[2];

switch (command) {
    case 'revert':
        revertChanges();
        break;
    case 'validate':
        validateIntegration();
        break;
    case 'help':
        console.log(`
Cache Integration Tool

Commands:
  node autoIntegrate.js          - Run automatic integration
  node autoIntegrate.js revert   - Revert to backup
  node autoIntegrate.js validate - Validate integration
  node autoIntegrate.js help     - Show this help

Before running, ensure:
1. You're in the mining/cache directory
2. The mining_optimized_v5_performance.js file exists
3. You have backups of important data
        `);
        break;
    default:
        // Run integration
        integrateCache();
}

module.exports = { integrateCache, revertChanges, validateIntegration };
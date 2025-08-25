// patterns/gachaModes/mining/migrateRails.js
// Utility to migrate existing rails from map tiles to separate storage

const gachaVC = require('../../../models/activevcs');
const railStorage = require('./railStorage');

/**
 * Migrate rails from old storage (in map tiles) to new storage (separate rails object)
 * @param {string} channelId - The channel ID to migrate
 * @returns {Object} Migration result with statistics
 */
async function migrateRailsToSeparateStorage(channelId) {
    try {
        console.log(`[RAIL MIGRATION] Starting migration for channel ${channelId}`);
        
        // Get the database entry
        const entry = await gachaVC.findOne({ channelId });
        
        if (!entry) {
            return {
                success: false,
                error: 'Channel not found in database'
            };
        }
        
        if (!entry.gameData || !entry.gameData.map) {
            return {
                success: false,
                error: 'No map data found for channel'
            };
        }
        
        const mapData = entry.gameData.map;
        const railPositions = [];
        
        // Scan all tiles for rails
        if (mapData.tiles) {
            for (let y = 0; y < mapData.tiles.length; y++) {
                for (let x = 0; x < mapData.tiles[y].length; x++) {
                    const tile = mapData.tiles[y][x];
                    if (tile && tile.hasRail) {
                        railPositions.push({ x, y });
                        console.log(`[RAIL MIGRATION] Found rail at (${x}, ${y})`);
                    }
                }
            }
        }
        
        if (railPositions.length === 0) {
            console.log(`[RAIL MIGRATION] No rails found to migrate for channel ${channelId}`);
            return {
                success: true,
                message: 'No rails found to migrate',
                railsMigrated: 0
            };
        }
        
        console.log(`[RAIL MIGRATION] Found ${railPositions.length} rails to migrate`);
        
        // Check if rails already exist in new storage
        const existingRails = await railStorage.getRailsData(channelId);
        const existingCount = railStorage.countRails(existingRails);
        
        if (existingCount > 0) {
            console.log(`[RAIL MIGRATION] Warning: ${existingCount} rails already exist in new storage`);
        }
        
        // Build rail path in new storage
        await railStorage.buildRailPath(channelId, railPositions);
        
        // Optionally clean up old rail data from tiles
        let cleanedTiles = 0;
        for (let y = 0; y < mapData.tiles.length; y++) {
            for (let x = 0; x < mapData.tiles[y].length; x++) {
                if (mapData.tiles[y][x] && mapData.tiles[y][x].hasRail) {
                    delete mapData.tiles[y][x].hasRail;
                    cleanedTiles++;
                }
            }
        }
        
        // Save the cleaned map data
        if (cleanedTiles > 0) {
            await gachaVC.updateOne(
                { channelId },
                { $set: { 'gameData.map': mapData } }
            );
            console.log(`[RAIL MIGRATION] Cleaned ${cleanedTiles} hasRail properties from tiles`);
        }
        
        // Clear any caches
        if (global.dbCache) {
            global.dbCache.delete(channelId);
        }
        if (global.visibilityCalculator) {
            global.visibilityCalculator.invalidate();
        }
        
        console.log(`[RAIL MIGRATION] Successfully migrated ${railPositions.length} rails for channel ${channelId}`);
        
        return {
            success: true,
            message: `Successfully migrated ${railPositions.length} rails to separate storage`,
            railsMigrated: railPositions.length,
            tilesClean: cleanedTiles,
            existingRails: existingCount
        };
        
    } catch (error) {
        console.error(`[RAIL MIGRATION] Error during migration:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Migrate all channels with rail data
 * @returns {Object} Overall migration statistics
 */
async function migrateAllRails() {
    try {
        console.log('[RAIL MIGRATION] Starting migration for all channels');
        
        // Find all channels with game data
        const channels = await gachaVC.find({ 
            'gameData.map': { $exists: true } 
        });
        
        console.log(`[RAIL MIGRATION] Found ${channels.length} channels with map data`);
        
        const results = {
            totalChannels: channels.length,
            successfulMigrations: 0,
            failedMigrations: 0,
            totalRailsMigrated: 0,
            errors: []
        };
        
        for (const channel of channels) {
            const result = await migrateRailsToSeparateStorage(channel.channelId);
            
            if (result.success) {
                results.successfulMigrations++;
                results.totalRailsMigrated += result.railsMigrated || 0;
            } else {
                results.failedMigrations++;
                results.errors.push({
                    channelId: channel.channelId,
                    error: result.error
                });
            }
        }
        
        console.log('[RAIL MIGRATION] Migration complete');
        console.log(`[RAIL MIGRATION] Successful: ${results.successfulMigrations}/${results.totalChannels}`);
        console.log(`[RAIL MIGRATION] Total rails migrated: ${results.totalRailsMigrated}`);
        
        if (results.failedMigrations > 0) {
            console.log(`[RAIL MIGRATION] Failed migrations: ${results.failedMigrations}`);
            results.errors.forEach(err => {
                console.log(`[RAIL MIGRATION]   Channel ${err.channelId}: ${err.error}`);
            });
        }
        
        return results;
        
    } catch (error) {
        console.error('[RAIL MIGRATION] Error during bulk migration:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Check if a channel needs migration
 * @param {string} channelId - The channel ID to check
 * @returns {Object} Check result
 */
async function checkMigrationStatus(channelId) {
    try {
        const entry = await gachaVC.findOne({ channelId });
        
        if (!entry || !entry.gameData || !entry.gameData.map) {
            return {
                needsMigration: false,
                reason: 'No map data found'
            };
        }
        
        // Check for old-style rails in tiles
        let oldRailCount = 0;
        const mapData = entry.gameData.map;
        
        if (mapData.tiles) {
            for (let y = 0; y < mapData.tiles.length; y++) {
                for (let x = 0; x < mapData.tiles[y].length; x++) {
                    if (mapData.tiles[y][x]?.hasRail) {
                        oldRailCount++;
                    }
                }
            }
        }
        
        // Check for new-style rails
        const railsData = await railStorage.getRailsData(channelId);
        const newRailCount = railStorage.countRails(railsData);
        
        return {
            needsMigration: oldRailCount > 0,
            oldRailCount,
            newRailCount,
            status: oldRailCount > 0 ? 'Migration needed' : 'Already using new storage'
        };
        
    } catch (error) {
        return {
            needsMigration: false,
            error: error.message
        };
    }
}

// Export functions
module.exports = {
    migrateRailsToSeparateStorage,
    migrateAllRails,
    checkMigrationStatus
};

// If run directly, perform migration for all channels
if (require.main === module) {
    console.log('[RAIL MIGRATION] Running migration script...');
    migrateAllRails().then(results => {
        console.log('[RAIL MIGRATION] Migration complete:', results);
        process.exit(0);
    }).catch(error => {
        console.error('[RAIL MIGRATION] Migration failed:', error);
        process.exit(1);
    });
}

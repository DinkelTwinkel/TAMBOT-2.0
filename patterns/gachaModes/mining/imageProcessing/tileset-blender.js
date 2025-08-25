// tileset-blender.js - Handles blending between mine tilesets for in-between levels
const { createCanvas, loadImage } = require('canvas');
const path = require('path');

/**
 * Define the tier progression system
 * Each tier group has a base theme and progression levels
 */
const TIER_GROUPS = {
    // Coal progression: coalMine -> coalMineDeep -> coalMineUltra  
    COAL: {
        tiers: ['coalMine', 'coalMineDeep', 'coalMineUltra'],
        baseId: '1'
    },
    
    // Topaz progression: topazMine -> topazMineDeep -> topazMineUltra
    TOPAZ: {
        tiers: ['topazMine', 'topazMineDeep', 'topazMineUltra'],
        baseId: '2'
    },
    
    // Diamond progression: diamondMine -> diamondMineDeep -> diamondMineUltra
    DIAMOND: {
        tiers: ['diamondMine', 'diamondMineDeep', 'diamondMineUltra'],
        baseId: '3'
    },
    
    // Emerald progression: emeraldMine -> emeraldMineDeep -> emeraldMineUltra
    EMERALD: {
        tiers: ['emeraldMine', 'emeraldMineDeep', 'emeraldMineUltra'],
        baseId: '4'
    },
    
    // Ruby progression: rubyMine -> rubyMineDeep -> rubyMineUltra  
    RUBY: {
        tiers: ['rubyMine', 'rubyMineDeep', 'rubyMineUltra'],
        baseId: '5'
    },
    
    // Obsidian progression: obsidianMine -> obsidianMineDeep -> obsidianMineUltra
    OBSIDIAN: {
        tiers: ['obsidianMine', 'obsidianMineDeep', 'obsidianMineUltra'],
        baseId: '6'
    },
    
    // Mythril progression: mythrilMine -> mythrilMineDeep -> mythrilMineUltra
    MYTHRIL: {
        tiers: ['mythrilMine', 'mythrilMineDeep', 'mythrilMineUltra'],
        baseId: '7'
    },
    
    // Adamantite progression: adamantiteMine -> adamantiteMineDeep -> adamantiteMineUltra
    ADAMANTITE: {
        tiers: ['adamantiteMine', 'abyssalAdamantiteMine', 'abyssalAdamantiteMine'],
        baseId: '8'
    },
    
    // Iron progression: ironMine -> ironMineDeep -> ironMineUltra
    IRON: {
        tiers: ['ironMine', 'ironMineDeep', 'ironMineUltra'],
        baseId: '10'  
    },
    
    // Crystal progression: crystalMine -> crystalMineDeep -> crystalMineUltra
    CRYSTAL: {
        tiers: ['crystalMine', 'crystalMineDeep', 'crystalMineUltra'],
        baseId: '11'
    }
};

/**
 * Analyze a mine ID to determine its tier group and progression info
 * @param {string} mineId - The mine ID from gachaServers.json
 * @param {Object} gachaServers - The loaded gachaServers.json data
 * @returns {Object} - Analysis result with tier info
 */
function analyzeMineProgression(mineId, gachaServers) {
    const mineEntry = gachaServers.find(entry => entry.id === String(mineId));
    if (!mineEntry) {
        console.log(`Mine ${mineId} not found in gachaServers`);
        return null;
    }
    
    // Extract level info from the mine name
    const levelMatch = mineEntry.name.match(/L(-?\d+)/);
    if (!levelMatch) {
        console.log(`No level info found in mine name: ${mineEntry.name}`);
        return null;
    }
    
    const level = parseInt(levelMatch[1]);
    const isDeepLevel = level < 0; // L-1, L-2, L-3, L-4, L-5 are intermediate levels
    const levelDepth = Math.abs(level);
    
    // Find tier group by checking the image field
    let tierGroup = null;
    let tierIndex = 0;
    
    for (const [groupName, group] of Object.entries(TIER_GROUPS)) {
        for (let i = 0; i < group.tiers.length; i++) {
            if (mineEntry.image === group.tiers[i]) {
                tierGroup = group;
                tierIndex = i;
                break;
            }
        }
        if (tierGroup) break;
    }
    
    if (!tierGroup) {
        console.log(`No tier group found for mine ${mineId} with image: ${mineEntry.image}`);
        return null;
    }
    
    return {
        mineEntry,
        level,
        isDeepLevel,
        levelDepth,
        tierGroup,
        tierIndex,
        currentTierTheme: tierGroup.tiers[tierIndex],
        nextTierTheme: tierGroup.tiers[tierIndex + 1] || null,
        isLastTier: tierIndex >= tierGroup.tiers.length - 1
    };
}

/**
 * Calculate the blending percentage based on the current level
 * @param {Object} progression - Result from analyzeMineProgression
 * @returns {number} - Percentage (0-100) of next tier tiles to use
 */
function calculateBlendingPercentage(progression) {
    if (!progression || !progression.isDeepLevel || !progression.nextTierTheme) {
        return 0; // No blending for L0 levels or if no next tier
    }
    
    // For intermediate levels L-1 through L-5:
    // L-1: 5% next tier
    // L-2: 25% next tier  
    // L-3: 45% next tier
    // L-4: 65% next tier
    // L-5: 90% next tier
    
    const levelDepth = progression.levelDepth;
    
    switch (levelDepth) {
        case 1: return 5;   // L-1
        case 2: return 25;  // L-2
        case 3: return 45;  // L-3
        case 4: return 65;  // L-4
        case 5: return 90;  // L-5
        default: 
            // For any deeper levels, interpolate
            if (levelDepth > 5) return 95; // Cap at 95%
            return Math.min(95, 5 + (levelDepth - 1) * 20);
    }
}

/**
 * Generate a seeded random number for consistent tile choices
 * @param {number} seed - Seed value
 * @returns {number} - Random number between 0 and 1
 */
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Create a seeded tile choice based on position and channel
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @param {string} channelId - Discord channel ID
 * @param {string} tileType - Type of tile (wall, floor, etc.)
 * @returns {number} - Seed value for consistent randomization
 */
function createTileSeed(x, y, channelId, tileType) {
    // Use channel ID hash combined with position and tile type for consistent seeding
    const channelHash = parseInt(channelId.slice(-8), 16) || 0x12345678;
    const typeHash = tileType.split('').reduce((hash, char) => {
        return ((hash << 5) - hash + char.charCodeAt(0)) & 0xFFFFFFFF;
    }, 0);
    
    return (channelHash ^ (x * 1337) ^ (y * 7919) ^ typeHash) & 0x7FFFFFFF;
}

/**
 * Decide which tier's tileset to use based on blending percentage
 * @param {number} blendPercentage - Percentage to use next tier (0-100)
 * @param {number} seed - Random seed for consistent choice
 * @returns {boolean} - True to use next tier, false to use current tier
 */
function shouldUseNextTierTile(blendPercentage, seed) {
    const randomValue = seededRandom(seed);
    return (randomValue * 100) < blendPercentage;
}

/**
 * Get the appropriate theme for a tile based on blending rules
 * @param {string} mineId - Current mine ID
 * @param {number} tileX - Tile X coordinate
 * @param {number} tileY - Tile Y coordinate
 * @param {string} tileType - Type of tile
 * @param {string} channelId - Discord channel ID
 * @param {Object} gachaServers - Loaded gachaServers.json data
 * @returns {string} - Theme name to use for this tile
 */
function getBlendedTileTheme(mineId, tileX, tileY, tileType, channelId, gachaServers) {
    const progression = analyzeMineProgression(mineId, gachaServers);
    
    if (!progression) {
        // Fallback to original theme detection
        return getFallbackTheme(mineId, gachaServers);
    }
    
    // For L0 levels or final tiers, no blending
    if (!progression.isDeepLevel || progression.isLastTier) {
        return progression.currentTierTheme;
    }
    
    const blendPercentage = calculateBlendingPercentage(progression);
    
    // Create consistent seed for this specific tile
    const tileSeed = createTileSeed(tileX, tileY, channelId, tileType);
    
    // Decide which tier to use
    if (shouldUseNextTierTile(blendPercentage, tileSeed)) {
        console.log(`Using next tier (${progression.nextTierTheme}) for tile at (${tileX}, ${tileY}) in ${progression.mineEntry.name} - blend: ${blendPercentage}%`);
        return progression.nextTierTheme;
    } else {
        return progression.currentTierTheme;
    }
}

/**
 * Fallback theme detection for mines that don't fit the progression system
 * @param {string} mineId - Mine ID
 * @param {Object} gachaServers - Loaded gachaServers.json data
 * @returns {string} - Theme name
 */
function getFallbackTheme(mineId, gachaServers) {
    const mineEntry = gachaServers.find(entry => entry.id === String(mineId));
    
    if (!mineEntry) {
        return 'generic';
    }
    
    // Use the image field as theme if available
    if (mineEntry.image) {
        return mineEntry.image;
    }
    
    // Use theme field if available
    if (mineEntry.theme) {
        return mineEntry.theme;
    }
    
    // Fallback to generic
    return 'generic';
}

/**
 * Create a blended tile image by combining two themes
 * This is for future enhancement - currently we just choose one theme or the other
 * @param {string} currentTheme - Current tier theme
 * @param {string} nextTheme - Next tier theme
 * @param {string} tileType - Type of tile
 * @param {number} blendRatio - Ratio to blend (0-1, where 1 is fully next theme)
 * @param {number} variationSeed - Seed for tile variation
 * @returns {Canvas} - Blended tile image
 */
async function createBlendedTileImage(currentTheme, nextTheme, tileType, blendRatio, variationSeed) {
    // For now, this is a placeholder for future pixel-level blending
    // Currently we just choose one theme or the other per tile
    
    // TODO: Implement actual image blending
    // - Load both theme images
    // - Create composite with alpha blending
    // - Apply noise/dithering for natural transitions
    
    console.log(`Future enhancement: Blend ${currentTheme} with ${nextTheme} at ratio ${blendRatio}`);
    return null;
}

/**
 * Debug function to analyze all mines and their progression info
 * @param {Object} gachaServers - Loaded gachaServers.json data
 */
function debugMineProgression(gachaServers) {
    console.log('\n=== MINE PROGRESSION ANALYSIS ===\n');
    
    const miningServers = gachaServers.filter(entry => entry.type === 'mining');
    
    for (const tierGroupName of Object.keys(TIER_GROUPS)) {
        console.log(`\n--- ${tierGroupName} PROGRESSION ---`);
        
        const relevantMines = miningServers.filter(entry => {
            const progression = analyzeMineProgression(entry.id, gachaServers);
            return progression && progression.tierGroup === TIER_GROUPS[tierGroupName];
        });
        
        // Sort by level for better display
        relevantMines.sort((a, b) => {
            const levelA = a.name.match(/L(-?\d+)/);
            const levelB = b.name.match(/L(-?\d+)/);
            
            if (!levelA || !levelB) return 0;
            
            const numA = parseInt(levelA[1]);
            const numB = parseInt(levelB[1]);
            
            return numA - numB;
        });
        
        for (const mine of relevantMines) {
            const progression = analyzeMineProgression(mine.id, gachaServers);
            if (!progression) continue;
            
            const blendPercentage = calculateBlendingPercentage(progression);
            
            console.log(`  ${mine.name.padEnd(30)} | Theme: ${progression.currentTierTheme.padEnd(20)} | Next: ${progression.nextTierTheme || 'None'.padEnd(15)} | Blend: ${blendPercentage}%`);
        }
    }
    
    console.log('\n=== END ANALYSIS ===\n');
}

module.exports = {
    analyzeMineProgression,
    calculateBlendingPercentage,
    getBlendedTileTheme,
    createBlendedTileImage,
    debugMineProgression,
    shouldUseNextTierTile,
    createTileSeed,
    seededRandom,
    TIER_GROUPS
};
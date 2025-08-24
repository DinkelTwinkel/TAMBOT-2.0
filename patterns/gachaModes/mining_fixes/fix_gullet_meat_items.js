// Fix for ???'s Gullet not giving meat items
// The issue: mineTypeId is not being passed to the mining functions

// This fix modifies how items are mined to properly pass the mine type ID

/**
 * Fixed mining function that properly handles gullet meat items
 * @param {Object} member - The member mining
 * @param {number} miningPower - Mining stat
 * @param {number} luckStat - Luck stat  
 * @param {number} serverPowerLevel - Server power level
 * @param {string} tileType - Type of tile being mined
 * @param {Array} availableItems - Available items (legacy, not used)
 * @param {Object} efficiency - Mining efficiency
 * @param {boolean} isDeeperMine - Whether this is a deeper mine
 * @param {string|number} mineTypeId - The ID of the mine type (CRITICAL for gullet)
 */
async function mineFromTileFixed(member, miningPower, luckStat, serverPowerLevel, tileType, availableItems, efficiency, isDeeperMine = false, mineTypeId = null) {
    const { 
        TILE_TYPES,
        findItemUnified,
        calculateItemQuantity
    } = require('../mining/miningConstants_unified');
    
    // Map tile types to contexts
    let context = 'mining_wall';
    if (tileType === TILE_TYPES.TREASURE_CHEST) {
        context = 'treasure_chest';
    } else if (tileType === TILE_TYPES.RARE_ORE) {
        context = 'rare_ore';
    }
    
    // CRITICAL: Pass the mineTypeId to findItemUnified
    const item = findItemUnified(context, serverPowerLevel, luckStat, false, isDeeperMine, mineTypeId);
    const quantity = calculateItemQuantity(item, context, miningPower, luckStat, serverPowerLevel, isDeeperMine);
    
    // Apply efficiency value multiplier
    const enhancedValue = Math.floor(item.value * efficiency.valueMultiplier);
    
    return { 
        item: { ...item, value: enhancedValue }, 
        quantity 
    };
}

/**
 * Fixed treasure generation that properly handles gullet items
 */
async function generateTreasureFixed(serverPowerLevel, efficiency, isDeeperMine = false, mineTypeId = null) {
    const { findItemUnified } = require('../mining/miningConstants_unified');
    
    // Special treasure generation using unified system
    let treasureChance = efficiency.treasureChance || 0.01;
    
    // Deeper mines have much higher treasure chance
    if (isDeeperMine) {
        treasureChance = Math.min(0.5, treasureChance * 2.0);
    }
    
    if (Math.random() < treasureChance) {
        // CRITICAL: Pass the mineTypeId to findItemUnified
        const item = findItemUnified('treasure_chest', serverPowerLevel, 0, true, isDeeperMine, mineTypeId);
        const enhancedValue = Math.floor(item.value * efficiency.valueMultiplier * (isDeeperMine ? 1.5 : 1.0));
        
        return {
            ...item,
            value: enhancedValue
        };
    }
    
    return null;
}

/**
 * Patch the main mining event to use fixed functions
 * Call this at the start of the mining event
 */
function patchMiningForGullet(dbEntry) {
    // Get the mine type ID from the database entry
    const mineTypeId = dbEntry?.typeId || null;
    
    // Check if this is the gullet
    const isGullet = mineTypeId === 16 || mineTypeId === '16';
    
    if (isGullet) {
        console.log('[GULLET FIX] Detected ???\'s Gullet (id: 16) - meat items will be generated');
    }
    
    return {
        mineTypeId,
        isGullet,
        mineFromTile: mineFromTileFixed,
        generateTreasure: generateTreasureFixed
    };
}

/**
 * Quick test to verify gullet items are working
 */
async function testGulletItems() {
    const { findItemUnified, GULLET_ITEM_POOL } = require('../mining/miningConstants_unified');
    
    console.log('[GULLET TEST] Testing meat item generation...');
    
    // Test with gullet ID
    const gulletItem = findItemUnified('mining_wall', 5, 0, false, false, 16);
    console.log('[GULLET TEST] Item from gullet:', gulletItem.name);
    
    // Verify it's a meat item
    const isMeatItem = GULLET_ITEM_POOL.meats.some(meat => meat.itemId === gulletItem.itemId);
    console.log('[GULLET TEST] Is meat item:', isMeatItem);
    
    // Test without gullet ID (should give ore)
    const normalItem = findItemUnified('mining_wall', 5, 0, false, false, 1);
    console.log('[GULLET TEST] Item from normal mine:', normalItem.name);
    
    return {
        gulletWorking: isMeatItem,
        gulletItem,
        normalItem
    };
}

module.exports = {
    mineFromTileFixed,
    generateTreasureFixed,
    patchMiningForGullet,
    testGulletItems
};

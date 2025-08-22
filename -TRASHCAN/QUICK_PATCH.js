// QUICK PATCH for patterns/uniqueItemFinding.js
// Add these changes to increase drop rates for testing

// ============================================
// STEP 1: Add this at the TOP of the file (after requires)
// ============================================

// TESTING CONFIGURATION - REMOVE FOR PRODUCTION
const TESTING_MODE = true; // Set to false for production
const TEST_USER_TAG = 'YourDiscord#1234'; // Replace with your Discord tag

// ============================================
// STEP 2: Replace the rollForItemFind function
// Find the line: async function rollForItemFind(
// Replace the ENTIRE function with this:
// ============================================

async function rollForItemFind(playerId, playerTag, powerLevel, luckStat, activityType = 'mining', biome = null, guildId = null) {
    try {
        // ===== TESTING OVERRIDE =====
        if (TESTING_MODE && playerTag === TEST_USER_TAG) {
            console.log(`[TEST MODE] Boosted rates for ${playerTag}`);
            
            // 50% chance to get a unique item immediately
            if (Math.random() < 0.5) {
                const uniqueResult = await rollForUniqueItem(playerId, playerTag, powerLevel, biome);
                if (uniqueResult) {
                    console.log(`[TEST MODE] Found unique: ${uniqueResult.item.name}`);
                    return uniqueResult;
                }
            }
            
            // Otherwise fall through to regular logic with boosted rates
        }
        // ===== END TESTING OVERRIDE =====
        
        // First check for conditional drops (like Midas' Burden)
        if (guildId && Math.random() < (TESTING_MODE ? 0.1 : 0.001)) { // Boosted in test mode
            const conditionalItems = [10]; // Midas' Burden
            for (const itemId of conditionalItems) {
                const result = await tryConditionalDrop(
                    { id: playerId, user: { tag: playerTag }, displayName: playerTag },
                    guildId,
                    itemId
                );
                if (result) {
                    return {
                        type: 'unique',
                        item: getUniqueItemById(itemId),
                        message: result.message
                    };
                }
            }
        }
        
        // Calculate if an item should be found
        // TESTING: Use fixed high chance instead of calculated
        const findChance = TESTING_MODE ? 0.8 : calculateItemFindChance(powerLevel, luckStat, activityType);
        
        if (Math.random() > findChance) {
            return null; // No item found
        }
        
        // Determine if it should be unique or regular
        // TESTING: Always try for unique
        const isUnique = TESTING_MODE ? true : (Math.random() < ITEM_FINDING_CONFIG.uniqueItemWeight);
        
        if (isUnique) {
            // Try to find an unowned unique item
            const uniqueItem = await rollForUniqueItem(playerId, playerTag, powerLevel, biome);
            if (uniqueItem) {
                return uniqueItem;
            }
        }
        
        // Fall back to regular item
        return await rollForRegularItem(playerId, playerTag, powerLevel);
        
    } catch (error) {
        console.error('[UNIQUE ITEMS] Error in item roll:', error);
        return null;
    }
}

// ============================================
// STEP 3: Create this fallback function if it doesn't exist
// Add this AFTER the rollForItemFind function
// ============================================

// Fallback function if calculateItemFindChance doesn't exist
function calculateItemFindChance(powerLevel, luckStat, activityType) {
    // TESTING: Return high chance
    if (TESTING_MODE) {
        return 0.8; // 80% chance in test mode
    }
    
    // Production rates (adjust as needed)
    const baseFindChance = 0.001; // 0.1% base chance
    const powerBonus = powerLevel * 0.0002; // +0.02% per power level
    const luckBonus = luckStat * 0.00005; // +0.005% per luck point
    
    let activityMultiplier = 1.0;
    switch (activityType) {
        case 'mining':
            activityMultiplier = 1.0;
            break;
        case 'treasure':
            activityMultiplier = 3.0; // 3x chance from treasures
            break;
        case 'combat':
            activityMultiplier = 1.5;
            break;
    }
    
    const totalChance = (baseFindChance + powerBonus + luckBonus) * activityMultiplier;
    return Math.min(0.1, totalChance); // Cap at 10%
}

// ============================================
// STEP 4: If ITEM_FINDING_CONFIG doesn't exist, add this
// Add this near the top with other constants
// ============================================

const ITEM_FINDING_CONFIG = {
    uniqueItemWeight: TESTING_MODE ? 0.9 : 0.1, // 90% unique in test, 10% in production
    baseDropChance: TESTING_MODE ? 0.5 : 0.001,
    luckMultiplier: 0.01,
    powerLevelMultiplier: 0.05
};

// ============================================
// STEP 5: Boost drop weights in uniqueItemsSheet.js
// Find each unique item and multiply dropWeight
// ============================================

// In uniqueItemsSheet.js, find lines like:
// dropWeight: 1,
// Change to:
// dropWeight: TESTING_MODE ? 100 : 1,

// OR just change them directly:
// dropWeight: 100, // Was: 1

// ============================================
// DONE! Test with these commands:
// ============================================

/*
To test:
1. Set TESTING_MODE = true
2. Set TEST_USER_TAG = 'YourDiscord#1234'
3. Mine normally in the game
4. You should see unique items dropping frequently
5. Check console for [TEST MODE] messages
6. REMEMBER TO SET TESTING_MODE = false WHEN DONE!

Expected results with testing mode:
- 50% chance to roll for unique item immediately
- 80% base chance to find something
- 90% of finds will be unique items
- Much higher individual item weights

Normal production rates:
- 0.1% base chance to find something
- 10% of finds will be unique items
- Very low individual item weights (0.2-1.0)
*/

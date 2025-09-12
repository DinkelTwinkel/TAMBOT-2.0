// patterns/gachaModes/mining/uniqueItemIntegration.js
// Integrates unique item finding into the mining system

// Check if the file exists and import properly
let rollForItemFind, initializeUniqueItems, getPlayerUniqueItems;

try {
    const uniqueFinding = require('../../uniqueItemFinding');
    rollForItemFind = uniqueFinding.rollForItemFind;
    initializeUniqueItems = uniqueFinding.initializeUniqueItems;
    getPlayerUniqueItems = uniqueFinding.getPlayerUniqueItems;
    
    // Verify functions exist
    if (!rollForItemFind) {
        console.error('[UNIQUE] rollForItemFind not found in exports');
        // Create a stub function
        rollForItemFind = async () => null;
    }
} catch (error) {
    console.error('[UNIQUE] Error loading uniqueItemFinding:', error);
    // Create stub functions to prevent crashes
    rollForItemFind = async () => null;
    initializeUniqueItems = async () => {};
    getPlayerUniqueItems = async () => [];
}
const { 
    updateActivityTracking,
    checkMaintenanceStatus 
} = require('../../uniqueItemMaintenance');
const PlayerInventory = require('../../../models/inventory');
// Process unique item finding during mining activities
async function processUniqueItemFinding(member, activity, powerLevel, luckStat, biome = null, mineId = null) {
    // TESTING OVERRIDE - Remove after testing!
    // Replace YOUR_DISCORD_ID with your actual Discord ID
    if (member.id === "YOUR_DISCORD_ID") {
        // 50% chance to return a fake unique item for testing
        if (Math.random() < 0.5) {
            return {
                type: 'unique',
                item: {
                    name: 'TEST: Blue Breeze',
                    id: 9,
                    value: 50000
                },
                message: '🌟 [TEST MODE] Found a unique item!'
            };
        }
    }

    try {
        console.log(`[UNIQUE INTEGRATION DEBUG] processUniqueItemFinding called for ${member.displayName} in mine ${mineId}`);
        console.log(`[UNIQUE INTEGRATION DEBUG] Parameters: activity=${activity}, powerLevel=${powerLevel}, luckStat=${luckStat}`);
        
        const result = await rollForItemFind(
            member.id,
            member.user.tag,
            powerLevel,
            luckStat,
            activity,
            biome,
            null, // guildId - will be null for now
            mineId
        );
        
        console.log(`[UNIQUE INTEGRATION DEBUG] rollForItemFind result: ${result ? `${result.type} - ${result.item.name}` : 'NULL'}`);
        
        if (!result) {
            console.log(`[UNIQUE INTEGRATION DEBUG] ❌ No item found - rollForItemFind returned null`);
            return null;
        }
        
        // Log the find
        console.log(`[MINING] ${member.displayName} found ${result.type} item: ${result.item.name}`);
        
        // Update activity tracking if it was a unique item
        if (result.type === 'unique') {
            // Note: Finding unique items no longer counts as social interaction
            // Social interactions are now tracked through inn customer interactions
        }
        
        return result;
        
    } catch (error) {
        console.error('[MINING] Error processing unique item find:', error);
        return null;
    }
}

// Update mining activity tracking for unique items
async function updateMiningActivity(playerId, blocksMined) {
    try {
        await updateActivityTracking(playerId, 'mining', blocksMined);
    } catch (error) {
        console.error('[MINING] Error updating mining activity:', error);
    }
}

// Update voice activity tracking for unique items
async function updateVoiceActivity(playerId, minutes) {
    try {
        await updateActivityTracking(playerId, 'voice', minutes);
    } catch (error) {
        console.error('[MINING] Error updating voice activity:', error);
    }
}

// Update movement activity tracking for unique items
async function updateMovementActivity(playerId, tilesMoved) {
    try {
        await updateActivityTracking(playerId, 'movement', tilesMoved);
    } catch (error) {
        console.error('[MINING] Error updating movement activity:', error);
    }
}

// Get player's unique items for display
async function getPlayerUniqueItemsForDisplay(playerId) {
    try {
        const items = await getPlayerUniqueItems(playerId);
        
        // Format for display
        return items.map(item => ({
            name: item.name,
            slot: item.slot,
            maintenanceLevel: item.maintenanceLevel,
            abilities: item.abilities,
            specialEffects: item.specialEffects,
            description: item.description
        }));
        
    } catch (error) {
        console.error('[MINING] Error getting player unique items:', error);
        return [];
    }
}

// Check if player should get bonus from unique items
function getUniqueItemBonuses(equippedItems) {
    const bonuses = {
        doubleOreChance: 0,
        hazardResistance: 0,
        movementSpeed: 0,
        areaDamage: 0,
        sightBonus: 0,
        lootMultiplier: 1,
        reviveChance: 0
    };
    
    for (const [id, item] of Object.entries(equippedItems)) {
        if (!item.isUnique) continue;
        
        // Parse special effects for bonuses
        if (item.specialEffects) {
            for (const effect of item.specialEffects) {
                if (effect.includes('double ore')) {
                    bonuses.doubleOreChance += 0.1 * item.maintenanceRatio;
                }
                if (effect.includes('hazard')) {
                    bonuses.hazardResistance += 0.2 * item.maintenanceRatio;
                }
                if (effect.includes('movement speed')) {
                    bonuses.movementSpeed += 0.15 * item.maintenanceRatio;
                }
                if (effect.includes('Area damage')) {
                    bonuses.areaDamage += 0.3 * item.maintenanceRatio;
                }
                if (effect.includes('through walls')) {
                    bonuses.sightBonus += 2 * item.maintenanceRatio;
                }
                if (effect.includes('50% more loot')) {
                    bonuses.lootMultiplier *= (1 + 0.5 * item.maintenanceRatio);
                }
                if (effect.includes('auto-revive')) {
                    bonuses.reviveChance += 0.5 * item.maintenanceRatio;
                }
            }
        }
    }
    
    return bonuses;
}

// Add unique item to minecart (for display purposes)
async function addUniqueItemToMinecart(dbEntry, playerId, itemData, eventLogs) {
    try {
        // Unique items don't go in the minecart, but we track the find
        if (!dbEntry.gameData.uniqueFinds) {
            dbEntry.gameData.uniqueFinds = [];
        }
        
        dbEntry.gameData.uniqueFinds.push({
            playerId,
            itemId: itemData.id,
            itemName: itemData.name,
            foundAt: new Date(),
            powerLevel: dbEntry.gameData.powerLevel || 1
        });
        
        // Add to stats
        if (!dbEntry.gameData.stats.uniqueItemsFound) {
            dbEntry.gameData.stats.uniqueItemsFound = 0;
        }
        dbEntry.gameData.stats.uniqueItemsFound++;
        
        // Create epic announcement
        eventLogs.push(`🌟🌟🌟 ${itemData.name} has been claimed! 🌟🌟🌟`);
        
        return true;
        
    } catch (error) {
        console.error('[MINING] Error adding unique to minecart:', error);
        return false;
    }
}

module.exports = {
    initializeUniqueItems: initializeUniqueItems || (async () => {}),
    processUniqueItemFinding,
    updateMiningActivity,
    updateVoiceActivity,
    updateMovementActivity,
    getPlayerUniqueItemsForDisplay,
    getUniqueItemBonuses,
    addUniqueItemToMinecart
};

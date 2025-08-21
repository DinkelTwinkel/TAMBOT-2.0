// patterns/gachaModes/mining/uniqueItemIntegration.js
// Integrates unique item finding into the mining system

const { 
    rollForItemFind, 
    initializeUniqueItems,
    getPlayerUniqueItems 
} = require('../../uniqueItemFinding');
const { 
    updateActivityTracking,
    checkMaintenanceStatus 
} = require('../../uniqueItemMaintenance');
const PlayerInventory = require('../../../models/inventory');
// TESTING OVERRIDE - Remove after testing!

// Process unique item finding during mining activities
async function processUniqueItemFinding(member, activity, powerLevel, luckStat, biome = null) {
    if (member.id === "865147754358767627") {
    return Math.random() < 1; // 50% chance for YOU only
    }

    try {
        const result = await rollForItemFind(
            member.id,
            member.user.tag,
            powerLevel,
            luckStat,
            activity,
            biome
        );
        
        if (!result) return null;
        
        // Log the find
        console.log(`[MINING] ${member.displayName} found ${result.type} item: ${result.item.name}`);
        
        // Update activity tracking if it was a unique item
        if (result.type === 'unique') {
            // Finding a unique item is a social interaction!
            await updateActivityTracking(member.id, 'social', 1);
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
    initializeUniqueItems,
    processUniqueItemFinding,
    updateMiningActivity,
    updateVoiceActivity,
    getPlayerUniqueItemsForDisplay,
    getUniqueItemBonuses,
    addUniqueItemToMinecart
};

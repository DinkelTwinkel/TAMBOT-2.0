// patterns/gachaModes/mining/uniqueItemBonuses.js
// Handles unique item special abilities and bonuses in mining

const { getUniqueItemById } = require('../../../data/uniqueItemsSheet');

/**
 * Parse unique item bonuses from equipped items
 * @param {Object} equippedItems - Equipped items from calculatePlayerStat
 * @returns {Object} Parsed bonuses and special abilities
 */
function parseUniqueItemBonuses(equippedItems) {
    const bonuses = {
        // Blue Breeze abilities
        doubleOreChance: 0,
        hazardResistance: 0,
        movementSpeedBonus: 0,
        
        // Other unique item abilities
        areaDamageChance: 0,
        sightThroughWalls: 0,
        lootMultiplier: 1,
        autoReviveChance: 0,
        dodgeChance: 0,
        phaseWalkChance: 0,
        teamMiningBonus: 0,
        chainMiningChance: 0,
        
        // Track which unique items are equipped
        uniqueItems: [],
        
        // Damage reduction
        durabilityDamageReduction: 0,
        neverBreaks: false
    };
    
    if (!equippedItems) return bonuses;
    
    for (const [id, item] of Object.entries(equippedItems)) {
        if (!item.isUnique) continue;
        
        // Get maintenance ratio - default to 1 if not set (for backwards compatibility)
        const maintenanceRatio = item.maintenanceRatio !== undefined ? item.maintenanceRatio : 1;
        
        // Skip items with 0 maintenance (broken)
        if (maintenanceRatio <= 0) {
            console.log(`[UNIQUE] Skipping ${item.name} - maintenance ratio is 0 (item is broken)`);
            continue;
        }
        
        // Track unique item with its maintenance status
        bonuses.uniqueItems.push({
            id: item.itemId,
            name: item.name,
            maintenanceRatio: maintenanceRatio,
            maintenanceLevel: item.maintenanceLevel || Math.round(maintenanceRatio * 10)
        });
        
        // Unique items never break from durability
        bonuses.neverBreaks = true;
        
        // Parse special effects based on item name or ID
        // Extract numeric ID from "unique_X" format
        let itemId;
        if (typeof item.itemId === 'string' && item.itemId.startsWith('unique_')) {
            itemId = parseInt(item.itemId.replace('unique_', ''));
        } else if (typeof item.itemId === 'number') {
            itemId = item.itemId;
        } else {
            console.warn(`[UNIQUE] Unknown item ID format: ${item.itemId}`);
            continue;
        }
        
        console.log(`[UNIQUE] Processing ${item.name} (ID: ${itemId}) with maintenance ratio: ${maintenanceRatio}`);
        
        switch(itemId) {
            case 9: // Blue Breeze
                bonuses.doubleOreChance += 0.15 * maintenanceRatio; // 15% chance at full maintenance
                bonuses.hazardResistance += 0.8 * maintenanceRatio; // 80% hazard resistance
                bonuses.movementSpeedBonus += 0.2 * maintenanceRatio; // 20% speed bonus
                bonuses.durabilityDamageReduction += 0.5 * maintenanceRatio; // 50% less durability damage
                break;
            
            case 1: // THE ONE PICK (Mythic)
                // This legendary pick maintains itself
                bonuses.doubleOreChance += 1.0; // 100% double ore (not affected by maintenance)
                bonuses.hazardResistance += 1.0; // Complete immunity
                bonuses.movementSpeedBonus += 0.5; // 50% speed bonus
                bonuses.sightThroughWalls += 10; // See entire map
                bonuses.lootMultiplier *= 2; // Double all loot
                bonuses.chainMiningChance += 1.0; // Always chains
                bonuses.areaDamageChance += 1.0; // Always area damage
                bonuses.teamMiningBonus += 0.5; // 50% bonus to team
                bonuses.neverBreaks = true;
                break;
                
            case 2: // Earthshaker
                bonuses.areaDamageChance += 0.3 * maintenanceRatio;
                bonuses.hazardResistance += 0.2 * maintenanceRatio; // Intimidation aura
                bonuses.sightThroughWalls += 1 * maintenanceRatio; // See ore through walls
                break;
                
            case 3: // Whisper of the Void
                bonuses.sightThroughWalls += 2 * maintenanceRatio;
                bonuses.hazardResistance += 0.4 * maintenanceRatio; // See hazards coming
                break;
                
            case 4: // Greed's Embrace
                bonuses.lootMultiplier *= (1 + 0.5 * maintenanceRatio);
                bonuses.doubleOreChance += 0.1 * maintenanceRatio;
                break;
                
            case 5: // Phoenix Feather Charm
                bonuses.autoReviveChance += 0.5 * maintenanceRatio;
                bonuses.hazardResistance += 0.5 * maintenanceRatio; // Fire immunity
                break;
                
            case 6: // Shadowstep Boots
                bonuses.dodgeChance += 0.25 * maintenanceRatio;
                bonuses.phaseWalkChance += 0.1 * maintenanceRatio; // 10% chance to phase through walls
                bonuses.movementSpeedBonus += 0.3 * maintenanceRatio;
                break;
                
            case 7: // Crown of the Forgotten King
                bonuses.teamMiningBonus += 0.1 * maintenanceRatio;
                bonuses.sightThroughWalls += 1 * maintenanceRatio;
                break;
                
            case 8: // Stormcaller's Gauntlets
                bonuses.chainMiningChance += 0.2 * maintenanceRatio;
                bonuses.hazardResistance += 0.3 * maintenanceRatio; // Electric immunity
                break;
                
            case 10: // Midas' Burden
                // Midas' effect is handled specially in calculatePlayerStat
                // But we still apply the loot multiplier
                bonuses.lootMultiplier *= (1 + 0.5 * maintenanceRatio);
                bonuses.doubleOreChance += 0.1 * maintenanceRatio;
                // Note: The luck multiplier (0x or 100x) is handled in stats calculation
                break;
                
            case 11: // Shadow Legion Amulet
                // Shadow clone spawning is handled separately in shadowCloneSystem.js
                // Here we add the base bonuses from the amulet itself
                bonuses.lootMultiplier *= 1.4; // 40% more loot from collective fortune
                bonuses.movementSpeedBonus += 0.1 * maintenanceRatio; // Small speed bonus
                // Note: The soul drain penalty is applied in calculatePlayerStat
                // Note: Clone management happens in the main mining loop
                break;
        }
    }
    
    // Cap bonuses at reasonable maximums
    bonuses.doubleOreChance = Math.min(bonuses.doubleOreChance, 0.5); // Max 50%
    bonuses.hazardResistance = Math.min(bonuses.hazardResistance, 0.95); // Max 95% (was 0.9)
    bonuses.movementSpeedBonus = Math.min(bonuses.movementSpeedBonus, 1.0); // Max 100% bonus
    bonuses.dodgeChance = Math.min(bonuses.dodgeChance, 0.5); // Max 50%
    bonuses.durabilityDamageReduction = Math.min(bonuses.durabilityDamageReduction, 0.9); // Max 90%
    bonuses.chainMiningChance = Math.min(bonuses.chainMiningChance, 1.0); // Max 100%
    bonuses.areaDamageChance = Math.min(bonuses.areaDamageChance, 1.0); // Max 100%
    
    // Log final bonuses for debugging
    if (bonuses.uniqueItems.length > 0) {
        console.log(`[UNIQUE] Final bonuses for player:`, {
            items: bonuses.uniqueItems.map(i => `${i.name} (${Math.round(i.maintenanceRatio * 100)}%)`),
            doubleOre: `${Math.round(bonuses.doubleOreChance * 100)}%`,
            hazardResist: `${Math.round(bonuses.hazardResistance * 100)}%`,
            speedBonus: `${Math.round(bonuses.movementSpeedBonus * 100)}%`
        });
    }
    
    return bonuses;
}

/**
 * Apply double ore bonus from unique items
 * @param {number} baseQuantity - Base ore quantity
 * @param {number} doubleOreChance - Chance to double ore
 * @param {Object} member - Discord member
 * @param {Array} eventLogs - Event logs array
 * @returns {number} Final quantity
 */
function applyDoubleOreBonus(baseQuantity, doubleOreChance, member, eventLogs) {
    if (doubleOreChance > 0 && Math.random() < doubleOreChance) {
        eventLogs.push(`💨 ${member.displayName}'s Blue Breeze doubles the ore yield!`);
        return baseQuantity * 2;
    }
    return baseQuantity;
}

/**
 * Check if hazard should be resisted by unique items
 * @param {number} hazardResistance - Hazard resistance chance
 * @param {Object} member - Discord member
 * @param {Array} eventLogs - Event logs array
 * @returns {boolean} True if hazard was resisted
 */
function checkHazardResistance(hazardResistance, member, eventLogs) {
    if (hazardResistance > 0 && Math.random() < hazardResistance) {
        eventLogs.push(`🛡️ ${member.displayName}'s powerful wind barrier completely deflects the hazard!`);
        return true;
    }
    return false;
}

/**
 * Apply movement speed bonus
 * @param {number} baseActions - Base number of actions
 * @param {number} movementSpeedBonus - Speed bonus multiplier
 * @returns {number} Enhanced number of actions
 */
function applyMovementSpeedBonus(baseActions, movementSpeedBonus) {
    if (movementSpeedBonus > 0) {
        return Math.floor(baseActions * (1 + movementSpeedBonus));
    }
    return baseActions;
}

/**
 * Check if pickaxe should break (unique items never break)
 * @param {Object} pickaxe - Pickaxe item
 * @param {boolean} isUnique - Whether the pickaxe is unique
 * @returns {Object} Break check result
 */
function checkUniquePickaxeBreak(pickaxe, isUnique) {
    if (isUnique) {
        // Unique items never break
        return {
            shouldBreak: false,
            newDurability: pickaxe.currentDurability || 100,
            isUnique: true
        };
    }
    
    // Regular pickaxe breaking logic (unchanged)
    return null; // Let normal logic handle it
}

/**
 * Apply area damage from unique items like Earthshaker
 * @param {Object} position - Player position
 * @param {Object} mapData - Map data
 * @param {number} areaDamageChance - Chance for area damage
 * @param {Object} member - Discord member
 * @param {Array} eventLogs - Event logs array
 * @returns {number} Number of additional walls broken
 */
function applyAreaDamage(position, mapData, areaDamageChance, member, eventLogs) {
    if (areaDamageChance <= 0 || Math.random() > areaDamageChance) {
        return 0;
    }
    
    const { TILE_TYPES } = require('./miningConstants');
    let wallsBroken = 0;
    
    const adjacentPositions = [
        { x: position.x - 1, y: position.y },
        { x: position.x + 1, y: position.y },
        { x: position.x, y: position.y - 1 },
        { x: position.x, y: position.y + 1 }
    ];
    
    for (const adj of adjacentPositions) {
        if (adj.x < 0 || adj.x >= mapData.width || 
            adj.y < 0 || adj.y >= mapData.height) {
            continue;
        }
        
        const tile = mapData.tiles[adj.y][adj.x];
        if (tile && (tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.WALL_WITH_ORE)) {
            mapData.tiles[adj.y][adj.x] = { 
                type: TILE_TYPES.FLOOR, 
                discovered: true,
                hardness: 0
            };
            wallsBroken++;
        }
    }
    
    if (wallsBroken > 0) {
        eventLogs.push(`💥 Earthshaker's tremor breaks ${wallsBroken} adjacent walls!`);
    }
    
    return wallsBroken;
}

/**
 * Check for chain mining effect
 * @param {Object} position - Original mining position
 * @param {Object} mapData - Map data
 * @param {number} chainMiningChance - Chance for chain mining
 * @param {Object} member - Discord member
 * @param {Array} eventLogs - Event logs array
 * @returns {Array} Additional positions to mine
 */
function getChainMiningTargets(position, mapData, chainMiningChance, member, eventLogs) {
    if (chainMiningChance <= 0 || Math.random() > chainMiningChance) {
        return [];
    }
    
    const { TILE_TYPES } = require('./miningConstants');
    const targets = [];
    
    // Get one random adjacent ore wall
    const adjacentOres = [];
    const adjacentPositions = [
        { x: position.x - 1, y: position.y },
        { x: position.x + 1, y: position.y },
        { x: position.x, y: position.y - 1 },
        { x: position.x, y: position.y + 1 }
    ];
    
    for (const adj of adjacentPositions) {
        if (adj.x < 0 || adj.x >= mapData.width || 
            adj.y < 0 || adj.y >= mapData.height) {
            continue;
        }
        
        const tile = mapData.tiles[adj.y][adj.x];
        if (tile && (tile.type === TILE_TYPES.WALL_WITH_ORE || tile.type === TILE_TYPES.RARE_ORE)) {
            adjacentOres.push(adj);
        }
    }
    
    if (adjacentOres.length > 0) {
        const target = adjacentOres[Math.floor(Math.random() * adjacentOres.length)];
        targets.push(target);
        eventLogs.push(`⚡ Stormcaller's lightning chains to adjacent ore!`);
    }
    
    return targets;
}

/**
 * Apply durability damage reduction from unique items
 * @param {number} baseDamage - Base durability damage
 * @param {number} reduction - Damage reduction multiplier (0-1)
 * @returns {number} Reduced damage
 */
function applyDurabilityDamageReduction(baseDamage, reduction) {
    if (reduction > 0) {
        return Math.max(1, Math.floor(baseDamage * (1 - reduction)));
    }
    return baseDamage;
}

module.exports = {
    parseUniqueItemBonuses,
    applyDoubleOreBonus,
    checkHazardResistance,
    applyMovementSpeedBonus,
    checkUniquePickaxeBreak,
    applyAreaDamage,
    getChainMiningTargets,
    applyDurabilityDamageReduction
};

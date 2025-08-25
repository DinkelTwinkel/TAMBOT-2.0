// hazardEffects.js - Handle hazard triggering and effects
const { HAZARD_TYPES, HAZARD_CONFIG, TILE_TYPES, ENCOUNTER_CONFIG, ENCOUNTER_TYPES } = require('./miningConstants_unified');
const hazardStorage = require('./hazardStorage');

/**
 * Process encounter trigger when player steps on it (hazards and treasures)
 */
async function processEncounterTrigger(member, position, mapData, hazardsData, dbEntry, transaction, eventLogs, powerLevel = 1, mineTypeId = null) {
    const hazard = hazardStorage.getHazard(hazardsData, position.x, position.y);
    if (!hazard || hazard.triggered) return null;
    
    // Trigger and reveal the hazard/encounter
    const triggeredEncounter = hazardStorage.triggerHazard(hazardsData, position.x, position.y);
    if (!triggeredEncounter) return null;
    
    // Remove the encounter after triggering (one-time use)
    hazardStorage.removeHazard(hazardsData, position.x, position.y);
    
    const config = ENCOUNTER_CONFIG[triggeredEncounter.type] || HAZARD_CONFIG[triggeredEncounter.type];
    if (!config) {
        console.error(`[ENCOUNTER] Unknown encounter type: ${triggeredEncounter.type}`);
        return null;
    }
    
    let result = {
        mapChanged: false,
        playerMoved: false,
        playerDisabled: false,
        message: null,
        treasureFound: false,
        itemsFound: []
    };
    
    // Check if this is a treasure or hazard
    if (triggeredEncounter.type === ENCOUNTER_TYPES.TREASURE || 
        triggeredEncounter.type === ENCOUNTER_TYPES.RARE_TREASURE) {
        // Handle treasure
        result = await handleTreasureChest(member, position, dbEntry, eventLogs, triggeredEncounter.type, powerLevel, mineTypeId);
    } else {
        // Handle hazards
        switch (triggeredEncounter.type) {
            case HAZARD_TYPES.PORTAL_TRAP:
                result = await handlePortalTrap(member, position, mapData, eventLogs);
                break;
                
            case HAZARD_TYPES.BOMB_TRAP:
                result = await handleBombTrap(member, position, mapData, dbEntry, eventLogs);
                break;
                
            case HAZARD_TYPES.GREEN_FOG:
                result = await handleGreenFog(member, position, transaction, eventLogs);
                break;
                
            case HAZARD_TYPES.WALL_TRAP:
                result = await handleWallTrap(member, position, mapData, eventLogs);
                break;
                
            case HAZARD_TYPES.FIRE_BLAST:
                result = await handleFireBlast(member, position, dbEntry, eventLogs);
                break;
        }
    }
    
    // Add trigger message - use "opened" for treasures, "triggered" for hazards
    const actionVerb = (triggeredEncounter.type === ENCOUNTER_TYPES.TREASURE || 
                       triggeredEncounter.type === ENCOUNTER_TYPES.RARE_TREASURE) ? 'opened' : 'triggered';
    
    if (result.message) {
        eventLogs.push(`${config.isHazard ? '⚠️' : '💰'} ${member.displayName} ${actionVerb} ${config.name}! ${result.message}`);
    } else {
        eventLogs.push(`${config.isHazard ? '⚠️' : '💰'} ${member.displayName} ${actionVerb} ${config.name}!`);
    }
    
    return result;
}

/**
 * Legacy function for backward compatibility
 */
async function processHazardTrigger(member, position, mapData, hazardsData, dbEntry, transaction, eventLogs) {
    return processEncounterTrigger(member, position, mapData, hazardsData, dbEntry, transaction, eventLogs);
}

/**
 * Handle Treasure Chest - Give items to player
 */
async function handleTreasureChest(member, position, dbEntry, eventLogs, treasureType, powerLevel = 1, mineTypeId = null) {
    const { findItemUnified, calculateItemQuantity, getItemDestination } = require('./miningConstants_unified');
    const PlayerInventory = require('../../../models/inventory');
    const getPlayerStats = require('../../calculatePlayerStat');
    
    // Determine context and number of items based on treasure type
    const isRare = treasureType === ENCOUNTER_TYPES.RARE_TREASURE;
    const context = isRare ? 'rare_treasure' : 'treasure_chest';
    const config = ENCOUNTER_CONFIG[treasureType];
    const minItems = config.minItems || 1;
    const maxItems = config.maxItems || 3;
    const numItems = Math.floor(Math.random() * (maxItems - minItems + 1)) + minItems;
    
    // Get player stats for luck bonus
    const playerData = await getPlayerStats(member.id);
    const luckStat = playerData.totalStats?.luck || 0;
    const miningPower = playerData.totalStats?.mining || 0;
    
    const itemsFound = [];
    const minecartItems = [];
    const inventoryItems = [];
    let totalValue = 0;
    
    // Generate items
    for (let i = 0; i < numItems; i++) {
        const item = findItemUnified(context, powerLevel, luckStat, isRare, false, mineTypeId);
        const quantity = calculateItemQuantity(item, context, miningPower, luckStat, powerLevel, false);
        const destination = getItemDestination(item, mineTypeId);
        
        const itemInfo = {
            ...item,
            quantity,
            destination
        };
        
        itemsFound.push(itemInfo);
        totalValue += item.value * quantity;
        
        if (destination === 'inventory') {
            inventoryItems.push(itemInfo);
        } else {
            minecartItems.push(itemInfo);
        }
    }
    
    // Add items to player inventory
    if (inventoryItems.length > 0) {
        try {
            let playerInv = await PlayerInventory.findOne({ playerId: member.id });
            if (!playerInv) {
                playerInv = await PlayerInventory.create({
                    playerId: member.id,
                    items: []
                });
            }
            
            for (const itemInfo of inventoryItems) {
                // Check if player already has this item
                const existingItemIndex = playerInv.items.findIndex(
                    invItem => String(invItem.itemId) === String(itemInfo.itemId)
                );
                
                if (existingItemIndex >= 0) {
                    // Add to existing quantity
                    playerInv.items[existingItemIndex].quantity = 
                        (playerInv.items[existingItemIndex].quantity || 1) + itemInfo.quantity;
                } else {
                    // Add new item
                    playerInv.items.push({
                        itemId: String(itemInfo.itemId),
                        quantity: itemInfo.quantity,
                        obtainedAt: new Date()
                    });
                }
            }
            
            await playerInv.save();
        } catch (error) {
            console.error('[TREASURE] Error adding items to inventory:', error);
        }
    }
    
    // Add items to minecart
    if (minecartItems.length > 0 && dbEntry.gameData?.minecart) {
        const minecart = dbEntry.gameData.minecart;
        
        for (const itemInfo of minecartItems) {
            const itemId = String(itemInfo.itemId);
            
            if (!minecart.items[itemId]) {
                minecart.items[itemId] = {
                    quantity: 0,
                    contributors: {},
                    name: itemInfo.name,
                    value: itemInfo.value
                };
            }
            
            minecart.items[itemId].quantity += itemInfo.quantity;
            
            // Track contributor
            if (!minecart.items[itemId].contributors[member.id]) {
                minecart.items[itemId].contributors[member.id] = 0;
            }
            minecart.items[itemId].contributors[member.id] += itemInfo.quantity;
        }
        
        // Mark as modified and save
        dbEntry.markModified('gameData.minecart');
        await dbEntry.save();
    }
    
    // Build message
    let message = `Found ${numItems} item${numItems > 1 ? 's' : ''}! `;
    const itemDescriptions = itemsFound.map(item => 
        `${item.quantity}x ${item.name} (→ ${item.destination})`
    );
    
    if (itemDescriptions.length <= 3) {
        message += itemDescriptions.join(', ');
    } else {
        message += itemDescriptions.slice(0, 2).join(', ') + ` and ${itemDescriptions.length - 2} more`;
    }
    
    message += ` (Total value: ${totalValue})`;
    
    return {
        mapChanged: false,
        playerMoved: false,
        playerDisabled: false,
        message: message,
        treasureFound: true,
        itemsFound: itemsFound
    };
}

/**
 * Handle Portal Trap - Teleport player to random location
 */
async function handlePortalTrap(member, position, mapData, eventLogs) {
    // Find all possible teleport destinations (including walls)
    const possibleTiles = [];
    
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            // Skip current position and entrance
            if ((x === position.x && y === position.y) || 
                (x === mapData.entranceX && y === mapData.entranceY)) {
                continue;
            }
            possibleTiles.push({ x, y });
        }
    }
    
    if (possibleTiles.length === 0) {
        return {
            mapChanged: false,
            playerMoved: false,
            message: "Portal fizzled out!"
        };
    }
    
    // Pick random destination
    const destination = possibleTiles[Math.floor(Math.random() * possibleTiles.length)];
    const destTile = mapData.tiles[destination.y][destination.x];
    
    // Update player position
    position.x = destination.x;
    position.y = destination.y;
    
    let message = `Teleported to (${destination.x}, ${destination.y})`;
    
    // Check if player was teleported into a wall
    if (destTile && (destTile.type === TILE_TYPES.WALL || 
                     destTile.type === TILE_TYPES.REINFORCED_WALL ||
                     destTile.type === TILE_TYPES.WALL_WITH_ORE ||
                     destTile.type === TILE_TYPES.RARE_ORE)) {
        message += " - STUCK IN WALL!";
        position.stuck = true;
    } else {
        position.stuck = false;
    }
    
    return {
        mapChanged: true,
        playerMoved: true,
        message: message
    };
}

/**
 * Handle Bomb Trap - Explode surrounding area
 */
async function handleBombTrap(member, position, mapData, dbEntry, eventLogs) {
    const bombConfig = HAZARD_CONFIG[HAZARD_TYPES.BOMB_TRAP];
    const blastRadius = bombConfig.blastRadius || 2;
    const KNOCKOUT_DURATION = bombConfig.knockoutDuration || (5 * 60 * 1000); // Use config or default to 5 minutes
    let tilesDestroyed = 0;
    
    // Explode tiles in radius
    for (let dy = -blastRadius; dy <= blastRadius; dy++) {
        for (let dx = -blastRadius; dx <= blastRadius; dx++) {
            const targetX = position.x + dx;
            const targetY = position.y + dy;
            
            // Skip if out of bounds
            if (targetX < 0 || targetX >= mapData.width || 
                targetY < 0 || targetY >= mapData.height) {
                continue;
            }
            
            // Calculate distance for circular blast
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > blastRadius) continue;
            
            const tile = mapData.tiles[targetY][targetX];
            if (!tile) continue;
            
            // Don't destroy entrance
            if (tile.type === TILE_TYPES.ENTRANCE) continue;
            
            // Convert all walls to floors (bomb breaks walls)
            if (tile.type === TILE_TYPES.WALL || 
                tile.type === TILE_TYPES.WALL_WITH_ORE || 
                tile.type === TILE_TYPES.RARE_ORE ||
                tile.type === TILE_TYPES.REINFORCED_WALL ||
                tile.type === TILE_TYPES.TREASURE_CHEST) {
                mapData.tiles[targetY][targetX] = {
                    type: TILE_TYPES.FLOOR,
                    discovered: true,
                    hardness: 0
                };
                tilesDestroyed++;
            }
        }
    }
    
    // Mark player as disabled for 5 minutes
    if (!dbEntry.gameData.disabledPlayers) {
        dbEntry.gameData.disabledPlayers = {};
    }
    
    const now = Date.now();
    dbEntry.gameData.disabledPlayers[member.id] = {
        reason: 'bomb_trap',
        timestamp: now,
        enableAt: now + KNOCKOUT_DURATION,
        returnAfterBreak: false
    };
    
    // Move player to entrance (they're knocked out)
    position.x = mapData.entranceX;
    position.y = mapData.entranceY;
    position.disabled = true;
    
    return {
        mapChanged: true,
        playerMoved: true,
        playerDisabled: true,
        message: `BOOM! Destroyed ${tilesDestroyed} ore tiles! ${member.displayName} knocked out for 5 minutes!`
    };
}

/**
 * Handle Green Fog - Damage equipment durability
 */
async function handleGreenFog(member, position, transaction, eventLogs) {
    const durabilityDamage = HAZARD_CONFIG[HAZARD_TYPES.GREEN_FOG].durabilityDamage || 1;
    const PlayerInventory = require('../../../models/inventory');
    const getPlayerStats = require('../../calculatePlayerStat');
    const { parseUniqueItemBonuses, applyDurabilityDamageReduction } = require('./uniqueItemBonuses');
    
    try {
        // Get player's equipped items using the proper system
        const playerData = await getPlayerStats(member.id);
        const equippedItems = playerData.equippedItems;
        
        if (!equippedItems || Object.keys(equippedItems).length === 0) {
            return {
                mapChanged: false,
                playerMoved: false,
                message: "No equipment to damage!"
            };
        }
        
        // Get the player's inventory for updating
        const playerInv = await PlayerInventory.findOne({ playerId: member.id });
        if (!playerInv || !playerInv.items) {
            return {
                mapChanged: false,
                playerMoved: false,
                message: "No inventory found!"
            };
        }
        
        const damagedItems = [];
        const brokenItems = [];
        const itemsToUpdate = [];
        const itemsToRemove = [];
        
        // Parse unique item bonuses for damage reduction
        const uniqueBonuses = parseUniqueItemBonuses(equippedItems);
        const effectiveDamage = applyDurabilityDamageReduction(durabilityDamage, uniqueBonuses.durabilityDamageReduction);
        
        // Process each equipped item
        for (const [itemId, equippedItem] of Object.entries(equippedItems)) {
            // Skip unique items - they don't take durability damage from hazards
            if (equippedItem.isUnique) {
                damagedItems.push(`${equippedItem.name} (Protected by legendary status)`);
                continue;
            }
            
            // Find the item in inventory
            const invItemIndex = playerInv.items.findIndex(item => 
                String(item.itemId) === String(equippedItem.itemId)
            );
            
            if (invItemIndex === -1) continue;
            
            const invItem = playerInv.items[invItemIndex];
            
            // Get current durability
            let currentDurability = invItem.currentDurability;
            if (currentDurability === undefined || currentDurability === null) {
                currentDurability = equippedItem.durability || 100;
            }
            
            // Apply damage (reduced by unique item bonuses)
            const newDurability = Math.max(0, currentDurability - effectiveDamage);
            
            if (newDurability <= 0) {
                // Item breaks
                brokenItems.push(equippedItem.name || 'Unknown Item');
                
                // Check if item has quantity > 1
                if (invItem.quantity && invItem.quantity > 1) {
                    // Reduce quantity and reset durability
                    itemsToUpdate.push({
                        index: invItemIndex,
                        updates: {
                            quantity: invItem.quantity - 1,
                            currentDurability: equippedItem.durability || 100
                        }
                    });
                } else {
                    // Remove item completely
                    itemsToRemove.push(invItemIndex);
                }
            } else {
                // Just damage the item
                damagedItems.push(equippedItem.name || 'Unknown Item');
                itemsToUpdate.push({
                    index: invItemIndex,
                    updates: {
                        currentDurability: newDurability
                    }
                });
            }
        }
        
        // Apply updates to inventory
        if (itemsToUpdate.length > 0 || itemsToRemove.length > 0) {
            // Update items
            for (const update of itemsToUpdate) {
                Object.assign(playerInv.items[update.index], update.updates);
            }
            
            // Remove items (process in reverse order to maintain indices)
            itemsToRemove.sort((a, b) => b - a);
            for (const index of itemsToRemove) {
                playerInv.items.splice(index, 1);
            }
            
            // Save the inventory
            await playerInv.save();
        }
        
        let message = "Toxic fog corrodes equipment!";
        if (damagedItems.length > 0) {
            message += ` Damaged: ${damagedItems.join(', ')}`;
        }
        if (brokenItems.length > 0) {
            message += ` DESTROYED: ${brokenItems.join(', ')}!`;
        }
        
        return {
            mapChanged: false,
            playerMoved: false,
            message: message
        };
        
    } catch (error) {
        console.error('Error handling green fog:', error);
        return {
            mapChanged: false,
            playerMoved: false,
            message: "Toxic fog swirls around you!"
        };
    }
}

/**
 * Handle Wall Trap - Convert surrounding floors to walls
 */
async function handleWallTrap(member, position, mapData, eventLogs) {
    let tilesConverted = 0;
    const adjacentPositions = [
        { x: position.x - 1, y: position.y },
        { x: position.x + 1, y: position.y },
        { x: position.x, y: position.y - 1 },
        { x: position.x, y: position.y + 1 },
        { x: position.x - 1, y: position.y - 1 },
        { x: position.x + 1, y: position.y - 1 },
        { x: position.x - 1, y: position.y + 1 },
        { x: position.x + 1, y: position.y + 1 }
    ];
    
    for (const adj of adjacentPositions) {
        // Skip if out of bounds
        if (adj.x < 0 || adj.x >= mapData.width || 
            adj.y < 0 || adj.y >= mapData.height) {
            continue;
        }
        
        const tile = mapData.tiles[adj.y][adj.x];
        if (!tile) continue;
        
        // Only convert floor tiles (not entrance, walls, or ores)
        if (tile.type === TILE_TYPES.FLOOR) {
            mapData.tiles[adj.y][adj.x] = {
                type: TILE_TYPES.WALL,
                discovered: true,
                hardness: 1
            };
            tilesConverted++;
        }
    }
    
    let message = `Walls spring up! ${tilesConverted} tiles blocked!`;
    
    // Check if player is now trapped
    let escapePossible = false;
    for (const adj of adjacentPositions) {
        if (adj.x < 0 || adj.x >= mapData.width || 
            adj.y < 0 || adj.y >= mapData.height) {
            continue;
        }
        
        const tile = mapData.tiles[adj.y][adj.x];
        if (tile && (tile.type === TILE_TYPES.FLOOR || tile.type === TILE_TYPES.ENTRANCE)) {
            escapePossible = true;
            break;
        }
    }
    
    if (!escapePossible) {
        message += " TRAPPED!";
        position.trapped = true;
    }
    
    return {
        mapChanged: true,
        playerMoved: false,
        message: message
    };
}

/**
 * Handle Fire Blast - Burns items in minecart
 */
async function handleFireBlast(member, position, dbEntry, eventLogs) {
    const config = HAZARD_CONFIG[HAZARD_TYPES.FIRE_BLAST];
    const powerLevel = dbEntry.gameData?.powerLevel || 1;
    
    // Import item pools to look up item information
    const { miningItemPool, treasureItems, UNIFIED_ITEM_POOL } = require('./miningConstants_unified');
    
    // Calculate burn percentage based on power level
    const burnPercentageBase = config.burnPercentageBase || 10;
    const burnPercentagePerLevel = config.burnPercentagePerLevel || 5;
    const burnPercentage = Math.min(50, burnPercentageBase + (burnPercentagePerLevel * (powerLevel - 1))); // Cap at 50%
    
    // Get minecart contents
    const minecart = dbEntry.gameData?.minecart;
    if (!minecart || !minecart.items || Object.keys(minecart.items).length === 0) {
        return {
            mapChanged: false,
            playerMoved: false,
            message: "No items to burn!"
        };
    }
    
    let totalValueBurned = 0;
    let itemsBurned = [];
    const itemsToReduce = {};
    
    // Helper function to find item data
    function findItemData(itemId) {
        // Check mining item pool first
        let found = miningItemPool.find(item => item.itemId === String(itemId));
        if (found) return found;
        
        // Check treasure items
        found = treasureItems.find(item => item.itemId === String(itemId));
        if (found) return found;
        
        // Check unified item pool
        if (UNIFIED_ITEM_POOL) {
            // Check ores
            if (UNIFIED_ITEM_POOL.ores) {
                found = UNIFIED_ITEM_POOL.ores.find(item => item.itemId === String(itemId));
                if (found) return found;
            }
            // Check equipment
            if (UNIFIED_ITEM_POOL.equipment) {
                found = UNIFIED_ITEM_POOL.equipment.find(item => item.itemId === String(itemId));
                if (found) return found;
            }
            // Check consumables
            if (UNIFIED_ITEM_POOL.consumables) {
                found = UNIFIED_ITEM_POOL.consumables.find(item => item.itemId === String(itemId));
                if (found) return found;
            }
            // Check treasures
            if (UNIFIED_ITEM_POOL.treasures) {
                found = UNIFIED_ITEM_POOL.treasures.find(item => item.itemId === String(itemId));
                if (found) return found;
            }
        }
        
        // Fallback to itemSheet.json
        try {
            const itemSheet = require('../../../data/itemSheet.json');
            found = itemSheet.find(item => String(item.id) === String(itemId));
            if (found) {
                return {
                    itemId: found.id,
                    name: found.name,
                    value: found.value || 1
                };
            }
        } catch (error) {
            console.error('[FIRE BLAST] Error loading itemSheet.json:', error);
        }
        
        return null;
    }
    
    // Process each item in minecart
    for (const [itemId, itemData] of Object.entries(minecart.items)) {
        if (itemData.quantity > 0) {
            // Calculate how many to burn
            const toBurn = Math.ceil(itemData.quantity * (burnPercentage / 100));
            const actualBurn = Math.min(toBurn, itemData.quantity);
            
            if (actualBurn > 0) {
                // Look up item information if not stored
                const itemInfo = findItemData(itemId);
                const itemName = itemData.name || itemInfo?.name || `Item #${itemId}`;
                const itemValue = itemData.value || itemInfo?.value || 1;
                
                totalValueBurned += actualBurn * itemValue;
                
                // Track what was burned
                itemsBurned.push(`${actualBurn}x ${itemName}`);
                
                // Store the reduction
                itemsToReduce[itemId] = actualBurn;
            }
        }
    }
    
    // Apply the burns to minecart
    if (Object.keys(itemsToReduce).length > 0) {
        for (const [itemId, burnAmount] of Object.entries(itemsToReduce)) {
            const currentQuantity = minecart.items[itemId].quantity;
            const newQuantity = currentQuantity - burnAmount;
            
            if (newQuantity <= 0) {
                // Remove item completely
                delete minecart.items[itemId];
            } else {
                // Reduce quantity
                minecart.items[itemId].quantity = newQuantity;
            }
        }
        
        // Update contributors to reflect the loss
        if (minecart.contributors) {
            const contributorIds = Object.keys(minecart.contributors);
            const lossPerContributor = Math.floor(totalValueBurned / contributorIds.length);
            
            for (const contributorId of contributorIds) {
                const currentValue = minecart.contributors[contributorId] || 0;
                minecart.contributors[contributorId] = Math.max(0, currentValue - lossPerContributor);
            }
        }
        
        // Mark as modified and save
        dbEntry.markModified('gameData.minecart');
        await dbEntry.save();
    }
    
    let message = `🔥 BURNED ${burnPercentage}% of minecart!`;
    if (itemsBurned.length > 0) {
        const burnedList = itemsBurned.slice(0, 3).join(', ');
        const moreCount = itemsBurned.length > 3 ? ` and ${itemsBurned.length - 3} more` : '';
        message += ` Lost: ${burnedList}${moreCount} (${totalValueBurned} value)`;
    } else {
        message = "Fire blast fizzled - no damage!";
    }
    
    return {
        mapChanged: false,
        playerMoved: false,
        message: message
    };
}

/**
 * Check if player is stuck (trapped in wall or by walls)
 */
function isPlayerStuck(position, mapData) {
    if (position.stuck) return true;
    if (position.trapped) return true;
    
    // Check if player is in a wall
    const tile = mapData.tiles[position.y] && mapData.tiles[position.y][position.x];
    if (tile && (tile.type === TILE_TYPES.WALL || 
                 tile.type === TILE_TYPES.REINFORCED_WALL ||
                 tile.type === TILE_TYPES.WALL_WITH_ORE)) {
        return true;
    }
    
    return false;
}

/**
 * Check if player is currently stuck in a wall and update status
 * @param {Object} position - Player position object
 * @param {Object} mapData - Map data
 * @param {Object} member - Discord member
 * @returns {Object} Status update result
 */
function updateStuckStatus(position, mapData, member) {
    const tile = mapData.tiles[position.y] && mapData.tiles[position.y][position.x];
    
    if (!tile) {
        position.stuck = false;
        return { wasStuck: false, isStuck: false, message: null };
    }
    
    const wasStuck = position.stuck || false;
    
    // Check if player is currently in a wall
    const isInWall = tile.type === TILE_TYPES.WALL || 
                     tile.type === TILE_TYPES.REINFORCED_WALL ||
                     tile.type === TILE_TYPES.WALL_WITH_ORE ||
                     tile.type === TILE_TYPES.RARE_ORE;
    
    position.stuck = isInWall;
    
    // Generate status message if state changed
    let message = null;
    if (wasStuck && !isInWall) {
        message = `✅ ${member.displayName} is no longer stuck in a wall!`;
    } else if (!wasStuck && isInWall) {
        message = `⚠️ ${member.displayName} is stuck in a wall! They can still move and mine to escape!`;
    }
    
    return { wasStuck, isStuck: isInWall, message };
}

/**
 * Check if player is disabled (knocked out from bomb)
 */
function isPlayerDisabled(memberId, dbEntry) {
    if (!dbEntry.gameData.disabledPlayers) return false;
    const disabledInfo = dbEntry.gameData.disabledPlayers[memberId];
    
    if (!disabledInfo) return false;
    
    const now = Date.now();
    
    // Check if the disable period has expired
    if (disabledInfo.enableAt && now >= disabledInfo.enableAt) {
        // Player can be re-enabled, remove their disabled status
        delete dbEntry.gameData.disabledPlayers[memberId];
        return false;
    }
    
    // Player is still disabled
    return true;
}

/**
 * Re-enable players after break or when their timeout expires
 */
function enablePlayersAfterBreak(dbEntry) {
    if (dbEntry.gameData.disabledPlayers) {
        const now = Date.now();
        for (const playerId in dbEntry.gameData.disabledPlayers) {
            const info = dbEntry.gameData.disabledPlayers[playerId];
            // Remove if marked for break-based return or if timeout expired
            if (info.returnAfterBreak || (info.enableAt && now >= info.enableAt)) {
                delete dbEntry.gameData.disabledPlayers[playerId];
            }
        }
    }
}

/**
 * Clean up expired disabled statuses
 */
function cleanupExpiredDisables(dbEntry) {
    if (!dbEntry.gameData.disabledPlayers) return false;
    
    const now = Date.now();
    let anyRemoved = false;
    
    for (const playerId in dbEntry.gameData.disabledPlayers) {
        const info = dbEntry.gameData.disabledPlayers[playerId];
        if (info.enableAt && now >= info.enableAt) {
            delete dbEntry.gameData.disabledPlayers[playerId];
            anyRemoved = true;
        }
    }
    
    return anyRemoved;
}

module.exports = {
    processHazardTrigger,
    processEncounterTrigger,
    handleTreasureChest,
    handlePortalTrap,
    handleBombTrap,
    handleGreenFog,
    handleWallTrap,
    handleFireBlast,
    isPlayerStuck,
    isPlayerDisabled,
    enablePlayersAfterBreak,
    cleanupExpiredDisables,
    updateStuckStatus,
    ENCOUNTER_CONFIG  // Export for treasure handling
};

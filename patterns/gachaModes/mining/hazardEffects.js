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
        // Handle hazards - now with immunity checks
        const isImmune = await checkHazardImmunity(member, triggeredEncounter.type);
        
        if (isImmune) {
            const config = ENCOUNTER_CONFIG[triggeredEncounter.type] || HAZARD_CONFIG[triggeredEncounter.type];
            eventLogs.push(`✨ ${member.displayName} is immune to ${config.name || triggeredEncounter.type}!`);
            return {
                mapChanged: false,
                playerMoved: false,
                playerDisabled: false,
                message: `You are immune to this hazard!`,
                treasureFound: false,
                itemsFound: []
            };
        }
        
        switch (triggeredEncounter.type) {
            case HAZARD_TYPES.PORTAL_TRAP:
                result = await handlePortalTrap(member, position, mapData, eventLogs, powerLevel, dbEntry);
                break;
                
            case HAZARD_TYPES.BOMB_TRAP:
                result = await handleBombTrap(member, position, mapData, dbEntry, eventLogs, powerLevel);
                break;
                
            case HAZARD_TYPES.GREEN_FOG:
                result = await handleGreenFog(member, position, transaction, eventLogs, dbEntry, powerLevel);
                break;
                
            case HAZARD_TYPES.WALL_TRAP:
                result = await handleWallTrap(member, position, mapData, eventLogs, dbEntry, powerLevel);
                break;
                
            case HAZARD_TYPES.FIRE_BLAST:
                result = await handleFireBlast(member, position, dbEntry, eventLogs, powerLevel);
                break;
                
            case HAZARD_TYPES.LIGHTNING_STRIKE:
                result = await handleLightningStrike(member, position, dbEntry, eventLogs, powerLevel);
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
async function processHazardTrigger(member, position, mapData, hazardsData, dbEntry, transaction, eventLogs, powerLevel = 1, mineTypeId = null) {
    return processEncounterTrigger(member, position, mapData, hazardsData, dbEntry, transaction, eventLogs, powerLevel, mineTypeId);
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
        
        // Update database directly (dbEntry is a lean document)
        const gachaVC = require('../../../models/activevcs');
        await gachaVC.updateOne(
            { channelId: dbEntry.channelId },
            { $set: { 'gameData.minecart': minecart } }
        );
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
async function handlePortalTrap(member, position, mapData, eventLogs, powerLevel = 1, dbEntry = null) {
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
        
        // Apply crushing damage when stuck in wall
        const baseCrushingDamage = 10; // Portal trap crushing damage
        const crushingDamage = Math.ceil(baseCrushingDamage * (1 + ((powerLevel - 1) * 0.25)));
        
        if (dbEntry) {
            const healthResult = await applyHazardDamageWithContext(member.id, crushingDamage, 'portal_trap', powerLevel, dbEntry);
            
            if (healthResult.success) {
                message += ` - STUCK IN WALL! (-${crushingDamage} health: ${healthResult.newHealth}/${healthResult.maxHealth})`;
                
                // Check for death
                if (healthResult.newHealth <= 0) {
                    return await handlePlayerDeath(member, position, mapData, eventLogs, 'portal_trap', dbEntry);
                }
            } else {
                message += " - STUCK IN WALL! (health system error)";
            }
        } else {
            message += " - STUCK IN WALL!";
        }
        
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
async function handleBombTrap(member, position, mapData, dbEntry, eventLogs, powerLevel = 1) {
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
    
    // Apply health damage from explosion (scaled with power level)
    const baseExplosionDamage = 25;
    const explosionDamage = Math.ceil(baseExplosionDamage * (1 + ((powerLevel - 1) * 0.25)));
    const healthResult = await applyHazardDamageWithContext(member.id, explosionDamage, 'bomb_trap', powerLevel, dbEntry);
    
    let message = `BOOM! Destroyed ${tilesDestroyed} ore tiles!`;
    if (healthResult.success) {
        message += ` (-${explosionDamage} health: ${healthResult.newHealth}/${healthResult.maxHealth})`;
        
        // Check if explosion killed the player
        if (healthResult.newHealth <= 0) {
            return await handlePlayerDeath(member, position, mapData, eventLogs, 'bomb_trap', dbEntry);
        }
    }
    
    eventLogs.push(`💥 ${member.displayName} was caught in an explosion! ${message}`);
    
    // Player survives but continues mining (no more 5-minute knockout)
    return {
        mapChanged: true,
        playerMoved: false, // Don't move player unless they die
        playerDisabled: false, // Player can continue mining
        message: message
    };
}

/**
 * Handle Green Fog - Damage equipment durability
 */
async function handleGreenFog(member, position, transaction, eventLogs, dbEntry, powerLevel = 1) {
    // Scale damage with power level (25% increase per level)
    const baseDurabilityDamage = HAZARD_CONFIG[HAZARD_TYPES.GREEN_FOG].durabilityDamage || 1;
    const durabilityDamage = Math.ceil(baseDurabilityDamage * (1 + ((powerLevel - 1) * 0.25)));
    
    const baseToxicDamage = 8;
    const toxicDamage = Math.ceil(baseToxicDamage * (1 + ((powerLevel - 1) * 0.25)));
    const PlayerInventory = require('../../../models/inventory');
    const getPlayerStats = require('../../calculatePlayerStat');
    const { parseUniqueItemBonuses, applyDurabilityDamageReduction } = require('./uniqueItemBonuses');
    
    try {
        // Apply health damage from toxic fog
        const healthResult = await applyHazardDamageWithContext(member.id, toxicDamage, 'green_fog', powerLevel, dbEntry);
        
        let healthMessage = '';
        if (healthResult.success) {
            healthMessage = ` (-${toxicDamage} health: ${healthResult.newHealth}/${healthResult.maxHealth})`;
            
            // Check for death
            if (healthResult.newHealth <= 0) {
                return await handlePlayerDeath(member, position, mapData, eventLogs, 'green_fog', dbEntry);
            }
        }
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
            playerDisabled: false, // Player can continue mining
            message: `Toxic fog swirls around you!${healthMessage}`
        };
    }
}

/**
 * Handle Wall Trap - Convert surrounding floors to walls
 */
async function handleWallTrap(member, position, mapData, eventLogs, dbEntry, powerLevel = 1) {
    // Scale crushing damage with power level
    const baseCrushingDamage = 12;
    const crushingDamage = Math.ceil(baseCrushingDamage * (1 + ((powerLevel - 1) * 0.25)));
    let tilesConverted = 0;
    
    // Apply health damage from being trapped
    console.log(`[WALL TRAP] Applying ${crushingDamage} damage to player ${member.id} (power level ${powerLevel})`);
    const healthResult = await applyHazardDamageWithContext(member.id, crushingDamage, 'wall_trap', powerLevel, dbEntry);
    console.log(`[WALL TRAP] Health result:`, healthResult);
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
            // Import getTileHardness to calculate power-scaled hardness
            const { getTileHardness } = require('./miningMap');
            const scaledHardness = getTileHardness(TILE_TYPES.REINFORCED_WALL, powerLevel);
            
            mapData.tiles[adj.y][adj.x] = {
                type: TILE_TYPES.REINFORCED_WALL,
                discovered: true,
                hardness: scaledHardness
            };
            tilesConverted++;
        }
    }
    
    let message = `Reinforced walls spring up! ${tilesConverted} tiles blocked!`;
    
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
    
    // Add health damage message
    console.log(`[WALL TRAP] Health result success: ${healthResult.success}, damage: ${crushingDamage}`);
    if (healthResult.success) {
        message += ` (-${crushingDamage} health: ${healthResult.newHealth}/${healthResult.maxHealth})`;
        
        // Check for death
        if (healthResult.newHealth <= 0) {
            return await handlePlayerDeath(member, position, mapData, eventLogs, 'wall_trap', dbEntry);
        }
    } else {
        console.log(`[WALL TRAP] Health damage failed for player ${member.id}`);
        message += ` (health system error)`;
    }
    
    // Don't add message to eventLogs here - processEncounterTrigger will handle it
    // eventLogs.push(`🧱 ${member.displayName} ${message}`);
    
    return {
        mapChanged: true,
        playerMoved: false,
        message: message
    };
}

/**
 * Handle Fire Blast - Burns items in minecart
 */
async function handleFireBlast(member, position, dbEntry, eventLogs, powerLevel = 1) {
    const config = HAZARD_CONFIG[HAZARD_TYPES.FIRE_BLAST];
    
    // Apply fire damage to player
    const baseFireDamage = 6; // Fire blast deals fire damage
    const fireDamage = Math.ceil(baseFireDamage * (1 + ((powerLevel - 1) * 0.25)));
    
    const healthResult = await applyHazardDamageWithContext(member.id, fireDamage, 'fire_blast', powerLevel, dbEntry);
    
    let healthMessage = '';
    if (healthResult.success) {
        healthMessage = ` (-${fireDamage} health: ${healthResult.newHealth}/${healthResult.maxHealth})`;
        
        // Check for death
        if (healthResult.newHealth <= 0) {
            return await handlePlayerDeath(member, position, mapData, eventLogs, 'fire_blast', dbEntry);
        }
    } else {
        healthMessage = ' (health system error)';
    }
    
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
        
        // Update database directly (dbEntry is a lean document)
        const gachaVC = require('../../../models/activevcs');
        await gachaVC.updateOne(
            { channelId: dbEntry.channelId },
            { $set: { 'gameData.minecart': minecart } }
        );
    }
    
    let message = `🔥 BURNED ${burnPercentage}% of minecart!`;
    if (itemsBurned.length > 0) {
        const burnedList = itemsBurned.slice(0, 3).join(', ');
        const moreCount = itemsBurned.length > 3 ? ` and ${itemsBurned.length - 3} more` : '';
        message += ` Lost: ${burnedList}${moreCount} (${totalValueBurned} value)`;
    } else {
        message = "Fire blast fizzled - no items burned!";
    }
    
    // Add health damage to message
    message += healthMessage;
    
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

/**
 * Apply health damage from hazards with context (more reliable)
 */
async function applyHazardDamageWithContext(playerId, baseDamageAmount, source, powerLevel = 1, dbEntry = null) {
    try {
        // Add RNG to damage (±25% variation)
        const damageVariation = 0.25;
        const minDamage = Math.floor(baseDamageAmount * (1 - damageVariation));
        const maxDamage = Math.floor(baseDamageAmount * (1 + damageVariation));
        let actualDamage = Math.floor(Math.random() * (maxDamage - minDamage + 1)) + minDamage;
        
        // Apply armor damage reduction and durability
        let armorUsed = false;
        try {
            const calculatePlayerStat = require('../../calculatePlayerStat');
            
            const playerStats = await calculatePlayerStat(playerId);
            if (playerStats && playerStats.totalArmorPoints > 0) {
                // Calculate damage reduction from armor points
                const totalArmorReduction = calculatePlayerStat.calculateDamageReduction(playerStats.totalArmorPoints);
                
                if (totalArmorReduction > 0) {
                    const originalDamage = actualDamage;
                    const reduction = Math.floor(actualDamage * totalArmorReduction);
                    actualDamage = Math.max(1, actualDamage - reduction); // Minimum 1 damage
                    armorUsed = true;
                    
                    console.log(`[HEALTH] Armor reduced damage from ${originalDamage} to ${actualDamage} (${Math.round(totalArmorReduction * 100)}% reduction from ${playerStats.totalArmorPoints} armor points)`);
                    
                    // Damage the armor durability
                    if (playerStats.bestArmor) {
                        await damageArmorDurability(playerId, playerStats.bestArmor, source, powerLevel);
                    }
                }
            }
        } catch (armorError) {
            console.error('[HEALTH] Error calculating armor reduction:', armorError);
        }
        
        // Use separate health schema to avoid database conflicts
        const PlayerHealth = require('../../../models/PlayerHealth');
        const channelId = dbEntry?.channelId;
        const guildId = dbEntry?.guildId || (dbEntry?.guild?.id) || 'unknown';
        
        if (!channelId) {
            console.error('[HEALTH] No channelId available for health update');
            return { success: false, newHealth: 100, maxHealth: 100, actualDamage: 0 };
        }
        
        // Update health using separate schema
        const healthResult = await PlayerHealth.updatePlayerHealth(playerId, channelId, guildId, -actualDamage, source);
        
        if (healthResult.success) {
            console.log(`[HEALTH] Successfully updated health in separate schema`);
            
            return {
                success: true,
                newHealth: healthResult.newHealth,
                maxHealth: healthResult.maxHealth,
                actualDamage: actualDamage,
                baseDamage: baseDamageAmount,
                armorUsed: armorUsed,
                isDead: healthResult.isDead
            };
        } else {
            console.error('[HEALTH] Failed to update health in separate schema');
            return { success: false, newHealth: 100, maxHealth: 100, actualDamage: 0 };
        }
        
    } catch (error) {
        console.error(`[HEALTH] Error applying hazard damage with context:`, error);
        return { success: false, newHealth: 100, maxHealth: 100, actualDamage: 0 };
    }
}

/**
 * Apply health damage from hazards with RNG and armor reduction (legacy)
 */
async function applyHazardDamage(playerId, baseDamageAmount, source, powerLevel = 1) {
    try {
        // Add RNG to damage (±25% variation)
        const damageVariation = 0.25;
        const minDamage = Math.floor(baseDamageAmount * (1 - damageVariation));
        const maxDamage = Math.floor(baseDamageAmount * (1 + damageVariation));
        let actualDamage = Math.floor(Math.random() * (maxDamage - minDamage + 1)) + minDamage;
        
        // Apply armor damage reduction and durability
        let armorUsed = false;
        try {
            const calculatePlayerStat = require('../../calculatePlayerStat');
            
            const playerStats = await calculatePlayerStat(playerId);
            if (playerStats && playerStats.totalArmorPoints > 0) {
                // Calculate damage reduction from armor points
                const totalArmorReduction = calculatePlayerStat.calculateDamageReduction(playerStats.totalArmorPoints);
                
                if (totalArmorReduction > 0) {
                    const originalDamage = actualDamage;
                    const reduction = Math.floor(actualDamage * totalArmorReduction);
                    actualDamage = Math.max(1, actualDamage - reduction); // Minimum 1 damage
                    armorUsed = true;
                    
                    console.log(`[HEALTH] Armor reduced damage from ${originalDamage} to ${actualDamage} (${Math.round(totalArmorReduction * 100)}% reduction from ${playerStats.totalArmorPoints} armor points)`);
                    
                    // Damage the armor durability
                    if (playerStats.bestArmor) {
                        await damageArmorDurability(playerId, playerStats.bestArmor, source, powerLevel);
                    }
                }
            }
        } catch (armorError) {
            console.error('[HEALTH] Error calculating armor reduction:', armorError);
        }
        
        const { updatePlayerHealth } = require('./healthSystem');
        const result = await updatePlayerHealth(playerId, -actualDamage, source);
        
        // Add the actual damage dealt to the result
        if (result.success) {
            result.actualDamage = actualDamage;
            result.baseDamage = baseDamageAmount;
        }
        
        return result;
    } catch (error) {
        console.error(`[HEALTH] Error applying hazard damage:`, error);
        return { success: false, newHealth: 100, maxHealth: 100, actualDamage: 0 };
    }
}

/**
 * Damage armor durability when it protects from hazards
 */
async function damageArmorDurability(playerId, armorData, source, powerLevel = 1) {
    try {
        const PlayerInventory = require('../../../models/inventory');
        const durabilityDamage = getDurabilityDamageBySource(source, powerLevel);
        
        // Get current armor durability
        const currentDurability = armorData.currentDurability || armorData.itemData.durability || 100;
        const newDurability = Math.max(0, currentDurability - durabilityDamage);
        
        console.log(`[ARMOR] ${armorData.itemData.name} durability: ${currentDurability} -> ${newDurability} (-${durabilityDamage} from ${source})`);
        
        // Update armor durability in inventory
        const updateResult = await PlayerInventory.findOneAndUpdate(
            { 
                playerId: playerId,
                'items.itemId': armorData.itemId
            },
            {
                $set: { 'items.$.currentDurability': newDurability }
            },
            { new: true }
        );
        
        if (newDurability <= 0) {
            // Armor broke
            console.log(`[ARMOR] ${armorData.itemData.name} broke for player ${playerId}`);
            
            // Handle armor breaking (reduce quantity or remove)
            await handleArmorBreak(playerId, armorData);
            
            return {
                broke: true,
                newDurability: 0,
                armorName: armorData.itemData.name
            };
        }
        
        return {
            broke: false,
            newDurability: newDurability,
            armorName: armorData.itemData.name
        };
        
    } catch (error) {
        console.error('[ARMOR] Error damaging armor durability:', error);
        return { broke: false, newDurability: 100, armorName: 'Unknown' };
    }
}

/**
 * Get durability damage amount based on hazard source and power level
 */
function getDurabilityDamageBySource(source, powerLevel = 1) {
    const baseDamageMap = {
        'bomb_trap': 15,      // Explosions damage armor heavily
        'lightning_strike': 10, // Electric damage
        'fire_blast': 12,     // Fire damage
        'green_fog': 8,       // Acid damage
        'wall_trap': 6,       // Crushing damage
        'portal_trap': 4      // Dimensional stress
    };
    
    const baseDamage = baseDamageMap[source] || 5; // Default damage
    
    // Scale damage with power level (25% increase per level)
    const scaledDamage = Math.ceil(baseDamage * (1 + ((powerLevel - 1) * 0.25)));
    
    return scaledDamage;
}

/**
 * Handle armor breaking
 */
async function handleArmorBreak(playerId, armorData) {
    try {
        const PlayerInventory = require('../../../models/inventory');
        
        if (armorData.quantity > 1) {
            // Reduce quantity by 1 and reset durability for remaining items
            await PlayerInventory.findOneAndUpdate(
                { 
                    playerId: playerId,
                    'items.itemId': armorData.itemId
                },
                {
                    $inc: { 'items.$.quantity': -1 },
                    $set: { 'items.$.currentDurability': armorData.itemData.durability || 100 }
                }
            );
            
            console.log(`[ARMOR] Reduced ${armorData.itemData.name} quantity, ${armorData.quantity - 1} remaining`);
        } else {
            // Remove the item completely
            await PlayerInventory.findOneAndUpdate(
                { playerId: playerId },
                { $pull: { items: { itemId: armorData.itemId } } }
            );
            
            console.log(`[ARMOR] Removed broken ${armorData.itemData.name} from inventory`);
        }
        
        return true;
        
    } catch (error) {
        console.error('[ARMOR] Error handling armor break:', error);
        return false;
    }
}

/**
 * Handle player death - move to entrance, make invisible, disable until next break
 */
async function handlePlayerDeath(member, position, mapData, eventLogs, source, dbEntry) {
    try {
        // Move player to entrance
        position.x = mapData.entranceX || 0;
        position.y = mapData.entranceY || 0;
        position.disabled = true;
        position.dead = true;
        position.invisible = true; // Make invisible when dead
        
        // Death is already handled by PlayerHealth schema in applyHazardDamageWithContext
        // No need to track in gameData.deadPlayers anymore
        
        // Check for auto-revive from Phoenix Feather Charm
        try {
            const { checkAutoRevive } = require('./healthSystem');
            const reviveResult = await checkAutoRevive(member.id, source);
            
            if (reviveResult.revived) {
                // Phoenix Feather auto-revive successful
                position.disabled = false;
                position.dead = false;
                position.invisible = false;
                delete dbEntry.gameData.deadPlayers[member.id];
                
                eventLogs.push(`🔥 ${member.displayName} was revived by Phoenix Feather Charm! (${reviveResult.newHealth}/${reviveResult.maxHealth} health)`);
                
                return {
                    mapChanged: true,
                    playerMoved: true,
                    playerDisabled: false,
                    message: `You were revived by your Phoenix Feather Charm!`,
                    autoRevived: true
                };
            }
        } catch (reviveError) {
            console.error('[DEATH] Error checking auto-revive:', reviveError);
        }
        
        eventLogs.push(`💀 ${member.displayName} died and will be revived at the next break!`);
        
        return {
            mapChanged: true,
            playerMoved: true,
            playerDisabled: true,
            playerDied: true,
            message: `You died! You will be revived at the entrance when the next break starts.`
        };
        
    } catch (error) {
        console.error('[DEATH] Error handling player death:', error);
        return {
            mapChanged: false,
            playerMoved: false,
            playerDisabled: true,
            message: 'You were severely injured!',
            playerDied: false
        };
    }
}

/**
 * Revive all dead players at break start
 */
async function reviveDeadPlayers(dbEntry, eventLogs) {
    try {
        const PlayerHealth = require('../../../models/PlayerHealth');
        const channelId = dbEntry.channelId;
        
        // Find all dead players in this channel
        const deadPlayers = await PlayerHealth.find({ 
            channelId: channelId, 
            isDead: true 
        });
        
        let revivedCount = 0;
        
        for (const playerHealth of deadPlayers) {
            // Revive player
            const revived = await PlayerHealth.revivePlayer(playerHealth.playerId, channelId, 100); // Full health on break revival
            
            if (revived) {
                // Reset player position
                const position = dbEntry.gameData?.map?.playerPositions?.[playerHealth.playerId];
                if (position) {
                    position.disabled = false;
                    position.dead = false;
                    position.invisible = false;
                    position.x = dbEntry.gameData.map.entranceX || 0;
                    position.y = dbEntry.gameData.map.entranceY || 0;
                }
                
                revivedCount++;
                console.log(`[REVIVAL] Revived player ${playerHealth.playerId} at break`);
            }
        }
        
        if (revivedCount > 0) {
            eventLogs.push(`✨ ${revivedCount} player(s) were revived at the break!`);
        }
        
        return revivedCount;
        
    } catch (error) {
        console.error('[REVIVAL] Error reviving dead players:', error);
        return 0;
    }
}

/**
 * Handle lightning strike hazard - stuns player for several mining actions
 */
async function handleLightningStrike(member, position, dbEntry, eventLogs, powerLevel = 1) {
    const config = HAZARD_CONFIG[HAZARD_TYPES.LIGHTNING_STRIKE];
    const stunDuration = config.stunDuration || 3; // Default 3 actions
    const stunChance = config.stunChance || 0.8; // Default 80% chance
    const baseDamageAmount = config.damageAmount || 15; // Default 15 health damage
    const damageAmount = Math.ceil(baseDamageAmount * (1 + ((powerLevel - 1) * 0.25))); // Scale with power level
    
    let result = {
        mapChanged: false,
        playerMoved: false,
        playerDisabled: false,
        message: null,
        treasureFound: false,
        itemsFound: []
    };
    
    try {
        // Check if player is stunned
        if (Math.random() < stunChance) {
            // Apply stun effect
            if (!dbEntry.gameData.stunned) {
                dbEntry.gameData.stunned = {};
            }
            
            const stunEndTime = Date.now() + (stunDuration * 15000); // 15 seconds per action
            dbEntry.gameData.stunned[member.id] = {
                startTime: Date.now(),
                endTime: stunEndTime,
                actionsRemaining: stunDuration,
                source: 'lightning_strike'
            };
            
            // Apply health damage
            const healthResult = await applyHazardDamageWithContext(member.id, damageAmount, 'lightning_strike', powerLevel, dbEntry);
            
            if (healthResult.success) {
                eventLogs.push(`⚡ ${member.displayName} was struck by lightning and stunned for ${stunDuration} actions! (-${damageAmount} health: ${healthResult.newHealth}/${healthResult.maxHealth})`);
                
                // Check for death
                if (healthResult.newHealth <= 0) {
                    return await handlePlayerDeath(member, position, mapData, eventLogs, 'lightning_strike', dbEntry);
                }
            } else {
                eventLogs.push(`⚡ ${member.displayName} was struck by lightning and stunned for ${stunDuration} actions!`);
            }
            
            result.playerDisabled = true;
            result.message = `You were struck by lightning and are stunned for ${stunDuration} mining actions! (-${damageAmount} health: ${healthResult.newHealth}/${healthResult.maxHealth})`;
            
            // Update database with stun effect
            const gachaVC = require('../../../models/activevcs');
            await gachaVC.updateOne(
                { channelId: dbEntry.channelId },
                { $set: { 'gameData.stunned': dbEntry.gameData.stunned } }
            );
            
        } else {
            // Lightning missed
            eventLogs.push(`⚡ Lightning crackled near ${member.displayName} but missed!`);
            result.message = 'Lightning crackled dangerously close to you, but you managed to avoid the worst of it!';
        }
        
    } catch (error) {
        console.error('[LIGHTNING] Error handling lightning strike:', error);
        eventLogs.push(`⚡ ${member.displayName} encountered a lightning hazard!`);
        result.message = 'You encountered a lightning hazard!';
    }
    
    return result;
}

/**
 * Check if player is currently stunned by lightning
 */
function isPlayerStunned(dbEntry, playerId) {
    const stunData = dbEntry.gameData?.stunned?.[playerId];
    if (!stunData) return false;
    
    const now = Date.now();
    
    // Check if stun has expired
    if (now > stunData.endTime || stunData.actionsRemaining <= 0) {
        // Clean up expired stun
        if (dbEntry.gameData.stunned) {
            delete dbEntry.gameData.stunned[playerId];
        }
        return false;
    }
    
    return true;
}

/**
 * Reduce stun duration when player attempts an action
 */
async function reduceStunDuration(dbEntry, playerId) {
    const stunData = dbEntry.gameData?.stunned?.[playerId];
    if (!stunData) return false;
    
    stunData.actionsRemaining--;
    
    if (stunData.actionsRemaining <= 0) {
        // Stun expired
        delete dbEntry.gameData.stunned[playerId];
        
        // Update database
        const gachaVC = require('../../../models/activevcs');
        await gachaVC.updateOne(
            { channelId: dbEntry.channelId },
            { $set: { 'gameData.stunned': dbEntry.gameData.stunned } }
        );
        
        return true; // Stun ended
    } else {
        // Update remaining actions
        const gachaVC = require('../../../models/activevcs');
        await gachaVC.updateOne(
            { channelId: dbEntry.channelId },
            { $set: { 'gameData.stunned': dbEntry.gameData.stunned } }
        );
        
        return false; // Still stunned
    }
}

/**
 * Check if player has immunity to specific hazard types based on unique items
 */
async function checkHazardImmunity(member, hazardType) {
    try {
        const calculatePlayerStat = require('../../calculatePlayerStat');
        const { parseUniqueItemBonuses } = require('./uniqueItemBonuses');
        
        const playerStats = await calculatePlayerStat(member.id);
        if (!playerStats || !playerStats.equippedItems) return false;
        
        const uniqueBonuses = parseUniqueItemBonuses(playerStats.equippedItems);
        
        // Check specific hazard immunities based on unique item abilities
        switch(hazardType) {
            case HAZARD_TYPES.FIRE_BLAST:
                // Fire immunity from volcanic/fire items
                return uniqueBonuses.fireResistance >= 1.0; // 100% fire resistance = immunity
                
            case HAZARD_TYPES.BOMB_TRAP:
                // Explosive immunity from storm items or general hazard resistance
                return uniqueBonuses.electricResistance >= 1.0 || uniqueBonuses.hazardResistance >= 1.0;
                
            case HAZARD_TYPES.GREEN_FOG:
                // Toxic immunity from nature/life items
                return uniqueBonuses.lifePower >= 0.5 || uniqueBonuses.naturePower >= 0.5;
                
            case HAZARD_TYPES.PORTAL_TRAP:
                // Spatial immunity from cosmic/void items
                return uniqueBonuses.cosmicPower >= 0.5 || uniqueBonuses.voidMastery >= 0.5;
                
            case HAZARD_TYPES.WALL_TRAP:
                // Structural immunity from earth/diamond items or phase walk
                return uniqueBonuses.diamondMastery >= 0.5 || uniqueBonuses.phaseWalkChance >= 0.1;
                
            case HAZARD_TYPES.LIGHTNING_STRIKE:
                // Lightning immunity from electric/storm items or specific lightning immunity
                return uniqueBonuses.lightningImmunity || 
                       uniqueBonuses.electricResistance >= 1.0 || 
                       uniqueBonuses.stormPower >= 0.5;
                
            default:
                // General hazard resistance
                return uniqueBonuses.hazardResistance >= 1.0; // 100% resistance = immunity to all
        }
    } catch (error) {
        console.error(`[HAZARD] Error checking immunity for ${member.displayName}:`, error);
        return false;
    }
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
    handleLightningStrike,
    isPlayerStuck,
    isPlayerDisabled,
    isPlayerStunned,
    reduceStunDuration,
    enablePlayersAfterBreak,
    cleanupExpiredDisables,
    updateStuckStatus,
    checkHazardImmunity,
    applyHazardDamage,
    handlePlayerDeath,
    reviveDeadPlayers,
    damageArmorDurability,
    handleArmorBreak,
    ENCOUNTER_CONFIG  // Export for treasure handling
};

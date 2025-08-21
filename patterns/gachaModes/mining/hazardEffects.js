// hazardEffects.js - Handle hazard triggering and effects
const { HAZARD_TYPES, HAZARD_CONFIG, TILE_TYPES, ENCOUNTER_CONFIG } = require('./miningConstants');
const hazardStorage = require('./hazardStorage');

/**
 * Process hazard trigger when player steps on it
 */
async function processHazardTrigger(member, position, mapData, hazardsData, dbEntry, transaction, eventLogs) {
    const hazard = hazardStorage.getHazard(hazardsData, position.x, position.y);
    if (!hazard || hazard.triggered) return null;
    
    // Trigger and reveal the hazard
    const triggeredHazard = hazardStorage.triggerHazard(hazardsData, position.x, position.y);
    if (!triggeredHazard) return null;
    
    // Remove the hazard after triggering (one-time use)
    hazardStorage.removeHazard(hazardsData, position.x, position.y);
    
    const config = HAZARD_CONFIG[triggeredHazard.type];
    let result = {
        mapChanged: false,
        playerMoved: false,
        playerDisabled: false,
        message: null
    };
    
    switch (triggeredHazard.type) {
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
    }
    
    // Add hazard trigger message
    if (result.message) {
        eventLogs.push(`⚠️ ${member.displayName} triggered ${config.name}! ${result.message}`);
    } else {
        eventLogs.push(`⚠️ ${member.displayName} triggered ${config.name}!`);
    }
    
    return result;
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
        
        // Process each equipped item
        for (const [itemId, equippedItem] of Object.entries(equippedItems)) {
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
            
            // Apply damage
            const newDurability = Math.max(0, currentDurability - durabilityDamage);
            
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
    handlePortalTrap,
    handleBombTrap,
    handleGreenFog,
    handleWallTrap,
    isPlayerStuck,
    isPlayerDisabled,
    enablePlayersAfterBreak,
    cleanupExpiredDisables,
    ENCOUNTER_CONFIG  // Export for treasure handling
};
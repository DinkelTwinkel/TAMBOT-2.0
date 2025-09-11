// shadowCloneSystem.js - Implementation for Shadow Legion Amulet
// Place this in patterns/gachaModes/mining/ folder

const { getUniqueItemById } = require('../../../data/uniqueItemsSheet');

// Track active shadow clones per player
const activeShadowClones = new Map();
const cloneRespawnTimers = new Map();

/**
 * Check if a player has the Shadow Legion Amulet equipped
 */
function hasShadowLegionAmulet(playerData) {
    if (!playerData?.equippedItems) return false;
    
    for (const item of Object.values(playerData.equippedItems)) {
        if (item?.id === 11 || item?.name === "👥 Shadow Legion Amulet") {
            return true;
        }
    }
    return false;
}

/**
 * Initialize shadow clones for a player when they join
 */
function initializeShadowClones(playerId, playerName, playerData, mapData) {
    // Check if player has the amulet
    if (!hasShadowLegionAmulet(playerData)) {
        return { clones: [], mapChanged: false };
    }
    
    // Check if clones already exist
    if (activeShadowClones.has(playerId)) {
        return { clones: activeShadowClones.get(playerId), mapChanged: false, newlyCreated: false };
    }
    
    const shadowLegionItem = getUniqueItemById(11);
    const cloneConfig = shadowLegionItem.cloneConfig;
    const clones = [];
    let mapChanged = false;
    
    // Get player's current position
    const playerPos = mapData.playerPositions[playerId];
    if (!playerPos) return { clones: [], mapChanged: false };
    
    // Create shadow clones
    for (let i = 1; i <= cloneConfig.count; i++) {
        const cloneId = `${playerId}_shadow_${i}`;
        const clone = {
            id: cloneId,
            ownerId: playerId,
            name: `${cloneConfig.namePrefix} ${i} of ${playerName}`,
            displayName: `👤 ${playerName}'s Shadow ${i}`,
            index: i,
            isClone: true,
            active: true,
            respawning: false,
            
            // Clone stats (75% of owner's stats)
            stats: {
                mining: Math.floor((playerData.stats?.mining || 0) * cloneConfig.statMultiplier),
                luck: Math.floor((playerData.stats?.luck || 0) * cloneConfig.statMultiplier),
                speed: Math.floor((playerData.stats?.speed || 1) * cloneConfig.statMultiplier),
                sight: Math.floor((playerData.stats?.sight || 0) * cloneConfig.statMultiplier)
            },
            
            // Track clone's minecart separately (but transfers to owner)
            tempMinecart: {
                coins: 0,
                items: []
            },
            
            // Enhanced shadow clone abilities
            abilities: {
                shadowOreChance: 0.1, // 10% chance to find shadow ore
                hazardTriggerChance: 0.15, // 15% chance to trigger hazards
                knockoutResistance: 0.3, // 30% chance to resist knockout
                respawnTime: 120000, // 2 minutes respawn time
                darkSilhouette: true // Appears as dark silhouette to others
            },
            
            // Visual properties
            visual: {
                isDarkSilhouette: true,
                opacity: 0.7,
                shadowTrail: true
            }
        };
        
        clones.push(clone);
        
        // Add clone to map at slightly offset position
        const offsetX = (i === 1) ? -1 : (i === 2) ? 1 : 0;
        const offsetY = (i === 3) ? 1 : 0;
        
        mapData.playerPositions[cloneId] = {
            x: Math.max(0, Math.min(mapData.width - 1, playerPos.x + offsetX)),
            y: Math.max(0, Math.min(mapData.height - 1, playerPos.y + offsetY)),
            isClone: true,
            ownerId: playerId,
            cloneIndex: i,
            hidden: false
        };
        
        mapChanged = true;
    }
    
    // Store active clones
    activeShadowClones.set(playerId, clones);
    
    console.log(`[SHADOW LEGION] Initialized ${clones.length} shadow clones for ${playerName}`);
    
    return { clones, mapChanged, newlyCreated: true };
}

/**
 * Process shadow clone actions during mining
 */
async function processShadowCloneActions(
    clone,
    ownerData,
    mapData,
    ownerVisibleTiles,
    powerLevel,
    availableItems,
    efficiency,
    mineFromTile,
    generateTreasure,
    transaction,
    eventLogs,
    hazardsData,
    dbEntry
) {
    const results = {
        wallsBroken: 0,
        treasuresFound: 0,
        mapChanged: false,
        itemsFound: [],
        coinsEarned: 0,
        hazardTriggered: false
    };
    
    // Skip if clone is respawning
    if (clone.respawning) {
        return results;
    }
    
    const clonePos = mapData.playerPositions[clone.id];
    if (!clonePos) return results;
    
    // Clone movement AI - follows a simple pattern
    const directions = [
        { dx: 0, dy: -1, name: 'north' },
        { dx: 1, dy: 0, name: 'east' },
        { dx: 0, dy: 1, name: 'south' },
        { dx: -1, dy: 0, name: 'west' }
    ];
    
    // Find nearest undiscovered or ore tile
    let targetTile = null;
    let minDistance = Infinity;
    
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            const tile = mapData.tiles[y]?.[x];
            if (!tile) continue;
            
            // Priority: ore > undiscovered > walls
            const isTarget = tile.type === 3 || tile.type === 4 || // Ore tiles
                           !tile.discovered || // Undiscovered
                           tile.type === 1; // Walls
            
            if (isTarget) {
                const distance = Math.abs(x - clonePos.x) + Math.abs(y - clonePos.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    targetTile = { x, y };
                }
            }
        }
    }
    
    // Move towards target or random direction
    let chosenDirection;
    if (targetTile) {
        const dx = Math.sign(targetTile.x - clonePos.x);
        const dy = Math.sign(targetTile.y - clonePos.y);
        
        // Prefer the direction that gets us closer
        if (Math.abs(targetTile.x - clonePos.x) > Math.abs(targetTile.y - clonePos.y)) {
            chosenDirection = directions.find(d => d.dx === dx && d.dy === 0) || 
                            directions[Math.floor(Math.random() * directions.length)];
        } else {
            chosenDirection = directions.find(d => d.dx === 0 && d.dy === dy) || 
                            directions[Math.floor(Math.random() * directions.length)];
        }
    } else {
        chosenDirection = directions[Math.floor(Math.random() * directions.length)];
    }
    
    const newX = clonePos.x + chosenDirection.dx;
    const newY = clonePos.y + chosenDirection.dy;
    
    // Check bounds
    if (newX < 0 || newX >= mapData.width || newY < 0 || newY >= mapData.height) {
        return results;
    }
    
    const targetTileData = mapData.tiles[newY]?.[newX];
    if (!targetTileData) return results;
    
    // Check for hazards at the new position
    const hazardKey = `${newX},${newY}`;
    if (hazardsData?.hazards?.has(hazardKey)) {
        const hazard = hazardsData.hazards.get(hazardKey);
        if (hazard && !hazard.triggered && Math.random() < clone.abilities.hazardTriggerChance) {
            results.hazardTriggered = true;
            eventLogs.push(`💥 ${clone.displayName} triggered a ${hazard.type} hazard!`);
            
            // Check knockout resistance
            if (Math.random() < clone.abilities.knockoutResistance) {
                eventLogs.push(`👤 ${clone.displayName} resisted the knockout effect!`);
                // Clone survives but still triggers the hazard
                hazard.triggered = true;
            } else {
                // Knock out the clone
                clone.respawning = true;
                clone.active = false;
                
                // Set respawn timer
                const respawnTime = clone.abilities.respawnTime;
                const timerKey = `${clone.ownerId}_${clone.index}`;
                
                const respawnTimer = setTimeout(() => {
                    clone.respawning = false;
                    clone.active = true;
                    
                    // Respawn near owner if possible
                    const ownerPos = mapData.playerPositions[clone.ownerId];
                    if (ownerPos) {
                        const respawnX = Math.max(0, Math.min(mapData.width - 1, ownerPos.x + (Math.random() > 0.5 ? 1 : -1)));
                        const respawnY = Math.max(0, Math.min(mapData.height - 1, ownerPos.y + (Math.random() > 0.5 ? 1 : -1)));
                        
                        mapData.playerPositions[clone.id] = {
                            x: respawnX,
                            y: respawnY,
                            isClone: true,
                            ownerId: clone.ownerId,
                            cloneIndex: clone.index,
                            hidden: false
                        };
                    }
                    
                    eventLogs.push(`✨ ${clone.displayName} has respawned from the shadows!`);
                    cloneRespawnTimers.delete(timerKey);
                }, respawnTime);
                
                cloneRespawnTimers.set(timerKey, respawnTimer);
                
                return results;
            }
        }
    }
    
    // Process tile interaction
    if (targetTileData.type === 1) { // Wall
        // Try to break it with clone's mining power
        const breakChance = Math.min(0.5, 0.1 + (clone.stats.mining * 0.02));
        
        if (Math.random() < breakChance) {
            targetTileData.type = 0; // Convert to floor
            targetTileData.discovered = true;
            results.wallsBroken++;
            results.mapChanged = true;
            
            // Chance to find items when breaking walls
            if (Math.random() < efficiency.oreSpawnChance) {
                // Check for shadow ore first (unique to shadow clones)
                if (Math.random() < clone.abilities.shadowOreChance) {
                    // Use the proper shadow ore from item sheet
                    const { addItemToMinecart } = require('./miningDatabase');
                    
                    try {
                        // Add shadow ore to the minecart using the proper system
                        await addItemToMinecart(dbEntry, clone.ownerId, '220', 1);
                        
                        results.itemsFound.push(`Shadow Ore x1`);
                        results.coinsEarned += 50; // Base shadow ore value
                        
                        eventLogs.push(`🌑 ${clone.displayName} found Shadow Ore!`);
                    } catch (error) {
                        console.error('[SHADOW CLONE] Error adding shadow ore:', error);
                        eventLogs.push(`🌑 ${clone.displayName} found something in the shadows, but it slipped away...`);
                    }
                } else {
                    // Regular mining
                    const minedItem = await mineFromTile(
                    { id: clone.id, displayName: clone.displayName },
                    clone.stats.mining,
                    clone.stats.luck,
                    powerLevel,
                    targetTileData.type,
                    availableItems,
                    efficiency
                );
                
                if (minedItem) {
                    results.itemsFound.push(minedItem);
                    results.coinsEarned += minedItem.item.value * minedItem.quantity;
                    clone.tempMinecart.items.push(minedItem);
                    
                    eventLogs.push(`${clone.displayName} found ${minedItem.quantity}x ${minedItem.item.name}!`);
                }
                }
            }
        }
        
    } else if (targetTileData.type === 3 || targetTileData.type === 4) { // Ore
        // Mine the ore
        const minedItem = await mineFromTile(
            { id: clone.id, displayName: clone.displayName },
            clone.stats.mining,
            clone.stats.luck,
            powerLevel,
            targetTileData.type,
            availableItems,
            efficiency
        );
        
        if (minedItem) {
            results.itemsFound.push(minedItem);
            results.coinsEarned += minedItem.item.value * minedItem.quantity;
            clone.tempMinecart.items.push(minedItem);
            
            // 10% chance for shadow ore (special clone bonus)
            if (Math.random() < 0.1) {
                const shadowOre = {
                    item: {
                        itemId: 'shadow_ore',
                        name: '🌑 Shadow Ore',
                        value: 500,
                        tier: 'rare'
                    },
                    quantity: 1
                };
                results.itemsFound.push(shadowOre);
                results.coinsEarned += shadowOre.item.value;
                clone.tempMinecart.items.push(shadowOre);
                eventLogs.push(`${clone.displayName} found rare Shadow Ore!`);
            }
            
            // Convert ore tile to floor after mining
            targetTileData.type = 0;
            results.mapChanged = true;
        }
        
    } else if (targetTileData.type === 0) { // Floor
        // Move to the new position
        clonePos.x = newX;
        clonePos.y = newY;
        results.mapChanged = true;
        
        // Small chance to find treasure on floor tiles
        if (Math.random() < efficiency.treasureChance * 0.5) {
            const treasure = await generateTreasure(powerLevel, efficiency);
            if (treasure) {
                results.treasuresFound++;
                results.coinsEarned += treasure.value;
                clone.tempMinecart.coins += treasure.value;
                eventLogs.push(`${clone.displayName} found ${treasure.name}!`);
            }
        }
    }
    
    return results;
}

/**
 * Transfer clone earnings to owner
 */
function transferCloneEarnings(clone, ownerId, transaction) {
    if (!clone.tempMinecart) return;
    
    const transferData = {
        coins: clone.tempMinecart.coins || 0,
        items: clone.tempMinecart.items || []
    };
    
    // Add coins to owner
    if (transferData.coins > 0) {
        transaction.addCoins(ownerId, transferData.coins);
    }
    
    // Add items to owner
    for (const minedItem of transferData.items) {
        if (minedItem?.item && minedItem?.quantity) {
            transaction.addItem(ownerId, minedItem.item.itemId, minedItem.quantity);
        }
    }
    
    // Clear clone's temp minecart
    clone.tempMinecart = {
        coins: 0,
        items: []
    };
    
    return transferData;
}

/**
 * Remove shadow clones when player leaves
 */
function removeShadowClones(playerId, mapData) {
    const clones = activeShadowClones.get(playerId);
    if (!clones) return { mapChanged: false };
    
    let mapChanged = false;
    
    // Remove each clone from the map
    for (const clone of clones) {
        if (mapData.playerPositions[clone.id]) {
            delete mapData.playerPositions[clone.id];
            mapChanged = true;
        }
        
        // Clear any respawn timers
        const timerKey = `${playerId}_${clone.index}`;
        if (cloneRespawnTimers.has(timerKey)) {
            clearTimeout(cloneRespawnTimers.get(timerKey));
            cloneRespawnTimers.delete(timerKey);
        }
    }
    
    // Remove from active clones
    activeShadowClones.delete(playerId);
    
    console.log(`[SHADOW LEGION] Removed ${clones.length} shadow clones for player ${playerId}`);
    
    return { mapChanged };
}

/**
 * Update shadow clone stats when owner's stats change
 */
function updateShadowCloneStats(playerId, newPlayerData) {
    const clones = activeShadowClones.get(playerId);
    if (!clones) return;
    
    const shadowLegionItem = getUniqueItemById(11);
    const statMultiplier = shadowLegionItem.cloneConfig.statMultiplier;
    
    for (const clone of clones) {
        clone.stats = {
            mining: Math.floor((newPlayerData.stats?.mining || 0) * statMultiplier),
            luck: Math.floor((newPlayerData.stats?.luck || 0) * statMultiplier),
            speed: Math.floor((newPlayerData.stats?.speed || 1) * statMultiplier),
            sight: Math.floor((newPlayerData.stats?.sight || 0) * statMultiplier)
        };
    }
}

/**
 * Get visual representation of clones for map display
 */
function getCloneMapSymbols() {
    return {
        shadow_1: '👤',
        shadow_2: '🌑',
        shadow_3: '⚫'
    };
}

/**
 * Check if an entity is a shadow clone
 */
function isShadowClone(entityId) {
    return entityId && entityId.includes('_shadow_');
}

/**
 * Get the owner ID from a shadow clone ID
 */
function getCloneOwnerId(cloneId) {
    if (!isShadowClone(cloneId)) return null;
    return cloneId.split('_shadow_')[0];
}

module.exports = {
    hasShadowLegionAmulet,
    initializeShadowClones,
    processShadowCloneActions,
    transferCloneEarnings,
    removeShadowClones,
    updateShadowCloneStats,
    getCloneMapSymbols,
    isShadowClone,
    getCloneOwnerId,
    activeShadowClones
};

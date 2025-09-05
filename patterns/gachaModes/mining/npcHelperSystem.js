// npcHelperSystem.js - NPC Helper System for Crown of the Forgotten King
// Allows players with the Crown to summon and command NPC helpers

const NPC_TYPES = {
    MINER: 'miner',
    SCOUT: 'scout', 
    GUARD: 'guard',
    MERCHANT: 'merchant'
};

const NPC_CONFIGS = {
    [NPC_TYPES.MINER]: {
        name: 'Royal Miner',
        description: 'A skilled miner who helps excavate walls and find ore',
        emoji: '⛏️',
        abilities: {
            miningPower: 3,
            wallBreakChance: 0.3,
            oreBonus: 1.2
        },
        duration: 30 * 60 * 1000, // 30 minutes
        cooldown: 24 * 60 * 60 * 1000 // 24 hours
    },
    [NPC_TYPES.SCOUT]: {
        name: 'Royal Scout',
        description: 'A nimble scout who reveals map areas and finds treasures',
        emoji: '🔍',
        abilities: {
            sightRadius: 5,
            treasureFindChance: 0.2,
            mapRevealRadius: 3
        },
        duration: 45 * 60 * 1000, // 45 minutes
        cooldown: 24 * 60 * 60 * 1000 // 24 hours
    },
    [NPC_TYPES.GUARD]: {
        name: 'Royal Guard',
        description: 'A stalwart guard who protects against hazards and enemies',
        emoji: '🛡️',
        abilities: {
            hazardProtection: 0.8,
            areaProtection: 2,
            healthBonus: 50
        },
        duration: 60 * 60 * 1000, // 60 minutes
        cooldown: 24 * 60 * 60 * 1000 // 24 hours
    },
    [NPC_TYPES.MERCHANT]: {
        name: 'Royal Merchant',
        description: 'A traveling merchant who buys ore at premium prices',
        emoji: '💰',
        abilities: {
            priceMultiplier: 1.5,
            buyChance: 0.1,
            coinBonus: 100
        },
        duration: 20 * 60 * 1000, // 20 minutes
        cooldown: 24 * 60 * 60 * 1000 // 24 hours
    }
};

// Track active NPCs per channel
const activeNPCs = new Map();

/**
 * Check if player can summon an NPC
 */
async function canSummonNPC(playerId, npcType) {
    try {
        const { calculatePlayerStat } = require('../../calculatePlayerStat');
        const { parseUniqueItemBonuses } = require('./uniqueItemBonuses');
        
        const playerStats = await calculatePlayerStat(playerId);
        if (!playerStats || !playerStats.equippedItems) return false;
        
        const uniqueBonuses = parseUniqueItemBonuses(playerStats.equippedItems);
        
        // Check if player has Crown of the Forgotten King
        if (!uniqueBonuses.npcSystem || !uniqueBonuses.npcSystem.canCommandNPC) {
            return false;
        }
        
        // Check cooldown
        if (!playerStats.timeBasedEffects) {
            playerStats.timeBasedEffects = { dailyCooldowns: {} };
        }
        
        const lastUse = playerStats.timeBasedEffects.dailyCooldowns[`npc_${npcType}`] || 0;
        const cooldownTime = NPC_CONFIGS[npcType].cooldown;
        const now = Date.now();
        
        return (now - lastUse) >= cooldownTime;
        
    } catch (error) {
        console.error('[NPC] Error checking summon ability:', error);
        return false;
    }
}

/**
 * Summon an NPC helper
 */
async function summonNPC(playerId, playerName, channelId, npcType, mapData) {
    try {
        if (!await canSummonNPC(playerId, npcType)) {
            return { success: false, message: 'Cannot summon NPC - check cooldown and equipment' };
        }
        
        const config = NPC_CONFIGS[npcType];
        if (!config) {
            return { success: false, message: 'Invalid NPC type' };
        }
        
        // Create NPC
        const npcId = `npc_${playerId}_${npcType}_${Date.now()}`;
        const npc = {
            id: npcId,
            type: npcType,
            ownerId: playerId,
            ownerName: playerName,
            name: config.name,
            emoji: config.emoji,
            description: config.description,
            abilities: { ...config.abilities },
            summonedAt: Date.now(),
            expiresAt: Date.now() + config.duration,
            active: true,
            
            // Position near owner
            position: getValidNPCPosition(playerId, mapData),
            
            // Stats
            actions: 0,
            itemsFound: [],
            coinsEarned: 0,
            wallsBroken: 0,
            hazardsBlocked: 0
        };
        
        // Store active NPC
        if (!activeNPCs.has(channelId)) {
            activeNPCs.set(channelId, new Map());
        }
        activeNPCs.get(channelId).set(npcId, npc);
        
        // Set cooldown
        const { calculatePlayerStat } = require('../../calculatePlayerStat');
        const playerStats = await calculatePlayerStat(playerId);
        if (playerStats.timeBasedEffects) {
            playerStats.timeBasedEffects.dailyCooldowns[`npc_${npcType}`] = Date.now();
        }
        
        // Set expiration timer
        setTimeout(() => {
            dismissNPC(channelId, npcId, 'expired');
        }, config.duration);
        
        console.log(`[NPC] ${playerName} summoned ${config.name} in channel ${channelId}`);
        
        return {
            success: true,
            message: `${config.emoji} ${config.name} has been summoned! Duration: ${Math.floor(config.duration / 60000)} minutes`,
            npc
        };
        
    } catch (error) {
        console.error('[NPC] Error summoning NPC:', error);
        return { success: false, message: 'Failed to summon NPC' };
    }
}

/**
 * Get valid position for NPC near owner
 */
function getValidNPCPosition(playerId, mapData) {
    const ownerPos = mapData.playerPositions[playerId];
    if (!ownerPos) return { x: 0, y: 0 };
    
    // Try positions around the owner
    const offsets = [
        { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
        { x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }
    ];
    
    for (const offset of offsets) {
        const newX = ownerPos.x + offset.x;
        const newY = ownerPos.y + offset.y;
        
        if (newX >= 0 && newX < mapData.width && newY >= 0 && newY < mapData.height) {
            const tile = mapData.tiles[newY]?.[newX];
            if (tile && tile.type === 0) { // Floor tile
                return { x: newX, y: newY };
            }
        }
    }
    
    // Fallback to owner position
    return { x: ownerPos.x, y: ownerPos.y };
}

/**
 * Process NPC actions during mining cycles
 */
async function processNPCActions(channelId, mapData, eventLogs, dbEntry) {
    const channelNPCs = activeNPCs.get(channelId);
    if (!channelNPCs) return { mapChanged: false, itemsFound: [], coinsEarned: 0 };
    
    let mapChanged = false;
    let totalItemsFound = [];
    let totalCoinsEarned = 0;
    
    const now = Date.now();
    const expiredNPCs = [];
    
    for (const [npcId, npc] of channelNPCs.entries()) {
        // Check if NPC expired
        if (now > npc.expiresAt || !npc.active) {
            expiredNPCs.push(npcId);
            continue;
        }
        
        // Process NPC actions based on type
        const result = await processNPCAction(npc, mapData, eventLogs, dbEntry);
        
        if (result.mapChanged) mapChanged = true;
        if (result.itemsFound.length > 0) totalItemsFound.push(...result.itemsFound);
        if (result.coinsEarned > 0) totalCoinsEarned += result.coinsEarned;
        
        // Update NPC stats
        npc.actions++;
        npc.itemsFound.push(...result.itemsFound);
        npc.coinsEarned += result.coinsEarned;
        npc.wallsBroken += result.wallsBroken || 0;
        npc.hazardsBlocked += result.hazardsBlocked || 0;
    }
    
    // Clean up expired NPCs
    for (const npcId of expiredNPCs) {
        dismissNPC(channelId, npcId, 'expired');
    }
    
    return { mapChanged, itemsFound: totalItemsFound, coinsEarned: totalCoinsEarned };
}

/**
 * Process individual NPC action
 */
async function processNPCAction(npc, mapData, eventLogs, dbEntry) {
    const result = { mapChanged: false, itemsFound: [], coinsEarned: 0, wallsBroken: 0, hazardsBlocked: 0 };
    
    try {
        switch (npc.type) {
            case NPC_TYPES.MINER:
                return await processMinerNPC(npc, mapData, eventLogs, dbEntry);
                
            case NPC_TYPES.SCOUT:
                return await processScoutNPC(npc, mapData, eventLogs, dbEntry);
                
            case NPC_TYPES.GUARD:
                return await processGuardNPC(npc, mapData, eventLogs, dbEntry);
                
            case NPC_TYPES.MERCHANT:
                return await processMerchantNPC(npc, mapData, eventLogs, dbEntry);
                
            default:
                return result;
        }
    } catch (error) {
        console.error(`[NPC] Error processing ${npc.name} action:`, error);
        return result;
    }
}

/**
 * Process Miner NPC actions
 */
async function processMinerNPC(npc, mapData, eventLogs, dbEntry) {
    const result = { mapChanged: false, itemsFound: [], coinsEarned: 0, wallsBroken: 0 };
    
    // Find nearby walls to break
    const pos = npc.position;
    const directions = [
        { x: pos.x + 1, y: pos.y }, { x: pos.x - 1, y: pos.y },
        { x: pos.x, y: pos.y + 1 }, { x: pos.x, y: pos.y - 1 }
    ];
    
    for (const dir of directions) {
        if (dir.x < 0 || dir.x >= mapData.width || dir.y < 0 || dir.y >= mapData.height) continue;
        
        const tile = mapData.tiles[dir.y]?.[dir.x];
        if (tile && tile.type === 1 && Math.random() < npc.abilities.wallBreakChance) {
            // Break wall
            tile.type = 0;
            tile.discovered = true;
            result.mapChanged = true;
            result.wallsBroken++;
            
            // Chance to find ore
            if (Math.random() < 0.3) {
                const { addItemToMinecart } = require('./miningDatabase');
                
                // Find basic ore (coal, copper, iron)
                const oreIds = ['1', '21', '22'];
                const oreId = oreIds[Math.floor(Math.random() * oreIds.length)];
                const quantity = Math.floor(Math.random() * 3) + 1;
                
                try {
                    await addItemToMinecart(dbEntry, npc.ownerId, oreId, quantity);
                    result.itemsFound.push(`${quantity}x ore`);
                    eventLogs.push(`${npc.emoji} ${npc.name} found ore while mining!`);
                } catch (error) {
                    console.error('[NPC] Miner failed to add ore:', error);
                }
            }
            
            break; // Only break one wall per cycle
        }
    }
    
    return result;
}

/**
 * Process Scout NPC actions
 */
async function processScoutNPC(npc, mapData, eventLogs, dbEntry) {
    const result = { mapChanged: false, itemsFound: [], coinsEarned: 0 };
    
    // Reveal map areas around scout
    const pos = npc.position;
    const radius = npc.abilities.mapRevealRadius;
    
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const x = pos.x + dx;
            const y = pos.y + dy;
            
            if (x < 0 || x >= mapData.width || y < 0 || y >= mapData.height) continue;
            
            const tile = mapData.tiles[y]?.[x];
            if (tile && !tile.discovered) {
                tile.discovered = true;
                result.mapChanged = true;
            }
        }
    }
    
    // Chance to find treasure
    if (Math.random() < npc.abilities.treasureFindChance) {
        eventLogs.push(`${npc.emoji} ${npc.name} discovered a hidden treasure!`);
        result.coinsEarned += Math.floor(Math.random() * 100) + 50;
    }
    
    return result;
}

/**
 * Process Guard NPC actions
 */
async function processGuardNPC(npc, mapData, eventLogs, dbEntry) {
    const result = { mapChanged: false, itemsFound: [], coinsEarned: 0, hazardsBlocked: 0 };
    
    // Guard protects area around itself - this would integrate with hazard system
    // For now, just provide passive protection bonus to owner
    if (Math.random() < 0.1) { // 10% chance per cycle
        eventLogs.push(`${npc.emoji} ${npc.name} stands vigilant, protecting the area.`);
        result.hazardsBlocked = 1;
    }
    
    return result;
}

/**
 * Process Merchant NPC actions
 */
async function processMerchantNPC(npc, mapData, eventLogs, dbEntry) {
    const result = { mapChanged: false, itemsFound: [], coinsEarned: 0 };
    
    // Merchant occasionally buys ore at premium prices
    if (Math.random() < npc.abilities.buyChance) {
        const bonus = Math.floor(Math.random() * npc.abilities.coinBonus) + 50;
        result.coinsEarned += bonus;
        eventLogs.push(`${npc.emoji} ${npc.name} purchased ore for a premium: +${bonus} coins!`);
    }
    
    return result;
}

/**
 * Dismiss an NPC
 */
function dismissNPC(channelId, npcId, reason = 'dismissed') {
    const channelNPCs = activeNPCs.get(channelId);
    if (!channelNPCs) return false;
    
    const npc = channelNPCs.get(npcId);
    if (!npc) return false;
    
    channelNPCs.delete(npcId);
    
    console.log(`[NPC] ${npc.name} ${reason} from channel ${channelId}`);
    return true;
}

/**
 * Get active NPCs for a channel
 */
function getActiveNPCs(channelId) {
    const channelNPCs = activeNPCs.get(channelId);
    return channelNPCs ? Array.from(channelNPCs.values()) : [];
}

/**
 * Get NPC status for a player
 */
function getPlayerNPCStatus(playerId, channelId) {
    const npcs = getActiveNPCs(channelId);
    return npcs.filter(npc => npc.ownerId === playerId);
}

module.exports = {
    NPC_TYPES,
    NPC_CONFIGS,
    canSummonNPC,
    summonNPC,
    processNPCActions,
    dismissNPC,
    getActiveNPCs,
    getPlayerNPCStatus,
    activeNPCs
};

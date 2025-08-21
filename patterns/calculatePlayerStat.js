const PlayerInventory = require('../models/inventory');
const PlayerBuffs = require('../models/PlayerBuff');
const itemSheet = require('../data/itemSheet.json');
const UniqueItem = require('../models/uniqueItems');
const { getUniqueItemById } = require('../data/uniqueItemsSheet');

/**
 * Builds a player's stats based on their inventory and all active buffs.
 * - Tools: Only best tool per slot type, using matching ability
 * - Charms: All cumulative (one of each)
 * - Equipment: Only one per slot (highest total power)
 * - Buffs: Added on top of final stats
 * 
 * @param {string} playerId - Discord user ID or player identifier
 * @returns {Promise<Object>} - Object with stats and equippedItems
 */
async function getPlayerStats(playerId) {
    const now = new Date();

    // Fetch inventory from DB
    const inv = await PlayerInventory.findOne({ playerId }).lean();
    const invItems = Array.isArray(inv?.items) ? inv.items : [];
    
    // Fetch unique items owned by player
    const uniqueItems = await UniqueItem.findPlayerUniqueItems(playerId);

    // Build base stats from inventory
    const playerStats = {};
    const equippedItems = {}; // Track all equipped items by ID
    
    // Categorize items
    const toolsBySlot = {}; // { slot: [items] }
    const equipmentBySlot = {}; // { slot: [items] }
    const charms = []; // All unique charms
    const processedCharmIds = new Set(); // Track processed charm IDs

    // First pass: Categorize all items
    for (const invItem of invItems) {
        const itemData = itemSheet.find(it => String(it.id) === String(invItem.itemId));
        if (!itemData || !Array.isArray(itemData.abilities) || itemData.abilities.length === 0) continue;

        // Skip consumables
        if (itemData.type === 'consumable') continue;
        
        // Get current durability from inventory, or use default from itemSheet
        const currentDurability = invItem.currentDurability !== undefined ? 
            invItem.currentDurability : (itemData.durability || 100);

        // Categorize by type
        if (itemData.type === 'tool' && itemData.slot) {
            if (!toolsBySlot[itemData.slot]) {
                toolsBySlot[itemData.slot] = [];
            }
            toolsBySlot[itemData.slot].push({
                ...itemData,
                inventoryQuantity: invItem.quantity,
                currentDurability: currentDurability
            });
        } else if (itemData.type === 'equipment' && itemData.slot) {
            if (!equipmentBySlot[itemData.slot]) {
                equipmentBySlot[itemData.slot] = [];
            }
            equipmentBySlot[itemData.slot].push({
                ...itemData,
                inventoryQuantity: invItem.quantity,
                currentDurability: currentDurability
            });
        } else if (itemData.type === 'charm') {
            // Only add each unique charm once
            if (!processedCharmIds.has(String(itemData.id))) {
                processedCharmIds.add(String(itemData.id));
                charms.push({
                    ...itemData,
                    inventoryQuantity: invItem.quantity,
                    currentDurability: currentDurability
                });
            }
        }
    }

    // Process TOOLS: Select best tool per slot based on the slot's matching ability
    for (const [slot, tools] of Object.entries(toolsBySlot)) {
        let bestTool = null;
        let bestPower = 0;

        for (const tool of tools) {
            // Find the ability that matches the slot name
            const matchingAbility = tool.abilities.find(ab => ab.name === slot);
            const power = matchingAbility ? Number(matchingAbility.powerlevel) || 0 : 0;

            if (power > bestPower) {
                bestPower = power;
                bestTool = tool;
            }
        }

        // Add the best tool's stats
        if (bestTool) {
            const appliedAbilities = [];
            for (const abilityObj of bestTool.abilities) {
                const ability = abilityObj.name;
                const power = Number(abilityObj.powerlevel) || 0;

                if (power > 0) {
                    playerStats[ability] = (playerStats[ability] || 0) + power;
                    appliedAbilities.push({ name: ability, power });
                }
            }

            equippedItems[bestTool.id] = {
                itemId: bestTool.id,
                name: bestTool.name,
                type: 'tool',
                slot: slot,
                abilities: appliedAbilities,
                durability: bestTool.durability || 100,
                currentDurability: bestTool.currentDurability,
                inventoryQuantity: bestTool.inventoryQuantity
            };
        }
    }

    // Process EQUIPMENT: Select best equipment per slot based on total power
    for (const [slot, equipment] of Object.entries(equipmentBySlot)) {
        let bestEquip = null;
        let bestTotalPower = 0;

        for (const equip of equipment) {
            // Calculate total power from all abilities
            let totalPower = 0;
            for (const abilityObj of equip.abilities) {
                totalPower += Number(abilityObj.powerlevel) || 0;
            }

            if (totalPower > bestTotalPower) {
                bestTotalPower = totalPower;
                bestEquip = equip;
            }
        }

        // Add the best equipment's stats
        if (bestEquip) {
            const appliedAbilities = [];
            for (const abilityObj of bestEquip.abilities) {
                const ability = abilityObj.name;
                const power = Number(abilityObj.powerlevel) || 0;

                if (power > 0) {
                    playerStats[ability] = (playerStats[ability] || 0) + power;
                    appliedAbilities.push({ name: ability, power });
                }
            }

            equippedItems[bestEquip.id] = {
                itemId: bestEquip.id,
                name: bestEquip.name,
                type: 'equipment',
                slot: slot,
                abilities: appliedAbilities,
                durability: bestEquip.durability || 100,
                currentDurability: bestEquip.currentDurability,
                inventoryQuantity: bestEquip.inventoryQuantity
            };
        }
    }

    // Process UNIQUE ITEMS: These override regular items in their slots
    const uniqueItemsBySlot = {};
    for (const uniqueDbItem of uniqueItems) {
        const uniqueData = getUniqueItemById(uniqueDbItem.itemId);
        if (!uniqueData) continue;
        
        // Check maintenance level - item loses effectiveness if not maintained
        const maintenanceRatio = uniqueDbItem.maintenanceLevel / 10; // 0 to 1
        if (maintenanceRatio <= 0) continue; // Item is broken from lack of maintenance
        
        uniqueItemsBySlot[uniqueData.slot] = {
            ...uniqueData,
            maintenanceRatio,
            dbItem: uniqueDbItem
        };
    }
    
    // Override regular items with unique items in same slots
    for (const [slot, uniqueItem] of Object.entries(uniqueItemsBySlot)) {
        // Remove regular item from this slot if unique item exists
        const regularItemIds = Object.keys(equippedItems).filter(id => {
            const item = equippedItems[id];
            return item.slot === slot;
        });
        
        for (const id of regularItemIds) {
            // Remove stats from the regular item
            const regularItem = equippedItems[id];
            for (const ability of regularItem.abilities) {
                playerStats[ability.name] = Math.max(0, (playerStats[ability.name] || 0) - ability.power);
            }
            delete equippedItems[id];
        }
        
        // Add unique item stats (scaled by maintenance)
        const appliedAbilities = [];
        for (const abilityObj of uniqueItem.abilities) {
            const ability = abilityObj.name;
            const basePower = Number(abilityObj.powerlevel) || 0;
            const scaledPower = Math.floor(basePower * uniqueItem.maintenanceRatio);
            
            if (scaledPower !== 0) { // Allow negative stats
                playerStats[ability] = (playerStats[ability] || 0) + scaledPower;
                appliedAbilities.push({ name: ability, power: scaledPower, basePower });
            }
        }
        
        equippedItems[`unique_${uniqueItem.id}`] = {
            itemId: `unique_${uniqueItem.id}`,
            name: uniqueItem.name,
            type: uniqueItem.type,
            slot: uniqueItem.slot,
            abilities: appliedAbilities,
            isUnique: true,
            rarity: 'legendary',
            maintenanceLevel: uniqueItem.dbItem.maintenanceLevel,
            maintenanceRatio: uniqueItem.maintenanceRatio,
            specialEffects: uniqueItem.specialEffects
        };
    }
    
    // Process CHARMS: All charms are cumulative (one of each)
    for (const charm of charms) {
        const appliedAbilities = [];
        for (const abilityObj of charm.abilities) {
            const ability = abilityObj.name;
            const power = Number(abilityObj.powerlevel) || 0;

            if (power > 0) {
                playerStats[ability] = (playerStats[ability] || 0) + power;
                appliedAbilities.push({ name: ability, power });
            }
        }

        if (appliedAbilities.length > 0) {
            equippedItems[charm.id] = {
                itemId: charm.id,
                name: charm.name,
                type: 'charm',
                abilities: appliedAbilities,
                durability: charm.durability || 100,
                currentDurability: charm.currentDurability,
                inventoryQuantity: charm.inventoryQuantity
            };
        }
    }

    // Fetch and apply BUFFS
    const buffDoc = await PlayerBuffs.findOne({ playerId });
    if (buffDoc?.buffs?.length) {
        // Filter out expired buffs
        const activeBuffs = buffDoc.buffs.filter(buff => buff.expiresAt > now);

        // Only update DB if we removed any expired buffs
        if (activeBuffs.length !== buffDoc.buffs.length) {
            buffDoc.buffs = activeBuffs;
            await buffDoc.save();
        }

        // Apply active buffs (these add on top of equipment stats)
        for (const buff of activeBuffs) {
            for (const [ability, power] of buff.effects.entries()) {
                const effectPower = Number(power) || 0;
                playerStats[ability] = (playerStats[ability] || 0) + effectPower;
            }
        }
    }

    return {
        stats: playerStats,
        equippedItems: equippedItems
    };
}

module.exports = getPlayerStats;
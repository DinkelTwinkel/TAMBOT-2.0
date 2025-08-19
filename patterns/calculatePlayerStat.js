const PlayerInventory = require('../models/inventory');
const PlayerBuffs = require('../models/PlayerBuff');
const itemSheet = require('../data/itemSheet.json');

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

        // Categorize by type
        if (itemData.type === 'tool' && itemData.slot) {
            if (!toolsBySlot[itemData.slot]) {
                toolsBySlot[itemData.slot] = [];
            }
            toolsBySlot[itemData.slot].push({
                ...itemData,
                inventoryQuantity: invItem.quantity
            });
        } else if (itemData.type === 'equipment' && itemData.slot) {
            if (!equipmentBySlot[itemData.slot]) {
                equipmentBySlot[itemData.slot] = [];
            }
            equipmentBySlot[itemData.slot].push({
                ...itemData,
                inventoryQuantity: invItem.quantity
            });
        } else if (itemData.type === 'charm') {
            // Only add each unique charm once
            if (!processedCharmIds.has(String(itemData.id))) {
                processedCharmIds.add(String(itemData.id));
                charms.push({
                    ...itemData,
                    inventoryQuantity: invItem.quantity
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
                durability: bestTool.durability || 0,
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
                durability: bestEquip.durability || 0,
                inventoryQuantity: bestEquip.inventoryQuantity
            };
        }
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
                durability: charm.durability || 0,
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
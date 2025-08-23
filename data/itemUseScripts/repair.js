// repair.js - Script for repairing tool durability
const { EmbedBuilder } = require('discord.js');

/**
 * Repair script for items that restore tool durability
 * This script is called when an item with script: "repair" is used
 * 
 * @param {Object} context - The context object containing all necessary data
 */
module.exports = {
    execute: async (context) => {
        const { 
            interaction, 
            item, 
            userId,
            user,
            consumeItem,
            sendEmbed,
            PlayerInventory,
            itemMap
        } = context;

        try {
            // Get user's inventory
            const playerInv = await PlayerInventory.findOne({ playerId: userId });
            if (!playerInv) {
                throw new Error('Inventory not found');
            }

            // Find all tools in inventory that have durability
            const tools = [];
            for (const invItem of playerInv.items) {
                const itemData = itemMap.get(invItem.itemId);
                if (itemData && itemData.type === 'tool' && itemData.durability) {
                    tools.push({
                        ...invItem.toObject(),
                        itemData: itemData,
                        currentDurability: invItem.currentDurability || 0,
                        maxDurability: itemData.durability
                    });
                }
            }

            if (tools.length === 0) {
                throw new Error('You have no tools that can be repaired!');
            }

            // Find the most damaged tool
            let mostDamagedTool = null;
            let lowestDurabilityRatio = 1;

            for (const tool of tools) {
                const ratio = tool.currentDurability / tool.maxDurability;
                if (ratio < lowestDurabilityRatio) {
                    lowestDurabilityRatio = ratio;
                    mostDamagedTool = tool;
                }
            }

            if (!mostDamagedTool || lowestDurabilityRatio === 1) {
                throw new Error('All your tools are already at full durability!');
            }

            // Calculate repair amount (could be based on item properties)
            let repairAmount = 20; // Default repair amount
            if (item.abilities) {
                const repairAbility = item.abilities.find(a => a.name === 'repair');
                if (repairAbility) {
                    repairAmount = repairAbility.powerlevel * 10;
                }
            }

            // Apply repair
            const oldDurability = mostDamagedTool.currentDurability;
            const newDurability = Math.min(
                mostDamagedTool.currentDurability + repairAmount,
                mostDamagedTool.maxDurability
            );

            // Update the tool's durability in the database
            const toolInInv = playerInv.items.find(i => i.itemId === mostDamagedTool.itemId);
            if (toolInInv) {
                toolInInv.currentDurability = newDurability;
                playerInv.markModified('items');
                await playerInv.save();
            }

            // Consume the repair item
            const remainingQuantity = await consumeItem(1);

            // Build success message
            const actualRepair = newDurability - oldDurability;
            const description = [
                `**${user.username}** used **${item.name}** to repair their tools!`,
                '',
                `🔧 **Repaired:** ${mostDamagedTool.itemData.name}`,
                `📊 **Durability:** ${oldDurability}/${mostDamagedTool.maxDurability} → ${newDurability}/${mostDamagedTool.maxDurability}`,
                `✨ **Restored:** +${actualRepair} durability`,
                '',
                `📦 **Remaining:** ${remainingQuantity}x ${item.name}`
            ].join('\n');

            // Send success embed
            await sendEmbed({
                title: '🔧 Tool Repaired',
                description: description,
                color: 0x3498DB,
                fields: [
                    {
                        name: '💰 Repair Kit Value',
                        value: item.value ? `${item.value} coins` : 'Priceless',
                        inline: true
                    },
                    {
                        name: '🛠️ Tool Condition',
                        value: `${Math.round((newDurability / mostDamagedTool.maxDurability) * 100)}% health`,
                        inline: true
                    }
                ]
            });

            console.log(`[REPAIR] ${userId} repaired ${mostDamagedTool.itemData.name} (+${actualRepair} durability)`);

        } catch (error) {
            console.error('[REPAIR] Error:', error);
            throw error;
        }
    }
};

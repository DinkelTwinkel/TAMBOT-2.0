// Item Transfer Interaction Handler
// Handles the select menu interactions for the /give item command

const PlayerInventory = require('../models/inventory');
const PlayerEquipped = require('../models/PlayerEquipped');
const { EmbedBuilder } = require('discord.js');
const itemSheet = require('../data/itemSheet.json');
const mongoose = require('mongoose');

// Create item map for O(1) lookups
const itemMap = new Map(itemSheet.map(item => [item.id, item]));

/**
 * Handles item transfer select menu interactions
 * @param {Interaction} interaction - The Discord interaction
 */
async function handleItemTransfer(interaction) {
    // Parse the custom ID: transfer_item_select_giverId_receiverId_page
    const parts = interaction.customId.split('_');
    if (parts.length < 5 || parts[0] !== 'transfer' || parts[1] !== 'item' || parts[2] !== 'select') {
        return false; // Not our interaction
    }

    const giverId = parts[3];
    const receiverId = parts[4];
    const page = parseInt(parts[5] || 0);

    // Validate that the interaction is from the giver
    if (interaction.user.id !== giverId) {
        return interaction.reply({
            content: '❌ Only the person who initiated the transfer can select items.',
            ephemeral: true
        });
    }

    // Defer the update to prevent timeout
    await interaction.deferUpdate();

    const selectedItemId = interaction.values[0];
    const itemData = itemMap.get(selectedItemId);
    
    if (!itemData) {
        return interaction.followUp({
            content: '❌ Invalid item selected.',
            ephemeral: true
        });
    }

    // Start a MongoDB session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Get giver's inventory
        const giverInventory = await PlayerInventory.findOne({ playerId: giverId }).session(session);
        if (!giverInventory) {
            await session.abortTransaction();
            session.endSession();
            return interaction.followUp({
                content: '❌ Could not find your inventory.',
                ephemeral: true
            });
        }

        // Find the item in giver's inventory
        const itemIndex = giverInventory.items.findIndex(item => item.itemId === selectedItemId);
        if (itemIndex === -1 || giverInventory.items[itemIndex].quantity < 1) {
            await session.abortTransaction();
            session.endSession();
            return interaction.followUp({
                content: `❌ You don't have any **${itemData.name}** to give.`,
                ephemeral: true
            });
        }

        // Check if item is equipped (for tools/equipment)
        if (itemData.type === 'tool' || itemData.type === 'equipment') {
            const equipped = await PlayerEquipped.findOne({ playerId: giverId }).session(session);
            if (equipped) {
                const isEquipped = equipped.equippedItems.some(eq => eq.itemId === selectedItemId);
                if (isEquipped) {
                    await session.abortTransaction();
                    session.endSession();
                    return interaction.followUp({
                        content: `❌ You cannot give **${itemData.name}** because it's currently equipped. Please unequip it first.`,
                        ephemeral: true
                    });
                }
            }
        }

        // Create prompt for quantity if item has multiple
        const availableQuantity = giverInventory.items[itemIndex].quantity;
        
        // For now, we'll transfer 1 item at a time
        // You can enhance this to show a modal for quantity selection
        const transferQuantity = 1;

        if (transferQuantity > availableQuantity) {
            await session.abortTransaction();
            session.endSession();
            return interaction.followUp({
                content: `❌ You only have ${availableQuantity} **${itemData.name}**.`,
                ephemeral: true
            });
        }

        // Remove from giver's inventory
        giverInventory.items[itemIndex].quantity -= transferQuantity;
        if (giverInventory.items[itemIndex].quantity === 0) {
            giverInventory.items.splice(itemIndex, 1);
        }
        await giverInventory.save({ session });

        // Add to receiver's inventory
        let receiverInventory = await PlayerInventory.findOne({ playerId: receiverId }).session(session);
        if (!receiverInventory) {
            receiverInventory = new PlayerInventory({
                playerId: receiverId,
                items: []
            });
        }

        // Check if receiver already has this item
        const receiverItemIndex = receiverInventory.items.findIndex(item => item.itemId === selectedItemId);
        if (receiverItemIndex !== -1) {
            // Add to existing stack
            receiverInventory.items[receiverItemIndex].quantity += transferQuantity;
            // Transfer durability if applicable (take average)
            if (giverInventory.items[itemIndex]?.currentDurability !== undefined) {
                const giverDurability = giverInventory.items[itemIndex].currentDurability;
                const receiverDurability = receiverInventory.items[receiverItemIndex].currentDurability || itemData.durability || 100;
                receiverInventory.items[receiverItemIndex].currentDurability = 
                    Math.floor((receiverDurability + giverDurability) / 2);
            }
        } else {
            // Add new item
            const newItem = {
                itemId: selectedItemId,
                quantity: transferQuantity
            };
            // Include durability if applicable
            if (giverInventory.items[itemIndex]?.currentDurability !== undefined) {
                newItem.currentDurability = giverInventory.items[itemIndex].currentDurability;
            }
            receiverInventory.items.push(newItem);
        }
        await receiverInventory.save({ session });

        // Commit the transaction
        await session.commitTransaction();
        session.endSession();

        // Create success embed
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Item Transfer Successful')
            .setDescription(`Successfully gave **${transferQuantity}x ${itemData.name}** to <@${receiverId}>!`)
            .setColor(0x2ecc71)
            .addFields(
                { name: 'Item', value: itemData.name, inline: true },
                { name: 'Quantity', value: `${transferQuantity}`, inline: true },
                { name: 'Recipient', value: `<@${receiverId}>`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Transfer completed' });

        // Add item thumbnail if available
        if (itemData.image) {
            successEmbed.setThumbnail(itemData.image);
        }

        // Clear the components to prevent further interactions
        await interaction.editReply({
            embeds: [successEmbed],
            components: [],
            ephemeral: true
        });

        // Notify the receiver (optional, non-ephemeral message)
        try {
            await interaction.channel.send({
                content: `<@${receiverId}>, you received **${transferQuantity}x ${itemData.name}** from <@${giverId}>!`,
                allowedMentions: { users: [receiverId] }
            });
        } catch (err) {
            console.log('Could not send notification to receiver:', err);
        }

        return true;

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error during item transfer:', error);
        
        return interaction.followUp({
            content: '❌ An error occurred during the transfer. Please try again.',
            ephemeral: true
        });
    }
}

module.exports = handleItemTransfer;

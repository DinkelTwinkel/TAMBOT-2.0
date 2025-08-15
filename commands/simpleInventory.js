// commands/inventory.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const PlayerInventory = require('../models/inventory');
const itemsheet = require('../data/itemSheet.json'); // must contain { id, name }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Check your inventory'),

    async execute(interaction) {
        await interaction.deferReply();

        const playerInv = await PlayerInventory.findOne({
            playerId: interaction.user.id,
        }).lean();

        if (!playerInv || playerInv.items.length === 0) {
            return interaction.editReply(`You have no items in your inventory.`);
        }

        // Build inventory display
        const lines = playerInv.items.map(item => {
            const itemData = itemsheet.find(i => i.id === item.itemId);
            if (!itemData) return `${item.itemId}: ${item.quantity}`;
            return `${itemData.name} x${item.quantity}`;
        });

        // Wrap inventory in a code block
        const inventoryText = '```\n' + lines.join('\n') + '\n```';

        const embed = new EmbedBuilder()
            .setTitle(`${interaction.user.username}'s Inventory`)
            .setDescription(inventoryText)
            .setColor(0xFFD700)
            .setTimestamp();

        interaction.editReply({ embeds: [embed] });
    }
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const PlayerInventory = require('../models/inventory');
const itemsheet = require('../data/itemSheet.json'); // must contain { id, name }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Check your inventory or another player\'s inventory')
        .addUserOption(option => 
            option.setName('member')
                .setDescription('Optional: View another player\'s inventory')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('member') || interaction.user;

        const playerInv = await PlayerInventory.findOne({
            playerId: targetUser.id,
        }).lean();

        if (!playerInv || playerInv.items.length === 0) {
            return interaction.editReply(`${targetUser.username} has no items in their inventory.`);
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
            .setTitle(`${targetUser.username}'s Inventory`)
            .setDescription(inventoryText)
            .setColor(0xFFD700)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};

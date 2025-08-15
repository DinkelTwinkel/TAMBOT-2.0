const { SlashCommandBuilder } = require('discord.js');
const generateShop = require('../patterns/generateShop');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Open up the store!'),

    async execute(interaction) {
        const channel = interaction.channel;
        await generateShop(channel, interaction.user.id);
        await interaction.reply({ content: 'Shop opened!', ephemeral: true });
    }
};

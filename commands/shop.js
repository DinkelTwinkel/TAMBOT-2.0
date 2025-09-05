const { SlashCommandBuilder } = require('discord.js');
const generateShop = require('../patterns/generateShop');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Open up the store!'),

    async execute(interaction) {
        const channel = interaction.channel;
        await interaction.deferReply({ephemeral: true})
        await generateShop(channel, 20, interaction.user.id);
        await interaction.editReply({ content: 'Shop opened!', ephemeral: true });
    }
};

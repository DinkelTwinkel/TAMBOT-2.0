const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
const Money = require('../models/currency'); // Adjust path as needed
const generateMinecartImage = require('../patterns/generateMinecartImage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('minecart')
    .setDescription('show cart'),

  async execute(interaction) {

    await interaction.deferReply();

     const embed = new EmbedBuilder()
            .setTitle(`🛒 MINE CART}`)
            .setColor('Gold')
            .setImage('attachment://cart.png')
   
    const buffer = await generateMinecartImage(interaction.channel);
    const attachment = new AttachmentBuilder(buffer, { name: 'cart.png' });
    // Send shop message first to get the message ID
    return interaction.editReply({ embeds: [embed], files: [attachment] });

  }
};

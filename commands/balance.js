const { SlashCommandBuilder } = require('discord.js');
const Money = require('../models/currency'); // adjust path to your schema
const createMoneyProfile = require('../patterns/currency/createCurrencyProfile');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check how much money you or someone else has.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to check')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;

    // Look up user's money profile
    let profile = await Money.findOne({ userId: target.id });
    if (!profile) {
      profile = await createMoneyProfile(target, 0);
    }

    await interaction.reply({
      content: `💰 **${target.username}** has **${profile.money}** coins.`,
      ephemeral: false
    });
  }
};
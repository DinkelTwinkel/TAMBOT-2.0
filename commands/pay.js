const { SlashCommandBuilder } = require('discord.js');
const mongoose = require('mongoose');
const Money = require('../models/currency'); // Adjust path as needed

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Give coins to another user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to give coins to')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of coins to give')
        .setRequired(true)),

  async execute(interaction) {
    const recipient = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (interaction.member.id !== '865147754358767627') {
      return interaction.reply({ content: 'You cant use this.', ephemeral: true });
    }

    if (amount <= 0) {
      return interaction.reply({ content: 'Please enter a valid amount greater than 0.', ephemeral: true });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {

      // Find or create recipient doc inside the transaction
      let recipientProfile = await Money.findOne({ userId: recipient.id }).session(session);
      if (!recipientProfile) {
        recipientProfile = new Money({ userId: recipient.id, money: 0 });
      }
      recipientProfile.money += amount;
      await recipientProfile.save({ session });

      // Commit both changes atomically
      await session.commitTransaction();
      session.endSession();

      return interaction.reply({
        content: `💸 payed **${amount}** coins to <@${recipient.id}>!`,
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Transaction failed:', error);
      return interaction.reply({ content: 'Something went wrong while transferring coins.', ephemeral: true });
    }
  }
};

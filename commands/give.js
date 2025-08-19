const { SlashCommandBuilder } = require('discord.js');
const mongoose = require('mongoose');
const Money = require('../models/currency'); // Adjust path as needed

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give')
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
    const senderId = interaction.user.id;
    const recipient = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (recipient.id === senderId) {
      return interaction.reply({ content: 'You can’t give coins to yourself.', ephemeral: true });
    }

    if (amount <= 0) {
      return interaction.reply({ content: 'Please enter a valid amount greater than 0.', ephemeral: true });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find sender doc inside the transaction
      const senderProfile = await Money.findOne({ userId: senderId }).session(session);

      if (!senderProfile || senderProfile.money < amount) {
        await session.abortTransaction();
        session.endSession();
        return interaction.reply({ content: 'You don’t have enough coins to give.', ephemeral: true });
      }

      // Deduct from sender
      senderProfile.money -= amount;
      await senderProfile.save({ session });

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
        content: `💸 <@${senderId}> gave **${amount}** coins to <@${recipient.id}>!`,
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Transaction failed:', error);
      return interaction.reply({ content: 'Something went wrong while transferring coins.', ephemeral: true });
    }
  }
};

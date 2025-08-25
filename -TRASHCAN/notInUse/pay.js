const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('[DEPRECATED] This command has been moved to /admin pay')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to give coins to')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of coins to give')
        .setRequired(true)),

  async execute(interaction) {
    return interaction.reply({ 
      content: '⚠️ This command has been deprecated.\n\nPlease use `/admin pay` instead.\n\nOnly administrators can use this command.', 
      ephemeral: true 
    });
  }
};

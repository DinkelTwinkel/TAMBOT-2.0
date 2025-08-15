const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Money = require('../models/currency');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Eat the rich...'),

  async execute(interaction) {
    await interaction.deferReply();

    const topUsers = await Money.find({ money: { $gt: 0 } })
      .sort({ money: -1 })
      .limit(100);

    if (!topUsers.length) {
      return interaction.editReply('No leaderboard data available.');
    }

    const leaderboard = await Promise.all(topUsers.map(async (entry, index) => {
      const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
      return `**#${index + 1}** – <@${entry.userId}> — 💰 ${entry.money.toLocaleString()}`;
    }));

    const embed = new EmbedBuilder()
      .setTitle('TAMUNGI WEALTH DISTRIBUTION CENTRE')
      .setThumbnail('https://cdn.discordapp.com/attachments/1391742804237094972/1404748006233866402/01coin.gif')
      .setDescription(leaderboard.join('\n'))
      .setColor(0xf1c40f)
      .setFooter({ text: 'Top 100 richest users' })
      .setTimestamp();

    const eatButton = new ButtonBuilder()
      .setCustomId('eat_the_rich')
      .setLabel('🍴 Eat the Rich')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(eatButton);

    await interaction.editReply({
      embeds: [embed],
    });

  }
};

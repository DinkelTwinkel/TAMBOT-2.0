const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Money = require('../models/currency');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Eat the rich...'),

  async execute(interaction) {
    await interaction.deferReply();

    // Fetch all members of the guild
    const guildMembers = await interaction.guild.members.fetch();
    const memberIds = guildMembers.map(member => member.id);

    // Find global money profiles for only the members in this guild
    const allProfiles = await Money.find({ userId: { $in: memberIds }, money: { $gt: 0 } });

    if (!allProfiles.length) {
      return interaction.editReply('No leaderboard data available for this server.');
    }

    // Sort profiles by money descending
    const sortedProfiles = allProfiles.sort((a, b) => b.money - a.money).slice(0, 100);

    const leaderboard = sortedProfiles.map((entry, index) => {
      return `**#${index + 1}** – <@${entry.userId}> — 💰 ${entry.money.toLocaleString()}`;
    });

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
      components: [row],
    });
  }
};

const Money = require('../models/currency');

// Cooldowns map: userId => timestamp of last use
const cooldowns = new Map();
const COOLDOWN = 1000; // 1 s

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'eat_the_rich') return;

    // Fetch the user's money profile
    const userProfile = await Money.findOne({ userId: interaction.user.id });
    if (!userProfile || userProfile.money >= 5) {
      return interaction.reply({ content: "You need to be broke to eat the rich...!", ephemeral: true });
    }

    const now = Date.now();
    const lastUsed = cooldowns.get(interaction.user.id) || 0;
    if (now - lastUsed < COOLDOWN) {
      const remaining = Math.ceil((COOLDOWN - (now - lastUsed)) / 1000);
      return interaction.reply({ content: `⏱ You must wait ${remaining} seconds before eating the rich again!`, ephemeral: true });
    }

    // Fetch all members of the guild
    const guildMembers = await interaction.guild.members.fetch();
    const memberIds = guildMembers.map(member => member.id);

    // Find top richest user in this guild
    const topProfiles = await Money.find({ userId: { $in: memberIds }, money: { $gt: 0 } })
      .sort({ money: -1 })
      .limit(1);

    if (!topProfiles.length) {
      return interaction.reply({ content: "No rich people to eat! 😢", ephemeral: true });
    }

    const target = topProfiles[0];

    if (target.userId === interaction.user.id) {
      return interaction.reply({ content: "You can't eat yourself! 🤯", ephemeral: true });
    }

    const stealAmount = Math.floor(target.money * 0.01); // 10% of top user's money

    // Update DB
    target.money -= stealAmount;
    userProfile.money += stealAmount;

    await target.save();
    await userProfile.save();

    // Set cooldown
    cooldowns.set(interaction.user.id, now);

    return interaction.reply({
      content: `${interaction.member} 🍴 ate <@${target.userId}> and got 💰 ${stealAmount.toLocaleString()}!`,
      ephemeral: false
    });
  });
};

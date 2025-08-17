const Money = require('../models/currency');

// Cooldowns map: userId => timestamp of last use
const COOLDOWN = 60 * 1000 * 60 * 5; // 1 s
const Cooldown = require('../models/coolDowns');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'eat_the_rich') return;

    // Fetch the user's money profile
    const userProfile = await Money.findOne({ userId: interaction.user.id });
    if (!userProfile || userProfile.money >= 5) {
      return interaction.reply({ content: "You need to be broke to eat the rich...!", ephemeral: true });
    }

    // Check cooldown
    let cdDoc = await Cooldown.findOne({ userId: interaction.member.id });
    if (!cdDoc) {
      cdDoc = new Cooldown({ userId: interaction.member.id, cooldowns: {} });
    }

    const now = Date.now();
    const eatCd = cdDoc.cooldowns.get('eatTheRich');

    if (eatCd && eatCd.getTime() > now) {
      const cdUnix = Math.floor(eatCd.getTime() / 1000); // Discord uses seconds for timestamps
      return i.reply({
        content: `⏳ You must wait <t:${cdUnix}:R> before eating the rich again.`,
        ephemeral: true
      });
    }

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
    cdDoc.cooldowns.set('eatTheRich', new Date(now + COOLDOWN));
    await cdDoc.save();

    return interaction.reply({
      content: `You 🍴 ate <@${target.userId}> and got 💰 ${stealAmount.toLocaleString()}!`,
      ephemeral: true
    });
  });
};

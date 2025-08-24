const Money = require('../../models/currency');

// Cooldowns map: userId => timestamp of last use
const COOLDOWN = 60 * 1000 * 60 * 5; // 5 minutes
const Cooldown = require('../../models/coolDowns');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // Check if interaction is still valid
    if (interaction.replied || interaction.deferred) {
      console.log('Interaction already handled:', interaction.customId);
      return;
    }

    const { customId, user, member } = interaction;

    // =========================
    // EAT THE RICH LOGIC
    // =========================
    if (customId === 'eat_the_rich') {
      // Wrap in try-catch to handle timeouts
      try {
      // Defer early for database operations
      const startTime = Date.now();
      
      const userProfile = await Money.findOne({ userId: user.id });
      if (!userProfile || userProfile.money >= 5) {
        return interaction.reply({ content: "You need to be broke to eat the rich...!", ephemeral: true });
      }

      // Check if we're approaching timeout (2.5 seconds to be safe)
      if (Date.now() - startTime > 2500) {
        return interaction.reply({ content: "⏱️ Operation took too long, please try again.", ephemeral: true });
      }
      
      // Check cooldown
      let cdDoc = await Cooldown.findOne({ userId: member.id });
      if (!cdDoc) cdDoc = new Cooldown({ userId: member.id, cooldowns: {} });

      const now = Date.now();
      const eatCd = cdDoc.cooldowns.get('eatTheRich');

      if (eatCd && eatCd.getTime() > now) {
        const cdUnix = Math.floor(eatCd.getTime() / 1000);
        return interaction.reply({
          content: `⏳ You must wait <t:${cdUnix}:R> before eating the rich again.`,
          ephemeral: true
        });
      }

      // Fetch all members of the guild
      const guildMembers = await interaction.guild.members.fetch();
      const memberIds = guildMembers.map(m => m.id);

      // Find richest user
      const topProfiles = await Money.find({ userId: { $in: memberIds }, money: { $gt: 0 } })
        .sort({ money: -1 })
        .limit(1);

      if (!topProfiles.length) {
        return interaction.reply({ content: "No rich people to eat! 😢", ephemeral: true });
      }

      const target = topProfiles[0];
      if (target.userId === user.id) {
        return interaction.reply({ content: "You can't eat yourself! 🤯", ephemeral: true });
      }

      const stealAmount = Math.floor(target.money * 0.01); // 1% of top user's money

      target.money -= stealAmount;
      userProfile.money += stealAmount;

      await target.save();
      await userProfile.save();

      cdDoc.cooldowns.set('eatTheRich', new Date(now + COOLDOWN));
      await cdDoc.save();

      return interaction.reply({
        content: `You 🍴 ate <@${target.userId}> and got 💰 ${stealAmount.toLocaleString()}!`,
        ephemeral: true
      });
      } catch (error) {
        console.error('Error in eat_the_rich:', error);
        // Try to respond if we haven't already
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
        }
      }
    }

    // =========================
    // DONATE TO JAIRUS LOGIC
    // =========================
    if (customId === 'donate_jairus') {
      // Defer immediately to avoid timeout
      try {
        await interaction.deferReply({ ephemeral: false });
      } catch (error) {
        console.error('Failed to defer reply:', error);
        return; // Exit if we can't defer
      }
      const donorId = interaction.user.id;
      const recipientId = '185261455208218624';

      // Add try-catch for the entire operation
      try {
        // Fetch donor profile
        const donorProfile = await Money.findOne({ userId: donorId });
      if (!donorProfile || donorProfile.money < 10000) {
        return interaction.editReply({ content: "You don't have enough money to donate!" });
      }

      // Atomic transfer using session/transaction
      const session = await Money.startSession();
      session.startTransaction();
      try {
        donorProfile.money -= 10000;
        await donorProfile.save({ session });

        const recipientProfile = await Money.findOne({ userId: recipientId });
        if (recipientProfile) {
          recipientProfile.money += 10000;
          await recipientProfile.save({ session });
        } else {
          // Create recipient profile if doesn't exist
          await Money.create([{ userId: recipientId, money: 1 }], { session });
        }

        await session.commitTransaction();
        session.endSession();
        
        const msg = await interaction.channel.send('https://tenor.com/view/broke-wallet-i-am-broke-no-money-no-cash-gif-24120042');
        setTimeout(() => msg.delete().catch(() => {}), 5000); // 5000 ms = 5 seconds

        return interaction.editReply({
          content: `✅ Successfully donated 10000 monie to <@${recipientId}>!`,
        });


      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error(err);
        return interaction.editReply({ content: '❌ An error occurred while processing your donation.' }).catch(console.error);
      }
      } catch (error) {
        console.error('Error in donate_jairus:', error);
        // Try to respond if possible
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
        } else if (interaction.deferred) {
          return interaction.editReply({ content: '❌ An error occurred.' }).catch(() => {});
        }
      }
    }

  });
};

// Require the necessary discord.js classes
const fs = require('fs');
const { Client, Events, GatewayIntentBits, ActivityType, PermissionsBitField, Partials } = require('discord.js');
const { token, mongourl } = require('./keys.json');
const GuildConfig = require('./models/GuildConfig');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates], partials: [
  Partials.Channel,
  Partials.Message,
  Partials.Reaction,
  Partials.User,
] });

const mongoose = require('mongoose');

  mongoose.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('connected to mayoDB'))
    .catch((err) => console.log(err));

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'

const registerCommands = require ('./registerCommands');

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

registerCommands;

client.once(Events.ClientReady, async c => {

    client.user.setActivity('tam', { type: ActivityType.Watching });
    console.log(`Ready! Logged in as ${c.user.tag}`);
    client.user.setPresence({ status: "away" });

    // Loop through all guilds your bot is in
    client.guilds.cache.forEach(async guild => {

        // Fetch guild config from MongoDB
        let config = await GuildConfig.findOne({ guildId: guild.id });
        if (!config) {
            config = new GuildConfig({ guildId: guild.id });
            await config.save();
        }

        // FRIENDSHIP ID (optional)
        const friendshipDiscordId = config.friendshipDiscordId;

        // Fetch roll channels dynamically
        const gachaRollChannels = await Promise.all(
            config.gachaRollChannelIds.map(id => guild.channels.fetch(id))
        );

        // Fetch parent categories dynamically
        const gachaParentCategories = await Promise.all(
            config.gachaParentCategoryIds.map(id => guild.channels.fetch(id))
        );

        // Example: reset bot nickname
        guild.members.fetchMe()
            .then(me => {
                me.roles.remove('1349292336781197353'); // optional
                me.setNickname('SUPER HELLUNGI');
                console.log('✅ Bot nickname set to default');
            })
            .catch(console.error);

        // Ensure currency profiles
        const ensureMoneyProfilesForGuild = require('./patterns/currency/ensureMoneyProfile');
        ensureMoneyProfilesForGuild(guild);

        // Clean old messages
        const botMessageDeletus = require('./patterns/botMessageCleaner');
        botMessageDeletus(guild);

        // Run gacha GM for this guild
        const gachaGM = require('./patterns/gachaGameMaster');
        gachaGM(guild);

        // Listen for VoiceStateUpdate for all roll channels in this guild
        client.on(Events.VoiceStateUpdate, async (oldMember, newMember) => {

            // Check if user joined any gacha roll channel
            if (config.gachaRollChannelIds.includes(newMember.channelId)) {
                const gachaMachine = require('./patterns/gachaMachine');
                const parentCategory = gachaParentCategories[0]; // or pick the right one
                const rollChannel = gachaRollChannels.find(ch => ch.id === newMember.channelId);
                gachaMachine(newMember, guild, parentCategory, rollChannel);
            }

            // Empty voice check
            if (oldMember.channelId && oldMember.channelId !== newMember.channelId) {
                const channelToCheck = await guild.channels.fetch(oldMember.channelId);
                setTimeout(() => {
                    const emptyVoiceCheck = require('./patterns/emptyVoiceCheck');
                    emptyVoiceCheck(channelToCheck);
                }, 1000 * 5);
            }
        });

    });

});

// Define a collection to store your commands
client.commands = new Map();

// Read the command files and register them
const commandFiles = fs.readdirSync('./commands').filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`Error running command "${interaction.commandName}":`, error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '⚠️ There was an error executing this command.', ephemeral: true });
      } else {
        await interaction.reply({ content: '⚠️ There was an error executing this command.', ephemeral: true });
      }
    } catch (replyErr) {
      console.error('Failed to send error reply:', replyErr);
    }
  }
});

// Log in to Discord with your client's token

client.login(token);
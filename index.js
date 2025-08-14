// Require the necessary discord.js classes
const fs = require('fs');
const { Client, Events, GatewayIntentBits, ActivityType, PermissionsBitField, Partials } = require('discord.js');
const { token, mongourl } = require('./keys.json');

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

  // BASIC BOT START UP
  client.user.setActivity('tam', { type: ActivityType.Watching });
	console.log(`Ready! Logged in as ${c.user.tag}`);
  client.user.setPresence( { status: "away" });

  // GET TARGET DISCORD
  const friendshipGuild = await client.guilds.fetch('1183979706329092236');
  
  // RUN START UP TIDY STUFF

  // reset bot nick name to default
  friendshipGuild.members.fetchMe()
  .then(me => {
    me.setNickname('TAM BOT');
    console.log('✅ Bot nickname set to TAM BOT 2.0');
  })
  .catch (console.error);

  // ensure all members on the server have a currency profile.
  const ensureMoneyProfilesForGuild = require('./patterns/currency/ensureMoneyProfile');
  ensureMoneyProfilesForGuild (friendshipGuild);

  // clean old messages from before the bot started
  const botMessageDeletus = require('./patterns/botMessageCleaner');
  botMessageDeletus(friendshipGuild);

  // gacha roll happening.
  const gachaRollChannel = await friendshipGuild.channels.fetch('1217268929517322261');
  const gachaSpawnParentCategory = await friendshipGuild.channels.fetch('1183979706329092240');

  const gachaGM = require('./patterns/gachaGameMaster');
  gachaGM(friendshipGuild);

  client.on(Events.VoiceStateUpdate, async (oldMember, newMember) => {
    if (newMember.channel === gachaRollChannel) { // starting channel ID

      const gachaMachine = require ('./patterns/gachaMachine');
      gachaMachine(newMember, friendshipGuild, gachaSpawnParentCategory, gachaRollChannel);

    }

    // if user goes to a different discord vc or left vc call a function file which checks the activevc mongodb if the vc the user left is on the database. If so, perform a check for if no one is left on the vc and then delete vc if so.

    if (oldMember.channelId && oldMember.channelId !== newMember.channelId) {

      const channelToCheck = await friendshipGuild.channels.fetch(oldMember.channelId);

      setTimeout(() => {
          const emptyVoiceCheck = require('./patterns/emptyVoiceCheck');
          emptyVoiceCheck(channelToCheck);
      }, 1000); // 3 seconds delay
      
    }
    
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
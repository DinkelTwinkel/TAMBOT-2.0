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

  client.user.setActivity('tam', { type: ActivityType.Watching });

	console.log(`Ready! Logged in as ${c.user.tag}`);
  client.user.setPresence( { status: "away" });

  const friendshipGuild = await client.guilds.fetch('1183979706329092236');

  try {
    const me = await friendshipGuild.members.fetchMe();
    await me.setNickname('TAM BOT');
    console.log('✅ Bot nickname set to TAM BOT 2.0');
  } catch (error) {
    console.error('❌ Failed to set nickname:', error);
  }
  
});

// gacha roll happening.

client.on(Events.VoiceStateUpdate, async (oldMember, newMember) => {
  if (newMember.channelId === '1217268929517322261') { // starting channel ID

    // send to gacha roll handler.

  }
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
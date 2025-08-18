// Require the necessary discord.js classes
const fs = require('fs');
const { Client, Events, GatewayIntentBits, ActivityType, PermissionsBitField, Partials } = require('discord.js');
const { token, mongourl, targetGuildId } = require('./keys.json');
const GuildConfig = require('./models/GuildConfig');
const CurrencyProfile = require('./models/currency');
const ensureMoneyProfilesForGuild = require('./patterns/currency/ensureMoneyProfile');
const botMessageDeletus = require('./patterns/botMessageCleaner');
const gachaGM = require('./patterns/gachaGameMaster');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates], partials: [
  Partials.Channel,
  Partials.Message,
  Partials.Reaction,
  Partials.User,
] });

const registerCommands = require ('./registerCommands');

const mongoose = require('mongoose');

  mongoose.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('connected to mayoDB'))
    .then (registerCommands)
    .catch((err) => console.log(err));

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const { scanMagentaPixels, getMagentaCoordinates } = require('./fileStoreMapData');
scanMagentaPixels();

let shopHandler;

client.once(Events.ClientReady, async c => {

    client.user.setActivity('SUPER HELLUNGI', { type: ActivityType.Playing });
    console.log(`Ready! Logged in as ${c.user.tag}`);
    client.user.setPresence({ status: "away" });
    
    const ensureMoneyProfilesForGuild = require('./patterns/currency/ensureMoneyProfile');
    const botMessageDeletus = require('./patterns/botMessageCleaner');
    const gachaGM = require('./patterns/gachaGameMaster');

    //Global Listeners:
    const eatTheRichListener = require('./patterns/eatTheRich');
    eatTheRichListener(client);
    const ShopHandler = require('./patterns/shopHandler'); 

    console.log('✅ Centralized shop handler initialized');

    // Loop through all guilds your bot is in
    client.guilds.cache.forEach(async guild => {

        if (guild.id !== targetGuildId) return console.log ('skipping guild: ' + guild.id);
        shopHandler = new ShopHandler(client, guild.id);

        // Fetch guild config from MongoDB
        let config = await GuildConfig.findOne({ guildId: guild.id });
        if (!config) {
            config = new GuildConfig({ guildId: guild.id });
            await config.save();
        }

        // FRIENDSHIP ID (optional)
        const friendshipDiscordId = config.friendshipDiscordId;

        // Fetch roll channels safely
        const gachaRollChannels = [];
        for (const id of config.gachaRollChannelIds || []) {
            try {
                const ch = await guild.channels.fetch(id);
                if (ch) gachaRollChannels.push(ch);
            } catch (err) {
                console.warn(`⚠️ Channel ${id} not found in guild ${guild.id}, skipping.`);
            }
        }

        // Fetch parent categories safely
        const gachaParentCategories = [];
        for (const id of config.gachaParentCategoryIds || []) {
            try {
                const ch = await guild.channels.fetch(id);
                if (ch && ch.type === 4) gachaParentCategories.push(ch); // 4 = CategoryChannel type
            } catch (err) {
                console.warn(`⚠️ Category ${id} not found in guild ${guild.id}, skipping.`);
            }
        }

        // Reset bot nickname
        guild.members.fetchMe()
            .then(me => {
                me.roles.remove('1349292336781197353').catch(() => {});
                // me.setNickname('SUPER HELLUNGI').catch(() => {});
                console.log('✅ Bot nickname set to default');
            })
            .catch(console.error);

        // // Ensure currency profiles
        // ensureMoneyProfilesForGuild(guild);

        // Clean old messages
        botMessageDeletus(guild);

        // Run gacha GM for this guild
        gachaGM(guild);

        // Listen for VoiceStateUpdate for this guild
        client.on(Events.VoiceStateUpdate, async (oldMember, newMember) => {

            // Check if user joined any gacha roll channel
            if (newMember.channelId && config.gachaRollChannelIds.includes(newMember.channelId)) {
                const gachaMachine = require('./patterns/gachaMachine');
                const parentCategory = gachaParentCategories[0] || null;
                const rollChannel = gachaRollChannels.find(ch => ch.id === newMember.channelId) || null;
                if (parentCategory && rollChannel) {
                    gachaMachine(newMember, guild, parentCategory, rollChannel);
                }
            }

            // Empty voice check
            if (oldMember.channelId && oldMember.channelId !== newMember.channelId) {
                try {
                    const channelToCheck = await guild.channels.fetch(oldMember.channelId);
                    setTimeout(() => {
                        const emptyVoiceCheck = require('./patterns/emptyVoiceCheck');
                        emptyVoiceCheck(channelToCheck);
                    }, 1000 * 5);
                } catch (err) {
                    console.warn(`⚠️ Old channel ${oldMember.channelId} not found, skipping empty voice check.`);
                }
            }
        });

    });

});

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        // Check if the user already has a profile in this guild
        let profile = await CurrencyProfile.findOne({ userId: member.id });

        if (!profile) {
            // Create a new profile with a starting balance of 5
            profile = new CurrencyProfile({
                userId: member.id,
                usertag: member.user.tag,
                money: 5
            });
            await profile.save();

            console.log(`✅ Created a new currency profile for ${member.user.tag} with balance 5`);
        } else {
            console.log(`ℹ️ Currency profile already exists for ${member.user.tag}`);
        }
    } catch (err) {
        console.error(`⚠️ Failed to create currency profile for ${member.user.tag}:`, err);
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
  if (interaction.guild.id !== targetGuildId) return;

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
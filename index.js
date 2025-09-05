
require("dotenv").config();
const OpenAI = require("openai");
// Require the necessary discord.js classes
const fs = require('fs');
const { Client, Events, GatewayIntentBits, ActivityType, PermissionsBitField, Partials } = require('discord.js');
const { token, mongourl, targetGuildId } = require('./keys.json');
const GuildConfig = require('./models/GuildConfig');
const CurrencyProfile = require('./models/currency');
const ensureMoneyProfilesForGuild = require('./patterns/currency/ensureMoneyProfile');
const botMessageDeletus = require('./patterns/botMessageCleaner');
const gachaGM = require('./patterns/gachaGameMaster');

const { 
    initializeStatTracking, 
    setupVoiceTracking, 
    setupMessageTracking, 
    getQuickStats,
    getUserStats,
    getAllUserVoiceHours,
    cleanupTracking 
} = require('./trackingIntegration');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates], partials: [
  Partials.Channel,
  Partials.Message,
  Partials.Reaction,
  Partials.User,
] });

const registerCommands = require ('./registerCommands');

const mongoose = require('mongoose');

  mongoose.connect(process.env.MONGODB_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    // Performance optimizations
    maxPoolSize: 10,        // Maximum connections in pool
    minPoolSize: 2,         // Minimum connections to maintain
    socketTimeoutMS: 45000, // Socket timeout
    serverSelectionTimeoutMS: 5000, // Server selection timeout
  })
    .then(() => console.log('connected to mayoDB with optimized settings'))
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

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await cleanupTracking();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await cleanupTracking();
  client.destroy();
  process.exit(0);
});

const { scanMagentaPixels, getMagentaCoordinates } = require('./fileStoreMapData');
const inventory = require('./models/inventory');
scanMagentaPixels();

let shopHandler;

client.once(Events.ClientReady, async c => {

    // const testPick = require('./patterns/gachaModes/test_pickaxe_durability.js');
    // testPick.testPickaxeDurability();

    // Now initialize stat tracking:
    await initializeStatTracking(client);
    setupVoiceTracking(client);
    setupMessageTracking(client);

    client.user.setActivity('SUPER HELLUNGI', { type: ActivityType.Playing });
    console.log(`Ready! Logged in as ${c.user.tag}`);
    client.user.setPresence({ status: "away" });
    
    const ensureMoneyProfilesForGuild = require('./patterns/currency/ensureMoneyProfile');
    await removeDuplicateInventoryItems();
    const botMessageDeletus = require('./patterns/botMessageCleaner');
    const gachaGM = require('./patterns/gachaGameMaster');

    //Global Listeners:
    const eatTheRichListener = require('./patterns/misc/eatTheRich');
    eatTheRichListener(client);
    const ShopHandler = require('./patterns/shopHandler');
    const ItemTransferHandler = require('./patterns/itemTransferHandler');
    const ItemUseHandler = require('./patterns/itemUseHandler');
    const TitleEquipHandler = require('./patterns/titleEquipHandler'); 

    console.log('✅ Centralized shop handler initialized');

    // Loop through all guilds your bot is in
    client.guilds.cache.forEach(async guild => {

        //if (guild.id !== targetGuildId) return console.log ('skipping guild: ' + guild.id);
        shopHandler = new ShopHandler(client, guild.id);
        
        // Initialize item transfer handler for this guild
        const itemTransferHandler = new ItemTransferHandler(client, guild.id);
        console.log(`✅ Item transfer handler initialized for guild: ${guild.name}`);
        
        // Initialize item use handler for this guild
        const itemUseHandler = new ItemUseHandler(client, guild.id);
        console.log(`✅ Item use handler initialized for guild: ${guild.name}`);
        
        // Initialize title equip handler for this guild
        const titleEquipHandler = new TitleEquipHandler(client, guild.id);
        console.log(`✅ Title equip handler initialized for guild: ${guild.name}`);

        // Fetch guild config from MongoDB
        let config = await GuildConfig.findOne({ guildId: guild.id });
        if (!config) {

            return;
            //config = new GuildConfig({ guildId: guild.id });
            //await config.save();
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

/**
 * Removes duplicate items in all player inventories
 */
async function removeDuplicateInventoryItems() {
    try {
        const allInventories = await inventory.find();

        for (const inv of allInventories) {
            const seen = new Map(); // Map<itemId, totalQuantity>
            const cleanedItems = [];

            for (const item of inv.items) {
                if (seen.has(item.itemId)) {
                    // Aggregate quantity if you want to keep one entry
                    const currentQty = seen.get(item.itemId);
                    seen.set(item.itemId, currentQty + item.quantity);
                } else {
                    seen.set(item.itemId, item.quantity);
                }
            }

            // Rebuild items array from Map
            for (const [itemId, quantity] of seen.entries()) {
                cleanedItems.push({ itemId, quantity });
            }

            // Only update if there was a change
            if (cleanedItems.length !== inv.items.length) {
                inv.items = cleanedItems;
                await inv.save();
                console.log(`Cleaned duplicates for player ${inv.playerId}`);
            }
        }

        console.log('Inventory deduplication complete.');
    } catch (err) {
        console.error('Error cleaning inventories:', err);
    }
}

// Handle when bot joins a new guild
client.on(Events.GuildCreate, async (guild) => {
    const ShopHandler = require('./patterns/shopHandler');
    const ItemTransferHandler = require('./patterns/itemTransferHandler');
    const ItemUseHandler = require('./patterns/itemUseHandler');
    const TitleEquipHandler = require('./patterns/titleEquipHandler');
    
    // Initialize handlers for the new guild
    new ShopHandler(client, guild.id);
    new ItemTransferHandler(client, guild.id);
    new ItemUseHandler(client, guild.id);
    new TitleEquipHandler(client, guild.id);
    console.log(`✅ Initialized handlers for new guild: ${guild.name} (${guild.id})`);
});

// Handle when bot leaves a guild
client.on(Events.GuildDelete, async (guild) => {
    // Cleanup shop handler
    if (client.shopHandlers && client.shopHandlers.has(guild.id)) {
        const shopHandler = client.shopHandlers.get(guild.id);
        shopHandler.cleanup();
        console.log(`✅ Shop handler cleaned up for guild: ${guild.id}`);
    }
    
    // Cleanup item transfer handler
    if (client.itemTransferHandlers && client.itemTransferHandlers.has(guild.id)) {
        const itemTransferHandler = client.itemTransferHandlers.get(guild.id);
        itemTransferHandler.cleanup();
        console.log(`✅ Item transfer handler cleaned up for guild: ${guild.id}`);
    }
    
    // Cleanup item use handler
    if (client.itemUseHandlers && client.itemUseHandlers.has(guild.id)) {
        const itemUseHandler = client.itemUseHandlers.get(guild.id);
        itemUseHandler.cleanup();
        console.log(`✅ Item use handler cleaned up for guild: ${guild.id}`);
    }
    
    // Cleanup title equip handler
    if (client.titleEquipHandlers && client.titleEquipHandlers.has(guild.id)) {
        const titleEquipHandler = client.titleEquipHandlers.get(guild.id);
        titleEquipHandler.cleanup();
        console.log(`✅ Title equip handler cleaned up for guild: ${guild.id}`);
    }
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
  //if (interaction.guild.id !== targetGuildId) return;

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

client.login(process.env.DISCORD_TOKEN);
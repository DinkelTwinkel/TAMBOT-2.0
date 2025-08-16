const { REST, Routes } = require('discord.js');
const { clientId, token, mongourl } = require('./keys.json'); // Use mongourl from keys.json
const fs = require('fs');
const mongoose = require('mongoose');
const GuildConfig = require('./models/GuildConfig'); // Your GuildConfig schema

// Load command files
const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    // Fetch all guild IDs from GuildConfig
    const guildConfigs = await GuildConfig.find({});
    const guildIds = guildConfigs.map(config => config.guildId);

    for (const guildId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`Successfully reloaded commands for guild ${guildId}`);
    }

    console.log(`Finished registering commands for ${guildIds.length} guild(s).`);
  } catch (error) {
    console.error(error);
  }
})();

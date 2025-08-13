const { REST, Routes } = require('discord.js');
const { clientId, token, guildId } = require('./keys.json'); // Create a config.json file to store your client ID and token
const fs = require('fs');

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      // If you want to register commands globally, use the following line:
      // Routes.applicationCommands(clientId),

      // If you want to register commands for a specific guild, use the following line:
      Routes.applicationGuildCommands(clientId, '1183979706329092236'),
      { body: commands },
    );

    console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
  }
  catch (error) {
    console.error(error);
  }
})();
// src/bot.js
import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectDatabase } from './data/database.js';
import interactionHandler from './handlers/interactionHandler.js';

// 1) Initialize the Discord client
const client = new Client({
  intents: [ GatewayIntentBits.Guilds ]
});

client.commands = new Collection();

// 2) Recursively load all command modules into client.commands
const commandsPath = path.join(process.cwd(), 'src', 'commands');
async function loadCommands(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await loadCommands(fullPath);
    } else if (entry.name.endsWith('.js')) {
      // Convert full file path to a file:// URL, ensuring ESM loader accepts it
      const fileUrl = pathToFileURL(fullPath).href;
      const module = await import(fileUrl);
      if (module.data && module.execute) {
        client.commands.set(module.data.name, module);
      }
    }
  }
}

// Immediately load all commands at startup
await loadCommands(commandsPath);

// 3) When the bot is ready, register slash commands (guild-only for development)
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // Gather all command JSON data
  const commandJSONs = [];
  client.commands.forEach(cmdModule => {
    commandJSONs.push(cmdModule.data.toJSON());
  });

  // Register them on the specified guild
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('🔄 Registering guild commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commandJSONs }
    );
    console.log('✅ Commands registered.');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
});

// 4) Delegate all incoming interactions (slash commands & buttons) to our handler
client.on('interactionCreate', async interaction => {
  await interactionHandler(interaction, client);
});

// 5) Connect to MongoDB then log in the bot
(async () => {
  await connectDatabase();
  await client.login(process.env.DISCORD_TOKEN);
})();

// src/bot.js
// Entry point for the Discord Bot without command registration logic
import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectDatabase } from './data/database.js';
import interactionHandler from './handlers/interactionHandler.js';

// 1) Initialize the Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
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
      const fileUrl = pathToFileURL(fullPath).href;
      const module = await import(fileUrl);
      if (module.data && module.execute) {
        client.commands.set(module.data.name, module);
      }
    }
  }
}
await loadCommands(commandsPath);

// 3) Log when the bot is ready
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// 4) Delegate interactions to our handler
client.on('interactionCreate', async interaction => {
  await interactionHandler(interaction, client);
});

// 5) Connect to MongoDB then login
(async () => {
  await connectDatabase();
  await client.login(process.env.DISCORD_TOKEN);
})();

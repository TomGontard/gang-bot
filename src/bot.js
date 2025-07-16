// src/bot.js
import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import cron from 'node-cron';
import { connectDatabase } from './data/database.js';
import interactionHandler from './handlers/interactionHandler.js';
import metrics from './config/metrics.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// load all commands
async function loadCommands(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await loadCommands(full);
    else if (e.name.endsWith('.js')) {
      const mod = await import(pathToFileURL(full).href);
      if (mod.data && mod.execute) client.commands.set(mod.data.name, mod);
    }
  }
}
await loadCommands(path.join(process.cwd(), 'src', 'commands'));

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // schedule our loot drops
  cron.schedule(metrics.lootConfig.cron, async () => {
    try {
      const { channelId, roles, messages } = metrics.lootConfig;
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) return;

      // pick a random loot event
      const idx = Math.floor(Math.random() * messages.length);
      const { text } = messages[idx];

      // build the “Claim” button
      const claimBtn = new ButtonBuilder()
        .setCustomId(`claimLoot:${idx}`)
        .setLabel('Claim Loot')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(claimBtn);

      // ping all faction roles
      const mention = roles.map(r => `<@&${r}>`).join(' ');
      await channel.send({ content: `${mention}\n${text}`, components: [row] });
    } catch (err) {
      console.error('Error scheduling loot drop:', err);
    }
  });
});

client.on('interactionCreate', async interaction => {
  await interactionHandler(interaction, client);
});

(async () => {
  await connectDatabase();
  await client.login(process.env.DISCORD_TOKEN);
})();

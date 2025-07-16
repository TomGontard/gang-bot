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
import { createEmbed } from './utils/createEmbed.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// 1) Load all slash commands into client.commands
async function loadCommands(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await loadCommands(full);
    } else if (entry.name.endsWith('.js')) {
      const mod = await import(pathToFileURL(full).href);
      if (mod.data && mod.execute) {
        client.commands.set(mod.data.name, mod);
      }
    }
  }
}
await loadCommands(path.join(process.cwd(), 'src', 'commands'));

// 2) When ready, schedule loot drops
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  cron.schedule(metrics.lootConfig.cron, async () => {
    try {
      const { channelId, roles, messages } = metrics.lootConfig;
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) return;

      // Pick a random loot event
      const idx = Math.floor(Math.random() * messages.length);
      const { text } = messages[idx];

      // Build claim button
      const claimBtn = new ButtonBuilder()
        .setCustomId(`claimLoot:${idx}`)
        .setLabel('Claim Loot')
        .setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(claimBtn);

      // Prepare the role mentions in content (outside embed)
      const mention = roles.map(id => `<@&${id}>`).join(' ');

      // Build a clean embed
      const embed = createEmbed({
        title: '💥 A Wild Shipment Has Appeared!',
        description: text,
        timestamp: true
      });

      // Send message with content for pings, plus embed below
      await channel.send({
        content: mention,
        embeds: [embed],
        components: [row]
      });
    } catch (err) {
      console.error('Error scheduling loot drop:', err);
    }
  });

});

// 3) Delegate all interactions
client.on('interactionCreate', interaction => interactionHandler(interaction, client));

// 4) Connect DB + login
(async () => {
  await connectDatabase();
  await client.login(process.env.DISCORD_TOKEN);
})();

// src/bot.js
import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectDatabase } from './data/database.js';
import interactionHandler from './handlers/interactionHandler.js';
import { sendLootDrop } from './services/lootService.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Charge toutes les commandes
async function loadCommands(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await loadCommands(full);
    } else if (entry.name.endsWith('.js')) {
      const mod = await import(pathToFileURL(full).href);
      if (mod.data && mod.execute) client.commands.set(mod.data.name, mod);
    }
  }
}
await loadCommands(path.join(process.cwd(), 'src', 'commands'));

// Planificateur aléatoire 4–8 h
let lootTimer = null;
function randomDelayMs(minHours = 4, maxHours = 8) {
  const min = minHours * 60 * 60 * 1000;
  const max = maxHours * 60 * 60 * 1000;
  return Math.floor(min + Math.random() * (max - min));
}

function scheduleNextRandomLoot() {
  const delay = randomDelayMs(4, 8);
  const h = Math.floor(delay / 3600000);
  const m = Math.floor((delay % 3600000) / 60000);
  console.log(`⏱️ Next random loot in ~${h}h${m ? ` ${m}m` : ''}…`);
  lootTimer = setTimeout(async () => {
    try {
      const res = await sendLootDrop(client);
      if (res) console.log(`📦 Loot sent (idx: ${res.idx}, msg: ${res.messageId}).`);
      else console.warn('⚠️ Loot send failed.');
    } catch (e) {
      console.error('❌ Error sending random loot:', e);
    } finally {
      scheduleNextRandomLoot(); // boucle
    }
  }, delay);
}

// Ready
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  scheduleNextRandomLoot();
});

// Interactions
client.on('interactionCreate', interaction => interactionHandler(interaction, client));

// DB + Login
(async () => {
  await connectDatabase();
  await client.login(process.env.DISCORD_TOKEN);
})();

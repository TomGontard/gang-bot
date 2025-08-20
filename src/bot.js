import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import cron from 'node-cron';

import { connectDatabase } from './data/database.js';
import interactionHandler from './handlers/interactionHandler.js';
import { sendLootDrop } from './services/lootService.js';
import { ensureMapInitialized } from './services/territoryService.js';
import Territory from './data/models/Territory.js';
import { resolveAttackIfDue } from './services/warService.js';

// ⬇️ Payout intérêts & revenus (banque de faction)
import { dailyFactionPayoutUTC } from './services/bankService.js';
// ⬇️ Redistribution quotidienne des dons (75/25)
import { runDailyDonationRedistribution } from './services/donationService.js';

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

// Planificateur aléatoire (loot)
let lootTimer = null;
function randomDelayMs(minHours = 3, maxHours = 6) {
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
      scheduleNextRandomLoot();
    }
  }, delay);
}

// Ready
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await ensureMapInitialized();
  scheduleNextRandomLoot();

  // Résolution des attaques échues (toutes les 5 min)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const due = await Territory.find({ 'attack.endAt': { $lte: new Date() } }, { key: 1 });
      for (const t of due) {
        const res = await resolveAttackIfDue(t.key);
        if (res) console.log(`⚔️ Resolved ${t.key}: ${res.captured ? 'captured' : 'defended'}`);
      }
    } catch (e) { console.error('Resolve attacks job:', e); }
  });

  // Payout quotidien (UTC 00:05) — intérêts "dupliqués" par joueur + rapport par faction
  cron.schedule('5 0 * * *', async () => {
    try {
      await dailyFactionPayoutUTC(client);
      console.log('💰 Daily faction payout executed + reports sent.');
    } catch (e) {
      console.error('Daily payout error:', e);
    }
  });

  // Redistribution quotidienne des dons (UTC 12:00) + bilan dans CHANNEL_BOT_ID
  cron.schedule('0 12 * * *', async () => {
    try {
      await runDailyDonationRedistribution(client);
      console.log('📊 Daily donation redistribution executed.');
    } catch (e) {
      console.error('Donation redistribution error:', e);
    }
  });
});

// Interactions
client.on('interactionCreate', interaction => interactionHandler(interaction, client));

// DB + Login
(async () => {
  await connectDatabase();
  await client.login(process.env.DISCORD_TOKEN);
})();

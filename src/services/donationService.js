// src/services/donationService.js
import FactionBank from '../data/models/FactionBank.js';
import Player from '../data/models/Player.js';
import factionsConfig from '../config/factions.js';
import { createEmbed } from '../utils/createEmbed.js';

// util
function getDisplayName(name){ return factionsConfig.find(f=>f.name===name)?.displayName || name; }
async function getOrCreateBank(f){ return (await FactionBank.findOne({ faction:f })) || (await FactionBank.create({ faction:f })); }

// ✅ Dépôt en trésorerie (75% trésorerie immédiat, 25% tax → redistribution à 12:00)
export async function depositToFactionTreasury({ depositorId, amount }) {
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid amount.');

  const player = await Player.findOne({ discordId: depositorId });
  if (!player?.faction) throw new Error('Join a faction first.');
  if ((player.coins || 0) < amt) throw new Error('Insufficient funds.');

  const bank = await getOrCreateBank(player.faction);

  const tax = Math.floor(amt * 0.25);
  const net = amt - tax;

  player.coins = (player.coins || 0) - amt;
  bank.treasury = (bank.treasury || 0) + net;
  bank.dailyDonationRedistributable = (bank.dailyDonationRedistributable || 0) + tax;

  await Promise.all([player.save(), bank.save()]);

  return {
    faction: player.faction,
    amount: amt,
    netToTreasury: net,
    taxToPool: tax,
    newTreasury: bank.treasury
  };
}

/**
 * Enregistre un don (75% plateforme / 25% pool autres factions, distribué à 12:00 UTC)
 */
export async function recordFactionDonation({ donorId, amount }) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount.');

  const donor = await Player.findOne({ discordId: donorId });
  if (!donor?.faction) throw new Error('Join a faction first.');
  if ((donor.coins||0) < amount) throw new Error('Insufficient funds.');

  donor.coins -= amount;

  const bank = await getOrCreateBank(donor.faction);
  const platformCut = Math.floor(amount * 0.75);
  const redistrib    = amount - platformCut; // 25% (gère l’arrondi)

  bank.dailyDonationGross           = (bank.dailyDonationGross||0) + amount;
  bank.dailyDonationPlatformCut     = (bank.dailyDonationPlatformCut||0) + platformCut;
  bank.dailyDonationRedistributable = (bank.dailyDonationRedistributable||0) + redistrib;

  await Promise.all([ donor.save(), bank.save() ]);

  return { faction: donor.faction, amount, platformCut, redistrib };
}

/**
 * CRON quotidien 12:00 UTC — redistribue le 25% à toutes les AUTRES factions
 */
export async function runDailyDonationRedistribution(client){
  const channelId = process.env.CHANNEL_BOT_ID;
  const banks = await FactionBank.find();
  const factionNames = factionsConfig.map(f => f.name); // e.g. ['Red','Blue','Green']

  const sections = [];

  for (const bank of banks){
    const donorFaction = bank.faction;
    const gross    = bank.dailyDonationGross || 0;
    const platform = bank.dailyDonationPlatformCut || 0;
    const pool     = bank.dailyDonationRedistributable || 0;

    // Count recipients by (non-donor) faction
    const recipientsByFaction = {};
    for (const f of factionNames){
      if (f !== donorFaction){
        recipientsByFaction[f] = await Player.countDocuments({ faction: f });
      }
    }
    const recipientsTotal = Object.values(recipientsByFaction).reduce((a,b)=>a+b,0);

    // Payout equally per player across ALL non-donor factions
    let per = 0, paid = 0, leftover = 0;
    if (pool > 0 && recipientsTotal > 0){
      per = Math.floor(pool / recipientsTotal);
      if (per > 0){
        await Player.updateMany({ faction: { $ne: donorFaction } }, { $inc: { coins: per } });
        paid = per * recipientsTotal;
      }
      leftover = pool - paid; // remainder → platform carry
      bank.dailyDonationPlatformCut = (bank.dailyDonationPlatformCut||0) + leftover;
    }

    // Build the section text
    const lines = [];
    lines.push(
      `• **${getDisplayName(donorFaction)}** — Gross: **${gross}** | ` +
      `Platform (75% + carry): **${(platform||0)}** | ` +
      `25% pool: **${pool}** → Recipients: **${recipientsTotal}** • Per player: **${per}** • Distributed: **${paid}**`
    );

    for (const [f, count] of Object.entries(recipientsByFaction)){
      const totalToFaction = per * count;
      lines.push(`  - To **${getDisplayName(f)}** (${count} players): **+${per}** each → **${totalToFaction}** total`);
    }

    sections.push(lines.join('\n'));

    // Reset daily counters
    bank.dailyDonationGross = 0;
    bank.dailyDonationPlatformCut = 0;
    bank.dailyDonationRedistributable = 0;
    bank.lastDonationResetAt = new Date();
    await bank.save();
  }

  // Post summary panel
  if (client && channelId){
    try{
      const ch = await client.channels.fetch(channelId);
      if (ch?.isTextBased()){
        const explainer =
          '25% of all **donations made by players of a faction** are redistributed **daily at 12:00 UTC** to ' +
          'players in the **other factions** (equal per player).';

        const description = sections.length
          ? `${explainer}\n\n${sections.join('\n\n')}`
          : `${explainer}\n\n_No donations to process today._`;

        const embed = createEmbed({
          title: '📊 Daily Donation Redistribution (12:00 UTC)',
          description,
          timestamp: true
        });
        await ch.send({ embeds: [embed] });
      }
    }catch(e){ console.error('Donation report send failed:', e); }
  }
}

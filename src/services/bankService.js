// src/services/bankService.js
import FactionBank from '../data/models/FactionBank.js';
import Territory from '../data/models/Territory.js';
import Player from '../data/models/Player.js';
import metrics from '../config/metrics.js';
import { calculateTotalStats } from './itemService.js';
import { createEmbed } from '../utils/createEmbed.js';

async function getOrCreateBank(faction){
  let b = await FactionBank.findOne({ faction });
  if (!b) b = await FactionBank.create({ faction });
  return b;
}

export async function computeFactionAPR(faction){
  const players = await Player.find({ faction });
  let sumLuck = 0;
  for (const p of players){
    const s = await calculateTotalStats(p);
    sumLuck += (s.chance || 0);
  }
  const tiles = await Territory.find({ owner: faction });
  for (const t of tiles){
    if (t.building?.type === 'casino'){
      sumLuck += t.building.level * (metrics.faction.territory.buildings.casino.luckAuraPerLevel || 0);
    }
  }
  // APR (décimal) = Total Luck / 100  → APR% = Total Luck
  return sumLuck / 100;
}

export async function dailyFactionPayoutUTC(client){
  const factions = ['Red','Blue','Green'];
  const { baseDailyPerTile, buildings, fort } = metrics.faction.territory;

  for (const f of factions){
    const bank = await getOrCreateBank(f);
    const tiles = await Territory.find({ owner: f });
    const membersCount = await Player.countDocuments({ faction: f });

    // (1) Revenu JOURNALIER → TRÉSORERIE UNIQUEMENT
    let dailyIncome = tiles.length * baseDailyPerTile;
    for (const t of tiles){
      if (t.building?.type){
        const bCfg = buildings[t.building.type] || {};
        dailyIncome += (bCfg.coinPerLevel || 0) * (t.building.level || 0);
      }
    }
    bank.treasury = (bank.treasury || 0) + dailyIncome;

    // (2) Intérêt "minté" pour les joueurs (trésorerie inchangée)
    const apr = await computeFactionAPR(f); // ex: 3.65 → 365%
    const perPlayerInterest = Math.floor((bank.treasury || 0) * (apr / 365));
    if (membersCount > 0 && perPlayerInterest > 0){
      await Player.updateMany({ faction: f }, { $inc: { coins: perPlayerInterest } });
    }
    await bank.save();

    // (3) Rapport (optionnel)
    try{
      const envKey = `CHANNEL_${f.toUpperCase()}_ID`;
      const channelId = process.env[envKey];
      if (client && channelId){
        const ch = await client.channels.fetch(channelId);
        if (ch?.isTextBased()){
          const fortForce = tiles.reduce((s,t)=> s + (t.fortLevel||0) * (fort?.forcePerLevel||0), 0);
          const embed = createEmbed({
            title: `📅 Daily Faction Report — ${f}`,
            description:
              `Territories: **${tiles.length}**\n` +
              `Income → Treasury (tiles+buildings): **${dailyIncome}**\n` +
              `APR: **${(apr*100).toFixed(2)}%** → Interest per player: **${perPlayerInterest}** *(minted; treasury unchanged)*\n` +
              `Treasury (after income): **${bank.treasury}**\n` +
              `Forts flat force: **${fortForce}**`,
            timestamp: true
          });
          await ch.send({ embeds:[embed] });
        }
      }
    }catch(e){ console.error('Daily faction report failed:', e); }
  }
}
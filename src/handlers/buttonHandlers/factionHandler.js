import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

import Player from '../../data/models/Player.js';
import Territory from '../../data/models/Territory.js';
import FactionBank from '../../data/models/FactionBank.js';

import { getNFTCount } from '../../services/nftService.js';
import { canJoinFaction, assignFactionToPlayer, removePlayerFromFaction } from '../../services/factionService.js';
import {
  ensureMapInitialized,
  calcDefMax,
  joinDefense,
  leaveDefense,
  isPlayerBusy,
  buildingUpgradeCost,
  fortUpgradeCost
} from '../../services/territoryService.js';

import { startAttack, joinAttack } from '../../services/warService.js';
import { computeFactionAPR } from '../../services/bankService.js';
import { calculateTotalStats } from '../../services/itemService.js';

import metrics from '../../config/metrics.js';
import factionsConfig from '../../config/factions.js';
import { createEmbed } from '../../utils/createEmbed.js';

const OPEN    = 'openFactions';
const SELECT  = 'selectFaction';
const CONFIRM = 'confirmFactionLeave';
const FINAL   = 'finalFactionLeave';

const F_STATS        = 'fStats';
const F_MAP_SELECT   = 'fMap';
const F_DEF_JOIN     = 'fDefJoin';
const F_DEF_LEAVE    = 'fDefLeave';
const F_ATK_START    = 'fAtkStart';
const F_ATK_JOIN     = 'fAtkJoin';
const F_BUILD_MENU   = 'fBuild';
const F_BUILD_CHOOSE = 'fBuildChoose';
const F_BUILD_UP     = 'fBuildUp';
const F_BUILD_DEST   = 'fBuildDestroy';
const F_FORT_UP      = 'fFortUp';
const F_BANK_DEP_OPEN= 'fBankDepositOpen';
const F_GUIDE        = 'fGuide';

// 🗳 Manager election
const F_MGR_START    = 'fMgrStart';
const F_MGR_VOTE     = 'fMgrVote';
const F_MGR_FINALIZE = 'fMgrFinalize';

const hrs = n => n*60*60*1000;
const ts  = d => Math.floor(new Date(d).getTime()/1000);
const safeNum = (n,d=0)=>Number.isFinite(n)?n:d;

/* ------------------ helpers ------------------ */
function keyToRC(key){ const m=key.match(/^r(\d+)c(\d+)$/); return m?{r:+m[1],c:+m[2]}:{r:0,c:0}; }
function rcToCompass(r,c){ return [['NW','N','NE'],['W','C','E'],['SW','S','SE']][r]?.[c] ?? `${r},${c}`; }
function pad2(label){ return label.length === 1 ? `${label} ` : label.slice(0,2); }
function squareForTile(t){
  if (t.attack && t.attack.endAt && new Date(t.attack.endAt)>new Date()) return '🟨';
  if (t.owner==='Red')   return '🟥';
  if (t.owner==='Blue')  return '🟦';
  if (t.owner==='Green') return '🟩';
  return '⬜';
}
function factionDisplay(name){
  if (name === 'Neutral') return 'Neutral';
  return factionsConfig.find(f => f.name === name)?.displayName || name;
}
function ownerLabel(name){ return name ? factionDisplay(name) : '—'; }

function getFactionChannelId(faction){
  if (faction==='Red') return process.env.CHANNEL_RED_ID;
  if (faction==='Blue') return process.env.CHANNEL_BLUE_ID;
  if (faction==='Green') return process.env.CHANNEL_GREEN_ID;
  return null;
}

function canStartManagerElection(bank){
  const now = new Date();
  const managerActive =
    !!bank?.managerDiscordId &&
    !!bank?.managerTermEndAt &&
    new Date(bank.managerTermEndAt) > now;

  const electionActive =
    !!bank?.currentElection?.endsAt &&
    new Date(bank.currentElection.endsAt) > now;

  return !managerActive && !electionActive;
}


async function isFactionManager(userId, faction){
  const bank = await FactionBank.findOne({ faction });
  if (!bank?.managerDiscordId) return false;
  if (bank.managerTermEndAt && new Date(bank.managerTermEndAt) < new Date()) return false;
  return bank.managerDiscordId === userId;
}
async function requireManager(interaction, player){
  const bank = await FactionBank.findOne({ faction: player.faction });
  if (!bank?.managerDiscordId || (bank.managerTermEndAt && new Date(bank.managerTermEndAt)<new Date())){
    throw new Error('No active manager. Start an election in your faction channel.');
  }
  if (bank.managerDiscordId !== interaction.user.id){
    throw new Error('Only the elected manager can spend the faction treasury.');
  }
  return bank;
}

// ⬇️ Carte monospace
function mapBlockFrom(tiles, rows, cols){
  const lines=[];
  for (let r=0;r<rows;r++){
    const seg = tiles.slice(r*cols, r*cols+cols).map(t=>{
      const {r:rr,c}=keyToRC(t.key);
      const label = pad2(rcToCompass(rr,c));
      return `${squareForTile(t)} ${label}`;
    }).join('    ');
    lines.push(seg);
  }
  return '```' + lines.join('\n\n') + '```';
}

/* --------- faction breakdown --------- */
async function computeFactionBreakdown(allTiles, faction){
  const bank = await (FactionBank.findOne({ faction }) || { treasury:0 });
  const members = await Player.find({ faction }).lean();
  let forcePlayers=0, luckPlayers=0;
  for (const p of members){
    const s = await calculateTotalStats(p);
    forcePlayers += (s.force||0);
    luckPlayers  += (s.chance||0);
  }
  const owned = allTiles.filter(t => t.owner === faction);
  const terrCount = owned.length;

  const cfgB = metrics.faction.territory.buildings || {};
  const cfgF = metrics.faction.territory.fort || {};
  const basePerTile = metrics.faction.territory.baseDailyPerTile;

  let forceForts=0, forceArmories=0, luckCasinos=0, coinsBuildings=0;
  for (const t of owned){
    if (t.fortLevel) forceForts += t.fortLevel * (cfgF.forcePerLevel||0);
    if (t.building?.type){
      const b = cfgB[t.building.type] || {};
      if (t.building.type==='armory') forceArmories += t.building.level * (b.forceAuraPerLevel||0);
      if (t.building.type==='casino') luckCasinos   += t.building.level * (b.luckAuraPerLevel||0);
      coinsBuildings += (b.coinPerLevel||0) * (t.building.level||0);
    }
  }
  const coinsTiles = terrCount * basePerTile;
  const dailyIncome = coinsTiles + coinsBuildings;

  const apr = await computeFactionAPR(faction);
  const interestPerPlayer = Math.floor((bank.treasury||0) * (apr/365));

  return {
    membersCount: members.length,
    territories: terrCount,
    bankCoins: bank.treasury||0,
    force: { total: forcePlayers + forceForts + forceArmories, players: forcePlayers, forts: forceForts, armories: forceArmories },
    luck:  { total: luckPlayers + luckCasinos, players: luckPlayers, casinos: luckCasinos },
    income: { total: dailyIncome, tiles: coinsTiles, buildings: coinsBuildings },
    perPlayer: { interest: interestPerPlayer },
    apr
  };
}

/* ---------- forces breakdown ---------- */
async function getPlayersForces(discordIds){
  if (!discordIds?.length) return [];
  const players = await Player.find({ discordId: { $in: discordIds } });
  const map = new Map();
  for (const p of players){
    const s = await calculateTotalStats(p);
    map.set(p.discordId, s.force || 0);
  }
  return discordIds.map(id => ({ id, force: map.get(id) || 0 }));
}

function getDefenseStructuresForces(tile){
  const fortForce = (tile.fortLevel||0) * (metrics.faction.territory.fort?.forcePerLevel||0);
  const armoryAura = tile.building?.type === 'armory'
    ? (tile.building.level||0) * (metrics.faction.territory.buildings?.armory?.forceAuraPerLevel||0)
    : 0;
  return { fortForce, armoryAura };
}

function buildTileControlsRow(userId, t, playerFaction){
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder().setCustomId(`${F_DEF_JOIN}:${userId}:${t.key}`).setLabel('🛡️ Join Defense').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${F_DEF_LEAVE}:${userId}:${t.key}`).setLabel('↩️ Leave Defense').setStyle(ButtonStyle.Secondary)
    );
  if (playerFaction && t.owner !== playerFaction){
    row.addComponents(
      new ButtonBuilder().setCustomId(`${F_ATK_START}:${userId}:${t.key}`).setLabel('⚔️ Start Attack (24h)').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${F_ATK_JOIN}:${userId}:${t.key}`).setLabel('➕ Join Attackers').setStyle(ButtonStyle.Danger)
    );
  }
  if (t.owner === playerFaction && !t.attack){
    row.addComponents(
      new ButtonBuilder().setCustomId(`${F_BUILD_MENU}:${userId}:${t.key}`).setLabel('🏗️ Build / Fortify').setStyle(ButtonStyle.Success)
    );
  }
  return row;
}

async function buildTileDetailEmbed(t){
  const { r, c } = keyToRC(t.key);
  const name = rcToCompass(r,c);
  const defMax = calcDefMax(t);

  const b = t.building||{};
  const bCfg = (metrics.faction.territory.buildings||{})[b.type]||{};
  const coinGain = (bCfg.coinPerLevel||0) * (b.level||0);
  const forceAura= (bCfg.forceAuraPerLevel||0) * (b.level||0);
  const luckAura = (bCfg.luckAuraPerLevel ||0) * (b.level||0);

  const fortLvl = t.fortLevel||0;
  const fortForceFlat = fortLvl * (metrics.faction.territory.fort?.forcePerLevel||0);

  // DEFENSE
  const defIds = (Array.isArray(t.defenders) ? t.defenders : []).map(d => d.discordId);
  const defIndividuals = await getPlayersForces(defIds);
  const defPlayersForce = defIndividuals.reduce((s,a)=>s+a.force,0);
  const { fortForce, armoryAura } = getDefenseStructuresForces(t);
  const defenseTotal = defPlayersForce + fortForce + armoryAura;

  const defLines = defIndividuals.length
    ? defIndividuals.map(({id, force})=>{
        const d = t.defenders.find(x=>x.discordId===id);
        const minH = metrics?.faction?.defense?.minHours ?? 24;
        const maxH = metrics?.faction?.defense?.maxHours ?? 72;
        const start = d?.sinceAt ? `<t:${ts(d.sinceAt)}:R>`:'—';
        const earliest = d?.sinceAt ? `<t:${ts(new Date(d.sinceAt).getTime()+hrs(minH))}:R>` : '—';
        const latest   = d?.sinceAt ? `<t:${ts(new Date(d.sinceAt).getTime()+hrs(maxH))}:R>` : '—';
        return `• <@${id}> — **${force}** • since ${start} • earliest leave ${earliest} • latest leave ${latest}`;
      }).join('\n')
    : '_No defenders_';

  // ATTACK / PEACE + TRUCE
  let attackBlock = 'Peace';
  if (t.truceUntil && new Date(t.truceUntil) > new Date() && !t.attack){
    attackBlock = `Peace — 🕊️ truce until <t:${ts(t.truceUntil)}:R>`;
  }
  if (t.attack){
    const atkFaction = factionDisplay(t.attack.attackerFaction);
    const atkIndividuals = await getPlayersForces(t.attack.attackers || []);
    const atkPlayersForce = atkIndividuals.reduce((s,a)=>s+a.force,0);
    const atkBuildingsForce = 0;
    const attackTotal = atkPlayersForce + atkBuildingsForce;

    const atkLines = atkIndividuals.length
      ? atkIndividuals.map(({id, force}) => `• <@${id}> — **${force}**`).join('\n')
      : '_No attackers yet_';

    const timer = t.attack.endAt ? `${squareForTile(t)} ends <t:${ts(t.attack.endAt)}:R>` : '';

    attackBlock =
      `⚔️ **Under attack** by **${atkFaction}**\n` +
      `${timer}\n` +
      `**Attack Force** (players + buildings): **${attackTotal}**\n` +
      `- Players: **${atkPlayersForce}**\n` +
      `- Buildings: **${atkBuildingsForce}**\n` +
      `\n**Attackers**:\n${atkLines}`;
  }

  // BUILDING DETAILS
  let buildingBlock = `**Building**: ${b.type ? `**${b.type} L${b.level}**` : '**none**'}`;
  if (b.type){
    const lines = [];
    if (coinGain)  lines.push(`• Coins/day: **+${coinGain}**`);
    if (forceAura) lines.push(`• Force aura: **+${forceAura}**`);
    if (luckAura)  lines.push(`• Luck aura: **+${luckAura}**`);
    if (lines.length) buildingBlock += `\n${lines.join('  •  ')}`;
  }

  return createEmbed({
    title: `🗺️ ${name} — Detail`,
    description:
      `Owner: **${ownerLabel(t.owner)}**\n\n` +
      `${attackBlock}\n\n` +
      `🛡️ **Defense Force** (players + buildings + fortifications): **${defenseTotal}**\n` +
      `- Players: **${defPlayersForce}**\n` +
      `- Buildings (armory): **${armoryAura}**\n` +
      `- Fortifications: **${fortForce}**\n` +
      `\n**Defenders**:\n${defLines}\n\n` +
      `Max defenders: **${defMax}**\n\n` +
      `${buildingBlock}\n` +
      `**Fortifications**: L${fortLvl} → Flat Force: **+${fortForceFlat}**`
  });
}

/* -------------------- UI: dashboard -------------------- */
async function buildInterfaceEmbedAndComponents(player, discordId){
  await ensureMapInitialized();
  const tiles = await Territory.find().sort({ key:1 });
  const { rows, cols } = metrics.faction.territory;

  const embed = createEmbed({
    title: '🏷️ Factions',
    description: '**Map**\n' + mapBlockFrom(tiles, rows, cols)
  });

  for (const f of factionsConfig){
    const b = await computeFactionBreakdown(tiles, f.name);
    embed.addFields({
      name: f.displayName,
      value:
        `Players: **${b.membersCount}**\n` +
        `Territories: **${b.territories}**\n` +
        `Total Strength: **${b.force.total}**\n` +
        `Total Luck: **${b.luck.total}**\n` +
        `Faction Coins: **${b.bankCoins}**\n` +
        `Daily Gain: **${b.income.total}**\n`,
      inline: true
    });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT}:${discordId}`)
    .setPlaceholder(player.faction ? factionsConfig.find(f=>f.name===player.faction)?.displayName : 'Select a faction')
    .setMinValues(1).setMaxValues(1)
    .addOptions(factionsConfig.map(f=>({
      label:f.displayName, description:f.description, value:f.name, default: player.faction===f.name
    })));

  const rowsArr = [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${F_STATS}:${discordId}`).setLabel('📊 Stats & Map').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${F_GUIDE}:${discordId}`).setLabel('📖 Guide').setStyle(ButtonStyle.Primary)
    )
  ];
  if (player.faction){
    rowsArr.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CONFIRM}:${discordId}`).setLabel('Leave Faction').setStyle(ButtonStyle.Danger)
    ));
  }
  return { embed, components: rowsArr };
}

/* -------------------- UI: Stats & Map -------------------- */
async function buildStatsAndMapEmbedsAndComponents(userId, playerFaction){
  await ensureMapInitialized();
  const tiles = await Territory.find().sort({ key:1 });
  const { rows, cols } = metrics.faction.territory;

  const embeds = [
    createEmbed({ title: '📊 Map', description: mapBlockFrom(tiles, rows, cols) })
  ];

  const extraRows = [];

  if (playerFaction){
    const b = await computeFactionBreakdown(tiles, playerFaction);
    const display = factionDisplay(playerFaction);

    // Manager info
    const bank = await FactionBank.findOne({ faction: playerFaction });
    const mgr = bank?.managerDiscordId ? `<@${bank.managerDiscordId}>` : '_None_';
    const term = bank?.managerTermEndAt ? `<t:${Math.floor(new Date(bank.managerTermEndAt).getTime()/1000)}:R>` : '—';

    embeds.push(createEmbed({
      title: `🏴 Your Faction — ${display}`,
      description:
        `Players: **${b.membersCount}**\n` +
        `Territories: **${b.territories}**\n` +
        `Total Strength: **${b.force.total}**\n` +
        `- Players: **${b.force.players}**\n` +
        `- Forts: **${b.force.forts}**\n` +
        `- Armories: **${b.force.armories}**\n` +
        `Total Luck: **${b.luck.total}**\n` +
        `- Players: **${b.luck.players}**\n` +
        `- Casinos: **${b.luck.casinos}**\n` +
        `Faction Coins: **${b.bankCoins}**\n` +
        `Daily Income → Treasury: **${b.income.total}**\n` +
        `- Tiles: **${b.income.tiles}**\n` +
        `- Buildings: **${b.income.buildings}**\n` +
        `Interest/day per player: **${b.perPlayer.interest}** (APR ${(safeNum(b.apr)*100).toFixed(2)}%)\n\n` +
        `**Manager**: ${mgr} • Term ends: ${term}`
    }));

    embeds.push(createEmbed({
      title: '💸 Donations & Deposits',
      description:
        '• **Donations**: 75% → platform • 25% → **redistributed daily (12:00 UTC)** to players of the **other factions**.\n' +
        '• **Treasury deposits**: **25% tax** → same daily redistribution • **75%** → **faction treasury**.\n' +
        '• **Spending the treasury is restricted to the elected manager.**'
    }));

  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${F_MAP_SELECT}:${userId}`)
    .setPlaceholder('Select a tile to manage')
    .addOptions(tiles.map(t=>{
      const { r,c } = keyToRC(t.key);
      return { label: `${rcToCompass(r,c)} — Owner ${ownerLabel(t.owner)}`, value: t.key };
    }));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${F_BANK_DEP_OPEN}:${userId}`).setLabel('🏦 Deposit to Treasury').setStyle(ButtonStyle.Primary)
  );

  return { embeds, components: [new ActionRowBuilder().addComponents(select), row, ...extraRows] };
}

/* ----------------------------- handler ----------------------------- */
export default async function factionHandler(interaction){
  const parts = interaction.customId.split(':');
  const [action, discordId, arg1, arg2] = parts;

  // Modal submit: Deposit to treasury (25% tax → redistribution; 75% → treasury)
  if (action === 'fTreasuryDepositSubmit'){
    try{
      if (interaction.user.id !== discordId){
        return interaction.reply({ content:'❌ You cannot manage factions for another user.', ephemeral:true });
      }
      const amountRaw = interaction.fields.getTextInputValue('amount') || '0';
      const amount = Math.floor(Number(amountRaw));
      if (!Number.isFinite(amount) || amount <= 0){
        return interaction.reply({ content:'❌ Invalid amount.', ephemeral:true });
      }

      const player = await Player.findOne({ discordId });
      if (!player?.faction) return interaction.reply({ content:'❌ Join a faction first.', ephemeral:true });
      if ((player.coins||0) < amount) return interaction.reply({ content:'❌ Insufficient funds.', ephemeral:true });

      let bank = await FactionBank.findOne({ faction: player.faction });
      if (!bank) bank = await FactionBank.create({ faction: player.faction });

      const tax = Math.floor(amount * 0.25);
      const net = amount - tax;

      player.coins = (player.coins||0) - amount;
      bank.treasury = (bank.treasury||0) + net;
      bank.dailyDonationRedistributable = (bank.dailyDonationRedistributable||0) + tax;

      await Promise.all([player.save(), bank.save()]);

      const embed = createEmbed({
        title: '🏦 Deposit confirmed',
        description:
          `Amount: **${amount}**\n` +
          `Treasury credited (75%): **+${net}**\n` +
          `Tax (25%) → daily redistribution at **12:00 UTC**: **${tax}**\n` +
          `New treasury: **${bank.treasury}**`,
        timestamp: true
      });

      return interaction.reply({ embeds:[embed], ephemeral:true });
    }catch(e){
      return interaction.reply({ content:`❌ ${e.message}`, ephemeral:true });
    }
  }

  // 🗳️ Start election (post in faction channel)
  if (action === F_MGR_START){
    try{
      if (interaction.user.id !== discordId) return interaction.reply({ content:'❌ Not yours.', ephemeral:true });
      const player = await Player.findOne({ discordId });
      if (!player?.faction) return interaction.reply({ content:'❌ Join a faction first.', ephemeral:true });

      const bank = await FactionBank.findOne({ faction: player.faction }) || await FactionBank.create({ faction: player.faction });
      // If active manager term still valid, block new election
      if (bank.managerDiscordId && (!bank.managerTermEndAt || new Date(bank.managerTermEndAt) > new Date())){
        return interaction.reply({ content:'⏳ Manager term is still active. Election not allowed yet.', ephemeral:true });
      }
      // If election already active, block
      if (bank.currentElection?.endsAt && new Date(bank.currentElection.endsAt) > new Date()){
        return interaction.reply({ content:'🗳️ An election is already running.', ephemeral:true });
      }

      const channelId = getFactionChannelId(player.faction);
      if (!channelId) return interaction.reply({ content:'❌ Faction channel is not configured.', ephemeral:true });

      const members = await Player.find({ faction: player.faction }).lean();
      if (!members.length) return interaction.reply({ content:'❌ No candidates available.', ephemeral:true });

      // Build options (max 25)
      const options = [];
      for (const m of members){
        let label = m.discordId;
        try{
          const gm = await interaction.guild.members.fetch(m.discordId);
          label = gm?.displayName || gm?.user?.username || m.discordId;
        }catch{ /* ignore */ }
        options.push({ label: label.slice(0,100), value: m.discordId });
      }
      const limited = options.slice(0,25);

      const electionId = `${Date.now()}`;
      const voteMenu = new StringSelectMenuBuilder()
        .setCustomId(`${F_MGR_VOTE}:${player.faction}:${electionId}`)
        .setPlaceholder('Select your manager')
        .setMinValues(1).setMaxValues(1)
        .addOptions(limited);
      const finalizeBtn = new ButtonBuilder()
        .setCustomId(`${F_MGR_FINALIZE}:${player.faction}:${electionId}`)
        .setLabel('Finalize Election')
        .setStyle(ButtonStyle.Success);

      const ch = await interaction.client.channels.fetch(channelId);
      const e = createEmbed({
        title: `🗳️ ${factionDisplay(player.faction)} — Manager Election`,
        description:
          `Vote lasts **24h**. Choose one candidate below. One vote per player (latest vote counts).\n` +
          `Only the elected **Manager** will be able to **spend the faction treasury** for the next **7 days**.`
      });
      const msg = await ch.send({
        embeds:[e],
        components:[
          new ActionRowBuilder().addComponents(voteMenu),
          new ActionRowBuilder().addComponents(finalizeBtn)
        ]
      });

      bank.currentElection = {
        id: electionId,
        channelId,
        messageId: msg.id,
        startedAt: new Date(),
        endsAt: new Date(Date.now()+hrs(24)),
        votes: {} // { voterId: candidateId }
      };
      await bank.save();

      return interaction.reply({ content:`✅ Election started in <#${channelId}> (closes <t:${Math.floor(bank.currentElection.endsAt.getTime()/1000)}:R>).`, ephemeral:true });
    }catch(e){
      return interaction.reply({ content:`❌ ${e.message}`, ephemeral:true });
    }
  }

  // 🗳️ Cast / update vote
  if (action === F_MGR_VOTE && interaction.isStringSelectMenu?.()){
    try{
      const [ , faction, electionId ] = parts; // customId: fMgrVote:<faction>:<electionId>
      const bank = await FactionBank.findOne({ faction });
      if (!bank?.currentElection || bank.currentElection.id !== electionId){
        return interaction.reply({ content:'❌ This election is no longer active.', ephemeral:true });
      }
      if (new Date(bank.currentElection.endsAt) < new Date()){
        return interaction.reply({ content:'⏳ Election has ended. Ask someone to finalize.', ephemeral:true });
      }
      const voter = interaction.user.id;
      const candidateId = interaction.values?.[0];
      const isMember = await Player.exists({ discordId: candidateId, faction });
      if (!isMember) return interaction.reply({ content:'❌ Candidate is not in this faction.', ephemeral:true });

      // Record vote (latest counts)
      bank.currentElection.votes = bank.currentElection.votes || {};
      bank.currentElection.votes[voter] = candidateId;
      await bank.save();

      return interaction.reply({ content:`✅ Your vote has been recorded for <@${candidateId}>.`, ephemeral:true });
    }catch(e){
      return interaction.reply({ content:`❌ ${e.message}`, ephemeral:true });
    }
  }

  // 🗳️ Finalize election (after 24h)
  if (action === F_MGR_FINALIZE){
    try{
      const [ , faction, electionId ] = parts; // fMgrFinalize:<faction>:<electionId>
      const bank = await FactionBank.findOne({ faction });
      if (!bank?.currentElection || bank.currentElection.id !== electionId){
        return interaction.reply({ content:'❌ No matching election to finalize.', ephemeral:true });
      }
      if (new Date(bank.currentElection.endsAt) > new Date()){
        return interaction.reply({ content:'⏳ Election is still running. Try again after it ends.', ephemeral:true });
      }
      const votes = bank.currentElection.votes || {};
      const tally = {};
      for (const v of Object.values(votes)){
        tally[v] = (tally[v]||0)+1;
      }
      const entries = Object.entries(tally);
      if (!entries.length) return interaction.reply({ content:'⚠️ No votes were cast. Start a new election.', ephemeral:true });

      // winner: highest votes, tie-breaker = lexicographically smallest id
      entries.sort((a,b)=> b[1]-a[1] || (a[0] < b[0] ? -1 : 1));
      const [winnerId, count] = entries[0];

      bank.managerDiscordId = winnerId;
      bank.managerTermEndAt = new Date(Date.now()+hrs(24*7));
      bank.currentElection = null;
      await bank.save();

      // Announce in channel
      const chId = getFactionChannelId(faction);
      try{
        const ch = chId ? await interaction.client.channels.fetch(chId) : null;
        if (ch){
          const e = createEmbed({
            title: `🏁 ${factionDisplay(faction)} — Manager Elected`,
            description:
              `Winner: <@${winnerId}> with **${count}** vote(s).\n` +
              `Term ends: <t:${Math.floor(bank.managerTermEndAt.getTime()/1000)}:R>.`
          });
          await ch.send({ embeds:[e] });
        }
      }catch{}

      return interaction.reply({ content:`✅ Finalized. <@${winnerId}> is the new Manager.`, ephemeral:true });
    }catch(e){
      return interaction.reply({ content:`❌ ${e.message}`, ephemeral:true });
    }
  }

  // Guard: user mismatch for button/select actions
  if ((interaction.isButton?.() || interaction.isStringSelectMenu?.()) && interaction.user.id !== discordId){
    return interaction.reply({ content:'❌ You cannot manage factions for another user.', flags:64 });
  }

  let player = await Player.findOne({ discordId }) || await Player.create({ discordId });

  // OPEN
  if (action===OPEN){
    const nftCount = await getNFTCount(discordId);
    await interaction.deferReply({ flags:64 });
    if (nftCount < 1){
      return interaction.editReply({ embeds:[createEmbed({
        title:'🔒 Factions Locked',
        description:'You need at least one Genesis Pass NFT to manage factions.',
        color:0xDD2E44
      })], components:[] });
    }
    const { embed, components } = await buildInterfaceEmbedAndComponents(player, discordId);
    return interaction.editReply({ embeds:[embed], components });
  }

  // STATS & MAP
  if (action===F_STATS){
    await interaction.deferReply({ flags:64 });
    const { embeds, components } = await buildStatsAndMapEmbedsAndComponents(interaction.user.id, player.faction);
    return interaction.editReply({ embeds, components });
  }

  // GUIDE
  if (action===F_GUIDE){
    await interaction.deferReply({ flags:64 });

    const m        = metrics.faction;
    const terr     = m.territory;
    const defs     = m.defense || {};
    const atk      = m.attack  || {};
    const bCfgs    = terr.buildings || {};
    const fort     = terr.fort || {};
    const hoursAtk = Math.round((atk.durationMs || 0) / 3600000);

    const legend = [
      '🟥 Red   🟦 Blue   🟩 Green   ⬜ Neutral   🟨 Under attack',
      'Labels: NW, N, NE, W, C, E, SW, S, SE'
    ].join('\n');

    const e1 = createEmbed({
      title: '📖 Faction Guide — Overview',
      description:
        `**Map**: 3×3 tiles. Each tile shows an owner color; 🟨 = currently under attack.\n` +
        `${legend}\n\n` +
        `**Income**: every owned tile pays **${terr.baseDailyPerTile}** coins/day to the faction. ` +
        `Buildings can add more coins and auras (Force/Luck).`
    });

    const bLines = Object.entries(bCfgs).map(([key,cfg])=>{
      const name  = cfg.displayName || key;
      const c1    = buildingUpgradeCost(key,1);
      const c2    = buildingUpgradeCost(key,2);
      const c3    = buildingUpgradeCost(key,3);
      const coins = cfg.coinPerLevel ? `+${cfg.coinPerLevel}/lvl coins` : '— coins';
      const fAura = cfg.forceAuraPerLevel ? `+${cfg.forceAuraPerLevel}/lvl force` : '— force';
      const lAura = cfg.luckAuraPerLevel ? `+${cfg.luckAuraPerLevel}/lvl luck`   : '— luck';
      const extra = cfg?.extraDef
        ? `(+1 **defender slot** starting L${cfg.extraDef.startLevel}, every ${cfg.extraDef.every} lvl)`
        : '';
      return `**${name}**\n• Costs → L1:${c1} • L2:${c2} • L3:${c3}\n• Effects → ${coins} • ${fAura} • ${lAura}\n• ${extra}`;
    }).join('\n\n') || '_No building config found_.';

    const f1 = fortUpgradeCost(1), f2 = fortUpgradeCost(2), f3 = fortUpgradeCost(3);
    const e2 = createEmbed({
      title: '🏗️ Buildings',
      description:
        `• 1 building **max per tile**; you can **upgrade** it.\n` +
        `• **Destroy** returns **50%** of the last level cost (not during an attack).\n\n` +
        bLines
    });

    const e3 = createEmbed({
      title: '🛡️ Fortifications',
      description:
        `• Flat Force per level: **+${fort.forcePerLevel||0}**\n` +
        `• Upgrade costs: L1:${f1} • L2:${f2} • L3:${f3}\n` +
        `• Extra defender slots: **+1 every ${fort.extraDefEvery||1} fort level**\n` +
        `• **Cannot** be destroyed.`
    });

    const e4 = createEmbed({
      title: '🧱 Defense',
      description:
        `• You can defend **only tiles owned by your faction** (never Neutral).\n` +
        `• **Min ${defs.minHours||24}h / Max ${defs.maxHours||72}h** commitment. ` +
        `You cannot leave while an attack is ongoing.\n` +
        `• **Max defenders** on a tile = **1** base + building bonus + fort bonus.\n` +
        `• A player can be **either** defending **or** attacking — never both (engagement lock).`
    });

    const e5 = createEmbed({
      title: '⚔️ Attacks & Capture',
      description:
        `• Start an attack on an enemy tile → lasts **${hoursAtk}h**. ` +
        `The **starter automatically joins** the attackers.\n` +
        `• Max simultaneous attacks **per faction**: **3**.\n` +
        `• Max attackers per battle = ⌊ **(defender-faction player count) / ${atk.attackerLimitDivisor || 3}** ⌋.\n` +
        `• During an attack: **no upgrades/destroys**, defenders **cannot leave** (empty slots may still be filled).\n` +
        `• Resolution: if **Attack Force > Defense Force**, the tile changes owner; the building & the fort each **lose 1 level**. ` +
        `A **48h truce** applies on the tile afterward.`
    });

    const e6 = createEmbed({
      title: '🏦 Treasury, Income & Interests',
      description:
        `• **Daily income** (tiles + building coin bonuses) goes **only** to the **faction treasury** — players do not receive it directly.\n` +
        `• **Minted interests**: APR = (**Total Luck** / 100). Each day, every member receives ` +
        `**⌊(treasury × APR / 365)⌋** coins (newly minted) — the **treasury itself does not change**.\n` +
        `• **Treasury deposits**: a **25% tax** is redistributed at 12:00 UTC to other factions; **75%** goes to the treasury.\n` +
        `• **Spending requires the elected Manager.**`
    });

    const e7 = createEmbed({
      title: '💸 Player Donations (75/25 fairness)',
      description:
        `• When a player **deposits** to their faction: **75%** → treasury • **25%** → daily redistribution to the **other factions**.`
    });

    const e8 = createEmbed({
      title: '🕹️ UI & Controls',
      description:
        `• **Stats & Map** → see the 3×3 map, pick a tile.\n` +
        `• **Tile panel** → Join/Leave Defense, Start/Join Attack, Build/Fortify.\n` +
        `• **Deposit to Treasury** → add coins (25% tax → daily redistribution, 75% → treasury).\n` +
        `• **Elect Manager** → weekly term; only the Manager can spend treasury.\n` +
        `• **Faction switch** respects balance and cooldown rules.`
    });

    return interaction.editReply({ embeds:[e1,e2,e3,e4,e5,e6,e7,e8] });
  }

  // TILE SELECT → detailed card
  if (action===F_MAP_SELECT){
    const key = interaction.values?.[0];
    if (!key){ await interaction.deferUpdate(); return; }
    const t = await Territory.findOne({ key });
    if (!t) return interaction.reply({ content:'❌ Territory not found.', flags:64 });

    const embed = await buildTileDetailEmbed(t);
    const row = buildTileControlsRow(interaction.user.id, t, player.faction);
    return interaction.reply({ embeds:[embed], components:[row], flags:64 });
  }

  // DEFENSE
  if (action===F_DEF_JOIN){
    await interaction.deferUpdate();
    try{
      if (await isPlayerBusy(discordId)) return interaction.followUp({ content:'❌ You are already engaged elsewhere.', ephemeral:true });
      await joinDefense(arg1, discordId);
      const t = await Territory.findOne({ key: arg1 });
      const embed = await buildTileDetailEmbed(t);
      const row = buildTileControlsRow(interaction.user.id, t, player.faction);
      return interaction.editReply({ embeds:[embed], components:[row] });
    }catch(e){
      return interaction.followUp({ content:`❌ ${e.message}`, ephemeral:true });
    }
  }
  if (action===F_DEF_LEAVE){
    await interaction.deferUpdate();
    try{
      await leaveDefense(arg1, discordId);
      const t = await Territory.findOne({ key: arg1 });
      const embed = await buildTileDetailEmbed(t);
      const row = buildTileControlsRow(interaction.user.id, t, player.faction);
      return interaction.editReply({ embeds:[embed], components:[row] });
    }catch(e){
      return interaction.followUp({ content:`❌ ${e.message}`, ephemeral:true });
    }
  }

  // ATTACK
  if (action===F_ATK_START){
    await interaction.deferUpdate();
    try{
      await startAttack(arg1, player.faction, discordId); // starter joins
      const t = await Territory.findOne({ key: arg1 });
      const embed = await buildTileDetailEmbed(t);
      const row = buildTileControlsRow(interaction.user.id, t, player.faction);
      return interaction.editReply({ embeds:[embed], components:[row] });
    }catch(e){
      return interaction.followUp({ content:`❌ ${e.message}`, ephemeral:true });
    }
  }
  if (action===F_ATK_JOIN){
    await interaction.deferUpdate();
    try{
      await joinAttack(arg1, discordId, player.faction);
      const t = await Territory.findOne({ key: arg1 });
      const embed = await buildTileDetailEmbed(t);
      const row = buildTileControlsRow(interaction.user.id, t, player.faction);
      return interaction.editReply({ embeds:[embed], components:[row] });
    }catch(e){
      return interaction.followUp({ content:`❌ ${e.message}`, ephemeral:true });
    }
  }

  // Treasury deposit modal open
  if (action===F_BANK_DEP_OPEN){
    const modal = new ModalBuilder().setCustomId(`fTreasuryDepositSubmit:${discordId}`).setTitle('Deposit to faction treasury');
    const input = new TextInputBuilder().setCustomId('amount').setLabel('Amount (coins)').setStyle(TextInputStyle.Short).setRequired(true);
    return interaction.showModal(modal.addComponents(new ActionRowBuilder().addComponents(input)));
  }

  // BUILD MENU & actions
  if (action===F_BUILD_MENU){
    await interaction.deferReply({ flags:64 });
    const t = await Territory.findOne({ key: arg1 });
    if (!t) return interaction.editReply({ content:'❌ Territory not found.' });
    if (t.owner !== player.faction) return interaction.editReply({ content:'❌ Not your territory.' });
    if (t.attack) return interaction.editReply({ content:'❌ Cannot build/upgrade during an attack.' });

    const bank = await FactionBank.findOne({ faction: player.faction }) || { treasury:0 };
    const hasB = !!t.building?.type;
    const bType = t.building?.type || null;
    const bLvl  = t.building?.level || 0;
    const nextBCost = hasB ? buildingUpgradeCost(bType, bLvl+1) : null;
    const fortCost  = fortUpgradeCost((t.fortLevel||0)+1);
    const { r,c } = keyToRC(t.key), name = rcToCompass(r,c);

    const embed = createEmbed({
      title:`🏗️ Manage ${name}`,
      description:
        `Treasury: **${bank.treasury}**\n` +
        `Manager required to spend: **Yes**\n` +
        `Building: **${hasB ? `${bType} L${bLvl}`:'none'}**` + (hasB?` → Upgrade: **${nextBCost}**`:'') + `\n` +
        `Fort: **L${t.fortLevel||0}** → Upgrade: **${fortCost}**`
    });

    const row = new ActionRowBuilder();
    if (!hasB){
      const types = Object.keys(metrics.faction.territory.buildings||{});
      for (const tp of types){
        const cost = buildingUpgradeCost(tp,1);
        row.addComponents(new ButtonBuilder().setCustomId(`${F_BUILD_CHOOSE}:${interaction.user.id}:${t.key}:${tp}`).setLabel(`Build ${tp} (L1 • ${cost})`).setStyle(ButtonStyle.Primary));
      }
    }else{
      row.addComponents(
        new ButtonBuilder().setCustomId(`${F_BUILD_UP}:${interaction.user.id}:${t.key}`).setLabel(`Upgrade Building (${nextBCost})`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${F_BUILD_DEST}:${interaction.user.id}:${t.key}`).setLabel('Destroy (refund 50%)').setStyle(ButtonStyle.Secondary)
      );
    }
    row.addComponents(new ButtonBuilder().setCustomId(`${F_FORT_UP}:${interaction.user.id}:${t.key}`).setLabel(`Fortify (+1 • ${fortCost})`).setStyle(ButtonStyle.Success));

    return interaction.editReply({ embeds:[embed], components:[row] });
  }

  if (action===F_BUILD_CHOOSE){
    await interaction.deferReply({ flags:64 });
    const key=arg1, type=arg2;
    try{
      const t = await Territory.findOne({ key });
      if (!t) throw new Error('Territory not found');
      if (t.owner !== player.faction) throw new Error('Not your territory.');
      if (t.attack) throw new Error('Cannot build during an attack.');
      if (t.building?.type) throw new Error('Building already exists.');
      await requireManager(interaction, player);
      const cost = buildingUpgradeCost(type,1);
      const bank = await FactionBank.findOne({ faction: player.faction });
      if (!bank || bank.treasury < cost) throw new Error('Not enough faction funds.');
      bank.treasury -= cost; t.building = { type, level:1 };
      await Promise.all([bank.save(), t.save()]);
      return interaction.editReply({ content:`✅ Built **${type} L1** (−${cost}).` });
    }catch(e){ return interaction.editReply({ content:`❌ ${e.message}`}); }
  }

  if (action===F_BUILD_UP){
    await interaction.deferReply({ flags:64 });
    const key=arg1;
    try{
      const t = await Territory.findOne({ key });
      if (!t) throw new Error('Territory not found');
      if (t.owner !== player.faction) throw new Error('Not your territory.');
      if (t.attack) throw new Error('Cannot upgrade during an attack.');
      if (!t.building?.type) throw new Error('No building to upgrade.');
      await requireManager(interaction, player);
      const toLevel = t.building.level + 1;
      const cost = buildingUpgradeCost(t.building.type, toLevel);
      const bank = await FactionBank.findOne({ faction: player.faction });
      if (!bank || bank.treasury < cost) throw new Error('Not enough faction funds.');
      bank.treasury -= cost; t.building.level = toLevel;
      await Promise.all([bank.save(), t.save()]);
      return interaction.editReply({ content:`✅ Upgraded **${t.building.type} → L${toLevel}** (−${cost}).` });
    }catch(e){ return interaction.editReply({ content:`❌ ${e.message}`}); }
  }

  if (action===F_BUILD_DEST){
    await interaction.deferReply({ flags:64 });
    const key=arg1;
    try{
      const t = await Territory.findOne({ key });
      if (!t) throw new Error('Territory not found');
      if (t.owner !== player.faction) throw new Error('Not your territory.');
      if (t.attack) throw new Error('Cannot destroy during an attack.');
      if (!t.building?.type || !t.building.level) throw new Error('No building to destroy.');
      await requireManager(interaction, player);
      const refund = Math.floor(0.5 * buildingUpgradeCost(t.building.type, t.building.level));
      const bank = await FactionBank.findOne({ faction: player.faction });
      bank.treasury += refund;
      const prev = `${t.building.type} L${t.building.level}`;
      t.building = { type:null, level:0 };
      await Promise.all([bank.save(), t.save()]);
      return interaction.editReply({ content:`✅ Destroyed **${prev}** (+${refund}).` });
    }catch(e){ return interaction.editReply({ content:`❌ ${e.message}`}); }
  }

  if (action===F_FORT_UP){
    await interaction.deferReply({ flags:64 });
    const key=arg1;
    try{
      const t = await Territory.findOne({ key });
      if (!t) throw new Error('Territory not found');
      if (t.owner !== player.faction) throw new Error('Not your territory.');
      if (t.attack) throw new Error('Cannot fortify during an attack.');
      await requireManager(interaction, player);
      const toLevel = (t.fortLevel||0)+1;
      const cost = fortUpgradeCost(toLevel);
      const bank = await FactionBank.findOne({ faction: player.faction });
      if (!bank || bank.treasury < cost) throw new Error('Not enough faction funds.');
      bank.treasury -= cost; t.fortLevel = toLevel;
      await Promise.all([bank.save(), t.save()]);
      return interaction.editReply({ content:`✅ Fort upgraded to **L${toLevel}** (−${cost}).` });
    }catch(e){ return interaction.editReply({ content:`❌ ${e.message}`}); }
  }

  // SELECT / LEAVE
  if (action===SELECT){
    await interaction.deferUpdate();
    const chosen = interaction.values[0];
    if (player.lastFactionChange){
      const next = new Date(player.lastFactionChange.getTime()+metrics.factionChangeCooldown);
      if (Date.now()<next) return interaction.editReply({ embeds:[createEmbed({title:'⏳ Cooldown', description:`You must wait until <t:${Math.floor(next.getTime()/1000)}:R>.`})], components:[] });
    }
    if (!(await canJoinFaction(chosen))){
      return interaction.editReply({ embeds:[createEmbed({title:'❌ Cannot Join', description:'Choosing this faction would unbalance the roster.'})], components:[] });
    }
    const member = await interaction.guild.members.fetch(discordId);
    const allRoleIds = factionsConfig.map(f=>process.env[f.roleEnvVar]).filter(Boolean);
    await member.roles.remove(allRoleIds);
    await assignFactionToPlayer(player, chosen);
    player.lastFactionChange = new Date(); await player.save();
    const nf = factionsConfig.find(f=>f.name===chosen); const roleId = process.env[nf.roleEnvVar];
    if (roleId) await member.roles.add(roleId);
    return interaction.editReply({ embeds:[createEmbed({title:'✅ Joined Faction', description:`You joined **${nf.displayName}**!`})], components:[] });
  }

  if (action===CONFIRM){
    await interaction.deferUpdate();
    if (!player.faction) return interaction.editReply({ embeds:[createEmbed({title:'❌ Not in Faction', description:'You are not currently in a faction.'})], components:[] });
    const name = factionsConfig.find(f=>f.name===player.faction).displayName;
    return interaction.editReply({
      embeds:[createEmbed({title:'⚠️ Confirm Leave', description:`Are you sure you want to leave **${name}**?`})],
      components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${FINAL}:${discordId}`).setLabel('Confirm Leave').setStyle(ButtonStyle.Danger))]
    });
  }

  if (action===FINAL){
    await interaction.deferUpdate();
    if (!player.faction) return interaction.editReply({ embeds:[createEmbed({title:'❌ Not in Faction', description:'You are not currently in a faction.'})], components:[] });
    const member = await interaction.guild.members.fetch(discordId);
    const allRoleIds = factionsConfig.map(f=>process.env[f.roleEnvVar]).filter(Boolean);
    await member.roles.remove(allRoleIds);
    await removePlayerFromFaction(player);
    player.lastFactionChange = new Date(); await player.save();
    return interaction.editReply({ embeds:[createEmbed({title:'✅ Left Faction', description:'You have left your faction.'})], components:[] });
  }
}

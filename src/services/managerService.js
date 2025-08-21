import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import FactionElection from '../data/models/FactionElection.js';
import FactionBank from '../data/models/FactionBank.js';
import Player from '../data/models/Player.js';
import factionsConfig from '../config/factions.js';
import { createEmbed } from '../utils/createEmbed.js';

const WEEK_MS = 7*24*3600*1000;
const DAY_MS  = 24*3600*1000;

function channelIdForFaction(f) {
  if (f === 'Red')   return process.env.CHANNEL_RED_ID;
  if (f === 'Blue')  return process.env.CHANNEL_BLUE_ID;
  if (f === 'Green') return process.env.CHANNEL_GREEN_ID;
  return null;
}
function factionDisplay(fName){
  return factionsConfig.find(f=>f.name===fName)?.displayName || fName;
}

/** Checks if user is the active manager of the faction (and not expired). */
export async function isFactionManager(userId, faction) {
  const bank = await FactionBank.findOne({ faction });
  if (!bank?.managerDiscordId || !bank?.managerValidUntil) return false;
  return (bank.managerDiscordId === userId) && (new Date(bank.managerValidUntil) > new Date());
}

/** Throws if user is not the active manager. */
export async function requireFactionManager(userId, faction) {
  if (await isFactionManager(userId, faction)) return true;
  throw new Error('Only the elected faction manager can spend treasury funds.');
}

/** Start a 24h election in the faction channel (admin command). */
export async function startFactionManagerVote(client, guild, faction) {
  faction = ['Red','Blue','Green'].includes(faction) ? faction : null;
  if (!faction) throw new Error('Invalid faction.');

  // Prevent multiple open elections
  const existing = await FactionElection.findOne({ faction, isClosed:false, endsAt: { $gt: new Date() } });
  if (existing) throw new Error('An election is already running for this faction.');

  const channelId = channelIdForFaction(faction);
  const ch = channelId ? await client.channels.fetch(channelId) : null;
  if (!ch?.isTextBased()) throw new Error(`Faction channel not found for ${faction}.`);

  // Candidate list = all Players in the faction (at start time)
  const candidates = await Player.find({ faction }).lean();
  if (!candidates.length) throw new Error('No eligible candidates in this faction.');

  const endsAt = new Date(Date.now() + DAY_MS);
  const election = await FactionElection.create({
    faction, channelId, endsAt
  });

  // Try to resolve display names (fallback to id)
  const labels = await Promise.all(candidates.map(async p => {
    try {
      const m = await guild.members.fetch(p.discordId);
      return { id:p.discordId, label: m?.displayName || m?.user?.username || p.discordId };
    } catch { return { id:p.discordId, label: p.discordId }; }
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`mgrVote:${election._id.toString()}`)
    .setPlaceholder('Pick your manager')
    .setMinValues(1).setMaxValues(1)
    .addOptions(labels.slice(0,25).map(o=>({ label:o.label, value:o.id }))); // Discord limit 25 options

  const embed = createEmbed({
    title: `🗳️ ${factionDisplay(faction)} — Manager Vote`,
    description:
      `Vote to elect your **Faction Manager** (spending authority)!\n\n` +
      `• Voting ends <t:${Math.floor(endsAt.getTime()/1000)}:R>\n` +
      `• You can change your vote until it closes.\n` +
      `• Winner becomes manager for **1 week**.`,
    timestamp: true
  });

  const msg = await ch.send({ embeds:[embed], components:[new ActionRowBuilder().addComponents(menu)] });
  election.messageId = msg.id;
  await election.save();

  return { electionId: election._id.toString(), channelId };
}

/** Record or change a vote. */
export async function castManagerVote(electionId, voterId, candidateId) {
  const el = await FactionElection.findById(electionId);
  if (!el || el.isClosed) throw new Error('This election is closed or invalid.');
  if (new Date(el.endsAt) <= new Date()) throw new Error('This election has ended.');

  const [voter, candidate] = await Promise.all([
    Player.findOne({ discordId: voterId }),
    Player.findOne({ discordId: candidateId })
  ]);
  if (!voter?.faction || voter.faction !== el.faction) throw new Error('You are not in this faction.');
  if (!candidate?.faction || candidate.faction !== el.faction) throw new Error('Invalid candidate.');

  // Upsert vote
  const idx = el.votes.findIndex(v=>v.voterId===voterId);
  if (idx>=0) { el.votes[idx].candidateId = candidateId; el.votes[idx].at = new Date(); }
  else { el.votes.push({ voterId, candidateId }); }

  await el.save();
  return true;
}

/** Close & resolve an election (auto after 24h or via watchdog). */
export async function closeElection(client, electionId) {
  const el = await FactionElection.findById(electionId);
  if (!el || el.isClosed) return null;

  // If still before end, do nothing (caller should guard)
  if (new Date(el.endsAt) > new Date()) return null;

  el.isClosed = true;

  // Tally
  const tally = new Map();
  for (const v of el.votes) tally.set(v.candidateId, (tally.get(v.candidateId)||0)+1);
  // Pick winner
  let winnerId = null, best = -1;
  for (const [cid, count] of tally.entries()){
    if (count > best || (count===best && String(cid) < String(winnerId))) {
      winnerId = cid; best = count;
    }
  }
  // If no votes, keep manager empty
  el.winnerId = winnerId || null;
  await el.save();

  // Write manager into FactionBank (1 week tenure)
  if (winnerId){
    const bank = await (FactionBank.findOne({ faction: el.faction }) || FactionBank.create({ faction: el.faction }));
    bank.managerDiscordId  = winnerId;
    bank.managerValidUntil = new Date(Date.now() + WEEK_MS);
    await bank.save();
  }

  // Edit ballot message (disable menu)
  try{
    const ch = await client.channels.fetch(el.channelId);
    const msg = await ch.messages.fetch(el.messageId);
    const winnerTag = winnerId ? `<@${winnerId}>` : '_No votes — no manager elected_';

    await msg.edit({
      embeds: [createEmbed({
        title: `✅ ${factionDisplay(el.faction)} — Manager Vote Result`,
        description:
          `**Winner:** ${winnerTag}\n` +
          (winnerId ? `Manager authority valid until <t:${Math.floor((Date.now()+WEEK_MS)/1000)}:R>.` : ''),
        timestamp: true
      })],
      components: [] // remove the menu
    });
  }catch{ /* ignore */ }

  return winnerId;
}

/** Periodic watcher to auto-close ended elections. Call once on ready. */
export function initFactionManagerWatcher(client){
  setInterval(async ()=>{
    const open = await FactionElection.find({ isClosed:false, endsAt: { $lte: new Date() } }).lean();
    for (const e of open){
      try{ await closeElection(client, e._id); }catch{}
    }
  }, 60_000);
}

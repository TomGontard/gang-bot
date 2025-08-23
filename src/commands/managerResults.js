// src/commands/managerResults.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import FactionElection from '../data/models/FactionElection.js';
import FactionBank from '../data/models/FactionBank.js';
import factionsConfig from '../config/factions.js';
import { closeElection } from '../services/managerService.js';
import { createEmbed } from '../utils/createEmbed.js';

function factionDisplay(name){
  return factionsConfig.find(f=>f.name===name)?.displayName || name;
}

export const data = new SlashCommandBuilder()
  .setName('manager_results')
  .setDescription('Shows detailed manager vote results for a faction and finalizes if finished.')
  .addStringOption(o=>o.setName('faction')
    .setDescription('Faction')
    .setRequired(true)
    .addChoices(
      { name:'Red', value:'Red' },
      { name:'Blue', value:'Blue' },
      { name:'Green', value:'Green' }
    ))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction){
  const faction = interaction.options.getString('faction', true);

  // ✅ Safe against double defer (if the handler already deferred, do not defer again)
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply(); // public in the current channel
  }

  // Fetch the latest election for this faction
  let el = await FactionElection.findOne({ faction }).sort({ endsAt: -1 });
  if (!el) return interaction.editReply({ content: '❌ No election found for this faction.' });

  // If not closed and already finished, close it (also updates FactionBank)
  if (!el.isClosed && new Date(el.endsAt) <= new Date()) {
    await closeElection(interaction.client, el._id);
    el = await FactionElection.findById(el._id); // reloaded with winnerId/isClosed
  }

  if (!el.isClosed && new Date(el.endsAt) > new Date()) {
    const unix = Math.floor(new Date(el.endsAt).getTime()/1000);
    return interaction.editReply({ content: `⏳ The vote is still running (ends <t:${unix}:R>).` });
  }

  // Tally
  const tally = new Map();
  for (const v of el.votes) tally.set(v.candidateId, (tally.get(v.candidateId)||0)+1);
  const sorted = [...tally.entries()]
    .sort((a,b)=> b[1]-a[1] || (String(a[0]) < String(b[0]) ? -1 : 1));
  const winnerId = el.winnerId || (sorted[0]?.[0] ?? null);

  // Resolve display labels
  const labeled = await Promise.all(sorted.map(async ([id,count])=>{
    try{
      const m = await interaction.guild.members.fetch(id);
      const label = m?.displayName || m?.user?.username || id;
      return { id, label, count };
    }catch{ return { id, label: id, count }; }
  }));

  // Manager info in DB
  const bank = await FactionBank.findOne({ faction });
  const validStr = bank?.managerValidUntil
    ? `<t:${Math.floor(new Date(bank.managerValidUntil).getTime()/1000)}:R>`
    : '—';

  const lines = labeled.length
    ? labeled.map(x=>`• <@${x.id}> — **${x.count}**`).join('\n')
    : '_No votes_';

  const embed = createEmbed({
    title: `🧾 Results — ${factionDisplay(faction)}`,
    description:
      (winnerId ? `**Winner**: <@${winnerId}>\n` : '**Winner**: _none_ (0 votes)\n') +
      (winnerId ? `**Manager valid until**: ${validStr}\n\n` : '\n') +
      `**Vote breakdown**:\n${lines}`,
    timestamp: true
  });

  return interaction.editReply({ embeds:[embed] });
}

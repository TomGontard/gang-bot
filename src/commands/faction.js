// src/commands/faction.js
import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import Player from '../data/models/Player.js';
import Faction from '../data/models/Faction.js';
import factionsConfig from '../config/factions.js';
import { createEmbed } from '../utils/createEmbed.js';

const FACTION_CHOICES = factionsConfig.map(f => ({ name: f.name, value: f.name }));
const factionDisplay = name => factionsConfig.find(f => f.name === name)?.displayName || name;

export const data = new SlashCommandBuilder()
  .setName('faction')
  .setDescription('Admin: move a user to another faction and sync roles.')
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription('User to move')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('name')
      .setDescription('Target faction (Red, Blue, Green)')
      .setRequired(true)
      .addChoices(...FACTION_CHOICES)
  );

export async function execute(interaction) {
  // DO NOT defer here (already deferred in interactionHandler)

  // Admin gate
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.editReply({ content: '❌ Admins only.' });
  }

  const targetUser = interaction.options.getUser('user', true);
  const targetFaction = interaction.options.getString('name', true); // 'Red' | 'Blue' | 'Green'
  const factionCfg = factionsConfig.find(f => f.name === targetFaction);
  if (!factionCfg) {
    return interaction.editReply({ content: '❌ Invalid faction name.' });
  }

  // Ensure Player doc
  let player = await Player.findOne({ discordId: targetUser.id });
  if (!player) player = await Player.create({ discordId: targetUser.id });

  const beforeFaction = player.faction || 'Neutral';
  if (beforeFaction === targetFaction) {
    return interaction.editReply({ content: `ℹ️ ${targetUser} is already in **${factionDisplay(targetFaction)}**.` });
  }

  // Ensure Faction docs exist
  let newFactionDoc = await Faction.findOne({ name: targetFaction });
  if (!newFactionDoc) newFactionDoc = await Faction.create({
    name: targetFaction,
    displayName: factionDisplay(targetFaction),
    color: factionsConfig.find(f => f.name === targetFaction)?.color || '#ffffff',
    membersCount: 0,
    warOngoing: false
  });

  // Decrement old faction count (if any)
  if (player.faction) {
    const oldFactionDoc = await Faction.findOne({ name: player.faction });
    if (oldFactionDoc) {
      oldFactionDoc.membersCount = Math.max(0, (oldFactionDoc.membersCount || 0) - 1);
      await oldFactionDoc.save();
    }
  }

  // Assign new faction & increment count (admin override — no balance checks)
  player.faction = targetFaction;
  player.lastFactionChange = new Date();
  await player.save();

  newFactionDoc.membersCount = (newFactionDoc.membersCount || 0) + 1;
  await newFactionDoc.save();

  // Sync Discord roles
  const member = await interaction.guild.members.fetch(targetUser.id);
  const allFactionRoleIds = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);

  try { if (allFactionRoleIds.length) await member.roles.remove(allFactionRoleIds); } catch {} // ignore if absent
  const newRoleId = process.env[factionCfg.roleEnvVar];
  if (newRoleId) { try { await member.roles.add(newRoleId); } catch {} }

  // Build response
  const embed = createEmbed({
    title: '✅ Faction Updated',
    description:
      `User: ${targetUser}\n` +
      `From: **${factionDisplay(beforeFaction)}** → To: **${factionDisplay(targetFaction)}**\n` +
      (newRoleId ? 'Roles synced successfully.' : '⚠️ No role env var set for this faction; role not updated.'),
    timestamp: true
  });

  return interaction.editReply({ embeds: [embed] });
}

// Optional default export (some loaders expect default)
export default { data, execute };

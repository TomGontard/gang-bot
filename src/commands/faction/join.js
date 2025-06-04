// src/commands/faction/join.js
import { SlashCommandBuilder } from 'discord.js';
import Player from '../../data/models/Player.js';
import { getNFTCount } from '../../services/nftService.js';
import {
  canJoinFaction,
  assignFactionToPlayer,
  getFactionByName
} from '../../services/factionService.js';
import metrics from '../../config/metrics.js';

const ROLE_RED_ID   = process.env.ROLE_RED_FACTION_ID;
const ROLE_BLUE_ID  = process.env.ROLE_BLUE_FACTION_ID;
const ROLE_GREEN_ID = process.env.ROLE_GREEN_FACTION_ID;

const FACTION_ROLE_MAP = {
  Red: ROLE_RED_ID,
  Blue: ROLE_BLUE_ID,
  Green: ROLE_GREEN_ID
};

export const data = new SlashCommandBuilder()
  .setName('faction-join')
  .setDescription('Join one of the three factions (requires at least 1 Genesis NFT)')
  .addStringOption(opt =>
    opt
      .setName('name')
      .setDescription('Faction name to join (Red/Blue/Green)')
      .setRequired(true)
      .addChoices(
        { name: '🔴 Red',   value: 'Red' },
        { name: '🔵 Blue',  value: 'Blue' },
        { name: '🟢 Green', value: 'Green' }
      )
  );

export async function execute(interaction) {
  const discordId = interaction.user.id;
  const chosenName = interaction.options.getString('name');

  // 1) Check NFT requirement
  const nftCount = await getNFTCount(discordId);
  if (nftCount < 1) {
    return interaction.reply({
      content: '❌ You need at least 1 Genesis Pass NFT to join a faction.',
      ephemeral: true
    });
  }

  // 2) Ensure faction exists
  const faction = await getFactionByName(chosenName);
  if (!faction) {
    return interaction.reply({
      content: `❌ Faction "${chosenName}" does not exist.`,
      ephemeral: true
    });
  }

  // 3) Fetch or create Player
  let player = await Player.findOne({ discordId });
  if (!player) {
    player = await Player.create({ discordId });
  }

  // 4) Enforce join cooldown: if last change is too recent, block
  if (player.lastFactionChange) {
    const elapsed = Date.now() - new Date(player.lastFactionChange).getTime();
    if (elapsed < metrics.factionChangeCooldown) {
      const nextAllowed = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
      return interaction.reply({
        content: `⏳ You must wait until <t:${Math.floor(nextAllowed.getTime()/1000)}:R> before joining a faction again.`,
        ephemeral: true
      });
    }
  }

  try {
    // 5) Check the ±3 member rule
    const allowed = await canJoinFaction(chosenName);
    if (!allowed) {
      return interaction.reply({
        content: '❌ Cannot join that faction: it would unbalance the roster (difference > 3).',
        ephemeral: true
      });
    }

    // 6) Assign (or switch) faction in DB and update lastFactionChange
    await assignFactionToPlayer(player, chosenName);
    player.lastFactionChange = new Date();
    await player.save();

    // 7) Sync roles in Discord
    const member = await interaction.guild.members.fetch(discordId);
    const rolesToRemove = [ROLE_RED_ID, ROLE_BLUE_ID, ROLE_GREEN_ID].filter(r => r);
    await member.roles.remove(rolesToRemove);

    const newRoleId = FACTION_ROLE_MAP[chosenName];
    if (newRoleId) {
      await member.roles.add(newRoleId);
    }

    return interaction.reply({
      content: `✅ You have successfully joined **${chosenName}**!`,
      ephemeral: true
    });
  } catch (err) {
    console.error('Error in /faction join:', err);
    return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
  }
}

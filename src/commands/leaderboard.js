// src/commands/leaderboard.js
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../data/models/Player.js';
import { getNFTCount } from '../services/nftService.js';
import factionsConfig from '../config/factions.js';
import { createEmbed } from '../utils/createEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Display the top players by XP with pagination.');

export async function execute(interaction) {
  const { embed, components } = await buildLeaderboard(0, interaction);
  await interaction.editReply({ embeds: [embed], components });
}

/**
 * Map faction name to a circle emoji
 */
function factionEmoji(factionName) {
  switch (factionName) {
    case 'Red':   return '🔴';
    case 'Blue':  return '🔵';
    case 'Green': return '🟢';
    default:      return '⚪';
  }
}

export async function buildLeaderboard(page, interaction) {
  const pageSize = 10;
  const skip = page * pageSize;

  const totalPlayers = await Player.countDocuments();
  const players = await Player.find()
    .sort({ xp: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean();

  // Find your rank
  const me = await Player.findOne({ discordId: interaction.user.id });
  const myRank = me
    ? (await Player.countDocuments({ xp: { $gt: me.xp } })) + 1
    : '—';

  let description = '';

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const rank = skip + i + 1;
    // get faction circle
    const emoji = factionEmoji(p.faction);
    description +=
      `\`${rank}.\` ${emoji} <@${p.discordId}> ` +
      `(Lvl ${p.level}) — XP: ${p.xp} | Coins: ${p.coins}\n`;
  }

  if (!description) {
    description = '_No players to show on this page._\n';
  }

  description += `\nYour rank: **${myRank}** / **${totalPlayers}**`;

  const embed = createEmbed({
    title: '🏆 Leaderboard',
    description,
    interaction
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`leaderPrev:${page}:${interaction.user.id}`)
      .setLabel('◀️ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`leaderNext:${page}:${interaction.user.id}`)
      .setLabel('Next ▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(skip + players.length >= totalPlayers)
  );

  return { embed, components: [row] };
}

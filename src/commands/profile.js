// src/commands/profile.js
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../data/models/Player.js';
import { getNFTCount, getBoosts } from '../services/nftService.js';
import { getActiveMissionsCount, getClaimableMissionsCount, getMaxConcurrentMissions } from '../services/missionService.js';
import metrics from '../config/metrics.js';
import factionsConfig from '../config/factions.js';
import { createEmbed } from '../utils/createEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Display your GangBot profile (level & XP info).');

export async function execute(interaction) {
  const discordId = interaction.user.id;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // Determine faction displayName
  const factionEntry = factionsConfig.find(f => f.name === player.faction);
  const factionDisplay = factionEntry?.displayName ?? 'None';

  // NFT count, boosts, and concurrency
  const nftCount = await getNFTCount(discordId);
  const { xpBoost, coinsBoost } = getBoosts(nftCount);
  const maxConcurrent = await getMaxConcurrentMissions(nftCount);

  // XP to next level
  const nextThreshold = metrics.levelThresholds[player.level + 1] ?? Infinity;
  const xpToNext = nextThreshold !== Infinity ? `${Math.max(0, nextThreshold - player.xp)}` : '—';

  // Active & claimable missions
  const activeCount = await getActiveMissionsCount(discordId);
  const claimableCount = await getClaimableMissionsCount(discordId);

  const fields = [
    { name: '🔑 Discord ID',          value: player.discordId, inline: true },
    { name: '🏷️ Faction',             value: factionDisplay, inline: true },
    { name: '📈 Level',               value: `${player.level}`, inline: true },
    // Spacer
    { name: '​',                       value: '​', inline: false },
    { name: '🗡️ XP',                 value: `${player.xp}${xpToNext !== '—' ? ` (Next ${xpToNext})` : ''}`, inline: true },
    { name: '💰 Coins',               value: `${player.coins}`, inline: true },
    { name: '❤️‍🩹 HP',                value: `${player.hp}/${player.hpMax}`, inline: true },
    // Spacer
    { name: '​',                       value: '​', inline: false },
    { name: '🔑 NFTs',                value: `${nftCount} (Max: ${maxConcurrent})`, inline: true },
    { name: '📊 Boosts',              value: `• XP: ${(xpBoost*100).toFixed(0)}%\n• Coins: ${(coinsBoost*100).toFixed(0)}%`, inline: true },
    { name: '🎯 Active Missions',      value: `${activeCount} / ${maxConcurrent}`, inline: true },
    // Spacer
    { name: '​',                       value: '​', inline: false },
    { name: '📬 Claimable Missions',  value: `${claimableCount}`, inline: true },
    { name: '⚙️ Unassigned Points',   value: `${player.unassignedPoints}`, inline: true }
  ];

  const embed = createEmbed({
    title: `🕵️‍♂️ Profile: ${interaction.user.username}`,
    description: 'Your current status and stats:',
    fields,
    interaction
  });

  // Buttons row
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`openAttributes:${discordId}`).setLabel('Attributes').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`openHealing:${discordId}`).setLabel('Healing').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`openMissions:${discordId}`).setLabel('Missions').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`openFactions:${discordId}`).setLabel('Factions').setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({ embeds: [embed], components: [row1], ephemeral: true });
}

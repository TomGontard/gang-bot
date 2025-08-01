// src/commands/profile.js
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../data/models/Player.js';
import Inventory from '../data/models/Inventory.js';
import { calculateTotalStats } from '../services/itemService.js';
import { getNFTCount, getBoosts } from '../services/nftService.js';
import {
  getActiveMissionsCount,
  getClaimableMissionsCount,
  getMaxConcurrentMissions
} from '../services/missionService.js';
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

  // 🔁 Update hpMax based on vitality (baseStats + equipment)
  const totalStats = await calculateTotalStats(player);
  player.hpMax = 100 + totalStats.vitalite + 1 * (player.level - 1);
  await player.save();

  const higherXpCount = await Player.countDocuments({ xp: { $gt: player.xp } });
  const totalPlayers  = await Player.countDocuments();
  const rank          = higherXpCount + 1;

  const factionEntry   = factionsConfig.find(f => f.name === player.faction);
  const factionDisplay = factionEntry?.displayName ?? 'None';

  const nftCount       = await getNFTCount(discordId);
  const { xpBoost, coinsBoost } = getBoosts(nftCount);
  const maxConcurrent  = await getMaxConcurrentMissions(nftCount);

  const nextThreshold = metrics.levelThresholds[player.level + 1] ?? Infinity;
  const xpToNext      = nextThreshold !== Infinity
    ? `${Math.max(0, nextThreshold - player.xp)}`
    : '—';

  const activeCount    = await getActiveMissionsCount(discordId);
  const claimableCount = await getClaimableMissionsCount(discordId);

  const fields = [
    { name: '🔢 Rank',                value: `${rank} / ${totalPlayers}`, inline: true },
    { name: '🔑 Discord ID',         value: player.discordId, inline: true },
    { name: '🏷️ Faction',            value: factionDisplay, inline: true },

    { name: '📈 Level',              value: `${player.level}`, inline: true },
    { name: '🗡️ XP',                value: `${player.xp}${xpToNext !== '—' ? ` (Next ${xpToNext})` : ''}`, inline: true },
    { name: '💰 Coins',              value: `${player.coins}`, inline: true },

    { name: '❤️‍🩹 HP',               value: `${player.hp}/${player.hpMax}`, inline: true },
    { name: '🔑 NFTs',               value: `${nftCount} (Max: ${maxConcurrent})`, inline: true },
    { name: '📊 Boosts',             value: `• XP: ${(xpBoost*100).toFixed(0)}%\n• Coins: ${(coinsBoost*100).toFixed(0)}%`, inline: true },

    { name: '🎯 Active Missions',    value: `${activeCount} / ${maxConcurrent}`, inline: true },
    { name: '📬 Claimable Missions', value: `${claimableCount}`, inline: true },
    { name: '⚙️ Unassigned Points',  value: `${player.unassignedPoints}`, inline: true }
  ];

  const embed = createEmbed({
    title: `🕵️‍♂️ Profile: ${interaction.user.username}`,
    description: 'Your current status and stats:',
    fields,
    interaction
  });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`openAttributes:${discordId}`)
      .setLabel('Attributes')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`openHealing:${discordId}`)
      .setLabel('Healing')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`openMissions:${discordId}`)
      .setLabel('Missions')
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`openFactions:${discordId}`)
      .setLabel('Factions')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`openInventory:${discordId}:0`)
      .setLabel('Inventory')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`openShop:${discordId}:0`)
      .setLabel('Shop')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2]
  });
}

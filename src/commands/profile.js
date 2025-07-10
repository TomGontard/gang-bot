// src/commands/profile.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import Player from '../data/models/Player.js';
import {
  getNFTCount,
  getBoosts
} from '../services/nftService.js';
import {
  getActiveMissionsCount,
  getClaimableMissionsCount,
  getMaxConcurrentMissions
} from '../services/missionService.js';
import metrics from '../config/metrics.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Display your Bandit profile (with level & XP info).');

export async function execute(interaction) {
  const discordId = interaction.user.id;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // NFT count and boosts
  const nftCount = await getNFTCount(discordId);
  const { xpBoost, coinsBoost } = getBoosts(nftCount);
  const maxConcurrent = await getMaxConcurrentMissions(nftCount);

  // XP to next level
  const currentLevel = player.level;
  const nextLevel = currentLevel + 1;
  const nextThreshold = metrics.levelThresholds[nextLevel] ?? null;
  let xpToNext = '—';
  if (
    nextThreshold !== null &&
    nextThreshold !== undefined &&
    nextThreshold !== Infinity
  ) {
    xpToNext = `${Math.max(0, nextThreshold - player.xp)}`;
  }

  // Count active and claimable missions
  const activeCount = await getActiveMissionsCount(discordId);
  const claimableCount = await getClaimableMissionsCount(discordId);

  const embed = new EmbedBuilder()
    .setColor(0xdd2e44)
    .setTitle(`🕵️‍♂️ Profile: ${interaction.user.username}`)
    .addFields(
      { name: '🔑 Discord ID', value: player.discordId, inline: true },
      { name: '🏷️ Faction', value: player.faction || 'None', inline: true },
      { name: '📈 Level', value: `${player.level}`, inline: true },
      {
        name: '🗡️ XP',
        value:
          `${player.xp}` +
          (xpToNext !== '—' ? ` (Next in ${xpToNext} XP)` : ''),
        inline: true
      },
      { name: '💰 Coins', value: `${player.coins}`, inline: true },
      { name: '❤️‍🩹 HP', value: `${player.hp}/${player.hpMax}`, inline: true },
      {
        name: '🔑 NFTs',
        value: `${nftCount} (Max missions: ${maxConcurrent})`,
        inline: true
      },
      {
        name: '📊 Boosts',
        value:
          `• XP Boost: ${(xpBoost * 100).toFixed(0)}%\n` +
          `• Coins Boost: ${(coinsBoost * 100).toFixed(0)}%`,
        inline: true
      },
      {
        name: '🎯 Active Missions',
        value: `${activeCount} / ${maxConcurrent}`,
        inline: true
      },
      {
        name: '📬 Claimable Missions',
        value: `${claimableCount}`,
        inline: true
      },
      {
        name: '⚙️ Unassigned Points',
        value: `${player.unassignedPoints}`,
        inline: true
      }
    )
    .setFooter({
      text: 'Each level grants 10 attribute points and 1 Vitality point.'
    })
    .setTimestamp();

  // Row1: Attributes | Healing | Missions | Factions
  const attrBtn = new ButtonBuilder()
    .setCustomId(`openAttributes:${discordId}`)
    .setLabel('Attributes')
    .setStyle(ButtonStyle.Primary);

  const healingBtn = new ButtonBuilder()
    .setCustomId(`openHealing:${discordId}`)
    .setLabel('Healing')
    .setStyle(ButtonStyle.Success);

  // SINGLE “Missions” button now opens the Missions menu
  const missionBtn = new ButtonBuilder()
    .setCustomId(`openMissions:${discordId}`)
    .setLabel('Missions')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(false); // always enabled; internal checks happen in missionHandler

  const factionBtn = new ButtonBuilder()
    .setCustomId(`openFactions:${discordId}`)
    .setLabel('Factions')
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    attrBtn,
    healingBtn,
    missionBtn,
    factionBtn
  );

  return interaction.reply({
    embeds: [embed],
    components: [row1],
    ephemeral: true
  });
}

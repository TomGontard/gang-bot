// src/commands/profile.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../data/models/Player.js';
import { getNFTCount, getBoosts } from '../services/nftService.js';
import metrics from '../config/metrics.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Display your Bandit profile (with level & XP info).');

export async function execute(interaction) {
  const discordId = interaction.user.id;

  let player = await Player.findOne({ discordId });
  if (!player) {
    player = await Player.create({ discordId });
  }

  // Fetch NFT count and boosts
  const nftCount = await getNFTCount(discordId);
  const { xpBoost, coinsBoost, maxConcurrentMissions } = getBoosts(nftCount);

  // Compute XP to next level
  const currentLevel = player.level;
  const nextLevel = currentLevel + 1;
  const nextThreshold = metrics.levelThresholds[nextLevel] ?? null;
  let xpToNext = '—';
  if (nextThreshold !== null && nextThreshold !== undefined && nextThreshold !== Infinity) {
    xpToNext = `${Math.max(0, nextThreshold - player.xp)}`;
  }

  const embed = new EmbedBuilder()
    .setColor(0xdd2e44)
    .setTitle(`🕵️‍♂️ Profile: ${interaction.user.username}`)
    .addFields(
      { name: '🔑 Discord ID',     value: player.discordId, inline: true },
      { name: '🏷️ Faction',        value: player.faction || 'None', inline: true },
      { name: '📈 Level',          value: `${player.level}`, inline: true },
      {
        name: '🗡️ XP',
        value: `${player.xp}` + (xpToNext !== '—' ? ` (Next in ${xpToNext} XP)` : ''),
        inline: true
      },
      { name: '💰 Coins',          value: `${player.coins}`, inline: true },
      { name: '❤️‍🩹 HP',           value: `${player.hp}/${player.hpMax}`, inline: true },
      {
        name: '🔑 NFTs',
        value: `${nftCount} (Max missions: ${maxConcurrentMissions})`,
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
        name: '⚙️ Unassigned Points',
        value: `${player.unassignedPoints}`,
        inline: true
      }
    )
    .setFooter({ text: 'Each level grants 10 attribute points. Vitality/Wisdom cost 2 points each.' })
    .setTimestamp();

  // Add an "Attributes" button
  const attrBtn = new ButtonBuilder()
    .setCustomId(`openAttributes:${discordId}`)
    .setLabel('Attributes')
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(attrBtn);

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

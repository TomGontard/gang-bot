// src/handlers/buttonHandlers/missionHandler.js
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import Player from '../../data/models/Player.js';
import { createEmbed } from '../../utils/createEmbed.js';
import {
  startMission,
  getActiveMissionsCount,
  getClaimableMissionsCount,
  claimMissionRewards,
  getMaxConcurrentMissions
} from '../../services/missionService.js';
import { getNFTCount, getBoosts } from '../../services/nftService.js';
import { calculateTotalStats } from '../../services/itemService.js';
import missionsConfig from '../../config/missions.js';

const OPEN   = 'openMissions';
const LAUNCH = 'launchMission';
const VIEW   = 'viewMissions';
const SELECT = 'selectMission';
const CLAIM  = 'claimMissions';

function buildBar(percent) {
  const filled = '█'.repeat(Math.floor((percent / 100) * 10));
  const empty  = '░'.repeat(10 - filled.length);
  return `\`${filled}${empty}\` ${percent.toFixed(0)}%`;
}

export default async function missionHandler(interaction) {
  const [action, discordId] = interaction.customId.split(':');

  if (interaction.user.id !== discordId) {
    return interaction.reply({
      content: '❌ You cannot manage missions for another user.',
      ephemeral: true
    });
  }

  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  const nftCount       = await getNFTCount(discordId);
  const { xpBoost, coinsBoost } = getBoosts(nftCount);
  const totalStats     = await calculateTotalStats(player);
  const maxConc        = await getMaxConcurrentMissions(nftCount);
  const activeCount    = await getActiveMissionsCount(discordId);
  const claimableCount = await getClaimableMissionsCount(discordId);

  // 1️⃣ OPEN MENU
  if (action === OPEN) {
    const available = Object.values(missionsConfig)
      .filter(m => player.level >= m.minLevel)
      .map(m => `${m.displayName} (Lvl≥${m.minLevel})`)
      .join(', ') || 'None';

    const embed = createEmbed({
      title: '🗂️ Missions Menu',
      description:
        `**HP:** ${player.hp}/${player.hpMax}\n` +
        `**Concurrent:** ${activeCount}/${maxConc}\n` +
        `**NFT Bonus:** +${(xpBoost*100).toFixed(0)}% XP, ` +
          `+${(coinsBoost*100).toFixed(0)}% Coins\n` +
        `**Wisdom:** +${totalStats.sagesse}% XP • ` +
          `**Luck:** +${totalStats.chance}% Coins • ` +
          `**Agility:** -${totalStats.agilite}% HP cost\n\n` +
        `**Available (${available.split(', ').length}):** ${available}`
    });

    const launchBtn = new ButtonBuilder()
      .setCustomId(`${LAUNCH}:${discordId}`)
      .setLabel('Launch Mission')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(activeCount >= maxConc || nftCount < 1);

    const viewBtn = new ButtonBuilder()
      .setCustomId(`${VIEW}:${discordId}`)
      .setLabel('Ongoing Missions')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(activeCount === 0);

    const claimBtn = new ButtonBuilder()
      .setCustomId(`${CLAIM}:${discordId}`)
      .setLabel(`Claim Missions (${claimableCount})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(claimableCount === 0);

    const row = new ActionRowBuilder().addComponents(launchBtn, viewBtn, claimBtn);

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // 2️⃣ LAUNCH → dropdown
  if (action === LAUNCH) {
    if (nftCount < 1) {
      const embed = createEmbed({
        title: '❌ Cannot Launch',
        description: 'You need at least **1 Genesis Pass NFT** to start missions.'
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const options = Object.entries(missionsConfig)
      .filter(([, m]) => player.level >= m.minLevel)
      .map(([key, m]) => {
        const raw       = m.hpCostRange[1];
        const reduction = Math.round(raw * totalStats.agilite / 100);
        const cost      = Math.max(1, raw - reduction);
        if (player.hp < cost) return null;
        return {
          label: m.displayName,
          description: `Lvl≥${m.minLevel} • ${m.durationMs/3600000}h • HP ${cost}`,
          value: key
        };
      })
      .filter(Boolean);

    if (!options.length) {
      const embed = createEmbed({
        title: '❌ No Missions',
        description: 'Level too low or insufficient HP.'
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${SELECT}:${discordId}`)
      .setPlaceholder('Select a mission')
      .addOptions(options);

    const embed = createEmbed({
      title: '🚀 Choose a Mission',
      description: `Available HP: ${player.hp}`,
      fields: [{ name: 'Options', value: `${options.length}`, inline: true }]
    });

    return interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  // 3️⃣ VIEW ongoing missions (new ephemeral reply)
  if (action === VIEW) {
    const now = Date.now();
    const ActiveMission = (await import('../../data/models/ActiveMission.js')).default;
    const running = await ActiveMission.find({
      discordId, endAt: { $gt: now }, claimed: false
    }).lean();

    if (!running.length) {
      const embed = createEmbed({
        title: 'ℹ️ No Active Missions',
        description: 'You have no missions in progress.'
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = createEmbed({ title: '⏳ Ongoing Missions', description: '' });
    for (const m of running) {
      const def = missionsConfig[m.missionType] || {};
      const pct = Math.min(100, ((now - m.startAt) / (m.endAt - m.startAt)) * 100);
      embed.addFields({
        name: def.displayName,
        value: `Ends <t:${Math.floor(m.endAt/1000)}:R> • ` +
               `HP: ${m.hpCost} • ${buildBar(pct)}`,
        inline: false
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 4️⃣ CLAIM finished missions (new ephemeral reply)
  if (action === CLAIM) {
    try {
      const results = await claimMissionRewards(discordId);
      const description = results
        .map(r => `• **${r.missionType}** → ${r.xpReward} XP, ` +
                  `${r.coinReward} coins${r.levelsGained ? `, +${r.levelsGained} lvl` : ''}`)
        .join('\n');
      const embed = createEmbed({ title: '🎉 Missions Claimed', description });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const embed = createEmbed({ title: '❌ Error', description: err.message });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // 5️⃣ SELECT from dropdown — edit that same ephemeral message
  if (action === SELECT) {
    await interaction.deferUpdate();  // acknowledge

    const missionType = interaction.values[0];
    try {
      const am = await startMission({ discordId, missionType });
      const def = missionsConfig[missionType];
      const embed = createEmbed({
        title: '✅ Mission Started',
        description: `HP deducted: **${am.hpCost}**`,
        fields: [
          { name: 'Mission', value: def.displayName, inline: true },
          { name: 'Starts',  value: `<t:${Math.floor(am.startAt/1000)}:f>`, inline: true },
          { name: 'Ends',    value: `<t:${Math.floor(am.endAt/1000)}:f>`, inline: true },
          { name: 'XP',      value: `${am.xpReward}`, inline: true },
          { name: 'Coins',   value: `${am.coinReward}`, inline: true }
        ]
      });
      return interaction.editReply({ embeds: [embed], components: [] });
    } catch (err) {
      const embed = createEmbed({ title: '❌ Error', description: err.message });
      return interaction.editReply({ embeds: [embed], components: [] });
    }
  }
}

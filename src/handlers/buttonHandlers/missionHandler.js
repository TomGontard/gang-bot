// src/handlers/buttonHandlers/missionHandler.js
import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import metrics from '../../config/metrics.js';
import { createEmbed } from '../../utils/createEmbed.js';
import {
  startMission,
  getReservedHp,
  getActiveMissionsCount,
  getClaimableMissionsCount,
  claimMissionRewards,
  getMaxConcurrentMissions
} from '../../services/missionService.js';
import { getNFTCount } from '../../services/nftService.js';
import missionsConfig from '../../config/missions.js';

const OPEN_MISSIONS_PREFIX  = 'openMissions';
const LAUNCH_MISSION_PREFIX = 'launchMission';
const VIEW_MISSIONS_PREFIX  = 'viewMissions';
const SELECT_MISSION_PREFIX = 'selectMission';
const CLAIM_MISSIONS_PREFIX = 'claimMissions';

function buildProgressBar(percent) {
  const totalSegments = 10;
  const filledCount = Math.floor((percent / 100) * totalSegments);
  const emptyCount = totalSegments - filledCount;
  return `\`${'█'.repeat(filledCount)}${'░'.repeat(emptyCount)}\` ${percent.toFixed(0)}%`;
}

export default async function missionHandler(interaction) {
  const [action, targetId] = interaction.customId.split(':');
  if (interaction.user.id !== targetId) {
    return interaction.reply({ content: '❌ You cannot manage missions for another user.', ephemeral: true });
  }

  const discordId = targetId;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // 1) OPEN MENU
  if (action === OPEN_MISSIONS_PREFIX) {
    const nftCount       = await getNFTCount(discordId);
    const maxConcurrent  = await getMaxConcurrentMissions(nftCount);
    const activeCount    = await getActiveMissionsCount(discordId);
    const claimableCount = await getClaimableMissionsCount(discordId);

    const nextThreshold  = metrics.levelThresholds[player.level + 1] ?? Infinity;
    const xpToNext = nextThreshold !== Infinity ? `${Math.max(0, nextThreshold - player.xp)}` : '—';

    const description =
      `**HP:** ${player.hp}/${player.hpMax}\n` +
      `**XP to Next:** ${xpToNext}\n` +
      `**NFT Count:** ${nftCount}\n` +
      `**Max Concurrent:** ${maxConcurrent}\n` +
      `**Active:** ${activeCount}\n` +
      `**Claimable:** ${claimableCount}`;

    const fields = [
      {
        name: '▶️ Launch Mission',
        value: activeCount < maxConcurrent
          ? 'Choose a mission to launch below.'
          : '🔒 Max concurrent missions reached.',
        inline: false
      },
      {
        name: '⏳ Ongoing Missions',
        value: activeCount + claimableCount > 0
          ? 'View or claim below.'
          : 'No active or completed missions.',
        inline: false
      }
    ];

    const embed = createEmbed({ title: '🗂️ Missions Menu', description, fields, interaction });

    const launchBtn = new ButtonBuilder()
      .setCustomId(`${LAUNCH_MISSION_PREFIX}:${discordId}`)
      .setLabel('Launch Mission')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(activeCount >= maxConcurrent || nftCount < 3);

    const viewBtn = new ButtonBuilder()
      .setCustomId(`${VIEW_MISSIONS_PREFIX}:${discordId}`)
      .setLabel('Ongoing Missions')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(activeCount + claimableCount === 0);

    return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(launchBtn, viewBtn)], ephemeral: true });
  }

  // 2) LAUNCH
  if (action === LAUNCH_MISSION_PREFIX) {
    const nftCount = await getNFTCount(discordId);
    if (nftCount < 3) {
      const embed = createEmbed({ title: '❌ Cannot Launch', description: 'Need at least 3 NFTs to launch missions.', interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const maxConcurrent = await getMaxConcurrentMissions(nftCount);
    const activeCount   = await getActiveMissionsCount(discordId);
    if (activeCount >= maxConcurrent) {
      const embed = createEmbed({ title: '🔒 Max Missions', description: `You have ${activeCount}/${maxConcurrent}.`, interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const reservedHp  = await getReservedHp(discordId);
    const availableHp = player.hp - reservedHp;

    const options = Object.entries(missionsConfig).flatMap(([key, def]) => {
      if (player.level < def.minLevel) return [];
      const worstCost = Math.max(1, Math.floor(def.hpCostRange[1] * (1 - player.attributes.agilite * 0.01)));
      if (availableHp < worstCost) return [];
      const durationH = Math.floor(def.durationMs / 3_600_000);
      return [{ label: def.displayName, description: `Lvl≥${def.minLevel} • ${durationH}h • HP ${def.hpCostRange[0]}–${def.hpCostRange[1]}`, value: key }];
    });

    if (!options.length) {
      const embed = createEmbed({ title: '❌ No Missions', description: 'Level too low or insufficient HP.', interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${SELECT_MISSION_PREFIX}:${discordId}`)
      .setPlaceholder('Select a mission')
      .addOptions(options);

    const embed = createEmbed({ title: '🚀 Choose a Mission', description: `Available HP: ${availableHp}`, interaction });
    return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
  }

  // 3) VIEW
  if (action === VIEW_MISSIONS_PREFIX) {
    const activeCount    = await getActiveMissionsCount(discordId);
    const claimableCount = await getClaimableMissionsCount(discordId);
    if (activeCount + claimableCount === 0) {
      const embed = createEmbed({ title: 'ℹ️ No Missions', description: 'Nothing to view or claim.', interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let embed = createEmbed({ title: '⏳ Ongoing Missions', description: '', interaction });
    if (activeCount) {
      const now = Date.now();
      const ActiveMission = (await import('../../data/models/ActiveMission.js')).default;
      const activeMissions = await ActiveMission.find({ discordId, endAt: { $gt: now }, claimed: false }).lean();
      for (const m of activeMissions) {
        const def = missionsConfig[m.missionType] || {};
        const start = m.startAt.getTime(), end = m.endAt.getTime();
        const percent = Math.min(100, ((now - start) / (end - start)) * 100);
        embed.addFields({ name: def.displayName, value: `Ends <t:${Math.floor(end/1000)}:R>
HP Cost: ${m.hpCost}
Progress: ${buildProgressBar(percent)}`, inline: false });
      }
    }
    const components = [];
    if (claimableCount) {
      const claimBtn = new ButtonBuilder().setCustomId(`${CLAIM_MISSIONS_PREFIX}:${discordId}`).setLabel(`Claim (${claimableCount})`).setStyle(ButtonStyle.Primary);
      components.push(new ActionRowBuilder().addComponents(claimBtn));
    }
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  // 4) SELECT (START)
  if (action === SELECT_MISSION_PREFIX) {
    const missionType = interaction.values[0];
    try {
      const am = await startMission({ discordId, missionType });
      const def = missionsConfig[missionType];
      const description = `HP deducted: **${am.hpCost}**`;
      const fields = [
        { name: 'Mission', value: def.displayName, inline: true },
        { name: 'Starts',  value: `<t:${Math.floor(am.startAt.getTime()/1000)}:f>`, inline: true },
        { name: 'Ends',    value: `<t:${Math.floor(am.endAt.getTime()/1000)}:f>`, inline: true },
        { name: 'XP',      value: `${am.xpReward}`, inline: true },
        { name: 'Coins',   value: `${am.coinReward}`, inline: true }
      ];
      const embed = createEmbed({ title: '✅ Mission Started', description, fields, interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const embed = createEmbed({ title: '❌ Error', description: err.message, interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // 5) CLAIM
  if (action === CLAIM_MISSIONS_PREFIX) {
    try {
      const results = await claimMissionRewards(discordId);
      const description = results.map(r => `• **${r.missionType}** → ${r.xpReward} XP, ${r.coinReward} coins${r.levelsGained ? `, +${r.levelsGained} lvl` : ''}`).join('\n');
      const embed = createEmbed({ title: '🎉 Missions Claimed', description, interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const embed = createEmbed({ title: '❌ Error', description: err.message, interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}

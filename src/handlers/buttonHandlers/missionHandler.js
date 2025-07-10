// src/handlers/buttonHandlers/missionHandler.js
import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import metrics from '../../config/metrics.js';
import { createEmbed } from '../../utils/createEmbed.js';
import {
  startMission,
  getActiveMissionsCount,
  getClaimableMissionsCount,
  claimMissionRewards,
  getMaxConcurrentMissions
} from '../../services/missionService.js';
import { getNFTCount, getBoosts } from '../../services/nftService.js';
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

  // Common data
  const nftCount = await getNFTCount(discordId);
  const { xpBoost: nftXpBoost, coinsBoost: nftCoinBoost } = getBoosts(nftCount);
  const wisdomBoost = player.attributes.sagesse * 1;    // % XP per wisdom
  const luckBoost = player.attributes.chance * 1;        // % coins per luck
  const agilityReduction = player.attributes.agilite * 1; // % HP cost reduction
  const maxConcurrent = await getMaxConcurrentMissions(nftCount);
  const activeCount = await getActiveMissionsCount(discordId);
  const claimableCount = await getClaimableMissionsCount(discordId);

  // 1) OPEN MENU
  if (action === OPEN_MISSIONS_PREFIX) {
    const availableMissions = Object.values(missionsConfig)
      .filter(def => player.level >= def.minLevel)
      .map(def => `${def.displayName} (Lvl≥${def.minLevel})`);

    const embed = createEmbed({
      title: '🗂️ Missions Menu',
      description:
        `**HP:** ${player.hp}/${player.hpMax}
` + `**Concurrent:** ${activeCount}/${maxConcurrent}
` + `**Available Missions Type:** ${availableMissions.length}
` + `**NFT Boosts:** +${nftXpBoost*100}% XP, +${nftCoinBoost*100}% Coins
` + `**Wisdom Boost:** +${wisdomBoost}% XP
` + `**Luck Boost:** +${luckBoost}% Coins
` + `**Agility:** -${agilityReduction}% HP cost

` + `Missions: ${availableMissions.join(', ')}`,
      interaction
    });

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

  // 2) LAUNCH SELECT
  if (action === LAUNCH_MISSION_PREFIX) {
    const availableHp = player.hp; // HP now actual since cost deducted on start

    const options = Object.entries(missionsConfig)
      .filter(([_, def]) => player.level >= def.minLevel)
      .map(([key, def]) => {
        const rawCost = def.hpCostRange[1];
        const cost = Math.max(1, Math.floor(rawCost * (1 - agilityReduction * 0.01)));
        return (availableHp >= cost)
          ? { label: def.displayName, description: `Lvl≥${def.minLevel} • ${Math.floor(def.durationMs/3600000)}h • HP ${def.hpCostRange[0]}–${def.hpCostRange[1]}`, value: key }
          : null;
      })
      .filter(Boolean);

    if (!options.length) {
      const embed = createEmbed({ title: '❌ No Missions', description: 'Level too low or insufficient HP.', interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${SELECT_MISSION_PREFIX}:${discordId}`)
      .setPlaceholder('Select a mission')
      .addOptions(options);

    const embed = createEmbed({
      title: '🚀 Choose a Mission',
      description: `Available HP: ${availableHp}`,
      fields: [
        { name: 'Missions Type Available', value: `${options.length}`, inline: true }
      ],
      interaction
    });

    return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
  }

  // 3) VIEW
  if (action === VIEW_MISSIONS_PREFIX) {
    const activeMissions = await getActiveMissionsCount(discordId);
    const completedMissions = await getClaimableMissionsCount(discordId);
    if (!activeMissions && !completedMissions) {
      const embed = createEmbed({ title: 'ℹ️ No Missions', description: 'Nothing active or to claim.', interaction });
      return interaction.update({ embeds: [embed], components: [] });
    }

    const embed = createEmbed({ title: '⏳ Ongoing Missions', interaction });
    if (activeMissions) {
      const now = Date.now();
      const ActiveMission = (await import('../../data/models/ActiveMission.js')).default;
      const list = await ActiveMission.find({ discordId, endAt: { $gt: now }, claimed: false }).lean();
      list.forEach(m => {
        const def = missionsConfig[m.missionType] || {};
        const start = m.startAt.getTime(), end = m.endAt.getTime();
        const percent = Math.min(100, ((now - start)/(end - start))*100);
        embed.addFields({ name: def.displayName, value: `Ends <t:${Math.floor(end/1000)}:R> • HP Cost: ${m.hpCost} • ${buildProgressBar(percent)}`, inline: false });
      });
    }

    const components = [];
    if (completedMissions) {
      const claimBtn = new ButtonBuilder()
        .setCustomId(`${CLAIM_MISSIONS_PREFIX}:${discordId}`)
        .setLabel(`Claim (${completedMissions})`)
        .setStyle(ButtonStyle.Primary);
      components.push(new ActionRowBuilder().addComponents(claimBtn));
    }
    return interaction.update({ embeds: [embed], components });
  }

  // 4) SELECT / START
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

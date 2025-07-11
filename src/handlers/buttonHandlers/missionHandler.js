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
import missionsConfig from '../../config/missions.js';

const OPEN = 'openMissions';
const LAUNCH = 'launchMission';
const VIEW = 'viewMissions';
const SELECT = 'selectMission';
const CLAIM = 'claimMissions';

function buildBar(p) {
  const filled = '█'.repeat(Math.floor((p / 100) * 10));
  const empty  = '░'.repeat(10 - filled.length);
  return `\`${filled}${empty}\` ${p.toFixed(0)}%`;
}

export default async function missionHandler(interaction) {
  const [action, discordId] = interaction.customId.split(':');
  if (interaction.user.id !== discordId) {
    await interaction.deferUpdate();
    return;
  }

  // load player & common data
  await interaction.deferUpdate();
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  const nftCount        = await getNFTCount(discordId);
  const { xpBoost, coinsBoost } = getBoosts(nftCount);
  const agiReduc        = player.attributes.agilite;
  const maxConc         = await getMaxConcurrentMissions(nftCount);
  const activeCount     = await getActiveMissionsCount(discordId);
  const claimableCount  = await getClaimableMissionsCount(discordId);

  // 1) OPEN MENU
  if (action === OPEN) {
    const available = Object.values(missionsConfig)
      .filter(d => player.level >= d.minLevel)
      .map(d => `${d.displayName}(Lvl≥${d.minLevel})`)
      .join(', ') || 'None';

    const embed = createEmbed({
      title: '🗂️ Missions Menu',
      description:
        `**HP:** ${player.hp}/${player.hpMax}\n` +
        `**Concurrent:** ${activeCount}/${maxConc}\n` +
        `**NFT Boost:** +${xpBoost*100}% XP, +${coinsBoost*100}% Coins\n` +
        `**Agility:** -${agiReduc}% HP cost\n\n` +
        `**Available Types (${available.split(', ').length}):** ${available}`,
      interaction
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
      .setDisabled(activeCount + claimableCount === 0);

    return interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(launchBtn, viewBtn)]
    });
  }

  // 2) SHOW LAUNCH SELECT
  if (action === LAUNCH) {
    const options = Object.entries(missionsConfig)
      .filter(([, d]) => player.level >= d.minLevel)
      .map(([key, d]) => {
        const raw = d.hpCostRange[1];
        const cost = Math.max(1, Math.floor(raw * (1 - agiReduc / 100)));
        return player.hp >= cost
          ? {
              label: d.displayName,
              description: `Lvl≥${d.minLevel} • ${d.durationMs/3600000}h • HP ${d.hpCostRange.join('–')}`,
              value: key
            }
          : null;
      })
      .filter(Boolean);

    if (!options.length) {
      const embed = createEmbed({
        title: '❌ No Missions',
        description: 'Level too low or insufficient HP.',
        interaction
      });
      return interaction.editReply({ embeds: [embed], components: [] });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`${SELECT}:${discordId}`)
      .setPlaceholder('Select a mission')
      .addOptions(options);

    const embed = createEmbed({
      title: '🚀 Choose a Mission',
      description: `Available HP: ${player.hp}`,
      fields: [{ name: 'Types', value: `${options.length}`, inline: true }],
      interaction
    });

    return interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)]
    });
  }

  // 3) VIEW ONGOING
  if (action === VIEW) {
    const now = Date.now();
    const ActiveMission = (await import('../../data/models/ActiveMission.js')).default;
    const running = await ActiveMission.find({ discordId, endAt: { $gt: now }, claimed: false }).lean();
    const ended   = await ActiveMission.find({ discordId, endAt: { $lte: now }, claimed: false }).lean();

    if (!running.length && !ended.length) {
      const embed = createEmbed({
        title: 'ℹ️ No Missions',
        description: 'Nothing active or to claim.',
        interaction
      });
      return interaction.editReply({ embeds: [embed], components: [] });
    }

    const embed = createEmbed({ title: '⏳ Ongoing Missions', description: '', interaction });

    for (const m of running) {
      const d     = missionsConfig[m.missionType] || {};
      const pct   = Math.min(100, ((now - m.startAt) / (m.endAt - m.startAt)) * 100);
      embed.addFields({
        name: d.displayName,
        value: `Ends <t:${Math.floor(m.endAt/1000)}:R> • HP:${m.hpCost} • ${buildBar(pct)}`,
        inline: false
      });
    }

    const components = [];
    if (ended.length) {
      const btn = new ButtonBuilder()
        .setCustomId(`${CLAIM}:${discordId}`)
        .setLabel(`Claim (${ended.length})`)
        .setStyle(ButtonStyle.Primary);
      components.push(new ActionRowBuilder().addComponents(btn));
    }

    return interaction.editReply({ embeds: [embed], components });
  }

  // 4) START SELECTED
  if (action === SELECT) {
    const choice = interaction.values[0];
    try {
      const am = await startMission({ discordId, missionType: choice });
      const d  = missionsConfig[choice];
      const embed = createEmbed({
        title: '✅ Mission Started',
        description: `HP deducted: **${am.hpCost}**`,
        fields: [
          { name: 'Mission', value: d.displayName, inline: true },
          { name: 'Starts',  value: `<t:${Math.floor(am.startAt/1000)}:f>`, inline: true },
          { name: 'Ends',    value: `<t:${Math.floor(am.endAt/1000)}:f>`, inline: true },
          { name: 'XP',      value: `${am.xpReward}`, inline: true },
          { name: 'Coins',   value: `${am.coinReward}`, inline: true }
        ],
        interaction
      });
      return interaction.editReply({ embeds: [embed], components: [] });
    } catch (err) {
      const embed = createEmbed({
        title: '❌ Error',
        description: err.message,
        interaction
      });
      return interaction.editReply({ embeds: [embed], components: [] });
    }
  }

  // 5) CLAIM COMPLETED
  if (action === CLAIM) {
    try {
      const res = await claimMissionRewards(discordId);
      const description = res
        .map(r => `• **${r.missionType}** → ${r.xpReward} XP, ${r.coinReward} coins${r.levelsGained ? `, +${r.levelsGained} lvl` : ''}`)
        .join('\n');
      const embed = createEmbed({
        title: '🎉 Missions Claimed',
        description,
        interaction
      });
      return interaction.editReply({ embeds: [embed], components: [] });
    } catch (err) {
      const embed = createEmbed({
        title: '❌ Error',
        description: err.message,
        interaction
      });
      return interaction.editReply({ embeds: [embed], components: [] });
    }
  }
}

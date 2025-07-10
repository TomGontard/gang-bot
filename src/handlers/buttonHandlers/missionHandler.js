// src/handlers/buttonHandlers/missionHandler.js
import {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
  } from 'discord.js';
  import Player from '../../data/models/Player.js';
  import metrics from '../../config/metrics.js';               // ← Add this line
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
  
  const OPEN_MISSIONS_PREFIX    = 'openMissions';
  const LAUNCH_MISSION_PREFIX   = 'launchMission';
  const VIEW_MISSIONS_PREFIX    = 'viewMissions';
  const SELECT_MISSION_PREFIX   = 'selectMission';
  const CLAIM_MISSIONS_PREFIX   = 'claimMissions';
  
  /**
   * buildProgressBar(percent)
   * - Simple 10‐segment text bar, e.g. "[██████░░░░] 60%"
   */
  function buildProgressBar(percent) {
    const totalSegments = 10;
    const filledCount = Math.floor((percent / 100) * totalSegments);
    const emptyCount = totalSegments - filledCount;
    const filled = '█'.repeat(filledCount);
    const empty = '░'.repeat(emptyCount);
    return `\`${filled}${empty}\` ${percent.toFixed(0)}%`;
  }
  
  export default async function missionHandler(interaction) {
    const [action, targetId] = interaction.customId.split(':');
    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content: '❌ You cannot manage missions for another user.',
        ephemeral: true
      });
    }
  
    const discordId = targetId;
    let player = await Player.findOne({ discordId });
    if (!player) player = await Player.create({ discordId });
  
    // ───────────────────────────────────────────────────────
    // 1) OPEN MISSION MENU
    // ───────────────────────────────────────────────────────
    if (action === OPEN_MISSIONS_PREFIX) {
      // 1.a) Gather data
      const nftCount = await getNFTCount(discordId);
      const maxConcurrent = await getMaxConcurrentMissions(nftCount);
      const activeCount = await getActiveMissionsCount(discordId);
      const claimableCount = await getClaimableMissionsCount(discordId);
  
      // 1.b) XP to next
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
  
      // 1.c) Build the Mission Menu embed
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🗂️ Missions Menu')
        .setDescription(
          `**HP:** ${player.hp}/${player.hpMax}\n` +
          `**XP to Next Level:** ${xpToNext}\n` +
          `**NFT Count:** ${nftCount}\n` +
          `**Max Concurrent Missions:** ${maxConcurrent}\n` +
          `**Active Missions:** ${activeCount}\n` +
          `**Claimable Missions:** ${claimableCount}\n\n`
        )
        .addFields(
          {
            name: '▶️ Launch Mission',
            value: activeCount < maxConcurrent
              ? 'Click below to choose a mission to launch.'
              : 'You have reached your maximum concurrent missions.',
            inline: false
          },
          {
            name: '⏳ Ongoing Missions',
            value: (activeCount + claimableCount) > 0
              ? 'Click below to view or claim your ongoing missions.'
              : 'You have no active or completed missions.',
            inline: false
          }
        )
        .setTimestamp();
  
      // 1.d) Build buttons
      const components = [];
  
      // Launch Mission button
      const launchBtn = new ButtonBuilder()
        .setCustomId(`${LAUNCH_MISSION_PREFIX}:${discordId}`)
        .setLabel('Launch Mission')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(activeCount >= maxConcurrent || nftCount < 3);
  
      // View Ongoing Missions button
      const viewBtn = new ButtonBuilder()
        .setCustomId(`${VIEW_MISSIONS_PREFIX}:${discordId}`)
        .setLabel('Ongoing Missions')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(activeCount + claimableCount === 0);
  
      components.push(
        new ActionRowBuilder().addComponents(launchBtn, viewBtn)
      );
  
      return interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
  
    // ───────────────────────────────────────────────────────
    // 2) LAUNCH MISSION (show select‐menu)
    // ───────────────────────────────────────────────────────
    if (action === LAUNCH_MISSION_PREFIX) {
      // 2.a) Guard: NFT count ≥ 3
      const nftCount = await getNFTCount(discordId);
      if (nftCount < 3) {
        return interaction.reply({
          content: '❌ You need at least 3 Genesis NFTs to launch missions.',
          ephemeral: true
        });
      }
  
      // 2.b) Guard: active < maxConcurrent
      const maxConcurrent = await getMaxConcurrentMissions(nftCount);
      const activeCount = await getActiveMissionsCount(discordId);
      if (activeCount >= maxConcurrent) {
        return interaction.reply({
          content: `❌ You already have ${activeCount} active missions, which is your maximum (${maxConcurrent}).`,
          ephemeral: true
        });
      }
  
      // 2.c) Compute reserved HP & available HP
      const reservedHp = await getReservedHp(discordId);
      const availableHp = player.hp - reservedHp;
  
      // 2.d) Build mission options
      const options = [];
      for (const [key, def] of Object.entries(missionsConfig)) {
        if (player.level < def.minLevel) continue;
  
        // Worst‐case HP cost after Agility reduction
        const rawMax = def.hpCostRange[1];
        const worstHpCost = Math.max(
          1,
          Math.floor(rawMax * (1 - player.attributes.agilite * 0.01))
        );
        if (availableHp < worstHpCost) continue;
  
        const durationH = Math.floor(def.durationMs / 3_600_000);
        options.push({
          label: def.displayName,
          description: `Lvl ≥${def.minLevel} | ${durationH}h | HP [${def.hpCostRange[0]}–${def.hpCostRange[1]}]`,
          value: key
        });
      }
  
      if (options.length === 0) {
        return interaction.reply({
          content:
            '❌ No missions available. Either your level is too low or you do not have enough available HP.',
          ephemeral: true
        });
      }
  
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`${SELECT_MISSION_PREFIX}:${discordId}`)
        .setPlaceholder('Select a mission to launch')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options);
  
      const row = new ActionRowBuilder().addComponents(selectMenu);
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🚀 Choose a Mission')
        .setDescription(
          `HP: **${player.hp}**  |  Reserved: **${reservedHp}**  |  Available: **${availableHp}**\n` +
          `Active Missions: **${activeCount} / ${maxConcurrent}**`
        )
        .setTimestamp();
  
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
  
    // ───────────────────────────────────────────────────────
    // 3) VIEW ONGOING MISSIONS
    // ───────────────────────────────────────────────────────
    if (action === VIEW_MISSIONS_PREFIX) {
      const activeCount = await getActiveMissionsCount(discordId);
      const claimableCount = await getClaimableMissionsCount(discordId);
  
      if (activeCount + claimableCount === 0) {
        return interaction.reply({
          content: 'ℹ️ You have no active or completed missions at the moment.',
          ephemeral: true
        });
      }
  
      const embed = new EmbedBuilder()
        .setColor('#00AAFF')
        .setTitle('⏳ Ongoing Missions')
        .setDescription(
          activeCount > 0
            ? `You have **${activeCount}** mission(s) currently running.`
            : 'You have no active missions, but you have completed ones to claim.'
        )
        .setTimestamp();
  
      // If there are active missions, list them
      if (activeCount > 0) {
        const now = Date.now();
        const ActiveMission = (await import('../../data/models/ActiveMission.js')).default;
        const activeMissions = await ActiveMission.find({
          discordId,
          endAt: { $gt: now },
          claimed: false
        }).lean();
  
        for (const m of activeMissions) {
          const def = missionsConfig[m.missionType] || {};
          const missionName = def.displayName || m.missionType;
          const startMs = new Date(m.startAt).getTime();
          const endMs = new Date(m.endAt).getTime();
          const totalDuration = endMs - startMs;
          const elapsed = now - startMs;
          const percent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
          const progressBar = buildProgressBar(percent);
  
          embed.addFields({
            name: `${missionName}`,
            value:
              `• **Ends in**: <t:${Math.floor(endMs / 1000)}:R>\n` +
              `• **HP Cost**: ${m.hpCost}\n` +
              `• **XP Reward**: ${m.xpReward}  |  **Coins**: ${m.coinReward}\n` +
              `• **Progress**: ${progressBar}`,
            inline: false
          });
        }
      }
  
      // Show “Claim Missions” button if there are claimable missions
      const components = [];
      if (claimableCount > 0) {
        const claimBtn = new ButtonBuilder()
          .setCustomId(`${CLAIM_MISSIONS_PREFIX}:${discordId}`)
          .setLabel(`Claim Missions (${claimableCount})`)
          .setStyle(ButtonStyle.Primary);
        components.push(new ActionRowBuilder().addComponents(claimBtn));
      }
  
      return interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
  
    // ───────────────────────────────────────────────────────
    // 4) SELECT MISSION (launching)
    // ───────────────────────────────────────────────────────
    if (action === SELECT_MISSION_PREFIX) {
      const missionType = interaction.values[0];
      try {
        const am = await startMission({ discordId, missionType });
        const def = missionsConfig[missionType];
        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle(`✅ Mission Started: ${def.displayName}`)
          .addFields(
            { name: 'Mission Type', value: def.displayName, inline: true },
            {
              name: 'Start Time',
              value: `<t:${Math.floor(am.startAt.getTime() / 1000)}:f>`,
              inline: true
            },
            {
              name: 'End Time',
              value: `<t:${Math.floor(am.endAt.getTime() / 1000)}:f>`,
              inline: true
            },
            { name: 'XP Reward', value: `${am.xpReward}`, inline: true },
            { name: 'Coins Reward', value: `${am.coinReward}`, inline: true },
            { name: 'HP Cost (final)', value: `${am.hpCost}`, inline: true }
          )
          .setFooter({
            text: 'Use “Ongoing Missions” to view or claim later.'
          })
          .setTimestamp();
  
        return interaction.reply({ embeds: [embed], ephemeral: true });
      } catch (err) {
        console.error('Error in selectMission:', err);
        return interaction.reply({
          content: `❌ ${err.message}`,
          ephemeral: true
        });
      }
    }
  
    // ───────────────────────────────────────────────────────
    // 5) CLAIM MISSIONS
    // ───────────────────────────────────────────────────────
    if (action === CLAIM_MISSIONS_PREFIX) {
      try {
        const results = await claimMissionRewards(discordId);
        let content = '🎉 You claimed the following mission rewards:\n';
        for (const r of results) {
          content += `• **${r.missionType}** → ${r.xpReward} XP, ${r.coinReward} coins (HP lost: ${r.hpCost})`;
          if (r.levelsGained > 0) {
            content += ` 🆙 Leveled up +${r.levelsGained}! Next at ${r.nextLevelXp} XP.`;
          }
          content += '\n';
        }
        return interaction.reply({ content, ephemeral: true });
      } catch (err) {
        return interaction.reply({
          content: `❌ ${err.message}`,
          ephemeral: true
        });
      }
    }
  
    // Otherwise, ignore
    return;
  }
  
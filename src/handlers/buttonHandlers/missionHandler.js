// src/handlers/buttonHandlers/missionHandler.js
import {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
  } from 'discord.js';
  import Player from '../../data/models/Player.js';
  import { getNFTCount } from '../../services/nftService.js';
  import {
    startMission,
    getReservedHp,
    getActiveMissionsCount,
    getClaimableMissionsCount,
    claimMissionRewards
  } from '../../services/missionService.js';
  import missionsConfig from '../../config/missions.js';
  
  const OPEN_MISSIONS_PREFIX    = 'openMissions';
  const SELECT_MISSION_PREFIX   = 'selectMission';
  const CLAIM_MISSIONS_PREFIX   = 'claimMissions';
  
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
  
    // 1) openMissions: show mission types the player can start + "Claim Missions" if any
    if (action === OPEN_MISSIONS_PREFIX) {
      // 1.a) Check how many missions can be claimed
      const claimableCount = await getClaimableMissionsCount(discordId);
  
      // 1.b) Check NFT count
      const nftCount = await getNFTCount(discordId);
      if (nftCount < 3) {
        const embed = new EmbedBuilder()
          .setColor('#DD2E44')
          .setTitle('🚫 Not Enough NFTs')
          .setDescription('You need at least **3 Genesis NFTs** to start a mission.');
        // Still show “Claim Missions” button if claimableCount > 0
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
  
      // 1.c) Compute reserved HP
      const reservedHp = await getReservedHp(discordId);
      const availableHp = player.hp - reservedHp;
  
      // 1.d) Build list of missions the player can start
      const options = [];
      for (const [key, def] of Object.entries(missionsConfig)) {
        if (player.level < def.minLevel) continue;
  
        // Worst-case HP cost after agility
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
  
      // 1.e) Build the embed + components
      const components = [];
  
      // If any claimable missions exist, add “Claim Missions” button first
      if (claimableCount > 0) {
        const claimBtn = new ButtonBuilder()
          .setCustomId(`${CLAIM_MISSIONS_PREFIX}:${discordId}`)
          .setLabel(`Claim Missions (${claimableCount})`)
          .setStyle(ButtonStyle.Primary);
        components.push(new ActionRowBuilder().addComponents(claimBtn));
      }
  
      if (options.length === 0) {
        let reason = '';
        // If level too low for all missions:
        if (
          player.level <
          Math.min(...Object.values(missionsConfig).map(m => m.minLevel))
        ) {
          reason += '• Your level is too low for all missions.\n';
        }
        if (player.hp - reservedHp <= 0) {
          reason += '• You have no available HP to cover any mission’s worst-case cost.\n';
        }
        const embed = new EmbedBuilder()
          .setColor('#DD2E44')
          .setTitle('🚫 No Available Missions')
          .setDescription(reason || 'No missions available right now.');
        return interaction.reply({ embeds: [embed], components, ephemeral: true });
      }
  
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`${SELECT_MISSION_PREFIX}:${discordId}`)
        .setPlaceholder('Select a mission to start')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options);
  
      const row = new ActionRowBuilder().addComponents(selectMenu);
      components.push(row);
  
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🎯 Available Missions')
        .setDescription(
          `HP: ${player.hp}  |  Reserved: ${reservedHp}  |  Available: ${availableHp}\n` +
          'Choose a mission. HP cost is random within the range, reduced by your Agility.'
        )
        .setTimestamp();
  
      return interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
  
    // 2) selectMission: user picked a missionType
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
            text: 'Use /claim to collect rewards and pay HP cost when mission ends.'
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
  
    // 3) claimMissions: user clicked “Claim Missions” button
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
  
    // 4) Otherwise, unhandled
    return;
  }
  
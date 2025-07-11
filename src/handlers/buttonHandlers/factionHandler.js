// src/handlers/buttonHandlers/factionHandler.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import Player from '../../data/models/Player.js';
import { getNFTCount } from '../../services/nftService.js';
import {
  canJoinFaction,
  assignFactionToPlayer,
  removePlayerFromFaction
} from '../../services/factionService.js';
import metrics from '../../config/metrics.js';
import factionsConfig from '../../config/factions.js';
import { createEmbed } from '../../utils/createEmbed.js';

const OPEN_FACTION_PREFIX        = 'openFactions';
const SELECT_FACTION_PREFIX      = 'selectFaction';
const CONFIRM_FACTION_LEAVE_PREF = 'confirmFactionLeave';
const FINAL_FACTION_LEAVE        = 'finalFactionLeave';

async function buildFactionInterface(player, discordId) {
  const nftCount = await getNFTCount(discordId);
  if (nftCount < 1) {
    const embed = createEmbed({
      title: '🔒 Factions Locked',
      description: 'You need at least one Genesis Pass NFT to manage factions.',
      color: 0xDD2E44
    });
    return { embed, components: [] };
  }

  const currentDisplay = player.faction
    ? factionsConfig.find(f => f.name === player.faction)?.displayName
    : null;

  const embed = createEmbed({
    title: '🏷️ Factions',
    description: 'Choose or leave your faction below.'
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT_FACTION_PREFIX}:${discordId}`)
    .setPlaceholder(currentDisplay || 'Select a faction')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      factionsConfig.map(f => ({
        label: f.displayName,
        description: f.description,
        value: f.name,
        default: player.faction === f.name
      }))
    );

  const components = [new ActionRowBuilder().addComponents(selectMenu)];
  if (player.faction) {
    const leaveBtn = new ButtonBuilder()
      .setCustomId(`${CONFIRM_FACTION_LEAVE_PREF}:${discordId}`)
      .setLabel('Leave Faction')
      .setStyle(ButtonStyle.Danger);
    components.push(new ActionRowBuilder().addComponents(leaveBtn));
  }

  return { embed, components };
}

export default async function factionHandler(interaction) {
  const [action, targetId] = interaction.customId.split(':');
  const discordId = targetId;

  // 0) Only the command caller can interact
  if (interaction.user.id !== discordId) {
    return interaction.reply({
      content: '❌ You cannot manage factions for another user.',
      ephemeral: true
    });
  }

  // 1) Fetch or create player
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // 2) OPEN MENU: first reply
  if (action === OPEN_FACTION_PREFIX) {
    const { embed, components } = await buildFactionInterface(player, discordId);
    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true
    });
  }

  // 3) Subsequent interactions: acknowledge then update
  await interaction.deferUpdate();

  // 3a) SELECT FACTION
  if (action === SELECT_FACTION_PREFIX) {
    const chosen = interaction.values[0];

    // Cooldown check
    if (player.lastFactionChange) {
      const elapsed = Date.now() - player.lastFactionChange.getTime();
      if (elapsed < metrics.factionChangeCooldown) {
        const next = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
        const cdEmbed = createEmbed({
          title: '⏳ Cooldown',
          description: `You must wait until <t:${Math.floor(next.getTime()/1000)}:R> before changing again.`
        });
        return interaction.update({ embeds: [cdEmbed], components: [] });
      }
    }

    // Try to join
    try {
      if (!(await canJoinFaction(chosen))) {
        const errEmbed = createEmbed({
          title: '❌ Cannot Join',
          description: 'Choosing this faction would unbalance the roster.'
        });
        return interaction.update({ embeds: [errEmbed], components: [] });
      }

      await assignFactionToPlayer(player, chosen);
      player.lastFactionChange = new Date();
      await player.save();

      // Sync Discord roles
      const member = await interaction.guild.members.fetch(discordId);
      const allRoles = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
      await member.roles.remove(allRoles);

      const newFaction = factionsConfig.find(f => f.name === chosen);
      if (newFaction) {
        await member.roles.add(process.env[newFaction.roleEnvVar]);
      }

      const joinEmbed = createEmbed({
        title: '✅ Joined Faction',
        description: `You joined **${newFaction.displayName}**!`
      });
      return interaction.update({ embeds: [joinEmbed], components: [] });
    } catch (err) {
      const errorEmbed = createEmbed({ title: '❌ Error', description: err.message });
      return interaction.update({ embeds: [errorEmbed], components: [] });
    }
  }

  // 3b) CONFIRM LEAVE
  if (action === CONFIRM_FACTION_LEAVE_PREF) {
    if (!player.faction) {
      const noneEmbed = createEmbed({ title: '❌ Not in Faction', description: 'You are not in any faction.' });
      return interaction.update({ embeds: [noneEmbed], components: [] });
    }
    const currentDisplay = factionsConfig.find(f => f.name === player.faction).displayName;
    const confirmEmbed = createEmbed({
      title: '⚠️ Confirm Leave',
      description: `Are you sure you want to leave **${currentDisplay}**?`
    });
    const confirmBtn = new ButtonBuilder()
      .setCustomId(`${FINAL_FACTION_LEAVE}:${discordId}`)
      .setLabel('Confirm Leave')
      .setStyle(ButtonStyle.Danger);
    return interaction.update({
      embeds: [confirmEmbed],
      components: [new ActionRowBuilder().addComponents(confirmBtn)]
    });
  }

  // 3c) FINAL LEAVE
  if (action === FINAL_FACTION_LEAVE) {
    if (!player.faction) {
      const noneEmbed = createEmbed({ title: '❌ Not in Faction', description: 'You are not in any faction.' });
      return interaction.update({ embeds: [noneEmbed], components: [] });
    }

    await removePlayerFromFaction(player);
    player.lastFactionChange = new Date();
    await player.save();

    // Remove all faction roles
    const member = await interaction.guild.members.fetch(discordId);
    const allRoles = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
    await member.roles.remove(allRoles);

    const next = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
    const leaveEmbed = createEmbed({
      title: '✅ Left Faction',
      description: `You have left your faction. Next join available <t:${Math.floor(next.getTime()/1000)}:R>.`
    });
    return interaction.update({ embeds: [leaveEmbed], components: [] });
  }
}

// src/handlers/buttonHandlers/factionHandler.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import Player from '../../data/models/Player.js';
import { getNFTCount } from '../../services/nftService.js';
import { canJoinFaction, assignFactionToPlayer, removePlayerFromFaction } from '../../services/factionService.js';
import metrics from '../../config/metrics.js';
import factionsConfig from '../../config/factions.js';
import { createEmbed } from '../../utils/createEmbed.js';

const OPEN_FACTION_PREFIX        = 'openFactions';
const SELECT_FACTION_PREFIX      = 'selectFaction';
const CONFIRM_FACTION_LEAVE_PREF = 'confirmFactionLeave';
const FINAL_FACTION_LEAVE        = 'finalFactionLeave';

async function buildFactionInterface(player, discordId, interaction) {
  const nftCount = await getNFTCount(discordId);
  if (nftCount < 1) {
    const embed = createEmbed({
      title: '🔒 Factions Locked',
      description: 'You need at least one Genesis Pass NFT to manage factions.',
      color: 0xDD2E44,
      interaction
    });
    return { embed, components: [] };
  }

  const currentFaction = player.faction;
  const embed = createEmbed({
    title: '🏷️ Factions',
    description: 'Choose a faction to join or switch. Or leave your current faction below.',
    interaction
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT_FACTION_PREFIX}:${discordId}`)
    .setPlaceholder(currentFaction ? `In ${currentFaction}` : 'Select a faction')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      factionsConfig.map(f => ({
        label: f.displayName,
        description: f.description,
        value: f.name,
        default: currentFaction === f.name
      }))
    );

  const components = [new ActionRowBuilder().addComponents(selectMenu)];
  if (currentFaction) {
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
  if (interaction.user.id !== targetId) {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply({ content: '❌ You cannot manage factions for another user.' });
  }

  const discordId = targetId;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // OPEN MENU
  if (action === OPEN_FACTION_PREFIX) {
    await interaction.deferReply({ ephemeral: true });
    const { embed, components } = await buildFactionInterface(player, discordId, interaction);
    return interaction.editReply({ embeds: [embed], components });
  }

  // SELECT FACTION
  if (action === SELECT_FACTION_PREFIX) {
    await interaction.deferReply({ ephemeral: true });
    const chosenFaction = interaction.values[0];
    if (player.lastFactionChange) {
      const elapsed = Date.now() - player.lastFactionChange.getTime();
      if (elapsed < metrics.factionChangeCooldown) {
        const nextAllowed = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
        const embed = createEmbed({
          title: '⏳ Cooldown',
          description: `You must wait until <t:${Math.floor(nextAllowed.getTime()/1000)}:R> before changing factions.`,
          interaction
        });
        return interaction.editReply({ embeds: [embed] });
      }
    }

    try {
      const allowed = await canJoinFaction(chosenFaction);
      if (!allowed) {
        const embed = createEmbed({ title: '❌ Cannot Join', description: 'Joining this faction would unbalance the roster.', interaction });
        return interaction.editReply({ embeds: [embed] });
      }

      await assignFactionToPlayer(player, chosenFaction);
      player.lastFactionChange = new Date();
      await player.save();

      const member = await interaction.guild.members.fetch(discordId);
      const allRoleIds = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
      await member.roles.remove(allRoleIds);
      const newRole = factionsConfig.find(f => f.name === chosenFaction);
      if (newRole) await member.roles.add(process.env[newRole.roleEnvVar]);

      const embed = createEmbed({ title: '✅ Joined Faction', description: `You have joined **${chosenFaction}**!`, interaction });
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const embed = createEmbed({ title: '❌ Error', description: err.message, interaction });
      return interaction.editReply({ embeds: [embed] });
    }
  }

  // CONFIRM LEAVE
  if (action === CONFIRM_FACTION_LEAVE_PREF) {
    await interaction.deferUpdate();
    if (!player.faction) {
      const embed = createEmbed({ title: '❌ Not in Faction', description: 'You are not in any faction.', interaction });
      return interaction.editReply({ embeds: [embed], components: [] });
    }
    const embed = createEmbed({ title: '⚠️ Confirm Leave', description: `Are you sure you want to leave **${player.faction}**? You will have a cooldown.`, interaction });
    const confirmBtn = new ButtonBuilder().setCustomId(`${FINAL_FACTION_LEAVE}:${discordId}`).setLabel('Confirm Leave').setStyle(ButtonStyle.Danger);
    return interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(confirmBtn)] });
  }

  // FINAL LEAVE
  if (action === FINAL_FACTION_LEAVE) {
    await interaction.deferUpdate();
    if (!player.faction) {
      const embed = createEmbed({ title: '❌ Not in Faction', description: 'You are not in any faction.', interaction });
      return interaction.editReply({ embeds: [embed], components: [] });
    }
    try {
      const oldFaction = player.faction;
      player.faction = null;
      player.lastFactionChange = new Date();
      await player.save();
      const member = await interaction.guild.members.fetch(discordId);
      const allRoleIds = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
      await member.roles.remove(allRoleIds);

      const nextAllowed = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
      const embed = createEmbed({ title: '✅ Left Faction', description: `You have left **${oldFaction}**. Next join <t:${Math.floor(nextAllowed.getTime()/1000)}:R>.`, interaction });
      return interaction.editReply({ embeds: [embed], components: [] });
    } catch (err) {
      const embed = createEmbed({ title: '❌ Error', description: 'Failed to leave faction.', interaction });
      return interaction.editReply({ embeds: [embed], components: [] });
    }
  }
}

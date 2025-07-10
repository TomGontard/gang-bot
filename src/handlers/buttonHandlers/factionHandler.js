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
  const fields = [];
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

  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  const components = [row1];

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
    return interaction.reply({ content: '❌ You cannot manage factions for another user.', ephemeral: true });
  }

  const discordId = targetId;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // OPEN
  if (action === OPEN_FACTION_PREFIX) {
    const { embed, components } = await buildFactionInterface(player, discordId, interaction);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  // SELECT
  if (action === SELECT_FACTION_PREFIX) {
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
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
    try {
      const allowed = await canJoinFaction(chosenFaction);
      if (!allowed) {
        const embed = createEmbed({ title: '❌ Cannot Join', description: 'Joining this faction would unbalance the roster.', interaction });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      await assignFactionToPlayer(player, chosenFaction);
      player.lastFactionChange = new Date();
      await player.save();

      const member = await interaction.guild.members.fetch(discordId);
      const allRoleIds = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
      await member.roles.remove(allRoleIds);
      const roleId = process.env[factionsConfig.find(f => f.name === chosenFaction).roleEnvVar];
      if (roleId) await member.roles.add(roleId);

      const embed = createEmbed({ title: '✅ Joined Faction', description: `You have joined **${chosenFaction}**!`, interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const embed = createEmbed({ title: '❌ Error', description: err.message, interaction });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // CONFIRM LEAVE
  if (action === CONFIRM_FACTION_LEAVE_PREF) {
    if (!player.faction) {
      const embed = createEmbed({ title: '❌ Not in Faction', description: 'You are not in any faction.', interaction });
      return interaction.update({ embeds: [embed], components: [] });
    }
    const embed = createEmbed({
      title: '⚠️ Confirm Leave',
      description: `Are you sure you want to leave **${player.faction}**? You will have a cooldown.`, 
      interaction
    });
    const confirmBtn = new ButtonBuilder().setCustomId(`${FINAL_FACTION_LEAVE}:${discordId}`).setLabel('Confirm Leave').setStyle(ButtonStyle.Danger);
    return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(confirmBtn)] });
  }

  // FINAL LEAVE
  if (action === FINAL_FACTION_LEAVE) {
    if (!player.faction) {
      const embed = createEmbed({ title: '❌ Not in Faction', description: 'You are not in any faction.', interaction });
      return interaction.update({ embeds: [embed], components: [] });
    }
    try {
      const old = player.faction;
      player.faction = null;
      player.lastFactionChange = new Date();
      await player.save();
      const member = await interaction.guild.members.fetch(discordId);
      const allRoleIds = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
      await member.roles.remove(allRoleIds);

      const nextAllowed = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
      const embed = createEmbed({
        title: '✅ Left Faction',
        description: `You have left **${old}**. Next join <t:${Math.floor(nextAllowed.getTime()/1000)}:R>.`, 
        interaction
      });
      return interaction.update({ embeds: [embed], components: [] });
    } catch (err) {
      const embed = createEmbed({ title: '❌ Error', description: 'Failed to leave faction.', interaction });
      return interaction.update({ embeds: [embed], components: [] });
    }
  }
}

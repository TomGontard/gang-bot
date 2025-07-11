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

  const currentFaction = player.faction;
  const embed = createEmbed({
    title: '🏷️ Factions',
    description: 'Choose or leave your faction below.'
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
    return interaction.reply({ content: '❌ You cannot manage factions for another user.', ephemeral: true });
  }

  const discordId = targetId;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // OPEN MENU
  if (action === OPEN_FACTION_PREFIX) {
    const { embed, components } = await buildFactionInterface(player, discordId);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  // SELECT FACTION
  if (action === SELECT_FACTION_PREFIX) {
    const chosen = interaction.values[0];

    // Cooldown
    if (player.lastFactionChange) {
      const elapsed = Date.now() - player.lastFactionChange.getTime();
      if (elapsed < metrics.factionChangeCooldown) {
        const next = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
        return interaction.reply({
          embeds: [ createEmbed({ title: '⏳ Cooldown', description: `Wait until <t:${Math.floor(next.getTime()/1000)}:R> to switch again.` }) ],
          ephemeral: true
        });
      }
    }

    try {
      if (!await canJoinFaction(chosen)) {
        return interaction.reply({ embeds: [ createEmbed({ title: '❌ Cannot Join', description: 'Roster would become unbalanced.' }) ], ephemeral: true });
      }

      await assignFactionToPlayer(player, chosen);
      player.lastFactionChange = new Date();
      await player.save();

      const member = await interaction.guild.members.fetch(discordId);
      const allRoles = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
      await member.roles.remove(allRoles);
      const newRole = factionsConfig.find(f => f.name === chosen);
      if (newRole) await member.roles.add(process.env[newRole.roleEnvVar]);

      return interaction.reply({ embeds: [ createEmbed({ title: '✅ Joined', description: `You joined **${chosen}**!` }) ], ephemeral: true });
    } catch (err) {
      return interaction.reply({ embeds: [ createEmbed({ title: '❌ Error', description: err.message }) ], ephemeral: true });
    }
  }

  // CONFIRM LEAVE
  if (action === CONFIRM_FACTION_LEAVE_PREF) {
    if (!player.faction) {
      return interaction.reply({ content: '❌ You are not in a faction.', ephemeral: true });
    }
    const embed = createEmbed({ title: '⚠️ Confirm Leave', description: `Leave **${player.faction}**?` });
    const confirmBtn = new ButtonBuilder().setCustomId(`${FINAL_FACTION_LEAVE}:${discordId}`).setLabel('Confirm').setStyle(ButtonStyle.Danger);
    return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(confirmBtn)], ephemeral: true });
  }

  // FINAL LEAVE
  if (action === FINAL_FACTION_LEAVE) {
    if (!player.faction) {
      return interaction.reply({ content: '❌ You are not in a faction.', ephemeral: true });
    }

    await removePlayerFromFaction(player);
    player.lastFactionChange = new Date();
    await player.save();

    const member = await interaction.guild.members.fetch(discordId);
    const allRoles = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
    await member.roles.remove(allRoles);

    const next = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
    return interaction.reply({ embeds: [ createEmbed({ title: '✅ Left Faction', description: `Next join <t:${Math.floor(next.getTime()/1000)}:R>.` }) ], ephemeral: true });
  }
}

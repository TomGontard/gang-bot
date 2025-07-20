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

const OPEN    = 'openFactions';
const SELECT  = 'selectFaction';
const CONFIRM = 'confirmFactionLeave';
const FINAL   = 'finalFactionLeave';

async function buildInterface(player, discordId) {
  const nftCount = await getNFTCount(discordId);
  if (nftCount < 1) {
    return {
      embed: createEmbed({
        title: '🔒 Factions Locked',
        description: 'You need at least one Genesis Pass NFT to manage factions.',
        color: 0xDD2E44
      }),
      components: []
    };
  }

  // Gather stats for each faction
  const stats = await Promise.all(factionsConfig.map(async f => {
    const members = await Player.find({ faction: f.name }).lean();
    const totalStrength = members.reduce((sum, p) => sum + (p.attributes.force || 0), 0);
    const totalCoins    = members.reduce((sum, p) => sum + (p.coins || 0), 0);
    return {
      name: f.name,
      displayName: f.displayName,
      count: members.length,
      strength: totalStrength,
      coins: totalCoins
    };
  }));

  // Build main embed
  const embed = createEmbed({
    title: '🏷️ Factions',
    description: 'Choose or leave your faction below. Stats per faction:',
  });

  // Add a field per faction showing stats
  stats.forEach(s => {
    embed.addFields({
      name: s.displayName,
      value:
        `Players: **${s.count}**\n` +
        `Total Strength: **${s.strength}**\n` +
        `Total Coins: **${s.coins}**`,
      inline: true
    });
  });

  // Current selection placeholder
  const currentDisplay = player.faction
    ? factionsConfig.find(f => f.name === player.faction).displayName
    : null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT}:${discordId}`)
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

  const rows = [new ActionRowBuilder().addComponents(menu)];
  if (player.faction) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CONFIRM}:${discordId}`)
          .setLabel('Leave Faction')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  return { embed, components: rows };
}

export default async function factionHandler(interaction) {
  const [action, discordId] = interaction.customId.split(':');

  // 0) Security: only initiator
  if (interaction.user.id !== discordId) {
    return interaction.reply({
      content: '❌ You cannot manage factions for another user.',
      ephemeral: true
    });
  }

  // Load or create player
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // 1️⃣ OPEN MENU: initial reply
  if (action === OPEN) {
    const { embed, components } = await buildInterface(player, discordId);
    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true,
      flags: 64
    });
  }

  // 2️⃣ SELECT FACTION
  if (action === SELECT) {
    await interaction.deferUpdate();

    const chosen = interaction.values[0];
    // Cooldown check
    if (player.lastFactionChange) {
      const next = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
      if (Date.now() < next) {
        const cdEmbed = createEmbed({
          title: '⏳ Cooldown',
          description: `You must wait until <t:${Math.floor(next.getTime()/1000)}:R> before changing again.`
        });
        return interaction.editReply({ embeds: [cdEmbed], components: [] });
      }
    }
    // Balance check
    if (!(await canJoinFaction(chosen))) {
      const errEmbed = createEmbed({
        title: '❌ Cannot Join',
        description: 'Choosing this faction would unbalance the roster.'
      });
      return interaction.editReply({ embeds: [errEmbed], components: [] });
    }

    // 1) Remove all faction roles
    const member = await interaction.guild.members.fetch(discordId);
    const allRoleIds = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
    await member.roles.remove(allRoleIds);

    // 2) Update DB
    await assignFactionToPlayer(player, chosen);
    player.lastFactionChange = new Date();
    await player.save();

    // 3) Add new role
    const newFaction = factionsConfig.find(f => f.name === chosen);
    const newRoleId = process.env[newFaction.roleEnvVar];
    if (newRoleId) {
      await member.roles.add(newRoleId);
    }

    // 4) Confirmation
    const joinEmbed = createEmbed({
      title: '✅ Joined Faction',
      description: `You joined **${newFaction.displayName}**!`
    });
    return interaction.editReply({ embeds: [joinEmbed], components: [] });
  }

  // 3️⃣ CONFIRM LEAVE
  if (action === CONFIRM) {
    await interaction.deferUpdate();

    if (!player.faction) {
      const noneEmbed = createEmbed({
        title: '❌ Not in Faction',
        description: 'You are not currently in a faction.'
      });
      return interaction.editReply({ embeds: [noneEmbed], components: [] });
    }
    const currentName = factionsConfig.find(f => f.name === player.faction).displayName;
    const confirmEmbed = createEmbed({
      title: '⚠️ Confirm Leave',
      description: `Are you sure you want to leave **${currentName}**?`
    });
    const confirmBtn = new ButtonBuilder()
      .setCustomId(`${FINAL}:${discordId}`)
      .setLabel('Confirm Leave')
      .setStyle(ButtonStyle.Danger);
    return interaction.editReply({
      embeds: [confirmEmbed],
      components: [new ActionRowBuilder().addComponents(confirmBtn)]
    });
  }

  // 4️⃣ FINAL LEAVE
  if (action === FINAL) {
    await interaction.deferUpdate();

    if (!player.faction) {
      const noneEmbed = createEmbed({
        title: '❌ Not in Faction',
        description: 'You are not currently in a faction.'
      });
      return interaction.editReply({ embeds: [noneEmbed], components: [] });
    }

    // Remove all faction roles
    const member = await interaction.guild.members.fetch(discordId);
    const allRoleIds = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
    await member.roles.remove(allRoleIds);

    // DB remove
    await removePlayerFromFaction(player);
    player.lastFactionChange = new Date();
    await player.save();

    const leaveEmbed = createEmbed({
      title: '✅ Left Faction',
      description: 'You have left your faction.'
    });
    return interaction.editReply({ embeds: [leaveEmbed], components: [] });
  }
}

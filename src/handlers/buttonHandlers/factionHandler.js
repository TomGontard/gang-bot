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
import { calculateTotalStats } from '../../services/itemService.js';
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
    const totalStats = await Promise.all(
      members.map(async p => (await calculateTotalStats(p)).force || 0)
    );
    const totalStrength = totalStats.reduce((sum, f) => sum + f, 0);
    const totalCoins    = members.reduce((sum, p) => sum + (p.coins || 0), 0);
    return {
      name: f.name,
      displayName: f.displayName,
      count: members.length,
      strength: totalStrength,
      coins: totalCoins
    };
  }));

  const embed = createEmbed({
    title: '🏷️ Factions',
    description: 'Choose or leave your faction below. Stats per faction:',
  });

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
  if (interaction.user.id !== discordId) {
    return interaction.reply({
      content: '❌ You cannot manage factions for another user.',
      ephemeral: true
    });
  }

  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  if (action === OPEN) {
    const { embed, components } = await buildInterface(player, discordId);
    return interaction.reply({ embeds: [embed], components, ephemeral: true, flags: 64 });
  }

  if (action === SELECT) {
    await interaction.deferUpdate();
    const chosen = interaction.values[0];

    if (player.lastFactionChange) {
      const next = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
      if (Date.now() < next) {
        return interaction.editReply({ embeds: [createEmbed({
          title: '⏳ Cooldown',
          description: `You must wait until <t:${Math.floor(next.getTime()/1000)}:R>.`
        })], components: [] });
      }
    }

    if (!(await canJoinFaction(chosen))) {
      return interaction.editReply({ embeds: [createEmbed({
        title: '❌ Cannot Join',
        description: 'Choosing this faction would unbalance the roster.'
      })], components: [] });
    }

    const member = await interaction.guild.members.fetch(discordId);
    const allRoleIds = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
    await member.roles.remove(allRoleIds);

    await assignFactionToPlayer(player, chosen);
    player.lastFactionChange = new Date();
    await player.save();

    const newFaction = factionsConfig.find(f => f.name === chosen);
    const newRoleId = process.env[newFaction.roleEnvVar];
    if (newRoleId) await member.roles.add(newRoleId);

    return interaction.editReply({ embeds: [createEmbed({
      title: '✅ Joined Faction',
      description: `You joined **${newFaction.displayName}**!`
    })], components: [] });
  }

  if (action === CONFIRM) {
    await interaction.deferUpdate();
    if (!player.faction) {
      return interaction.editReply({ embeds: [createEmbed({
        title: '❌ Not in Faction',
        description: 'You are not currently in a faction.'
      })], components: [] });
    }

    const currentName = factionsConfig.find(f => f.name === player.faction).displayName;
    return interaction.editReply({
      embeds: [createEmbed({
        title: '⚠️ Confirm Leave',
        description: `Are you sure you want to leave **${currentName}**?`
      })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${FINAL}:${discordId}`)
          .setLabel('Confirm Leave')
          .setStyle(ButtonStyle.Danger)
      )]
    });
  }

  if (action === FINAL) {
    await interaction.deferUpdate();
    if (!player.faction) {
      return interaction.editReply({ embeds: [createEmbed({
        title: '❌ Not in Faction',
        description: 'You are not currently in a faction.'
      })], components: [] });
    }

    const member = await interaction.guild.members.fetch(discordId);
    const allRoleIds = factionsConfig.map(f => process.env[f.roleEnvVar]).filter(Boolean);
    await member.roles.remove(allRoleIds);

    await removePlayerFromFaction(player);
    player.lastFactionChange = new Date();
    await player.save();

    return interaction.editReply({ embeds: [createEmbed({
      title: '✅ Left Faction',
      description: 'You have left your faction.'
    })], components: [] });
  }
}

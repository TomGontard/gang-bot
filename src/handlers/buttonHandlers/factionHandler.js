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

  const currentDisplay = player.faction
    ? factionsConfig.find(f => f.name === player.faction).displayName
    : null;

  const embed = createEmbed({
    title: '🏷️ Factions',
    description: 'Choose or leave your faction below.'
  });

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
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CONFIRM}:${discordId}`)
        .setLabel('Leave Faction')
        .setStyle(ButtonStyle.Danger)
    ));
  }

  return { embed, components: rows };
}

export default async function factionHandler(interaction) {
  const [action, discordId] = interaction.customId.split(':');

  // only the menu opener may interact
  if (interaction.user.id !== discordId) {
    return interaction.reply({
      content: '❌ You cannot manage factions for another user.',
      ephemeral: true
    });
  }

  // load or create player
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // 1️⃣ OPEN menu (first & only reply)
  if (action === OPEN) {
    const { embed, components } = await buildInterface(player, discordId);
    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true,
      flags: 64
    });
  }

  // —— from here on, edit the original ephemeral message —— //

  // 2️⃣ SELECT FACTION
  if (action === SELECT) {
    const chosen = interaction.values[0];

    // cooldown check
    if (player.lastFactionChange) {
      const next = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
      if (Date.now() < next) {
        const cdEmbed = createEmbed({
          title: '⏳ Cooldown',
          description: `You must wait until <t:${Math.floor(next.getTime()/1000)}:R> before changing again.`
        });
        return interaction.update({ embeds: [cdEmbed], components: [] });
      }
    }

    // balance check
    if (!(await canJoinFaction(chosen))) {
      const errEmbed = createEmbed({
        title: '❌ Cannot Join',
        description: 'Choosing this faction would unbalance the roster.'
      });
      return interaction.update({ embeds: [errEmbed], components: [] });
    }

    // assign
    await assignFactionToPlayer(player, chosen);
    player.lastFactionChange = new Date();
    await player.save();

    // sync Discord roles here if needed...

    const newFaction = factionsConfig.find(f => f.name === chosen);
    const joinEmbed = createEmbed({
      title: '✅ Joined Faction',
      description: `You joined **${newFaction.displayName}**!`
    });
    return interaction.update({ embeds: [joinEmbed], components: [] });
  }

  // 3️⃣ CONFIRM LEAVE
  if (action === CONFIRM) {
    if (!player.faction) {
      const noneEmbed = createEmbed({
        title: '❌ Not in Faction',
        description: 'You are not currently in a faction.'
      });
      return interaction.update({ embeds: [noneEmbed], components: [] });
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
    return interaction.update({
      embeds: [confirmEmbed],
      components: [new ActionRowBuilder().addComponents(confirmBtn)]
    });
  }

  // 4️⃣ FINAL LEAVE
  if (action === FINAL) {
    if (!player.faction) {
      const noneEmbed = createEmbed({
        title: '❌ Not in Faction',
        description: 'You are not currently in a faction.'
      });
      return interaction.update({ embeds: [noneEmbed], components: [] });
    }

    await removePlayerFromFaction(player);
    player.lastFactionChange = new Date();
    await player.save();

    const leaveEmbed = createEmbed({
      title: '✅ Left Faction',
      description: 'You have left your faction.'
    });
    return interaction.update({ embeds: [leaveEmbed], components: [] });
  }
}

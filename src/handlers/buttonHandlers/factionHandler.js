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

const OPEN = 'openFactions';
const SELECT = 'selectFaction';
const CONFIRM = 'confirmFactionLeave';
const FINAL = 'finalFactionLeave';

async function buildInterface(player, discordId) {
  const nftCount = await getNFTCount(discordId);
  if (nftCount < 1) {
    return {
      embed: createEmbed({
        title: '🔒 Factions Locked',
        description: 'You need at least one Genesis Pass NFT.',
        color: 0xDD2E44
      }),
      components: []
    };
  }

  const display = player.faction
    ? factionsConfig.find(f=>f.name===player.faction).displayName
    : null;

  const embed = createEmbed({
    title: '🏷️ Factions',
    description: 'Pick or leave a faction below.'
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT}:${discordId}`)
    .setPlaceholder(display||'Select a faction')
    .addOptions(
      factionsConfig.map(f=>({
        label: f.displayName,
        description: f.description,
        value: f.name,
        default: player.faction===f.name
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

  // only opener
  if (interaction.user.id !== discordId) {
    return interaction.reply({ content: '❌ You cannot manage factions for another user.', ephemeral: true });
  }

  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // OPEN = first reply
  if (action === OPEN) {
    const { embed, components } = await buildInterface(player, discordId);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  // subsequent actions
  await interaction.deferUpdate();

  // SELECT
  if (action === SELECT) {
    const chosen = interaction.values[0];

    // cooldown
    if (player.lastFactionChange) {
      const next = new Date(player.lastFactionChange.getTime() + metrics.factionChangeCooldown);
      if (Date.now() < next) {
        const cdEmbed = createEmbed({
          title: '⏳ Cooldown',
          description: `Wait until <t:${Math.floor(next.getTime()/1000)}:R>.`
        });
        return interaction.update({ embeds: [cdEmbed], components: [] });
      }
    }

    if (!(await canJoinFaction(chosen))) {
      const err = createEmbed({ title:'❌ Cannot Join', description:'Unbalanced roster.' });
      return interaction.update({ embeds:[err], components:[] });
    }

    await assignFactionToPlayer(player, chosen);
    player.lastFactionChange = new Date();
    await player.save();

    // sync roles...
    const role = factionsConfig.find(f=>f.name===chosen);
    const joinEmbed = createEmbed({
      title:'✅ Joined Faction',
      description:`You joined **${role.displayName}**!`
    });
    return interaction.update({ embeds:[joinEmbed], components:[] });
  }

  // CONFIRM LEAVE
  if (action === CONFIRM) {
    if (!player.faction) {
      const none = createEmbed({ title:'❌ Not in Faction', description:'You are not in one.' });
      return interaction.update({ embeds:[none], components:[] });
    }
    const name = factionsConfig.find(f=>f.name===player.faction).displayName;
    const confirm = createEmbed({ title:'⚠️ Confirm Leave', description:`Leave **${name}**?` });
    const btn = new ButtonBuilder()
      .setCustomId(`${FINAL}:${discordId}`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Danger);
    return interaction.update({ embeds:[confirm], components:[ new ActionRowBuilder().addComponents(btn) ] });
  }

  // FINAL LEAVE
  if (action === FINAL) {
    if (!player.faction) {
      const none = createEmbed({ title:'❌ Not in Faction', description:'You are not in one.' });
      return interaction.update({ embeds:[none], components:[] });
    }
    await removePlayerFromFaction(player);
    player.lastFactionChange = new Date();
    await player.save();

    const leave = createEmbed({ title:'✅ Left Faction', description:'You have left your faction.' });
    return interaction.update({ embeds:[leave], components:[] });
  }
}

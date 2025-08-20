import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import { calculateTotalStats } from '../../services/itemService.js';
import metrics from '../../config/metrics.js';
import { createEmbed } from '../../utils/createEmbed.js';

const ATTRIB_ADD_PREFIX = 'attrAdd';
const SET_INCREMENT_PREFIX = 'attrIncrement';

const attrMap = {
  Vitality: 'vitalite',
  Wisdom: 'sagesse',
  Strength: 'force',
  Intelligence: 'intelligence',
  Luck: 'chance',
  Agility: 'agilite'
};

export default async function attributesHandler(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const targetId = parts[1];

  if (interaction.user.id !== targetId) {
    return interaction.reply({ content: '❌ You cannot manage attributes for another user.', ephemeral: true });
  }

  const discordId = targetId;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  if (!player.tempIncrement || typeof player.tempIncrement !== 'number') {
    player.tempIncrement = 1;
    await player.save();
  }

  if (action === 'openAttributes') {
    return renderAttributeMenu(interaction, player, false);
  }

  if (action === SET_INCREMENT_PREFIX) {
    const newIncrement = parseInt(parts[2], 10);
    if (![1, 5, 10].includes(newIncrement)) {
      return interaction.reply({ content: '❌ Invalid increment value.', ephemeral: true });
    }

    player.tempIncrement = newIncrement;
    await player.save();
    return renderAttributeMenu(interaction, player, true);
  }

  if (action === ATTRIB_ADD_PREFIX) {
    const attr = parts[2];
    const amount = parseInt(parts[3], 10) || 1;

    if (!attrMap[attr]) {
      return interaction.reply({
        content: `❌ Unknown attribute.`,
        ephemeral: true
      });
    }

    const key = attrMap[attr];
    const cost = metrics.attributeCosts[attr] * amount;
    const current = player.attributes[key] || 0;

    if (attr === 'Agility' && current + amount > 30) {
      return interaction.reply({
        content: `❌ Your Agility cannot exceed 30.`,
        ephemeral: true
      });
    }

    if (player.unassignedPoints < cost) {
      return interaction.reply({
        content: `❌ Not enough unassigned points.`,
        ephemeral: true
      });
    }

    player.attributes[key] += amount;
    player.unassignedPoints -= cost;
    await player.save();

    return renderAttributeMenu(interaction, player, true);
  }
}

// 🔁 Build and send a fresh menu
async function renderAttributeMenu(interaction, player, reset = false) {
  const total = await calculateTotalStats(player);
  const embed = createEmbed({
    title: `🔧 ${interaction.user.username}’s Attributes`,
    description: 'Use the buttons below to assign points.\n\nNumbers in **( )** show equipment bonus.',
    fields: [
      { name: 'Unassigned Points', value: `${player.unassignedPoints}`, inline: true },
      {
        name: `Vitality (+1 HP)`, value: `${total.vitalite} (${total.vitalite - player.attributes.vitalite} bonus)`, inline: true
      },
      {
        name: `Wisdom (+1% XP)`, value: `${total.sagesse} (${total.sagesse - player.attributes.sagesse} bonus)`, inline: true
      },
      {
        name: `Strength (+Combat)`, value: `${total.force} (${total.force - player.attributes.force} bonus)`, inline: true
      },
      {
        name: `Intelligence (+1% Heal Speed)`, value: `${total.intelligence} (${total.intelligence - player.attributes.intelligence} bonus)`, inline: true
      },
      {
        name: `Luck (+1% Coin Chance)`, value: `${total.chance} (${total.chance - player.attributes.chance} bonus)`, inline: true
      },
      {
        name: `Agility (-HP Loss, max 30)`, value: `${total.agilite} (${total.agilite - player.attributes.agilite} bonus)`, inline: true
      },
      {
        name: '🧮 Total Stats',
        value:
          `❤️ HP: **${player.hpMax}**\n` +
          `🧠 Intelligence: **${total.intelligence}**\n` +
          `🎓 Wisdom: **${total.sagesse}**\n` +
          `💪 Strength: **${total.force}**\n` +
          `🍀 Luck: **${total.chance}**\n` +
          `🏃 Agility: **${total.agilite}**`
      }
    ]
  });

  const attributes = Object.keys(attrMap);
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  for (let i = 0; i < 3; i++) {
    const attr = attributes[i];
    const cost = metrics.attributeCosts[attr] * player.tempIncrement;
    row1.addComponents(new ButtonBuilder()
      .setCustomId(`${ATTRIB_ADD_PREFIX}:${player.discordId}:${attr}:${player.tempIncrement}`)
      .setLabel(`+${player.tempIncrement} ${attr}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(player.unassignedPoints < cost));
  }

  for (let i = 3; i < 6; i++) {
    const attr = attributes[i];
    const cost = metrics.attributeCosts[attr] * player.tempIncrement;
    const current = player.attributes[attrMap[attr]] || 0;
    const disabled = player.unassignedPoints < cost || (attr === 'Agility' && current >= 30);
    row2.addComponents(new ButtonBuilder()
      .setCustomId(`${ATTRIB_ADD_PREFIX}:${player.discordId}:${attr}:${player.tempIncrement}`)
      .setLabel(`+${player.tempIncrement} ${attr}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled));
  }

  const row3 = new ActionRowBuilder().addComponents(
    [1, 5, 10].map(v =>
      new ButtonBuilder()
        .setCustomId(`${SET_INCREMENT_PREFIX}:${player.discordId}:${v}`)
        .setLabel(`Set +${v}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(player.tempIncrement === v)
    )
  );

  const messagePayload = {
    embeds: [embed],
    components: [row1, row2, row3]
  };

  return reset
    ? interaction.update(messagePayload)
    : interaction.reply({ ...messagePayload, ephemeral: true });
}

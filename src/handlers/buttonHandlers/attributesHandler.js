// src/handlers/buttonHandlers/attributesHandler.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import metrics from '../../config/metrics.js';
import { createEmbed } from '../../utils/createEmbed.js';

const ATTRIB_ADD_PREFIX = 'attrAdd';

export default async function attributesHandler(interaction) {
  const [action, targetId, attribute] = interaction.customId.split(':');
  if (interaction.user.id !== targetId) {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply({ content: '❌ You cannot manage attributes for another user.' });
  }

  const discordId = targetId;
  let player = await Player.findOne({ discordId });
  if (!player) {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply({ content: '❌ Player not found.' });
  }

  function buildAttributeEmbedAndButtons() {
    const fields = [
      { name: 'Unassigned Points', value: `${player.unassignedPoints}`, inline: true },
      { name: `Vitality (+1 HP) (Cost: ${metrics.attributeCosts.Vitality})`, value: `${player.attributes.vitalite}`, inline: true },
      { name: `Wisdom (+1% XP) (Cost: ${metrics.attributeCosts.Wisdom})`, value: `${player.attributes.sagesse}`, inline: true },
      { name: `Strength (+Combat) (Cost: ${metrics.attributeCosts.Strength})`, value: `${player.attributes.force}`, inline: true },
      { name: `Intelligence (+1% Heal Speed) (Cost: ${metrics.attributeCosts.Intelligence})`, value: `${player.attributes.intelligence}`, inline: true },
      { name: `Luck (+1% Coin Chance) (Cost: ${metrics.attributeCosts.Luck})`, value: `${player.attributes.chance}`, inline: true },
      { name: `Agility (-HP Loss) (Cost: ${metrics.attributeCosts.Agility})`, value: `${player.attributes.agilite}`, inline: true }
    ];

    const embed = createEmbed({
      title: `🔧 ${interaction.user.username}’s Attributes`, 
      description: 'Use the buttons below to spend your unassigned points. Costs shown in parentheses.',
      fields,
      interaction
    });

    const buttons = ['Vitality','Wisdom','Strength','Intelligence','Luck','Agility'].map(attr => {
      const cost = metrics.attributeCosts[attr];
      return new ButtonBuilder()
        .setCustomId(`${ATTRIB_ADD_PREFIX}:${discordId}:${attr}`)
        .setLabel(`+1 ${attr}`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(player.unassignedPoints < cost);
    });

    const row1 = new ActionRowBuilder().addComponents(buttons.slice(0,5));
    const row2 = new ActionRowBuilder().addComponents(buttons.slice(5));
    return { embed, rows: [row1, row2] };
  }

  // OPEN ATTRIBUTES MENU
  if (action === 'openAttributes') {
    await interaction.deferReply({ ephemeral: true });
    const { embed, rows } = buildAttributeEmbedAndButtons();
    return interaction.editReply({ embeds: [embed], components: rows });
  }

  // ADD POINT TO ATTRIBUTE
  if (action === ATTRIB_ADD_PREFIX) {
    await interaction.deferUpdate();
    const cost = metrics.attributeCosts[attribute];
    if (player.unassignedPoints < cost) {
      return interaction.followUp({ content: '❌ You don’t have enough unassigned points.', ephemeral: true });
    }

    switch (attribute) {
      case 'Vitality':      player.attributes.vitalite += 1; player.hpMax += 1; break;
      case 'Wisdom':        player.attributes.sagesse += 1; break;
      case 'Strength':      player.attributes.force += 1; break;
      case 'Intelligence':  player.attributes.intelligence += 1; break;
      case 'Luck':          player.attributes.chance += 1; break;
      case 'Agility':       player.attributes.agilite += 1; break;
    }
    player.unassignedPoints -= cost;
    await player.save();

    const { embed, rows } = buildAttributeEmbedAndButtons();
    return interaction.editReply({ embeds: [embed], components: rows });
  }
}

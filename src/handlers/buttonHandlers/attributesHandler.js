// src/handlers/buttonHandlers/attributesHandler.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import metrics from '../../config/metrics.js';
import { createEmbed } from '../../utils/createEmbed.js';

const ATTRIB_ADD_PREFIX = 'attrAdd';

export default async function attributesHandler(interaction) {
  const [action, targetId, attribute] = interaction.customId.split(':');

  // Only the original user can click
  if (interaction.user.id !== targetId) {
    return interaction.reply({ content: '❌ You cannot manage attributes for another user.', ephemeral: true });
  }

  const discordId = targetId;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

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

  // 1) OPEN ATTRIBUTES MENU — use reply/update
  if (action === 'openAttributes') {
    const { embed, rows } = buildAttributeEmbedAndButtons();
    // We want to replace the existing ephemeral profile message,
    // so we use update() without deferring a new reply.
    return interaction.update({ embeds: [embed], components: rows });
  }

  // 2) ADD POINT TO ATTRIBUTE
  if (action === ATTRIB_ADD_PREFIX) {
    // Acknowledge the interaction so we can edit the same message:
    await interaction.deferUpdate();

    const cost = metrics.attributeCosts[attribute];
    if (player.unassignedPoints < cost) {
      // Since we deferred the update, use followUp for errors:
      return interaction.followUp({ content: '❌ You don’t have enough unassigned points.', ephemeral: true });
    }

    // Spend the point
    switch (attribute) {
      case 'Vitality':
        player.attributes.vitalite += 1;
        player.hpMax += 1;
        break;
      case 'Wisdom':
        player.attributes.sagesse += 1;
        break;
      case 'Strength':
        player.attributes.force += 1;
        break;
      case 'Intelligence':
        player.attributes.intelligence += 1;
        break;
      case 'Luck':
        player.attributes.chance += 1;
        break;
      case 'Agility':
        player.attributes.agilite += 1;
        break;
    }
    player.unassignedPoints -= cost;
    await player.save();

    // Re‐render the updated embed and buttons
    const { embed, rows } = buildAttributeEmbedAndButtons();
    return interaction.editReply({ embeds: [embed], components: rows });
  }
}

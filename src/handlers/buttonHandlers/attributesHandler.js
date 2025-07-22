// src/handlers/buttonHandlers/attributesHandler.js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';
import { calculateTotalStats } from '../../services/itemService.js';
import metrics from '../../config/metrics.js';
import { createEmbed } from '../../utils/createEmbed.js';

const ATTRIB_ADD_PREFIX = 'attrAdd';

export default async function attributesHandler(interaction) {
  const [action, targetId, attribute] = interaction.customId.split(':');

  if (interaction.user.id !== targetId) {
    return interaction.reply({ content: '❌ You cannot manage attributes for another user.', ephemeral: true, flags: 64 });
  }

  const discordId = targetId;
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  const total = await calculateTotalStats(player);

  function buildAttributeEmbedAndButtons() {
    const fields = [
      { name: 'Unassigned Points', value: `${player.unassignedPoints}`, inline: true },
      {
        name: `Vitality (+1 HP) (Cost: ${metrics.attributeCosts.Vitality})`,
        value: `${total.vitalite} (${total.vitalite - player.attributes.vitalite} bonus)`,
        inline: true
      },
      {
        name: `Wisdom (+1% XP) (Cost: ${metrics.attributeCosts.Wisdom})`,
        value: `${total.sagesse} (${total.sagesse - player.attributes.sagesse} bonus)`,
        inline: true
      },
      {
        name: `Strength (+Combat) (Cost: ${metrics.attributeCosts.Strength})`,
        value: `${total.force} (${total.force - player.attributes.force} bonus)`,
        inline: true
      },
      {
        name: `Intelligence (+1% Heal Speed) (Cost: ${metrics.attributeCosts.Intelligence})`,
        value: `${total.intelligence} (${total.intelligence - player.attributes.intelligence} bonus)`,
        inline: true
      },
      {
        name: `Luck (+1% Coin Chance) (Cost: ${metrics.attributeCosts.Luck})`,
        value: `${total.chance} (${total.chance - player.attributes.chance} bonus)`,
        inline: true
      },
      {
        name: `Agility (-HP Loss) (Cost: ${metrics.attributeCosts.Agility})`,
        value: `${total.agilite} (${total.agilite - player.attributes.agilite} bonus)`,
        inline: true
      },
      {
        name: '🧮 Total Stats',
        value:
          `❤️ HP: **${player.hpMax}**\n` +
          `🧠 Intelligence: **${total.intelligence}**\n` +
          `🎓 Wisdom: **${total.sagesse}**\n` +
          `💪 Strength: **${total.force}**\n` +
          `🍀 Luck: **${total.chance}**\n` +
          `🏃 Agility: **${total.agilite}**`,
        inline: false
      }
    ];

    const embed = createEmbed({
      title: `🔧 ${interaction.user.username}’s Attributes`,
      description: 'Use the buttons below to spend your unassigned points.\n\nNumbers in **( )** show equipment bonus.',
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

    const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
    const row2 = new ActionRowBuilder().addComponents(buttons.slice(5));
    return [embed, row1, row2];
  }

  // 1️⃣ OPEN ATTRIBUTES
  if (action === 'openAttributes') {
    const [embed, row1, row2] = buildAttributeEmbedAndButtons();
    return interaction.reply({
      embeds: [embed],
      components: [row1, row2],
      ephemeral: true,
      flags: 64
    });
  }

  // 2️⃣ ADD ATTRIBUTE POINT
  if (action === ATTRIB_ADD_PREFIX) {
    await interaction.deferUpdate();

    const cost = metrics.attributeCosts[attribute];
    if (player.unassignedPoints < cost) {
      return interaction.followUp({ content: '❌ You don’t have enough unassigned points.', ephemeral: true, flags: 64 });
    }

    switch (attribute) {
      case 'Vitality':
        player.attributes.vitalite++;
        player.hpMax++;
        break;
      case 'Wisdom':
        player.attributes.sagesse++;
        break;
      case 'Strength':
        player.attributes.force++;
        break;
      case 'Intelligence':
        player.attributes.intelligence++;
        break;
      case 'Luck':
        player.attributes.chance++;
        break;
      case 'Agility':
        player.attributes.agilite++;
        break;
    }

    player.unassignedPoints -= cost;
    await player.save();

    const [embed, newRow1, newRow2] = buildAttributeEmbedAndButtons();
    return interaction.editReply({ embeds: [embed], components: [newRow1, newRow2] });
  }
}

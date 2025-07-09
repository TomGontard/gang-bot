// src/handlers/buttonHandlers/attributesHandler.js
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
  } from 'discord.js';
  import Player from '../../data/models/Player.js';
  import metrics from '../../config/metrics.js';
  
  const ATTRIB_ADD_PREFIX = 'attrAdd';
  
  export default async function attributesHandler(interaction) {
    const [action, targetId, attribute] = interaction.customId.split(':');
    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content: '❌ You cannot manage attributes for another user.',
        ephemeral: true
      });
    }
  
    const discordId = targetId;
    const player = await Player.findOne({ discordId });
    if (!player) {
      return interaction.reply({
        content: '❌ Player not found.',
        ephemeral: true
      });
    }
  
    // Helper to build the attributes embed + buttons
    function buildAttributeEmbedAndButtons() {
      const embed = new EmbedBuilder()
        .setColor('#00AAFF')
        .setTitle(`🔧 ${interaction.user.username}’s Attributes`)
        .setDescription(
          'Use the buttons below to spend your unassigned points. Costs shown in parentheses.'
        )
        .addFields(
          { name: 'Unassigned Points', value: `${player.unassignedPoints}`, inline: true },
          {
            name: `Vitality (+1 HP) (Cost: ${metrics.attributeCosts.Vitality})`,
            value: `${player.attributes.vitalite}`,
            inline: true
          },
          {
            name: `Wisdom (+1% XP) (Cost: ${metrics.attributeCosts.Wisdom})`,
            value: `${player.attributes.sagesse}`,
            inline: true
          },
          {
            name: `Strength (+Combat Power) (Cost: ${metrics.attributeCosts.Strength})`,
            value: `${player.attributes.force}`,
            inline: true
          },
          {
            name: `Intelligence (+1% Heal Speed) (Cost: ${metrics.attributeCosts.Intelligence})`,
            value: `${player.attributes.intelligence}`,
            inline: true
          },
          {
            name: `Luck (+1% Coin Chance) (Cost: ${metrics.attributeCosts.Luck})`,
            value: `${player.attributes.chance}`,
            inline: true
          },
          {
            name: `Agility (-HP Loss Rate) (Cost: ${metrics.attributeCosts.Agility})`,
            value: `${player.attributes.agilite}`,
            inline: true
          }
        )
        .setTimestamp();
  
      const buttons = [];
      for (const attr of [
        'Vitality',
        'Wisdom',
        'Strength',
        'Intelligence',
        'Luck',
        'Agility'
      ]) {
        const cost = metrics.attributeCosts[attr];
        const disabled = player.unassignedPoints < cost;
        const label = attr.length > 10 ? attr.slice(0, 10) : attr;
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`${ATTRIB_ADD_PREFIX}:${discordId}:${attr}`)
            .setLabel(`+1 ${label}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled)
        );
      }
  
      // Two rows: first five attributes, then the sixth
      const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
      const row2 = new ActionRowBuilder().addComponents(buttons.slice(5));
  
      return { embed, rows: [row1, row2] };
    }
  
    // 5.a) If user clicked the “Open Attributes” button
    if (action === 'openAttributes') {
      const { embed, rows } = buildAttributeEmbedAndButtons();
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
  
    // 5.b) If user clicked one of the “+1 <Attribute>” buttons
    if (action === ATTRIB_ADD_PREFIX) {
      const cost = metrics.attributeCosts[attribute];
      if (player.unassignedPoints < cost) {
        return interaction.reply({
          content: '❌ You don’t have enough unassigned points.',
          ephemeral: true
        });
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
  
      // Re‐render
      const { embed, rows } = buildAttributeEmbedAndButtons();
      return interaction.update({ embeds: [embed], components: rows });
    }
  }
  
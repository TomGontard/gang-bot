// src/commands/attributes.js
import {
    SlashCommandBuilder,
    EmbedBuilder
  } from 'discord.js';
  import Player from '../data/models/Player.js';
  import metrics from '../config/metrics.js';
  
  const ATTRIBUTES = [
    'Vitality',
    'Wisdom',
    'Strength',
    'Intelligence',
    'Luck',
    'Agility'
  ];
  
  export const data = new SlashCommandBuilder()
    .setName('attributes')
    .setDescription('View or spend your unassigned attribute points.')
    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('Show your current attributes and unassigned points.')
    )
    .addSubcommand(sub =>
      sub
        .setName('assign')
        .setDescription('Assign unassigned points to an attribute.')
        .addStringOption(opt =>
          opt
            .setName('attribute')
            .setDescription('Which attribute to increase')
            .setRequired(true)
            .addChoices(
              ...ATTRIBUTES.map(attr => ({ name: attr, value: attr }))
            )
        )
        .addIntegerOption(opt =>
          opt
            .setName('amount')
            .setDescription('How many points to spend on this attribute')
            .setRequired(true)
            .setMinValue(1)
        )
    );
  
  export async function execute(interaction) {
    const discordId = interaction.user.id;
    const sub = interaction.options.getSubcommand();
  
    let player = await Player.findOne({ discordId });
    if (!player) {
      player = await Player.create({ discordId });
    }
  
    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setColor('#00AAFF')
        .setTitle(`🎯 ${interaction.user.username}’s Attributes`)
        .addFields(
          { name: 'Unassigned Points', value: `${player.unassignedPoints}`, inline: true },
          {
            name: 'Vitality',
            value: `${player.attributes.vitalite}`,
            inline: true
          },
          { name: 'Wisdom', value: `${player.attributes.sagesse}`, inline: true },
          { name: 'Strength', value: `${player.attributes.force}`, inline: true },
          {
            name: 'Intelligence',
            value: `${player.attributes.intelligence}`,
            inline: true
          },
          { name: 'Luck', value: `${player.attributes.chance}`, inline: true },
          { name: 'Agility', value: `${player.attributes.agilite}`, inline: true }
        )
        .setFooter({
          text:
            'Costs: Vitality/Wisdom = 2 points per +1. Others = 1 per +1.'
        })
        .setTimestamp();
  
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  
    if (sub === 'assign') {
      const attr = interaction.options.getString('attribute');
      const amount = interaction.options.getInteger('amount');
  
      const costPerPoint = metrics.attributeCosts[attr];
      if (costPerPoint === undefined) {
        return interaction.reply({
          content: '❌ Invalid attribute choice.',
          ephemeral: true
        });
      }
  
      const totalCost = costPerPoint * amount;
      if (player.unassignedPoints < totalCost) {
        return interaction.reply({
          content: `❌ You only have ${player.unassignedPoints} unassigned points but need ${totalCost} to assign.`,
          ephemeral: true
        });
      }
  
      // Apply the assignment
      switch (attr) {
        case 'Vitality':
          player.attributes.vitalite += amount;
          player.hpMax += amount; // each +1 Vitality = +1 HP max
          break;
        case 'Wisdom':
          player.attributes.sagesse += amount;
          break;
        case 'Strength':
          player.attributes.force += amount;
          break;
        case 'Intelligence':
          player.attributes.intelligence += amount;
          break;
        case 'Luck':
          player.attributes.chance += amount;
          break;
        case 'Agility':
          player.attributes.agilite += amount;
          break;
      }
  
      player.unassignedPoints -= totalCost;
      await player.save();
  
      return interaction.reply({
        content: `✅ Assigned **${amount}** point(s) to ${attr}. You have **${player.unassignedPoints}** points left.`,
        ephemeral: true
      });
    }
  }
  
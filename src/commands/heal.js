// src/commands/heal.js
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import Player from '../data/models/Player.js';

export const data = new SlashCommandBuilder()
  .setName('heal')
  .setDescription('Enter or exit healing (1 HP per hour).');

export async function execute(interaction) {
  const discordId = interaction.user.id;
  let player = await Player.findOne({ discordId });
  if (!player) {
    player = await Player.create({ discordId });
  }

  // If player is currently on expedition, they cannot heal
  if (player.inExpedition) {
    return interaction.reply({
      content: '❌ You are currently on a mission and cannot enter healing right now.',
      ephemeral: true
    });
  }

  // Build the embed showing current HP and healing state
  const embed = new EmbedBuilder()
    .setColor(player.healing ? 0x00FF00 : 0xFF0000)
    .setTitle(player.healing ? '🛌 Healing Mode' : '🚑 Not Healing')
    .addFields(
      { name: 'Current HP', value: `${player.hp}/${player.hpMax}`, inline: true },
      { name: 'Healing?',   value: player.healing ? 'Yes' : 'No', inline: true }
    )
    .setFooter({ text: 'Healing rate: 1 HP per hour' })
    .setTimestamp();

  // Build buttons
  let row;
  if (!player.healing) {
    // Show “Start Healing” button
    const startBtn = new ButtonBuilder()
      .setCustomId(`startHealing:${discordId}`)
      .setLabel('Start Healing')
      .setStyle(ButtonStyle.Success);
    row = new ActionRowBuilder().addComponents(startBtn);
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } else {
    // Show “Stop Healing” button
    const stopBtn = new ButtonBuilder()
      .setCustomId(`stopHealing:${discordId}`)
      .setLabel('Stop Healing')
      .setStyle(ButtonStyle.Danger);
    row = new ActionRowBuilder().addComponents(stopBtn);
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
}

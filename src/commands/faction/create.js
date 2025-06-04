// src/commands/faction/create.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { initializeFactions } from '../../services/factionService.js';

export const data = new SlashCommandBuilder()
  .setName('faction-create') // not used directly; metadata is in parent command
  .setDescription('Initialize the three core factions (Red, Blue, Green) – admin only');

export async function execute(interaction) {
  // Replace these IDs with your real admin Discord user IDs
  const adminIds = ['295687870306320384'];

  if (!adminIds.includes(interaction.user.id)) {
    return interaction.reply({ content: '❌ You do not have permission to run this command.', ephemeral: true });
  }

  try {
    await initializeFactions();
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ Factions Initialized')
      .setDescription('🔴 Red, 🔵 Blue, and 🟢 Green factions have been created (if not already present).')
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    console.error('Error in /faction create:', err);
    return interaction.reply({ content: '❌ Something went wrong while initializing factions.', ephemeral: true });
  }
}

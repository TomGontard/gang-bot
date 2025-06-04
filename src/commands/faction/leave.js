// src/commands/faction/leave.js
import { SlashCommandBuilder } from 'discord.js';
import Player from '../../data/models/Player.js';
import { removePlayerFromFaction } from '../../services/factionService.js';

export const data = new SlashCommandBuilder()
  .setName('faction-leave')
  .setDescription('Leave your current faction');

export async function execute(interaction) {
  const discordId = interaction.user.id;

  const player = await Player.findOne({ discordId });
  if (!player || !player.faction) {
    return interaction.reply({
      content: '❌ You are not currently a member of any faction.',
      ephemeral: true
    });
  }

  try {
    await removePlayerFromFaction(player);
    return interaction.reply({
      content: '✅ You have successfully left your faction.',
      ephemeral: true
    });
  } catch (err) {
    console.error('Error in /faction leave:', err);
    return interaction.reply({
      content: '❌ Something went wrong while leaving your faction.',
      ephemeral: true
    });
  }
}

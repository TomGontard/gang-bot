// src/commands/resetAll.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Player from '../data/models/Player.js';

export const data = new SlashCommandBuilder()
  .setName('resetall')
  .setDescription('🔧 Réinitialise les attributs de tous les joueurs (admin uniquement)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const players = await Player.find({});
  let count = 0;

  for (const player of players) {
    const level = player.level || 1;
    player.unassignedPoints = (level - 1) * 10;
    player.attributes = {
      vitalite: 5,
      sagesse: 5,
      force: 5,
      intelligence: 5,
      chance: 5,
      agilite: 5,
    };
    await player.save();
    count++;
  }

  return interaction.reply({
    content: `✅ Réinitialisation complète des attributs pour **${count}** joueurs.`,
    ephemeral: true,
  });
}

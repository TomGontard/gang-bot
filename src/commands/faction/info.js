// src/commands/faction/info.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Player from '../../data/models/Player.js';
import { getPlayerFaction } from '../../services/factionService.js';

export const data = new SlashCommandBuilder()
  .setName('faction-info')
  .setDescription('Get information about your current faction');

export async function execute(interaction) {
  const discordId = interaction.user.id;

  const player = await Player.findOne({ discordId });
  if (!player || !player.faction) {
    return interaction.reply({
      content: '❌ You are not currently a member of any faction.',
      ephemeral: true
    });
  }

  const faction = await getPlayerFaction(player);
  if (!faction) {
    return interaction.reply({
      content: '❌ Your faction could not be found. (Data inconsistency.)',
      ephemeral: true
    });
  }

  const embed = new EmbedBuilder()
    .setColor(faction.color || '#ffffff')
    .setTitle(`📊 Faction Info: ${faction.displayName || faction.name}`)
    .addFields(
      { name: 'Name',          value: faction.name, inline: true },
      { name: 'Display Name',  value: faction.displayName, inline: true },
      { name: 'Members Count', value: `${faction.membersCount}`, inline: true },
      { name: 'War Ongoing',   value: faction.warOngoing ? 'Yes' : 'No', inline: true }
    )
    .setFooter({ text: 'Use /faction leave to exit this faction' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

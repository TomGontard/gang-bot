// src/commands/profile.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Player from '../data/models/Player.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Affiche votre profil et vos statistiques de bandit.');

export async function execute(interaction) {
  const discordId = interaction.user.id;

  // Récupérer ou créer si n’existe pas
  let player = await Player.findOne({ discordId });
  if (!player) {
    player = await Player.create({ discordId });
  }

  // Préparer un embed pour afficher le profil
  const embed = new EmbedBuilder()
    .setTitle(`Profil de ${interaction.user.username}`)
    .addFields(
      { name: 'Faction', value: player.faction || 'Aucune', inline: true },
      { name: 'Niveau', value: player.level.toString(), inline: true },
      { name: 'XP', value: player.xp.toString(), inline: true },
      { name: 'Coins', value: player.coins.toString(), inline: true },
      { name: 'PV', value: `${player.hp}/${player.hpMax}`, inline: true },
      { name: 'Stats', value:
        `Vit: ${player.attributes.vitalite}\n` +
        `Sag: ${player.attributes.sagesse}\n` +
        `For: ${player.attributes.force}\n` +
        `Int: ${player.attributes.intelligence}\n` +
        `Cha: ${player.attributes.chance}\n` +
        `Agi: ${player.attributes.agilite}`
      }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

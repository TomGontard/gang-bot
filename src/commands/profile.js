// src/commands/profile.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Player from '../data/models/Player.js';
import { getNFTCount, getBoosts } from '../services/nftService.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Display your Bandit profile (in English).');

export async function execute(interaction) {
  const discordId = interaction.user.id;

  let player = await Player.findOne({ discordId });
  if (!player) {
    // initialize with base values
    player = await Player.create({ discordId });
  }

  // Fetch NFT count and boosts
  const nftCount = await getNFTCount(discordId);
  const { xpBoost, coinsBoost, maxMissions } = getBoosts(nftCount);

  // Compute HP regen if currently healing
  let healingNote = 'Not healing';
  if (player.healing && player.healStartAt) {
    const elapsedMs = Date.now() - new Date(player.healStartAt).getTime();
    const hoursHealing = Math.floor(elapsedMs / 3_600_000);
    healingNote = `Healing for ${hoursHealing} hour(s) → regained ${hoursHealing} HP so far.`;
  }

  // Build embed
  const embed = new EmbedBuilder()
    .setColor(0xDD2E44)
    .setTitle(`🕵️‍♂️ Bandit Profile: ${interaction.user.username}`)
    .addFields(
      { name: '🔑 Discord ID',     value: player.discordId, inline: true },
      { name: '🏷️ Faction',        value: player.faction || 'None', inline: true },
      { name: '🏷️ Level',          value: `${player.level}`, inline: true },
      { name: '📈 XP',             value: `${player.xp}`, inline: true },
      { name: '💰 Coins',          value: `${player.coins}`, inline: true },
      { name: '❤️‍🩹 HP',           value: `${player.hp}/${player.hpMax}`, inline: true },
      { name: '🚑 Healing Status', value: healingNote, inline: false },
      { name: '🔥 In Expedition',  value: player.inExpedition ? 'Yes' : 'No', inline: true },
      { name: '🔢 NFT Held',       value: `${nftCount}`, inline: true },
      { name: '📊 Boosts',         value:
        `• XP Boost: ${(xpBoost * 100).toFixed(0)}%\n` +
        `• Coins Boost: ${(coinsBoost * 100).toFixed(0)}%\n` +
        `• Max Concurrent Missions: ${maxMissions}`, inline: true
      },
      { name: '⚙️ Unassigned Points', value: `${player.unassignedPoints}`, inline: true },
      { name: '🛠️ Attributes', value:
        `Vitality: ${player.attributes.vitalite}\n` +
        `Wisdom:   ${player.attributes.sagesse}\n` +
        `Strength: ${player.attributes.force}\n` +
        `Intel:    ${player.attributes.intelligence}\n` +
        `Luck:     ${player.attributes.chance}\n` +
        `Agility:  ${player.attributes.agilite}`, inline: false
      }
    )
    .setFooter({ text: 'Every level gives 10 attribute points. Vitality/Wisdom cost 2 points to raise by 1.' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

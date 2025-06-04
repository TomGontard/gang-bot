// src/commands/faction/join.js
import { SlashCommandBuilder } from 'discord.js';
import Player from '../../data/models/Player.js';
import { getNFTCount } from '../../services/nftService.js';
import {
  canJoinFaction,
  assignFactionToPlayer,
  getFactionByName
} from '../../services/factionService.js';

export const data = new SlashCommandBuilder()
  .setName('faction-join')
  .setDescription('Join one of the three factions (requires at least 1 Genesis NFT)')
  .addStringOption(opt =>
    opt
      .setName('name')
      .setDescription('Faction name to join (Red/Blue/Green)')
      .setRequired(true)
      .addChoices(
        { name: '🔴 Red',   value: 'Red' },
        { name: '🔵 Blue',  value: 'Blue' },
        { name: '🟢 Green', value: 'Green' }
      )
  );

export async function execute(interaction) {
  const discordId = interaction.user.id;
  const chosenName = interaction.options.getString('name');

  // 1) Check that user has at least 1 Genesis NFT
  const nftCount = await getNFTCount(discordId);
  if (nftCount < 1) {
    return interaction.reply({
      content: '❌ You need at least 1 Genesis Pass NFT to join a faction.',
      ephemeral: true
    });
  }

  // 2) Ensure faction exists
  const faction = await getFactionByName(chosenName);
  if (!faction) {
    return interaction.reply({
      content: `❌ Faction "${chosenName}" does not exist.`,
      ephemeral: true
    });
  }

  // 3) Fetch or create Player
  let player = await Player.findOne({ discordId });
  if (!player) {
    player = await Player.create({ discordId });
  }

  try {
    // 4) Check if joining would break the ±3 rule
    const allowed = await canJoinFaction(chosenName);
    if (!allowed) {
      return interaction.reply({
        content: '❌ Cannot join that faction: it would unbalance the roster (difference > 3).',
        ephemeral: true
      });
    }

    // 5) Assign (or switch) faction
    await assignFactionToPlayer(player, chosenName);
    return interaction.reply({
      content: `✅ You have successfully joined **${chosenName}**!`,
      ephemeral: true
    });
  } catch (err) {
    return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
  }
}

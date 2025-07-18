// src/commands/give.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Player from '../data/models/Player.js';
import { addExperience } from '../services/experienceService.js';
import { createEmbed } from '../utils/createEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('give')
  .setDescription('Admin: grant healing, XP or coins to a player')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt
      .setName('type')
      .setDescription('What to give')
      .setRequired(true)
      .addChoices(
        { name: 'Heal',  value: 'heal' },
        { name: 'XP',    value: 'xp' },
        { name: 'Coins', value: 'coins' }
      )
  )
  .addUserOption(opt =>
    opt
      .setName('user')
      .setDescription('Target user')
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt
      .setName('amount')
      .setDescription('Amount to give')
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction) {
  const type   = interaction.options.getString('type', true);
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const discordId = target.id;

  // fetch or create player record
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  let embed;
  switch (type) {
    case 'heal': {
      const oldHp = player.hp;
      player.hp = Math.min(player.hp + amount, player.hpMax);
      await player.save();
      embed = createEmbed({
        title: '💉 Heal Given',
        description:
          `${target} has been healed for **${amount} HP**.\n` +
          `Health: **${oldHp} → ${player.hp}/${player.hpMax}**.`,
        interaction
      });
      break;
    }
    case 'xp': {
      const { levelsGained, nextLevelXp } = await addExperience(player, amount);
      await player.save();
      embed = createEmbed({
        title: '⚡ XP Granted',
        description:
          `${target} received **${amount} XP**.\n` +
          (levelsGained
            ? `Leveled up **+${levelsGained}** times! Next level at **${nextLevelXp} XP**.`
            : `Current XP: **${player.xp}**.`),
        interaction
      });
      break;
    }
    case 'coins': {
      const oldCoins = player.coins;
      player.coins += amount;
      await player.save();
      embed = createEmbed({
        title: '💰 Coins Granted',
        description:
          `${target} received **${amount} coins**.\n` +
          `Balance: **${oldCoins} → ${player.coins}**.`,
        interaction
      });
      break;
    }
    default:
      // en cas de type invalide (normalement impossible)
      return interaction.followUp({
        content: '❌ Invalid type.',
        ephemeral: true
      });
  }

  // Édite la réponse différée
  await interaction.editReply({ embeds: [embed] });
}

// src/commands/attributes.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import Player from '../data/models/Player.js';
import { createEmbed } from '../utils/createEmbed.js';

const ATTR_MAP = {
  Vitality:      { key: 'vitalite',    hpKey: 'hpMax' },
  Wisdom:        { key: 'sagesse' },
  Strength:      { key: 'force' },
  Intelligence:  { key: 'intelligence' },
  Luck:          { key: 'chance' },
  Agility:       { key: 'agilite' }
};

export const data = new SlashCommandBuilder()
  .setName('attributes')
  .setDescription('🛠️ Admin: add or remove attribute points for a player')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('add')
      .setDescription('Add attribute points')
      .addUserOption(opt =>
        opt.setName('user')
           .setDescription('Player to modify')
           .setRequired(true))
      .addStringOption(opt =>
        opt.setName('attribute')
           .setDescription('Which attribute')
           .setRequired(true)
           .addChoices(
             { name: 'Vitality',       value: 'Vitality' },
             { name: 'Wisdom',         value: 'Wisdom' },
             { name: 'Strength',       value: 'Strength' },
             { name: 'Intelligence',   value: 'Intelligence' },
             { name: 'Luck',           value: 'Luck' },
             { name: 'Agility',        value: 'Agility' }
           ))
      .addIntegerOption(opt =>
        opt.setName('amount')
           .setDescription('How many points to add')
           .setRequired(true)
           .setMinValue(1)))
  .addSubcommand(sub =>
    sub
      .setName('remove')
      .setDescription('Remove attribute points')
      .addUserOption(opt =>
        opt.setName('user')
           .setDescription('Player to modify')
           .setRequired(true))
      .addStringOption(opt =>
        opt.setName('attribute')
           .setDescription('Which attribute')
           .setRequired(true)
           .addChoices(
             { name: 'Vitality',       value: 'Vitality' },
             { name: 'Wisdom',         value: 'Wisdom' },
             { name: 'Strength',       value: 'Strength' },
             { name: 'Intelligence',   value: 'Intelligence' },
             { name: 'Luck',           value: 'Luck' },
             { name: 'Agility',        value: 'Agility' }
           ))
      .addIntegerOption(opt =>
        opt.setName('amount')
           .setDescription('How many points to remove')
           .setRequired(true)
           .setMinValue(1)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user', true);
  const discordId = target.id;
  const attrName = interaction.options.getString('attribute', true);
  const amount   = interaction.options.getInteger('amount', true);

  // Load or create player
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  const map = ATTR_MAP[attrName];
  if (!map) {
    return interaction.reply({ content: '❌ Unknown attribute.', ephemeral: true });
  }

  const field = map.key;
  const current = player.attributes[field] || 0;
  let newVal;

  if (sub === 'add') {
    newVal = current + amount;
    player.attributes[field] = newVal;
    // if Vitality, increase hpMax as well
    if (map.hpKey) {
      player[map.hpKey] = (player[map.hpKey] || 0) + amount;
    }
  } else { // remove
    newVal = current - amount;
    if (newVal < 0) newVal = 0;
    const actuallyRemoved = current - newVal;
    player.attributes[field] = newVal;
    if (map.hpKey && actuallyRemoved > 0) {
      player[map.hpKey] = Math.max(1, (player[map.hpKey] || 1) - actuallyRemoved);
      // also cap current HP if above new max
      if (player.hp > player[map.hpKey]) player.hp = player[map.hpKey];
    }
  }

  await player.save();

  const embed = createEmbed({
    title: `🛠️ ${sub === 'add' ? 'Added' : 'Removed'} Points`,
    description: [
      `${target} now has **${newVal}** point(s) in **${attrName}**.`,
      map.hpKey
        ? `\nTheir **HP Max** is now **${player[map.hpKey]}**.`
        : ''
    ].join(''),
    interaction
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

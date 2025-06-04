// src/commands/faction/leave.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../../data/models/Player.js';

const ROLE_RED_ID   = process.env.ROLE_RED_FACTION_ID;
const ROLE_BLUE_ID  = process.env.ROLE_BLUE_FACTION_ID;
const ROLE_GREEN_ID = process.env.ROLE_GREEN_FACTION_ID;

// Custom ID prefix for leave confirmation button
const LEAVE_BUTTON_PREFIX = 'factionLeaveConfirm';

export const data = new SlashCommandBuilder()
  .setName('faction-leave')
  .setDescription('Leave your current faction (requires confirmation)');

export async function execute(interaction) {
  const discordId = interaction.user.id;
  const player = await Player.findOne({ discordId });

  // 1) Verify the player exists and has a faction
  if (!player || !player.faction) {
    return interaction.reply({
      content: '❌ You are not currently a member of any faction.',
      ephemeral: true
    });
  }

  // 2) Build a confirmation embed + button
  const embed = new EmbedBuilder()
    .setColor('#FFCC00')
    .setTitle('⚠️ Confirm Leave')
    .setDescription('Are you sure you want to leave your faction?')
    .addFields({ name: 'Current Faction', value: `**${player.faction}**`, inline: true })
    .addFields({ name: 'Cooldown', value: 'You will not be able to join another faction for 24 hours.', inline: true })
    .setFooter({ text: 'Click "Confirm Leave" below to proceed.' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId(`${LEAVE_BUTTON_PREFIX}:${discordId}`)
    .setLabel('Confirm Leave')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(button);

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

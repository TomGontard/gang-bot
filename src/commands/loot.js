// src/commands/loot.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { sendLootDrop } from '../services/lootService.js';

export const data = new SlashCommandBuilder()
  .setName('loot')
  .setDescription('💥 Trigger a loot drop immediately (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const res = await sendLootDrop(interaction.client);
  if (!res) {
    await interaction.editReply('❌ Unable to send loot (check channel/roles in metrics.lootConfig).');
    return;
  }
  await interaction.editReply(`✅ Loot drop triggered (event #${res.idx}).`);
}

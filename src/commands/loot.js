// src/commands/loot.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import metrics from '../config/metrics.js';
import { createEmbed } from '../utils/createEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('loot')
  .setDescription('💥 Trigger a loot drop immediately (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  // on a déjà deferred dans interactionHandler(), on peut directement opérer
  const { channelId, roles, messages } = metrics.lootConfig;
  const channel = await interaction.client.channels.fetch(channelId);
  if (!channel?.isTextBased()) {
    await interaction.editReply('❌ Channel not found or not text‐based.');
    return;
  }

  // Choisir un event au hasard
  const idx = Math.floor(Math.random() * messages.length);
  const { text } = messages[idx];

  // Construire le bouton de claim
  const claimBtn = new ButtonBuilder()
    .setCustomId(`claimLoot:${idx}`)
    .setLabel('Claim Loot')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(claimBtn);

  // Mentionner les factions hors embed
  const mention = roles.map(r => `<@&${r}>`).join(' ');

  // Envoyer dans le channel
  await channel.send({
    content: mention,
    embeds: [
      createEmbed({
        title: '📦 A loot crate has appeared!',
        description: text,
        timestamp: true
      })
    ],
    components: [row]
  });

  // Confirmer à l'admin que le drop est fait
  await interaction.editReply('✅ Loot drop triggered.');
}

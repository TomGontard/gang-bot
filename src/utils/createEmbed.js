// src/utils/createEmbed.js
import { EmbedBuilder } from 'discord.js';

/**
 * Factory for all GangBot embeds
 */
export function createEmbed({
  title,
  description = '',
  fields = [],
  color = 0xdd2e44,
  footer = true,
  timestamp = false,
  interaction = null
}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title);

  // On ne setDescription QUE si on a bien une string non vide
  if (typeof description === 'string' && description.length > 0) {
    embed.setDescription(description);
  }

  if (fields.length) {
    embed.addFields(fields);
  }

  if (timestamp) {
    embed.setTimestamp();
  }

  if (footer && interaction?.client) {
    embed.setFooter({
      text: 'GangBot • by CrypTom',
      iconURL: interaction.client.user.displayAvatarURL() || undefined
    });
  }

  return embed;
}

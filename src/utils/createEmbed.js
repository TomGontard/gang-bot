// src/utils/createEmbed.js
import { EmbedBuilder } from 'discord.js';

/**
 * Factory for all GangBot embeds
 * @param {Object} opts
 * @param {string} opts.title         — Titre de l'embed
 * @param {string} opts.description   — Description principale
 * @param {Array<Object>} [opts.fields] — Champs à ajouter ({ name, value, inline })
 * @param {number} [opts.color=0xdd2e44] — Couleur par défaut (rouge GangBot)
 * @param {boolean} [opts.footer=true]   — Afficher ou non le footer commun
 * @param {boolean} [opts.timestamp=true] — Ajouter un timestamp à l’embed
 * @param {Interaction} [opts.interaction] — Pour récupérer le client et la guild
 */
export function createEmbed({
  title,
  description,
  fields = [],
  color = 0xdd2e44,
  footer = true,
  timestamp = true,
  interaction = null
}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);

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

// src/handlers/lootHandler.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import metrics from '../../config/metrics.js';
import { distributeLootToFaction } from '../../services/lootService.js';
import { createEmbed } from '../../utils/createEmbed.js';

const PREFIX = 'claimLoot';
const FACTION_NAMES = ['RED','BLUE','GREEN'];

export default async function lootHandler(interaction) {
  const [, idxStr] = interaction.customId.split(':');
  const idx = parseInt(idxStr, 10);
  const lootEntry = metrics.lootConfig.messages[idx];
  if (!lootEntry) {
    const embed = createEmbed({
      title: '❌ Loot Not Found',
      description: 'This loot event could not be located.',
      interaction
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Determine which faction role the user has
  const memberRoles = interaction.member.roles.cache;
  let factionName = null;
  let factionRoleId = null;
  for (const name of FACTION_NAMES) {
    const roleId = process.env[`ROLE_${name}_FACTION_ID`];
    if (memberRoles.has(roleId)) {
      factionName = name;
      factionRoleId = roleId;
      break;
    }
  }
  if (!factionName) {
    const embed = createEmbed({
      title: '❌ Forbidden',
      description: 'Only members of a faction may claim this loot.',
      interaction
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Distribute the loot
  const { xp, coins } = lootEntry;
  await distributeLootToFaction(factionName, { xp, coins });

  // Success embed, now pinging the role inside the embed description
  const description =
    `✅ **${interaction.user.displayName}** claimed the loot for <@&${factionRoleId}>!\n` +
    `Each member receives **${xp} XP** and **${coins} coins**.`;
  const successEmbed = createEmbed({
    title: '💰 Loot Claimed',
    description,
    interaction,
    timestamp: true
  });

  // Disable that button
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:${idx}`)
      .setLabel('Loot Claimed')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  return interaction.update({ embeds: [successEmbed], components: [disabledRow] });
}

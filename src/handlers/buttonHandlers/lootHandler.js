import { ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { distributeLootToFaction } from '../../services/lootService.js';
import { createEmbed } from '../../utils/createEmbed.js';

const PREFIX = 'claimLoot';

export default /** @param {ButtonInteraction} interaction */ async function lootHandler(interaction) {
  const [ , faction ] = interaction.customId.split(':');
  const userRoles = interaction.member.roles.cache;
  const roleId = process.env[`ROLE_${faction.toUpperCase()}_FACTION_ID`];

  // Seul un membre de la faction peut réclamer
  if (!userRoles.has(roleId)) {
    return interaction.reply({ content: '❌ Seuls les membres de votre faction peuvent réclamer ce butin.', ephemeral: true });
  }

  // Distribuer loot (par exemple 50 XP et 100 coins)
  const { xpReward = 50, coinReward = 100 } = JSON.parse(process.env.LOOT_REWARDS || '{}');
  const results = await distributeLootToFaction(faction, { xp: xpReward, coins: coinReward });

  // Construire un résumé pour l'embed final
  const description = `✅ **${interaction.user.displayName}** a réclamé pour **${faction}** !\n`
    + `Chaque membre gagne **${xpReward} XP** et **${coinReward} coins**.`;

  const embed = createEmbed({ title: '💰 Butin réclamé', description });

  // Désactiver tous les boutons
  const disabledRow = new ActionRowBuilder()
    .addComponents(
      ['RED','BLUE','GREEN'].map(col =>
        new ButtonBuilder()
          .setCustomId(`${PREFIX}:${col}`)
          .setLabel(`${col} Faction`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    );

  // On édite le message d'origine
  await interaction.update({ embeds: [embed], components: [disabledRow] });
};

import healingHandler from './buttonHandlers/healingHandler.js';
import attributesHandler from './buttonHandlers/attributesHandler.js';
import factionHandler from './buttonHandlers/factionHandler.js';
import missionHandler from './buttonHandlers/missionHandler.js';

export default async function interactionHandler(interaction, client) {
  // 1️⃣ Slash‐commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      // Pré‐défère la réponse pour éviter le timeout à 3s
      await interaction.deferReply({ flags: 64 });
      await command.execute(interaction);
    } catch (err) {
      console.error('Error executing command:', err);
      if (interaction.deferred) {
        await interaction.editReply({ content: '❌ Error executing command.' });
      } else {
        await interaction.reply({ content: '❌ Error executing command.', flags: 64 });
      }
    }
    return;
  }

  // 2️⃣ Pagination Leaderboard
  if (interaction.isButton()) {
    const [action, pageStr, ownerId] = interaction.customId.split(':');
    if ((action === 'leaderPrev' || action === 'leaderNext') && interaction.user.id === ownerId) {
      await interaction.deferUpdate();
      const page = parseInt(pageStr, 10);
      const newPage = action === 'leaderPrev' ? page - 1 : page + 1;
      const { buildLeaderboard } = await import('../commands/leaderboard.js');
      const { embed, components } = await buildLeaderboard(newPage, interaction);
      return interaction.editReply({ embeds: [embed], components });
    }
  }

  // 3️⃣ Button ou Select‐Menu
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const [action] = interaction.customId.split(':');

    if (['openHealing', 'startHealing', 'stopHealing'].includes(action)) {
      return healingHandler(interaction);
    }
    if (['openAttributes', 'attrAdd'].includes(action)) {
      return attributesHandler(interaction);
    }
    if (['openFactions', 'selectFaction', 'confirmFactionLeave', 'finalFactionLeave'].includes(action)) {
      return factionHandler(interaction);
    }
    if (['openMissions', 'launchMission', 'viewMissions', 'selectMission', 'claimMissions'].includes(action)) {
      return missionHandler(interaction);
    }
  }
}

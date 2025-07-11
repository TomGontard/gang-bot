// src/handlers/interactionHandler.js
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
      await command.execute(interaction);
    } catch (err) {
      console.error('Error executing command:', err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ Error executing command.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
      }
    }
    return;
  }

  // 2️⃣ Leaderboard pagination buttons
  if (interaction.isButton()) {
    const [action, pageStr, ownerId] = interaction.customId.split(':');
    if ((action === 'leaderPrev' || action === 'leaderNext') && interaction.user.id === ownerId) {
      await interaction.deferUpdate();
      const page = parseInt(pageStr, 10);
      const newPage = action === 'leaderPrev' ? page - 1 : page + 1;
      // Dynamically import buildLeaderboard from your leaderboard command
      const { buildLeaderboard } = await import('../commands/leaderboard.js');
      const { embed, components } = await buildLeaderboard(newPage, interaction);
      return interaction.editReply({ embeds: [embed], components });
    }
  }

  // 3️⃣ Button or Select‐Menu interactions
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const [action] = interaction.customId.split(':');

    // Healing flow
    if (['openHealing', 'startHealing', 'stopHealing'].includes(action)) {
      return healingHandler(interaction);
    }

    // Attributes flow
    if (['openAttributes', 'attrAdd'].includes(action)) {
      return attributesHandler(interaction);
    }

    // Factions flow
    if (['openFactions', 'selectFaction', 'confirmFactionLeave', 'finalFactionLeave'].includes(action)) {
      return factionHandler(interaction);
    }

    // Missions flow
    if (['openMissions', 'launchMission', 'viewMissions', 'selectMission', 'claimMissions'].includes(action)) {
      return missionHandler(interaction);
    }
  }
}

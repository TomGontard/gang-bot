// src/handlers/interactionHandler.js
import healingHandler from './buttonHandlers/healingHandler.js';
import attributesHandler from './buttonHandlers/attributesHandler.js';
import factionHandler from './buttonHandlers/factionHandler.js';
import missionHandler from './buttonHandlers/missionHandler.js';

export default async function interactionHandler(interaction, client) {
  // 1️⃣ Slash commands
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

  // 2️⃣ Button or Select‐Menu interactions
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const [action] = interaction.customId.split(':');

    if (action === 'openHealing' || action === 'startHealing' || action === 'stopHealing') {
      await healingHandler(interaction);
      return;
    }
    if (action === 'openAttributes' || action === 'attrAdd') {
      await attributesHandler(interaction);
      return;
    }
    if (
      action === 'openFactions' ||
      action === 'selectFaction' ||
      action === 'confirmFactionLeave' ||
      action === 'finalFactionLeave'
    ) {
      await factionHandler(interaction);
      return;
    }
    if (
      action === 'openMissions' ||
      action === 'launchMission' ||
      action === 'viewMissions' ||
      action === 'selectMission' ||
      action === 'claimMissions'
    ) {
      await missionHandler(interaction);
      return;
    }
  }
}

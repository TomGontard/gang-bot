// src/handlers/interactionHandler.js
import healingHandler from './buttonHandlers/healingHandler.js';
import attributesHandler from './buttonHandlers/attributesHandler.js';
import factionHandler from './buttonHandlers/factionHandler.js';
import missionHandler from './buttonHandlers/missionHandler.js';

export default async function interactionHandler(interaction, client) {
  // 1️⃣ Slash‐commands still need to be handled
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

  // 2️⃣ Buttons & Selects
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const [action] = interaction.customId.split(':');

    // Healing flow
    if (['openHealing','startHealing','stopHealing'].includes(action)) {
      return healingHandler(interaction);
    }
    // Attributes flow
    if (['openAttributes','attrAdd'].includes(action)) {
      return attributesHandler(interaction);
    }
    // Factions flow
    if (['openFactions','selectFaction','confirmFactionLeave','finalFactionLeave'].includes(action)) {
      return factionHandler(interaction);
    }
    // Missions flow
    if (['openMissions','launchMission','viewMissions','selectMission','claimMissions'].includes(action)) {
      return missionHandler(interaction);
    }
  }
}

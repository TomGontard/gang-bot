// src/handlers/interactionHandler.js
import Player from '../data/models/Player.js';
import healingHandler from './buttonHandlers/healingHandler.js';
import attributesHandler from './buttonHandlers/attributesHandler.js';
import factionHandler from './buttonHandlers/factionHandler.js';

export default async function interactionHandler(interaction, client) {
  // 1️⃣ Slash Commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error('Error executing command:', err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ Error executing command.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ Error executing command.',
          ephemeral: true
        });
      }
    }
    return;
  }

  // 2️⃣ Button or Select‐Menu Interactions
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const [action] = interaction.customId.split(':');

    if (action === 'startHealing' || action === 'stopHealing' || action === 'openHealing') {
      return healingHandler(interaction);
    }
    if (action === 'openAttributes' || action === 'attrAdd') {
      return attributesHandler(interaction);
    }
    if (
      action === 'openFactions' ||
      action === 'selectFaction' ||
      action === 'confirmFactionLeave' ||
      action === 'finalFactionLeave'
    ) {
      return factionHandler(interaction, client);
    }
  }
}

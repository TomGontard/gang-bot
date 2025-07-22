// src/handlers/interactionHandler.js
import healingHandler from './buttonHandlers/healingHandler.js';
import attributesHandler from './buttonHandlers/attributesHandler.js';
import factionHandler from './buttonHandlers/factionHandler.js';
import missionHandler from './buttonHandlers/missionHandler.js';
import lootHandler from './buttonHandlers/lootHandler.js';
import shopHandler from './buttonHandlers/shopHandler.js';
import inventoryHandler from './buttonHandlers/inventoryHandler.js';

export default async function interactionHandler(interaction, client) {
  // 1️⃣ Slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
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

  // 2️⃣ Leaderboard pagination
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

  // 3️⃣ Buttons & Selects
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const [action] = interaction.customId.split(':');

    // 🎲 Loot
    if (action === 'claimLoot') {
      return lootHandler(interaction);
    }

    // 🛌 Healing
    if (['openHealing', 'startHealing', 'stopHealing'].includes(action)) {
      return healingHandler(interaction);
    }

    // 🛠️ Attributes
    if (['openAttributes', 'attrAdd'].includes(action)) {
      return attributesHandler(interaction);
    }

    // 🏷️ Factions
    if (['openFactions', 'selectFaction', 'confirmFactionLeave', 'finalFactionLeave'].includes(action)) {
      return factionHandler(interaction);
    }

    // 🗂️ Missions
    if (['openMissions', 'launchMission', 'viewMissions', 'selectMission', 'claimMissions'].includes(action)) {
      return missionHandler(interaction);
    }

    // 🛒 Shop
    if (['openShop', 'shopPage', 'shopSelect'].includes(action)) {
      return shopHandler(interaction);
    }

    // 🎒 Inventory & Equipment
    if ([
      'openInventory',
      'invPage',
      'invSelect',
      'openEquipment',
      'eqSlot',
      'eqSelect',
      'eqConfirm',
      'invBack'
    ].includes(action)) {
      return inventoryHandler(interaction);
    }
  }
}

// src/handlers/interactionHandler.js
import healingHandler from './buttonHandlers/healingHandler.js';
import attributesHandler from './buttonHandlers/attributesHandler.js';
import factionHandler from './buttonHandlers/factionHandler.js';
import missionHandler from './buttonHandlers/missionHandler.js';
import lootHandler from './buttonHandlers/lootHandler.js';
import shopHandler from './buttonHandlers/shopHandler.js';
import inventoryHandler from './buttonHandlers/inventoryHandler.js';

export default async function interactionHandler(interaction, client) {
  // 1) Slash commands
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      // Chaque commande gère son propre defer/reply
      await command.execute(interaction);
    } catch (err) {
      console.error('Error executing command:', err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ Error executing command.' });
      } else {
        await interaction.reply({ content: '❌ Error executing command.', flags: 64 });
      }
    }
    return;
  }

  // 2) Leaderboard pagination (if any)
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

  // 3) Buttons & Selects (route to handlers)
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    // ✅ Manager vote select menu
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('mgrVote:')) {
      const [, electionId] = interaction.customId.split(':');
      const candidateId = interaction.values?.[0];
      try {
        const { castManagerVote } = await import('../services/managerService.js');
        await castManagerVote(electionId, interaction.user.id, candidateId);
        return interaction.reply({ content: `✅ Your vote for <@${candidateId}> has been recorded.`, flags: 64 });
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, flags: 64 });
      }
    }

    const [action] = interaction.customId.split(':');

    if (action === 'claimLoot') return lootHandler(interaction);
    if (['openHealing', 'startHealing', 'stopHealing'].includes(action)) return healingHandler(interaction);
    if (['openAttributes', 'attrAdd', 'attrIncrement'].includes(action)) return attributesHandler(interaction);

    if ([
      'openFactions','selectFaction','confirmFactionLeave','finalFactionLeave',
      'fStats','fMap','fDefJoin','fDefLeave','fAtkStart','fAtkJoin',
      'fBuild','fBuildChoose','fBuildUp','fBuildDestroy','fFortUp',
      'fDonateOpen','fBankDepositOpen','fGuide',
      'fMgrStart','fMgrVote','fMgrFinalize'
    ].includes(action)) {
      return factionHandler(interaction);
    }

    if (['openMissions','launchMission','viewMissions','selectMission','claimMissions'].includes(action)) {
      return missionHandler(interaction);
    }
    if (['openShop','shopPage','shopSelect'].includes(action)) return shopHandler(interaction);
    if (['openInventory','invPage','invSelect','openEquipment','eqSlot','eqSelect','eqConfirm','invBack'].includes(action)) {
      return inventoryHandler(interaction);
    }
  }

  // 4) Modal submit
  if (interaction.isModalSubmit()) {
    const [action, discordId] = interaction.customId.split(':');

    // Route the treasury deposit modal to the faction handler
    if (action === 'fTreasuryDepositSubmit') {
      return factionHandler(interaction);
    }

    // Donation (75/25 redistribution) kept here
    if (action === 'fDonateSubmit') {
      if (interaction.user.id !== discordId) {
        return interaction.reply({ content:'❌ Not yours.', flags: 64 });
      }
      const { recordFactionDonation } = await import('../services/donationService.js');
      const amount = parseInt(interaction.fields.getTextInputValue('amount') || '0', 10) || 0;
      try {
        await recordFactionDonation({ donorId: discordId, amount });
        return interaction.reply({
          content: `✅ Donated **${amount}**. **75%** platform • **25%** redistributed at **12:00 UTC**.`,
          flags: 64
        });
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, flags: 64 });
      }
    }
  }
}

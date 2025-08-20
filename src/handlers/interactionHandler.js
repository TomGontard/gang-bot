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
    const [action] = interaction.customId.split(':');

    if (action === 'claimLoot') return lootHandler(interaction);
    if (['openHealing', 'startHealing', 'stopHealing'].includes(action)) return healingHandler(interaction);
    if (['openAttributes', 'attrAdd', 'attrIncrement'].includes(action)) return attributesHandler(interaction);

    if ([
      'openFactions','selectFaction','confirmFactionLeave','finalFactionLeave',
      'fStats','fMap','fDefJoin','fDefLeave','fAtkStart','fAtkJoin',
      'fBuild','fBuildChoose','fBuildUp','fBuildDestroy','fFortUp',
      'fDonateOpen','fBankDepositOpen','fGuide'
    ].includes(action)) {
      return factionHandler(interaction);
    }

    if (['openMissions', 'launchMission', 'viewMissions', 'selectMission', 'claimMissions'].includes(action)) {
      return missionHandler(interaction);
    }
    if (['openShop', 'shopPage', 'shopSelect'].includes(action)) return shopHandler(interaction);
    if (['openInventory','invPage','invSelect','openEquipment','eqSlot','eqSelect','eqConfirm','invBack'].includes(action)) {
      return inventoryHandler(interaction);
    }
  }

  // 4) Modal submit
  if (interaction.isModalSubmit()) {
    const [action, discordId] = interaction.customId.split(':');
    if (interaction.user.id !== discordId) {
      return interaction.reply({ content:'❌ Not yours.', ephemeral:true });
    }

    // 4a) Donation (75/25 redistribution)
    if (action === 'fDonateSubmit') {
      const { recordFactionDonation } = await import('../services/donationService.js');
      const amount = parseInt(interaction.fields.getTextInputValue('amount') || '0', 10) || 0;
      try {
        await recordFactionDonation({ donorId: discordId, amount });
        return interaction.reply({
          content: `✅ Donated **${amount}**. **75%** platform • **25%** redistributed at **12:00 UTC**.`,
          ephemeral: true
        });
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
      }
    }

    // 4b) Treasury deposit (75% treasury, 25% tax → daily redistribution)
    if (action === 'fTreasuryDepositSubmit') {
      const { depositToFactionTreasury } = await import('../services/donationService.js');
      const amount = parseInt(interaction.fields.getTextInputValue('amount') || '0', 10) || 0;
      try {
        const res = await depositToFactionTreasury({ depositorId: discordId, amount });
        return interaction.reply({
          content:
            `🏦 Deposit confirmed\n` +
            `• Amount: **${res.amount}**\n` +
            `• Treasury credited (75%): **+${res.netToTreasury}**\n` +
            `• Tax (25%) → daily redistribution at **12:00 UTC**: **${res.taxToPool}**\n` +
            `• New treasury: **${res.newTreasury}**`,
          ephemeral: true
        });
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, ephemeral: true });
      }
    }
  }
}

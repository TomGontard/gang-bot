// src/handlers/interactionHandler.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Player from '../data/models/Player.js';

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

  // 2️⃣ Boutons (healing)
  if (interaction.isButton()) {
    const customId = interaction.customId;
    const [action, targetId] = customId.split(':');
    if (interaction.user.id !== targetId) {
      return interaction.reply({ content: '❌ You cannot control another user’s healing.', ephemeral: true });
    }

    // Récupérer le joueur
    const discordId = interaction.user.id;
    const player = await Player.findOne({ discordId });
    if (!player) {
      return interaction.reply({ content: '❌ Player not found.', ephemeral: true });
    }

    // 📌 Démarrer le healing
    if (action === 'startHealing') {
      if (player.healing) {
        return interaction.reply({ content: '🔄 You are already in healing mode.', ephemeral: true });
      }
      player.healing = true;
      player.healStartAt = new Date();
      await player.save();

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🛌 Healing Mode Activated')
        .setDescription('You have started healing. You will recover **1 HP per hour**.')
        .addFields(
          { name: 'Current HP', value: `${player.hp}/${player.hpMax}`, inline: true },
          { name: 'Healing Since', value: `<t:${Math.floor(player.healStartAt.getTime()/1000)}:R>`, inline: true }
        )
        .setTimestamp();

      const stopBtn = new ButtonBuilder()
        .setCustomId(`stopHealing:${discordId}`)
        .setLabel('Stop Healing')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(stopBtn);

      return interaction.update({ embeds: [embed], components: [row] });
    }

    // 📌 Arrêter le healing
    if (action === 'stopHealing') {
      if (!player.healing || !player.healStartAt) {
        return interaction.reply({ content: '❌ You are not currently healing.', ephemeral: true });
      }

      const now = new Date();
      const elapsedMs = now.getTime() - new Date(player.healStartAt).getTime();
      const hoursHealed = Math.floor(elapsedMs / 3_600_000);
      const hpGained = Math.min(hoursHealed, player.hpMax - player.hp);

      player.hp += hpGained;
      player.healing = false;
      player.healStartAt = null;
      await player.save();

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('✅ Healing Completed')
        .setDescription(`You have stopped healing and regained **${hpGained} HP** over ${hoursHealed} hour(s).`)
        .addFields(
          { name: 'Current HP', value: `${player.hp}/${player.hpMax}`, inline: true }
        )
        .setTimestamp();

      return interaction.update({ embeds: [embed], components: [] });
    }
  }
}

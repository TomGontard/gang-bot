// src/handlers/interactionHandler.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import Player from '../data/models/Player.js';
import { removePlayerFromFaction } from '../services/factionService.js';
import metrics from '../config/metrics.js';

const ROLE_RED_ID   = process.env.ROLE_RED_FACTION_ID;
const ROLE_BLUE_ID  = process.env.ROLE_BLUE_FACTION_ID;
const ROLE_GREEN_ID = process.env.ROLE_GREEN_FACTION_ID;

const LEAVE_BUTTON_PREFIX = 'factionLeaveConfirm';

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

  // 2️⃣ Button interactions
  if (interaction.isButton()) {
    const customId = interaction.customId;
    const [action, targetId] = customId.split(':');

    // 2.a) Prevent others from clicking
    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content: '❌ You cannot perform this action for another user.',
        ephemeral: true
      });
    }

    // Fetch the player
    const discordId = interaction.user.id;
    const player = await Player.findOne({ discordId });
    if (!player) {
      return interaction.reply({
        content: '❌ Player not found.',
        ephemeral: true
      });
    }

    // 📌 Handle "Confirm Leave" button
    if (action === LEAVE_BUTTON_PREFIX) {
      // If player has no faction, abort
      if (!player.faction) {
        return interaction.update({
          content: '❌ You are not in a faction anymore.',
          embeds: [],
          components: []
        });
      }

      try {
        const oldFaction = player.faction;
        // 1) Remove faction in DB and set cooldown timestamp
        player.faction = null;
        player.lastFactionChange = new Date();
        await player.save();

        // 2) Remove roles in Discord
        const member = await interaction.guild.members.fetch(discordId);
        const rolesToRemove = [ROLE_RED_ID, ROLE_BLUE_ID, ROLE_GREEN_ID].filter(
          (r) => r
        );
        await member.roles.remove(rolesToRemove);

        // 3) Confirmation embed
        const nextAllowed = new Date(
          player.lastFactionChange.getTime() + metrics.factionChangeCooldown
        );
        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Successfully Left Faction')
          .setDescription(`You have left **${oldFaction}**.`)
          .addFields({
            name: 'Next Join Available',
            value: `<t:${Math.floor(nextAllowed.getTime() / 1000)}:R>`,
            inline: true
          })
          .setTimestamp();

        return interaction.update({ embeds: [embed], components: [] });
      } catch (err) {
        console.error('Error handling Confirm Leave button:', err);
        return interaction.update({
          content: '❌ Something went wrong during leave.',
          embeds: [],
          components: []
        });
      }
    }

    // 📌 Handle healing buttons
    if (action === 'startHealing' || action === 'stopHealing') {
      // Handle startHealing
      if (action === 'startHealing') {
        if (player.healing) {
          return interaction.reply({
            content: '🔄 You are already in healing mode.',
            ephemeral: true
          });
        }
        player.healing = true;
        player.healStartAt = new Date();
        await player.save();

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('🛌 Healing Mode Activated')
          .setDescription('You have started healing. You will recover **1 HP per hour**.')
          .addFields(
            {
              name: 'Current HP',
              value: `${player.hp}/${player.hpMax}`,
              inline: true
            },
            {
              name: 'Healing Since',
              value: `<t:${Math.floor(player.healStartAt.getTime() / 1000)}:R>`,
              inline: true
            }
          )
          .setTimestamp();

        const stopBtn = new ButtonBuilder()
          .setCustomId(`stopHealing:${discordId}`)
          .setLabel('Stop Healing')
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(stopBtn);

        return interaction.update({ embeds: [embed], components: [row] });
      }

      // Handle stopHealing
      if (action === 'stopHealing') {
        if (!player.healing || !player.healStartAt) {
          return interaction.reply({
            content: '❌ You are not currently healing.',
            ephemeral: true
          });
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
          .setColor(0xff0000)
          .setTitle('✅ Healing Completed')
          .setDescription(
            `You have stopped healing and regained **${hpGained} HP** over ${hoursHealed} hour(s).`
          )
          .addFields({
            name: 'Current HP',
            value: `${player.hp}/${player.hpMax}`,
            inline: true
          })
          .setTimestamp();

        return interaction.update({ embeds: [embed], components: [] });
      }
    }
  }
}

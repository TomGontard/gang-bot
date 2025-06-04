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
import { addExperience } from '../services/experienceService.js'; // if needed

const ROLE_RED_ID   = process.env.ROLE_RED_FACTION_ID;
const ROLE_BLUE_ID  = process.env.ROLE_BLUE_FACTION_ID;
const ROLE_GREEN_ID = process.env.ROLE_GREEN_FACTION_ID;

const LEAVE_BUTTON_PREFIX    = 'factionLeaveConfirm';
const OPEN_ATTRIB_PREFIX     = 'openAttributes';
const ATTRIB_ADD_PREFIX      = 'attrAdd';

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
    const [action, targetId, arg] = interaction.customId.split(':');
    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content: '❌ You cannot perform this action for another user.',
        ephemeral: true
      });
    }

    // 2.a) Handle "Confirm Leave" button
    if (action === LEAVE_BUTTON_PREFIX) {
      const player = await Player.findOne({ discordId: targetId });
      if (!player || !player.faction) {
        return interaction.update({
          content: '❌ You are not in a faction anymore.',
          embeds: [],
          components: []
        });
      }
      try {
        const oldFaction = player.faction;
        player.faction = null;
        player.lastFactionChange = new Date();
        await player.save();

        const member = await interaction.guild.members.fetch(targetId);
        const rolesToRemove = [ROLE_RED_ID, ROLE_BLUE_ID, ROLE_GREEN_ID].filter(r => r);
        await member.roles.remove(rolesToRemove);

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

    // 2.b) Handle "openAttributes" button
    if (action === OPEN_ATTRIB_PREFIX) {
      const discordId = targetId;
      const player = await Player.findOne({ discordId });
      if (!player) {
        return interaction.reply({
          content: '❌ Player not found.',
          ephemeral: true
        });
      }

      // Build the attributes embed
      const embed = new EmbedBuilder()
        .setColor('#00AAFF')
        .setTitle(`🔧 ${interaction.user.username}’s Attributes`)
        .setDescription('Use the buttons below to spend your unassigned points. Costs shown in parentheses.')
        .addFields(
          { name: 'Unassigned Points', value: `${player.unassignedPoints}`, inline: true },
          {
            name: `Vitality (+1 HP) (Cost: ${metrics.attributeCosts.Vitality})`,
            value: `${player.attributes.vitalite}`,
            inline: true
          },
          {
            name: `Wisdom (+1% XP) (Cost: ${metrics.attributeCosts.Wisdom})`,
            value: `${player.attributes.sagesse}`,
            inline: true
          },
          {
            name: `Strength (+Combat Power) (Cost: ${metrics.attributeCosts.Strength})`,
            value: `${player.attributes.force}`,
            inline: true
          },
          {
            name: `Intelligence (+1% Heal Speed) (Cost: ${metrics.attributeCosts.Intelligence})`,
            value: `${player.attributes.intelligence}`,
            inline: true
          },
          {
            name: `Luck (+1% Coin Chance) (Cost: ${metrics.attributeCosts.Luck})`,
            value: `${player.attributes.chance}`,
            inline: true
          },
          {
            name: `Agility (-HP Loss Rate) (Cost: ${metrics.attributeCosts.Agility})`,
            value: `${player.attributes.agilite}`,
            inline: true
          }
        )
        .setTimestamp();

      // Build a row of buttons—one per attribute
      const buttons = [];
      for (const attr of [
        'Vitality',
        'Wisdom',
        'Strength',
        'Intelligence',
        'Luck',
        'Agility'
      ]) {
        const cost = metrics.attributeCosts[attr];
        // Disable if not enough points
        const disabled = player.unassignedPoints < cost;
        const label = attr.length > 10 ? attr.slice(0, 10) : attr;
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`${ATTRIB_ADD_PREFIX}:${discordId}:${attr}`)
            .setLabel(`+1 ${label}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled)
        );
      }
      // Buttons must be grouped into rows of max 5; we have 6 attributes → two rows
      const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
      const row2 = new ActionRowBuilder().addComponents(buttons.slice(5));

      return interaction.reply({
        embeds: [embed],
        components: [row1, row2],
        ephemeral: true
      });
    }

    // 2.c) Handle "attrAdd" button (spend 1 point on selected attribute)
    if (action === ATTRIB_ADD_PREFIX) {
      const discordId = targetId;
      const attribute = arg; // e.g. "Vitality"
      const player = await Player.findOne({ discordId });
      if (!player) {
        return interaction.reply({
          content: '❌ Player not found.',
          ephemeral: true
        });
      }

      const cost = metrics.attributeCosts[attribute];
      if (cost === undefined) {
        return interaction.reply({
          content: '❌ Invalid attribute.',
          ephemeral: true
        });
      }
      if (player.unassignedPoints < cost) {
        return interaction.reply({
          content: '❌ You don’t have enough unassigned points.',
          ephemeral: true
        });
      }

      // Apply the attribute increase
      switch (attribute) {
        case 'Vitality':
          player.attributes.vitalite += 1;
          player.hpMax += 1; // +1 HP per Vitality
          break;
        case 'Wisdom':
          player.attributes.sagesse += 1;
          break;
        case 'Strength':
          player.attributes.force += 1;
          break;
        case 'Intelligence':
          player.attributes.intelligence += 1;
          break;
        case 'Luck':
          player.attributes.chance += 1;
          break;
        case 'Agility':
          player.attributes.agilite += 1;
          break;
      }
      player.unassignedPoints -= cost;
      await player.save();

      // Re‐render the attributes embed (same as above)
      const embed = new EmbedBuilder()
        .setColor('#00AAFF')
        .setTitle(`🔧 ${interaction.user.username}’s Attributes`)
        .setDescription('Use the buttons below to spend your unassigned points. Costs shown in parentheses.')
        .addFields(
          { name: 'Unassigned Points', value: `${player.unassignedPoints}`, inline: true },
          {
            name: `Vitality (+1 HP) (Cost: ${metrics.attributeCosts.Vitality})`,
            value: `${player.attributes.vitalite}`,
            inline: true
          },
          {
            name: `Wisdom (+1% XP) (Cost: ${metrics.attributeCosts.Wisdom})`,
            value: `${player.attributes.sagesse}`,
            inline: true
          },
          {
            name: `Strength (+Combat Power) (Cost: ${metrics.attributeCosts.Strength})`,
            value: `${player.attributes.force}`,
            inline: true
          },
          {
            name: `Intelligence (+1% Heal Speed) (Cost: ${metrics.attributeCosts.Intelligence})`,
            value: `${player.attributes.intelligence}`,
            inline: true
          },
          {
            name: `Luck (+1% Coin Chance) (Cost: ${metrics.attributeCosts.Luck})`,
            value: `${player.attributes.chance}`,
            inline: true
          },
          {
            name: `Agility (-HP Loss Rate) (Cost: ${metrics.attributeCosts.Agility})`,
            value: `${player.attributes.agilite}`,
            inline: true
          }
        )
        .setTimestamp();

      // Re‐build buttons with updated disabled status
      const buttons = [];
      for (const attr of [
        'Vitality',
        'Wisdom',
        'Strength',
        'Intelligence',
        'Luck',
        'Agility'
      ]) {
        const cost = metrics.attributeCosts[attr];
        const disabled = player.unassignedPoints < cost;
        const label = attr.length > 10 ? attr.slice(0, 10) : attr;
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`${ATTRIB_ADD_PREFIX}:${discordId}:${attr}`)
            .setLabel(`+1 ${label}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled)
        );
      }
      const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
      const row2 = new ActionRowBuilder().addComponents(buttons.slice(5));

      return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    // 2.d) Existing healing logic
    if (action === 'startHealing' || action === 'stopHealing') {
      // Ensure this is still under the same handler as before
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
          .setCustomId(`stopHealing:${targetId}`)
          .setLabel('Stop Healing')
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(stopBtn);

        return interaction.update({ embeds: [embed], components: [row] });
      }
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

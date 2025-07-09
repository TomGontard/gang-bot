// src/handlers/buttonHandlers/factionHandler.js
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
  } from 'discord.js';
  import Player from '../../data/models/Player.js';
  import { getNFTCount } from '../../services/nftService.js';
  import {
    canJoinFaction,
    assignFactionToPlayer,
    removePlayerFromFaction,
    getPlayerFaction
  } from '../../services/factionService.js';
  import metrics from '../../config/metrics.js';
  
  const ROLE_RED_ID   = process.env.ROLE_RED_FACTION_ID;
  const ROLE_BLUE_ID  = process.env.ROLE_BLUE_FACTION_ID;
  const ROLE_GREEN_ID = process.env.ROLE_GREEN_FACTION_ID;
  
  const OPEN_FACTION_PREFIX        = 'openFactions';
  const SELECT_FACTION_PREFIX      = 'selectFaction';
  const CONFIRM_FACTION_LEAVE_PREF = 'confirmFactionLeave';
  
  /**
   * Builds the factions select menu and (if applicable) a "Leave" button.
   */
  async function buildFactionInterface(player, discordId) {
    const nftCount = await getNFTCount(discordId);
  
    // 1) If user has no NFT, simply show a message
    if (nftCount < 1) {
      const embed = new EmbedBuilder()
        .setColor('#DD2E44')
        .setTitle('🔒 Factions Locked')
        .setDescription('You need at least one Genesis Pass NFT to manage factions.');
      return { embed, components: [] };
    }
  
    // 2) User has NFTs → show select menu of factions + leave button if already in one
    const currentFaction = player.faction;
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🏷️ Factions')
      .setDescription('Choose a faction to join or switch. Or leave your current faction below.');
  
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${SELECT_FACTION_PREFIX}:${discordId}`)
      .setPlaceholder(currentFaction ? `In ${currentFaction}` : 'Select a faction')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        {
          label: '🔴 Red',
          description: 'Join the Red faction',
          value: 'Red',
          default: currentFaction === 'Red'
        },
        {
          label: '🔵 Blue',
          description: 'Join the Blue faction',
          value: 'Blue',
          default: currentFaction === 'Blue'
        },
        {
          label: '🟢 Green',
          description: 'Join the Green faction',
          value: 'Green',
          default: currentFaction === 'Green'
        }
      );
  
    const row1 = new ActionRowBuilder().addComponents(selectMenu);
  
    // 3) Add a "Leave" button if user is already in a faction
    const components = [row1];
    if (currentFaction) {
      const leaveBtn = new ButtonBuilder()
        .setCustomId(`${CONFIRM_FACTION_LEAVE_PREF}:${discordId}`)
        .setLabel('Leave Faction')
        .setStyle(ButtonStyle.Danger);
      const row2 = new ActionRowBuilder().addComponents(leaveBtn);
      components.push(row2);
    }
  
    return { embed, components };
  }
  
  export default async function factionHandler(interaction, client) {
    // Identify prefix
    const [action, targetId, arg] = interaction.customId.split(':');
    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content: '❌ You cannot manage factions for another user.',
        ephemeral: true
      });
    }
  
    const discordId = targetId;
    let player = await Player.findOne({ discordId });
    if (!player) player = await Player.create({ discordId });
  
    // 1) openFactions: show the select menu + optional leave button
    if (action === OPEN_FACTION_PREFIX) {
      const { embed, components } = await buildFactionInterface(player, discordId);
      return interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
  
    // 2) selectFaction: user chose (or re-chose) a faction
    if (action === SELECT_FACTION_PREFIX) {
      const chosenFaction = interaction.values[0]; // Red, Blue, or Green
  
      // Check cooldown
      if (player.lastFactionChange) {
        const elapsed = Date.now() - new Date(player.lastFactionChange).getTime();
        if (elapsed < metrics.factionChangeCooldown) {
          const nextAllowed = new Date(
            player.lastFactionChange.getTime() + metrics.factionChangeCooldown
          );
          return interaction.reply({
            content: `⏳ You must wait until <t:${Math.floor(
              nextAllowed.getTime() / 1000
            )}:R> before joining a faction again.`,
            ephemeral: true
          });
        }
      }
  
      // Attempt to join/switch
      try {
        const allowed = await canJoinFaction(chosenFaction);
        if (!allowed) {
          return interaction.reply({
            content:
              '❌ Cannot join that faction: it would unbalance the roster (difference > 3).',
            ephemeral: true
          });
        }
  
        await assignFactionToPlayer(player, chosenFaction);
        player.lastFactionChange = new Date();
        await player.save();
  
        // Sync roles
        const member = await interaction.guild.members.fetch(discordId);
        const rolesToRemove = [ROLE_RED_ID, ROLE_BLUE_ID, ROLE_GREEN_ID].filter(r => r);
        await member.roles.remove(rolesToRemove);
        const newRoleId =
          chosenFaction === 'Red'
            ? ROLE_RED_ID
            : chosenFaction === 'Blue'
            ? ROLE_BLUE_ID
            : ROLE_GREEN_ID;
        if (newRoleId) await member.roles.add(newRoleId);
  
        return interaction.reply({
          content: `✅ You have joined **${chosenFaction}**!`,
          ephemeral: true
        });
      } catch (err) {
        console.error('Error in selectFaction:', err);
        return interaction.reply({
          content: `❌ ${err.message}`,
          ephemeral: true
        });
      }
    }
  
    // 3) confirmFactionLeave: ask for confirmation before actually leaving
    if (action === CONFIRM_FACTION_LEAVE_PREF) {
      if (!player.faction) {
        return interaction.update({
          content: '❌ You are not in any faction.',
          embeds: [],
          components: []
        });
      }
  
      // Show a confirmation embed + final “Confirm” button
      const confirmEmbed = new EmbedBuilder()
        .setColor('#FFCC00')
        .setTitle('⚠️ Confirm Leave Faction')
        .setDescription(
          `Are you sure you want to leave **${player.faction}**?\nYou will not be able to join another faction for 24 hours.`
        )
        .setTimestamp();
  
      const confirmBtn = new ButtonBuilder()
        .setCustomId(`finalFactionLeave:${discordId}`)
        .setLabel('Confirm Leave')
        .setStyle(ButtonStyle.Danger);
  
      const row = new ActionRowBuilder().addComponents(confirmBtn);
      return interaction.update({ embeds: [confirmEmbed], components: [row] });
    }
  
    // 4) finalFactionLeave: actually remove from faction
    if (action === 'finalFactionLeave') {
      if (!player.faction) {
        return interaction.update({
          content: '❌ You are not in any faction.',
          embeds: [],
          components: []
        });
      }
  
      try {
        const oldFaction = player.faction;
        player.faction = null;
        player.lastFactionChange = new Date();
        await player.save();
  
        const member = await interaction.guild.members.fetch(discordId);
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
        console.error('Error in finalFactionLeave:', err);
        return interaction.update({
          content: '❌ Something went wrong while leaving your faction.',
          embeds: [],
          components: []
        });
      }
    }
  }
  
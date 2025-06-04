// src/commands/faction.js
import { SlashCommandBuilder } from 'discord.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The four subcommand handlers live under src/commands/faction/
const handlersDir = path.join(process.cwd(), 'src', 'commands', 'faction');

export const data = new SlashCommandBuilder()
  .setName('faction')
  .setDescription('Manage your faction (admin and player subcommands)')
  .addSubcommand(sub =>
    sub
      .setName('create')
      .setDescription('Initialize the three core factions (Red, Blue, Green) – admin only')
  )
  .addSubcommand(sub =>
    sub
      .setName('join')
      .setDescription('Join one of the three factions (requires at least 1 Genesis NFT)')
      .addStringOption(opt =>
        opt
          .setName('name')
          .setDescription('Faction name to join (Red/Blue/Green)')
          .setRequired(true)
          .addChoices(
            { name: '🔴 Red',   value: 'Red' },
            { name: '🔵 Blue',  value: 'Blue' },
            { name: '🟢 Green', value: 'Green' }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('leave')
      .setDescription('Leave your current faction')
  )
  .addSubcommand(sub =>
    sub
      .setName('info')
      .setDescription('Get information about your current faction')
  );

export async function execute(interaction, client) {
  const subcommand = interaction.options.getSubcommand();
  let handlerPath;

  switch (subcommand) {
    case 'create':
      handlerPath = path.join(handlersDir, 'create.js');
      break;
    case 'join':
      handlerPath = path.join(handlersDir, 'join.js');
      break;
    case 'leave':
      handlerPath = path.join(handlersDir, 'leave.js');
      break;
    case 'info':
      handlerPath = path.join(handlersDir, 'info.js');
      break;
    default:
      return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
  }

  // Convert to file:// URL for dynamic import (works on Windows/macOS/Linux)
  const handlerUrl = pathToFileURL(handlerPath).href;
  try {
    const { execute: runSubcommand } = await import(handlerUrl);
    await runSubcommand(interaction, client);
  } catch (err) {
    console.error(`Error loading handler for /faction ${subcommand}:`, err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ An error occurred while running that subcommand.', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ An error occurred while running that subcommand.', ephemeral: true });
    }
  }
}

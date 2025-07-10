// deploy-commands.js
// Script pour enregistrer les slash-commands auprès de Discord (Guild ou Global)

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID, NODE_ENV } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌ Veuillez définir DISCORD_TOKEN et CLIENT_ID dans le fichier .env');
  process.exit(1);
}

// Chemin vers le dossier des commandes
const commandsPath = path.resolve('./src/commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Récupère les définitions JSON des commandes
const commands = [];
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const fileUrl = pathToFileURL(filePath).href;
  try {
    const module = await import(fileUrl);
    if (module.data?.toJSON) {
      commands.push(module.data.toJSON());
    } else {
      console.warn(`⚠️ Le fichier ${file} n'exporte pas de data SlashCommandBuilder`);
    }
  } catch (error) {
    console.error(`❌ Impossible d'importer ${file}:`, error);
  }
}

// Crée une instance du client REST
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🚀 Déploiement de ${commands.length} commandes...`);

    if (NODE_ENV === 'production') {
      // Enregistrement global (peut prendre jusqu'à 1h pour propager)
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Commandes déployées GLOBAL');
    } else {
      // Enregistrement en mode guild (immédiat)
      if (!GUILD_ID) {
        console.error('❌ Veuillez définir GUILD_ID pour le déploiement local');
        process.exit(1);
      }
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
      console.log(`✅ Commandes déployées pour le serveur ${GUILD_ID}`);
    }
  } catch (error) {
    console.error('❌ Erreur lors du déploiement des commandes :', error);
    process.exit(1);
  }
})();

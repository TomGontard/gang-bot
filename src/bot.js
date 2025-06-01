// src/bot.js
import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, REST, Routes } from 'discord.js';
import { connectDatabase } from './data/database.js';
import fs from 'node:fs';
import path from 'node:path';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
    // Ajoutez d’autres intents si nécessaire (Member intent, MessageContent intent…)
  ]
});

// Préparer la collection des commandes
client.commands = new Collection();

// 1. Charger tous les fichiers de commandes dans client.commands
const commandsPath = path.join(process.cwd(), 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath, { withFileTypes: true });

for (const dirent of commandFiles) {
  // Si c’est un dossier (ex: "admin"), on entre dedans
  if (dirent.isDirectory()) {
    const subPath = path.join(commandsPath, dirent.name);
    const subFiles = fs.readdirSync(subPath).filter(file => file.endsWith('.js'));
    for (const file of subFiles) {
      const filePath = path.join(subPath, file);
      const command = await import(`./commands/${dirent.name}/${file}`);
      client.commands.set(command.data.name, command);
    }
  } else if (dirent.name.endsWith('.js')) {
    const filePath = path.join(commandsPath, dirent.name);
    const command = await import(`./commands/${dirent.name}`);
    client.commands.set(command.data.name, command);
  }
}

// 2. Enregistrer les slash commands (local guild, pour dev rapide)
async function registerCommands() {
  const commands = [];
  for (const command of client.commands.values()) {
    commands.push(command.data.toJSON());
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log(`🔄 Registration des commandes sur le serveur GUILD_ID=${process.env.GUILD_ID}...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commandes enregistrées (guild only).');
  } catch (error) {
    console.error('❌ Erreur lors de l’enregistrement des commandes :', error);
  }
}

client.once('ready', async () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
  await registerCommands();
});

// 3. Handler des interactions (slash commands)
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ Une erreur est survenue lors de l’exécution de la commande.', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ Une erreur est survenue lors de l’exécution de la commande.', ephemeral: true });
    }
  }
});

// 4. Démarrer le bot et connecter la base de données
(async () => {
  await connectDatabase();
  await client.login(process.env.DISCORD_TOKEN);
})();

// src/services/lootService.js
import Player from '../data/models/Player.js';
import { addExperience } from './experienceService.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import metrics from '../config/metrics.js';
import { createEmbed } from '../utils/createEmbed.js';

/**
 * Distribue le loot à une faction entière.
 */
export async function distributeLootToFaction(factionName, { xp = 0, coins = 0 }) {
  // match la faction en base sans tenir compte de la casse
  const players = await Player.find({
    faction: { $regex: `^${factionName}$`, $options: 'i' }
  });

  const results = [];
  for (const p of players) {
    const { levelsGained } = await addExperience(p, xp);
    p.coins += coins;
    await p.save();

    results.push({
      discordId: p.discordId,
      xpGained: xp,
      coinsGained: coins,
      levelsGained
    });
  }
  return results;
}

/**
 * Envoie un message de loot dans le channel configuré, avec bouton "Claim".
 * @param {Client} client - Discord client
 * @param {number|null} idx - index du loot dans metrics.lootConfig.messages (aléatoire si null)
 * @returns {Promise<{idx:number, messageId:string}|false>}
 */
export async function sendLootDrop(client, idx = null) {
  const { channelId, roles, messages } = metrics.lootConfig;

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) return false;

  const i = (idx ?? Math.floor(Math.random() * messages.length));
  const entry = messages[i];
  if (!entry) return false;

  const claimBtn = new ButtonBuilder()
    .setCustomId(`claimLoot:${i}`)
    .setLabel('Claim Loot')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(claimBtn);

  const mention = (roles || []).filter(Boolean).map(id => `<@&${id}>`).join(' ');

  const embed = createEmbed({
    title: '📦 A loot crate has appeared!',
    description: entry.text,
    timestamp: true
  });

  const msg = await channel.send({
    content: mention || undefined,
    embeds: [embed],
    components: [row]
  });

  return { idx: i, messageId: msg.id };
}

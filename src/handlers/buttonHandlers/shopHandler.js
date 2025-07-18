// src/handlers/buttonHandlers/shopHandler.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import Player from '../../data/models/Player.js';
import shopItems from '../../config/shopItems.js';
import { createEmbed } from '../../utils/createEmbed.js';

const OPEN   = 'openShop';
const PAGE   = 'shopPage';
const SELECT = 'shopSelect';

export default async function shopHandler(interaction) {
  const parts = interaction.customId.split(':');
  const action    = parts[0];
  const discordId = parts[1];
  const pageIndex = parts[2] ? parseInt(parts[2], 10) : 0;

  // only the opener may shop
  if (interaction.user.id !== discordId) {
    return interaction.reply({ content: '❌ You cannot shop for another user.', ephemeral: true });
  }

  // load or create player
  let player = await Player.findOne({ discordId });
  if (!player) player = await Player.create({ discordId });

  // compute categories/pages
  const categories = [...new Set(shopItems.map(i => i.category))];
  const maxPage = categories.length - 1;
  const thisCategory = categories[pageIndex];

  // filter items for this page
  const pageItems = shopItems.filter(i => i.category === thisCategory);

  // 1) OPEN SHOP or PAGE nav
  if (action === OPEN || action === PAGE) {
    // build embed
    const embed = createEmbed({
      title: `🛒 Shop — ${thisCategory} (Page ${pageIndex+1}/${categories.length})`,
      description: `Select an item to buy with coins.`,
      fields: pageItems.map(i => ({
        name: `${i.name} — ${i.cost} coins`,
        value: i.description
      })),
      interaction
    });

    // select menu
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${SELECT}:${discordId}:${pageIndex}`)
      .setPlaceholder(`Choose a ${thisCategory} item`)
      .addOptions(
        pageItems.map(i => ({
          label: i.name,
          description: `${i.cost} coins`,
          value: i.id
        }))
      );

    // prev/next buttons
    const prevBtn = new ButtonBuilder()
      .setCustomId(`${PAGE}:${discordId}:${pageIndex-1}`)
      .setLabel('◀️ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === 0);

    const nextBtn = new ButtonBuilder()
      .setCustomId(`${PAGE}:${discordId}:${pageIndex+1}`)
      .setLabel('Next ▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === maxPage);

    const rows = [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(prevBtn, nextBtn)
    ];

    // initial open -> reply, page nav -> update
    if (action === OPEN) {
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    } else {
      return interaction.update({ embeds: [embed], components: rows });
    }
  }

  // 2) SELECT → PURCHASE
  if (action === SELECT) {
    const itemId = interaction.values[0];
    const item = shopItems.find(i => i.id === itemId);
    if (!item) {
      return interaction.reply({ content: '❌ Item not found.', ephemeral: true });
    }
    if (player.coins < item.cost) {
      return interaction.reply({ content: '❌ Not enough coins.', ephemeral: true });
    }

    // deduct cost
    player.coins -= item.cost;

    // immediate effect
    let effectDesc = '';
    if (item.id === 'healPotion') {
      const oldHp = player.hp;
      player.hp = player.hpMax;
      effectDesc = `HP: **${oldHp} → ${player.hp}/${player.hpMax}**`;
    } else if (item.id === 'resetPotion') {
      const total = Object.values(player.attributes).reduce((a,v)=>a+v,0);
      player.unassignedPoints += total;
      player.attributes = {
        vitalite:0,sagesse:0,force:0,intelligence:0,chance:0,agilite:0
      };
      effectDesc = `Reset **${total}** points; you now have **${player.unassignedPoints}** unassigned.`;
    } else {
      effectDesc = 'Item added to your inventory.';
      // TODO: push to inventory for non‐immediate items
    }

    await player.save();

    const successEmbed = createEmbed({
      title: `✅ Purchased ${item.name}`,
      description: effectDesc,
      interaction,
      timestamp: true
    });

    return interaction.update({ embeds: [successEmbed], components: [] });
  }
}

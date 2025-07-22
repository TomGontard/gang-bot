// src/handlers/buttonHandlers/shopHandler.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import { buyItem, getItemDefinition } from '../../services/itemService.js';
import items from '../../config/items.js';
import { createEmbed } from '../../utils/createEmbed.js';
import Inventory from '../../data/models/Inventory.js';

const OPEN   = 'openShop';
const PAGE   = 'shopPage';
const SELECT = 'shopSelect';

export default async function shopHandler(interaction) {
  const [ action, discordId, arg ] = interaction.customId.split(':');
  if (interaction.user.id !== discordId) {
    return interaction.reply({ content: '❌ You cannot shop for another user.', ephemeral: true });
  }

  // 🔄 Fetch inventory
  let inv = await Inventory.findOne({ discordId });
  if (!inv) inv = await Inventory.create({ discordId });

  // 1️⃣ Build the “pages” by item.type or category
  const categories = Array.from(new Set(items.map(i => i.type === 'equipment' ? i.category : i.type)));
  const pageIndex  = arg ? parseInt(arg, 10) : 0;
  const maxPage    = categories.length - 1;
  const thisCat    = categories[pageIndex];

  // Items on this page:
  const allItems = items.filter(i =>
    (i.type === 'equipment' ? i.category : i.type) === thisCat
  );

  // 2️⃣ Filtrer les équipements déjà possédés
  const pageItems = allItems.filter(i =>
    i.type !== 'equipment' || !inv.items.includes(i.id)
  );

  // 3️⃣ OPEN or PAGE: render menu
  if (action === OPEN || action === PAGE) {
    const embed = createEmbed({
      title: `🛒 Shop — ${thisCat[0].toUpperCase() + thisCat.slice(1)} (${pageIndex+1}/${categories.length})`,
      description: pageItems.length
        ? 'Select an item to buy with coins.'
        : '✅ You already own every item in this category.',
      interaction
    });

    if (pageItems.length) {
      embed.addFields(pageItems.map(i => ({
        name: `${i.name} — ${i.cost} coins`,
        value: i.type === 'equipment'
          ? `Rarity: **${i.rarity}** — +${Object.entries(i.stats).filter(([,v])=>v>0).map(([k,v])=>`+${v} ${k}`).join(', ')}`
          : i.effect === 'restore_hp'
            ? 'Fully heals you.'
            : i.effect === 'reset_attributes'
              ? 'Resets all attributes.'
              : ''
      })));
    }

    const components = [];

    if (pageItems.length) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`${SELECT}:${discordId}:${pageIndex}`)
        .setPlaceholder(`Choose a ${thisCat}`)
        .addOptions(
          pageItems.map(i => ({
            label: i.name,
            description: `${i.cost} coins`,
            value: i.id
          }))
        );
      components.push(new ActionRowBuilder().addComponents(menu));
    }

    const nav = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PAGE}:${discordId}:${pageIndex - 1}`)
        .setLabel('◀️ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === 0),
      new ButtonBuilder()
        .setCustomId(`${PAGE}:${discordId}:${pageIndex + 1}`)
        .setLabel('Next ▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === maxPage)
    );
    components.push(nav);

    return action === OPEN
      ? interaction.reply({ embeds: [embed], components, ephemeral: true })
      : interaction.update({ embeds: [embed], components });
  }

  // 4️⃣ SELECT → Purchase via service
  if (action === SELECT) {
    const itemId = interaction.values[0];
    const def    = getItemDefinition(itemId);
    try {
      const { consumed, desc } = await buyItem(discordId, itemId);
      const embed = createEmbed({
        title: `✅ Purchased ${def.name}`,
        description: desc,
        interaction,
        timestamp: true
      });
      return interaction.update({ embeds: [embed], components: [] });
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  }
}

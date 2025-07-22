// src/handlers/buttonHandlers/inventoryHandler.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import Inventory from '../../data/models/Inventory.js';
import { getItemDefinition } from '../../services/itemService.js';
import { createEmbed } from '../../utils/createEmbed.js';

const OPEN_INV   = 'openInventory';
const INV_PAGE   = 'invPage';
const OPEN_EQ    = 'openEquipment';
const EQ_SLOT    = 'eqSlot';
const EQ_SELECT  = 'eqSelect';
const EQ_CONFIRM = 'eqConfirm';
const BACK_EQ    = 'eqBack';

const EQUIP_SLOTS = ['weapon','helmet','chest','pants','shoes','gloves'];
const ITEMS_PER_PAGE = 5;

export default async function inventoryHandler(interaction) {
  const [action, discordId, arg1, arg2] = interaction.customId.split(':');

  if (interaction.user.id !== discordId) {
    return interaction.reply({ content: '❌ Not your inventory.', ephemeral: true });
  }

  let inv = await Inventory.findOne({ discordId });
  if (!inv) inv = await Inventory.create({ discordId });

  // 🔁 RENDER INVENTORY PAGE
  async function renderInvPage(pageIndex = 0) {
    const allItems = inv.items.map(getItemDefinition).filter(Boolean);
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
    const start = pageIndex * ITEMS_PER_PAGE;
    const pageItems = allItems.slice(start, start + ITEMS_PER_PAGE);

    const embed = createEmbed({
      title: `🎒 Inventory — Page ${pageIndex + 1}/${totalPages || 1}`,
      description: allItems.length
        ? `You own ${allItems.length} item(s).`
        : 'You have no items.',
      interaction
    });

    if (pageItems.length) {
      embed.addFields(
        pageItems.map(item => ({
          name: `${item.name} [${item.rarity}]`,
          value: Object.entries(item.stats)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `+${v} ${k}`).join(', ') || 'No stats'
        }))
      );
    }

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${INV_PAGE}:${discordId}:${pageIndex - 1}`)
        .setLabel('◀️ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === 0),
      new ButtonBuilder()
        .setCustomId(`${INV_PAGE}:${discordId}:${pageIndex + 1}`)
        .setLabel('Next ▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(start + ITEMS_PER_PAGE >= allItems.length),
      new ButtonBuilder()
        .setCustomId(`${OPEN_EQ}:${discordId}`)
        .setLabel('Equipment ▶️')
        .setStyle(ButtonStyle.Primary)
    );

    return { embed, components: [navRow] };
  }

  // ⚙️ RENDER EQUIPMENT MENU
  async function renderEquipmentMenu() {
    const equipped = inv.equipped || {};
    const totalStats = {};

    for (const slot of EQUIP_SLOTS) {
      if (equipped[slot]) {
        const eq = getItemDefinition(equipped[slot]);
        if (eq) {
          for (const [k, v] of Object.entries(eq.stats)) {
            totalStats[k] = (totalStats[k] || 0) + v;
          }
        }
      }
    }

    const statList = Object.entries(totalStats)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `+${v} ${k}`);

    const embed = createEmbed({
      title: '⚙️ Equipment Menu',
      description: statList.length
        ? `Total bonuses: ${statList.join(', ')}`
        : 'You have no gear equipped.',
      interaction
    });

    const btns = EQUIP_SLOTS.map((slot, i) =>
      new ButtonBuilder()
        .setCustomId(`${EQ_SLOT}:${discordId}:${i}`)
        .setLabel(`${slot.charAt(0).toUpperCase() + slot.slice(1)}: ${equipped[slot] || 'none'}`)
        .setStyle(ButtonStyle.Secondary)
    );

    const row1 = new ActionRowBuilder().addComponents(btns.slice(0, 3));
    const row2 = new ActionRowBuilder().addComponents(btns.slice(3, 6));

    const backBtn = new ButtonBuilder()
      .setCustomId(`${OPEN_INV}:${discordId}:0`)
      .setLabel('🔙 Back to Inventory')
      .setStyle(ButtonStyle.Danger);

    return { embed, components: [row1, row2, new ActionRowBuilder().addComponents(backBtn)] };
  }

  // 🎯 RENDER SLOT EQUIP PAGE
  async function renderSlotPage(slotIndex) {
    const slot = EQUIP_SLOTS[slotIndex];
    const items = inv.items.map(getItemDefinition).filter(i => i?.category === slot);
    const equippedId = inv.equipped[slot];

    const embed = createEmbed({
      title: `🎯 Equip ${slot.charAt(0).toUpperCase() + slot.slice(1)}`,
      description: items.length
        ? `Select to equip. Currently: **${equippedId || 'none'}**.`
        : `No ${slot}s to equip.`,
      interaction
    }).addFields(
      items.map(e => ({
        name: `${e.name} [${e.rarity}]`,
        value: Object.entries(e.stats).filter(([, v]) => v > 0).map(([k, v]) => `+${v} ${k}`).join(', ')
      }))
    );

    const components = [];

    if (items.length) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`${EQ_SELECT}:${discordId}:${slotIndex}`)
        .setPlaceholder(`Choose a ${slot}`)
        .addOptions(items.map(e => ({
          label: e.name,
          description: `[${e.rarity}]`,
          value: e.id,
          default: e.id === equippedId
        })));

      components.push(new ActionRowBuilder().addComponents(menu));
    }

    const back = new ButtonBuilder()
      .setCustomId(`${OPEN_EQ}:${discordId}`)
      .setLabel('🔙 Back to Equipment')
      .setStyle(ButtonStyle.Danger);
    components.push(new ActionRowBuilder().addComponents(back));

    return { embed, components };
  }

  // 📌 HANDLERS
  if (action === OPEN_INV) {
    const pageIndex = parseInt(arg1 ?? '0', 10);
    const { embed, components } = await renderInvPage(pageIndex);
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }

  if (action === INV_PAGE) {
    const page = parseInt(arg1, 10);
    const { embed, components } = await renderInvPage(page);
    return interaction.update({ embeds: [embed], components });
  }

  if (action === OPEN_EQ) {
    const { embed, components } = await renderEquipmentMenu();
    return interaction.update({ embeds: [embed], components });
  }

  if (action === EQ_SLOT) {
    const slotIndex = parseInt(arg1, 10);
    const { embed, components } = await renderSlotPage(slotIndex);
    return interaction.update({ embeds: [embed], components });
  }

  if (action === EQ_SELECT) {
    const slotIndex = parseInt(arg1, 10);
    const chosenId = interaction.values[0];

    const confirm = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${EQ_CONFIRM}:${discordId}:${slotIndex}:${chosenId}`)
        .setLabel('Equip')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${EQ_SLOT}:${discordId}:${slotIndex}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    const embed = createEmbed({
      title: '❓ Confirm Equip',
      description: `Equip **${chosenId}** in **${EQUIP_SLOTS[slotIndex]}**?`,
      interaction
    });

    return interaction.update({ embeds: [embed], components: [confirm] });
  }

  if (action === EQ_CONFIRM) {
    const slotIndex = parseInt(arg1, 10);
    const chosenId = arg2;
    inv.equipped[EQUIP_SLOTS[slotIndex]] = chosenId;
    await inv.save();

    const { embed, components } = await renderSlotPage(slotIndex);
    embed.setDescription(`✅ Equipped **${chosenId}**.`);
    return interaction.update({ embeds: [embed], components });
  }

  if (action === BACK_EQ) {
    const { embed, components } = await renderEquipmentMenu();
    return interaction.update({ embeds: [embed], components });
  }
}

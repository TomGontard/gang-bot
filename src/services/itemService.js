import Player from '../data/models/Player.js';
import Inventory from '../data/models/Inventory.js';
import items from '../config/items.js';
import { addExperience } from './experienceService.js';

export function getItemDefinition(itemId) {
  return items.find(i => i.id === itemId) || null;
}

export async function buyItem(discordId, itemId) {
  const def = getItemDefinition(itemId);
  if (!def) throw new Error('Item not found.');
  const player = await Player.findOne({ discordId });
  if (!player) throw new Error('Player record missing.');
  if (player.coins < def.cost) throw new Error('Insufficient coins.');

  player.coins -= def.cost;
  await player.save();

  if (def.type === 'consumable') {
    if (def.effect === 'restore_hp') {
      player.hp = player.hpMax;
      await player.save();
      return { consumed: true, desc: `HP restored to ${player.hp}/${player.hpMax}` };
    }
    if (def.effect === 'reset_attributes') {
      const total = Object.values(player.attributes).reduce((a, v) => a + v, 0);
      player.unassignedPoints += total + (player.level - 1) * 10;
      player.attributes = {
        vitalite: 5, sagesse: 5, force: 5,
        intelligence: 5, chance: 5, agilite: 5
      };
      await player.save();
      return {
        consumed: true,
        desc: `Reset stats, you have ${player.unassignedPoints} unassigned points`
      };
    }
  }

  let inv = await Inventory.findOne({ discordId });
  if (!inv) inv = new Inventory({ discordId });
  inv.items.push(itemId);
  await inv.save();
  return { consumed: false, desc: `${def.name} added to your inventory.` };
}

export async function earnItem(discordId, itemId) {
  const def = getItemDefinition(itemId);
  if (!def || def.type !== 'equipment') return;
  let inv = await Inventory.findOne({ discordId });
  if (!inv) inv = new Inventory({ discordId });
  inv.items.push(itemId);
  await inv.save();
  return def;
}

export async function equipItem(discordId, category, itemId) {
  const def = getItemDefinition(itemId);
  if (!def || def.category !== category) throw new Error('Invalid equipment.');
  const inv = await Inventory.findOne({ discordId });
  if (!inv || !inv.items.includes(itemId)) throw new Error('Item not owned.');
  inv.equipped[category] = itemId;
  await inv.save();
  return def;
}

export async function calculateTotalStats(player) {
  const attributeMap = {
    strength: 'force',
    wisdom: 'sagesse',
    vitality: 'vitalite',
    intelligence: 'intelligence',
    chance: 'chance',
    agility: 'agilite'
  };

  const baseStats = {
    force: player.attributes?.force || 0,
    sagesse: player.attributes?.sagesse || 0,
    vitalite: player.attributes?.vitalite || 0,
    intelligence: player.attributes?.intelligence || 0,
    chance: player.attributes?.chance || 0,
    agilite: player.attributes?.agilite || 0
  };

  const inventory = await Inventory.findOne({ discordId: player.discordId }).lean();
  const equipped = inventory?.equipped || {};

  for (const slot of Object.keys(equipped)) {
    const itemId = equipped[slot];
    const item = getItemDefinition(itemId);
    if (!item || !item.stats) continue;

    for (const [enKey, value] of Object.entries(item.stats)) {
      const frKey = attributeMap[enKey];
      if (frKey && typeof value === 'number') {
        baseStats[frKey] += value;
      }
    }
  }

  return baseStats;
}

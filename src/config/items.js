// src/config/items.js
export default [
  // consumables
  {
    id: 'healPotion',
    type: 'consumable',
    name: 'Health Potion',
    cost: 100,
    stats: {},            // no persistent stats
    effect: 'restore_hp', // handled in code
  },
  {
    id: 'resetPotion',
    type: 'consumable',
    name: 'Attribute Reset Potion',
    cost: 1000,
    stats: {},
    effect: 'reset_attributes'
  },

  // equipment
  {
    id: 'iron_sword',
    type: 'equipment',
    category: 'weapon',
    name: 'Iron Sword',
    rarity: 'common',
    cost: 300,
    stats: { strength: 2 }
  },
  {
    id: 'leather_helmet',
    type: 'equipment',
    category: 'helmet',
    name: 'Leather Helmet',
    rarity: 'common',
    cost: 200,
    stats: { vitality: 1 }
  },
  {
    id: 'iron_chestplate',
    type: 'equipment',
    category: 'chest',
    name: 'Iron Chestplate',
    rarity: 'uncommon',
    cost: 500,
    stats: { vitality: 3 }
  },
  // … add more items here …
];

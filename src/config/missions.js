// src/config/missions.js

export default {
  // Each mission type includes:
  // displayName: Shown in menus.
  // minLevel: Minimum player level required.
  // durationMs: How long the mission takes.
  // xpRange: [minXp, maxXp] (random within this range).
  // coinRange: [minCoins, maxCoins] (random).
  // hpCost: How many HP are “locked” when you launch this mission.

  pickpocket: {
    displayName: '🪢 Pickpocket',
    minLevel: 1,
    durationMs: 2 * 60 * 60 * 1000,  // 2 hours
    xpRange: [10, 20],
    coinRange: [5, 15],
    hpCostRange: [8, 12]             // raw HP cost between 8 and 12
  },
  warehouse: {
    displayName: '🏭 Warehouse Raid',
    minLevel: 3,
    durationMs: 4 * 60 * 60 * 1000,  // 4 hours
    xpRange: [30, 50],
    coinRange: [20, 40],
    hpCostRange: [20, 30]
  },
  bankHeist: {
    displayName: '💰 Bank Heist',
    minLevel: 5,
    durationMs: 8 * 60 * 60 * 1000,  // 8 hours
    xpRange: [80, 120],
    coinRange: [50, 100],
    hpCostRange: [40, 60]
  }
  // … add more missions …
};

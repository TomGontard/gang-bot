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
    hpCostRange: [8, 12]
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
    hpCostRange: [30, 50]
  },
  recruitmentDrive: {
    displayName: '📋 Recruitment Drive',
    minLevel: 7,
    durationMs: 1 * 60 * 60 * 1000,  // 1h
    xpRange: [15, 25],    // Only XP
    coinRange: [0, 0],
    hpCostRange: [5, 8]
  },
  surveillance: {
    displayName: '🎥 Safehouse Surveillance',
    minLevel: 8,
    durationMs: 3 * 60 * 60 * 1000,  // 3h
    xpRange: [25, 35],
    coinRange: [10, 20],
    hpCostRange: [10, 15]
  },
  drugSmuggling: {
    displayName: '🚚 Drug Smuggling',
    minLevel: 10,
    durationMs: 6 * 60 * 60 * 1000,  // 6h
    xpRange: [20, 30],
    coinRange: [100, 150],
    hpCostRange: [30, 40]
  },
  undergroundFight: {
    displayName: '🥊 Underground Fight',
    minLevel: 12,
    durationMs: 2 * 60 * 60 * 1000,  // 2h
    xpRange: [50, 70],
    coinRange: [120, 200],
    hpCostRange: [50, 70]
  },
  cryptoHack: {
    displayName: '💻 Crypto Mining Hack',
    minLevel: 15,
    durationMs: 12 * 60 * 60 * 1000, // 12h
    xpRange: [10, 15],
    coinRange: [200, 300],
    hpCostRange: [15, 25]
  },
  assassination: {
    displayName: '🔫 Assassination',
    minLevel: 18,
    durationMs: 10 * 60 * 60 * 1000, // 10h
    xpRange: [100, 150],
    coinRange: [50, 100],
    hpCostRange: [50, 80]
  },
  highStakesPoker: {
    displayName: '♠️ High Stakes Poker',
    minLevel: 20,
    durationMs: 8 * 60 * 60 * 1000,  // 8h
    xpRange: [80, 100],
    coinRange: [150, 250],
    hpCostRange: [20, 30]
  },
  jewelHeist: {
    displayName: '💎 Jewel Heist',
    minLevel: 22,
    durationMs: 24 * 60 * 60 * 1000, // 24h
    xpRange: [150, 200],
    coinRange: [200, 300],
    hpCostRange: [80, 120]
  },
  mansionBreakIn: {
    displayName: '🏰 Mansion Break-In',
    minLevel: 25,
    durationMs: 12 * 60 * 60 * 1000, // 12h
    xpRange: [150, 250],
    coinRange: [100, 200],
    hpCostRange: [100, 120]
  },
  ArmoredTruck: {
    displayName: '🚚 Armored Truck Heist',
    minLevel: 28,
    durationMs: 18 * 60 * 60 * 1000, // 18h
    xpRange: [200, 300],
    coinRange: [200, 300],
    hpCostRange: [100, 120]
  },
  cartelWar: {
    displayName: '🔫 Cartel War',
    minLevel: 30,
    durationMs: 6 * 60 * 60 * 1000, // 6h
    xpRange: [100, 150],
    coinRange: [100, 200],
    hpCostRange: [70, 80]
  },
  heistPlanning: {
    displayName: '🗺️ Heist Planning',
    minLevel: 32,
    durationMs: 24 * 60 * 60 * 1000, // 24h
    xpRange: [500, 800],
    coinRange: [250, 300],
    hpCostRange: [40, 50]
  },
  ExoticAnimalSmuggling: {
    displayName: '🐅 Exotic Animal Smuggling',
    minLevel: 35,
    durationMs: 4 * 60 * 60 * 1000, // 4h
    xpRange: [70, 100],
    coinRange: [300, 500],
    hpCostRange: [40, 60]
  },
  highRollerCasino: {
    displayName: '🎰 High Roller Casino',
    minLevel: 38,
    durationMs: 8 * 60 * 60 * 1000, // 8h
    xpRange: [400, 600],
    coinRange: [800, 1000],
    hpCostRange: [100, 150]
  },
  drugKingpin: {
    displayName: '👑 Drug Kingpin',
    minLevel: 40,
    durationMs: 12 * 60 * 60 * 1000, // 12h
    xpRange: [600, 800],
    coinRange: [500, 700],
    hpCostRange: [80, 120]
  }
}

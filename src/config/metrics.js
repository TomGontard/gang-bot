// src/config/metrics.js

export default {
    // -------------------------------------------------
    // Faction-change cooldown (in milliseconds)
    factionChangeCooldown: 24 * 60 * 60 * 1000, // 24 hours
  
    // -------------------------------------------------
    // Base mission rewards (expand as needed)
    mission: {
      baseXpPerLevel: {
        1: 10,
        2: 15,
        3: 20,
        4: 30,
        5: 40,
        10: 45,
        12: 50,
        15: 60,
        17: 70,
        20: 80,
        22: 90,
        25: 100,
        27: 120,
        30: 140,
        32: 160,
        35: 180,
        37: 200,
        40: 220,
      },
      baseCoinsPerLevel: {
        1: 5,
        2: 10,
        3: 15,
        4: 25,
        5: 35,
        10: 40,
        12: 45,
        15: 50,
        17: 60,
        20: 70,
        22: 80,
        25: 90,
        27: 100,
        30: 120,
        32: 140,
        35: 160,
        37: 180,
        40: 200,
      }
    },
  
    // -------------------------------------------------
    // Level thresholds: total XP required to reach each level
    // You can extend up to as many levels as you want.
    levelThresholds: {
      1:   0,
      2: 100,
      3: 250,
      4:  450,
      5:  700,
      6: 1000,
      7: 1350,
      8: 1750,
      9: 2200,
      10: 2700,
      11: 3250,
      12: 3850,
      13: 4500,
      14: 5200,
      15: 5950,
      16: 6750,
      17: 7600,
      18: 8500,
      19: 9450,
      20: 10450,
      21: 11500,
      22: 13500,
      23: 16000,
      24: 19000,
      25: 22500,
      26: 26500,
      27: 31000,
      28: 36000,
      29: 41500,
      30: 50000,
      31: 60000,
      32: 70000,
      33: 80000,
      34: 90000,
      35: 100000,
      36: 120000,
      37: 140000,
      38: 160000,
      39: 180000,
      40: 200000,
      41: 220000,
      42: 240000,
      43: 260000,
      44: 280000,
      45: 300000,
      46: 330000,
      47: 360000,
      48: 390000,
      49: 420000,
      50: 500000,
      // … continue to level 100+ if desired.
      // If undefined, experienceService will treat as “no higher level.”
    },
  
    // -------------------------------------------------
    // HP gained per level‐up
    hpPerLevel: 1,
  
    // -------------------------------------------------
    // Attribute‐upgrade costs
    attributeCosts: {
      Vitality:      2,
      Wisdom:        2,
      Strength:      1,
      Intelligence:  1,
      Luck:          1,
      Agility:       1
    },
  
    // -------------------------------------------------
    // NFT-based boosts (kept for future use)
    nftBoosts: {
      1: { xpBoost: 0.00, coinsBoost: 0.00, maxConcurrentMissions: 1 },
      2: { xpBoost: 0.05, coinsBoost: 0.10, maxConcurrentMissions: 2 },
      3: { xpBoost: 0.10, coinsBoost: 0.15, maxConcurrentMissions: 3 },
      4: { xpBoost: 0.10, coinsBoost: 0.20, maxConcurrentMissions: 3 },
      5: { xpBoost: 0.20, coinsBoost: 0.25, maxConcurrentMissions: 3 }
    },

    // -------------------------------------------------
    // Loot‐drop configuration (for our cron job)
    lootConfig: {
      // Cron expression: run every 6 hours
      cron: '0 */6 * * *',
      // Channel where the bot posts loot
      channelId: process.env.CHANNEL_BOT_ID,
      // Faction roles to ping
      roles: [
        process.env.ROLE_RED_FACTION_ID,
        process.env.ROLE_BLUE_FACTION_ID,
        process.env.ROLE_GREEN_FACTION_ID
      ],
      // The pool of random loot events
      messages: [
        { text: '💼 A crate has been found full of XP!',      xp: 100, coins:   0 },
        { text: '🚚 A van full of money has run aground...',  xp:   0, coins: 200 },
        { text: '📦 A stash of coins was uncovered!',         xp:   0, coins: 150 },
        { text: '🎒 Someone dropped an XP bundle!',           xp:  75, coins:   0 },
        { text: '💰 A hidden treasure trove of coins!',       xp:   0, coins: 250 }
      ]
    },
    
    faction: {
      territory: {
        rows: 3,
        cols: 3,
        baseDailyPerTile: 1000,

        buildings: {
          // 💰 Génère des coins / +1 défenseur tous les 2 niveaux à partir de L2
          cash: {
            displayName: 'Cash Den',
            costBase: 5000,
            costGrowth: 2,
            coinPerLevel: 1000,
            forceAuraPerLevel: 0,
            luckAuraPerLevel: 0,
            extraDef: { startLevel: 2, every: 2 }
          },
          // 🍀 Luck / +1 défenseur tous les 2 niveaux à partir de L1
          casino: {
            displayName: 'Casino',
            costBase: 5000,
            costGrowth: 2,
            coinPerLevel: 0,
            forceAuraPerLevel: 0,
            luckAuraPerLevel: 50,
            extraDef: { startLevel: 1, every: 2 }
          },
          // 🛡️ Force / +1 défenseur chaque niveau
          armory: {
            displayName: 'Armory',
            costBase: 8000,
            costGrowth: 2,
            coinPerLevel: 0,
            forceAuraPerLevel: 75,
            luckAuraPerLevel: 0,
            extraDef: { startLevel: 1, every: 1 }
          }
        },

        fort: {
          costBase: 10000,
          costGrowth: 2.0,
          forcePerLevel: 50,
          // +1 slot défenseur tous les X niveaux de fort
          extraDefEvery: 1
        }
      },

      defense: {
        minHours: 24,
        maxHours: 72
      },
      attack: {
        durationMs: 24 * 60 * 60 * 1000,
        attackerLimitDivisor: 3
      }
    }
  
};
  